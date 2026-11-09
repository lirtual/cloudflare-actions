import test from 'node:test';
import assert from 'node:assert/strict';
import {createActionDispatcher} from '../src/dispatch.ts';
import {digest} from '../src/bark.ts';

const version='11111111-1111-4111-8111-111111111111';
const env={CF_VERSION_METADATA:{id:version},
 get DB():never{throw Error('D1 must not be accessed');},
 get BARK_DEVICE_KEY():never{throw Error('Secrets must not be accessed');},
 get BARK_ENCRYPTION_KEY():never{throw Error('Secrets must not be accessed');},
} as never;

test('effect-free JSON Action uses the real private dispatcher and exact identity',async()=>{
 const api=createActionDispatcher(env);
 const contract=await api.getContract('diagnostic.ping');
 assert.equal(contract.manifest.side_effect,'none');
 assert.equal(contract.manifest.output_schema.required[0],'status');
 const invocation={invocation_id:'22222222-2222-4222-8222-222222222222',
  deployment_id:version,contract_digest:contract.contract_digest,input_digest:await digest({})};
 assert.deepEqual(await api.execute('diagnostic.ping',invocation),
  {status:'accepted',input_digest:invocation.input_digest});
 for(const patch of [{deployment_id:'33333333-3333-4333-8333-333333333333'},
  {contract_digest:'0'.repeat(64)},{input_digest:'0'.repeat(64)},
  {extra:'do-not-accept'},{invocation_id:'invalid'}]){
  const result=await api.execute('diagnostic.ping',{...invocation,...patch});
  assert.equal(result.status,'rejected');
 }
 await assert.rejects(()=>api.execute('diagnostic.ping',null),/invalid_invocation/);
});
