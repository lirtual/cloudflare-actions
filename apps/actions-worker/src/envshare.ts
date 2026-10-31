import {digest,getContract,type Env} from '../../bark-provider/src/notification.ts';

// The Worker never receives plaintext or the decryption key. Workflow encrypts
// before D1 admission and sends only the bounded EnvShare v2 wire payload.
export const ENVSHARE_MANIFEST=Object.freeze({
 executor:'cloudflare',provider:'envshare',action:'envshare.share_text',version:1,
 source_repository:'lirtual/cloudflare-actions',service:'cloudflare-actions',
 entrypoint:'ActionsEntrypoint',side_effect:'store_encrypted_text_at_envshare',
 input_schema:{type:'object',additionalProperties:false,
  required:['encrypted','iv','ttl','reads'],properties:{
   encrypted:{type:'string',maxLength:30000},iv:{type:'string',maxLength:32},
   ttl:{type:'integer'},reads:{type:'integer'}}},
 output_schema:{type:'object',additionalProperties:false,
  required:['status'],properties:{status:{enum:['accepted','rejected','unknown']},share_id:{type:'string'}}},
});
type Invocation={invocation_id:string;deployment_id:string;contract_digest:string;input_digest:string;
 encrypted:string;iv:string;ttl:number;reads:number};
const BASE58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const HEX=/^[a-f0-9]{64}$/;
function decodedBytes(s:string):number{
 if(!s||s.length>30000||/[^\x00-\x7f]/.test(s))return -1;
 let n=0n;
 for(const c of s){const d=BASE58.indexOf(c);if(d<0)return -1;n=n*58n+BigInt(d);}
 let bytes=0;while(n){n>>=8n;bytes++;}
 for(const c of s){if(c!=='1')break;bytes++;}
 return bytes;
}
export function checkEnvsharePayload(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const r=raw as Record<string,unknown>;
 if(Object.keys(r).sort().join(',')!=='encrypted,iv,reads,ttl' ||
   typeof r.encrypted!=='string'||typeof r.iv!=='string'||
   !Number.isSafeInteger(r.ttl)||!Number.isSafeInteger(r.reads)||
   Number(r.ttl)<60||Number(r.ttl)>604800||Number(r.reads)<1||Number(r.reads)>10||
   r.encrypted.length>30000||decodedBytes(r.encrypted)<17||
   decodedBytes(r.encrypted)>16384+16||decodedBytes(r.iv)!==16)return null;
 return {encrypted:r.encrypted,iv:r.iv,ttl:r.ttl as number,reads:r.reads as number};
}
export function checkEnvshareId(id:unknown):id is string{
 return typeof id==='string'&&id.length>=16&&id.length<=32&&decodedBytes(id)===16;
}
export async function shareEnvshare(env:Env,invocation:Invocation,send:typeof fetch=fetch){
 const fallback={status:'rejected' as const,input_digest:typeof invocation?.input_digest==='string'?invocation.input_digest:''};
 if(!UUID.test(invocation?.invocation_id??'')||!HEX.test(invocation?.input_digest??''))return fallback;
 const data=checkEnvsharePayload({encrypted:invocation.encrypted,iv:invocation.iv,ttl:invocation.ttl,reads:invocation.reads});
 if(!data)return fallback;
 const contract=await getContract(env,ENVSHARE_MANIFEST);
 if(invocation.deployment_id!==contract.deployment_id||
    invocation.contract_digest!==contract.contract_digest||
    invocation.input_digest!==await digest(data))return fallback;
 let response:Response;
 try{response=await send('https://envshare.dev/api/v1/store',{
   method:'POST',redirect:'manual',headers:{'content-type':'application/json'},
   body:JSON.stringify(data),signal:AbortSignal.timeout(8000)
 });}catch{return {status:'unknown' as const,input_digest:invocation.input_digest};}
 if(response.status>=300&&response.status<400)
  return {status:'unknown' as const,input_digest:invocation.input_digest};
 if(response.status>=400&&response.status<500)return fallback;
 if(!response.ok)return {status:'unknown' as const,input_digest:invocation.input_digest};
 try{
  const raw=await response.text();
  if(new TextEncoder().encode(raw).byteLength>512)throw Error('response_too_large');
  const result=JSON.parse(raw) as Record<string,unknown>;
  if(!checkEnvshareId(result?.id))throw Error('invalid_response_id');
  return {status:'accepted' as const,input_digest:invocation.input_digest,share_id:result.id};
 }catch{return {status:'unknown' as const,input_digest:invocation.input_digest};}
}
