import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyMaintenanceSelection,verifyMaintenanceQuiescence,verifyOriginalReceipts,
 verifyConsumerBinding,verifyNewVersion,readOnlyMaintenancePreflight
} from './actions-protected-upgrade.mjs';
import {REQUIRED_KEYS} from './actions-release-guard.mjs';
import {NATIVE_STATES} from './actions-protected-release.mjs';
const before='33333333-3333-4333-8333-333333333333';
const after='44444444-4444-4444-8444-444444444444';
const wf='a4a477cd-6339-478c-ab7c-f7d87bb0d772',wx='051c3b6d-e3bc-4d69-907f-37e8ab00618f';
const env={ACTIONS_MAINTENANCE_OPERATION:'upgrade',ACTIONS_MAINTENANCE_APPROVED:'true',
 ACTIONS_MAINTENANCE_QUIESCED:'true',ACTIONS_EXPECTED_PROVIDER_VERSION:before,
 ACTIONS_EXPECTED_RECEIPTS:'19',ACTIONS_ROLLBACK_TARGET_VERSION:'',
 CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'fixture'};
const query=rows=>[{success:true,results:[rows]}];
const quiesced={state:'frozen',active_workflows:0,unsettled_runs:0};
const c={name:'ACTIONS',type:'service',service:'cloudflare-actions',entrypoint:'ActionsEntrypoint'};
const worker={bindings:[{name:'DB',type:'d1',id:wx},
 {name:'ADMIN_HOST',type:'plain_text',text:'weixin.lirtual.dpdns.org'},
 {name:'CF_VERSION_METADATA',type:'version_metadata'},
 ...REQUIRED_KEYS.map(name=>({name,type:'secret_text'}))]};
const routes=[{hostname:'weixin.lirtual.dpdns.org',id:'domain-id',
 service:'cloudflare-actions',zone_id:'36c4f02ddad481e5245b5f31a91f7222',
 enabled:true,environment:'production'}];
