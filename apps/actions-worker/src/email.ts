import {digest,getContract,type Env as BaseEnv} from './bark.ts';

export const EMAIL_SENDER='actions@notify.lirtual.dpdns.org';
const MAX_INPUT_BYTES=24576;
const MAX_OUTPUT_BYTES=4096;
const RECIPIENT='^[^\\s@,;<>]+@[^\\s@,;<>]+$';
const rejectionCodes=[
 'E_VALIDATION_ERROR','E_SENDER_NOT_VERIFIED','E_SENDER_DOMAIN_NOT_AVAILABLE',
 'E_SENDER_DOMAIN_NOT_CONFIGURED','E_EMAIL_SENDING_NOT_READY','E_RECIPIENT_NOT_ALLOWED',
 'E_RECIPIENT_PLAN_RESTRICTED','E_RECIPIENT_SUPPRESSED','E_ACCOUNT_SUSPENDED',
 'E_CONTENT_TOO_LARGE','E_RATE_LIMIT_EXCEEDED','E_DAILY_LIMIT_EXCEEDED',
] as const;
const uncertainCodes=['E_INTERNAL_SERVER_ERROR','E_DELIVERY_FAILED'] as const;

export const EMAIL_MANIFEST=Object.freeze({
 executor:'cloudflare',provider:'email',action:'email.send',version:1,
 source_repository:'lirtual/cloudflare-actions',service:'cloudflare-actions',
 entrypoint:'ActionsEntrypoint',side_effect:'send_email_to_account_verified_recipient',
 max_input_bytes:MAX_INPUT_BYTES,
 error_codes:[...rejectionCodes,...uncertainCodes,'email_not_configured'],
 input_schema:{type:'object',additionalProperties:false,required:['to','subject'],
  properties:{to:{type:'string',pattern:RECIPIENT},subject:{type:'string',minLength:1},
   text:{type:'string'},html:{type:'string'}}},
 output_schema:{type:'object',additionalProperties:false,required:['status','message_id'],
  properties:{status:{enum:['accepted']},message_id:{type:'string',pattern:'\\S'}}},
});

export type EmailEnv=BaseEnv & {EMAIL?:SendEmail};
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const HEX=/^[a-f0-9]{64}$/;
const metadata=new Set(['invocation_id','deployment_id','contract_digest','input_digest']);
const fields=new Set(['to','subject','text','html']);
const bytes=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v)).byteLength;
const nonempty=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;

/** One native send. Local validation/explicit rejection are known; an uncertain effect is never replayed here. */
export async function sendEmail(env:EmailEnv,invocation:unknown){
 const v=invocation&&typeof invocation==='object'&&!Array.isArray(invocation)
   ?invocation as Record<string,unknown>:null;
 const input_digest=typeof v?.input_digest==='string'&&HEX.test(v.input_digest)?v.input_digest:'';
 const rejected={status:'rejected' as const,input_digest};
 if(!v||typeof v.invocation_id!=='string'||!UUID.test(v.invocation_id)||!input_digest)
   return rejected;
 const contract=await getContract(env,EMAIL_MANIFEST);
 if(v.deployment_id!==contract.deployment_id||v.contract_digest!==contract.contract_digest)
   return rejected;
 const identity={invocation_id:v.invocation_id,deployment_id:contract.deployment_id,input_digest};
 if(Object.keys(v).some(k=>!metadata.has(k)&&!fields.has(k)))return rejected;
 const input=Object.fromEntries(Object.entries(v).filter(([k])=>fields.has(k)));
 const {to,subject,text,html}=input;
 if(typeof to!=='string'||!new RegExp(RECIPIENT).test(to)||
    !nonempty(subject)||/[\r\n\0]/.test(subject)||
    (text!==undefined&&typeof text!=='string')||(html!==undefined&&typeof html!=='string')||
    (!nonempty(text)&&!nonempty(html))||bytes(input)>MAX_INPUT_BYTES||
    await digest(input)!==input_digest)return rejected;
 if(!env.EMAIL||typeof env.EMAIL.send!=='function')
   return {...identity,status:'rejected' as const,error_code:'email_not_configured'};
 try{
   const result=await env.EMAIL.send({from:EMAIL_SENDER,to,subject,
     ...(typeof text==='string'?{text}:{}),...(typeof html==='string'?{html}:{})});
   if(!nonempty(result?.messageId))return {...identity,status:'unknown' as const};
   const output={status:'accepted' as const,message_id:result.messageId};
   if(bytes(output)>MAX_OUTPUT_BYTES)return {...identity,status:'unknown' as const};
   return {...identity,...output};
 }catch(error){
   const code=error&&typeof error==='object'&&'code' in error?error.code:undefined;
   if(typeof code==='string'&&(rejectionCodes as readonly string[]).includes(code))
     return {...identity,status:'rejected' as const,error_code:code};
   if(typeof code==='string'&&(uncertainCodes as readonly string[]).includes(code))
     return {...identity,status:'unknown' as const,error_code:code};
   return {...identity,status:'unknown' as const};
 }
}
