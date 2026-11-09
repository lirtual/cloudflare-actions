import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createActionDispatcher,ACTION_CATALOG} from '../src/dispatch.ts';

const version='11111111-1111-4111-8111-111111111111';
const actions=()=>createActionDispatcher({CF_VERSION_METADATA:{id:version}} as never);
const reviewed=['dub.shorten_url','envshare.share_text','litterbox.upload_file','bark.send_notification','diagnostic.ping'];

test('one private reviewed catalog keeps five exact pinned immutable contracts',async()=>{
 const dispatcher=actions();
 assert.deepEqual((await dispatcher.listActions()).map(x=>x.action_id),reviewed);
 assert.deepEqual(Object.keys(ACTION_CATALOG),reviewed);
 const pins={
  'dub.shorten_url':'7affc30ef28efc869a264e6ad5b7bc86226991a15be5d59f5447f0ad26919a20',
  'bark.send_notification':'937384e390cc9b90af734405569a0ca25fd6f3784aa15c0e7e276067f16f845c',
 };
 for(const actionId of reviewed){
  const result=await dispatcher.getContract(actionId);
  assert.equal(result.deployment_id,version);
  assert.match(result.contract_digest,/^[a-f0-9]{64}$/);
  assert.equal(result.manifest.service,'cloudflare-actions');
  assert.equal(result.manifest.entrypoint,'ActionsEntrypoint');
  if(actionId in pins)assert.equal(result.contract_digest,pins[actionId as keyof typeof pins]);
  assert.deepEqual(await dispatcher.getContract(actionId,result.contract_digest),result);
  for(const digest of ['0'.repeat(64),'invalid','']){
   await assert.rejects(()=>dispatcher.getContract(actionId,digest),/unknown_contract/);
  }
 }
});

test('legacy Weixin names and digest variations never reach any Provider operation',async()=>{
 let requests=0;
 const env={CF_VERSION_METADATA:{id:version},BARK_DEVICE_KEY:'123456789012',
  BARK_ENCRYPTION_KEY:'12345678901234567890123456789012',
  DB:{prepare(){requests++;throw Error('legacy D1 forbidden');}}} as never;
 const dispatcher=createActionDispatcher(env);
 const legacy=['weixin.send_text','weixin.notify_download','send_text',
  'weixin.legacy_send','weixin.send_text.v2','weixin.getReceipt'];
 for(const actionId of legacy){
  await assert.rejects(()=>dispatcher.getContract(actionId),/unknown_action/);
  await assert.rejects(()=>dispatcher.getContract(actionId,'09af0f808901af3077411d8b5843659188d5a42cd983a3b0efc6b3700adffc67'),/unknown_action/);
  await assert.rejects(()=>dispatcher.execute(actionId,{invocation_id:version}),/unknown_action/);
  await assert.rejects(()=>dispatcher.getReceipt(actionId,{}),/unknown_action/);
  await assert.rejects(()=>dispatcher.getBinding(actionId),/unknown_action/);
 }
 assert.equal(requests,0);
});

test('all utility receipt and binding methods are explicitly unsupported',async()=>{
 const dispatcher=actions();
 for(const action of reviewed){
  await assert.rejects(()=>dispatcher.getReceipt(action,{}),/receipt_not_supported/);
  await assert.rejects(()=>dispatcher.getBinding(action),/binding_not_supported/);
 }
 assert.equal((await dispatcher.execute('bark.send_notification',{}) as {status:string}).status,'rejected');
});
