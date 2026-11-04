import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectActionsDeployment,verifyActionsSource} from './actions-release-guard.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WF='a4a477cd-6339-478c-ab7c-f7d87bb0d772';
const OPERATIONS=new Set(['upgrade','compatible-upgrade','rollback']);
const REQUIRED_BINDINGS=new Map([['BARK_DEVICE_KEY','secret_text'],
 ['BARK_ENCRYPTION_KEY','secret_text'],['CF_VERSION_METADATA','version_metadata']]);
const RETAINED_PLAINTEXT=new Set(['ACCESS_AUD','ACCESS_TEAM_DOMAIN','ADMIN_HOST','OWNER_EMAIL']);
export const NATIVE_STATES=Object.freeze(['queued','running','paused','waiting','waitingForPause','rollingBack']);
const fail=x=>{throw Error('Actions maintenance blocked: '+x);};

export function verifyMaintenanceSelection(e){
 const operation=e.ACTIONS_MAINTENANCE_OPERATION;
 if(e.ACTIONS_MAINTENANCE_APPROVED!=='true'||!OPERATIONS.has(operation))
  fail('exact Owner-approved operation required');
 const compatible=operation==='compatible-upgrade';
 if(compatible){
  if(e.ACTIONS_COMPATIBILITY_REVIEWED!=='true'||e.ACTIONS_MAINTENANCE_QUIESCED!=='false')
   fail('compatible behavior review and no-freeze selection required');
 }else if(e.ACTIONS_MAINTENANCE_QUIESCED!=='true'||e.ACTIONS_COMPATIBILITY_REVIEWED!=='false')
  fail('frozen/drained operation required');
 if(!UUID.test(e.ACTIONS_EXPECTED_PROVIDER_VERSION??'')||
    !UUID.test(e.ACTIONS_EXPECTED_CONSUMER_VERSION??'')||
    !/^[a-f0-9]{32}$/i.test(e.CLOUDFLARE_ACCOUNT_ID??'')||
    !e.CLOUDFLARE_API_TOKEN)fail('unverified identity or receipt baseline');
 const target=e.ACTIONS_ROLLBACK_TARGET_VERSION??'';
 if(operation==='rollback'){
  if(!UUID.test(target)||target.toLowerCase()===e.ACTIONS_EXPECTED_PROVIDER_VERSION.toLowerCase())
   fail('exact distinct rollback target required');
 }else if(target)fail('rollback target only permitted for rollback');
 return {current:e.ACTIONS_EXPECTED_PROVIDER_VERSION,
  consumer:e.ACTIONS_EXPECTED_CONSUMER_VERSION,operation,target};
}

export function verifyAdmissionState(x,operation){
 const r=x?.[0]?.results?.[0];
 if(!Array.isArray(x)||x.length!==1||x[0].success!==true||
   x[0].results.length!==1||!Number.isInteger(r?.active_workflows)||
   !Number.isInteger(r?.unsettled_runs)||r.active_workflows<0||r.unsettled_runs<0)
  fail('invalid Workflow admission and Run state');
 if(operation==='compatible-upgrade'){
  if(r.state!=='open')fail('compatible update requires open admission gate');
 }else if(r.state!=='frozen'||r.active_workflows!==0||r.unsettled_runs!==0)
  fail('gate not frozen or Workflow not drained');
 return true;
}

