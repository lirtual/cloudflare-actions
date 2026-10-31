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
test('only a fully verified first handoff PUT changes Owner routing, with no retry on unknown response',async()=>{
 const version=id,token='test';
 const opts={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:token,ACTIONS_OLD_INGRESS_QUIESCED:'true',ACTIONS_OWNER_DOMAIN_APPROVED:'true',ACTIONS_EXPECTED_RECEIPTS:'0',ACTIONS_DOMAIN_OPERATION:'transfer',ACTIONS_EXPECTED_PROVIDER_VERSION:version};
 const settings={bindings:[{name:'DB',type:'d1',id:'051c3b6d-e3bc-4d69-907f-37e8ab00618f'},...['WEIXIN_ENCRYPTION_KEY','BARK_DEVICE_KEY','BARK_ENCRYPTION_KEY'].map(name=>({name,type:'secret_text'})),{name:'ADMIN_HOST',type:'plain_text',text:'weixin.lirtual.dpdns.org'},{name:'CF_VERSION_METADATA',type:'version_metadata'}]};
 const secrets=['WEIXIN_ENCRYPTION_KEY','BARK_DEVICE_KEY','BARK_ENCRYPTION_KEY'].map(name=>({name}));
 const native={success:true,result:[],result_info:{count:0,total_count:0}};
 const owner={state:'unbound',generation:2,session_ciphertext:null,session_key_id:null,lease_holder:null,lease_until:null,pending_pairings:0,receipt_count:0};
 for(const rejectWrite of [false,true]){
  let service='weixin-mcp-worker',writes=0;const calls=[];
  const fake=async(url,init)=>{
   const path=new URL(url).pathname,method=init.method||'GET';calls.push({path,method});
   if(path.endsWith('/instances'))return {ok:true,json:async()=>native};
   if(path.endsWith('/workers/domains')&&method==='PUT'){
    writes++;if(rejectWrite)return {ok:false,status:503};
    const payload=JSON.parse(init.body);assert.equal(payload.hostname,'weixin.lirtual.dpdns.org');assert.equal(payload.service,'cloudflare-actions');service=payload.service;
   }
   let result;
   if(path.endsWith('/workers/domains'))result=method==='PUT'?{id:domain(service).id}:[domain(service)];
   else if(path.endsWith('/query'))result=path.includes('a4a477cd')?[{success:true,results:[frozen]}]:[{success:true,results:[owner]}];
   else if(path.endsWith('/deployments'))result={deployments:[{versions:[{version_id:version,percentage:100}]}]};
   else if(path.endsWith('/settings'))result=settings;
   else if(path.endsWith('/secrets'))result=secrets;
   else throw Error('unexpected path: '+path);
   return {ok:true,json:async()=>({success:true,result})};
  };
  if(rejectWrite)await assert.rejects(()=>executeHandoff(opts,fake),/blocked/);
  else assert.deepEqual(await executeHandoff(opts,fake),{target:'cloudflare-actions'});
  assert.equal(writes,1);
  assert.ok(calls.filter(x=>x.path.endsWith('/workers/domains')).length>=3);
 }
});
