import {digest,getContract,type Env} from '../../bark-provider/src/notification.ts';

/** One fixed anonymous multipart POST. Binary bytes never enter a durable Plan. */
export const LITTERBOX_MANIFEST=Object.freeze({
 executor:'cloudflare',provider:'litterbox',action:'litterbox.upload_file',version:1,
 source_repository:'lirtual/cloudflare-actions',service:'cloudflare-actions',
 entrypoint:'ActionsEntrypoint',side_effect:'upload_plaintext_file_to_public_litterbox',
 input_schema:{type:'object',additionalProperties:false,
  required:['file_name','size_bytes','sha256','time'],
  properties:{file_name:{type:'string',maxLength:160},size_bytes:{type:'integer',minimum:1,maximum:10485760},
   sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},time:{enum:['1h','12h','24h','72h']}}},
 output_schema:{type:'object',additionalProperties:false,required:['status'],
  properties:{status:{enum:['accepted','rejected','unknown']},download_url:{type:'string'}}},
});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX=/^[a-f0-9]{64}$/;
export const MAX_FILE_BYTES=10*1024*1024;
export const FIXED_UPLOAD_URL='https://litterbox.catbox.moe/resources/internals/api.php';
export type LitterboxParams={file_name:string;size_bytes:number;sha256:string;time:'1h'|'12h'|'24h'|'72h'};
export type LitterboxInvocation=LitterboxParams & {invocation_id:string;deployment_id:string;
 contract_digest:string;input_digest:string;bytes:Uint8Array};

export function checkLitterboxParams(value:unknown):LitterboxParams|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const v=value as Record<string,unknown>;
 if(Object.keys(v).sort().join(',')!=='file_name,sha256,size_bytes,time'||
   typeof v.file_name!=='string'||v.file_name.length===0||v.file_name.length>160||
   /[\/\\\u0000-\u001f\u007f]/u.test(v.file_name)||v.file_name.trim()!==v.file_name||
   v.file_name==='.'||v.file_name==='..'||v.file_name.startsWith('.')||
   typeof v.sha256!=='string'||!HEX.test(v.sha256)||
   !Number.isSafeInteger(v.size_bytes)||Number(v.size_bytes)<1||
   Number(v.size_bytes)>MAX_FILE_BYTES||
   !['1h','12h','24h','72h'].includes(String(v.time)))return null;
 return v as LitterboxParams;
}
export function checkLitterboxDownloadUrl(value:unknown):value is string{
 if(typeof value!=='string'||value.length<27||value.length>512||
   /[\u0000-\u0020\u007f]/.test(value))return false;
 try{
  const u=new URL(value);
  return u.protocol==='https:'&&['litterbox.catbox.moe','litter.catbox.moe'].includes(u.hostname)&&
   !u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&
   /^\/[A-Za-z0-9._%/-]+$/.test(u.pathname)&&u.pathname!=='/'&&u.href===value;
 }catch{return false;}
}
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export async function uploadLitterbox(env:Env,input:LitterboxInvocation,dispatch:typeof fetch=fetch){
 const fallback={status:'rejected' as const,input_digest:typeof input?.input_digest==='string'?input.input_digest:''};
 if(!UUID.test(input?.invocation_id??'')||!HEX.test(input?.input_digest??''))return fallback;
 const params=checkLitterboxParams({
  file_name:input.file_name,size_bytes:input.size_bytes,sha256:input.sha256,time:input.time,
 });
 if(!params||!(input.bytes instanceof Uint8Array)||input.bytes.byteLength!==params.size_bytes||
   input.bytes.byteLength>MAX_FILE_BYTES)return fallback;
 const identity=await getContract(env,LITTERBOX_MANIFEST);
 if(input.deployment_id!==identity.deployment_id||
   input.contract_digest!==identity.contract_digest||
   input.input_digest!==await digest(params)||
   params.sha256!==hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(input.bytes)))))
  return fallback;
 const form=new FormData();
 form.append('reqtype','fileupload');
 form.append('time',params.time);
 form.append('fileToUpload',new Blob([new Uint8Array(input.bytes)]),params.file_name);
 let response:Response;
 try{
  response=await dispatch(FIXED_UPLOAD_URL,{
   method:'POST',redirect:'manual',body:form,signal:AbortSignal.timeout(15000),
  });
 }catch{return {status:'unknown' as const,input_digest:input.input_digest};}
 if(response.status>=300&&response.status<400)return {status:'unknown' as const,input_digest:input.input_digest};
 if(response.status>=400&&response.status<500)return fallback;
 if(!response.ok)return {status:'unknown' as const,input_digest:input.input_digest};
 try{
  if(Number(response.headers.get('content-length')||0)>512)return {status:'unknown' as const,input_digest:input.input_digest};
  if(!response.body)return {status:'unknown' as const,input_digest:input.input_digest};
  const reader=response.body.getReader();
  let length=0;const chunks:Uint8Array[]=[];
  try{
   while(true){
    const {done,value}=await reader.read();
    if(done)break;
    length+=value.byteLength;
    if(length>512){await reader.cancel();return {status:'unknown' as const,input_digest:input.input_digest};}
    chunks.push(value);
   }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);
  let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes).trim();
  if(!checkLitterboxDownloadUrl(raw))
   return {status:'unknown' as const,input_digest:input.input_digest};
  return {status:'accepted' as const,input_digest:input.input_digest,download_url:raw};
 }catch{return {status:'unknown' as const,input_digest:input.input_digest};}
}
