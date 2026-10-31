import test from 'node:test';
import assert from 'node:assert/strict';
import {ENVSHARE_MANIFEST,shareEnvshare,checkedEnvshareInput} from '../src/envshare.ts';
import {digest,getContract} from '../../bark-provider/src/notification.ts';
const id='11111111-1111-4111-8111-111111111111';
const deployment='33333333-3333-4333-8333-333333333333';
const env={CF_VERSION_METADATA:{id:deployment},BARK_DEVICE_KEY:'',BARK_ENCRYPTION_KEY:''};
const body={encrypted:'2'.repeat(100),iv:'1'.repeat(16),ttl:86400,reads:1};
const valid=async()=>({invocation_id:id,deployment_id:deployment,
 contract_digest:(await getContract(env,ENVSHARE_MANIFEST)).contract_digest,
 input_digest:await digest(body),...body});
test('ciphertext-only input rejects unknown fields, invalid IV, invalid limits',()=>{
 assert.deepEqual(checkedEnvshareInput(body),body);
 for(const input of [{...body,plaintext:'secret'}, {...body,key:'base58'}, {...body,ttl:0},
  {...body,reads:11},{...body,iv:'0'.repeat(16)}, {...body,encrypted:'O0I'},
  {...body,ttl:604801}, {...body,encrypted:'1'}])
  assert.equal(checkedEnvshareInput(input),null);
});
test('one fixed anonymous POST yields only safe id, no key, no retry',async()=>{
 let calls=0;
 const r=await shareEnvshare(env,await valid(),(async(url,opts)=>{
  calls++;assert.equal(url,'https://envshare.dev/api/v1/store');
  assert.equal(opts?.method,'POST');assert.equal(opts?.redirect,'manual');
  assert.deepEqual(JSON.parse(String(opts.body)),body);
  return Response.json({id:'1'.repeat(16)});
 }) as typeof fetch);
 assert.equal(calls,1);assert.deepEqual(r,{status:'accepted',input_digest:await digest(body),share_id:'1'.repeat(16)});
 assert(!JSON.stringify(r).includes('encrypted'));
});
test('provider pin failures never reach the network, ambiguous writes never replay',async()=>{
 let sends=0;
 const handler=(async()=>{sends++;throw Error('timed out');}) as typeof fetch;
 for(const patch of [{contract_digest:'0'.repeat(64)},{deployment_id:'no'},
  {input_digest:'0'.repeat(64)},{iv:'1'},{reads:0}]){
  assert.equal((await shareEnvshare(env,{...await valid(),...patch},handler)).status,'rejected');
 }
 assert.equal(sends,0);
 assert.equal((await shareEnvshare(env,await valid(),handler)).status,'unknown');
 assert.equal(sends,1);
 for(const reply of [new Response(null,{status:503}),Response.json({id:'invalid0'}),
   new Response(null,{status:302}),Response.json({id:'1'.repeat(16)}, {status:429})]){
  const result=await shareEnvshare(env,await valid(),(async()=>reply) as typeof fetch);
  assert.equal(result.status,reply.status===429?'rejected':'unknown');
 }
});
