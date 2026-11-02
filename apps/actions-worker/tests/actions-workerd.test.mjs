import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const script=readFileSync(new URL('../.build/actions/index.js',import.meta.url),'utf8');
const version='33333333-3333-4333-8333-333333333333';
const requestId='11111111-1111-4111-8111-111111111111';
function fixture(caller,{dubRedirectMode='original',dubPublicStats=false}={}){
 let external=0,dubTarget='';
 const mf=new Miniflare(convertV4MiniflareOptions({port:0,workers:[
  {name:'cloudflare-actions',modules:true,script,compatibilityDate:'2026-09-15',
   bindings:{CF_VERSION_METADATA:{id:version},
    BARK_DEVICE_KEY:'12345678901234567890',
    BARK_ENCRYPTION_KEY:'12345678901234567890123456789012'},
   outboundService:async request=>{
    external++;
    if(request.url==='https://dub.co/api/links'){
      assert.equal(request.headers.get('dub-anonymous-link-creation'),'1');
      const body=await request.json();
      assert.equal(body.domain,'dub.sh');
      assert.equal(body.publicStats,dubPublicStats);
      dubTarget=body.url;
      return Response.json({domain:'dub.sh',key:'Abc123',shortLink:'https://dub.sh/Abc123',
       url:body.url,publicStats:dubPublicStats});
    }
    if(request.url==='https://dub.sh/Abc123' && request.method==='HEAD'){
      return new Response(null,{status:302,headers:{location:dubRedirectMode==='strip-query'?new URL(dubTarget).origin+'/':dubTarget}});
    }
    if(request.url==='https://litterbox.catbox.moe/resources/internals/api.php'){
      assert.equal(request.method,'POST');
      const form=await request.formData();
      assert.equal(form.get('reqtype'),'fileupload');
      assert.equal(form.get('time'),'24h');
      const selected=form.get('fileToUpload');
      assert.equal(selected.name,'fixture.txt');
      assert.equal(await selected.text(),'Litterbox workerd fixture');
      return new Response('https://litter.catbox.moe/workerd-fixture.txt');
    }
    if(request.url==='https://envshare.dev/api/v1/store'){
      assert.equal(request.method,'POST');
      const data=await request.json();
      assert.deepEqual(Object.keys(data).sort(),['encrypted','iv','reads','ttl']);
      return Response.json({id:'1111111111111111'});
    }
    assert.equal(request.url,'https://api.day.app/push');
    const envelope=await request.json();
    assert.equal(Object.hasOwn(envelope,'body'),false);
    return Response.json({code:200});
   }},
  {name:'caller',modules:true,compatibilityDate:'2026-09-15',
   serviceBindings:{ACTIONS:{name:'cloudflare-actions',entrypoint:'ActionsEntrypoint'}},script:caller},
 ]}));
 return {mf,external:()=>external};
}

