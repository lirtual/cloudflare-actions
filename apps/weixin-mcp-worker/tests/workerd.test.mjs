import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {startPairing,pollPairing,pairingView,verifyPairing} from '../src/pairing.ts';
import {acquireLease,releaseLease,unbindLocal} from '../src/lease.ts';

// Exercise Cloudflare's workerd/D1 implementation, not the node:sqlite adapter.
// Every token, account and receipt here is synthetic. No Tencent call is made.
const scriptPath=fileURLToPath(new URL('../.build/weixin/index.js',import.meta.url));
const migration=['0001_owner.sql','0002_send_rejection_codes.sql'].map(m=>readFileSync(new URL('../migrations/'+m,import.meta.url),'utf8')).join('\n');
async function applyMigration(db){
  // D1.exec treats each *line* as an SQL command; this reviewed migration
  // contains multiline CREATE statements. Use D1's transactional batch API.
  const statements=migration.replace(/^\s*--[^\n]*$/gm,'')
    .split(';').map(sql=>sql.trim()).filter(Boolean);
  await db.batch(statements.map(sql=>db.prepare(sql)));
}

const adminHost='weixin-owner.example.org';
const firstId='f43e7f17-c31d-42bf-8358-b454568c32b0';

function runtime(){
  return new Miniflare(convertV4MiniflareOptions({
    port:0,
    workers:[{
      name:'weixin-mcp-worker',
      modules:true,
      script:readFileSync(scriptPath,'utf8'),
      // Pinned local workerd supports flags only through 2026-09-15. The
      // deployed Worker keeps the separately reviewed 2026-10-27 date.
      compatibilityDate:'2026-09-15',
      d1Databases:{DB:'weixin-local-test'},
      bindings:{
        ADMIN_HOST:adminHost,
        WEIXIN_ENCRYPTION_KEY:Buffer.alloc(32,17).toString('base64'),
        OWNER_EMAIL:'owner@example.org',
        ACCESS_TEAM_DOMAIN:'owner.cloudflareaccess.com',
        ACCESS_AUD:'owner-test-audience',
      },
    }],
  }));
}

test('real workerd D1, retired public ingress, CAS lease and historical receipt storage',async()=>{
  const mf=runtime();
  try{
    const db=await mf.getD1Database('DB');
    await applyMigration(db);
    assert.equal((await db.prepare('SELECT state FROM weixin_binding WHERE id=1')
      .first()).state,'unbound');

    // Public MCP no longer exists even with a former bearer header.
    const denied=await mf.dispatchFetch('https://weixin-mcp.example.org/mcp',{
      method:'POST',headers:{authorization:'Bearer old-portal-secret'}
    });
    assert.equal(denied.status,404);
    assert.doesNotMatch(await denied.text(),/weixin_status|weixin_send_message/);
    const admin=await mf.dispatchFetch('https://'+adminHost+'/setup');
    assert.equal(admin.status,403);
    const wrongAdmin=await mf.dispatchFetch('https://untrusted.example.org/setup');
    assert.equal(wrongAdmin.status,404);

    // ChatGPT link tracking must not lock the owner out after Access OTP.
    // Canonicalization must not bypass Access or widen the management surface.
    const tracked=await mf.dispatchFetch(
      'https://'+adminHost+'/setup?utm_source=chatgpt.com',{redirect:'manual'});
    assert.equal(tracked.status,303);
    assert.equal(tracked.headers.get('location'),'https://'+adminHost+'/setup');
    assert.equal(tracked.headers.get('cache-control'),'no-store');
    const clean=await mf.dispatchFetch(tracked.headers.get('location'));
    assert.equal(clean.status,403); // Owner JWT is still mandatory.
    for(const suffix of [
      '/setup?utm_source=someone-else',
      '/setup?utm_source=chatgpt.com&next=https://evil.example',
      '/setup?utm_source=chatgpt.com&utm_source=chatgpt.com',
      '/setup/start?utm_source=chatgpt.com',
      '/?utm_source=chatgpt.com',
    ]){
      const deniedQuery=await mf.dispatchFetch('https://'+adminHost+suffix,
        {redirect:'manual'});
      assert.equal(deniedQuery.status,404,suffix);
    }
    const deniedPost=await mf.dispatchFetch(
      'https://'+adminHost+'/setup?utm_source=chatgpt.com',
      {method:'POST',redirect:'manual'});
    assert.equal(deniedPost.status,404);
    const deniedHost=await mf.dispatchFetch(
      'https://untrusted.example.org/setup?utm_source=chatgpt.com',
      {redirect:'manual'});
    assert.equal(deniedHost.status,404);

    // Workerd-backed SQL lease: two simultaneous contenders cannot both win.
    const t=Math.floor(Date.now()/1000);
    const admit=(holder)=>db.prepare(
      'UPDATE weixin_binding SET lease_holder=?,lease_until=? '+
      'WHERE id=1 AND generation=0 AND state=? '+
      'AND (lease_holder IS NULL OR lease_until<?)'
    ).bind(holder,t+120,'unbound',t).run();
    const wins=await Promise.all([admit('a'),admit('b')]);
    assert.equal(wins.reduce((n,v)=>n+v.meta.changes,0),1);
    // Unbind has to refuse while a lease is active, even when repeated.
    const blocked=await db.prepare(
      "UPDATE weixin_binding SET generation=generation+1,state='unbound',"+
      'lease_holder=NULL,lease_until=NULL WHERE id=1 '+
      'AND (lease_holder IS NULL OR lease_until<?)'
    ).bind(t).run();
    assert.equal(blocked.meta.changes,0);
    const cleared=await db.prepare('UPDATE weixin_binding SET lease_holder=NULL,lease_until=NULL '+
      'WHERE id=1 AND lease_holder IN (?,?)').bind('a','b').run();
    assert.equal(cleared.meta.changes,1);

    // An existing persisted unknown receipt is queryable without ever
    // decrypting a session or contacting the upstream service.
    await db.prepare(
      "UPDATE weixin_binding SET generation=1,state='ready',"+
      "session_ciphertext='synthetic-sealed-fixture',session_key_id='1' WHERE id=1"
    ).run();
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode('synthetic only'))),b=>b.toString(16).padStart(2,'0')).join('');
    await db.prepare(
      "INSERT INTO weixin_send_receipts (generation,request_id,text_digest,status,created_at,updated_at) "+
      "VALUES(1,?,?,'unknown',?,?)"
    ).bind(firstId,digest,t,t).run();
    const existing=await db.prepare(
      'SELECT status,generation,text_digest FROM weixin_send_receipts WHERE request_id=?'
    ).bind(firstId).first();
    assert.equal(existing.status,'unknown');
    assert.equal(existing.generation,1);
    assert.equal(existing.text_digest,digest);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM weixin_send_receipts')
      .first()).n,1);
    await db.prepare('UPDATE weixin_binding SET generation=2 WHERE id=1').run();
    assert.equal((await db.prepare('SELECT status FROM weixin_send_receipts WHERE request_id=?')
      .bind(firstId).first()).status,'unknown');

    // Owner management stays inaccessible without an Access-signed JWT.
    const adminAgain=await mf.dispatchFetch('https://'+adminHost+'/setup');
    assert.equal(adminAgain.status,403);
    assert.doesNotMatch(await adminAgain.text(),/synthetic-sealed-fixture|owner@example.org/);
  }finally{await mf.dispose();}
});