export function verifyConsumerBinding(x){
 const b=x?.bindings;
 if(!Array.isArray(b)||b.filter(v=>v.type==='service').length!==1||
    b.filter(v=>v.name==='ACTIONS'&&v.type==='service'&&
      v.service==='cloudflare-actions'&&v.entrypoint==='ActionsEntrypoint').length!==1)
  fail('actual trusted Consumer ACTIONS Service Binding drift');
 // The old Consumer pins deployment UUIDs at runtime. Absence of the old
 // binding is the minimally sufficient first-cutover compatibility witness.
 if(b.some(v=>['ACTIONS_DEPLOYMENT_ID','WEIXIN_ACTION_DEPLOYMENT_ID',
   'BARK_ACTION_DEPLOYMENT_ID'].includes(v.name)))
  fail('Consumer compatibility cutover not verified: legacy pin remains');
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

// Only previously deployed, retained Bark-only versions may be rollback
// candidates. No arbitrary old Weixin script or binding may be resurrected.
export function verifyBarkOnlyVersion(v,expected){
 if(v?.id!==expected||v.main_module!=='index.js'||!Array.isArray(v.bindings))
  fail('rollback version identity or module unavailable');
 const seen=new Set();
 for(const b of v.bindings){
  if(typeof b?.name!=='string'||seen.has(b.name))fail('duplicate version binding');
  seen.add(b.name);
  if(REQUIRED_BINDINGS.has(b.name)){
   if(b.type!==REQUIRED_BINDINGS.get(b.name))fail('Bark secret/metadata binding drift');
  }else if(!RETAINED_PLAINTEXT.has(b.name)||b.type!=='plain_text')
   fail('unreviewed historical Provider binding');
 }
 if([...REQUIRED_BINDINGS.keys()].some(k=>!seen.has(k)))
  fail('Bark-only required binding absent');
 return true;
}

export function verifyPriorDeployment(d,current,target){
 const items=d?.deployments;
 if(!Array.isArray(items)||items.length!==2)fail('previous 100% deployment not proven');
 for(const item of items){
  const vs=item?.versions;
  if(!Array.isArray(vs)||vs.length!==1||vs[0].percentage!==100||!UUID.test(vs[0].version_id??''))
   fail('split or malformed previous deployment');
 }
 if(items[0].versions[0].version_id.toLowerCase()!==current.toLowerCase()||
    items[1].versions[0].version_id.toLowerCase()!==target.toLowerCase())
  fail('rollback target is not the immediately previous 100% deployment');
 return true;
}

export function verifyNewVersion(before,after){
 if(!UUID.test(before??'')||!UUID.test(after??'')||before.toLowerCase()===after.toLowerCase())
  fail('no independently verified new Provider version');
 return true;
}

export async function readOnlyMaintenancePreflight(
 e,fetcher=fetch,liveProvider=e.ACTIONS_EXPECTED_PROVIDER_VERSION,phase='before'){
 const a=verifyMaintenanceSelection(e);
 if(!UUID.test(liveProvider))fail('invalid Provider readback version');
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
 verifyConsumerBinding(await read('/workers/scripts/workflow-mcp-worker/settings'));
 const sql="SELECT state,(SELECT COUNT(*) FROM workflows WHERE deleted_at IS NULL AND state='active') active_workflows,(SELECT COUNT(*) FROM runs WHERE outcome NOT IN ('succeeded','failed','cancelled','indeterminate')) unsettled_runs FROM cloudflare_action_gate WHERE id=1";
 verifyAdmissionState(await read('/d1/database/'+WF+'/query',sql),a.operation);
 // A compatible update must not pause active Workflows or hold their Sessions.
 if(a.operation!=='compatible-upgrade'){
  for(const s of NATIVE_STATES){
   const p=new URLSearchParams({status:s,per_page:'100'});
   verifyNativeEmpty(s,await read('/workflows/workflow-mcp-orchestrator/instances?'+p,undefined,true));
  }
 }
 const getVersion=id=>read('/workers/workers/cloudflare-actions/versions/'+id);
 verifyBarkOnlyVersion(await getVersion(liveProvider),liveProvider);
 if(phase==='before'&&a.operation==='rollback'){
  const deployed=await read('/workers/scripts/cloudflare-actions/deployments?per_page=2');
  verifyPriorDeployment(deployed,a.current,a.target);
  verifyBarkOnlyVersion(await getVersion(a.target),a.target);
 }
 if(phase==='after'&&a.operation!=='rollback'){
  // Ensure the previously serving Bark-only version is still retained
  // as the exact recovery candidate after source deployment.
  verifyBarkOnlyVersion(await getVersion(a.current),a.current);
 }
 return liveProvider;
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 (async()=>{
  verifyActionsSource(JSON.parse(readFileSync(resolve('apps/actions-worker/wrangler.jsonc'),'utf8')));
  const m=process.argv[2];
  if(m==='preflight'){
   console.log('Reviewed maintenance preflight PASS '+await readOnlyMaintenancePreflight(process.env));
  }else if(m==='verify-new'){
   const a=verifyMaintenanceSelection(process.env);
   const version=process.env.EXPECTED_VERSION_ID;
   if(a.operation==='rollback'){
    if(version!==a.target)fail('rollback did not select reviewed exact target');
   }else verifyNewVersion(a.current,version);
   console.log('Reviewed Provider selection verified');
  }else if(m==='postflight'){
   const a=verifyMaintenanceSelection(process.env);
   const version=process.env.EXPECTED_VERSION_ID;
   if(a.operation==='rollback'){
    if(version!==a.target)fail('rollback target identity drift');
   }else verifyNewVersion(a.current,version);
   await readOnlyMaintenancePreflight(process.env,fetch,version,'after');
   console.log(a.operation==='compatible-upgrade'
    ? 'Compatible Bark-only Provider active; Workflow admission remains open'
    : 'Reviewed Bark-only Provider active; frozen gate requires separately authorized reopen');
  }else fail('unsupported mode');
 })().catch(e=>{console.error(e.message);process.exitCode=1});
}
