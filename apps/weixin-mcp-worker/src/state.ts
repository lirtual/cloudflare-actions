import { decrypt, sha256 } from './crypto.ts';
import { fail } from './types.ts';
import {acquireLease,releaseLease,readUnderLease} from './lease.ts';
import type { Env, Binding, IlinkSession } from './types.ts';

export type SendStatus = 'accepted'|'rejected'|'unknown';
export type SendReply = {
  request_id: string; status: SendStatus; duplicate: boolean;
  next_action: 'check_handset'|'check_handset_before_new_request'|'review_error';
};
export type RejectedSend={status:'rejected';upstream_ret:number|null;upstream_errcode:number|null};
export type Dispatcher=(session:IlinkSession,text:string,requestId:string)=>Promise<SendStatus|RejectedSend>;
function boundedCode(n:unknown):number|null{
 return typeof n==='number'&&Number.isSafeInteger(n)&&Math.abs(n)<=999999999?n:null;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();
// Classification only: no RPC or D1 schema changes, no sensitive content.
function sendDiagnostic(requestId:string, phase:string):void {
  try { console.warn({event:'weixin_send_diagnostic',invocation_id:requestId,phase}); }
  catch { /* Logging must not affect the durable reservation. */ }
}
function reply(request_id:string,status:SendStatus,duplicate:boolean):SendReply {
  return {request_id,status,duplicate,next_action:status==='accepted'?'check_handset':
    status==='rejected'?'review_error':'check_handset_before_new_request'};
}
export async function bindingStatus(env:Env) {
  const row=await env.DB.prepare(
    'SELECT generation,state,last_verified_context_at,last_sync_at FROM weixin_binding WHERE id=1'
  ).first<Pick<Binding,'generation'|'state'|'last_verified_context_at'|'last_sync_at'>>();
  let displayState=row?.state??'unbound';
  // A pending QR is not an active recipient: keep the previously verified
  // session active during a rebind, and never expose QR or identity data.
  if(displayState==='unbound'){
    const staged=await env.DB.prepare(
      'SELECT phase,generation,expires_at FROM weixin_pairing WHERE id=1'
    ).first<{phase:string;generation:number;expires_at:number}>();
    if(staged&&staged.generation===row?.generation &&
       staged.expires_at>Math.floor(Date.now()/1000) &&
       ['qr_pending','bound_unverified'].includes(staged.phase))
      displayState=staged.phase as Binding['state'];
  }
  return {binding_state:displayState,last_verified_context_at:row?.last_verified_context_at??null,
    last_sync_at:row?.last_sync_at??null,next_action:displayState==='ready'?null:'open_owner_pairing_page'};
}
export async function sendOnce(env:Env,text:string,requestId:string,dispatch:Dispatcher,beforeNewSend?:()=>Promise<void>,expectedGeneration?:number):Promise<SendReply>{
  if(!uuid.test(requestId??''))fail('invalid_request_id');
  if(typeof text!=='string'||!text.trim()||encoder.encode(text).byteLength>4096||
    /[\u0000-\u0008\u000B-\u001F\u007F]/.test(text))fail('invalid_text');
  const digest=await sha256(text);
  let binding=await env.DB.prepare('SELECT * FROM weixin_binding WHERE id=1').first<Binding>();
  if(expectedGeneration!==undefined&&binding?.generation!==expectedGeneration)fail('binding_generation_changed');
  if(!binding||binding.state!=='ready'||!binding.session_ciphertext||!binding.session_key_id)
    fail('binding_not_ready');
  const now=Math.floor(Date.now()/1000);
  // Read existing receipt first: a repeated request must remain queryable
  // even after new sends hit their daily rate limit.
  const existing=await env.DB.prepare(
    'SELECT text_digest,status FROM weixin_send_receipts WHERE generation=? AND request_id=?'
  ).bind(binding.generation,requestId).first<{text_digest:string;status:SendStatus}>();
  if(existing){
    if(existing.text_digest!==digest)fail('request_id_conflict');
    return reply(requestId,existing.status,true);
  }
  // Other generations' IDs must never be reused for a new recipient.
  const oldId=await env.DB.prepare('SELECT generation FROM weixin_send_receipts WHERE request_id=? LIMIT 1')
    .bind(requestId).first<{generation:number}>();
  if(oldId&&oldId.generation!==binding.generation)fail('request_id_generation_conflict');
  // Rate guard is advisory for concurrent attempts. The DB lease ensures
  // only one upstream operation on the bound account at a time.
  const recent=await env.DB.prepare(
    'SELECT count(*) AS n FROM weixin_send_receipts WHERE generation=? AND created_at>=?'
  ).bind(binding.generation,now-86400).first<{n:number}>();
  if((recent?.n??0)>=25)fail('rate_limited');
  // Existing receipts and invalid requests never poll upstream. For a fresh
  // request, refresh the verified owner's context before durable send claim.
  if(beforeNewSend){
    await beforeNewSend();
    binding=await env.DB.prepare('SELECT * FROM weixin_binding WHERE id=1').first<Binding>();
    // The verified owner can rebind while context refresh is in flight.
    // Never redirect a frozen invocation to the new generation.
    if(expectedGeneration!==undefined&&binding?.generation!==expectedGeneration)
      fail('binding_generation_changed');
    if(!binding||binding.state!=='ready'||!binding.session_ciphertext||!binding.session_key_id)
      fail('binding_not_ready');
  }
  // A successful trusted sync is sufficient for an unattended notification.
  // No arbitrary local Owner-message age cutoff; the verified, encrypted
  // Owner binding and current-generation lease still fence the send.
  const lease=await acquireLease(env,binding.generation,['ready']);
  try {
  // Durable, atomic claim BEFORE sending. This insert reads the current
  // binding generation in the same SQL statement (never a SELECT+INSERT pair).
  const claim=await env.DB.prepare(
    'INSERT OR IGNORE INTO weixin_send_receipts(generation,request_id,text_digest,status,created_at,updated_at) '+
    "SELECT generation,?,?, 'unknown',?,? FROM weixin_binding "+
    "WHERE id=1 AND generation=? AND state='ready' AND lease_holder=? AND session_ciphertext IS NOT NULL"
  ).bind(requestId,digest,now,now,binding.generation,lease.owner).run();
  if(claim.meta.changes!==1){
    const previous=await env.DB.prepare(
      'SELECT text_digest,status FROM weixin_send_receipts WHERE generation=? AND request_id=?'
    ).bind(binding.generation,requestId).first<{text_digest:string;status:SendStatus}>();
    if(!previous)fail('binding_changed');
    if(previous.text_digest!==digest)fail('request_id_conflict');
    return reply(requestId,previous.status,true);
  }
  // Never decrypt credentials until the durable send reservation exists.
  // Recheck generation immediately before transport; management rebind MUST
  // also implement a cross-request fence before this becomes production-ready.
  let phase:'pre_dispatch'|'dispatch'|'receipt_update'='pre_dispatch';
  try{
    const current=await readUnderLease(env,lease);
    if(current.state!=='ready'||current.session_ciphertext!==binding.session_ciphertext){
      sendDiagnostic(requestId,'pre_dispatch_fence');
      return reply(requestId,'unknown',false);
    }
    const session=await decrypt<IlinkSession>(env,'weixin:owner:binding:'+current.generation,
      current.session_ciphertext!,current.session_key_id!);
    if(!session.botToken||!session.ownerId||!session.contextToken||!session.botId){
      sendDiagnostic(requestId,'pre_dispatch_binding_invalid');
      return reply(requestId,'unknown',false);
    }
    // The provider write timeout is 12s, safely inside the 120s DB lease.
    // Never dispatch with a lease already near expiration.
    if(Date.now()+20000>=lease.expiresAt*1000){
      sendDiagnostic(requestId,'pre_dispatch_lease_expiring');
      return reply(requestId,'unknown',false);
    }
    phase='dispatch';
    const dispatched=await dispatch(session,text,requestId);
    const result=typeof dispatched==='string'?dispatched:dispatched.status;
    // Adapter ambiguity can never become a definite acknowledgement.
    if(result!=='accepted'&&result!=='rejected'&&result!=='unknown'){
      sendDiagnostic(requestId,'dispatch_result_invalid');
      return reply(requestId,'unknown',false);
    }
    if(result==='unknown')sendDiagnostic(requestId,'dispatch_unknown');
    const rejected=typeof dispatched==='object'&&dispatched?.status==='rejected'?dispatched:null;
    phase='receipt_update';
    // Store only bounded numbers from definitive business rejections.
    // No token, message, errmsg or unreviewed upstream payload is persisted.
    if(result!=='unknown'){
      const updated=await env.DB.prepare(
        'UPDATE weixin_send_receipts SET status=?,updated_at=?,upstream_ret=?,upstream_errcode=? '+
        "WHERE generation=? AND request_id=? AND status='unknown' "+
        "AND EXISTS(SELECT 1 FROM weixin_binding WHERE id=1 AND generation=? AND lease_holder=? AND lease_until>?)"
      ).bind(result,Math.floor(Date.now()/1000),
        result==='rejected'?boundedCode(rejected?.upstream_ret):null,
        result==='rejected'?boundedCode(rejected?.upstream_errcode):null,
        binding.generation,requestId,binding.generation,lease.owner,Math.floor(Date.now()/1000)).run();
      if(updated.meta.changes!==1){
        sendDiagnostic(requestId,'receipt_update_unconfirmed');
        return reply(requestId,'unknown',false);
      }
    }
    return reply(requestId,result,false);
  }catch{
    // Once reserved, all unexpected errors are uncertain, never retry.
    sendDiagnostic(requestId,phase==='receipt_update'?'receipt_update_exception':
      phase==='dispatch'?'dispatch_exception':'pre_dispatch_exception');
    return reply(requestId,'unknown',false);
  }
  } finally {
    // A release failure must not overwrite a persisted acknowledgement after
    // an external write. The bounded lease will eventually expire safely.
    await releaseLease(env,lease).catch(()=>{});
  }
}

/** Read-only historic receipt: neither recipient binding nor upstream is touched. */
export async function readStoredReceipt(env:Env,requestId:string){
  if(!uuid.test(requestId??''))fail('invalid_request_id');
  return env.DB.prepare(
    'SELECT generation,text_digest,status FROM weixin_send_receipts WHERE request_id=? LIMIT 1'
  ).bind(requestId).first<{generation:number;text_digest:string;status:SendStatus}>();
}
