import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {verifyNativeEmpty,verifyFrozen,verifyLegacyBindings,validatedSecrets,generateFreshWeixinKey,parsePublishedVersion,
 readOnlyPreflight,NATIVE_STATES} from './actions-protected-release.mjs';
const ok={success:true,result:[],result_info:{count:0}};
const old=[
 {name:'WEIXIN_ACTION_PROVIDER',type:'service',service:'weixin-mcp-worker',entrypoint:'WeixinActionProvider'},
 {name:'BARK_ACTION_PROVIDER',type:'service',service:'bark-provider',entrypoint:'BarkActionProvider'}
];
const owner={state:'unbound',generation:3,session_ciphertext:null,session_key_id:null,
 lease_holder:null,lease_until:null,pending_pairings:0,receipt_count:7};
const data=x=>[{success:true,results:[x]}];
const env={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'read-only-token',
 ACTIONS_OLD_INGRESS_QUIESCED:'true',ACTIONS_EXPECTED_RECEIPTS:'7'};

test('first publisher rejects nonterminal, truncated, cursor or absent native inventory',()=>{
 for(const s of NATIVE_STATES){
  assert.equal(verifyNativeEmpty(s,ok),true);
  for(const wrong of [
   {success:true,result:[{id:'active'}],result_info:{count:1}},
   {success:true,result:[],result_info:{count:0,cursor:'next'}},
   {success:true,result:[],result_info:{count:0,next_cursor:'next'}},
   {success:true,result:[],result_info:{count:0,total_pages:2}},
   {success:true,result:[],result_info:{count:0,total_count:1}},
   {success:true,result:[],result_info:{}},
   {success:false,result:[],result_info:{count:0}}
  ])assert.throws(()=>verifyNativeEmpty(s,wrong),/blocked/);
 }
 assert.throws(()=>verifyNativeEmpty('succeeded',ok),/blocked/);
});
test('exact legacy topology and frozen migration gate are mandatory',()=>{
 assert.equal(verifyFrozen(data({state:'frozen'})),true);
 assert.equal(verifyLegacyBindings(old),true);
 for(const x of ['open','unknown',null])assert.throws(()=>verifyFrozen(data({state:x})),/blocked/);
 for(const x of [[],old.slice(0,1),[...old,{name:'ACTIONS',type:'service'}],
  old.map((v,i)=>i===0?{...v,entrypoint:'wrong'}:v)])
  assert.throws(()=>verifyLegacyBindings(x),/blocked/);
});
test('fresh-key formats and Wrangler version fail closed without exposing credentials',()=>{
 const privateValues={WEIXIN_ENCRYPTION_KEY:Buffer.alloc(32,5).toString('base64'),
  BARK_DEVICE_KEY:'BarkTest123456',BARK_ENCRYPTION_KEY:'Z'.repeat(32)};
 assert.deepEqual(validatedSecrets(privateValues),privateValues);
 for(const bad of [{WEIXIN_ENCRYPTION_KEY:'bad'},{BARK_ENCRYPTION_KEY:'short'},
  {BARK_DEVICE_KEY:'bad!'}])assert.throws(()=>validatedSecrets({...privateValues,...bad}),/blocked/);
 const version='33333333-3333-4333-8333-333333333333';
 assert.equal(parsePublishedVersion('Current Version ID: '+version),version);
 assert.equal(parsePublishedVersion('Version ID: '+version),version);
 for(const value of ['',version,'Current Version ID: bad',
  'Current Version ID: '+version+'\nCurrent Version ID: '+version])
  assert.throws(()=>parsePublishedVersion(value),/blocked/);
});
test('production preflight reads old bindings, D1 and every physical Workflow state; never mutates',async()=>{
 const requests=[];
 const fake=async (url,init)=>{
  const u=new URL(url),sql=init.body?JSON.parse(init.body).sql:'';
  requests.push({url:u.pathname+u.search,method:init.method,sql});
  if(u.pathname==='/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/workers/scripts/cloudflare-actions/settings')return {status:404,ok:false};
  const body=u.pathname.endsWith('/settings')?{success:true,result:{bindings:old}}:
   u.pathname.includes('/workflows/')?ok:
   u.pathname.includes('a4a477cd-6339-478c-ab7c-f7d87bb0d772')?
    {success:true,result:data({state:'frozen'})}:
    {success:true,result:data(owner)};
  return {ok:true,json:async()=>body};
 };
 assert.equal(await readOnlyPreflight(env,fake),true);
 assert.equal(requests.length,10);
 assert.equal(requests.filter(x=>x.url.includes('/workflows/')).length,6);
 assert.ok(requests.every(x=>x.method==='GET'||x.method==='POST'&&/^SELECT\s/i.test(x.sql.trim())));
 let touched=0;
 await assert.rejects(readOnlyPreflight({...env,ACTIONS_OLD_INGRESS_QUIESCED:'false'},async()=>{touched++;}),/blocked/);
 assert.equal(touched,0);
 await assert.rejects(readOnlyPreflight({...env,ACTIONS_EXPECTED_RECEIPTS:'8'},fake),/blocked/);
 await assert.rejects(readOnlyPreflight({...env,ACTIONS_EXPECTED_RECEIPTS:'6'},fake),/blocked/);
});
test('first release creates a fresh 256-bit Weixin encryption key without a GitHub-stored secret',()=>{
 const a=generateFreshWeixinKey(),b=generateFreshWeixinKey();
 assert.notEqual(a,b);
 for(const value of [a,b]){
  assert.match(value,/^[A-Za-z0-9+/]{43}=$/);
  assert.equal(Buffer.from(value,'base64').length,32);
  assert.equal(Buffer.from(value,'base64').toString('base64'),value);
 }
});
test('first-release secrets mode stages fresh Weixin key as private file without printing credentials',t=>{
 const temp=mkdtempSync(join(tmpdir(),'spec21-first-release-'));
 t.after(()=>rmSync(temp,{recursive:true,force:true}));
 const file=join(temp,'actions-cutover-secrets.json');
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./actions-protected-release.mjs',import.meta.url)),
  'secrets',file],{env:{...process.env,RUNNER_TEMP:temp,BARK_DEVICE_KEY:'BarkDevice123456',
  BARK_ENCRYPTION_KEY:'B'.repeat(32)},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.equal(statSync(file).mode&0o777,0o600);
 const staged=JSON.parse(readFileSync(file,'utf8'));
 assert.equal(staged.BARK_DEVICE_KEY,'BarkDevice123456');
 assert.equal(staged.BARK_ENCRYPTION_KEY,'B'.repeat(32));
 assert.equal(Buffer.from(staged.WEIXIN_ENCRYPTION_KEY,'base64').length,32);
 assert.ok(!result.stdout.includes(staged.WEIXIN_ENCRYPTION_KEY));
 assert.ok(!result.stderr.includes(staged.WEIXIN_ENCRYPTION_KEY));
});
test('unified publisher is guarded, Owner-only and never switches domain automatically',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/release-actions.yml',import.meta.url),'utf8');
 for(const s of ["github.ref == 'refs/heads/main'","github.actor == 'lirtual'",
  'inputs.deploy_to_production == true','inputs.actions_old_ingress_quiesced == true',
  'cancel-in-progress: false',
  'BARK_DEVICE_KEY: ${{ secrets.BARK_DEVICE_KEY }}',
  'BARK_ENCRYPTION_KEY: ${{ secrets.BARK_ENCRYPTION_KEY }}',
  'node scripts/actions-protected-release.mjs preflight',
  'node scripts/actions-protected-release.mjs secrets',
  'node scripts/actions-release-guard.mjs readback',
  'wrangler deploy --secrets-file'])assert.ok(workflow.includes(s),s);
 assert.ok(!/^\s+environment:/m.test(workflow),'first release uses repository Actions Secrets without an Environment');
 assert.ok(!workflow.includes('secrets.WEIXIN_ENCRYPTION_KEY'),'fresh Weixin key must not depend on repository Secrets');
 assert.ok(workflow.indexOf('actions-protected-release.mjs preflight')<workflow.indexOf('wrangler deploy --secrets-file'));
 assert.ok(!workflow.includes('wrangler d1 execute')&&!workflow.includes('wrangler delete'));
});
