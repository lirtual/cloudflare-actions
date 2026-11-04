import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyMaintenanceSelection,verifyMaintenanceQuiescence,
 verifyConsumerBinding,verifyNativeEmpty,NATIVE_STATES,verifyNewVersion,readOnlyMaintenancePreflight
} from './actions-protected-upgrade.mjs';
const provider='33333333-3333-4333-8333-333333333333',consumer='55555555-5555-4555-8555-555555555555',target='44444444-4444-4444-8444-444444444444';
const WF='a4a477cd-6339-478c-ab7c-f7d87bb0d772';
const env={ACTIONS_MAINTENANCE_OPERATION:'upgrade',ACTIONS_MAINTENANCE_APPROVED:'true',
 ACTIONS_MAINTENANCE_QUIESCED:'true',ACTIONS_EXPECTED_PROVIDER_VERSION:provider,
 ACTIONS_EXPECTED_CONSUMER_VERSION:consumer,ACTIONS_ROLLBACK_TARGET_VERSION:'',
 CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),
 CLOUDFLARE_API_TOKEN:'fake'};
const row=x=>[{success:true,results:[x]}];
const service={name:'ACTIONS',type:'service',service:'cloudflare-actions',entrypoint:'ActionsEntrypoint'};
const pin={name:'ACTIONS_DEPLOYMENT_ID',type:'plain_text',text:provider};
const bindings=[service,pin];
const ps={bindings:[{name:'CF_VERSION_METADATA',type:'version_metadata'},
 {name:'BARK_DEVICE_KEY',type:'secret_text'},{name:'BARK_ENCRYPTION_KEY',type:'secret_text'}]};
