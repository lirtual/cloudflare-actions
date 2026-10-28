import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  assertReviewedConfig,assertOldPublisherDisabled,checkSinglePublisher,
  stageSecrets,verifyReadback,parseVersion,verifyExistingOwnerKeyProof,checkCloudflare
} from './release-guard.mjs';

const version='33333333-3333-4333-8333-333333333333';
const d1='051c3b6d-e3bc-4d69-907f-37e8ab00618f';
const existing={
  settings:{bindings:[{name:'DB',type:'d1',id:d1},
    {name:'MCP_HOST',type:'plain_text',text:'weixin-mcp.lirtual.dpdns.org'},
    {name:'ADMIN_HOST',type:'plain_text',text:'weixin.lirtual.dpdns.org'}]},
  secrets:[{name:'MCP_ACCESS_TOKEN'},{name:'WEIXIN_ENCRYPTION_KEY'}],
  deploy:{deployments:[{versions:[{percentage:100,version_id:version}]}]},
};
const good='\n'.repeat(200);
const mock=(source=good,state=null)=>async(url)=>{
  const data=url.includes('/git/ref/heads/main')?{object:{sha:'a'.repeat(40)}}:
    url.includes('/contents/.github/workflows/release.yml')?
      {encoding:'base64',content:Buffer.from(source).toString('base64')}:
      {total_count:state?1:0,workflow_runs:state?[{id:1}]:[]};
  return {ok:true,json:async()=>data};
};
test('old publisher must be disabled and all old queued/retryable releases drained',async()=>{
  assert.throws(()=>assertOldPublisherDisabled('x'.repeat(200)+'weixin-mcp-worker'),/Legacy/);
  await assert.rejects(()=>checkSinglePublisher(mock(good+'weixin-mcp-worker')),/Legacy/);
  await assert.rejects(()=>checkSinglePublisher(mock(good,'queued')),/not drained/);
  await assert.rejects(()=>checkSinglePublisher(async()=>({ok:false,status:403})),/could not be checked/);
  await checkSinglePublisher(mock());
});
test('Weixin source, legacy domains, D1 and unchanged Secrets stay fixed',()=>{
  const conf=JSON.parse(readFileSync(new URL('../apps/weixin-mcp-worker/wrangler.jsonc',import.meta.url)));
  assert.doesNotThrow(()=>assertReviewedConfig(conf));
  assert.throws(()=>assertReviewedConfig({...conf,d1_databases:[{...conf.d1_databases[0],database_id:version}]}),/D1/);
  assert.throws(()=>assertReviewedConfig({...conf,routes:[]}),/domain/);
  assert.throws(()=>assertReviewedConfig({...conf,version_metadata:undefined}),/Metadata/);
});
test('production readback rejects altered D1, missing secret and wrong versions',()=>{
  const {settings,secrets,deploy}=existing;
  assert.equal(verifyReadback(settings,secrets,deploy,version),version);
  assert.throws(()=>verifyReadback(settings,secrets,deploy,'44444444-4444-4444-8444-444444444444'),/Version ID differs/);
  assert.throws(()=>verifyReadback(settings,secrets,deploy,version,
    {observability:{logs:{invocation_logs:true}}}),/logging must remain disabled/);
  assert.throws(()=>verifyReadback({...settings,bindings:[{name:'DB',type:'d1',id:version}]},secrets,deploy),/D1/);
  assert.throws(()=>verifyReadback(settings,[],deploy),/secrets/);
  assert.throws(()=>verifyReadback(settings,secrets,{deployments:[{versions:[{percentage:50,version_id:version}]}]}),/traffic/);
});
test('Secrets validation is canonical, deployment parsing never prints raw logs',()=>{
  const env={MCP_ACCESS_TOKEN:'valid-token',
    WEIXIN_ENCRYPTION_KEY:Buffer.alloc(32,17).toString('base64')};
  assert.equal(stageSecrets(env).WEIXIN_ENCRYPTION_KEY,env.WEIXIN_ENCRYPTION_KEY);
  assert.throws(()=>stageSecrets({...env,WEIXIN_ENCRYPTION_KEY:'broken'}),/Base64/);
  assert.throws(()=>stageSecrets({...env,MCP_ACCESS_TOKEN:''}),/MCP_ACCESS_TOKEN/);
  assert.equal(parseVersion('Version ID: '+version),version);
  assert.throws(()=>parseVersion('No version'),/not confirmed/);
  assert.throws(()=>parseVersion('Version ID: '+version+'\nVersion ID: '+version),/not confirmed/);
});
test('release stays manual, main-only, scoped to one Worker and outside CI',()=>{
  const release=readFileSync(new URL('../.github/workflows/release.yml',import.meta.url),'utf8');
  const ci=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
  assert.match(release,/workflow_dispatch:/);
  assert.match(release,/github.ref == 'refs\/heads\/main'/);
  assert.match(release,/deploy_to_production == true/);
  assert.match(release,/environment: weixin-mcp-worker/);
  assert.match(release,/node scripts\/release-guard.mjs legacy/g);
  assert.match(release,/--secrets-file/);
  assert.match(release,/release-guard.mjs keyproof/);
  assert.match(release,/--remote --json --command/);
  assert.doesNotMatch(ci,/wrangler deploy --secrets-file/);
});

test('ciphertext proof validates existing Owner key without exposing its plaintext',async()=>{
  const {encrypt}=await import('../apps/weixin-mcp-worker/src/crypto.ts');
  const correct=Buffer.alloc(32,19).toString('base64');
  const wrong=Buffer.alloc(32,20).toString('base64');
  const message={botToken:'sensitive-secret',ownerId:'private-owner',contextToken:'private-context'};
  const {ciphertext,keyId}=await encrypt({WEIXIN_ENCRYPTION_KEY:correct},
    'weixin:owner:binding:3',message);
  const rows=[{results:[{generation:3,session_ciphertext:ciphertext,session_key_id:keyId}]}];
  await verifyExistingOwnerKeyProof(rows,{WEIXIN_ENCRYPTION_KEY:correct});
  await assert.rejects(()=>verifyExistingOwnerKeyProof(rows,{WEIXIN_ENCRYPTION_KEY:wrong}),/cannot decrypt/);
  await assert.rejects(()=>verifyExistingOwnerKeyProof([{results:[]}],{WEIXIN_ENCRYPTION_KEY:correct}),
    /ciphertext readback unavailable/);
});

test('Cloudflare account is a 32-character account ID; readback is read-only',async()=>{
  const account='a'.repeat(32);
  const seen=[];
  const fake=async(url,opts)=>{
    seen.push([url,opts?.headers?.Authorization]);
    const result=url.endsWith('/settings')?existing.settings:
      url.endsWith('/secrets')?existing.secrets:
      url.endsWith('/script-settings')?{observability:{logs:{invocation_logs:false}}}:existing.deploy;
    return {ok:true,json:async()=>({success:true,result})};
  };
  assert.equal(await checkCloudflare({CLOUDFLARE_ACCOUNT_ID:account,
    CLOUDFLARE_API_TOKEN:'abcdefghijklmnopqrst'},version,fake),version);
  assert.equal(seen.length,4);
  assert.ok(seen.every(([url])=>url.includes('/accounts/'+account+'/workers/scripts/weixin-mcp-worker/')));
  await assert.rejects(()=>checkCloudflare({CLOUDFLARE_ACCOUNT_ID:version,
    CLOUDFLARE_API_TOKEN:'abcdefghijklmnopqrst'},undefined,fake),/access unavailable/);
});
