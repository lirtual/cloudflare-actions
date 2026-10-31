import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {encrypt} from "../src/crypto.ts";
import {bindingIdentity,readActionReceipt,sendTextAction,providerIdentity} from "../src/provider.ts";
import type {Env} from "../src/types.ts";
const invocation="62f76e7a-c614-47b0-bf13-50d85f9de992";
const deployment="33333333-3333-4333-8333-333333333333";
function fixture(){
 const sql=new DatabaseSync(":memory:");sql.exec(readFileSync(new URL("../migrations/0001_owner.sql",import.meta.url),"utf8"));sql.exec(readFileSync(new URL('../migrations/0002_send_rejection_codes.sql',import.meta.url),'utf8'));
 const db={prepare(query:string){const stmt=sql.prepare(query);const call=(args:unknown[])=>({first:async<T>()=>(stmt.get(...args as [])??null) as T|null,run:async()=>({meta:{changes:Number(stmt.run(...args as []).changes)}})});return {...call([]),bind:(...args:unknown[])=>call(args)};}};
 const env={DB:db as unknown as D1Database,WEIXIN_ENCRYPTION_KEY:Buffer.alloc(32,17).toString("base64"),CF_VERSION_METADATA:{id:deployment}} as Env;
 return {sql,env,async ready(generation=1){const session={botToken:"token",ownerId:"owner",botId:"bot",contextToken:"context",cursor:"cursor"};const v=await encrypt(env,"weixin:owner:binding:"+generation,session);sql.prepare("UPDATE weixin_binding SET generation=?,state=\u0027ready\u0027,session_ciphertext=?,session_key_id=?,last_verified_context_at=? WHERE id=1").run(generation,v.ciphertext,v.keyId,Math.floor(Date.now()/1000));}};
}
test("one reviewed action invocation is sent at most once; receipt stays queryable after unbind",async()=>{
 const x=fixture();await x.ready();const identity=await bindingIdentity(x.env);assert.deepEqual(identity,{generation:1,ready:true});
 const req={invocation_id:invocation,binding_generation:1,session_url:"https://safe.trycloudflare.com/",...(await providerIdentity(x.env))};let sends=0;
 const dispatch=async()=>{sends++;return "accepted" as const;};
 const first=await sendTextAction(x.env,req,dispatch,async()=>{});assert.equal(first.status,"accepted");assert.equal(first.duplicate,false);
 const repeat=await sendTextAction(x.env,req,dispatch,async()=>{});assert.equal(repeat.status,"accepted");assert.equal(repeat.duplicate,true);assert.equal(sends,1);
 x.sql.prepare("UPDATE weixin_binding SET generation=2,state=\u0027unbound\u0027,session_ciphertext=NULL,session_key_id=NULL WHERE id=1").run();
 assert.deepEqual((await readActionReceipt(x.env,{invocation_id:invocation,binding_generation:1,input_digest:first.input_digest})).status,"accepted");
});
test("read-only Action RPC rejects missing or wrong inherited Owner key before dispatch",async()=>{
 const x=fixture();await x.ready();
 assert.deepEqual(await bindingIdentity(x.env),{generation:1,ready:true});
 const wrong={...x.env,WEIXIN_ENCRYPTION_KEY:Buffer.alloc(32,20).toString("base64")};
 await assert.rejects(()=>bindingIdentity(wrong),/weixin_binding_unreadable/);
 const lost={...x.env,WEIXIN_ENCRYPTION_KEY:undefined};
 await assert.rejects(()=>bindingIdentity(lost as unknown as Env),/weixin_binding_unreadable/);
 assert.equal(x.sql.prepare("SELECT count(*) AS n FROM weixin_send_receipts").get()!.n,0);
});
test("wrong binding, URL or input identity cannot dispatch",async()=>{
 const x=fixture();await x.ready();let sends=0;const d=async()=>{sends++;return "accepted" as const;};
 const pin=await providerIdentity(x.env);
 await assert.rejects(()=>sendTextAction(x.env,{invocation_id:invocation,binding_generation:2,session_url:"https://safe.trycloudflare.com/",...pin},d,async()=>{}),/binding_generation_changed/);
 await assert.rejects(()=>sendTextAction(x.env,{invocation_id:invocation,binding_generation:1,session_url:"http://127.0.0.1/x",...pin},d,async()=>{}),/invalid_trusted_url/);
 assert.equal(sends,0);
});

test("Provider rejects non-root Quick Tunnel URLs without dispatch",async()=>{
 const x=fixture();await x.ready();let sends=0;
 const dispatch=async()=>{sends++;return "accepted" as const;};
 const pin=await providerIdentity(x.env);
 for(const session_url of [
  "https://safe.trycloudflare.com/path",
  "https://safe.trycloudflare.com/%2f",
  "https://safe.trycloudflare.com/?t=1",
  "https://safe.trycloudflare.com/#fragment",
  "https://safe.trycloudflare.com//",
  "https://nested.safe.trycloudflare.com/",
  "https://safe.trycloudflare.com:443/",
 ]) {
  await assert.rejects(()=>sendTextAction(x.env,{
   invocation_id:crypto.randomUUID(),binding_generation:1,session_url,...pin
  },dispatch,async()=>{}),/invalid_trusted_url/,session_url);
 }
 assert.equal(sends,0);
 assert.equal(x.sql.prepare("SELECT count(*) AS n FROM weixin_send_receipts").get()?.n,0);
});

