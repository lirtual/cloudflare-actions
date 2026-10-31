import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyDomain,verifyFrozenSnapshot,routingPlan,executeHandoff} from './actions-owner-domain-handoff.mjs';
const id='11111111-1111-4111-8111-111111111111';
const domain=service=>({id:'f3be6220149448a3e17b42f1c8874ac6f4fa518c',hostname:'weixin.lirtual.dpdns.org',zone_id:'36c4f02ddad481e5245b5f31a91f7222',enabled:true,environment:'production',service});
const frozen={state:'frozen',migration_count:1,active_workflows:0,paused_workflows:6,unsettled_runs:0};
test('only exact source domain, version, and frozen gate are accepted',()=>{
 assert.equal(verifyDomain([domain('weixin-mcp-worker')],'weixin-mcp-worker'),domain('').id);
 for(const x of [[],[domain('wrong')],[domain('weixin-mcp-worker'),domain('weixin-mcp-worker')]])assert.throws(()=>verifyDomain(x,'weixin-mcp-worker'));
 assert.deepEqual(routingPlan('transfer',id),{from:'weixin-mcp-worker',to:'cloudflare-actions'});
 assert.deepEqual(routingPlan('rollback',id),{from:'cloudflare-actions',to:'weixin-mcp-worker'});
 assert.throws(()=>routingPlan('unknown',id));
 assert.equal(verifyFrozenSnapshot([{success:true,results:[frozen]}]),true);
 for(const x of [{...frozen,state:'open'},{...frozen,active_workflows:1},{...frozen,unsettled_runs:1},{...frozen,migration_count:0}])assert.throws(()=>verifyFrozenSnapshot([{success:true,results:[x]}]));
});
test('missing explicit approval prevents even a Cloudflare read',async()=>{
 let calls=0;const fake=async()=>{calls++;throw Error('request not expected')};
 const opts={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'x',ACTIONS_OLD_INGRESS_QUIESCED:'true',ACTIONS_DOMAIN_OPERATION:'transfer',ACTIONS_EXPECTED_PROVIDER_VERSION:id,ACTIONS_EXPECTED_RECEIPTS:'0'};
 await assert.rejects(()=>executeHandoff(opts,fake));assert.equal(calls,0);
});
test('domain handoff is an independent manual main-only job, not a Worker deploy',()=>{
 const yaml=readFileSync(new URL('../.github/workflows/release-actions.yml',import.meta.url),'utf8');
 const job=yaml.slice(yaml.indexOf('\n  owner-domain-handoff:'));
 for(const x of ["github.actor == 'lirtual'", "github.ref == 'refs/heads/main'", 'inputs.deploy_to_production == false', 'inputs.owner_domain_approved == true', 'group: cloudflare-actions-production','actions-owner-domain-handoff.mjs'])assert.ok(job.includes(x),x);
 assert.ok(!job.includes('wrangler deploy'));
 assert.ok(yaml.includes("inputs.domain_operation == 'none'"));
});
test('guarded detach and attach uses exact source ID, readback and one target write',async()=>{
 const opts={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'test',
  ACTIONS_OLD_INGRESS_QUIESCED:'true',ACTIONS_OWNER_DOMAIN_APPROVED:'true',
  ACTIONS_EXPECTED_RECEIPTS:'0',ACTIONS_DOMAIN_OPERATION:'transfer',ACTIONS_EXPECTED_PROVIDER_VERSION:id};
 const settings={bindings:[{name:'DB',type:'d1',id:'051c3b6d-e3bc-4d69-907f-37e8ab00618f'},
  ...['WEIXIN_ENCRYPTION_KEY','BARK_DEVICE_KEY','BARK_ENCRYPTION_KEY'].map(name=>({name,type:'secret_text'})),
  {name:'ADMIN_HOST',type:'plain_text',text:'weixin.lirtual.dpdns.org'},{name:'CF_VERSION_METADATA',type:'version_metadata'}]};
 const secrets=['WEIXIN_ENCRYPTION_KEY','BARK_DEVICE_KEY','BARK_ENCRYPTION_KEY'].map(name=>({name}));
 const native={success:true,result:[],result_info:{count:0,total_count:0}};
 const owner={state:'unbound',generation:2,session_ciphertext:null,session_key_id:null,
  lease_holder:null,lease_until:null,pending_pairings:0,receipt_count:0};
 const fixture=(scenario='success')=>{
  let service='weixin-mcp-worker',writes=[],lists=0;
  const fake=async(url,init)=>{
   const u=new URL(url),path=u.pathname,method=init.method||'GET';
   if(path.endsWith('/instances'))return {ok:true,status:200,json:async()=>native};
   if(path.endsWith('/workers/domains')&&method==='GET'){
    lists++;const view=['stale-read-after-detach','delete-unknown-stale'].includes(scenario)&&service===null
     ?'weixin-mcp-worker':service;
    return {ok:true,status:200,json:async()=>({success:true,result:view?[domain(view)]:[]})};
   }
   if(path.endsWith('/workers/domains/'+domain('').id)&&method==='DELETE'){
    writes.push('DELETE');
    if(scenario==='delete-refused')return {ok:false,status:403,json:async()=>({success:false,errors:[{code:10000}]})};
    service=null;
    if(['delete-unknown','delete-unknown-stale'].includes(scenario))
     return {ok:false,status:503,json:async()=>({success:false,result:null,errors:[{code:10001}]})};
    if(scenario==='delete-empty-body')
     return {ok:true,status:200,json:async()=>{throw Error('empty successful DELETE body')}};
    return {ok:true,status:204,json:async()=>{throw Error('204 must not parse JSON')}};
   }
   if(path.endsWith('/workers/domains')&&method==='PUT'){
    const payload=JSON.parse(init.body);writes.push('PUT:'+payload.service);
    assert.equal(payload.hostname,'weixin.lirtual.dpdns.org');
    assert.equal(payload.zone_id,'36c4f02ddad481e5245b5f31a91f7222');
    if(payload.service==='cloudflare-actions'&&['target-refused','restore-refused'].includes(scenario))
     return {ok:false,status:409,json:async()=>({success:false,errors:[{code:100116}]})};
    if(payload.service==='weixin-mcp-worker'&&scenario==='restore-refused')
     return {ok:false,status:503,json:async()=>({success:false,errors:[]})};
    service=payload.service;
    if(payload.service==='cloudflare-actions'&&scenario==='target-unknown')
     return {ok:false,status:503,json:async()=>({success:false,errors:[]})};
    return {ok:true,status:200,json:async()=>({success:true,result:{id:domain(service).id}})};
   }
   let result;
   if(path.endsWith('/query'))result=path.includes('a4a477cd')?[{success:true,results:[frozen]}]:[{success:true,results:[owner]}];
   else if(path.endsWith('/deployments'))result={deployments:[{versions:[{version_id:id,percentage:100}]}]};
   else if(path.endsWith('/settings'))result=settings;
   else if(path.endsWith('/secrets'))result=secrets;
   else throw Error('unexpected path');
   return {ok:true,status:200,json:async()=>({success:true,result})};
  };
  return {fake,writes,view:()=>service,lists:()=>lists};
 };
 for(const scenario of ['success','target-unknown','delete-unknown','delete-empty-body']){
  const f=fixture(scenario);
  assert.deepEqual(await executeHandoff(opts,f.fake),{target:'cloudflare-actions'});
  assert.deepEqual(f.writes,['DELETE','PUT:cloudflare-actions']);
  assert.equal(f.view(),'cloudflare-actions');
  assert.ok(f.lists()>=4);
 }
 for(const [scenario,expected,final] of [
  ['delete-refused',['DELETE'],'weixin-mcp-worker'],
  ['delete-unknown-stale',['DELETE'],null],
  ['target-refused',['DELETE','PUT:cloudflare-actions','PUT:weixin-mcp-worker'],'weixin-mcp-worker'],
  ['stale-read-after-detach',['DELETE'],null],
  ['restore-refused',['DELETE','PUT:cloudflare-actions','PUT:weixin-mcp-worker'],null]
 ]){
  const f=fixture(scenario);
  await assert.rejects(()=>executeHandoff(opts,f.fake),/blocked/);
  assert.deepEqual(f.writes,expected);
  assert.equal(f.view(),final);
 }
});

test('API denials report only fixed phase, HTTP and numeric error code',async()=>{
 const opts={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'test-private-token',
  ACTIONS_OLD_INGRESS_QUIESCED:'true',ACTIONS_OWNER_DOMAIN_APPROVED:'true',
  ACTIONS_EXPECTED_RECEIPTS:'0',ACTIONS_DOMAIN_OPERATION:'transfer',ACTIONS_EXPECTED_PROVIDER_VERSION:id};
 let requests=0;
 const fake=async(url,init)=>{
  requests++;assert.equal(init.method,'GET');
  return {ok:false,status:403,json:async()=>({success:false,errors:[{
   code:10000,message:'do-not-expose-authorization test-private-token'
  }],result:null})};
 };
 await assert.rejects(()=>executeHandoff(opts,fake),error=>{
  assert.equal(error.message,'Actions Owner domain blocked: Cloudflare request rejected (stage=domain_inventory,http=403,code=10000)');
  assert.ok(!error.message.includes('do-not-expose'));
  assert.ok(!error.message.includes('test-private-token'));
  return true;
 });
 assert.equal(requests,1);
});
