import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewedHandoff,dispatchHandoff} from './dispatch-reviewed-weixin-handoff.mjs';
import {verifyReviewedRelease,parseActiveVersion} from './verify-reviewed-provider-handoff.mjs';

const id=40796327454, sha='a'.repeat(40),version='3d61997c-eb30-46e3-b96f-334343d061af';
const run={id,workflow_id:399111011,event:'workflow_dispatch',head_branch:'main',
  status:'completed',conclusion:'success',
  path:'lirtual/cloudflare-actions/.github/workflows/release.yml@refs/heads/main',
  head_sha:sha};
const list={workflow_runs:[run]};
test('only newest manually approved completed Provider release may be handed off',()=>{
  assert.deepEqual(verifyReviewedRelease(run,list,id,()=>true),
    {release_run_id:id,release_sha:sha});
  for(const patch of [{workflow_id:10},{event:'push'},{head_branch:'other'},
    {status:'in_progress'},{conclusion:'failure'},{head_sha:'bad'},
    {path:'lirtual/cloudflare-actions/.github/workflows/ci.yml@refs/heads/main'}])
    assert.throws(()=>verifyReviewedRelease({...run,...patch},list,id,()=>true),/not verified/);
  assert.throws(()=>verifyReviewedRelease(run,list,id,()=>false),/not verified/);
  assert.throws(()=>verifyReviewedRelease(run,{workflow_runs:[{id:id+1,event:'workflow_dispatch'},run]},id,()=>true),/stale/);
});
test('active Provider version readback is strict and unique',()=>{
 assert.equal(parseActiveVersion('Weixin deployment readback passed; active Version ID: '+version),version);
 for(const x of ['', 'active Version ID: bad',
  'active Version ID: '+version+'\nactive Version ID: '+version])
   assert.throws(()=>parseActiveVersion(x),/not independently confirmed/);
});
test('handoff event target and payload are exact; no request retry on unknown response',async()=>{
 const payload=reviewedHandoff({release_run_id:id,release_sha:sha,provider_version_id:version});
 assert.deepEqual(payload,{event_type:'reviewed_weixin_provider_release',
  client_payload:{release_run_id:id,release_sha:sha,provider_version_id:version}});
 let calls=0;
 const result=await dispatchHandoff(payload.client_payload,'fake-test-token',async(url,options)=>{
   calls++;assert.equal(url,'https://api.github.com/repos/lirtual/mcp-workers/dispatches');
   assert.equal(options.redirect,'manual');
   assert.equal(JSON.parse(options.body).event_type,'reviewed_weixin_provider_release');
   return {status:204};
 });
 assert.equal(result.provider_version_id,version);assert.equal(calls,1);
 await assert.rejects(()=>dispatchHandoff(payload.client_payload,'fake-test-token',async()=>{
   calls++;return {status:503};
 }),/not acknowledged/);
 assert.equal(calls,2);
 assert.throws(()=>reviewedHandoff({...payload.client_payload,provider_version_id:'bad'}),/Invalid/);
});