test('one real workerd Service Binding has four pinned Actions and zero Weixin/Owner routes',async()=>{
 const caller=`export default {async fetch(request,env){const q=new URL(request.url).searchParams;
  const action=q.get('action');
  try{
   if(q.has('list'))return Response.json(await env.ACTIONS.listActions());
   if(q.has('contract'))return Response.json(await env.ACTIONS.getContract(action,q.has('digest')?q.get('digest'):undefined));
   if(q.has('receipt'))return Response.json(await env.ACTIONS.getReceipt(action,{}));
   if(q.has('binding'))return Response.json(await env.ACTIONS.getBinding(action));
   return Response.json(await env.ACTIONS.execute(action,{}));
  }catch(e){return new Response(e.message,{status:403});}}};`;
 const {mf,external}=fixture(caller);
 try{
  const client=await mf.getWorker('caller');
  const get=path=>client.fetch('https://caller.example/'+path);
  const list=(await(await get('?list=1')).json()).map(x=>x.action_id);
  assert.deepEqual(list,['dub.shorten_url','envshare.share_text','litterbox.upload_file','bark.send_notification']);
  for(const action of list){
   const current=await(await get('?contract=1&action='+action)).json();
   assert.equal(current.deployment_id,version);
   assert.match(current.contract_digest,/^[a-f0-9]{64}$/);
   assert.deepEqual(await(await get('?contract=1&action='+action+'&digest='+current.contract_digest)).json(),current);
   assert.equal((await get('?contract=1&action='+action+'&digest='+('0'.repeat(64)))).status,403);
   assert.equal((await get('?receipt=1&action='+action)).status,403);
   assert.equal((await get('?binding=1&action='+action)).status,403);
  }
  for(const legacy of ['weixin.send_text','weixin.notify_download','weixin.legacy_send']){
   for(const operation of ['contract=1&','receipt=1&','binding=1&','']){
    const uri='?'+operation+'action='+legacy;
    assert.equal((await get(uri)).status,403,uri);
   }
  }
  for(const uri of ['https://weixin-owner.example.org/','https://weixin-owner.example.org/setup',
   'https://weixin-owner.example.org/qr','https://weixin-owner.example.org/mcp']){
   assert.equal((await mf.dispatchFetch(uri)).status,404,uri);
  }
  assert.equal(external(),0);
 }finally{await mf.dispose();}
});

test('unified workerd binding forwards one encrypted Bark notification to fixed endpoint',async()=>{
 const note={body:'Spec 21 isolated test',title:'Encrypted'};
 const caller=`export default {async fetch(request,env){
  const notification={body:'Spec 21 isolated test',title:'Encrypted'};
  const data=new TextEncoder().encode(JSON.stringify(notification));
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),
   b=>b.toString(16).padStart(2,'0')).join('');
  const contract=await env.ACTIONS.getContract('bark.send_notification');
  const result=await env.ACTIONS.execute('bark.send_notification',{
   invocation_id:'${requestId}',deployment_id:contract.deployment_id,
   contract_digest:contract.contract_digest,input_digest:digest,notification});
  return Response.json(result);
 }};`;
 const {mf,external}=fixture(caller);
 try{
  const reply=await(await(await mf.getWorker('caller')).fetch('https://caller.example/')).json();
  assert.equal(reply.status,'accepted');
  assert.equal(external(),1);
  assert.equal(reply.input_digest.length,64);
 }finally{await mf.dispose();}
});


test('real workerd private RPC creates once and verifies one Dub redirect, never fetches target',async()=>{
 const target='https://example.org/file?private=value%20with%20space';
 const caller=`export default {async fetch(request,env){
  const url='${target}',public_stats=false;
  const val={public_stats,url};
  const canonical=value=>value&&typeof value==='object'&&!Array.isArray(value)
    ?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b,'en')))
    :value;
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(val))));
  const input_digest=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
  const contract=await env.ACTIONS.getContract('dub.shorten_url');
  const result=await env.ACTIONS.execute('dub.shorten_url',{
    invocation_id:'${requestId}',deployment_id:contract.deployment_id,
    contract_digest:contract.contract_digest,input_digest,url,public_stats});
  return Response.json(result);
 }};`;
 const {mf,external}=fixture(caller);
 try{
  const response=await(await mf.getWorker('caller')).fetch('https://caller.example/');
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.status,'accepted');
  assert.equal(result.short_link,'https://dub.sh/Abc123');
  assert.equal(external(),2);
 }finally{await mf.dispose();}
});

test('real workerd binding preserves explicitly public Dub statistics',async()=>{
 const target='https://example.org/path?stats=public';
 const caller=`export default {async fetch(request,env){
  const url='${target}',public_stats=true;
  const input_digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
   new TextEncoder().encode(JSON.stringify({public_stats,url})))),
   b=>b.toString(16).padStart(2,'0')).join('');
  const pin=await env.ACTIONS.getContract('dub.shorten_url');
  return Response.json(await env.ACTIONS.execute('dub.shorten_url',{
   invocation_id:'${requestId}',deployment_id:pin.deployment_id,
   contract_digest:pin.contract_digest,input_digest,url,public_stats}));
 }};`;
 const {mf,external}=fixture(caller,{dubPublicStats:true});
 try{
  const result=await(await(await mf.getWorker('caller'))
   .fetch('https://caller.example/')).json();
  assert.equal(result.status,'accepted');
  assert.equal(result.short_link,'https://dub.sh/Abc123');
  assert.equal(external(),2); // one POST and one no-follow HEAD, no target fetch
 }finally{await mf.dispose();}
});

