import {sha256,decrypt} from "./crypto.ts";
import {readStoredReceipt,sendOnce,type Dispatcher,type SendStatus,type RejectedSend} from "./state.ts";
import {WeixinError,type Env,type IlinkSession} from "./types.ts";
import {syncCursorOnce} from "./lease.ts";
// @ts-ignore local JS protocol is exercised by existing compatibility tests.
import {createIlinkClient} from "../poc/protocol.mjs";

// Must match the reviewed Workflow catalog exactly; no dynamic registry or arbitrary target.
export const ACTION_MANIFEST = Object.freeze({
 executor:'cloudflare',provider:'weixin',action:'weixin.send_text',version:1,
 source_repository:'lirtual/cloudflare-actions',service:'weixin-mcp-worker',
 entrypoint:'WeixinActionProvider',
 side_effect:'send_to_verified_owner_only',
 input_schema:{type:'object',additionalProperties:false,
  required:['session_step_id'],properties:{session_step_id:{type:'string',
   description:'A dependency on a signed, physically verified OpenList Session in this Run'}}},
 output_schema:{type:'object',additionalProperties:false,
  required:['status'],properties:{status:{enum:['accepted','rejected','unknown']}}},
});
function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(
  Object.entries(value).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>[k,canonical(v)]));
 return value;
}
export async function providerIdentity(env:Env,manifest:unknown=ACTION_MANIFEST){
 const deployment_id=env.CF_VERSION_METADATA?.id;
 if(typeof deployment_id!=='string'||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deployment_id))
  invalid('provider_deployment_unavailable');
 const bytes=new TextEncoder().encode(JSON.stringify(canonical(manifest)));
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
 const contract_digest=Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('');
 return {deployment_id,contract_digest};
}
export type TextInvocation = {invocation_id:string;binding_generation:number;session_url:string;
 deployment_id:string;contract_digest:string};
export type ReceiptQuery = {invocation_id:string;binding_generation:number;input_digest:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digestRe=/^[a-f0-9]{64}$/;
const invalid=(code:string):never=>{throw new WeixinError(code);};
function validateIdentity(id:string,generation:number){
 if(typeof id!=="string"||!uuid.test(id))invalid("invalid_invocation_id");
 if(!Number.isSafeInteger(generation)||generation<1)invalid("invalid_binding_generation");
}
/** Not a generic text relay. The only input is a constrained Session URL. */
export function readyMessage(urlString:string):string{
 // Match Workflow's canonicalized single-label Quick Tunnel root contract.
 if(typeof urlString!=="string"||urlString.length>180||
    !/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com\/$/.test(urlString))
   invalid("invalid_trusted_url");
 let url:URL;try{url=new URL(urlString);}catch{return invalid("invalid_trusted_url");}
 // Match the reviewed Workflow contract: one canonical HTTPS Quick Tunnel root.
 // Provider must reject paths even when invoked without the Workflow compiler.
 if(url.protocol!=="https:"||!url.hostname.endsWith(".trycloudflare.com")||
    url.hostname==="trycloudflare.com"||url.pathname!=="/"||
    url.username||url.password||url.port||url.hash||url.search||
    url.href!==urlString)invalid("invalid_trusted_url");
 const body="OpenList Session Ready\n"+url.href;
 if(new TextEncoder().encode(body).byteLength>4096)invalid("invalid_text");
 return body;
}
/** Pure read-only readiness proof; verifies the inherited production Secret
 * decrypts the existing owner session without exposing any credential. */
export async function bindingIdentity(env:Env):Promise<{generation:number;ready:boolean}>{
 const binding=await env.DB.prepare(
  "SELECT generation,state,session_ciphertext,session_key_id FROM weixin_binding WHERE id=1"
 ).first<{generation:number;state:string;session_ciphertext:string|null;session_key_id:string|null}>();
 if(binding?.state!=="ready")return {generation:binding?.generation??0,ready:false};
 if(!Number.isSafeInteger(binding.generation)||binding.generation<1||
    !binding.session_ciphertext||!binding.session_key_id)
  invalid("weixin_binding_unreadable");
 try{
  const session=await decrypt<IlinkSession>(env,"weixin:owner:binding:"+binding.generation,
    binding.session_ciphertext!,binding.session_key_id!);
  if(typeof session.botToken!=="string"||!session.botToken||
     typeof session.ownerId!=="string"||!session.ownerId||
     typeof session.contextToken!=="string"||!session.contextToken)
    invalid("weixin_binding_unreadable");
 }catch{invalid("weixin_binding_unreadable");}
 return {generation:binding.generation,ready:true};
}
/** Pure read of historical receipt even after unbind/rebind. Missing != not sent. */
export async function readActionReceipt(env:Env,query:ReceiptQuery){
 validateIdentity(query?.invocation_id,query?.binding_generation);
 if(typeof query?.input_digest!=="string"||!digestRe.test(query.input_digest))invalid("invalid_input_digest");
 const row=await readStoredReceipt(env,query.invocation_id);
 if(!row)return {status:"missing" as const};
 if(row.generation!==query.binding_generation||row.text_digest!==query.input_digest)
  invalid("invocation_identity_conflict");
 return {status:row.status};
}
async function upstreamSend(session:IlinkSession,body:string,requestId:string):Promise<SendStatus|RejectedSend>{
 try{const api=createIlinkClient();const result=await api.sendText({botToken:session.botToken,
   recipientId:session.ownerId,contextToken:session.contextToken,requestId,text:body});
  return result.status==="accepted"?"accepted":"unknown";
 }catch(err){
  if((err as {code?:string})?.code!=="UPSTREAM_REJECTED")return "unknown";
  // Protocol exposes bounded numeric diagnostic fields, not errmsg or raw body.
  const diagnostic=(err as {diagnostic?:{ret?:unknown;errcode?:unknown}}).diagnostic;
  const bounded=(n:unknown):number|null=>
    typeof n==="number"&&Number.isSafeInteger(n)&&Math.abs(n)<=999999999?n:null;
  return {status:"rejected",upstream_ret:bounded(diagnostic?.ret),
    upstream_errcode:bounded(diagnostic?.errcode)};
 }
}
/** Send through the existing durable D1 reservation. Never auto-retry unknown. */
export async function sendTextAction(env:Env,input:TextInvocation,dispatch:Dispatcher=upstreamSend,
  synchronize:()=>Promise<void>=()=>syncCursorOnce(env,session=>
    createIlinkClient().getUpdates(session.botToken,session.cursor)).then(()=>{}),
  manifest:unknown=ACTION_MANIFEST){
 validateIdentity(input?.invocation_id,input?.binding_generation);
 const identity=await providerIdentity(env,manifest);
 if(input.deployment_id!==identity.deployment_id)invalid('deployment_identity_mismatch');
 if(input.contract_digest!==identity.contract_digest)invalid('contract_identity_mismatch');
 const body=readyMessage(input.session_url),input_digest=await sha256(body);
 const prior=await readStoredReceipt(env,input.invocation_id);
 if(prior){
  if(prior.generation!==input.binding_generation||prior.text_digest!==input_digest)
   invalid("invocation_identity_conflict");
  return {status:prior.status,duplicate:true,input_digest};
 }
 const result=await sendOnce(env,body,input.invocation_id,dispatch,synchronize,input.binding_generation);
 return {status:result.status,duplicate:result.duplicate,input_digest};
}
