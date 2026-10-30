import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createActionDispatcher} from '../src/dispatch.ts';

const version='11111111-1111-4111-8111-111111111111';
const actions=()=>createActionDispatcher({CF_VERSION_METADATA:{id:version}} as never);

test('one private catalog exposes only the reviewed actions and versioned contracts',async()=>{
 const dispatcher=actions();
 assert.deepEqual((await dispatcher.listActions()).map(x=>x.action_id),
  ['bark.send_notification','weixin.send_text']);
 for(const actionId of ['bark.send_notification','weixin.send_text']){
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