test('real workerd private RPC rejects a Dub redirect that drops the target query',async()=>{
 const target='https://example.org/path?must=be-preserved';
 const caller=`export default {async fetch(request,env){
  const url='${target}',public_stats=false;
  const input_digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
   new TextEncoder().encode(JSON.stringify({public_stats,url})))),
   b=>b.toString(16).padStart(2,'0')).join('');
  const pin=await env.ACTIONS.getContract('dub.shorten_url');
  const result=await env.ACTIONS.execute('dub.shorten_url',{
   invocation_id:'${requestId}',deployment_id:pin.deployment_id,
   contract_digest:pin.contract_digest,input_digest,url,public_stats});
  return Response.json(result);
 }};`;
 const {mf,external}=fixture(caller,{dubRedirectMode:'strip-query'});
 try{
  const response=await(await mf.getWorker('caller')).fetch('https://caller.example/');
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.status,'unknown');
  assert.equal(result.short_link,undefined);
  assert.equal(external(),2); // one POST + one HEAD, never a duplicate create
 }finally{await mf.dispose();}
});

test('real private workerd RPC accepts only sealed EnvShare input and returns ID, not secret URL',async()=>{
 const caller=`export default {async fetch(req,env){
  const input={encrypted:'11111111111111112',iv:'1111111111111111',ttl:86400,reads:1};
  const fields=Object.fromEntries(Object.entries(input).sort(([a],[b])=>a.localeCompare(b,'en')));
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(fields)));
  const input_digest=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
  const pin=await env.ACTIONS.getContract('envshare.share_text');
  return Response.json(await env.ACTIONS.execute('envshare.share_text',{
   invocation_id:'${requestId}',deployment_id:pin.deployment_id,
   contract_digest:pin.contract_digest,input_digest,...input}));
 }};`;
 const {mf,external}=fixture(caller);
 try{
  const response=await(await mf.getWorker('caller')).fetch('https://caller.example/');
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.status,'accepted');
  assert.equal(result.share_id,'1111111111111111');
  assert.equal(external(),1);
  assert(!JSON.stringify(result).includes('unseal'));
 }finally{await mf.dispose();}
});


test('real workerd private RPC transports one bounded Litterbox file to fixed multipart host',async()=>{
 const caller=`export default {async fetch(_request,env){
  const bytes=new TextEncoder().encode('Litterbox workerd fixture');
  const hex=buf=>Array.from(new Uint8Array(buf),b=>b.toString(16).padStart(2,'0')).join('');
  const sha256=hex(await crypto.subtle.digest('SHA-256',bytes));
  const params={file_name:'fixture.txt',size_bytes:bytes.length,sha256,time:'24h'};
  const canonical=value=>Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b,'en')));
  const input_digest=hex(await crypto.subtle.digest('SHA-256',
   new TextEncoder().encode(JSON.stringify(canonical(params)))));
  const pin=await env.ACTIONS.getContract('litterbox.upload_file');
  return Response.json(await env.ACTIONS.execute('litterbox.upload_file',{
   ...params,bytes,invocation_id:'11111111-1111-4111-8111-111111111111',deployment_id:pin.deployment_id,
   contract_digest:pin.contract_digest,input_digest}));
 }};`;
 const {mf,external}=fixture(caller);
 try{
  const reply=await(await(await mf.getWorker('caller')).fetch('https://caller.example/')).json();
  assert.equal(reply.status,'accepted');
  assert.equal(reply.download_url,'https://litter.catbox.moe/workerd-fixture.txt');
  assert.equal(external(),1);
 }finally{await mf.dispose();}
});
