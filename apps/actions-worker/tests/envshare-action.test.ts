import test from 'node:test';
import assert from 'node:assert/strict';
import {ENVSHARE_MANIFEST,shareEnvshare,checkEnvsharePayload} from '../src/envshare.ts';
import {digest,getContract} from '../../bark-provider/src/notification.ts';
const version='33333333-3333-4333-8333-333333333333';
const env={CF_VERSION_METADATA:{id:version},BARK_DEVICE_KEY:'',BARK_ENCRYPTION_KEY:''};
const sealed={encrypted:'1'.repeat(16)+'2',iv:'1'.repeat(16),ttl:86400,reads:1};
const invocation=async()=>({...sealed,invocation_id:'11111111-1111-4111-8111-111111111111',
 deployment_id:version,contract_digest:(await getContract(env,ENVSHARE_MANIFEST)).contract_digest,
 input_digest:await digest(sealed)});
test('EnvShare Provider keeps plaintext and secret key entirely outside its contract',async()=>{
 assert(checkEnvsharePayload(sealed));
 for(const wrong of [{...sealed,plaintext:'secret'},{...sealed,iv:'abc'},
  {...sealed,encrypted:'not base58 0'}, {...sealed,ttl:0}, {...sealed,reads:11}])
  assert.equal(checkEnvsharePayload(wrong),null);
 const payload=await invocation();let requests=0;
 const result=await shareEnvshare(env,payload,(async(uri,opts)=>{
  requests++;
  assert.equal(uri,'https://envshare.dev/api/v1/store');
  assert.equal(opts?.method,'POST');assert.equal(opts?.redirect,'manual');
  assert.deepEqual(JSON.parse(String(opts?.body)),sealed);
  assert(!String(opts?.body).includes('plaintext'));
  assert(!String(opts?.body).includes('key'));
  return Response.json({id:'1'.repeat(16)});
 }) as typeof fetch);
 assert.equal(requests,1);assert.equal(result.status,'accepted');
 assert.equal(result.share_id,'1'.repeat(16));
 assert(!JSON.stringify(result).includes('unseal'));
});
test('rejected pin/unsafe payload cannot dispatch and ambiguous effects never retry',async()=>{
 const good=await invocation();let n=0;
 for(const invalid of [{...good,contract_digest:'0'.repeat(64)},
  {...good,reads:999},{...good,input_digest:'f'.repeat(64)}]){
  const result=await shareEnvshare(env,invalid,async()=>{n++;throw Error('unexpected');});
  assert.equal(result.status,'rejected');
 }
 assert.equal(n,0);
 for(const response of [new Response(null,{status:503}),new Response(null,{status:302}),
  Response.json({id:'bad-id'}),new Response(null,{status:429})]){
  const result=await shareEnvshare(env,good,async()=>{n++;return response;});
  assert(['unknown','rejected'].includes(result.status));
  assert(!('share_id' in result));
 }
 assert.equal(n,4);
 const unknown=await shareEnvshare(env,good,async()=>{n++;throw Error('ACK lost');});
 assert.equal(unknown.status,'unknown');assert.equal(n,5);
});
