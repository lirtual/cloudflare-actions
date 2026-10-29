import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifySource,verifyActive} from './bark-release-guard.mjs';
const conf=JSON.parse(readFileSync(new URL('../apps/bark-provider/wrangler.jsonc',import.meta.url),'utf8'));
test('Bark release cannot restore a public route, MCP ingress, D1 or unexpected Secret',()=>{
 assert.equal(verifySource(conf),true);
 for(const mutation of [
  {routes:[{pattern:'example.com',custom_domain:true}]},
  {workers_dev:true},{preview_urls:true},{d1_databases:[]},
  {secrets:{required:['BARK_DEVICE_KEY']}},{vars:{ANY:'value'}},
 ]){
  assert.throws(()=>verifySource({...conf,...mutation}),/blocked/);
 }
});
const id='3d61997c-eb30-46e3-b96f-334343d061af';
const deployments={deployments:[{versions:[{percentage:100,version_id:id}]}]};
const bindings=[
 {name:'BARK_DEVICE_KEY',type:'secret_text'},
 {name:'BARK_ENCRYPTION_KEY',type:'secret_text'},
 {name:'CF_VERSION_METADATA',type:'version_metadata'}];
const secrets=[{name:'BARK_DEVICE_KEY'},{name:'BARK_ENCRYPTION_KEY'}];
test('readback must verify unambiguous 100% version and exact two runtime Secrets',()=>{
 assert.equal(verifyActive(deployments,{bindings},secrets),id);
 assert.throws(()=>verifyActive({deployments:[{versions:[{percentage:50,version_id:id}]}]},{bindings},secrets));
 assert.throws(()=>verifyActive(deployments,{bindings:bindings.slice(1)},secrets));
 assert.throws(()=>verifyActive(deployments,{bindings},secrets.slice(1)));
 assert.throws(()=>verifyActive(deployments,{bindings:[...bindings,{name:'BARK_ENDPOINT',type:'plain_text'}]},secrets));
});

test('Bark release is manual main-only, restricted to its environment and no public routing',()=>{
 const yaml=readFileSync(new URL('../.github/workflows/release-bark.yml',import.meta.url),'utf8');
 assert.match(yaml,/workflow_dispatch:/);
 assert.doesNotMatch(yaml,/^  (push|pull_request):/m);
 assert.match(yaml,/github.ref == 'refs\/heads\/main'/);
 assert.match(yaml,/environment: bark-provider/);
 for(const name of ['BARK_DEVICE_KEY','BARK_ENCRYPTION_KEY'])
  assert.match(yaml,new RegExp('secrets\\.'+name));
 assert.match(yaml,/wrangler deploy --secrets-file/);
 assert.doesNotMatch(yaml,/wrangler secret bulk/);
 assert.doesNotMatch(yaml,/weixin-mcp-worker/);
});
