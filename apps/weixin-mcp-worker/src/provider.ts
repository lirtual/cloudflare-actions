import {sha256} from "./crypto.ts";
import {readStoredReceipt,sendOnce,type Dispatcher,type SendStatus} from "./state.ts";
import {WeixinError,type Env,type IlinkSession} from "./types.ts";
import {syncCursorOnce} from "./lease.ts";
// @ts-ignore local JS protocol is exercised by existing compatibility tests.
import {createIlinkClient} from "../poc/protocol.mjs";

export const WEIXIN_ACTION_CONTRACT = Object.freeze({
 provider:"weixin",executor:"cloudflare",id:"weixin.send_text",version:1,
 side_effect:"send_to_verified_owner_only",max_text_bytes:4096,
});
export type TextInvocation = {invocation_id:string;binding_generation:number;session_url:string};
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
 if(typeof urlString!=="string"||urlString.length>2048)invalid("invalid_trusted_url");
 let url:URL;try{url=new URL(urlString);}catch{return invalid("invalid_trusted_url");}
 if(url.protocol!=="https:"||!url.hostname.endsWith(".trycloudflare.com")||
    url.hostname==="trycloudflare.com"||url.username||url.password||url.port||url.hash||url.search||
    url.href!==urlString)invalid("invalid_trusted_url");
 const body="OpenList Session Ready\n"+url.href;
 if(new TextEncoder().encode(body).byteLength>4096)invalid("invalid_text");
 return body;
}
export async function bindingIdentity(env:Env):Promise<{generation:number;ready:boolean}>{
 const binding=await env.DB.prepare(
  "SELECT generation,state FROM weixin_binding WHERE id=1"
 ).first<{generation:number;state:string}>();
 return {generation:binding?.generation??0,ready:binding?.state==="ready"};
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
async function upstreamSend(session:IlinkSession,body:string,requestId:string):Promise<SendStatus>{
 try{const api=createIlinkClient();const result=await api.sendText({botToken:session.botToken,
   recipientId:session.ownerId,contextToken:session.contextToken,requestId,text:body});
  return result.status==="accepted"?"accepted":"unknown";
 }catch(err){return (err as {code?:string})?.code==="UPSTREAM_REJECTED"?"rejected":"unknown";}
}
/** Send through the existing durable D1 reservation. Never auto-retry unknown. */
export async function sendTextAction(env:Env,input:TextInvocation,dispatch:Dispatcher=upstreamSend,
  synchronize:()=>Promise<void>=()=>syncCursorOnce(env,session=>
    createIlinkClient().getUpdates(session.botToken,session.cursor)).then(()=>{})){
 validateIdentity(input?.invocation_id,input?.binding_generation);
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
