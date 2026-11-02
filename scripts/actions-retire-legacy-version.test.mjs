import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyRetirementSelection,verifyTargetMetadata,verifySnapshot,
 REVIEWED_UNSAFE_VERSIONS,retirementStep} from './actions-retire-legacy-version.mjs';

const safe='960ade68-149a-469c-a4fe-2c5e678df49c';
const target=REVIEWED_UNSAFE_VERSIONS[0];
const consumer='55555555-5555-4555-8555-555555555555';
const WF='a4a477cd-6339-478c-ab7c-f7d87bb0d772',WX='051c3b6d-e3bc-4d69-907f-37e8ab00618f';
const env={ACTIONS_MAINTENANCE_OPERATION:'retire-version',
 ACTIONS_RETIRE_VERSION_APPROVED:'true',ACTIONS_RETIRE_VERSION_ID:target,
 ACTIONS_MAINTENANCE_APPROVED:'true',ACTIONS_MAINTENANCE_QUIESCED:'true',
 ACTIONS_EXPECTED_PROVIDER_VERSION:safe,ACTIONS_EXPECTED_CONSUMER_VERSION:consumer,
 ACTIONS_EXPECTED_RECEIPTS:'20',ACTIONS_ROLLBACK_TARGET_VERSION:'',
 CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'fixture'};
const result=x=>({ok:true,status:200,json:async()=>({success:true,result:x})});
const providerBindings=[
 {name:'CF_VERSION_METADATA',type:'version_metadata'},
 {name:'BARK_DEVICE_KEY',type:'secret_text'},
 {name:'BARK_ENCRYPTION_KEY',type:'secret_text'}];
const service={name:'ACTIONS',type:'service',service:'cloudflare-actions',entrypoint:'ActionsEntrypoint'};
const pin={name:'ACTIONS_DEPLOYMENT_ID',type:'plain_text',text:safe};
const row=val=>[{success:true,results:[val]}];
function fixture(opts={}){
 const all=[...REVIEWED_UNSAFE_VERSIONS,safe],remaining=all.filter(x=>x!==target);
 const calls=[];
 const fetcher=async(url,init)=>{
  const parsed=new URL(url),path=parsed.pathname,method=init.method||'GET';
  calls.push({path,method});
  if(opts.failDelete&&method==='DELETE')return {ok:false,status:500};
  if(path.endsWith('/workers/workers/cloudflare-actions/versions')&&method==='GET')
   return result((opts.deleted?remaining:all).map(id=>({id})));
  if(path.endsWith('/workers/workers/cloudflare-actions/versions/'+target)){
   if(method==='DELETE'){
    if(opts.noDelete)return result({});
    opts.deleted=true;return {ok:true,status:204};
   }
   return result({id:target,bindings:[
    {name:'DB',type:'d1'},{name:'WEIXIN_ENCRYPTION_KEY',type:'secret_text'}]});
  }
  if(path.endsWith('/workers/scripts/cloudflare-actions/deployments'))
   return result({deployments:[{versions:[{version_id:safe,percentage:100}]}]});
  if(path.endsWith('/workers/scripts/cloudflare-actions/settings'))
   return result({bindings:providerBindings});
  if(path.endsWith('/workers/scripts/cloudflare-actions/secrets'))
   return result([{name:'BARK_DEVICE_KEY'},{name:'BARK_ENCRYPTION_KEY'}]);
  if(path.endsWith('/workers/scripts/workflow-mcp-worker/deployments'))
   return result({deployments:[{versions:[{version_id:consumer,percentage:100}]}]});
  if(path.endsWith('/workers/scripts/workflow-mcp-worker/settings'))
   return result({bindings:[service,pin]});
  if(path.endsWith('/d1/database/'+WF+'/query'))
   return result(row({state:opts.frozen===false?'open':'frozen',
    active_workflows:0,unsettled_runs:0}));
  if(path.endsWith('/d1/database/'+WX+'/query'))
   return result(row({receipts:20}));
  if(path.includes('/workflows/workflow-mcp-orchestrator/instances'))
   return {ok:true,status:200,json:async()=>({success:true,result:[],
      result_info:{count:0,total_count:0}})};
  throw Error('unexpected fixture path '+path);
 };
 return {fetcher,calls,options:opts};
}

