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
