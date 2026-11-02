import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyActionsSource,verifyActionsPreflight,inspectActionsDeployment,REQUIRED_KEYS} from './actions-release-guard.mjs';
const cfg=JSON.parse(readFileSync(new URL('../apps/actions-worker/wrangler.jsonc',import.meta.url)));
const version='33333333-3333-4333-8333-333333333333';
const deployments={deployments:[{versions:[{version_id:version,percentage:100}]}]};
const bindings=[{name:'CF_VERSION_METADATA',type:'version_metadata'},
 ...REQUIRED_KEYS.map(name=>({name,type:'secret_text'}))];
const secrets=REQUIRED_KEYS.map(name=>({name}));
test('Bark-only source excludes Weixin Owner configs and future services',()=>{
 assert.equal(verifyActionsSource(cfg),true);
 assert.deepEqual(REQUIRED_KEYS,['BARK_DEVICE_KEY','BARK_ENCRYPTION_KEY']);
 assert.equal(cfg.d1_databases,undefined);
 assert.equal(cfg.vars,undefined);
 for(const p of [
  {secrets:{required:[...REQUIRED_KEYS,'WEIXIN_ENCRYPTION_KEY']}},
  {d1_databases:[{binding:'DB'}]},
  {vars:{ADMIN_HOST:'weixin.lirtual.dpdns.org'}},
  {routes:[{pattern:'example.net'}]},
  {workers_dev:true},{services:[{binding:'OLD'}]},{preview_urls:true},
  {secrets:{required:['BARK_DEVICE_KEY']}}]){
  assert.throws(()=>verifyActionsSource({...cfg,...p}),/blocked/);
 }
});
test('exact live Provider version and Bark bindings, while physical legacy secret still awaits T7',()=>{
 assert.equal(verifyActionsPreflight({activeVersions:deployments,settings:{bindings},secrets}),version);
 const legacy={name:'WEIXIN_ENCRYPTION_KEY',type:'secret_text'};
 assert.equal(verifyActionsPreflight({activeVersions:deployments,
  settings:{bindings:[...bindings,legacy]},secrets:[...secrets,{name:legacy.name}]}),version);
 for(const b of [bindings.slice(1),[...bindings,{name:'MCP_ACCESS_TOKEN',type:'secret_text'}],
  [...bindings,{name:'ACTIONS',type:'service'}],bindings.filter(x=>x.name!=='BARK_DEVICE_KEY')]){
  assert.throws(()=>verifyActionsPreflight({activeVersions:deployments,settings:{bindings:b},secrets}),/blocked/);
 }
 for(const items of [[],[{version_id:version,percentage:50}],
  [{version_id:version,percentage:100},{version_id:version,percentage:0}]]){
  assert.throws(()=>verifyActionsPreflight({
   activeVersions:{deployments:[{versions:items}]},settings:{bindings},secrets}),/blocked/);
 }
});
test('Cloudflare Provider audit reads only GET, never secret values',async()=>{
 let calls=0;
 const fake=async(url,init)=>{
  calls++;assert.equal(init.method,undefined);assert.equal(init.redirect,'manual');
  const result=url.endsWith('/settings')?{bindings}:url.endsWith('/secrets')?secrets:deployments;
  return {ok:true,json:async()=>({success:true,result})};
 };
 const env={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'fake'};
 assert.equal(await inspectActionsDeployment(env,version,fake),version);
 assert.equal(calls,3);
 await assert.rejects(()=>inspectActionsDeployment(env,'44444444-4444-4444-8444-444444444444',fake),/drift/);
 await assert.rejects(()=>inspectActionsDeployment({},version,fake),/blocked/);
});
