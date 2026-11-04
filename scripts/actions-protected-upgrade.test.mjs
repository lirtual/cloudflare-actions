import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyMaintenanceSelection,verifyAdmissionState,verifyConsumerBinding,
 verifyNativeEmpty,NATIVE_STATES,verifyBarkOnlyVersion,verifyPriorDeployment,
 verifyNewVersion,readOnlyMaintenancePreflight} from './actions-protected-upgrade.mjs';

const provider='33333333-3333-4333-8333-333333333333';
const consumer='55555555-5555-4555-8555-555555555555';
const target='44444444-4444-4444-8444-444444444444';
const WF='a4a477cd-6339-478c-ab7c-f7d87bb0d772';
const env={ACTIONS_MAINTENANCE_OPERATION:'upgrade',ACTIONS_MAINTENANCE_APPROVED:'true',
 ACTIONS_MAINTENANCE_QUIESCED:'true',ACTIONS_COMPATIBILITY_REVIEWED:'false',
 ACTIONS_EXPECTED_PROVIDER_VERSION:provider,ACTIONS_EXPECTED_CONSUMER_VERSION:consumer,
 ACTIONS_ROLLBACK_TARGET_VERSION:'',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'fake'};
const compatible={...env,ACTIONS_MAINTENANCE_OPERATION:'compatible-upgrade',
 ACTIONS_MAINTENANCE_QUIESCED:'false',ACTIONS_COMPATIBILITY_REVIEWED:'true'};
const rollback={...env,ACTIONS_MAINTENANCE_OPERATION:'rollback',ACTIONS_ROLLBACK_TARGET_VERSION:target};
const row=x=>[{success:true,results:[x]}];
const service={name:'ACTIONS',type:'service',service:'cloudflare-actions',entrypoint:'ActionsEntrypoint'};
const pin={name:'ACTIONS_DEPLOYMENT_ID',type:'plain_text',text:provider};
const bindings=[service];
const versionBindings=[
 {name:'BARK_DEVICE_KEY',type:'secret_text'},{name:'BARK_ENCRYPTION_KEY',type:'secret_text'},
 {name:'CF_VERSION_METADATA',type:'version_metadata'},
 {name:'ACCESS_AUD',type:'plain_text'},{name:'ACCESS_TEAM_DOMAIN',type:'plain_text'},
 {name:'ADMIN_HOST',type:'plain_text'},{name:'OWNER_EMAIL',type:'plain_text'}];
const version=id=>({id,main_module:'index.js',bindings:versionBindings});
const ps={bindings:versionBindings};
const secrets=[{name:'BARK_DEVICE_KEY'},{name:'BARK_ENCRYPTION_KEY'}];
const deployed=(first,second)=>({deployments:[{versions:[{version_id:first,percentage:100}]},
 {versions:[{version_id:second,percentage:100}]}]});
function fixture({operation='upgrade',live=provider,changes={}}={}){
 const calls=[];
 const fetcher=async(url,opt={})=>{
  const u=new URL(url),path=u.pathname,sql=opt.body?JSON.parse(opt.body).sql:'';
  calls.push({path,method:opt.method||'GET',sql,perPage:u.searchParams.get('per_page')});
  let result;
  if(path.endsWith('/cloudflare-actions/deployments'))
   result=u.searchParams.get('per_page')==='2'?deployed(live,live===provider?target:provider):
    {deployments:[{versions:[{version_id:live,percentage:100}]}]};
  else if(path.endsWith('/cloudflare-actions/settings'))result=ps;
  else if(path.endsWith('/cloudflare-actions/secrets'))result=secrets;
  else if(path.endsWith('/workflow-mcp-worker/settings'))result={bindings};
  else if(path.endsWith('/workflow-mcp-worker/deployments'))
   result={deployments:[{versions:[{version_id:consumer,percentage:100}]}]};
  else if(path.endsWith('/workers/cloudflare-actions/versions/'+provider))result=version(provider);
  else if(path.endsWith('/workers/cloudflare-actions/versions/'+target))result=version(target);
  else if(path.includes('/d1/database/'+WF+'/'))
   result=row(operation==='compatible-upgrade'
    ?{state:'open',active_workflows:6,unsettled_runs:0}
    :{state:'frozen',active_workflows:0,unsettled_runs:0});
  else if(path.includes('/workflows/'))result=[];
  else throw Error('unexpected Cloudflare API fixture route '+path);
  const v=path.includes('/workflows/')?{success:true,result:[],result_info:{count:0}}:
   {success:true,result};
  return {ok:true,json:async()=>changes[path]??v};
 };
 return {fetcher,calls};
}