test("generation changed during pre-send sync cannot reroute the invocation",async()=>{
 const x=fixture();await x.ready(1);let dispatches=0;
 const dispatch=async()=>{dispatches++;return "accepted" as const;};
 const synchronize=async()=>{await x.ready(2);};
 const pin=await providerIdentity(x.env);
 await assert.rejects(()=>sendTextAction(x.env,{invocation_id:invocation,binding_generation:1,
  session_url:"https://safe.trycloudflare.com/",...pin},dispatch,synchronize),/binding_generation_changed/);
 assert.equal(dispatches,0);
 assert.equal(x.sql.prepare("SELECT count(*) AS n FROM weixin_send_receipts").get()?.n,0);
});

test("runtime deployment and contract pin must match before any receipt reservation",async()=>{
 const x=fixture();await x.ready();let sends=0;const d=async()=>{sends++;return "accepted" as const;};
 const pin=await providerIdentity(x.env);
 await assert.rejects(()=>providerIdentity({...x.env,CF_VERSION_METADATA:undefined}),/provider_deployment_unavailable/);
 const base={invocation_id:invocation,binding_generation:1,session_url:"https://safe.trycloudflare.com/",...pin};
 await assert.rejects(()=>sendTextAction(x.env,{...base,deployment_id:"44444444-4444-4444-8444-444444444444"},d,async()=>{}),/deployment_identity_mismatch/);
 await assert.rejects(()=>sendTextAction(x.env,{...base,contract_digest:"0".repeat(64)},d,async()=>{}),/contract_identity_mismatch/);
 assert.equal(sends,0);
 assert.equal(x.sql.prepare("SELECT count(*) AS n FROM weixin_send_receipts").get()!.n,0);
});

test("download completion notification is fixed-text, version-pinned and at-most-once",async()=>{
 const {sendDownloadCompleteAction,providerIdentity,DOWNLOAD_COMPLETED_TEXT}=await import("../src/provider.ts");
 const x=fixture();await x.ready();let sends=0;let text="";
 const dispatch=async(_session:unknown,body:string)=>{
  sends++;text=body;return "accepted" as const;
 };
 const pin=await providerIdentity(x.env,'download');
 const req={invocation_id:invocation,binding_generation:1,...pin};
 assert.notEqual(pin.contract_digest,(await providerIdentity(x.env)).contract_digest);
 const first=await sendDownloadCompleteAction(x.env,req,dispatch as never,async()=>{});
 const second=await sendDownloadCompleteAction(x.env,req,dispatch as never,async()=>{});
 assert.equal(first.status,"accepted");assert.equal(second.duplicate,true);
 assert.equal(text,DOWNLOAD_COMPLETED_TEXT);assert.equal(sends,1);
 assert.equal((await readActionReceipt(x.env,{invocation_id:invocation,
  binding_generation:1,input_digest:first.input_digest})).status,"accepted");
 await assert.rejects(()=>sendDownloadCompleteAction(x.env,{
  ...req,invocation_id:crypto.randomUUID(),contract_digest:'0'.repeat(64)
 },dispatch as never,async()=>{}),/contract_identity_mismatch/);
 assert.equal(sends,1);
});
test('generic Owner-only text is validated, version-pinned and sent at most once',async()=>{
 const {sendGenericTextAction,providerIdentity}=await import('../src/provider.ts');
 const x=fixture();await x.ready();let sends=0,actual='';
 const dispatch=async(_session:unknown,body:string)=>{
  sends++;actual=body;return 'accepted' as const;
 };
 const pin=await providerIdentity(x.env,'generic');
 const request={invocation_id:invocation,binding_generation:1,text:'Generic Owner message',...pin};
 assert.notEqual(pin.contract_digest,(await providerIdentity(x.env)).contract_digest);
 const first=await sendGenericTextAction(x.env,request,dispatch as never,async()=>{});
 const second=await sendGenericTextAction(x.env,request,dispatch as never,async()=>{});
 assert.equal(first.status,'accepted');assert.equal(second.duplicate,true);
 assert.equal(sends,1);assert.equal(actual,request.text);
 await assert.rejects(()=>sendGenericTextAction(x.env,{...request,text:'changed'},
   dispatch as never,async()=>{}),/invocation_identity_conflict/);
 for(const body of ['', '  ', '🍀'.repeat(1025)])
  await assert.rejects(()=>sendGenericTextAction(x.env,{...request,invocation_id:crypto.randomUUID(),text:body},
    dispatch as never,async()=>{}),/invalid_text/);
 assert.equal(sends,1);
});
