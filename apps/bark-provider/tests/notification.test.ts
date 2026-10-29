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