test('explicit reviewed operation and exact version authorization fail closed',()=>{
 for(const [e,operation] of [[env,'upgrade'],[compatible,'compatible-upgrade'],[rollback,'rollback']])
  assert.equal(verifyMaintenanceSelection(e).operation,operation);
 const invalid=[
  [env,{ACTIONS_MAINTENANCE_APPROVED:'false'}],
  [env,{ACTIONS_MAINTENANCE_OPERATION:'other'}],
  [env,{ACTIONS_MAINTENANCE_QUIESCED:'false'}],
  [env,{ACTIONS_COMPATIBILITY_REVIEWED:'true'}],
  [env,{ACTIONS_EXPECTED_CONSUMER_VERSION:'bad'}],
  [env,{ACTIONS_EXPECTED_PROVIDER_VERSION:'bad'}],
  [env,{ACTIONS_ROLLBACK_TARGET_VERSION:target}],
  [compatible,{ACTIONS_COMPATIBILITY_REVIEWED:'false'}],
  [compatible,{ACTIONS_MAINTENANCE_QUIESCED:'true'}],
  [compatible,{ACTIONS_ROLLBACK_TARGET_VERSION:target}],
  [rollback,{ACTIONS_MAINTENANCE_QUIESCED:'false'}],
  [rollback,{ACTIONS_ROLLBACK_TARGET_VERSION:provider}],
  [rollback,{ACTIONS_ROLLBACK_TARGET_VERSION:''}],
  [rollback,{ACTIONS_COMPATIBILITY_REVIEWED:'true'}],
 ];
 for(const [base,patch] of invalid)assert.throws(()=>verifyMaintenanceSelection({...base,...patch}),/blocked/);
 assert.equal(verifyNewVersion(provider,target),true);
 assert.throws(()=>verifyNewVersion(provider,provider),/blocked/);
});

test('compatible path accepts open Gate but frozen operations require full Drain',()=>{
 assert.equal(verifyAdmissionState(row({state:'open',active_workflows:6,unsettled_runs:2}),'compatible-upgrade'),true);
 assert.equal(verifyAdmissionState(row({state:'frozen',active_workflows:0,unsettled_runs:0}),'upgrade'),true);
 for(const input of [{state:'frozen',active_workflows:0,unsettled_runs:0},
  {state:'open',active_workflows:0,unsettled_runs:0},
  {state:'open',active_workflows:-1,unsettled_runs:0}])
  assert.throws(()=>verifyAdmissionState(row(input),input.state==='frozen'?'compatible-upgrade':'rollback'),/blocked/);
 assert.throws(()=>verifyAdmissionState(row({state:'frozen',active_workflows:1,unsettled_runs:0}),'rollback'),/blocked/);
 for(const s of NATIVE_STATES){
  assert.equal(verifyNativeEmpty(s,{success:true,result:[],result_info:{count:0}}),true);
  assert.throws(()=>verifyNativeEmpty(s,{success:true,result:[{}],result_info:{count:1}}),/blocked/);
  assert.throws(()=>verifyNativeEmpty(s,{success:true,result:[],result_info:{count:0,cursor:'next'}}),/blocked/);
 }
});

test('Provider/Consumer trust and Bark-only retained-version constraints',()=>{
 assert.equal(verifyConsumerBinding({bindings}),true);
 for(const b of [[pin],[service,pin],[service,{...pin,name:'BARK_ACTION_DEPLOYMENT_ID'}],
  [service,{...pin,name:'WEIXIN_ACTION_DEPLOYMENT_ID'}],
  [{...service,entrypoint:'Evil'}],[...bindings,{name:'OTHER',type:'service'}]])
  assert.throws(()=>verifyConsumerBinding({bindings:b}),/blocked/);
 assert.equal(verifyBarkOnlyVersion(version(provider),provider),true);
 const broken=[
  {...version(provider),main_module:'worker.js'},
  {...version(provider),id:target},
  {...version(provider),bindings:versionBindings.filter(x=>x.name!=='BARK_ENCRYPTION_KEY')},
  {...version(provider),bindings:[...versionBindings,{name:'WEIXIN_ENCRYPTION_KEY',type:'secret_text'}]},
  {...version(provider),bindings:[...versionBindings,versionBindings[0]]},
  {...version(provider),bindings:[...versionBindings,{name:'MCP_ACCESS_TOKEN',type:'secret_text'}]},
  {...version(provider),bindings:versionBindings.map(x=>x.name==='BARK_DEVICE_KEY'?{...x,type:'plain_text'}:x)}];
 for(const v of broken)assert.throws(()=>verifyBarkOnlyVersion(v,provider),/blocked/);
 assert.equal(verifyPriorDeployment(deployed(provider,target),provider,target),true);
 for(const d of [
  deployed(target,provider),deployed(provider,provider),
  {deployments:[{versions:[{version_id:provider,percentage:50}]}]},
  {deployments:[{versions:[{version_id:provider,percentage:100},
   {version_id:target,percentage:0}]},{versions:[{version_id:target,percentage:100}]}]}])
  assert.throws(()=>verifyPriorDeployment(d,provider,target),/blocked/);
});