test('real workerd D1 drives the application QR proof and generation CAS without Tencent',async()=>{
  const mf=runtime();
  try{
    const db=await mf.getD1Database('DB');
    await applyMigration(db);
    const env={DB:db,WEIXIN_ENCRYPTION_KEY:Buffer.alloc(32,17).toString('base64')};
    const owner='signed-access-test-sub';
    let incoming=[];
    const api={
      getQr:async()=>({
        qrcode:'synthetic-private-qr',
        qrcode_img_content:'https://liteapp.weixin.qq.com/synthetic-only',
      }),
      pollQr:async()=>({
        status:'confirmed',bot_token:'synthetic-private-token',
        ilink_bot_id:'synthetic-bot',ilink_user_id:'synthetic-owner',
      }),
      getUpdates:async()=>({msgs:incoming,get_updates_buf:'synthetic-next-cursor'}),
    };
    await startPairing(env,owner,api);
    assert.equal((await pairingView(env,owner)).phase,'qr_pending');
    assert.equal((await pollPairing(env,owner,api)),'confirmed');
    const challenge=(await pairingView(env,owner)).proof;
    assert.match(challenge,/^WX346-[A-F0-9]{24}$/);
    const forged={from_user_id:'different-user',to_user_id:'synthetic-bot',
      message_type:1,context_token:'untrusted-context',
      item_list:[{type:1,text_item:{text:challenge}}]};
    incoming=[forged];
    assert.equal(await verifyPairing(env,owner,api),'waiting_for_proof');
    assert.equal((await db.prepare('SELECT generation FROM weixin_binding').first()).generation,0);
    await db.prepare('UPDATE weixin_pairing SET poll_after=0').run();
    incoming=[{...forged,from_user_id:'synthetic-owner',
      context_token:'synthetic-private-context'}];
    assert.equal(await verifyPairing(env,owner,api),'ready');
    const active=await db.prepare('SELECT * FROM weixin_binding WHERE id=1').first();
    assert.equal(active.generation,1);
    assert.equal(active.state,'ready');
    assert.doesNotMatch(JSON.stringify(active),/synthetic-private-token|synthetic-private-context/);
    const staged=await db.prepare('SELECT phase,ciphertext FROM weixin_pairing').first();
    assert.equal(staged.phase,'expired');
    assert.equal(staged.ciphertext,null);
    assert.equal((await pairingView(env,owner)).phase,'none');

    const lease=await acquireLease(env,1,['ready']);
    await assert.rejects(()=>unbindLocal(env),/binding_busy/);
    await releaseLease(env,lease);
    assert.equal(await unbindLocal(env),2);
    const after=await db.prepare('SELECT generation,state,session_ciphertext FROM weixin_binding').first();
    assert.equal(after.generation,2);
    assert.equal(after.state,'unbound');
    assert.equal(after.session_ciphertext,null);
  }finally{await mf.dispose();}
});
