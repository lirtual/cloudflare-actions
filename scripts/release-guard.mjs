import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const WORKER='weixin-mcp-worker';
const D1_ID='051c3b6d-e3bc-4d69-907f-37e8ab00618f';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requireOk=(ok,message)=>{if(!ok)throw Error(message);};

export function assertOldPublisherDisabled(source){
  requireOk(typeof source==='string'&&source.length>100&&!source.includes(WORKER),
    'Legacy GitHub release still permits or cannot disprove Weixin publishing');
}
export async function checkSinglePublisher(transport=fetch){
  const get=async(path)=>{
    const r=await transport('https://api.github.com/repos/lirtual/mcp-workers'+path,{
      headers:{Accept:'application/vnd.github+json','User-Agent':'weixin-provider-release'},
      signal:AbortSignal.timeout(15000)});
    requireOk(r.ok,'Legacy release status could not be checked (HTTP '+r.status+')');
    return r.json();
  };
  const ref=await get('/git/ref/heads/main');
  const sha=ref?.object?.sha;
  requireOk(typeof sha==='string'&&/^[a-f0-9]{40}$/.test(sha),'Legacy main SHA not confirmed');
  const file=await get('/contents/.github/workflows/release.yml?ref='+sha);
  requireOk(file?.encoding==='base64'&&typeof file?.content==='string','Legacy release source missing');
  assertOldPublisherDisabled(Buffer.from(file.content.replace(/\s/g,''),'base64').toString('utf8'));
  for(const state of ['queued','in_progress','waiting','requested','pending']){
    const runs=await get('/actions/workflows/release.yml/runs?status='+state+'&per_page=100');
    requireOk(runs?.total_count===0&&Array.isArray(runs?.workflow_runs)&&
      runs.workflow_runs.length===0,'Old release not drained: '+state);
  }
}
export function assertReviewedConfig(conf){
  requireOk(conf?.name===WORKER&&conf?.main==='src/index.ts'&&conf.keep_vars===false,
    'Worker source/release config drift');
  requireOk(conf.version_metadata?.binding==='CF_VERSION_METADATA','Worker Version Metadata not bound');
  requireOk(conf.d1_databases?.length===1&&conf.d1_databases[0]?.binding==='DB'&&
    conf.d1_databases[0]?.database_name==='weixin-mcp-db'&&
    conf.d1_databases[0]?.database_id===D1_ID,'Weixin D1 identity drift');
  const hosts=conf.routes?.map(x=>x.custom_domain===true&&x.pattern).sort();
  requireOk(JSON.stringify(hosts)===JSON.stringify(['weixin.lirtual.dpdns.org']),
    'Weixin domain ownership drift');
  requireOk(JSON.stringify(conf.secrets?.required)===
    JSON.stringify(['WEIXIN_ENCRYPTION_KEY']),'Weixin Secret inventory drift');
  requireOk(!Object.prototype.hasOwnProperty.call(conf.vars??{},'MCP_HOST'),
    'Retired public MCP host variable reintroduced');
}
export function verifyReadback(settings,secrets,deployments,expectedVersion,scriptSettings){
  requireOk(Array.isArray(settings?.bindings),'Worker bindings unreadable');
  const find=(name,type)=>settings.bindings.filter(x=>x.name===name&&x.type===type);
  requireOk(find('DB','d1').length===1&&find('DB','d1')[0].id===D1_ID,
    'Production D1 binding identity drift');
  requireOk(find('ADMIN_HOST','plain_text').length===1&&
    find('ADMIN_HOST','plain_text')[0].text==='weixin.lirtual.dpdns.org',
    'Production owner host drift');
  requireOk(Array.isArray(secrets)&&secrets.filter(y=>y.name==='WEIXIN_ENCRYPTION_KEY').length===1&&
    find('WEIXIN_ENCRYPTION_KEY','secret_text').length===1,
    'Production inherited encryption Secret missing');
  // Preflight may still observe the currently deployed legacy MCP bindings.
  // Once a new version is deployed, keep_vars=false must remove MCP_HOST.
  if(expectedVersion){
    requireOk(find('MCP_HOST','plain_text').length===0,
      'Legacy MCP host still present after Provider release');
    requireOk(find('MCP_ACCESS_TOKEN','secret_text').length===0 &&
      !secrets.some(x=>x.name==='MCP_ACCESS_TOKEN'),
      'Legacy MCP Bearer Secret still present after Provider release');
  }
  if(scriptSettings!==undefined)requireOk(
    scriptSettings?.observability?.logs?.invocation_logs===false,
    'Production Worker invocation logging must remain disabled');
  const versions=deployments?.deployments?.[0]?.versions;
  requireOk(Array.isArray(versions)&&versions.length===1&&versions[0].percentage===100&&
    UUID.test(versions[0].version_id),'Active Worker Version ID / traffic cannot be proven');
  if(expectedVersion)requireOk(versions[0].version_id===expectedVersion,
    'Published Worker Version ID differs from readback');
  return versions[0].version_id;
}
export async function checkCloudflare(env,expectedVersion,transport=fetch){
  const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN;
  requireOk(typeof account==='string'&&/^[a-f0-9]{32}$/i.test(account)&&
    typeof token==='string'&&token.length>15,'Cloudflare read-only access unavailable');
  const get=async(endpoint)=>{
    const r=await transport('https://api.cloudflare.com/client/v4/accounts/'+account+
      '/workers/scripts/'+WORKER+endpoint,{
      headers:{Authorization:'Bearer '+token,Accept:'application/json'},
      signal:AbortSignal.timeout(15000)});
    requireOk(r.ok,'Cloudflare readback HTTP failure: '+endpoint);
    const x=await r.json();requireOk(x?.success===true&&x.result!=null,
      'Cloudflare readback incomplete: '+endpoint);return x.result;
  };
  const [settings,secrets,deployments,scriptSettings]=await Promise.all([
    get('/settings'),get('/secrets'),get('/deployments?per_page=1'),
    get('/script-settings')]);
  return verifyReadback(settings,secrets,deployments,expectedVersion,scriptSettings);
}
export function parseVersion(log){
  const ids=[...log.matchAll(/Version ID:\s*([0-9a-f-]{36})/gi)].map(x=>x[1]);
  requireOk(ids.length===1&&UUID.test(ids[0]),'Wrangler published Version ID not confirmed');
  return ids[0];
}
async function main(){
  const [mode,arg]=process.argv.slice(2);
  const conf=JSON.parse(await readFile(new URL('../apps/weixin-mcp-worker/wrangler.jsonc',import.meta.url)));
  assertReviewedConfig(conf);
  if(mode==='legacy')await checkSinglePublisher();
  else if(mode==='preflight'||mode==='readback'){
    const expected=mode==='readback'?process.env.EXPECTED_VERSION_ID:undefined;
    if(mode==='readback')requireOk(typeof expected==='string'&&UUID.test(expected),
      'Expected published Version ID missing');
    const version=await checkCloudflare(process.env,expected);
    console.log('Weixin deployment readback passed; active Version ID: '+version);
  }else if(mode==='version'){
    requireOk(!!arg,'Wrangler log not supplied');
    console.log(parseVersion(await readFile(arg,'utf8')));
  }else throw Error('Unsupported release operation');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(e=>{console.error('Weixin release blocked: '+e.message);process.exitCode=1;});
