import {digest,getContract,type Env} from '../../bark-provider/src/notification.ts';

/** Fixed ciphertext-only EnvShare v2 create. Never receives the key/plaintext. */
export const ENVSHARE_MANIFEST=Object.freeze({
 executor:'cloudflare',provider:'envshare',action:'envshare.share_text',version:1,
 source_repository:'lirtual/cloudflare-actions',service:'cloudflare-actions',
 entrypoint:'ActionsEntrypoint',side_effect:'create_encrypted_text_share_at_envshare',
 input_schema:{type:'object',additionalProperties:false,
  required:['encrypted','iv','ttl','reads'],
  properties:{encrypted:{type:'string',maxLength:24000},
   iv:{type:'string',maxLength:32},ttl:{type:'integer'},reads:{type:'integer'}}},
 output_schema:{type:'object',additionalProperties:false,required:['status'],
  properties:{status:{enum:['accepted','rejected','unknown']},share_id:{type:'string'}}},
});
export type EnvshareInput={encrypted:string;iv:string;ttl:number;reads:number};
type Invocation=EnvshareInput & {invocation_id:string;deployment_id:string;contract_digest:string;input_digest:string};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX=/^[0-9a-f]{64}$/;
const B58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function decodeB58(s:string):Uint8Array|null{
 if(!s||s.length>24000||Array.from(s).some(c=>!B58.includes(c)))return null;
 let n=0n;
 for(const c of s)n=n*58n+BigInt(B58.indexOf(c));
 const out:number[]=[];
 while(n){out.unshift(Number(n%256n));n/=256n;}
 for(const c of s){if(c!=='1')break;out.unshift(0);}
 return Uint8Array.from(out);
}
export function checkedEnvshareInput(raw:unknown):EnvshareInput|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const r=raw as Record<string,unknown>;
 if(Object.keys(r).sort().join(',')!=='encrypted,iv,reads,ttl')return null;
 if(typeof r.encrypted!=='string'||r.encrypted.length<23||r.encrypted.length>24000||
    typeof r.iv!=='string'||r.iv.length>32)return null;
 const encrypted=decodeB58(r.encrypted),iv=decodeB58(r.iv);
 if(!encrypted||encrypted.length<17||encrypted.length>16400||
    !iv||iv.length!==16||
    !Number.isSafeInteger(r.ttl)||Number(r.ttl)<60||Number(r.ttl)>604800||
    !Number.isSafeInteger(r.reads)||Number(r.reads)<1||Number(r.reads)>10)return null;
 return {encrypted:r.encrypted,iv:r.iv,ttl:r.ttl as number,reads:r.reads as number};
}
export async function shareEnvshare(env:Env,input:Invocation,
 dispatch:typeof fetch=fetch){
 const rejected={status:'rejected' as const,input_digest:typeof input?.input_digest==='string'?input.input_digest:''};
 if(!UUID.test(input?.invocation_id??'')||!HEX.test(input?.input_digest??''))return rejected;
 const checked=checkedEnvshareInput({encrypted:input?.encrypted,iv:input?.iv,ttl:input?.ttl,reads:input?.reads});
 if(!checked)return rejected;
 const contract=await getContract(env,ENVSHARE_MANIFEST);
 if(input.deployment_id!==contract.deployment_id||
    input.contract_digest!==contract.contract_digest||
    input.input_digest!==await digest(checked))return rejected;
 let reply:Response;
 try{
  reply=await dispatch('https://envshare.dev/api/v1/store',{
   method:'POST',redirect:'manual',headers:{'content-type':'application/json'},
   body:JSON.stringify(checked),signal:AbortSignal.timeout(8000)});
 }catch{return {status:'unknown' as const,input_digest:input.input_digest};}
 if(reply.status===429)return rejected;
 if(reply.status>=400&&reply.status<500)return rejected;
 if(!reply.ok)return {status:'unknown' as const,input_digest:input.input_digest};
 try{
  const raw=await reply.text();
  if(new TextEncoder().encode(raw).byteLength>1024)throw Error('oversize');
  const parsed=JSON.parse(raw) as Record<string,unknown>;
  if(typeof parsed.id!=='string'||parsed.id.length>30||
     decodeB58(parsed.id)?.length!==16)return {status:'unknown' as const,input_digest:input.input_digest};
  return {status:'accepted' as const,input_digest:input.input_digest,share_id:parsed.id};
 }catch{return {status:'unknown' as const,input_digest:input.input_digest};}
}
