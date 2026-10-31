import {digest,getContract,type Env} from '../../bark-provider/src/notification.ts';

/** One anonymous third-party create; no token, custom destination or follow-up GET. */
export const DUB_MANIFEST=Object.freeze({
 executor:'cloudflare',provider:'dub',action:'dub.shorten_url',version:1,
 source_repository:'lirtual/cloudflare-actions',service:'cloudflare-actions',
 entrypoint:'ActionsEntrypoint',side_effect:'create_public_short_link_at_dub',
 input_schema:{type:'object',additionalProperties:false,required:['url'],
  properties:{url:{type:'string',maxLength:2048},public_stats:{type:'boolean'}}},
 output_schema:{type:'object',additionalProperties:false,required:['status'],
  properties:{status:{enum:['accepted','rejected','unknown']},short_link:{type:'string'}}},
});
type Invocation={invocation_id:string;deployment_id:string;contract_digest:string;
 input_digest:string;url:string;public_stats?:boolean};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX=/^[a-f0-9]{64}$/;
const KEY=/^[A-Za-z0-9_-]{3,64}$/;
export function validateDubUrl(value:unknown):value is string{
 if(typeof value!=='string'||value.length>2048||value.length<10||
  /[\u0000-\u0020\u007f]/.test(value))return false;
 try{const u=new URL(value);return (u.protocol==='https:'||u.protocol==='http:')&&
  !!u.hostname&&!u.username&&!u.password&&!u.hash&&!u.port&&
  u.origin!=='null'&&(u.href===value||u.href===value+'/');}
 catch{return false;}
}
export function validateDubInput(input:unknown):{url:string;public_stats:boolean}|null{
 if(!input||typeof input!=='object'||Array.isArray(input))return null;
 const v=input as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['url','public_stats'].includes(k))||
   !validateDubUrl(v.url)||
   (v.public_stats!==undefined&&typeof v.public_stats!=='boolean'))return null;
 return {url:v.url,public_stats:v.public_stats===true};
}
/** Provider repeats exact pin, digest, and URL checks before the only POST. */
export async function shortenDub(env:Env,input:Invocation,
 dispatch:typeof fetch=fetch){
 const fallback={status:'rejected' as const,input_digest:typeof input?.input_digest==='string'?input.input_digest:''};
 if(!UUID.test(input?.invocation_id??'')||!HEX.test(input?.input_digest??''))return fallback;
 const checked=validateDubInput({url:input?.url,public_stats:input?.public_stats});
 if(!checked)return fallback;
 const contract=await getContract(env,DUB_MANIFEST);
 if(input.deployment_id!==contract.deployment_id||input.contract_digest!==contract.contract_digest||
  input.input_digest!==await digest(checked))return fallback;
 let response:Response;
 try{
  response=await dispatch('https://dub.co/api/links',{method:'POST',redirect:'manual',
   headers:{'content-type':'application/json','dub-anonymous-link-creation':'1'},
   body:JSON.stringify({url:checked.url,domain:'dub.sh',publicStats:checked.public_stats}),
   signal:AbortSignal.timeout(8000)});
 }catch{return {status:'unknown' as const,input_digest:input.input_digest};}
 if(response.status>=300&&response.status<400)return {status:'unknown' as const,input_digest:input.input_digest};
 if(response.status>=400&&response.status<500)return fallback;
 if(!response.ok)return {status:'unknown' as const,input_digest:input.input_digest};
 try{
  const raw=await response.text();
  if(new TextEncoder().encode(raw).byteLength>4096)throw Error('dub_response_too_large');
  const v=JSON.parse(raw) as Record<string,unknown>;
  if(v.domain!=='dub.sh'||typeof v.key!=='string'||!KEY.test(v.key)||
   (typeof v.url!=='string'||!validateDubUrl(v.url)||
   new URL(v.url).href!==new URL(checked.url).href)||v.publicStats!==checked.public_stats||
   v.shortLink!=='https://dub.sh/'+v.key)throw Error('dub_response_unconfirmed');
  return {status:'accepted' as const,input_digest:input.input_digest,short_link:v.shortLink};
 }catch{return {status:'unknown' as const,input_digest:input.input_digest};}
}
