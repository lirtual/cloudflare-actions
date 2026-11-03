import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectActionsDeployment,verifyActionsSource} from './actions-release-guard.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WF='a4a477cd-6339-478c-ab7c-f7d87bb0d772',WX='051c3b6d-e3bc-4d69-907f-37e8ab00618f';
export const NATIVE_STATES=Object.freeze(['queued','running','paused','waiting','waitingForPause','rollingBack']);
const fail=x=>{throw Error('Actions maintenance blocked: '+x);};
export function verifyMaintenanceSelection(e){
 if(e.ACTIONS_MAINTENANCE_APPROVED!=='true'||e.ACTIONS_MAINTENANCE_QUIESCED!=='true')
  fail('separate Owner approval and drain proof required');
 // No prior Cloudflare Version is verified Bark-only. Do not use it as rollback.
 if(e.ACTIONS_MAINTENANCE_OPERATION==='rollback')
  fail('no reviewed Bark-only rollback candidate');
 if(e.ACTIONS_MAINTENANCE_OPERATION!=='upgrade'||e.ACTIONS_ROLLBACK_TARGET_VERSION)
  fail('unsupported maintenance operation');
 if(!UUID.test(e.ACTIONS_EXPECTED_PROVIDER_VERSION??'')||
    !UUID.test(e.ACTIONS_EXPECTED_CONSUMER_VERSION??'')||
    !/^(0|[1-9]\d*)$/.test(e.ACTIONS_EXPECTED_RECEIPTS??'')||
    !Number.isSafeInteger(Number(e.ACTIONS_EXPECTED_RECEIPTS))||
    !/^[a-f0-9]{32}$/i.test(e.CLOUDFLARE_ACCOUNT_ID??'')||
    !e.CLOUDFLARE_API_TOKEN)fail('unverified identity or receipt baseline');
 return {current:e.ACTIONS_EXPECTED_PROVIDER_VERSION,
  consumer:e.ACTIONS_EXPECTED_CONSUMER_VERSION,
  receipts:Number(e.ACTIONS_EXPECTED_RECEIPTS),operation:'upgrade'};
}
export function verifyMaintenanceQuiescence(x){
 const r=x?.[0]?.results?.[0];
 if(!Array.isArray(x)||x.length!==1||x[0].success!==true||
    x[0].results.length!==1||r?.state!=='frozen'||
    r.active_workflows!==0||r.unsettled_runs!==0)
  fail('gate not frozen or workflow not drained');
 return true;
}
export function verifyOriginalReceipts(x,expected){
 if(x?.length!==1||x[0]?.success!==true||x[0]?.results?.length!==1||
    x[0].results[0]?.receipts!==expected)fail('historic receipt count drift');
 return true;
}
export function verifyConsumerBinding(x,pin){
 const b=x?.bindings;
 if(!Array.isArray(b)||b.filter(v=>v.type==='service').length!==1||
    b.filter(v=>v.name==='ACTIONS'&&v.type==='service'&&
      v.service==='cloudflare-actions'&&v.entrypoint==='ActionsEntrypoint').length!==1||
    b.filter(v=>v.name==='ACTIONS_DEPLOYMENT_ID'&&v.type==='plain_text'&&v.text===pin).length!==1)
  fail('actual Consumer Service Binding/pin drift');
 return true;
}
export function verifyNativeEmpty(s,r){
 const info=r?.result_info;
 if(!NATIVE_STATES.includes(s)||r?.success!==true||!Array.isArray(r.result)||
    r.result.length!==0||info?.count!==0||!!(info.cursor||info.next_cursor)||
    info.total_pages!==undefined&&info.total_pages>1||
    info.total_count!==undefined&&info.total_count!==0)
  fail('native instance Drain incomplete');
 return true;
}
export function verifyNewVersion(before,after){
 if(!UUID.test(before??'')||!UUID.test(after??'')||before.toLowerCase()===after.toLowerCase())
  fail('no independently verified new Provider version');
 return true;
}
export async function readOnlyMaintenancePreflight(e,fetcher=fetch,liveProvider=e.ACTIONS_EXPECTED_PROVIDER_VERSION){
 const a=verifyMaintenanceSelection(e);
 await inspectActionsDeployment(e,liveProvider,fetcher);
 const root='https://api.cloudflare.com/client/v4/accounts/'+e.CLOUDFLARE_ACCOUNT_ID;
 const headers={Authorization:'Bearer '+e.CLOUDFLARE_API_TOKEN,Accept:'application/json'};
 const read=async(p,sql,raw=false)=>{
  const res=await fetcher(root+p,{method:sql?'POST':'GET',headers:{...headers,
   ...(sql?{'Content-Type':'application/json'}:{})},
   ...(sql?{body:JSON.stringify({sql})}:{}),
   redirect:'manual',signal:AbortSignal.timeout(15000)});
  if(!res.ok)fail('Cloudflare read-only HTTP unavailable');
  const body=await res.json();
  if(body?.success!==true||body.result==null)fail('Cloudflare inventory unknown');
  return raw?body:body.result;
 };
 const v=await read('/workers/scripts/workflow-mcp-worker/deployments?per_page=1');
 const active=v?.deployments?.[0]?.versions;
 if(!Array.isArray(active)||active.length!==1||active[0].percentage!==100||
    active[0].version_id!==a.consumer)fail('actual Consumer version drift');
 verifyConsumerBinding(await read('/workers/scripts/workflow-mcp-worker/settings'),a.current);
 const sql="SELECT state,(SELECT COUNT(*) FROM workflows WHERE deleted_at IS NULL AND state='active') active_workflows,(SELECT COUNT(*) FROM runs WHERE outcome NOT IN ('succeeded','failed','cancelled','indeterminate')) unsettled_runs FROM cloudflare_action_gate WHERE id=1";
 verifyMaintenanceQuiescence(await read('/d1/database/'+WF+'/query',sql));
 verifyOriginalReceipts(await read('/d1/database/'+WX+'/query',
  'SELECT COUNT(*) receipts FROM weixin_send_receipts'),a.receipts);
 for(const s of NATIVE_STATES){
  const p=new URLSearchParams({status:s,per_page:'100'});
  verifyNativeEmpty(s,await read('/workflows/workflow-mcp-orchestrator/instances?'+p,undefined,true));
 }
 return liveProvider;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 (async()=>{
  verifyActionsSource(JSON.parse(readFileSync(resolve('apps/actions-worker/wrangler.jsonc'),'utf8')));
  const m=process.argv[2];
  if(m==='preflight'){
   console.log('Frozen/drained maintenance PASS '+await readOnlyMaintenancePreflight(process.env));
  }else if(m==='verify-new'){
   verifyMaintenanceSelection(process.env);
   verifyNewVersion(process.env.ACTIONS_EXPECTED_PROVIDER_VERSION,process.env.EXPECTED_VERSION_ID);
   console.log('Reviewed Provider Version ID advanced');
  }else if(m==='postflight'){
   const a=verifyMaintenanceSelection(process.env);
   verifyNewVersion(a.current,process.env.EXPECTED_VERSION_ID);
   await readOnlyMaintenancePreflight(process.env,fetch,process.env.EXPECTED_VERSION_ID);
   console.log('Bark-only Provider active; Consumer pinned to previous version and gate frozen pending separately authorized Consumer release');
  }else fail('unsupported mode');
 })().catch(e=>{console.error(e.message);process.exitCode=1});
}
