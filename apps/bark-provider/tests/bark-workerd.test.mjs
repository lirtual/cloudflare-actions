import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {digest,ACTION_MANIFEST} from '../src/notification.ts';
const script=readFileSync(new URL('../.build/bark/index.js',import.meta.url),'utf8');
const id='33333333-3333-4333-8333-333333333333';
test('real workerd Service Binding exposes only reviewed RPC; public requests have no send path',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({port:0,workers:[
  {name:'bark-provider',modules:true,script,compatibilityDate:'2026-09-15',bindings:{
   BARK_DEVICE_KEY:'12345678901234567890',
   BARK_ENCRYPTION_KEY:'12345678901234567890123456789012',
   CF_VERSION_METADATA:{id}}},
  {name:'caller',modules:true,compatibilityDate:'2026-09-15',
   serviceBindings:{BARK:'bark-provider'},
   script:`export default {async fetch(request,env){
    const mode=new URL(request.url).searchParams.get('mode');
    if(mode==='contract')return Response.json(await env.BARK.getContract());
    try{const result=await env.BARK.sendNotification({invocation_id:'33333333-3333-4333-8333-333333333333',
      deployment_id:'33333333-3333-4333-8333-333333333333',
      contract_digest:'0'.repeat(64),input_digest:'0'.repeat(64),
      notification:{body:'should not send'}});
      return new Response(result.status,{status:result.status==='rejected'?403:500});
    }catch{return new Response('rejected',{status:403});}
   }};`},
 ]}));
 try{
  const response=await(await mf.getWorker('caller')).fetch('https://caller.example/?mode=contract');
  assert.deepEqual(await response.json(),{deployment_id:id,contract_digest:await digest(ACTION_MANIFEST)});
  const denied=await(await mf.getWorker('caller')).fetch('https://caller.example/?mode=invalid');
  assert.equal(denied.status,403);
  const outside=await mf.dispatchFetch('https://bark-provider.example/mcp');
  assert.equal(outside.status,404);
 }finally{await mf.dispose();}
});

test('real workerd binding sends one encrypted request to a stub Bark endpoint',async()=>{
 const notification={body:'Spec #16 offline integration',title:'Encrypted'};
 let sends=0,observed;
 const mf=new Miniflare(convertV4MiniflareOptions({port:0,workers:[
  {name:'bark-provider',modules:true,script,compatibilityDate:'2026-09-15',
   bindings:{BARK_DEVICE_KEY:'12345678901234567890',
    BARK_ENCRYPTION_KEY:'12345678901234567890123456789012',
    CF_VERSION_METADATA:{id}},
   // All outbound network traffic is intercepted in-process. Never call Bark.
   outboundService:async request=>{
    sends++;
    assert.equal(request.url,'https://api.day.app/push');
    assert.equal(request.method,'POST');
    observed=await request.json();
    return new Response(JSON.stringify({code:200}),{
     status:200,headers:{'content-type':'application/json'}});
   }},
  {name:'caller',modules:true,compatibilityDate:'2026-09-15',
   serviceBindings:{BARK:'bark-provider'},
   script:`export default {async fetch(request,env){
    const note={body:'Spec #16 offline integration',title:'Encrypted'};
    const data=new TextEncoder().encode(JSON.stringify(note));
    const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',data));
    const input_digest=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    const contract=await env.BARK.getContract();
    const result=await env.BARK.sendNotification({
      invocation_id:'33333333-3333-4333-8333-333333333333',
      deployment_id:contract.deployment_id,contract_digest:contract.contract_digest,
      input_digest,notification:note});
    return Response.json(result);
   }};`},
 ]}));
 try{
  const response=await(await mf.getWorker('caller')).fetch('https://caller.example/');
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.status,'accepted');
  assert.equal(sends,1);
  assert.deepEqual(Object.keys(observed).sort(),['ciphertext','device_key','iv']);
  assert.equal(observed.device_key,'12345678901234567890');
  assert.equal(observed.iv.length,12);
  assert(!JSON.stringify(observed).includes(notification.body));
  assert(!JSON.stringify(observed).includes(notification.title));
  const key=await crypto.subtle.importKey('raw',
   new TextEncoder().encode('12345678901234567890123456789012'),
   {name:'AES-GCM'},false,['decrypt']);
  const binary=Uint8Array.from(atob(observed.ciphertext),c=>c.charCodeAt(0));
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',
    iv:new TextEncoder().encode(observed.iv),tagLength:128},key,binary);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(plain)),notification);
 }finally{await mf.dispose();}
});
