import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const WORKER='bark-provider';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const fail=msg=>{throw Error('Bark release blocked: '+msg);};
export function verifySource(conf){
 if(conf.name!==WORKER||conf.main!=='src/index.ts'||conf.workers_dev!==false||
    conf.preview_urls!==false||conf.keep_vars!==false||
    conf.compatibility_date!=='2026-10-27'||conf.version_metadata?.binding!=='CF_VERSION_METADATA'||
    conf.routes!==undefined||conf.observability?.logs?.invocation_logs!==false||
    JSON.stringify(conf.secrets?.required)!==JSON.stringify(['BARK_DEVICE_KEY','BARK_ENCRYPTION_KEY'])||
    conf.d1_databases!==undefined||conf.services!==undefined||conf.vars!==undefined)
  fail('source must be private, stateless and bound only to fixed encrypted Owner');
 return true;
}
export function verifyActive(deployments,settings,secrets){
 const versions=deployments?.deployments?.[0]?.versions;
 if(!Array.isArray(versions)||versions.length!==1||versions[0].percentage!==100||
  !UUID.test(versions[0].version_id))fail('active version not unambiguously 100%');
 const bindings=settings?.bindings;
 if(!Array.isArray(bindings)||!Array.isArray(secrets))fail('binding inventory unavailable');
 const names=['BARK_DEVICE_KEY','BARK_ENCRYPTION_KEY'];
 for(const name of names){
  if(bindings.filter(x=>x.name===name&&x.type==='secret_text').length!==1||
   secrets.filter(x=>x.name===name).length!==1)fail('required private credential missing');
 }
 if(bindings.filter(x=>x.name==='CF_VERSION_METADATA'&&x.type==='version_metadata').length!==1||
   bindings.some(x=>!names.includes(x.name)&&x.name!=='CF_VERSION_METADATA')||
   secrets.some(x=>!names.includes(x.name)))fail('Bark private bindings drift');
 return versions[0].version_id;
}
async function cloudflare(mode){
 const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
 if(!token||!/^[a-f0-9]{32}$/i.test(account??''))fail('Cloudflare release identity unavailable');
 const base='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+WORKER;
 const get=async(path,allow404=false)=>{
  const result=await fetch(base+path,{redirect:'manual',headers:{
   Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(15000)});
  if(result.status===404&&allow404)return null;
  if(!result.ok)fail('Cloudflare read-only HTTP '+result.status);
  const data=await result.json();
  if(data?.success!==true||!data.result)fail('Cloudflare readback incomplete');
  return data.result;
 };
 const settings=await get('/settings',mode==='preflight');
 if(settings===null){
  console.log('Bark is not deployed; first private Worker release allowed');
  return;
 }
 const [deployments,secrets]=await Promise.all([get('/deployments?per_page=1'),get('/secrets')]);
 const active=verifyActive(deployments,settings,secrets);
 console.log('Reviewed Bark version '+active+' and two required Secrets verified');
}
async function main(){
 const [mode,arg]=process.argv.slice(2);
 const conf=JSON.parse(await readFile(resolve('apps/bark-provider/wrangler.jsonc'),'utf8'));
 verifySource(conf);
 if(mode==='source'){console.log('Bark source isolation verified');return;}
 if(mode==='secrets'){
  const key=process.env.BARK_ENCRYPTION_KEY,device=process.env.BARK_DEVICE_KEY;
  if(typeof key!=='string'||new TextEncoder().encode(key).length!==32||
     !/^[\x20-\x7e]{32}$/.test(key)||!/^[A-Za-z0-9]{12,128}$/.test(device??''))
   fail('Bark private credentials invalid');
  if(!arg||!resolve(arg).startsWith('/tmp/'))fail('untrusted local temporary secret path');
  await writeFile(arg,JSON.stringify({BARK_DEVICE_KEY:device,BARK_ENCRYPTION_KEY:key}),
   {flag:'w',mode:0o600});
  console.log('Bark temporary Secret payload prepared without logging contents');
  return;
 }
 if(mode!=='preflight'&&mode!=='readback')fail('unknown release mode');
 await cloudflare(mode);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 main().catch(e=>{console.error(e.message);process.exitCode=1;});