test('only one exact old version and independent high-risk approval, never safe or arbitrary version',()=>{
 assert.equal(verifyRetirementSelection(env),target);
 for(const patch of [
  {ACTIONS_RETIRE_VERSION_APPROVED:'false'},
  {ACTIONS_MAINTENANCE_APPROVED:'false'},
  {ACTIONS_MAINTENANCE_QUIESCED:'false'},
  {ACTIONS_RETIRE_VERSION_ID:safe},
  {ACTIONS_RETIRE_VERSION_ID:'latest'},
  {ACTIONS_EXPECTED_PROVIDER_VERSION:target},
  {ACTIONS_ROLLBACK_TARGET_VERSION:target},
  {ACTIONS_MAINTENANCE_OPERATION:'upgrade'}
 ])assert.throws(()=>verifyRetirementSelection({...env,...patch}),/blocked/);
 assert.equal(REVIEWED_UNSAFE_VERSIONS.length,6);
});

test('only reviewed Weixin+D1 historic versions, fail closed on metadata or list drift',()=>{
 assert.equal(verifyTargetMetadata({id:target,bindings:[
  {name:'DB',type:'d1'},{name:'WEIXIN_ENCRYPTION_KEY',type:'secret_text'}]},target),true);
 for(const x of [
  {id:safe,bindings:[]},
  {id:target,bindings:[{name:'WEIXIN_ENCRYPTION_KEY',type:'secret_text'}]},
  {id:target,bindings:[{name:'DB',type:'d1'},{name:'WEIXIN_ENCRYPTION_KEY',type:'plain_text'}]}
 ])assert.throws(()=>verifyTargetMetadata(x,target),/blocked/);
 const original=[...REVIEWED_UNSAFE_VERSIONS,safe];
 assert.equal(verifySnapshot(original,original,target),true);
 assert.equal(verifySnapshot(original,original.filter(x=>x!==target),target,true),true);
 for(const altered of [[],[...original,target],original.filter(x=>x!==safe),
  original.filter(x=>x!==target)])
  assert.throws(()=>verifySnapshot(original,altered,target),/blocked/);
 assert.throws(()=>verifySnapshot(original,original,target,true),/blocked/);
});

test('preflight, exact single DELETE, postflight; no D1 writes or second deletion',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'actions-t7-'));
 try{
  const e={...env,RUNNER_TEMP:dir},f=fixture();
  assert.equal(await retirementStep('preflight',e,f.fetcher),'preflight');
  const snapshot=JSON.parse(readFileSync(join(dir,'spec54-t7-provider-version-snapshot.json'),'utf8'));
  assert.deepEqual(snapshot.versions,[...REVIEWED_UNSAFE_VERSIONS,safe]);
  assert.equal(await retirementStep('retire',e,f.fetcher),'requested');
  assert.equal(await retirementStep('postflight',e,f.fetcher),'removed');
  assert.equal(f.calls.filter(x=>x.method==='DELETE').length,1);
  assert.ok(f.calls.every(x=>x.method==='GET'||x.method==='DELETE'||
    x.method==='POST'&&x.path.includes('/d1/database/')));
  assert.ok(!f.calls.some(x=>x.path.includes('/secrets/')&&x.method==='DELETE'));
  await assert.rejects(()=>retirementStep('retire',e,f.fetcher),/blocked/);
  assert.equal(f.calls.filter(x=>x.method==='DELETE').length,1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('invalid approval and frozen-gate failure preclude ANY version deletion',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'actions-t7-reject-'));
 try{
  const e={...env,RUNNER_TEMP:dir};
  const f=fixture();
  await assert.rejects(()=>retirementStep('preflight',
   {...e,ACTIONS_RETIRE_VERSION_APPROVED:'false'},f.fetcher),/blocked/);
  assert.equal(f.calls.length,0);
  const thawed=fixture({frozen:false});
  await assert.rejects(()=>retirementStep('preflight',e,thawed.fetcher),/blocked/);
  assert.ok(!thawed.calls.some(x=>x.method==='DELETE'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('existing protected publisher owns retirement; no direct-Cloudflare ad-hoc job',()=>{
 const y=readFileSync(new URL('../.github/workflows/release-actions.yml',import.meta.url),'utf8');
 assert.ok(y.includes('group: cloudflare-actions-production'));
 assert.ok(y.includes('inputs.retire_version_approved == true'));
 assert.ok(y.includes('actions-retire-legacy-version.mjs preflight'));
 assert.ok(y.includes('actions-retire-legacy-version.mjs retire'));
 assert.ok(y.includes('actions-retire-legacy-version.mjs postflight'));
 assert.ok(!y.includes('wrangler rollback '));
});
