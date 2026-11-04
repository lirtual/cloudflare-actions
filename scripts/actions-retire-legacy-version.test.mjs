import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyRetirementSelection,verifyTargetMetadata,verifySnapshot,
 REVIEWED_UNSAFE_VERSIONS,SECRET_FREE_VERSION,SECRET_FREE_CONSUMER,
 retirementStep,verifiedVersionIds} from './actions-retire-legacy-version.mjs';

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
 const final=opts.final===true;
 const selected=final?safe:target;
 const current=final?SECRET_FREE_VERSION:safe;
 const currentConsumer=final?SECRET_FREE_CONSUMER:consumer;
 const all=final?[safe,SECRET_FREE_VERSION]:[...REVIEWED_UNSAFE_VERSIONS,safe];
 const remaining=all.filter(x=>x!==selected);
 const calls=[];
 const fetcher=async(url,init)=>{
  const parsed=new URL(url),path=parsed.pathname,method=init.method||'GET';
  calls.push({path,method});
  if(opts.failDelete&&method==='DELETE')return {ok:false,status:500};
  if(path.endsWith('/workers/workers/cloudflare-actions/versions')&&method==='GET'){
   assert.equal(parsed.searchParams.get('page'),'1');
   assert.equal(parsed.searchParams.get('per_page'),'100');
   const rows=(opts.deleted?remaining:all).map(id=>({id}));
   const info=Object.hasOwn(opts,'listInfo')?opts.listInfo:
     {page:1,per_page:100,count:rows.length,total_count:rows.length,total_pages:1};
   return {ok:true,status:200,json:async()=>({
    success:true,result:rows,...(info===undefined?{}:{result_info:info})
   })};
  }
  if(path.endsWith('/workers/workers/cloudflare-actions/versions/'+selected)){
   if(method==='DELETE'){
    if(opts.noDelete)return result({});
    opts.deleted=true;return {ok:true,status:204};
   }
   return result({id:selected,bindings:final?[
    ...providerBindings,{name:'WEIXIN_ENCRYPTION_KEY',type:'secret_text'},
    ...(opts.legacyWithDB?[{name:'DB',type:'d1'}]:[])
   ]:[{name:'DB',type:'d1'},{name:'WEIXIN_ENCRYPTION_KEY',type:'secret_text'}]});
  }
  if(final&&path.endsWith('/workers/workers/cloudflare-actions/versions/'+current))
   return result({id:current,bindings:[
      ...providerBindings,...(opts.successorWeixin?[{name:'WEIXIN_ENCRYPTION_KEY',type:'secret_text'}]:[])
   ]});
  if(path.endsWith('/workers/scripts/cloudflare-actions/deployments'))
   return result({deployments:[{versions:[{version_id:opts.oldProvider?safe:current,percentage:100}]}]});
  if(path.endsWith('/workers/scripts/cloudflare-actions/settings'))
   return result({bindings:providerBindings});
  if(path.endsWith('/workers/scripts/cloudflare-actions/secrets'))
   return result([{name:'BARK_DEVICE_KEY'},{name:'BARK_ENCRYPTION_KEY'},
      ...(opts.liveWeixin?[{name:'WEIXIN_ENCRYPTION_KEY'}]:[])]);
  if(path.endsWith('/workers/scripts/workflow-mcp-worker/deployments'))
   return result({deployments:[{versions:[{version_id:currentConsumer,percentage:100}]}]});
  if(path.endsWith('/workers/scripts/workflow-mcp-worker/settings'))
   return result({bindings:[service,{...pin,text:opts.oldConsumerPin?safe:current}]});
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

test('optional pagination fields must still prove a complete first-page inventory',()=>{
 const rows=[{id:target},{id:safe}],expected=[target,safe];
 for(const info of [
  {page:1,per_page:100,count:2,total_count:2,total_pages:1},
  {total_count:2},
  {total_pages:1},
  {page:1,per_page:2,total_count:2},
  {count:2,total_pages:1},
  {per_page:2,total_pages:1}
 ])assert.deepEqual(verifiedVersionIds({result:rows,result_info:info}),expected);
 for(const info of [
  undefined,null,{},[],{page:1},{count:2},{per_page:2},
  {total_pages:2},{total_count:3},{page:2,total_count:2},
  {count:1,total_pages:1},{per_page:1,total_count:2},
  {per_page:101,total_count:2},{per_page:1.5,total_count:2},
  {total_count:'2'},{total_pages:'1'},{total_pages:1.5},
  {page:0,total_count:2},{total_count:-1},
  {total_pages:1,total_count:3}
 ])assert.throws(()=>verifiedVersionIds({result:rows,result_info:info}),/blocked/);
});

test('Worker Version IDs must be unique RFC UUIDs and the result bounded at 100',()=>{
 const info={total_pages:1};
 const valid=[target,safe];
 for(const ids of [
  [target,target],
  [target,target.toUpperCase()],
  [target,'not-a-uuid'],
  [target,'00000000-0000-0000-0000-000000000000'],
  [target,'960ade68-149a-469c-04fe-2c5e678df49c'],
  [target,null],
  Array.from({length:101},()=>safe)
 ])assert.throws(()=>verifiedVersionIds({
  result:ids.map(id=>({id})),result_info:info
 }),/blocked/);
 assert.deepEqual(verifiedVersionIds({
  result:valid.map(id=>({id})),result_info:{total_count:2}
 }),valid);
});

test('an incomplete inventory stops protected retirement before DELETE',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'actions-t7-pagination-'));
 try{
  const e={...env,RUNNER_TEMP:dir};
  const ok=fixture();
  assert.equal(await retirementStep('preflight',e,ok.fetcher),'preflight');
  for(const listInfo of [undefined,{}, {page:2,total_count:7},
                          {total_count:8,total_pages:1}]){
   const blocked=fixture({listInfo});
   await assert.rejects(()=>retirementStep('retire',e,blocked.fetcher),/blocked/);
   assert.equal(blocked.calls.filter(c=>c.method==='DELETE').length,0);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
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


test('final #7 retirement requires exact new Bark-only Provider, Consumer and reviewed metadata',()=>{
 const final={...env,ACTIONS_RETIRE_VERSION_ID:safe,
   ACTIONS_EXPECTED_PROVIDER_VERSION:SECRET_FREE_VERSION,
   ACTIONS_EXPECTED_CONSUMER_VERSION:SECRET_FREE_CONSUMER};
 assert.equal(verifyRetirementSelection(final),safe);
 for(const patch of [
   {ACTIONS_EXPECTED_PROVIDER_VERSION:safe},
   {ACTIONS_EXPECTED_CONSUMER_VERSION:consumer},
   {ACTIONS_RETIRE_VERSION_APPROVED:'false'},
   {ACTIONS_RETIRE_VERSION_ID:SECRET_FREE_VERSION},
   {ACTIONS_RETIRE_VERSION_ID:'latest'}
 ])assert.throws(()=>verifyRetirementSelection({...final,...patch}),/blocked/);
 const old={id:safe,bindings:[...providerBindings,
   {name:'WEIXIN_ENCRYPTION_KEY',type:'secret_text'}]};
 assert.equal(verifyTargetMetadata(old,safe),true);
 for(const bad of [
   {id:safe,bindings:providerBindings},
   {id:safe,bindings:[...old.bindings,{name:'DB',type:'d1'}]},
   {id:safe,bindings:[...old.bindings,{name:'MCP_ACCESS_TOKEN',type:'secret_text'}]},
   {id:safe,bindings:[...old.bindings,{name:'WEIXIN_ENCRYPTION_KEY',type:'secret_text'}]}
 ])assert.throws(()=>verifyTargetMetadata(bad,safe),/blocked/);
 assert.equal(verifySnapshot([safe,SECRET_FREE_VERSION],[safe,SECRET_FREE_VERSION],safe),true);
 assert.equal(verifySnapshot([safe,SECRET_FREE_VERSION],[SECRET_FREE_VERSION],safe,true),true);
 for(const snapshot of [
   [safe],[SECRET_FREE_VERSION],[safe,SECRET_FREE_VERSION,target],
   [safe,SECRET_FREE_VERSION,SECRET_FREE_VERSION]
 ])assert.throws(()=>verifySnapshot(snapshot,snapshot,safe),/blocked/);
});

test('final #7 protected path performs exactly one DELETE then verifies only new Provider remains',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'actions-t7-final7-'));
 try{
  const e={...env,RUNNER_TEMP:dir,ACTIONS_RETIRE_VERSION_ID:safe,
    ACTIONS_EXPECTED_PROVIDER_VERSION:SECRET_FREE_VERSION,
    ACTIONS_EXPECTED_CONSUMER_VERSION:SECRET_FREE_CONSUMER};
  const f=fixture({final:true});
  assert.equal(await retirementStep('preflight',e,f.fetcher),'preflight');
  assert.equal(await retirementStep('retire',e,f.fetcher),'requested');
  assert.equal(await retirementStep('postflight',e,f.fetcher),'removed');
  assert.equal(f.calls.filter(x=>x.method==='DELETE').length,1);
  assert.deepEqual(f.calls.filter(x=>x.method==='DELETE').map(x=>x.path.split('/').at(-1)),[safe]);
  assert.ok(f.calls.every(x=>x.method==='GET'||x.method==='DELETE'||
    x.method==='POST'&&x.path.includes('/d1/database/')));
  await assert.rejects(()=>retirementStep('retire',e,f.fetcher),/blocked/);
  assert.equal(f.calls.filter(x=>x.method==='DELETE').length,1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('final #7 uncertain DELETE never retries and no-op DELETE fails postflight',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'actions-t7-final-unknown-'));
 try{
  const e={...env,RUNNER_TEMP:dir,ACTIONS_RETIRE_VERSION_ID:safe,
    ACTIONS_EXPECTED_PROVIDER_VERSION:SECRET_FREE_VERSION,
    ACTIONS_EXPECTED_CONSUMER_VERSION:SECRET_FREE_CONSUMER};
  const f=fixture({final:true});
  assert.equal(await retirementStep('preflight',e,f.fetcher),'preflight');
  const failed=fixture({final:true,failDelete:true});
  await assert.rejects(()=>retirementStep('retire',e,failed.fetcher),/unknown/);
  assert.equal(failed.calls.filter(x=>x.method==='DELETE').length,1);
  const noOp=fixture({final:true,noDelete:true});
  assert.equal(await retirementStep('retire',e,noOp.fetcher),'requested');
  await assert.rejects(()=>retirementStep('postflight',e,noOp.fetcher),/blocked/);
  assert.equal(noOp.calls.filter(x=>x.method==='DELETE').length,1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('final #7 retired only with complete frozen, Secret-free and exact bound snapshots',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'actions-t7-final-guard-'));
 try{
  const e={...env,RUNNER_TEMP:dir,ACTIONS_RETIRE_VERSION_ID:safe,
    ACTIONS_EXPECTED_PROVIDER_VERSION:SECRET_FREE_VERSION,
    ACTIONS_EXPECTED_CONSUMER_VERSION:SECRET_FREE_CONSUMER};
  for(const patch of [
    {liveWeixin:true},{successorWeixin:true},{legacyWithDB:true},
    {oldProvider:true},{oldConsumerPin:true},{frozen:false},
    {listInfo:{total_count:3}},{listInfo:{}}
  ]){
   const f=fixture({final:true,...patch});
   await assert.rejects(()=>retirementStep('preflight',e,f.fetcher),/blocked/);
   assert.equal(f.calls.filter(x=>x.method==='DELETE').length,0);
  }
  const ok=fixture({final:true});
  assert.equal(await retirementStep('preflight',e,ok.fetcher),'preflight');
  for(const patch of [{liveWeixin:true},{successorWeixin:true},{oldConsumerPin:true},{listInfo:{total_pages:2}}]){
   const f=fixture({final:true,...patch});
   await assert.rejects(()=>retirementStep('retire',e,f.fetcher),/blocked/);
   assert.equal(f.calls.filter(x=>x.method==='DELETE').length,0);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
