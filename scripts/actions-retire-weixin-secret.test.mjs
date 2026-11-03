import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifySecretSelection,verifyRetiredInventory,verifySecretBindings,
  verifyStagedInventory,secretRetirementStep} from './actions-retire-weixin-secret.mjs';

const old='960ade68-149a-469c-a4fe-2c5e678df49c';
const staged='33333333-3333-4333-8333-333333333333';
const consumer='55555555-5555-4555-8555-555555555555';
const WX='051c3b6d-e3bc-4d69-907f-37e8ab00618f';
const WF='a4a477cd-6339-478c-ab7c-f7d87bb0d772';
const legacy='39c5c470-040b-4ae7-b81a-6c47d04f548f';
const base={ACTIONS_MAINTENANCE_OPERATION:'retire-secret',ACTIONS_SECRET_RETIRE_APPROVED:'true',
 ACTIONS_MAINTENANCE_APPROVED:'true',ACTIONS_MAINTENANCE_QUIESCED:'true',
 ACTIONS_EXPECTED_PROVIDER_VERSION:old,ACTIONS_EXPECTED_CONSUMER_VERSION:consumer,
 ACTIONS_ROLLBACK_TARGET_VERSION:'',ACTIONS_RETIRE_VERSION_ID:'',
 ACTIONS_RETIRE_VERSION_APPROVED:'false',ACTIONS_EXPECTED_RECEIPTS:'20',
 CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'fake'};
