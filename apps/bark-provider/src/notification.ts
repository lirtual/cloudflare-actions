/** Static Bark contract, mirrored exactly by the Workflow's reviewed catalog. */
export const ACTION_MANIFEST=Object.freeze({
 executor:'cloudflare',provider:'bark',action:'bark.send_notification',version:1,
 source_repository:'lirtual/cloudflare-actions',service:'bark-provider',
 entrypoint:'BarkActionProvider',side_effect:'send_to_configured_owner_only',
 input_schema:{type:'object',additionalProperties:false,required:['body'],
  properties:{body:{type:'string'},title:{type:'string'},subtitle:{type:'string'},
  markdown:{type:'string'},group:{type:'string'},level:{type:'string'},sound:{type:'string'},
  volume:{type:'integer'},call:{type:'boolean'},copy:{type:'string'},autoCopy:{type:'boolean'},
  icon:{type:'string'},image:{type:'string'},url:{type:'string'},action:{type:'string'},
  isArchive:{type:'boolean'},ttl:{type:'integer'},badge:{type:'integer'},id:{type:'string'}}},
 output_schema:{type:'object',additionalProperties:false,required:['status'],
  properties:{status:{enum:['accepted','rejected','unknown']}}},
});
export type Env={BARK_DEVICE_KEY:string;BARK_ENCRYPTION_KEY:string;CF_VERSION_METADATA?:{id:string}};
export type Invocation={invocation_id:string;deployment_id:string;contract_digest:string;
 input_digest:string;notification:Record<string,unknown>};
export class BarkError extends Error{code:string;constructor(code:string){super(code);this.code=code;}}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hex64=/^[a-f0-9]{64}$/;
const encoder=new TextEncoder();
const bytes=(s:string)=>encoder.encode(s).byteLength;
function canonical(v:unknown):unknown{
 if(Array.isArray(v))return v.map(canonical);
 if(v&&typeof v==='object')return Object.fromEntries(
  Object.entries(v).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,x])=>[k,canonical(x)]));
 return v;
}
export async function digest(v:unknown){
 const hash=await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(canonical(v))));
 return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function getContract(env:Env){
 if(!uuid.test(env.CF_VERSION_METADATA?.id??''))throw new BarkError('deployment_not_configured');
 return {deployment_id:env.CF_VERSION_METADATA!.id,contract_digest:await digest(ACTION_MANIFEST)};
}
const strings:Record<string,number>={body:2400,title:150,subtitle:150,markdown:2400,
 group:100,sound:100,copy:500,icon:512,image:512,url:512,id:64,level:20,action:20};
