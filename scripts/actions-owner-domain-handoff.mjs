// One protected Owner-domain cutover step in the existing Actions release workflow.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {verifyNativeEmpty,NATIVE_STATES} from './actions-protected-release.mjs';
import {verifyActionsPreflight} from './actions-release-guard.mjs';
import {checkOwnerCutover} from './actions-owner-cutover-readback.mjs';
const HOST='weixin.lirtual.dpdns.org', ZONE='36c4f02ddad481e5245b5f31a91f7222';
const OLD='weixin-mcp-worker', NEW='cloudflare-actions';
const WF_DB='a4a477cd-6339-478c-ab7c-f7d87bb0d772',WX_DB='051c3b6d-e3bc-4d69-907f-37e8ab00618f';
const fail=x=>{throw Error('Actions Owner domain blocked: '+x);};
const VERSION=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function verifyDomain(domains,service){
 const all=domains?.filter(d=>d.hostname===HOST);
 if(!Array.isArray(all)||all.length!==1||all[0].service!==service||
  all[0].zone_id!==ZONE||all[0].enabled!==true||
  all[0].environment!=='production'||typeof all[0].id!=='string'||!all[0].id)
  fail('unexpected Owner domain routing');
 return all[0].id;
}
export function verifyFrozenSnapshot(rows){
 const d=rows?.[0]?.results?.[0];
 if(rows?.length!==1||rows[0]?.success!==true||rows[0].results.length!==1||
    d.state!=='frozen'||d.migration_count!==1||d.active_workflows!==0||
    !Number.isSafeInteger(d.paused_workflows)||d.paused_workflows<1||
    d.unsettled_runs!==0)fail('Workflow not fully quiesced/frozen');
 return true;
}
export function routingPlan(mode,expectedVersion){
 if(!['transfer','rollback'].includes(mode)||!VERSION.test(expectedVersion??''))
  fail('unreviewed route operation or version');
 return {from:mode==='transfer'?OLD:NEW,to:mode==='transfer'?NEW:OLD};
}
export async function executeHandoff(env=process.env,fetcher=fetch){
 if(env.ACTIONS_OLD_INGRESS_QUIESCED!=='true'||env.ACTIONS_OWNER_DOMAIN_APPROVED!=='true')
  fail('Owner cutover approval and ingress drain missing');
 const {from,to}=routingPlan(env.ACTIONS_DOMAIN_OPERATION,env.ACTIONS_EXPECTED_PROVIDER_VERSION);
 if(!/^[0-9a-f]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID??'')||
    !env.CLOUDFLARE_API_TOKEN||!/^(0|[1-9]\d*)$/.test(env.ACTIONS_EXPECTED_RECEIPTS??''))
  fail('account authorization or receipt baseline missing');
 const root='https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID;
 const headers={Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,Accept:'application/json'};
 const api=async(path,method='GET',body)=>{
  const response=await fetcher(root+path,{method,headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),redirect:'manual',signal:AbortSignal.timeout(15000)});
  if(!response.ok)fail('Cloudflare request rejected or response unknown');
  const d=await response.json();if(d?.success!==true||d.result==null)
   fail('Cloudflare API response unavailable');
  return d.result;
 };
 const before=await api('/workers/domains?per_page=100');
 const domain=verifyDomain(before,from);
 const sql="SELECT state, (SELECT COUNT(*) FROM d1_migrations WHERE name='0018_cloudflare_action_migration_fence.sql') migration_count, (SELECT COUNT(*) FROM workflows WHERE deleted_at IS NULL AND state='active') active_workflows, (SELECT COUNT(*) FROM workflows WHERE deleted_at IS NULL AND state='paused') paused_workflows, (SELECT COUNT(*) FROM runs WHERE outcome IS NULL OR outcome NOT IN ('succeeded','failed','cancelled','indeterminate')) unsettled_runs FROM cloudflare_action_gate WHERE id=1";
 verifyFrozenSnapshot(await api('/d1/database/'+WF_DB+'/query','POST',{sql}));
 for(const status of NATIVE_STATES){
  const response=await fetcher(root+'/workflows/workflow-mcp-orchestrator/instances?status='+status+'&per_page=100',
   {headers,redirect:'manual',signal:AbortSignal.timeout(15000)});
  if(!response.ok)fail('native Workflow inventory unavailable');
  verifyNativeEmpty(status,await response.json());
 }
 if(env.ACTIONS_DOMAIN_OPERATION==='transfer'){
  const ownerSql=`SELECT state,generation,CASE WHEN session_ciphertext IS NULL THEN NULL ELSE 'set' END session_ciphertext,
 CASE WHEN session_key_id IS NULL THEN NULL ELSE 'set' END session_key_id,lease_holder,lease_until,
 (SELECT COUNT(*) FROM weixin_pairing WHERE phase!='expired' OR ciphertext IS NOT NULL OR key_id IS NOT NULL) pending_pairings,
 (SELECT COUNT(*) FROM weixin_send_receipts) receipt_count FROM weixin_binding WHERE id=1`;
  checkOwnerCutover(await api('/d1/database/'+WX_DB+'/query','POST',{sql:ownerSql}),env.ACTIONS_EXPECTED_RECEIPTS);
 }
 const [versions,settings,secrets]=await Promise.all([
  api('/workers/scripts/'+NEW+'/deployments?per_page=1'),
  api('/workers/scripts/'+NEW+'/settings'),api('/workers/scripts/'+NEW+'/secrets')]);
 const version=verifyActionsPreflight({activeVersions:versions,settings,secrets});
 if(version.toLowerCase()!==env.ACTIONS_EXPECTED_PROVIDER_VERSION.toLowerCase())
  fail('exact active Provider version changed');
 if(to===OLD)await api('/workers/scripts/'+OLD+'/settings');
 const fresh=await api('/workers/domains?per_page=100');
 if(verifyDomain(fresh,from)!==domain)fail('domain changed before write');
 // Exactly one approved route update. Never retry a request with unknown outcome.
 await api('/workers/domains','PUT',{hostname:HOST,service:to,zone_id:ZONE});
 const result=await api('/workers/domains?per_page=100');
 verifyDomain(result,to);
 console.log('Owner domain route moved to '+to+' and independently verified; no Worker deployed');
 return {target:to};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)
 executeHandoff().catch(error=>{console.error(error.message);process.exitCode=1;});
