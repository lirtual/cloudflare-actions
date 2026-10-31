// Pure source/read-only cutover gate. It does not provision Secrets or deploy.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
export const REQUIRED_KEYS=Object.freeze(['WEIXIN_ENCRYPTION_KEY','BARK_DEVICE_KEY','BARK_ENCRYPTION_KEY']);
export function verifyActionsSource(config){
 const verify=(ok,why)=>{if(!ok)throw Error('Actions release blocked: '+why);};
 verify(config.name==='cloudflare-actions'&&config.main==='src/index.ts','Worker source');
 verify(config.workers_dev===false&&config.preview_urls===false,'public debug endpoints');
 // New Worker must NOT take over the old Owner domain on its first deploy.
 // Domain transfer is a separately reviewed, authorized cutover operation.
 verify(!config.routes?.length&&!config.route,'premature Owner domain takeover');
 verify(config.d1_databases?.length===1&&config.d1_databases[0].binding==='DB'&&
   config.d1_databases[0].database_id==='051c3b6d-e3bc-4d69-907f-37e8ab00618f',
   'original Weixin D1 ID');
 verify(JSON.stringify([...config.secrets?.required??[]].sort())===JSON.stringify([...REQUIRED_KEYS].sort()),
   'complete new Worker Secret inventory');
 verify(config.version_metadata?.binding==='CF_VERSION_METADATA','version identity');
 verify(!config.services?.length&&!config.workflows?.length,'no second router or orchestrator');
 return true;
}
/**
 * Read-only D1 proof before loading a NEW Weixin encryption key. The old
 * Worker must finish owner-authorized unbind while the old key is available.
 * Merely setting an unrelated key on the new Worker is NOT a safe reset.
 * This function does not read or mutate any Secret or persist anything.
 */
export function verifyOwnerRebindCutoverSnapshot({binding,pairing,receiptCount,minimumReceiptCount}){
 const require=(ok,why)=>{if(!ok)throw Error('Actions rebind blocked: '+why);};
 require(binding?.state==='unbound'&&Number.isSafeInteger(binding?.generation)&&
   binding.generation>=1&&binding.session_ciphertext===null&&
   binding.session_key_id===null&&binding.lease_holder===null&&
   binding.lease_until===null,'original encrypted binding not safely cleared');
 require(pairing===null||(pairing?.phase==='expired'&&
   pairing.ciphertext===null&&pairing.key_id===null),
   'old QR pairing still present');
 require(Number.isSafeInteger(receiptCount)&&Number.isSafeInteger(minimumReceiptCount)&&
   minimumReceiptCount>=0&&receiptCount>=minimumReceiptCount,
   'historical send receipts not preserved');
 return {generation:binding.generation,receipts:receiptCount,ready_for_new_key:true};
}
export function verifyActionsPreflight({activeVersions,settings,secrets}){
 const verify=(ok,why)=>{if(!ok)throw Error('Actions release blocked: '+why);};
 const ids=activeVersions?.deployments?.[0]?.versions;
 verify(ids?.length===1&&ids[0].percentage===100&&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ids[0].version_id),
  'exact active version missing');
 verify(Array.isArray(settings?.bindings)&&Array.isArray(secrets),'runtime inventory unavailable');
 const rows=settings.bindings;
 verify(rows.filter(x=>x.name==='DB'&&x.type==='d1'&&
  (x.id||x.database_id)==='051c3b6d-e3bc-4d69-907f-37e8ab00618f').length===1,
  'original D1 missing');
 for(const name of REQUIRED_KEYS)verify(rows.filter(x=>x.name===name&&x.type==='secret_text').length===1&&
   secrets.filter(x=>x.name===name).length===1,'missing reviewed secret: '+name);
 verify(rows.filter(x=>x.name==='ADMIN_HOST'&&x.type==='plain_text'&&
  x.text==='weixin.lirtual.dpdns.org').length===1,'original Owner host missing');
 verify(rows.some(x=>x.name==='CF_VERSION_METADATA')&&
  !rows.some(x=>x.name==='MCP_ACCESS_TOKEN'),'version metadata or retired token drift');
 return ids[0].version_id;
}
export async function inspectActionsDeployment(env,expected,fetcher=fetch){
 const id=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN;
 if(!/^[a-f0-9]{32}$/i.test(id??'')||typeof token!=='string'||!token||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(expected??''))
  throw Error('Actions release blocked: missing authenticated readback identity');
 const root='https://api.cloudflare.com/client/v4/accounts/'+id+'/workers/scripts/cloudflare-actions';
 const get=async path=>{
  const res=await fetcher(root+path,{redirect:'manual',headers:{Authorization:'Bearer '+token,Accept:'application/json'},
   signal:AbortSignal.timeout(15000)});
  if(!res.ok)throw Error('Actions release blocked: Cloudflare readback unavailable');
  const body=await res.json();
  if(body?.success!==true||body.result==null)throw Error('Actions release blocked: unverified Cloudflare response');
  return body.result;
 };
 const [activeVersions,settings,secrets]=await Promise.all([
  get('/deployments?per_page=1'),get('/settings'),get('/secrets')
 ]);
 const actual=verifyActionsPreflight({activeVersions,settings,secrets});
 if(actual.toLowerCase()!==expected.toLowerCase())throw Error('Actions release blocked: active Version ID drift');
 return actual;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 (async()=>{
  const config=JSON.parse(readFileSync(fileURLToPath(new URL('../apps/actions-worker/wrangler.jsonc',import.meta.url)),'utf8'));
  verifyActionsSource(config);
  if(process.argv[2]==='readback'){
   const actual=await inspectActionsDeployment(process.env,process.env.EXPECTED_VERSION_ID);
   console.log('Reviewed unified Actions Worker Version and Secret names verified: '+actual);
  }else if(process.argv.length===2||process.argv[2]==='source'){
   console.log('Actions source reviewed; no production runtime or credential transfer has been verified');
  }else throw Error('unsupported guarded mode');
 })().catch(error=>{console.error(error.message);process.exitCode=1;});
}
