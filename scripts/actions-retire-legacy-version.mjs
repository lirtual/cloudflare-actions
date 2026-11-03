import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readOnlyMaintenancePreflight} from './actions-protected-upgrade.mjs';

// Exact historical Weixin-capable Provider Versions verified via Cloudflare
// version binding metadata. Never infer safety from a numeric version range.
export const REVIEWED_UNSAFE_VERSIONS=Object.freeze([
 'f663dc66-33fd-4292-ba95-49ac12e26b36', // #1
 'a522da66-92cf-462c-909c-cb6eb69d0fec', // #2
 '3564c2ae-538f-4fe7-beee-b4e0e328c7e8', // #3
 'adf7d9d1-5bc1-424a-b74c-7c7dff699fd4', // #4
 '39c5c470-040b-4ae7-b81a-6c47d04f548f', // #5
 '9216ede9-f46a-4f6e-b6d7-733719d71eaf'  // #6
]);
const SAFE_VERSION='960ade68-149a-469c-a4fe-2c5e678df49c'; // #7
const fail=why=>{throw Error('Legacy Worker Version retirement blocked: '+why);};
export function verifyRetirementSelection(e){
 if(e.ACTIONS_MAINTENANCE_OPERATION!=='retire-version'||
    e.ACTIONS_RETIRE_VERSION_APPROVED!=='true'||
    e.ACTIONS_MAINTENANCE_APPROVED!=='true'||
    e.ACTIONS_MAINTENANCE_QUIESCED!=='true'||
    e.ACTIONS_ROLLBACK_TARGET_VERSION)
   fail('explicit approved retirement and frozen maintenance required');
 const target=e.ACTIONS_RETIRE_VERSION_ID;
 if(!REVIEWED_UNSAFE_VERSIONS.includes(target))
   fail('target not in the independently reviewed exact historical allowlist');
 if(e.ACTIONS_EXPECTED_PROVIDER_VERSION!==SAFE_VERSION)
   fail('safe active Provider version changed; review source again');
 return target;
}
export function verifyTargetMetadata(version,target){
 if(version?.id!==target||!REVIEWED_UNSAFE_VERSIONS.includes(target)||
    !Array.isArray(version.bindings)||
    !['DB','WEIXIN_ENCRYPTION_KEY'].every(n=>
      version.bindings.some(x=>x.name===n&&
        x.type===(n==='DB'?'d1':'secret_text'))))
   fail('target version or old Weixin binding proof differs');
 return true;
}
export function verifySnapshot(snapshot,live,target,after=false){
 if(!Array.isArray(snapshot)||!Array.isArray(live)||
    !snapshot.every(v=>typeof v==='string')||
    new Set(snapshot).size!==snapshot.length||
    !snapshot.includes(target)||!snapshot.includes(SAFE_VERSION)||
    !REVIEWED_UNSAFE_VERSIONS.includes(target))
   fail('historical version snapshot invalid');
 const expected=after?snapshot.filter(v=>v!==target):snapshot;
 if(new Set(live).size!==live.length||
    live.length!==expected.length||
    expected.some(v=>!live.includes(v)))
   fail('Worker version inventory changed unexpectedly');
 return true;
}
const SNAPSHOT='spec54-t7-provider-version-snapshot.json';
const urlFor=e=>'https://api.cloudflare.com/client/v4/accounts/'+
 e.CLOUDFLARE_ACCOUNT_ID+'/workers/workers/cloudflare-actions/versions';
