import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const SHA=/^[a-f0-9]{40}$/i;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const RUN=/^[1-9][0-9]{0,17}$/;
const DEST='https://api.github.com/repos/lirtual/mcp-workers/dispatches';
export function reviewedHandoff(input){
  if(!RUN.test(String(input.release_run_id??'')) || !SHA.test(input.release_sha??'') ||
     !UUID.test(input.provider_version_id??''))
    throw Error('Invalid reviewed Provider release evidence');
  return {event_type:'reviewed_weixin_provider_release',
    client_payload:{release_run_id:Number(input.release_run_id),
      release_sha:input.release_sha.toLowerCase(),
      provider_version_id:input.provider_version_id.toLowerCase()}};
}
export async function dispatchHandoff(input, token, fetchImpl=fetch){
  if(typeof token!=='string'||!token)throw Error('Missing protected downstream dispatch token');
  const payload=reviewedHandoff(input);
  const response=await fetchImpl(DEST,{
    method:'POST',
    redirect:'manual',
    headers:{Accept:'application/vnd.github+json',
      Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28',
      'Content-Type':'application/json'},
    body:JSON.stringify(payload),
    signal:AbortSignal.timeout(15000)
  });
  if(response.status!==204)throw Error('Downstream dispatch was not acknowledged (HTTP '+response.status+')');
  return payload.client_payload;
}
async function main(){
  const token=process.env.WEIXIN_WORKFLOW_DISPATCH_TOKEN;
  const result=await dispatchHandoff({
    release_run_id:process.env.PROVIDER_RELEASE_RUN_ID,
    release_sha:process.env.PROVIDER_RELEASE_SHA,
    provider_version_id:process.env.PROVIDER_ACTIVE_VERSION,
  },token);
  console.log('Protected Workflow sync requested for Provider version '+result.provider_version_id+
    '; dispatch is not proof of Workflow deployment');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(e=>{console.error(e.message);process.exitCode=1;});
