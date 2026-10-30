import {verifyOwnerRebindCutoverSnapshot} from './actions-release-guard.mjs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const fail=()=>{throw Error('Actions release blocked: incomplete original Owner D1 cutover evidence');};
export function checkOwnerCutover(rows,baseline){
 if(!Array.isArray(rows)||rows.length!==1||rows[0]?.success!==true||
    !Array.isArray(rows[0].results)||rows[0].results.length!==1||
    !/^(0|[1-9]\d*)$/.test(String(baseline??'')))fail();
 const r=rows[0].results[0];
 if(r?.pending_pairings!==0||!Number.isSafeInteger(r?.receipt_count)||
   r.receipt_count<0)fail();
 return verifyOwnerRebindCutoverSnapshot({
  binding:{state:r.state,generation:r.generation,session_ciphertext:r.session_ciphertext,
   session_key_id:r.session_key_id,lease_holder:r.lease_holder,lease_until:r.lease_until},
  pairing:null,receiptCount:r.receipt_count,minimumReceiptCount:Number(baseline)
 });
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const chunks=[];
 for await(const chunk of process.stdin)chunks.push(chunk);
 try {
  const snapshot=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const verified=checkOwnerCutover(snapshot,process.env.ACTIONS_EXPECTED_RECEIPTS);
  console.log('Original Weixin binding unbound; historical receipts retained: '+verified.receipts);
 }catch{console.error('Actions release blocked: original Owner D1 rebind state unverified');process.exitCode=1;}
}
