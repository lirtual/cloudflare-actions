import {execFileSync} from 'node:child_process';
import {appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const REPO='lirtual/cloudflare-actions';
const WORKFLOW_ID=399111011;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SHA=/^[a-f0-9]{40}$/i;
const RUN=/^[1-9][0-9]{0,17}$/;
export function verifyReviewedRelease(run,list,requestedRunId,ancestryCheck){
  if(!RUN.test(String(requestedRunId??'')) || !Array.isArray(list?.workflow_runs) ||
     !Array.isArray(run===null?null:[run]) || Number(run?.id)!==Number(requestedRunId) ||
     run.workflow_id!==WORKFLOW_ID || run.event!=='workflow_dispatch' ||
     run.head_branch!=='main' || run.status!=='completed' || run.conclusion!=='success' ||
     typeof run.path!=='string' ||
     !run.path.endsWith('/.github/workflows/release.yml@refs/heads/main') ||
     !SHA.test(run.head_sha??'') || !ancestryCheck(run.head_sha))
    throw Error('Provider release identity, provenance or completion not verified');
  // Do not promote a stale release if any subsequent Provider publication was requested.
  const dispatches=list.workflow_runs.filter(x=>x?.event==='workflow_dispatch');
  if(!dispatches.length || Number(dispatches[0].id)!==Number(requestedRunId))
    throw Error('Provider release is stale; inspect newer deployment first');
  return {release_run_id:Number(requestedRunId),release_sha:run.head_sha.toLowerCase()};
}
export function parseActiveVersion(output){
  const matches=[...String(output).matchAll(/active Version ID: ([a-f0-9-]{36})/gi)];
  if(matches.length!==1 || !UUID.test(matches[0][1]))
    throw Error('Unique active Provider version not independently confirmed');
  return matches[0][1].toLowerCase();
}
async function main(){
  const id=process.env.PROVIDER_RELEASE_RUN_ID,token=process.env.GH_TOKEN;
  if(!RUN.test(id??'')||!token||!process.env.CLOUDFLARE_API_TOKEN||
     !/^[a-f0-9]{32}$/i.test(process.env.CLOUDFLARE_ACCOUNT_ID??''))
    throw Error('Protected handoff proof configuration missing');
  const read=async url=>{
    const r=await fetch(url,{redirect:'manual',headers:{
      Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error('GitHub release proof unavailable (HTTP '+r.status+')');
    return r.json();
  };
  const [run,list]=await Promise.all([
    read('https://api.github.com/repos/'+REPO+'/actions/runs/'+id),
    read('https://api.github.com/repos/'+REPO+'/actions/workflows/release.yml/runs?per_page=20')
  ]);
  const proof=verifyReviewedRelease(run,list,id,sha=>{
    try{execFileSync('git',['merge-base','--is-ancestor',sha,'HEAD'],{stdio:'ignore'});return true;}
    catch{return false;}
  });
  const output=execFileSync(process.execPath,['scripts/release-guard.mjs','preflight'],
    {encoding:'utf8',maxBuffer:1024*1024});
  const provider_version_id=parseActiveVersion(output);
  if(!process.env.GITHUB_OUTPUT)throw Error('Missing trusted GitHub output destination');
  await appendFile(process.env.GITHUB_OUTPUT,
    'release_run_id='+proof.release_run_id+'\nrelease_sha='+proof.release_sha+
    '\nprovider_version_id='+provider_version_id+'\n');
  console.log('Latest successful Provider release and active Cloudflare version independently verified');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(e=>{console.error(e.message);process.exitCode=1;});
