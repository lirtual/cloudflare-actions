import {readFile,writeFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
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
  requireOk(JSON.stringify(hosts)===JSON.stringify([
    'weixin-mcp.lirtual.dpdns.org','weixin.lirtual.dpdns.org'].sort()),
    'Weixin domain ownership drift');
  requireOk(JSON.stringify(conf.secrets?.required)===
    JSON.stringify(['MCP_ACCESS_TOKEN','WEIXIN_ENCRYPTION_KEY']),'Weixin Secret inventory drift');
}
export function stageSecrets(env){
  const key=env.WEIXIN_ENCRYPTION_KEY;
  requireOk(typeof env.MCP_ACCESS_TOKEN==='string'&&env.MCP_ACCESS_TOKEN.trim().length>0,
    'Missing MCP_ACCESS_TOKEN');
  requireOk(typeof key==='string'&&/^[A-Za-z0-9+/]{43}=$/.test(key)&&
    Buffer.from(key,'base64').length===32&&
    Buffer.from(key,'base64').toString('base64')===key,'WEIXIN_ENCRYPTION_KEY not canonical 32-byte Base64');
  return {MCP_ACCESS_TOKEN:env.MCP_ACCESS_TOKEN,WEIXIN_ENCRYPTION_KEY:key};
}
export function verifyReadback(settings,secrets,deployments,expectedVersion,scriptSettings){
  requireOk(Array.isArray(settings?.bindings),'Worker bindings unreadable');
  const find=(name,type)=>settings.bindings.filter(x=>x.name===name&&x.type===type);
  requireOk(find('DB','d1').length===1&&find('DB','d1')[0].id===D1_ID,
    'Production D1 binding identity drift');
  for(const [name,host] of Object.entries({
    MCP_HOST:'weixin-mcp.lirtual.dpdns.org',ADMIN_HOST:'weixin.lirtual.dpdns.org'
  }))requireOk(find(name,'plain_text').length===1&&find(name,'plain_text')[0].text===host,
    'Production host variable drift: '+name);
  requireOk(Array.isArray(secrets)&&['MCP_ACCESS_TOKEN','WEIXIN_ENCRYPTION_KEY'].every(
    x=>secrets.filter(y=>y.name===x).length===1),'Production secrets inventory incomplete');
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
export async function verifyExistingOwnerKeyProof(receipt,stagedSecrets){
  const rows=receipt?.[0]?.results;
  requireOk(Array.isArray(rows)&&rows.length===1,'Owner ciphertext readback unavailable');
  const row=rows[0];
  requireOk(Number.isSafeInteger(row?.generation)&&row.generation>=1&&
    typeof row.session_ciphertext==='string'&&row.session_ciphertext.length>30&&
    typeof row.session_key_id==='string'&&row.session_key_id.length>0,
    'Existing Owner ciphertext proof unavailable');
  const {decrypt}=await import('../apps/weixin-mcp-worker/src/crypto.ts');
  let credentials;
  try{
    credentials=await decrypt({WEIXIN_ENCRYPTION_KEY:stagedSecrets.WEIXIN_ENCRYPTION_KEY},
      'weixin:owner:binding:'+row.generation,row.session_ciphertext,row.session_key_id);
  }catch{throw Error('Staged key cannot decrypt existing Owner binding');}
  requireOk(credentials&&typeof credentials.botToken==='string'&&
    typeof credentials.ownerId==='string'&&typeof credentials.contextToken==='string',
    'Existing binding decrypted with invalid shape');
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
  }else if(mode==='keyproof'){
    const [ciphertextFile,secretFile]=[arg,process.argv[4]];
    requireOk(!!ciphertextFile&&!!secretFile&&!!process.env.RUNNER_TEMP&&
      [ciphertextFile,secretFile].every(path=>resolve(path).startsWith(
        resolve(process.env.RUNNER_TEMP)+sep)),
      'Key proof files must stay in runner temporary directory');
    const [receipt,values]=await Promise.all([readFile(ciphertextFile,'utf8'),
      readFile(secretFile,'utf8')]);
    await verifyExistingOwnerKeyProof(JSON.parse(receipt),JSON.parse(values));
    console.log('Existing encrypted Owner binding verified using staged key (contents withheld)');
  }else if(mode==='secrets'){
    requireOk(!!arg&&!!process.env.RUNNER_TEMP&&
      resolve(arg).startsWith(resolve(process.env.RUNNER_TEMP)+sep),
      'Secret file must be stored in runner temporary directory');
    await writeFile(arg,JSON.stringify(stageSecrets(process.env)),{mode:0o600,flag:'wx'});
    console.log('Secrets staged without exposing values');
  }else if(mode==='version'){
    requireOk(!!arg,'Wrangler log not supplied');
    console.log(parseVersion(await readFile(arg,'utf8')));
  }else throw Error('Unsupported release operation');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(e=>{console.error('Weixin release blocked: '+e.message);process.exitCode=1;});
