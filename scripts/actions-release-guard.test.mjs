import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyActionsSource,verifyActionsPreflight,verifyOwnerRebindCutoverSnapshot,REQUIRED_KEYS} from './actions-release-guard.mjs';
const conf=JSON.parse(readFileSync(new URL('../apps/actions-worker/wrangler.jsonc',import.meta.url)));
test('unified Worker stages without Owner domain, reuses original D1 and requires three Secrets',()=>{
 assert.equal(verifyActionsSource(conf),true);
 for(const bad of [{...conf,routes:[{pattern:'weixin.lirtual.dpdns.org',custom_domain:true}]},{...conf,d1_databases:[]},{...conf,secrets:{required:['WEIXIN_ENCRYPTION_KEY']}},
  {...conf,workers_dev:true},{...conf,services:[{binding:'EXTRA'}]}])
  assert.throws(()=>verifyActionsSource(bad),/blocked/);
});
test('active runtime must have one version, owner identity and all 3 separately provisioned Secrets',()=>{
 const version='33333333-3333-4333-8333-333333333333';
 const deployments={deployments:[{versions:[{version_id:version,percentage:100}]}]};
 const settings={bindings:[{name:'DB',type:'d1',id:conf.d1_databases[0].database_id},
   {name:'ADMIN_HOST',type:'plain_text',text:'weixin.lirtual.dpdns.org'},
   {name:'CF_VERSION_METADATA',type:'version_metadata'},...REQUIRED_KEYS.map(name=>({name,type:'secret_text'}))]};
 const secrets=REQUIRED_KEYS.map(name=>({name}));
 assert.equal(verifyActionsPreflight({activeVersions:deployments,settings,secrets}),version);
 for(const name of REQUIRED_KEYS){
  assert.throws(()=>verifyActionsPreflight({activeVersions:deployments,settings,
   secrets:secrets.filter(x=>x.name!==name)}),/blocked/);
 }
 assert.throws(()=>verifyActionsPreflight({activeVersions:{deployments:[{versions:[]}]},settings,secrets}),/blocked/);
});

test('fresh key cutover requires completed old-owner unbind and preserved receipts',()=>{
 const cleared={generation:2,state:'unbound',session_ciphertext:null,session_key_id:null,
   lease_holder:null,lease_until:null};
 const expired={phase:'expired',ciphertext:null,key_id:null};
 assert.deepEqual(verifyOwnerRebindCutoverSnapshot({
   binding:cleared,pairing:expired,receiptCount:15,minimumReceiptCount:15
 }),{generation:2,receipts:15,ready_for_new_key:true});
 for(const binding of [
   {...cleared,state:'ready'},
   {...cleared,session_ciphertext:'old-key-ciphertext'},
   {...cleared,session_key_id:'1'},
   {...cleared,lease_holder:'stale',lease_until:999},
   {...cleared,generation:0},
 ]){
   assert.throws(()=>verifyOwnerRebindCutoverSnapshot({
     binding,pairing:expired,receiptCount:15,minimumReceiptCount:15
   }),/blocked/);
 }
 for(const pairing of [{phase:'qr_pending',ciphertext:'still-encrypted',key_id:'1'},
   {phase:'expired',ciphertext:'still-encrypted',key_id:'1'}]){
   assert.throws(()=>verifyOwnerRebindCutoverSnapshot({
     binding:cleared,pairing,receiptCount:15,minimumReceiptCount:15
   }),/blocked/);
 }
 assert.throws(()=>verifyOwnerRebindCutoverSnapshot({
   binding:cleared,pairing:null,receiptCount:14,minimumReceiptCount:15
 }),/blocked/);
 assert.equal(verifyOwnerRebindCutoverSnapshot({
   binding:cleared,pairing:null,receiptCount:15,minimumReceiptCount:15
 }).ready_for_new_key,true);
});
