// Protected post-cutover maintenance gate. Read-only until a separately
// authorized GitHub Actions job deploys or rolls back the existing Worker.
// No secret values, D1 writes, domain mutations or automatic thaw occur here.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectActionsDeployment,verifyActionsSource} from './actions-release-guard.mjs';
import {verifyNativeEmpty,NATIVE_STATES} from './actions-protected-release.mjs';
import {verifyDomain} from './actions-owner-domain-handoff.mjs';

const WORKFLOW_DB='a4a477cd-6339-478c-ab7c-f7d87bb0d772';
const WEIXIN_DB='051c3b6d-e3bc-4d69-907f-37e8ab00618f';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const deny=why=>{throw Error('Actions maintenance blocked: '+why);};

export function verifyMaintenanceSelection(env){
 if(env.ACTIONS_MAINTENANCE_APPROVED!=='true'||env.ACTIONS_MAINTENANCE_QUIESCED!=='true')
  deny('Owner maintenance authorization and drain proof required');
 if(!['upgrade','rollback'].includes(env.ACTIONS_MAINTENANCE_OPERATION))
  deny('unreviewed maintenance operation');
 const current=env.ACTIONS_EXPECTED_PROVIDER_VERSION;
 const target=env.ACTIONS_ROLLBACK_TARGET_VERSION;
 if(!UUID.test(current??'')||env.ACTIONS_MAINTENANCE_OPERATION==='rollback'&&
   (!UUID.test(target??'')||target.toLowerCase()===current.toLowerCase())||
   env.ACTIONS_MAINTENANCE_OPERATION==='upgrade'&&target)
  deny('exact reviewed current/rollback version required');
 if(!/^(0|[1-9]\d*)$/.test(env.ACTIONS_EXPECTED_RECEIPTS??'')||
   !Number.isSafeInteger(Number(env.ACTIONS_EXPECTED_RECEIPTS)))
  deny('exact original receipt baseline required');
 if(!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID??'')||!env.CLOUDFLARE_API_TOKEN)
  deny('authenticated read-only preflight unavailable');
 return {operation:env.ACTIONS_MAINTENANCE_OPERATION,current,target,
  receipts:Number(env.ACTIONS_EXPECTED_RECEIPTS)};
}
export function verifyMaintenanceQuiescence(result){
 const row=result?.[0]?.results?.[0];
 if(!Array.isArray(result)||result.length!==1||result[0]?.success!==true||
    result[0].results?.length!==1||row?.state!=='frozen'||
    !Number.isSafeInteger(row.active_workflows)||row.active_workflows!==0||
    !Number.isSafeInteger(row.unsettled_runs)||row.unsettled_runs!==0)
   deny('Workflow gate not frozen, or active Workflows/unfinished Runs remain');
 return true;
}
export function verifyOriginalReceipts(result,expected){
 const row=result?.[0]?.results?.[0];
 if(!Array.isArray(result)||result.length!==1||result[0]?.success!==true||
    result[0].results?.length!==1||!Number.isSafeInteger(row.receipts)||
    row.receipts!==expected)deny('original Weixin receipt baseline changed');
 return true;
}
export function verifyConsumerBinding(result){
 const bindings=result?.bindings;
 const names=bindings?.filter(x=>x.type==='service'&&
  ['ACTIONS','WEIXIN_ACTION_PROVIDER','BARK_ACTION_PROVIDER'].includes(x.name));
 if(!Array.isArray(names)||names.length!==1||
   names[0].name!=='ACTIONS'||names[0].service!=='cloudflare-actions'||
   names[0].entrypoint!=='ActionsEntrypoint')
  deny('single private Workflow Actions binding changed');
 return true;
}
export function verifyNewVersion(before,after){
 if(!UUID.test(before??'')||!UUID.test(after??'')||before.toLowerCase()===after.toLowerCase())
  deny('new production Worker version not independently identified');
 return true;
}
export async function readOnlyMaintenancePreflight(env,fetcher=fetch){
 const approved=verifyMaintenanceSelection(env);
 // Existing Worker secrets and D1 are only inspected by name/identity.
 await inspectActionsDeployment(env,approved.current,fetcher);
 const root='https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID;
 const headers={Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,Accept:'application/json'};
 const read=async (path,sql,raw=false)=>{
  const response=await fetcher(root+path,{method:sql?'POST':'GET',headers:{
   ...headers,...(sql?{'Content-Type':'application/json'}:{})},
   ...(sql?{body:JSON.stringify({sql})}:{}),
   redirect:'manual',signal:AbortSignal.timeout(15000)});
  if(!response.ok)deny('Cloudflare read-only inventory unavailable');
  const payload=await response.json();
  if(payload?.success!==true||payload.result==null)
   deny('Cloudflare read-only inventory invalid');
  return raw?payload:payload.result;
 };
 const consumer=await read('/workers/scripts/workflow-mcp-worker/settings');
 verifyConsumerBinding(consumer);
 // A deploy without routes must not silently change the existing Owner domain.
 verifyDomain(await read('/workers/domains?hostname=weixin.lirtual.dpdns.org'),
  'cloudflare-actions');
 const q="SELECT state, (SELECT COUNT(*) FROM workflows WHERE deleted_at IS NULL AND state='active') active_workflows, (SELECT COUNT(*) FROM runs WHERE outcome IS NULL OR outcome NOT IN ('succeeded','failed','cancelled','indeterminate')) unsettled_runs FROM cloudflare_action_gate WHERE id=1";
 verifyMaintenanceQuiescence(await read('/d1/database/'+WORKFLOW_DB+'/query',q));
 verifyOriginalReceipts(await read('/d1/database/'+WEIXIN_DB+'/query',
  'SELECT COUNT(*) receipts FROM weixin_send_receipts'),approved.receipts);
 for(const status of NATIVE_STATES){
  const params=new URLSearchParams({status,per_page:'100'});
  verifyNativeEmpty(status,await read(
   '/workflows/workflow-mcp-orchestrator/instances?'+params,undefined,true));
 }
 return approved.current;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 (async()=>{
  const config=JSON.parse(readFileSync(resolve('apps/actions-worker/wrangler.jsonc'),'utf8'));
  verifyActionsSource(config);
  if(process.argv[2]==='preflight'){
   const version=await readOnlyMaintenancePreflight(process.env);
   console.log('Read-only, frozen and drained maintenance preflight passed: '+version);
  }else if(process.argv[2]==='verify-new'){
   verifyNewVersion(process.env.ACTIONS_EXPECTED_PROVIDER_VERSION,
    process.env.EXPECTED_VERSION_ID);
   console.log('New Worker Version ID differs from reviewed baseline');
  }else if(process.argv[2]==='postflight'){
   verifyMaintenanceSelection(process.env);
   verifyNewVersion(process.env.ACTIONS_EXPECTED_PROVIDER_VERSION,
    process.env.EXPECTED_VERSION_ID);
   await readOnlyMaintenancePreflight({...process.env,
    ACTIONS_MAINTENANCE_OPERATION:'upgrade',ACTIONS_ROLLBACK_TARGET_VERSION:'',
    ACTIONS_EXPECTED_PROVIDER_VERSION:process.env.EXPECTED_VERSION_ID});
   console.log('Maintenance version, Owner route, secrets, receipts and frozen Workflow independently verified');
  }else deny('unsupported maintenance mode');
 })().catch(e=>{console.error(e.message);process.exitCode=1});
}
