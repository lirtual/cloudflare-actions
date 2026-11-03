import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readOnlyMaintenancePreflight} from './actions-protected-upgrade.mjs';
import {REVIEWED_UNSAFE_VERSIONS,verifiedVersionIds} from './actions-retire-legacy-version.mjs';

const SAFE='960ade68-149a-469c-a4fe-2c5e678df49c';
const SECRET='WEIXIN_ENCRYPTION_KEY';
const SNAPSHOT='spec54-t7-secret-retirement.json';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=reason=>{throw Error('Weixin Secret retirement blocked: '+reason);};

export function verifySecretSelection(e){
 if(e.ACTIONS_MAINTENANCE_OPERATION!=='retire-secret'||
    e.ACTIONS_SECRET_RETIRE_APPROVED!=='true'||
    e.ACTIONS_MAINTENANCE_APPROVED!=='true'||
    e.ACTIONS_MAINTENANCE_QUIESCED!=='true'||
    e.ACTIONS_EXPECTED_PROVIDER_VERSION!==SAFE||
    e.ACTIONS_ROLLBACK_TARGET_VERSION||
    e.ACTIONS_RETIRE_VERSION_ID||
    e.ACTIONS_RETIRE_VERSION_APPROVED==='true')
   fail('exact Owner approval, safe Provider and independent version-retirement gate required');
 return true;
}
export function verifyRetiredInventory(ids){
 if(!Array.isArray(ids)||ids.length!==1||ids[0]!==SAFE||
    REVIEWED_UNSAFE_VERSIONS.some(v=>ids.includes(v)))
   fail('legacy Weixin-capable Versions still present or unknown version inventory');
 return true;
}
export function verifySecretBindings(version,expectSecret){
 const b=version?.bindings;
 if(!UUID.test(version?.id??'')||!Array.isArray(b)||
    ['BARK_DEVICE_KEY','BARK_ENCRYPTION_KEY'].some(name=>
      b.filter(x=>x.name===name).length!==1||
      b.find(x=>x.name===name)?.type!=='secret_text')||
    b.filter(x=>x.name===SECRET).length!==(expectSecret?1:0)||
    expectSecret&&b.find(x=>x.name===SECRET)?.type!=='secret_text'||
    b.some(x=>x.name==='DB'||x.name==='MCP_ACCESS_TOKEN'||x.type==='service'))
   fail('Worker Version bindings are not the reviewed Bark-only contract');
 return true;
}
export function verifyStagedInventory(before,after){
 verifyRetiredInventory(before);
 if(!Array.isArray(after)||after.length!==2||
    !after.includes(SAFE)||new Set(after).size!==2)
   fail('staged Worker Version inventory changed unexpectedly');
 const added=after.find(x=>x!==SAFE);
 if(!UUID.test(added??''))fail('new staged Worker Version identity invalid');
 return added;
}
function snapshotPath(e){
 if(!e.RUNNER_TEMP?.startsWith('/')||!e.CLOUDFLARE_ACCOUNT_ID||
    !e.CLOUDFLARE_API_TOKEN)fail('trusted runner context unavailable');
 return join(resolve(e.RUNNER_TEMP),SNAPSHOT);
}
function load(e){
 let x;
 try{x=JSON.parse(readFileSync(snapshotPath(e),'utf8'));}
 catch{fail('original preflight snapshot unavailable');}
 if(x.provider!==SAFE||x.consumer!==e.ACTIONS_EXPECTED_CONSUMER_VERSION||
    x.receipts!==e.ACTIONS_EXPECTED_RECEIPTS||
    x.secret!==SECRET||x.versions?.length!==1||x.versions[0]!==SAFE)
   fail('secret retirement preflight identity drift');
 return x;
}
async function get(e,path,fetcher){
 const root='https://api.cloudflare.com/client/v4/accounts/'+e.CLOUDFLARE_ACCOUNT_ID+
   '/workers/workers/cloudflare-actions/versions';
 const res=await fetcher(root+path,{method:'GET',redirect:'manual',
   headers:{Authorization:'Bearer '+e.CLOUDFLARE_API_TOKEN,Accept:'application/json'},
   signal:AbortSignal.timeout(15000)});
 if(!res.ok)fail('read-only version metadata unavailable');
 const body=await res.json();
 if(body?.success!==true)fail('version API non-success');
 return body;
}
async function inventory(e,fetcher){
 return verifiedVersionIds(await get(e,'?page=1&per_page=100',fetcher));
}
async function verifyLiveSecrets(e,fetcher){
 const root='https://api.cloudflare.com/client/v4/accounts/'+e.CLOUDFLARE_ACCOUNT_ID+
  '/workers/scripts/cloudflare-actions/secrets';
 const res=await fetcher(root,{method:'GET',redirect:'manual',
   headers:{Authorization:'Bearer '+e.CLOUDFLARE_API_TOKEN,Accept:'application/json'},
   signal:AbortSignal.timeout(15000)});
 if(!res.ok)fail('live Secret inventory unavailable');
 const body=await res.json();
 const x=body?.result;
 if(body?.success!==true||!Array.isArray(x)||
    x.some(s=>s?.name===SECRET)||
    ['BARK_DEVICE_KEY','BARK_ENCRYPTION_KEY'].some(name=>
      x.filter(s=>s?.name===name).length!==1))
   fail('active Secret names are not the reviewed Bark-only set');
 return true;
}
async function metadata(e,id,fetcher){
 const x=(await get(e,'/'+id,fetcher)).result;
 if(x?.id!==id)fail('version metadata identity drift');
 return x;
}
export async function secretRetirementStep(mode,e,fetcher=fetch){
 verifySecretSelection(e);
 const scoped={...e,ACTIONS_MAINTENANCE_OPERATION:'upgrade'};
 if(mode==='preflight'){
   await readOnlyMaintenancePreflight(scoped,fetcher);
   const list=await inventory(e,fetcher);
   verifyRetiredInventory(list);
   verifySecretBindings(await metadata(e,SAFE,fetcher),true);
   writeFileSync(snapshotPath(e),JSON.stringify({
     provider:SAFE,consumer:e.ACTIONS_EXPECTED_CONSUMER_VERSION,
     receipts:e.ACTIONS_EXPECTED_RECEIPTS,secret:SECRET,versions:list
   }),{flag:'wx',mode:0o600});
   return 'preflight';
 }
 const before=load(e);
 if(mode==='staged'){
   // This step runs only AFTER Wrangler created one new UNDEPLOYED Version.
   // No automatic retry if Wrangler returned an uncertain result.
   await readOnlyMaintenancePreflight(scoped,fetcher);
   const staged=verifyStagedInventory(before.versions,await inventory(e,fetcher));
   verifySecretBindings(await metadata(e,staged,fetcher),false);
   if(!e.GITHUB_OUTPUT?.startsWith('/'))fail('GitHub output path unavailable');
   appendFileSync(e.GITHUB_OUTPUT,'new_provider_version='+staged+'\n');
   writeFileSync(snapshotPath(e),JSON.stringify({...before,staged}),
     {flag:'w',mode:0o600});
   return 'staged';
 }
 if(mode==='postflight'){
   if(!UUID.test(before.staged??''))fail('no verified staged Version');
   const actual=await inventory(e,fetcher);
   if(actual.length!==2||!actual.includes(SAFE)||
      !actual.includes(before.staged))fail('unexpected postflight inventory');
   await readOnlyMaintenancePreflight(scoped,fetcher,before.staged);
   verifySecretBindings(await metadata(e,before.staged,fetcher),false);
   await verifyLiveSecrets(e,fetcher);
   return 'deployed';
 }
 fail('unsupported Secret retirement stage');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 secretRetirementStep(process.argv[2],process.env).then(x=>
   console.log('Protected Weixin-only Secret '+x+'; no other binding changed'))
   .catch(e=>{console.error(e.message);process.exitCode=1;});
}
