import assert from 'node:assert/strict';
import {test} from 'node:test';
import {digest,getContract,validateNotification,encryptedRequest,sendNotification} from '../src/notification.ts';
const env={BARK_DEVICE_KEY:'12345678901234567890',
 BARK_ENCRYPTION_KEY:'12345678901234567890123456789012',
 CF_VERSION_METADATA:{id:'c4fb8b5e-0202-42fd-9df9-ff06e9f7ab6c'}};
test('strict input denies device routing, delete and badge=0',()=>{
 for(const extra of [{device_key:'evil'},{delete:'1'},{badge:0},{url:'http://example.com'}, {volume:5}]){
  assert.throws(()=>validateNotification({body:'test',...extra}));
 }
 assert.equal(validateNotification({body:'test',url:'https://example.com'}).url,'https://example.com');
 assert.deepEqual(validateNotification({body:'test',level:'critical',volume:5,badge:3}),{
  body:'test',level:'critical',volume:5,badge:3});
});
test('ciphertext is AES-256-GCM combined tag and not plaintext',async()=>{
 const a=JSON.parse(await encryptedRequest(env,{body:'secret',id:'safe-id'}));
 const b=JSON.parse(await encryptedRequest(env,{body:'secret'}));
 assert.equal(a.iv.length,12);
 assert.notEqual(a.iv,b.iv);
 assert.equal(a.id,'safe-id');
 assert.equal(a.device_key,env.BARK_DEVICE_KEY);
 assert(!JSON.stringify(a).includes('secret'));
 const cipher=Uint8Array.from(atob(a.ciphertext),c=>c.charCodeAt(0));
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.BARK_ENCRYPTION_KEY),
  {name:'AES-GCM'},false,['decrypt']);
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:new TextEncoder().encode(a.iv)},
  key,cipher);
 assert.deepEqual(JSON.parse(new TextDecoder().decode(plain)),{body:'secret',id:'safe-id'});
 cipher[0]^=1;
 await assert.rejects(crypto.subtle.decrypt({name:'AES-GCM',
   iv:new TextEncoder().encode(a.iv)},key,cipher));
});
test('accepted, rejected, uncertain; no retries or redirects',async()=>{
 const c=await getContract(env);
 const notification={body:'hello'};
 const input={invocation_id:'c4fb8b5e-0202-42fd-9df9-ff06e9f7ab6c',...c,
  input_digest:await digest(notification),notification};
 let count=0;
 for(const [status,body,expected] of [[200,'{"code":200}','accepted'],
  [400,'{"code":400}','rejected'],[502,'','unknown'],[302,'','unknown'],
  [200,'oops','unknown']] as const){
  const result=await sendNotification(env,input,async(url,init)=>{
   count++;assert.equal(url,'https://api.day.app/push');
   assert.equal(init?.redirect,'manual');
   return new Response(body,{status});
  });
  assert.equal(result.status,expected);
 }
 assert.equal(count,5);
 assert.equal((await sendNotification(env,{...input,input_digest:'f'.repeat(64)},async()=>{throw Error('unexpected_send')})).status,'rejected');
});

test('oversized content, unsafe HTTPS and sensitive update IDs fail closed',()=>{
 const invalid=[
  {body:'x'.repeat(2401)},
  {body:'ok',title:'x'.repeat(151)},
  {body:'ok',url:'https://user:pass@example.com'},
  {body:'ok',icon:'https://example.com:8443/icon.png'},
  {body:'ok',image:'https://example.com/img#fragment'},
  {body:'ok',id:'private@example.com'},
  {body:'ok',badge:0},
  {body:'ok',level:'critical',volume:11},
  {body:'ok',unexpected:'skip-schema'},
 ];
 for(const notification of invalid)
  assert.throws(()=>validateNotification(notification),JSON.stringify(notification).slice(0,100));
 assert.equal(validateNotification({body:'valid',id:'public-update_1'}).id,'public-update_1');
});
test('invalid invocation or mismatched provider identity never reaches the upstream',async()=>{
 const contract=await getContract(env);
 const notification={body:'hello'};
 const base={invocation_id:'c4fb8b5e-0202-42fd-9df9-ff06e9f7ab6c',
  ...contract,input_digest:await digest(notification),notification};
 let sends=0;
 const mock=async()=>{sends++;return new Response('{"code":200}',{status:200});};
 for(const input of [
  {...base,invocation_id:'not-a-uuid'},
  {...base,deployment_id:'00000000-0000-4000-8000-000000000000'},
  {...base,contract_digest:'f'.repeat(64)},
  {...base,input_digest:'f'.repeat(64)},
  {...base,notification:{body:'changed'}},
 ]){
  const result=await sendNotification(env,input,mock);
  assert.equal(result.status,'rejected');
 }
 assert.equal(sends,0);
});
test('ambiguous upstream acknowledgements and transport errors are unknown, with no retry',async()=>{
 const contract=await getContract(env);
 const notification={body:'only once'};
 const input={invocation_id:'c4fb8b5e-0202-42fd-9df9-ff06e9f7ab6c',
  ...contract,input_digest:await digest(notification),notification};
 const ambiguous=[
  new Response('{"code":"200"}',{status:200}),
  new Response('{"code":500}',{status:200}),
  new Response('{}',{status:200}),
  new Response('x'.repeat(2050),{status:200}),
  new Response('',{status:503}),
  new Response('',{status:307,headers:{location:'https://untrusted.example/'}}),
 ];
 let sends=0;
 for(const response of ambiguous){
  const result=await sendNotification(env,input,async()=>{
   sends++;return response;
  });
  assert.equal(result.status,'unknown');
 }
 const error=await sendNotification(env,input,async()=>{
  sends++;throw Error('connection reset after request');
 });
 assert.equal(error.status,'unknown');
 assert.equal(sends,ambiguous.length+1);
});
