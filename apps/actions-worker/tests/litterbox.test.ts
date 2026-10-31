import test from 'node:test';
import assert from 'node:assert/strict';
import {digest,getContract} from '../../bark-provider/src/notification.ts';
import {LITTERBOX_MANIFEST,MAX_FILE_BYTES,FIXED_UPLOAD_URL,checkLitterboxParams,
 checkLitterboxDownloadUrl,uploadLitterbox} from '../src/litterbox.ts';

const env={CF_VERSION_METADATA:{id:'33333333-3333-4333-8333-333333333333'}} as any;
async function request(bytes=new TextEncoder().encode('fixture'),time='24h' as '24h'|'1h'|'12h'|'72h'){
 const params={file_name:'test-fixture.txt',size_bytes:bytes.byteLength,
  sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
   b=>b.toString(16).padStart(2,'0')).join(''),time};
 const identity=await getContract(env,LITTERBOX_MANIFEST);
 return {...params,bytes,invocation_id:'11111111-1111-4111-8111-111111111111',
  deployment_id:identity.deployment_id,contract_digest:identity.contract_digest,
  input_digest:await digest(params)};
}
test('one fixed multipart POST, exact bytes and TTL; no credentials or URL dispatch',async()=>{
 for(const expiry of ['1h','12h','24h','72h'] as const){
  const input=await request(new TextEncoder().encode('test only'),expiry);
  let count=0;
  const result=await uploadLitterbox(env,input,async (url,opts)=>{
   count++;assert.equal(url,FIXED_UPLOAD_URL);assert.equal(opts?.method,'POST');
   assert.equal(opts?.redirect,'manual');assert.equal(opts?.headers,undefined);
   const body=opts?.body as FormData;assert.equal(body.get('reqtype'),'fileupload');
   assert.equal(body.get('time'),expiry);
   const file=body.get('fileToUpload') as File;
   assert.equal(file.name,'test-fixture.txt');assert.equal(file.size,input.bytes.byteLength);
   assert.deepEqual(new Uint8Array(await file.arrayBuffer()),input.bytes);
   return new Response('https://litter.catbox.moe/AbC_123.txt');
  });
  assert.equal(result.status,'accepted');
  assert.equal(result.download_url,'https://litter.catbox.moe/AbC_123.txt');
  assert.equal(count,1);
 }
});
test('reject malformed filenames, expiry, sizes, byte mismatch, digest and deployment pin pre-POST',async()=>{
 const valid=await request();
 let count=0;
 const send=async()=>{count++;throw Error('must not fetch');};
 for(const wrong of [
  {...valid,time:'2h'}, {...valid,file_name:'../escape.txt'},
  {...valid,file_name:'a/b'}, {...valid,file_name:'a\\b'},
  {...valid,file_name:'.env'}, {...valid,sha256:'0'.repeat(64)},
  {...valid,size_bytes:MAX_FILE_BYTES+1}, {...valid,size_bytes:0},
  {...valid,bytes:new Uint8Array([1,2])},
  {...valid,input_digest:'f'.repeat(64)}, {...valid,contract_digest:'f'.repeat(64)},
  {...valid,deployment_id:'44444444-4444-4444-8444-444444444444'},
 ]){
  assert.equal((await uploadLitterbox(env,wrong as any,send as any)).status,'rejected');
 }
 assert.equal(count,0);
 assert.equal(checkLitterboxParams({time:'24h',file_name:'file.txt',size_bytes:2,
  sha256:'a'.repeat(64),extra:true}),null);
 assert.equal(checkLitterboxDownloadUrl('https://evil.com/thing.txt'),false);
 assert.equal(checkLitterboxDownloadUrl('https://litter.catbox.moe/ok.txt?private=x'),false);
});
test('upstream failure, redirect and malformed success are unknown, never auto-replayed',async()=>{
 const input=await request();
 for(const response of [
  new Response(null,{status:302,headers:{location:'https://other.example/'}}),
  new Response(null,{status:503}),
  new Response('not-a-url'),new Response('https://other.example/download.txt'),
  new Response('https://litter.catbox.moe/file.txt?secret=value'),
 ]){
  let posts=0;
  const answer=await uploadLitterbox(env,input,async()=>{posts++;return response;});
  assert.equal(answer.status,'unknown');assert.equal(posts,1);
 }
 let posts=0;
 const error=await uploadLitterbox(env,input,async()=>{posts++;throw Error('timeout');});
 assert.equal(error.status,'unknown');assert.equal(posts,1);
});
test('10 MiB boundary: exact size can form multipart once, 10 MiB +1 rejects before RPC',async()=>{
 const valid=await request(new Uint8Array(MAX_FILE_BYTES));
 let seen=0;
 const ok=await uploadLitterbox(env,valid,async(_url,opts)=>{
  seen++;
  assert.equal((opts?.body as FormData).get('time'),'24h');
  return new Response('https://litterbox.catbox.moe/a.txt');
 });
 assert.equal(ok.status,'accepted');assert.equal(seen,1);
 const tooLarge={...valid,bytes:new Uint8Array(MAX_FILE_BYTES+1),
  size_bytes:MAX_FILE_BYTES+1};
 assert.equal((await uploadLitterbox(env,tooLarge,async()=>{seen++;throw Error('oversize');})).status,'rejected');
 assert.equal(seen,1);
});
