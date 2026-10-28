import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {Miniflare,convertV4MiniflareOptions} from "miniflare";
const script=readFileSync(fileURLToPath(new URL("../.build/weixin/index.js",import.meta.url)),"utf8");
const migration=readFileSync(new URL("../migrations/0001_owner.sql",import.meta.url),"utf8");
const id="58e6bffd-258d-46b6-b1f3-a4148fe5d4e5";
const version="33333333-3333-4333-8333-333333333333";
const reviewedDigest="b378720974a0b76343359f621ac5da269099725ce6babd471ca33a4eb7919603";
test("real Service Binding RPC is independent of public MCP and queries historical receipts read-only",async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({port:0,workers:[
  {name:"weixin-provider",modules:true,script,compatibilityDate:"2026-09-15",d1Databases:{DB:"provider-test"},bindings:{
    ADMIN_HOST:"weixin-owner.example.org",
    WEIXIN_ENCRYPTION_KEY:Buffer.alloc(32,17).toString("base64"),CF_VERSION_METADATA:{id:version},
    ACCESS_TEAM_DOMAIN:"owner.cloudflareaccess.com",ACCESS_AUD:"owner-aud",
    OWNER_EMAIL:"owner@example.org"}},
  {name:"caller",modules:true,script:`export default {async fetch(request,env){const mode=new URL(request.url).searchParams.get("mode");if(mode==="get")return Response.json(await env.WEIXIN.getBinding());if(mode==="contract")return Response.json(await env.WEIXIN.getContract());return Response.json(await env.WEIXIN.getReceipt({invocation_id:"${id}",binding_generation:1,input_digest:"${"f".repeat(64)}"}));}};`,compatibilityDate:"2026-09-15",serviceBindings:{WEIXIN:"weixin-provider"}},
 ]}));
 try{
  const db=await mf.getD1Database("DB");
  await db.batch(migration.split(String.fromCharCode(10)).filter(line=>!line.trim().startsWith("--")).join(String.fromCharCode(10)).split(";").map(x=>x.trim()).filter(Boolean).map(x=>db.prepare(x)));
  assert.deepEqual(await (await mf.getWorker("caller")).fetch("https://caller.invalid/?mode=get").then(x=>x.json()),{generation:0,ready:false});
  const contract=await (await mf.getWorker("caller")).fetch("https://caller.invalid/?mode=contract").then(x=>x.json());
  assert.deepEqual(contract,{deployment_id:version,contract_digest:reviewedDigest});
  await db.prepare("INSERT INTO weixin_send_receipts(generation,request_id,text_digest,status,created_at,updated_at) VALUES(1,?,? ,\u0027unknown\u0027,1,1)").bind(id,"f".repeat(64)).run();
  assert.equal((await (await mf.getWorker("caller")).fetch("https://caller.invalid/").then(x=>x.json())).status,"unknown");
  const publicDenied=await mf.dispatchFetch("https://weixin-mcp.example.org/mcp");
  assert.equal(publicDenied.status,404);
  const adminDenied=await mf.dispatchFetch("https://weixin-owner.example.org/setup");
  assert.equal(adminDenied.status,403);
 }finally{await mf.dispose();}
});