const secrets=[{name:'BARK_DEVICE_KEY'},{name:'BARK_ENCRYPTION_KEY'}];
function fixture(changes={}){
 const calls=[];
 const fetcher=async(url,opt)=>{
  const path=new URL(url).pathname,sql=opt.body?JSON.parse(opt.body).sql:'';
  calls.push({path,method:opt.method||'GET',sql});
  let result;
  if(path.endsWith('/cloudflare-actions/deployments'))result={deployments:[{versions:[{version_id:provider,percentage:100}]}]};
  else if(path.endsWith('/cloudflare-actions/settings'))result=ps;
  else if(path.endsWith('/cloudflare-actions/secrets'))result=secrets;
  else if(path.endsWith('/workflow-mcp-worker/settings'))result={bindings};
  else if(path.endsWith('/workflow-mcp-worker/deployments'))result={deployments:[{versions:[{version_id:consumer,percentage:100}]}]};
  else if(path.includes('/d1/database/'+WF+'/'))result=row({state:'frozen',active_workflows:0,unsettled_runs:0});
  else if(path.includes('/workflows/'))result=[];
  else throw Error('unexpected Cloudflare API fixture route '+path);
  const v=path.includes('/workflows/')?{success:true,result:[],result_info:{count:0}}:{success:true,result};
  return {ok:true,json:async()=>changes[path]??v};
 };
 return {fetcher,calls};
}
test('Owner approval, exact versions and frozen transition mandatory; rollback denied before Cloudflare requests',()=>{
 assert.equal(verifyMaintenanceSelection(env).operation,'upgrade');
 for(const patch of [{ACTIONS_MAINTENANCE_APPROVED:'false'},
  {ACTIONS_MAINTENANCE_QUIESCED:'false'},
  {ACTIONS_EXPECTED_CONSUMER_VERSION:'bad'},
  {ACTIONS_EXPECTED_PROVIDER_VERSION:'bad'},
  {ACTIONS_ROLLBACK_TARGET_VERSION:target},
  {ACTIONS_MAINTENANCE_OPERATION:'rollback',ACTIONS_ROLLBACK_TARGET_VERSION:target},
  {ACTIONS_MAINTENANCE_OPERATION:'rollback'}]){
  assert.throws(()=>verifyMaintenanceSelection({...env,...patch}),/blocked/);
 }
 assert.equal(verifyNewVersion(provider,target),true);
 assert.throws(()=>verifyNewVersion(provider,provider),/blocked/);
});
test('trusted Consumer binding, frozen Run count and each Native state fail closed',()=>{
 assert.equal(verifyMaintenanceQuiescence(row({state:'frozen',active_workflows:0,unsettled_runs:0})),true);
 assert.equal(verifyConsumerBinding({bindings}),true);
 assert.equal(verifyConsumerBinding({bindings:[service]}),true);
 assert.equal(verifyConsumerBinding({bindings:[service,{...pin,text:target}]}),true);
 for(const s of NATIVE_STATES){
  assert.equal(verifyNativeEmpty(s,{success:true,result:[],result_info:{count:0}}),true);
  assert.throws(()=>verifyNativeEmpty(s,{success:true,result:[{}],result_info:{count:1}}),/blocked/);
  assert.throws(()=>verifyNativeEmpty(s,{success:true,result:[],result_info:{count:0,cursor:'next'}}),/blocked/);
 }
 for(const b of [[pin],[service,{...pin,text:'latest'}],[service,pin,pin],
  [...bindings,{name:'OTHER',type:'service'}]])
  assert.throws(()=>verifyConsumerBinding({bindings:b}),/blocked/);
 for(const q of [{state:'open',active_workflows:0,unsettled_runs:0},
  {state:'frozen',active_workflows:1,unsettled_runs:0},
  {state:'frozen',active_workflows:0,unsettled_runs:1}])
  assert.throws(()=>verifyMaintenanceQuiescence(row(q)),/blocked/);
});
test('existing maintenance preflight is entirely read-only and binds actual live Consumer',async()=>{
 const {fetcher,calls}=fixture();
 assert.equal(await readOnlyMaintenancePreflight(env,fetcher),provider);
 assert.equal(calls.filter(c=>c.path.includes('/workflows/')).length,6);
 assert.ok(!calls.some(c=>c.path.includes('/d1/database/051c3b6d-e3bc-4d69-907f-37e8ab00618f')));
 assert.ok(calls.every(c=>c.method==='GET'||c.method==='POST'&&/^SELECT\s/.test(c.sql)));
 let callsOnRollback=0;
 await assert.rejects(()=>readOnlyMaintenancePreflight({...env,ACTIONS_MAINTENANCE_OPERATION:'rollback'},async()=>{callsOnRollback++}),/blocked/);
 assert.equal(callsOnRollback,0);
 const root='/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID;
 for(const change of [
  {[root+'/workers/scripts/workflow-mcp-worker/settings']:{success:true,result:{bindings:[{...service,entrypoint:'Invalid'}]}}},
  {[root+'/workers/scripts/workflow-mcp-worker/deployments']:{success:true,result:{deployments:[]}}},
  {[root+'/d1/database/'+WF+'/query']:{success:true,result:row({state:'open',active_workflows:0,unsettled_runs:0})}},
  {[root+'/workflows/workflow-mcp-orchestrator/instances']:{success:true,result:[{}],result_info:{count:1}}}
 ])await assert.rejects(()=>readOnlyMaintenancePreflight(env,fixture(change).fetcher),/blocked/);
});
test('one original maintenance publisher and no legacy Owner/Weixin rollback commands',()=>{
 const y=readFileSync(new URL('../.github/workflows/release-actions.yml',import.meta.url),'utf8');
 for(const s of ['inputs.maintenance_approved == true',"github.actor == 'lirtual'",
  "github.ref == 'refs/heads/main'",'actions-protected-upgrade.mjs preflight',
  'actions-protected-upgrade.mjs postflight','pnpm exec wrangler deploy --keep-vars',
  'cancel-in-progress: false','group: cloudflare-actions-production'])
  assert.ok(y.includes(s),s);
 for(const banned of ['retire-version','retire-secret','WEIXIN_ENCRYPTION_KEY','expected_receipts',
  'wrangler rollback ','actions-owner-domain-handoff.mjs',
  'actions-protected-release.mjs','wrangler secret put','wrangler d1 execute'])
  assert.ok(!y.includes(banned),banned);
});
