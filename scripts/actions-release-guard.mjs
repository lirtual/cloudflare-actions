import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
// Historical Weixin secrets can still be physically present until T7.
export function parsePublishedVersion(log){
 const found=[...String(log).matchAll(/(?:^|\n)(?:Current )?Version ID:\s*([0-9a-f-]{36})/gi)]
   .map(m=>m[1]);
 if(found.length!==1||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(found[0]))
  throw Error('Actions release blocked: ambiguous Wrangler version log');
 return found[0];
}
export const REQUIRED_KEYS=Object.freeze(['BARK_DEVICE_KEY','BARK_ENCRYPTION_KEY']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=why=>{throw Error('Actions release blocked: '+why);};
export function verifyActionsSource(c){
 if(c?.name!=='cloudflare-actions'||c.main!=='src/index.ts'||
   c.workers_dev!==false||c.preview_urls!==false||
   c.version_metadata?.binding!=='CF_VERSION_METADATA'||c.routes?.length||
   c.route||c.d1_databases?.length||c.services?.length||c.workflows?.length||
   c.vars&&Object.keys(c.vars).length||
   JSON.stringify([...(c.secrets?.required??[])].sort())!==
     JSON.stringify([...REQUIRED_KEYS].sort()))
  fail('Bark-only static source/config not proven');
 return true;
}
export function verifyActionsPreflight({activeVersions,settings,secrets}){
 const v=activeVersions?.deployments?.[0]?.versions,b=settings?.bindings;
 if(!Array.isArray(v)||v.length!==1||v[0].percentage!==100||
   !UUID.test(v[0].version_id??'')||!Array.isArray(b)||!Array.isArray(secrets))
  fail('actual production Worker identity unavailable');
 for(const k of REQUIRED_KEYS)
  if(b.filter(x=>x.name===k&&x.type==='secret_text').length!==1||
     secrets.filter(x=>x.name===k).length!==1)fail('Bark binding absent: '+k);
 if(b.filter(x=>x.name==='CF_VERSION_METADATA'&&x.type==='version_metadata').length!==1||
    b.some(x=>x.type==='service'||x.name==='MCP_ACCESS_TOKEN'))
  fail('unexpected binding/identity');
 return v[0].version_id;
}
export async function inspectActionsDeployment(env,expected,fetcher=fetch){
 if(!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID??'')||
    !env.CLOUDFLARE_API_TOKEN||!UUID.test(expected??''))
  fail('authenticated exact-version readback required');
 const root='https://api.cloudflare.com/client/v4/accounts/'+
   env.CLOUDFLARE_ACCOUNT_ID+'/workers/scripts/cloudflare-actions';
 const get=async p=>{
  const res=await fetcher(root+p,{redirect:'manual',headers:{
   Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,Accept:'application/json'},
   signal:AbortSignal.timeout(15000)});
  if(!res.ok)fail('Cloudflare readback unavailable');
  const body=await res.json();
  if(body?.success!==true||body.result==null)fail('Cloudflare response invalid');
  return body.result;
 };
 const [activeVersions,settings,secrets]=await Promise.all([
  get('/deployments?per_page=1'),get('/settings'),get('/secrets')]);
 const actual=verifyActionsPreflight({activeVersions,settings,secrets});
 if(actual.toLowerCase()!==expected.toLowerCase())fail('active version drift');
 return actual;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 (async()=>{
  const c=JSON.parse(readFileSync(fileURLToPath(
   new URL('../apps/actions-worker/wrangler.jsonc',import.meta.url)),'utf8'));
  verifyActionsSource(c);
  if(process.argv[2]==='version'){
   if(!process.argv[3])fail('missing reviewed deploy log');
   console.log(parsePublishedVersion(readFileSync(resolve(process.argv[3]),'utf8')));
  }else if(process.argv[2]==='readback')
   console.log('Reviewed Provider '+await inspectActionsDeployment(process.env,process.env.EXPECTED_VERSION_ID));
  else if(!process.argv[2]||process.argv[2]==='source')
   console.log('Bark-only Provider source reviewed; no production change');
  else fail('unsupported mode');
 })().catch(e=>{console.error(e.message);process.exitCode=1});
}