const bark=['BARK_DEVICE_KEY','BARK_ENCRYPTION_KEY'];
const bindings=(weixin)=>[
 ...bark.map(name=>({name,type:'secret_text'})),
 {name:'CF_VERSION_METADATA',type:'version_metadata'},
 ...(weixin?[{name:'WEIXIN_ENCRYPTION_KEY',type:'secret_text'}]:[])
];
const service={name:'ACTIONS',type:'service',service:'cloudflare-actions',entrypoint:'ActionsEntrypoint'};
const pin={name:'ACTIONS_DEPLOYMENT_ID',type:'plain_text',text:old};
const row=x=>[{success:true,results:[x]}];
function fixture({inventory=[old],active=old,stageSecret=false}={}){
 const calls=[];
 const fetcher=async(url,opt)=>{
  const path=new URL(url).pathname;
  const sql=opt.body?JSON.parse(opt.body).sql:'';
  calls.push({path,method:opt.method||'GET',sql});
  let result, info;
  if(path.endsWith('/cloudflare-actions/versions')){
   result=inventory.map(id=>({id}));
   info={page:1,per_page:100,count:result.length,total_count:result.length,total_pages:1};
  }else if(path.endsWith('/cloudflare-actions/versions/'+old)){
   result={id:old,bindings:bindings(true)};
  }else if(path.endsWith('/cloudflare-actions/versions/'+staged)){
   result={id:staged,bindings:bindings(stageSecret)};
  }else if(path.endsWith('/cloudflare-actions/deployments')){
   result={deployments:[{versions:[{version_id:active,percentage:100}]}]};
  }else if(path.endsWith('/cloudflare-actions/settings')){
   result={bindings:bindings(active===old)};
  }else if(path.endsWith('/cloudflare-actions/secrets')){
   result=bark.concat(active===old?['WEIXIN_ENCRYPTION_KEY']:[]).map(name=>({name}));
  }else if(path.endsWith('/workflow-mcp-worker/settings')){
   result={bindings:[service,pin]};
  }else if(path.endsWith('/workflow-mcp-worker/deployments')){
   result={deployments:[{versions:[{version_id:consumer,percentage:100}]}]};
  }else if(path.includes('/d1/database/'+WF+'/')){
   result=row({state:'frozen',active_workflows:0,unsettled_runs:0});
  }else if(path.includes('/d1/database/'+WX+'/')){
   result=row({receipts:20});
  }else if(path.includes('/workflows/')){
   result=[];
   info={count:0};
  }else throw Error('unexpected fixture path '+path);
  return {ok:true,json:async()=>({success:true,result,...(info?{result_info:info}:{})})};
 };
 return {fetcher,calls};
}
test('only exact approved Secret retirement after reviewed legacy versions disappear',()=>{
 assert.equal(verifySecretSelection(base),true);
 for(const patch of [
  {ACTIONS_MAINTENANCE_OPERATION:'upgrade'},
  {ACTIONS_SECRET_RETIRE_APPROVED:'false'},
  {ACTIONS_MAINTENANCE_APPROVED:'false'},
  {ACTIONS_MAINTENANCE_QUIESCED:'false'},
  {ACTIONS_EXPECTED_PROVIDER_VERSION:staged},
  {ACTIONS_ROLLBACK_TARGET_VERSION:staged},
  {ACTIONS_RETIRE_VERSION_ID:legacy},
  {ACTIONS_RETIRE_VERSION_APPROVED:'true'}
 ])assert.throws(()=>verifySecretSelection({...base,...patch}),/blocked/);
 assert.equal(verifyRetiredInventory([old]),true);
 for(const x of [[old,legacy],[legacy],[],[old,old],[old,staged]])
   assert.throws(()=>verifyRetiredInventory(x),/blocked/);
 assert.equal(verifyStagedInventory([old],[old,staged]),staged);
 for(const x of [[old],[old,staged,legacy],[old,staged,staged],[staged]])
   assert.throws(()=>verifyStagedInventory([old],x),/blocked/);
});
test('Bark bindings preserved, only legacy Secret removed, no old DB/Owner/service',()=>{
 assert.equal(verifySecretBindings({id:old,bindings:bindings(true)},true),true);
 assert.equal(verifySecretBindings({id:staged,bindings:bindings(false)},false),true);
 for(const b of [bindings(true),bindings(false).filter(x=>x.name!=='BARK_DEVICE_KEY'),
  [...bindings(false),{name:'DB',type:'d1'}],
  [...bindings(false),{name:'ACTIONS',type:'service'}],
  [...bindings(false),{name:'BARK_DEVICE_KEY',type:'secret_text'}],
  [...bindings(false),{name:'WEIXIN_ENCRYPTION_KEY',type:'plain_text'}]])
  assert.throws(()=>verifySecretBindings({id:staged,bindings:b},false),/blocked/);
});
test('one safe offline three-stage protocol; no production fetch writes in mocked tests',async()=>{
 const tmp=mkdtempSync(join(tmpdir(),'t7-secret-'));
 try{
  const e={...base,RUNNER_TEMP:tmp,GITHUB_OUTPUT:join(tmp,'output')};
  writeFileSync(e.GITHUB_OUTPUT,'');
  const first=fixture();
  assert.equal(await secretRetirementStep('preflight',e,first.fetcher),'preflight');
  assert.ok(first.calls.every(x=>x.method==='GET'||x.method==='POST'&&/^SELECT\s/.test(x.sql)));
  const middle=fixture({inventory:[old,staged]});
  assert.equal(await secretRetirementStep('staged',e,middle.fetcher),'staged');
  assert.match(readFileSync(e.GITHUB_OUTPUT,'utf8'),/^new_provider_version=[0-9a-f-]{36}\n$/);
  assert.ok(middle.calls.every(x=>x.method==='GET'||x.method==='POST'&&/^SELECT\s/.test(x.sql)));
  const last=fixture({inventory:[old,staged],active:staged});
  assert.equal(await secretRetirementStep('postflight',e,last.fetcher),'deployed');
  assert.ok(last.calls.every(x=>x.method==='GET'||x.method==='POST'&&/^SELECT\s/.test(x.sql)));
 }finally{rmSync(tmp,{recursive:true,force:true});}
});
test('fail closed on retained legacy Version and failed staged secret removal',async()=>{
 const tmp=mkdtempSync(join(tmpdir(),'t7-secret-stop-'));
 try{
  const e={...base,RUNNER_TEMP:tmp,GITHUB_OUTPUT:join(tmp,'output')};
  await assert.rejects(()=>secretRetirementStep('preflight',e,
   fixture({inventory:[old,legacy]}).fetcher),/blocked/);
  await secretRetirementStep('preflight',e,fixture().fetcher);
  await assert.rejects(()=>secretRetirementStep('staged',e,
   fixture({inventory:[old,staged],stageSecret:true}).fetcher),/blocked/);
  await assert.rejects(()=>secretRetirementStep('staged',e,
   fixture({inventory:[old]}).fetcher),/blocked/);
 }finally{rmSync(tmp,{recursive:true,force:true});}
});
test('original protected release is reused, requires distinct Secret approval',()=>{
 const yaml=readFileSync(new URL('../.github/workflows/release-actions.yml',import.meta.url),'utf8');
 for(const required of ['retire-secret','inputs.retire_secret_approved == true',
  'actions-retire-weixin-secret.mjs preflight',
  'actions-retire-weixin-secret.mjs staged',
  'actions-retire-weixin-secret.mjs postflight',
  'wrangler versions secret delete WEIXIN_ENCRYPTION_KEY',
  'wrangler versions deploy','group: cloudflare-actions-production',
  'pnpm run check'])
  assert.ok(yaml.includes(required),required);
 assert.ok(!yaml.includes('pnpm exec wrangler secret delete'));
});
