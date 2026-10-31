// First unified Worker publisher: source-verified, fail-closed, read-only preflight.
// No migration, owner unbind, domain transfer or external notification occurs here.
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {checkOwnerCutover} from './actions-owner-cutover-readback.mjs';
import {verifyActionsSource} from './actions-release-guard.mjs';
const ID='051c3b6d-e3bc-4d69-907f-37e8ab00618f';
const WORKFLOW_DB='a4a477cd-6339-478c-ab7c-f7d87bb0d772';
export const NATIVE_STATES=Object.freeze(['queued','running','paused','waiting','waitingForPause','rollingBack']);
const stop=reason=>{throw Error('Unified Actions publication blocked: '+reason);};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function verifyNativeEmpty(status,response){
 if(!NATIVE_STATES.includes(status))stop('unsupported native status');
 const info=response?.result_info;
 if(response?.success!==true||!Array.isArray(response.result)||
    !Number.isSafeInteger(info?.count)||info.count!==response.result.length||
    (info?.cursor!==undefined&&info.cursor!==null&&info.cursor!=='')||
    (info?.next_cursor!==undefined&&info.next_cursor!==null&&info.next_cursor!=='')||
    (info?.total_pages!==undefined&&(!Number.isSafeInteger(info.total_pages)||info.total_pages>1))||
    (info?.total_count!==undefined&&(!Number.isSafeInteger(info.total_count)||info.total_count!==0))||
    info.count!==0)stop('old native Workflow instances or incomplete inventory');
 return true;
}
export function verifyFrozen(rows){
 if(!Array.isArray(rows)||rows.length!==1||rows[0]?.success!==true||
    rows[0].results?.length!==1||rows[0].results[0].state!=='frozen')
   stop('Workflow D1 migration fence not frozen');
 return true;
}
export function verifyLegacyBindings(bindings){
 const relevant=bindings?.filter(x=>x.type==='service'&&
  ['WEIXIN_ACTION_PROVIDER','BARK_ACTION_PROVIDER','ACTIONS'].includes(x.name));
 const expected=[['WEIXIN_ACTION_PROVIDER','weixin-mcp-worker','WeixinActionProvider'],
  ['BARK_ACTION_PROVIDER','bark-provider','BarkActionProvider']];
 if(!Array.isArray(relevant)||relevant.length!==2||
    expected.some(([name,service,entrypoint])=>
     relevant.filter(x=>x.name===name&&x.service===service&&x.entrypoint===entrypoint).length!==1))
  stop('existing Workflow Action Service Binding topology drift');
 return true;
}
// First release only: new encryption identity, generated on the authorized release Runner.
// Its byte value is never written to GitHub logs or stored in repository source.
export const generateFreshWeixinKey=()=>randomBytes(32).toString('base64');
export function validatedSecrets(env){
 const weixin=env.WEIXIN_ENCRYPTION_KEY,device=env.BARK_DEVICE_KEY,bark=env.BARK_ENCRYPTION_KEY;
 if(typeof weixin!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(weixin)||
    Buffer.from(weixin,'base64').length!==32||Buffer.from(weixin,'base64').toString('base64')!==weixin||
    !/^[A-Za-z0-9]{12,128}$/.test(device??'')||typeof bark!=='string'||
    !/^[\x20-\x7e]{32}$/.test(bark))stop('new Worker private key inventory/format invalid');
 return {WEIXIN_ENCRYPTION_KEY:weixin,BARK_DEVICE_KEY:device,BARK_ENCRYPTION_KEY:bark};
}
export function parsePublishedVersion(log){
 const ids=[...String(log).matchAll(/(?:^|\n)(?:Current )?Version ID:\s*([a-f0-9-]{36})/gi)].map(m=>m[1]);
 if(ids.length!==1||!uuid.test(ids[0]))stop('unverified Wrangler version ID');
 return ids[0];
}
export async function readOnlyPreflight(env,fetcher=fetch){
 if(env.ACTIONS_OLD_INGRESS_QUIESCED!=='true')stop('old ingress quiescence not independently confirmed');
 if(!/^(0|[1-9]\d*)$/.test(env.ACTIONS_EXPECTED_RECEIPTS??''))stop('trusted historical receipt baseline missing');
 const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN;
 if(!/^[a-f0-9]{32}$/i.test(account??'')||!token)stop('authenticated Cloudflare release preflight unavailable');
 const root='https://api.cloudflare.com/client/v4/accounts/'+account;
 const headers={Authorization:'Bearer '+token,Accept:'application/json'};
 const request=async(path,sql,fullResponse=false)=>{
  const res=await fetcher(root+path,{method:sql?'POST':'GET',redirect:'manual',headers:{...headers,
   ...(sql?{'Content-Type':'application/json'}:{})},...(sql?{body:JSON.stringify({sql})}:{}),signal:AbortSignal.timeout(15000)});
  if(!res.ok)stop('Cloudflare read-only preflight HTTP unavailable');
  const data=await res.json();
  if(data?.success!==true||data.result==null)stop('Cloudflare read-only preflight response unavailable');
  return fullResponse?data:data.result;
 };
 const settings=await request('/workers/scripts/workflow-mcp-worker/settings');
 verifyLegacyBindings(settings.bindings);
 // This workflow is only for the FIRST staged Worker; later releases require
 // a separately reviewed version/Plan compatibility release path.
 const existing=await fetcher(root+'/workers/scripts/cloudflare-actions/settings',{
  method:'GET',redirect:'manual',headers,signal:AbortSignal.timeout(15000)});
 if(existing.status!==404)stop('unified Worker already exists or its absence is unverified');
 const freeze=await request('/d1/database/'+WORKFLOW_DB+'/query',
  "SELECT state FROM cloudflare_action_gate WHERE id=1");
 verifyFrozen(freeze);
 for(const status of NATIVE_STATES){
  const query=new URLSearchParams({status,per_page:'100'});
  const result=await request('/workflows/workflow-mcp-orchestrator/instances?'+query,undefined,true);
  verifyNativeEmpty(status,result);
 }
 const owner=await request('/d1/database/'+ID+'/query',
  `SELECT state,generation,CASE WHEN session_ciphertext IS NULL THEN NULL ELSE 'set' END session_ciphertext,
   CASE WHEN session_key_id IS NULL THEN NULL ELSE 'set' END session_key_id,
   lease_holder,lease_until,
   (SELECT COUNT(*) FROM weixin_pairing WHERE phase!='expired' OR ciphertext IS NOT NULL OR key_id IS NOT NULL) pending_pairings,
   (SELECT COUNT(*) FROM weixin_send_receipts) receipt_count FROM weixin_binding WHERE id=1`);
 const checked=checkOwnerCutover(owner,env.ACTIONS_EXPECTED_RECEIPTS);
 if(checked.receipts!==Number(env.ACTIONS_EXPECTED_RECEIPTS))
  stop('historical receipt count changed after Owner baseline');
 return true;
}
async function main(){
 const [mode,arg]=process.argv.slice(2);
 const config=JSON.parse(await readFile(resolve('apps/actions-worker/wrangler.jsonc'),'utf8'));
 verifyActionsSource(config);
 if(mode==='preflight'){
  await readOnlyPreflight(process.env);
  console.log('Protected Actions cutover D1/Owner/legacy-binding preflight verified; not a deployment');
 }else if(mode==='secrets'){
  const dir=process.env.RUNNER_TEMP;
  if(!dir||!arg||resolve(arg)!==join(resolve(dir),'actions-cutover-secrets.json'))stop('untrusted secret staging path');
  const credentials=validatedSecrets({...process.env,
   WEIXIN_ENCRYPTION_KEY:generateFreshWeixinKey()});
  await writeFile(arg,JSON.stringify(credentials),{flag:'wx',mode:0o600});
  console.log('Validated private Worker secrets staged without output');
 }else if(mode==='version'){
  if(!arg)stop('missing Wrangler log');
  console.log(parsePublishedVersion(await readFile(arg,'utf8')));
 }else stop('unknown protected release operation');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)
 main().catch(e=>{console.error(e.message);process.exitCode=1});
