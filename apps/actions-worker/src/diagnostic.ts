import {digest,getContract,type Env} from './bark.ts';

/** Deliberately effect-free public Action for the real Provider/Consumer JSON path. */
export const DIAGNOSTIC_MANIFEST=Object.freeze({
 executor:'cloudflare',provider:'diagnostic',action:'diagnostic.ping',version:1,
 source_repository:'lirtual/cloudflare-actions',service:'cloudflare-actions',
 entrypoint:'ActionsEntrypoint',side_effect:'none',
 input_schema:{type:'object',additionalProperties:false,required:[],properties:{}},
 output_schema:{type:'object',additionalProperties:false,required:['status'],
  properties:{status:{enum:['accepted','rejected','unknown']}}},
});
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const HEX64=/^[0-9a-f]{64}$/;
const FIELDS=new Set(['invocation_id','deployment_id','contract_digest','input_digest']);

/** No network, external effects, D1, files, secrets, or user-supplied payloads. */
export async function pingDiagnostic(env:Env,invocation:unknown){
 const input=(invocation&&typeof invocation==='object'&&!Array.isArray(invocation))
  ?invocation as Record<string,unknown>:null;
 const inputDigest=input?.input_digest;
 const rejected={status:'rejected' as const,input_digest:
  typeof inputDigest==='string'?inputDigest:''};
 if(!input||Object.keys(input).some(k=>!FIELDS.has(k))||
    typeof input.invocation_id!=='string'||!UUID.test(input.invocation_id)||
    typeof inputDigest!=='string'||!HEX64.test(inputDigest))return rejected;
 const contract=await getContract(env,DIAGNOSTIC_MANIFEST);
 if(input.deployment_id!==contract.deployment_id||
    input.contract_digest!==contract.contract_digest||
    input.input_digest!==await digest({}))return rejected;
 return {status:'accepted' as const,input_digest:input.input_digest};
}
