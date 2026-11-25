import assert from 'node:assert/strict';
import test from 'node:test';
import {createActionDispatcher} from '../src/dispatch.ts';
import {digest} from '../src/bark.ts';

const version='33333333-3333-4333-8333-333333333333';
const invocation_id='11111111-1111-4111-8111-111111111111';
const input={to:'recipient@example.invalid',subject:'中文日报',text:'今日报告'};
const sender='actions@notify.lirtual.dpdns.org';
function fixture(send?: (message:any)=>Promise<any>){
 const calls:any[]=[];
 const api=createActionDispatcher({CF_VERSION_METADATA:{id:version},...(send?{EMAIL:{async send(message:any){calls.push(message);return send(message);}}}:{})} as never);
 return {api,calls,async invoke(payload:Record<string,unknown>,extra:Record<string,unknown>={}){
  const contract=await api.getContract('email.send');
  return api.execute('email.send',{...payload,invocation_id,deployment_id:version,
   contract_digest:contract.contract_digest,input_digest:await digest(payload),...extra});
 }};
}

test('private Email dispatcher discovers and sends one structured fixed-sender message',async()=>{
 const f=fixture(async()=>({messageId:'provider-message-id'}));
 const {manifest}=await f.api.getContract('email.send');
 assert.equal((manifest as any).max_input_bytes,24576);
 for(const body of [{text:'报告'},{html:'<p>报告</p>'},{text:'报告',html:'<p>报告</p>'}]){
  const payload={to:input.to,subject:input.subject,...body};
  const receipt=await f.invoke(payload);
  assert.equal(receipt.status,'accepted');
  assert.equal((receipt as any).message_id,'provider-message-id');
  assert.deepEqual(f.calls.at(-1),{...payload,from:sender});
 }
 assert.equal(f.calls.length,3);
});

test('invalid input, size, sender override and stale pin do not call binding',async()=>{
 const f=fixture(async()=>({messageId:'must-not-send'}));
 for(const payload of [
  {...input,to:['recipient@example.invalid']},{...input,to:'a@example.invalid,b@example.invalid'},
  {...input,from:'other@example.invalid'},{...input,cc:'other@example.invalid'},
  {...input,text:'',html:' '},{...input,subject:''},{...input,subject:'x\r\nBcc:x'},
  {...input,text:'中'.repeat(8192)},{...input,invocation_id:'caller-controlled'},
 ]){
  // Reserved invocation fields are owned by the dispatcher caller; direct
  // collision is also detected by the digest of the non-metadata fields.
  assert.equal((await f.invoke(payload)).status,'rejected',JSON.stringify({...payload,text:typeof payload.text==='string'?payload.text.slice(0,20):payload.text}));
 }
 assert.equal((await f.invoke(input,{contract_digest:'0'.repeat(64)})).status,'rejected');
 assert.equal((await f.invoke(input,{input_digest:'0'.repeat(64)})).status,'rejected');
 assert.equal(f.calls.length,0);
});
test('reviewed provider errors retain only exact code and uncertainty',async()=>{
 for(const [code,status] of [
  ['E_RECIPIENT_PLAN_RESTRICTED','rejected'],['E_RECIPIENT_SUPPRESSED','rejected'],
  ['E_SENDER_DOMAIN_NOT_AVAILABLE','rejected'],['E_DAILY_LIMIT_EXCEEDED','rejected'],
  ['E_RATE_LIMIT_EXCEEDED','rejected'],['E_INTERNAL_SERVER_ERROR','unknown'],
  ['E_DELIVERY_FAILED','unknown'],['UNREVIEWED','unknown'],
 ]){
  const f=fixture(async()=>{throw Object.assign(new Error('private subject/body'),{code});});
  const result=await f.invoke(input) as any;
  assert.equal(result.status,status);
  assert.equal(result.error_code,code==='UNREVIEWED'?undefined:code);
  assert.equal(JSON.stringify(result).includes('private subject/body'),false);
  assert.equal(f.calls.length,1);
 }
 for(const value of [undefined,{}, {messageId:''},{messageId:' '},{messageId:42},{messageId:'x'.repeat(4096)}]){
  const f=fixture(async()=>value);
  assert.equal((await f.invoke(input)).status,'unknown');
  assert.equal(f.calls.length,1);
 }
 const f=fixture();
 assert.equal((await f.invoke(input) as any).error_code,'email_not_configured');
 assert.equal((await f.api.listActions()).length,6);
 assert.equal((await f.api.getContract('diagnostic.ping')).deployment_id,version);
});
