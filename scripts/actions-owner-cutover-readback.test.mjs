import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkOwnerCutover} from './actions-owner-cutover-readback.mjs';
const row={state:'unbound',generation:2,session_ciphertext:null,session_key_id:null,
 lease_holder:null,lease_until:null,pending_pairings:0,receipt_count:11};
const data=v=>[{success:true,results:[v]}];
test('original Owner D1 cutover requires unbound no lease, pairing, or receipt loss',()=>{
 assert.equal(checkOwnerCutover(data(row),'11').generation,2);
 for(const patch of [{state:'ready'},{session_ciphertext:'encrypted'},{lease_holder:'old'},
   {pending_pairings:1},{receipt_count:10},{generation:0}]){
  assert.throws(()=>checkOwnerCutover(data({...row,...patch}),'11'),/blocked/);
 }
 for(const value of ['',undefined,'-1','12','01']){
  assert.throws(()=>checkOwnerCutover(data(row),value),/blocked/);
 }
});