async function request(e,path,method='GET',fetcher=fetch){
 const result=await fetcher(urlFor(e)+path,{
   method,redirect:'manual',headers:{Authorization:'Bearer '+e.CLOUDFLARE_API_TOKEN,
     Accept:'application/json'},signal:AbortSignal.timeout(15000)});
 if(!result.ok)fail(method==='DELETE'?
   'DELETE outcome unknown; independently read back before any further action':
   'Cloudflare version inventory unavailable');
 if(result.status===204)return null;
 const value=await result.json();
 if(value?.success!==true)fail('Cloudflare version API returned non-success');
 return value;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function verifiedVersionIds(result){
 const rows=result?.result,info=result?.result_info;
 if(!Array.isArray(rows)||rows.length>100||
    !info||typeof info!=='object'||Array.isArray(info))
   fail('version list completeness cannot be established');
 // Pagination fields are optional in Cloudflare's OpenAPI. At least one
 // total marker must prove this one requested page is the entire inventory.
 for(const [key,min] of [['page',1],['per_page',1],['count',0],
                         ['total_count',0],['total_pages',1]]){
   if(info[key]!==undefined&&
      (!Number.isSafeInteger(info[key])||info[key]<min))
     fail('invalid version list pagination');
 }
 if((info.page!==undefined&&info.page!==1)||
    (info.per_page!==undefined&&(info.per_page>100||info.per_page<rows.length))||
    (info.count!==undefined&&info.count!==rows.length)||
    (info.total_pages!==undefined&&info.total_pages!==1)||
    (info.total_count!==undefined&&info.total_count!==rows.length)||
    (info.total_pages!==1&&info.total_count!==rows.length))
   fail('version list incomplete or unexpectedly paginated');
 const ids=rows.map(x=>x?.id);
 if(ids.some(id=>typeof id!=='string'||!UUID.test(id))||
    new Set(ids.map(id=>id.toLowerCase())).size!==ids.length)
   fail('version identity invalid or duplicate');
 return ids;
}
async function versions(e,fetcher){
 const result=await request(e,'?page=1&per_page=100','GET',fetcher);
 return verifiedVersionIds(result);
}
function snapshotPath(e){
 if(!e.RUNNER_TEMP||!e.RUNNER_TEMP.startsWith('/')||
    !e.CLOUDFLARE_ACCOUNT_ID||!e.CLOUDFLARE_API_TOKEN)
   fail('trusted runner or account context missing');
 return join(resolve(e.RUNNER_TEMP),SNAPSHOT);
}
function readSnapshot(e,target){
 let value;
 try{value=JSON.parse(readFileSync(snapshotPath(e),'utf8'));}
 catch{fail('original preflight snapshot missing');}
 if(value?.target!==target||
    value?.provider!==e.ACTIONS_EXPECTED_PROVIDER_VERSION||
    value?.consumer!==e.ACTIONS_EXPECTED_CONSUMER_VERSION)
   fail('retirement snapshot identity drift');
 return value.versions;
}
export async function retirementStep(mode,e,fetcher=fetch){
 const target=verifyRetirementSelection(e);
 // Reuse the existing source-reviewed, exact-pin, D1 gate, receipt and
 // six-native-state maintenance preflight. It performs only GET/SELECT.
 await readOnlyMaintenancePreflight({
  ...e,ACTIONS_MAINTENANCE_OPERATION:'upgrade'
 },fetcher);
 if(mode==='preflight'){
   const live=await versions(e,fetcher);
   verifySnapshot(live,live,target);
   const value=(await request(e,'/'+target,'GET',fetcher))?.result;
   verifyTargetMetadata(value,target);
   writeFileSync(snapshotPath(e),
     JSON.stringify({target,provider:e.ACTIONS_EXPECTED_PROVIDER_VERSION,
       consumer:e.ACTIONS_EXPECTED_CONSUMER_VERSION,versions:live}),
     {flag:'wx',mode:0o600});
   return 'preflight';
 }
 const old=readSnapshot(e,target);
 const live=await versions(e,fetcher);
 if(mode==='retire'){
   verifySnapshot(old,live,target);
   verifyTargetMetadata((await request(e,'/'+target,'GET',fetcher))?.result,target);
   // Exactly ONE destructive request. Never retry on rejected/unknown result.
   await request(e,'/'+target,'DELETE',fetcher);
   return 'requested';
 }
 if(mode==='postflight'){
   verifySnapshot(old,live,target,true);
   // Version deletion is not proof of historical Secret/data purging.
   return 'removed';
 }
 fail('unsupported retirement stage');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 retirementStep(process.argv[2],process.env).then(result=>{
   console.log('Reviewed Provider historical Version '+result+
     '; no other target or credential changed');
 }).catch(error=>{console.error(error.message);process.exitCode=1;});
}
