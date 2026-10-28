import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {encrypt} from "../src/crypto.ts";
import {bindingIdentity,readActionReceipt,sendTextAction} from "../src/provider.ts";
import type {Env} from "../src/types.ts";
const invocation="62f76e7a-c614-47b0-bf13-50d85f9de992";
function fixture(){
 const sql=new DatabaseSync(":memory:");sql.exec(readFileSync(new URL("../migrations/0001_owner.sql",import.meta.url),"utf8"));
 const db={prepare(query:string){const stmt=sql.prepare(query);const call=(args:unknown[])=>({first:async<T>()=>(stmt.get(...args as [])??null) as T|null,run:async()=>({meta:{changes:Number(stmt.run(...args as []).changes)}})});return {...call([]),bind:(...args:unknown[])=>call(args)};}};
 const env={DB:db as unknown as D1Database,WEIXIN_ENCRYPTION_KEY:Buffer.alloc(32,17).toString("base64")} as Env;
 return {sql,env,async ready(generation=1){const session={botToken:"token",ownerId:"owner",botId:"bot",contextToken:"context",cursor:"cursor"};const v=await encrypt(env,"weixin:owner:binding:"+generation,session);sql.prepare("UPDATE weixin_binding SET generation=?,state=\u0027ready\u0027,session_ciphertext=?,session_key_id=? WHERE id=1").run(generation,v.ciphertext,v.keyId);}};
}
test("one reviewed action invocation is sent at most once; receipt stays queryable after unbind",async()=>{
 const x=fixture();await x.ready();const identity=await bindingIdentity(x.env);assert.deepEqual(identity,{generation:1,ready:true});
 const req={invocation_id:invocation,binding_generation:1,session_url:"https://safe.trycloudflare.com/"};let sends=0;
 const dispatch=async()=>{sends++;return "accepted" as const;};
 const first=await sendTextAction(x.env,req,dispatch,async()=>{});assert.equal(first.status,"accepted");assert.equal(first.duplicate,false);
 const repeat=await sendTextAction(x.env,req,dispatch,async()=>{});assert.equal(repeat.status,"accepted");assert.equal(repeat.duplicate,true);assert.equal(sends,1);
 x.sql.prepare("UPDATE weixin_binding SET generation=2,state=\u0027unbound\u0027,session_ciphertext=NULL,session_key_id=NULL WHERE id=1").run();
 assert.deepEqual((await readActionReceipt(x.env,{invocation_id:invocation,binding_generation:1,input_digest:first.input_digest})).status,"accepted");
});
test("wrong binding, URL or input identity cannot dispatch",async()=>{
 const x=fixture();await x.ready();let sends=0;const d=async()=>{sends++;return "accepted" as const;};
 await assert.rejects(()=>sendTextAction(x.env,{invocation_id:invocation,binding_generation:2,session_url:"https://safe.trycloudflare.com/"},d,async()=>{}),/binding_generation_changed/);
 await assert.rejects(()=>sendTextAction(x.env,{invocation_id:invocation,binding_generation:1,session_url:"http://127.0.0.1/x"},d,async()=>{}),/invalid_trusted_url/);
 assert.equal(sends,0);
});

test("generation changed during pre-send sync cannot reroute the invocation",async()=>{
 const x=fixture();await x.ready(1);let dispatches=0;
 const dispatch=async()=>{dispatches++;return "accepted" as const;};
 const synchronize=async()=>{await x.ready(2);};
 await assert.rejects(()=>sendTextAction(x.env,{invocation_id:invocation,binding_generation:1,
  session_url:"https://safe.trycloudflare.com/"},dispatch,synchronize),/binding_generation_changed/);
 assert.equal(dispatches,0);
 assert.equal(x.sql.prepare("SELECT count(*) AS n FROM weixin_send_receipts").get()?.n,0);
});