const booleans=new Set(['call','autoCopy','isArchive']);
const bounds:Record<string,[number,number]>={volume:[0,10],ttl:[1,2592000],badge:[1,9999]};
function secureHttps(v:string){
 try{const u=new URL(v);return u.protocol==='https:'&&!!u.hostname&&!u.username&&
  !u.password&&!u.hash&&!u.port&&v.trim()===v&&!/[\u0000-\u001f\u007f]/.test(v);}
 catch{return false;}
}
export function validateNotification(source:unknown):Record<string,unknown>{
 if(!source||typeof source!=='object'||Array.isArray(source))throw new BarkError('invalid_notification');
 const input=source as Record<string,unknown>;
 if(typeof input.body!=='string')throw new BarkError('invalid_notification');
 const result:Record<string,unknown>={};
 for(const [name,v] of Object.entries(input)){
  if(Object.hasOwn(strings,name)){
   if(typeof v!=='string'||bytes(v)>strings[name]||v.includes('\0'))
    throw new BarkError('invalid_notification');
   if(['url','icon','image'].includes(name)&&!secureHttps(v))throw new BarkError('invalid_https_url');
   if(name==='level'&&!['active','timeSensitive','passive','critical'].includes(v))
    throw new BarkError('invalid_level');
   if(name==='action'&&!['alert','none'].includes(v))throw new BarkError('invalid_action');
   if(name==='id'&&!/^[A-Za-z0-9_-]{1,64}$/.test(v))throw new BarkError('invalid_update_id');
  }else if(booleans.has(name)){
   if(typeof v!=='boolean')throw new BarkError('invalid_notification');
  }else if(Object.hasOwn(bounds,name)){
   const [min,max]=bounds[name];
   if(!Number.isSafeInteger(v)||Number(v)<min||Number(v)>max)
    throw new BarkError('invalid_notification');
  }else throw new BarkError('unsupported_notification_field');
  result[name]=v;
 }
 if(!result.body&&!result.markdown)throw new BarkError('empty_notification');
 if(result.volume!==undefined&&result.level!=='critical')throw new BarkError('invalid_volume_combination');
 if(bytes(JSON.stringify(result))>2900)throw new BarkError('notification_too_large');
 return result;
}
function base64(value:ArrayBuffer){
 let s='';for(const b of new Uint8Array(value))s+=String.fromCharCode(b);
 return btoa(s);
}
export async function encryptedRequest(env:Env,input:Record<string,unknown>){
 if(!/^[A-Za-z0-9]{12,128}$/.test(env.BARK_DEVICE_KEY??''))
  throw new BarkError('device_not_configured');
 if(typeof env.BARK_ENCRYPTION_KEY!=='string'||bytes(env.BARK_ENCRYPTION_KEY)!==32||
   !/^[\x20-\x7e]{32}$/.test(env.BARK_ENCRYPTION_KEY))
  throw new BarkError('encryption_not_configured');
 const payload=validateNotification(input);
 const key=await crypto.subtle.importKey('raw',encoder.encode(env.BARK_ENCRYPTION_KEY),
  {name:'AES-GCM'},false,['encrypt']);
 // Bark CryptoSwift uses the *UTF-8 bytes* of the visible 12-char IV.
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
 let iv='';
 while(iv.length<12){
  for(const b of crypto.getRandomValues(new Uint8Array(16))){
   if(b<248)iv+=alphabet[b%62]; // 248 is divisible by 62: unbiased random ASCII.
   if(iv.length===12)break;
  }
 }
 const ciphertext=base64(await crypto.subtle.encrypt({name:'AES-GCM',
  iv:encoder.encode(iv),tagLength:128},key,encoder.encode(JSON.stringify(payload))));
 const outer={device_key:env.BARK_DEVICE_KEY,ciphertext,iv,
  ...(payload.id===undefined?{}:{id:payload.id})};
 const body=JSON.stringify(outer);
 if(bytes(body)>4000)throw new BarkError('encrypted_request_too_large');
 return body;
}
export async function sendNotification(env:Env,input:Invocation,dispatch:typeof fetch=fetch){
 let body:string;
 try{
  if(!uuid.test(input?.invocation_id??'')||!hex64.test(input?.input_digest??''))
   throw new BarkError('invalid_invocation');
  const contract=await getContract(env);
  if(input.deployment_id!==contract.deployment_id||input.contract_digest!==contract.contract_digest)
   throw new BarkError('contract_mismatch');
  const notification=validateNotification(input.notification);
  if(await digest(notification)!==input.input_digest)throw new BarkError('input_digest_mismatch');
  body=await encryptedRequest(env,notification);
 }catch(error){
  if(error instanceof BarkError)return {status:'rejected' as const,
   input_digest:typeof input?.input_digest==='string'?input.input_digest:''};
  throw error;
 }
 let response:Response;
 try{response=await dispatch('https://api.day.app/push',{method:'POST',redirect:'manual',
  headers:{'content-type':'application/json; charset=utf-8'},body,
  signal:AbortSignal.timeout(8000)});}
 catch{return {status:'unknown' as const,input_digest:input.input_digest};}
 if(response.status>=300&&response.status<400)return {status:'unknown' as const,input_digest:input.input_digest};
 if(response.status>=400&&response.status<500)return {status:'rejected' as const,input_digest:input.input_digest};
 if(!response.ok)return {status:'unknown' as const,input_digest:input.input_digest};
 let result:unknown;
 try{const text=await response.text();
  if(bytes(text)>2048)return {status:'unknown' as const,input_digest:input.input_digest};
  result=JSON.parse(text);}
 catch{return {status:'unknown' as const,input_digest:input.input_digest};}
 const code=(result as {code?:unknown})?.code;
 return {status:code===200?'accepted' as const:
  typeof code==='number'&&code>=400&&code<500?'rejected' as const:'unknown' as const,
  input_digest:input.input_digest};
}
