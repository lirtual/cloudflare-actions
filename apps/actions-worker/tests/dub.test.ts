import test from 'node:test';
import assert from 'node:assert/strict';
import {DUB_MANIFEST,shortenDub,validateDubInput,validateDubUrl} from '../src/dub.ts';
import {digest,getContract} from '../../bark-provider/src/notification.ts';
const version='33333333-3333-4333-8333-333333333333';
const env={CF_VERSION_METADATA:{id:version},BARK_DEVICE_KEY:'',BARK_ENCRYPTION_KEY:''};
const url='https://example.org/path?token=private%20value&x=2';
const target={url,public_stats:false};
const input=async()=>({invocation_id:'11111111-1111-4111-8111-111111111111',
 deployment_id:version,contract_digest:(await getContract(env,DUB_MANIFEST)).contract_digest,
 input_digest:await digest(target),...target});
test('Dub validates only full HTTP(S) URLs, never leaks credentials or fragments',()=>{
 assert(validateDubUrl(url));
 for(const v of ['ftp://example.org/','https://me:pwd@example.org/','http://example.org/#x',
 'https://example.org:8080/x','https://example.org/?x=1\n','https://example.org/\u0000',
 'http://localhost:90/','javascript:alert(1)'])assert.equal(validateDubUrl(v),false,v);
 assert.equal(validateDubInput({url,public_stats:false})?.url,url);
 assert.equal(validateDubInput({url,public_stats:'true'}),null);
 assert.equal(validateDubInput({url,public_stats:false,token:'x'}),null);
});
test('only acknowledge after one no-follow HEAD verifies exact target including query',async()=>{
 let creates=0,verifications=0;
 const result=await shortenDub(env,await input(),(async (uri,opts)=>{
  assert.equal(opts?.redirect,'manual');
  if(opts?.method==='POST'){
   creates++;assert.equal(uri,'https://dub.co/api/links');
   assert.equal(new Headers(opts.headers).get('dub-anonymous-link-creation'),'1');
   assert.equal(new Headers(opts.headers).get('authorization'),null);
   assert.deepEqual(JSON.parse(String(opts.body)),{url,domain:'dub.sh',publicStats:false});
   return Response.json({domain:'dub.sh',key:'xyz123',shortLink:'https://dub.sh/xyz123',url,publicStats:false});
  }
  assert.equal(opts?.method,'HEAD');assert.equal(uri,'https://dub.sh/xyz123');
  assert.equal(opts?.body,undefined);verifications++;
  return new Response(null,{status:302,headers:{location:url}});
 }) as typeof fetch);
 assert.equal(creates,1);assert.equal(verifications,1);
 assert.equal(result.status,'accepted');
 assert.equal(result.short_link,'https://dub.sh/xyz123');
});
test('creation accepted by Dub but broken, missing or changed redirect remains unknown',async()=>{
 for(const [reply,expectHead] of [
  [new Response(null,{status:302,headers:{location:'https://example.org/path'}}),true],
  [new Response(null,{status:302,headers:{location:'https://example.org/path?token=other'}}),true],
  [new Response(null,{status:307,headers:{location:'https://dub.co/links'}}),true],
  [new Response(null,{status:302}),true],
  [new Response(null,{status:404}),true],
  [Response.json({status:'ok'}),true],
 ] as const){
  let creates=0,heads=0;
  const result=await shortenDub(env,await input(),(async (uri,opts)=>{
   if(opts?.method==='POST'){
    creates++;
    return Response.json({domain:'dub.sh',key:'xyz123',shortLink:'https://dub.sh/xyz123',url,publicStats:false});
   }
   heads++;assert.equal(uri,'https://dub.sh/xyz123');assert.equal(opts?.redirect,'manual');
   return reply;
  }) as typeof fetch);
  assert.equal(result.status,'unknown');assert.equal(creates,1);assert.equal(heads,expectHead?1:0);
 }
 let creates=0,heads=0;
 const result=await shortenDub(env,await input(),(async (_uri,opts)=>{
  if(opts?.method==='POST'){
   creates++;return Response.json({domain:'dub.sh',key:'xyz123',shortLink:'https://dub.sh/xyz123',url,publicStats:false});
  }
  heads++;throw Error('HEAD timed out');
 }) as typeof fetch);
 assert.equal(result.status,'unknown');assert.equal(creates,1);assert.equal(heads,1);
});
test('bad pin, malformed input, redirect, rate-limit, and ambiguous acknowledgement fail closed',async()=>{
 let requests=0;
 const dispatch=async()=>{requests++;return Response.json({domain:'dub.sh',key:'aaa123',shortLink:'https://dub.sh/aaa123',url,publicStats:false});};
 for(const patch of [{contract_digest:'0'.repeat(64)},{deployment_id:'bad'},
  {input_digest:'0'.repeat(64)},{url:'https://evil:pass@example.org/'}]){
  const value=await shortenDub(env,{...await input(),...patch},dispatch as typeof fetch);
  assert.equal(value.status,'rejected');
 }
 assert.equal(requests,0);
 for(const [reply,expected] of [[new Response(null,{status:302}),'unknown'],
  [new Response(null,{status:429}),'rejected'],
  [new Response(null,{status:503}),'unknown'],
  [Response.json({domain:'dub.sh',key:'abc',shortLink:'https://dub.sh/abc',url:'https://other.test/'}),'unknown'] ] as const){
  const value=await shortenDub(env,await input(),(async()=>reply) as typeof fetch);
  assert.equal(value.status,expected);
 }
});