function fixture(overrides={}){
 const calls=[];
 const fetcher=async(url,options)=>{
  const p=new URL(url).pathname,sql=options.body?JSON.parse(options.body).sql:'';
  calls.push({path:p,method:options.method||'GET',sql});
  let result;
  if(p.endsWith('/cloudflare-actions/deployments'))result={deployments:[{versions:[{version_id:before,percentage:100}]}]};
  else if(p.endsWith('/cloudflare-actions/settings'))result=worker;
  else if(p.endsWith('/cloudflare-actions/secrets'))result=REQUIRED_KEYS.map(name=>({name}));
  else if(p.endsWith('/workflow-mcp-worker/settings'))result={bindings:[c]};
  else if(p.endsWith('/workers/domains'))result=routes;
  else if(p.includes('/d1/database/'+wf+'/'))result=query(quiesced);
  else if(p.includes('/d1/database/'+wx+'/'))result=query({receipts:19});
  else if(p.includes('/workflows/'))result=[];
  else throw Error('unexpected test URL '+p);
  // Result wrappers for the native inventory differ from simple Cloudflare API responses.
  const body=p.includes('/workflows/')?{
   success:true,result:[],result_info:{count:0}
  }:{success:true,result};
  const changed=overrides[p]??body;
  return {ok:true,json:async()=>changed};
 };
 return {fetcher,calls};
}
test('operation selection always requires separate explicit approval, precise version and receipt baseline',()=>{
 assert.equal(verifyMaintenanceSelection(env).operation,'upgrade');
 assert.equal(verifyMaintenanceSelection({...env,ACTIONS_MAINTENANCE_OPERATION:'rollback',
  ACTIONS_ROLLBACK_TARGET_VERSION:after}).target,after);
 for(const patch of [
  {ACTIONS_MAINTENANCE_APPROVED:'false'},
  {ACTIONS_MAINTENANCE_QUIESCED:'false'},
  {ACTIONS_MAINTENANCE_OPERATION:'first'},
  {ACTIONS_EXPECTED_PROVIDER_VERSION:'bad'},
  {ACTIONS_EXPECTED_RECEIPTS:'19.5'},
  {ACTIONS_EXPECTED_RECEIPTS:'-1'},
  {ACTIONS_EXPECTED_RECEIPTS:'1'.repeat(20)},
  {ACTIONS_ROLLBACK_TARGET_VERSION:after},
  {ACTIONS_MAINTENANCE_OPERATION:'rollback',ACTIONS_ROLLBACK_TARGET_VERSION:before},
  {ACTIONS_MAINTENANCE_OPERATION:'rollback',ACTIONS_ROLLBACK_TARGET_VERSION:'bad'}
 ])assert.throws(()=>verifyMaintenanceSelection({...env,...patch}),/blocked/);
});
test('maintenance requires frozen gate and no active business workflows or unsettled Runs',()=>{
 assert.equal(verifyMaintenanceQuiescence(query(quiesced)),true);
 for(const patch of [{state:'open'},{active_workflows:1},{unsettled_runs:1},
  {active_workflows:null},{unsettled_runs:null}])
  assert.throws(()=>verifyMaintenanceQuiescence(query({...quiesced,...patch})),/blocked/);
 for(const item of [[],[{success:true,results:[]}],[{success:false,results:[quiesced]}]])
  assert.throws(()=>verifyMaintenanceQuiescence(item),/blocked/);
});
test('original receipts, private Consumer binding and fresh version are exact',()=>{
 assert.equal(verifyOriginalReceipts(query({receipts:19}),19),true);
 assert.throws(()=>verifyOriginalReceipts(query({receipts:20}),19),/blocked/);
 assert.throws(()=>verifyOriginalReceipts(query({receipts:18}),19),/blocked/);
 assert.equal(verifyConsumerBinding({bindings:[c]}),true);
 for(const bindings of [[c,c],[],[{...c,entrypoint:'wrong'}],[c,{name:'WEIXIN_ACTION_PROVIDER',type:'service'}]])
  assert.throws(()=>verifyConsumerBinding({bindings}),/blocked/);
 assert.equal(verifyNewVersion(before,after),true);
 assert.throws(()=>verifyNewVersion(before,before),/blocked/);
 assert.throws(()=>verifyNewVersion('bad',after),/blocked/);
});
test('actual protected preflight is read-only, checks owner route and all six native instance states',async()=>{
 const {fetcher,calls}=fixture();
 assert.equal(await readOnlyMaintenancePreflight(env,fetcher),before);
 assert.equal(calls.filter(x=>x.path.includes('/workflows/')).length,NATIVE_STATES.length);
 assert.ok(calls.every(x=>x.method==='GET'||x.method==='POST'&&/^SELECT\s/i.test(x.sql)));
 assert.ok(calls.some(x=>x.path.includes('/d1/database/'+wf+'/')&&x.sql.includes('active_workflows')));
 assert.ok(calls.some(x=>x.path.includes('/d1/database/'+wx+'/')&&x.sql.includes('receipts')));
 assert.ok(calls.some(x=>x.path.endsWith('/workers/domains')));
 let called=0;
 await assert.rejects(()=>readOnlyMaintenancePreflight({...env,ACTIONS_MAINTENANCE_APPROVED:'false'},
  async()=>{called++;}),/blocked/);
 assert.equal(called,0);
});
test('preflight rejects active workflows, incomplete native inventory, missing secrets and Consumer drift',async()=>{
 const root='/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID;
 const invalid=[
  {[root+'/d1/database/'+wf+'/query']:{success:true,result:query({...quiesced,active_workflows:1})}},
  {[root+'/d1/database/'+wf+'/query']:{success:true,result:query({...quiesced,unsettled_runs:1})}},
  {[root+'/d1/database/'+wx+'/query']:{success:true,result:query({receipts:20})}},
  {[root+'/workers/scripts/cloudflare-actions/secrets']:{success:true,result:[]}},
  {[root+'/workers/scripts/workflow-mcp-worker/settings']:{success:true,result:{bindings:[]}}},
  {[root+'/workers/domains']:{success:true,result:[{...routes[0],service:'weixin-mcp-worker'}]}},
  {[root+'/workflows/workflow-mcp-orchestrator/instances']:{success:true,result:[{id:'active'}],result_info:{count:1}}}
 ];
 for(const change of invalid){
  const {fetcher}=fixture(change);
  await assert.rejects(()=>readOnlyMaintenancePreflight(env,fetcher),/blocked/);
 }
});
test('same existing GitHub Actions publisher owns first cutover, maintenance and domain handoff',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/release-actions.yml',import.meta.url),'utf8');
 for(const required of ['inputs.maintenance_approved == true','inputs.deploy_to_production == false',
  "github.actor == 'lirtual'","github.ref == 'refs/heads/main'",
  'actions-protected-upgrade.mjs preflight','actions-protected-upgrade.mjs verify-new',
  'pnpm exec wrangler deploy --keep-vars','pnpm exec wrangler rollback',
  'node scripts/actions-release-guard.mjs readback',
  'cancel-in-progress: false','group: cloudflare-actions-production'])
  assert.ok(workflow.includes(required),required);
 assert.ok(!workflow.includes('secrets.WEIXIN_ENCRYPTION_KEY'));
 assert.ok(!workflow.includes('wrangler d1 execute'));
 assert.ok(!workflow.includes('wrangler secret put'));
 assert.ok(!workflow.includes('wrangler deploy --secrets-file "$secret_file" --keep-vars'));
});
