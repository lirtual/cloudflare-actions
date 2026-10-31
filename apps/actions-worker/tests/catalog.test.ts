import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createActionDispatcher} from '../src/dispatch.ts';

const version='11111111-1111-4111-8111-111111111111';
const actions=()=>createActionDispatcher({CF_VERSION_METADATA:{id:version}} as never);

test('one private catalog exposes only the reviewed actions and versioned contracts',async()=>{
 const dispatcher=actions();
 assert.deepEqual((await dispatcher.listActions()).map(x=>x.action_id),
  ['dub.shorten_url','envshare.share_text','litterbox.upload_file','bark.send_notification','weixin.send_text','weixin.notify_download']);
 for(const actionId of ['dub.shorten_url','envshare.share_text','litterbox.upload_file','bark.send_notification','weixin.send_text','weixin.notify_download']){
  const result=await dispatcher.getContract(actionId);
  assert.equal(result.deployment_id,version);
  assert.match(result.contract_digest,/^[a-f0-9]{64}$/);
  assert.equal(result.manifest.service,'cloudflare-actions');
  assert.equal(result.manifest.entrypoint,'ActionsEntrypoint');
 }
});
test('unknown actions and Bark historic receipt queries fail closed',async()=>{
 const dispatcher=actions();
 await assert.rejects(()=>dispatcher.getContract('arbitrary.http'));
 await assert.rejects(()=>dispatcher.execute('arbitrary.http',{}));
 await assert.rejects(()=>dispatcher.getReceipt('bark.send_notification',{}));
 await assert.rejects(()=>dispatcher.getBinding('bark.send_notification'));
});
test('unsupported invocation cannot reach either upstream',async()=>{
 const dispatcher=actions();
 await assert.rejects(()=>dispatcher.execute('weixin.send_text',{}));
 assert.equal((await dispatcher.execute('bark.send_notification',{}) as {status:string}).status,'rejected');
});

test('one Action ID has distinct explicit v1 and default v3 RPC contracts',async()=>{
 const dispatcher=actions();
 const current=await dispatcher.getContract('weixin.send_text');
 assert.equal(current.manifest.version,3);
 const {ACTION_CATALOG}=await import('../src/dispatch.ts');
 const {providerIdentity}=await import('../../weixin-mcp-worker/src/provider.ts');
 const v1=await providerIdentity({CF_VERSION_METADATA:{id:version}} as never,ACTION_CATALOG['weixin.send_text']);
 const legacy=await dispatcher.getContract('weixin.send_text',v1.contract_digest);
 assert.equal(legacy.manifest.version,1);
 assert.notEqual(legacy.contract_digest,current.contract_digest);
 assert.equal((await dispatcher.listActions()).length,6);
});

test('existing production contract digests stay immutable when extending the catalog',async()=>{
 const dispatcher=actions();
 const reviewed={
  'dub.shorten_url':'7affc30ef28efc869a264e6ad5b7bc86226991a15be5d59f5447f0ad26919a20',
  'bark.send_notification':'937384e390cc9b90af734405569a0ca25fd6f3784aa15c0e7e276067f16f845c',
  'weixin.send_text':'eb216c39778bf7f20a39c8ae63874ac1dec2fbeb75bb1ea36b981267cec4ff4e',
  'weixin.notify_download':'384df0ae612b825b4f4544b1bc86fd9890daaa4c4f5813b29ca8396b36655fea',
 };
 for(const [id,digest] of Object.entries(reviewed)){
  assert.equal((await dispatcher.getContract(id)).contract_digest,digest);
 }
 const {ACTION_CATALOG}=await import('../src/dispatch.ts');
 const {providerIdentity}=await import('../../weixin-mcp-worker/src/provider.ts');
 const v1=await providerIdentity({CF_VERSION_METADATA:{id:version}} as never,ACTION_CATALOG['weixin.send_text']);
 assert.equal(v1.contract_digest,'09af0f808901af3077411d8b5843659188d5a42cd983a3b0efc6b3700adffc67');
});

test('contract lookup is exact and fails closed for unknown or malformed digests',async()=>{
 const dispatcher=actions();
 for(const actionId of ['bark.send_notification','weixin.notify_download','weixin.send_text']){
  const current=await dispatcher.getContract(actionId);
  assert.deepEqual(await dispatcher.getContract(actionId,current.contract_digest),current);
  for(const unsupported of ['0'.repeat(64),'invalid','']){
   await assert.rejects(()=>dispatcher.getContract(actionId,unsupported),/unknown_contract/);
  }
 }
 const {ACTION_CATALOG}=await import('../src/dispatch.ts');
 const {providerIdentity}=await import('../../weixin-mcp-worker/src/provider.ts');
 const old=await providerIdentity({CF_VERSION_METADATA:{id:version}} as never,ACTION_CATALOG['weixin.send_text']);
 assert.equal((await dispatcher.getContract('weixin.send_text',old.contract_digest)).manifest.version,1);
});