test('frozen first cutover, compatible no-pause, and exact rollback preflights are read-only',async()=>{
 for(const [e,operation] of [[env,'upgrade'],[compatible,'compatible-upgrade'],[rollback,'rollback']]){
  const {fetcher,calls}=fixture({operation});
  assert.equal(await readOnlyMaintenancePreflight(e,fetcher),provider);
  assert.equal(calls.filter(c=>c.path.includes('/workflows/')).length,
   operation==='compatible-upgrade'?0:6);
  assert.ok(calls.every(c=>c.method==='GET'||c.method==='POST'&&/^SELECT\s/.test(c.sql)));
  assert.ok(calls.some(c=>c.path.endsWith('/versions/'+provider)));
  if(operation==='rollback')assert.ok(calls.some(c=>c.path.endsWith('/versions/'+target)));
 }
});

test('preflight rejects live identity/gate/drain/pin drift and unreviewed rollback candidate',async()=>{
 const root='/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID;
 const changes=[
  {[root+'/workers/scripts/workflow-mcp-worker/settings']:{success:true,result:{bindings:[service,pin]}}},
  {[root+'/workers/scripts/workflow-mcp-worker/settings']:{success:true,result:{bindings:[{...service,entrypoint:'Other'}]}}},
  {[root+'/workers/scripts/workflow-mcp-worker/deployments']:{success:true,result:{deployments:[]}}},
  {[root+'/d1/database/'+WF+'/query']:{success:true,result:row({state:'open',active_workflows:6,unsettled_runs:0})}},
  {[root+'/workflows/workflow-mcp-orchestrator/instances']:{success:true,result:[{}],result_info:{count:1}}},
  {[root+'/workers/workers/cloudflare-actions/versions/'+provider]:{success:true,result:{...version(provider),bindings:[]}}}
 ];
 for(const change of changes)
  await assert.rejects(()=>readOnlyMaintenancePreflight(env,fixture({changes:change}).fetcher),/blocked/);
 const targetPath=root+'/workers/workers/cloudflare-actions/versions/'+target;
 const rollbackChanges=[
  {[root+'/workers/scripts/cloudflare-actions/deployments']:{success:true,result:deployed(provider,provider)}},
  {[targetPath]:{success:true,result:{...version(target),bindings:[{name:'WEIXIN_ENCRYPTION_KEY',type:'secret_text'}]}}}];
 for(const change of rollbackChanges)
  await assert.rejects(()=>readOnlyMaintenancePreflight(rollback,fixture({changes:change}).fetcher),/blocked/);
});

test('rollback postflight verifies exactly the target without rechecking prior deployment order',async()=>{
 const f=fixture({operation:'rollback',live:target});
 assert.equal(await readOnlyMaintenancePreflight(rollback,f.fetcher,target,'after'),target);
 assert.ok(!f.calls.some(c=>c.perPage==='2'));
 const wrong=fixture({operation:'compatible-upgrade'});
 await assert.rejects(()=>readOnlyMaintenancePreflight(compatible,wrong.fetcher,target,'after'),/blocked/);
});

test('protected owner-only main workflow preserves exact versions, one publisher, no Secret or D1 write',()=>{
 const y=readFileSync(new URL('../.github/workflows/release-actions.yml',import.meta.url),'utf8');
 for(const s of ["github.actor == 'lirtual'","github.ref == 'refs/heads/main'",
  'inputs.maintenance_approved == true','inputs.compatibility_reviewed == true',
  'inputs.maintenance_quiesced == true',"inputs.maintenance_operation == 'rollback'",
  'actions-protected-upgrade.mjs preflight','actions-protected-upgrade.mjs postflight',
  'wrangler deploy --keep-vars','wrangler versions deploy',
  'cancel-in-progress: false','group: cloudflare-actions-production',
  'ACTIONS_ROLLBACK_TARGET_VERSION','ACTIONS_EXPECTED_CONSUMER_VERSION'])
  assert.ok(y.includes(s),s);
 for(const banned of ['retire-version','retire-secret','WEIXIN_ENCRYPTION_KEY','expected_receipts',
  'wrangler rollback ','actions-owner-domain-handoff.mjs',
  'actions-protected-release.mjs','wrangler secret put','wrangler d1 execute'])
  assert.ok(!y.includes(banned),banned);
});
