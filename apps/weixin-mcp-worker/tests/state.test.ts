import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { encrypt,decrypt } from '../src/crypto.ts';
import { bindingStatus,sendOnce } from '../src/state.ts';
import type { Env, IlinkSession } from '../src/types.ts';

const id='9c87e9bc-3678-4c0a-88cd-6714c5d63ef4';
const second='21d0b0af-15e4-4cb9-b6c9-58d9e9b35a36';
class FakeD1 {
  readonly sql=new DatabaseSync(':memory:');
  constructor(){this.sql.exec(readFileSync(new URL('../migrations/0001_owner.sql',import.meta.url),'utf8'));this.sql.exec(readFileSync(new URL('../migrations/0002_send_rejection_codes.sql',import.meta.url),'utf8'));}
  prepare(query:string){
    const statement=this.sql.prepare(query);
    const wrapped=(args:unknown[])=>({
      run:async()=>({meta:{changes:Number(statement.run(...(args as [] )).changes)}}),
      first:async<T>()=>(statement.get(...(args as []))??null) as T|null,
    });
    return {...wrapped([]),bind:(...args:unknown[])=>wrapped(args)};
  }
}
function fixture(){
  const db=new FakeD1();
  const env={DB:db as unknown as D1Database,
    WEIXIN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')} as Env;
  const session:IlinkSession={botToken:'sensitive-bot-token',ownerId:'owner-id',
    botId:'bot-id',contextToken:'sensitive-context',cursor:'secret-cursor'};
  async function bindReady(generation=1){
    const sealed=await encrypt(env,'weixin:owner:binding:'+generation,session);
    db.sql.prepare('UPDATE weixin_binding SET generation=?,state=?,session_ciphertext=?,session_key_id=?,last_verified_context_at=?,last_sync_at=? WHERE id=1')
      .run(generation,'ready',sealed.ciphertext,sealed.keyId,Math.floor(Date.now()/1000),Math.floor(Date.now()/1000));
    return sealed;
  }
  return {db,env,session,bindReady};
}
test('D1 migration contains no plaintext message columns; unbound status blocks sends',async()=>{
  const {db,env}=fixture();
  assert.deepEqual(await bindingStatus(env),{binding_state:'unbound',
    last_verified_context_at:null,last_sync_at:null,next_action:'open_owner_pairing_page'});
  let sends=0;
  await assert.rejects(()=>sendOnce(env,'hello',id,async()=>{sends++;return 'accepted';}),/binding_not_ready/);
  assert.equal(sends,0);
  const columns=db.sql.prepare('pragma table_info(weixin_send_receipts)').all().map(c=>c.name);
  assert.deepEqual(columns,['generation','request_id','text_digest','status','created_at','updated_at','upstream_ret','upstream_errcode']);
});
test('AES-GCM generation AAD, tamper detection and ciphertext at rest',async()=>{
  const {env,session,bindReady,db}=fixture();
  const sealed=await bindReady();
  assert.doesNotMatch(sealed.ciphertext,/sensitive|owner-id|cursor/);
  assert.deepEqual(await decrypt<IlinkSession>(env,'weixin:owner:binding:1',sealed.ciphertext,sealed.keyId),session);
  await assert.rejects(()=>decrypt(env,'weixin:owner:binding:2',sealed.ciphertext,sealed.keyId));
  await assert.rejects(()=>decrypt(env,'weixin:owner:binding:1',sealed.ciphertext.slice(0,-5)+'AAAAA',sealed.keyId));
  const row=db.sql.prepare('SELECT session_ciphertext FROM weixin_binding WHERE id=1').get();
  assert.doesNotMatch(JSON.stringify(row),/sensitive/);
});
test('durable reservation: duplicate ID never triggers a second send, conflicting text errors',async()=>{
  const {env,bindReady,db}=fixture();await bindReady();
  let attempts=0;
  const dispatch=async()=>{attempts++;return 'accepted' as const;};
  const first=await sendOnce(env,'hello',id,dispatch);
  assert.equal(first.status,'accepted');assert.equal(first.duplicate,false);
  const dup=await sendOnce(env,'hello',id,dispatch);
  assert.equal(dup.status,'accepted');assert.equal(dup.duplicate,true);
  await assert.rejects(()=>sendOnce(env,'different text',id,dispatch),/request_id_conflict/);
  assert.equal(attempts,1);
  const row=db.sql.prepare('SELECT * FROM weixin_send_receipts WHERE request_id=?').get(id);
  assert.ok(row);assert.equal(row.status,'accepted');assert.equal(row.generation,1);
  assert.doesNotMatch(JSON.stringify(row),/hello|sensitive/);
});
test('unknown outcome and process failure remain reserved and cannot replay',async()=>{
  const {env,bindReady,db}=fixture();await bindReady();
  let attempts=0;
  const dispatch=async()=>{attempts++;throw new Error('provider ack lost');};
  assert.equal((await sendOnce(env,'one text',id,dispatch)).status,'unknown');
  const same=await sendOnce(env,'one text',id,dispatch);
  assert.equal(same.status,'unknown');assert.equal(same.duplicate,true);
  assert.equal(attempts,1);
  // Crash immediately after reservation: no process receives an ack.
  db.sql.prepare('INSERT INTO weixin_send_receipts(generation,request_id,text_digest,status,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .run(1,second,'a'.repeat(64),'unknown',100,100);
  assert.equal(db.sql.prepare('SELECT status FROM weixin_send_receipts WHERE request_id=?').get(second)?.status,'unknown');
});
test('two concurrent requests for identical ID dispatch at most once',async()=>{
  const {env,bindReady}=fixture();await bindReady();
  let attempts=0;
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const dispatcher=async()=>{attempts++;await gate;return 'accepted' as const;};
  const a=sendOnce(env,'concurrency text',id,dispatcher);
  const b=sendOnce(env,'concurrency text',id,dispatcher);
  release();
  const results=await Promise.all([a,b]);
  assert.equal(attempts,1);
  assert.ok(results.some(x=>x.duplicate));
});
test('input boundaries fail before any upstream write',async()=>{
  const {env,bindReady}=fixture();await bindReady();
  let attempts=0;
  const dispatch=async()=>{attempts++;return 'accepted' as const;};
  for(const [text,request] of [['',id],['   ',id],['x'.repeat(4097),id],['a\u0001b',id],['ok','bad']]){
    await assert.rejects(()=>sendOnce(env,text,request,dispatch));
  }
  assert.equal(attempts,0);
});

test('duplicate receipts never poll, new requests fail closed on unavailable sync',async()=>{
  const {env,bindReady,db}=fixture();await bindReady();
  let polls=0,dispatches=0;
  const sync=async()=>{polls++;};
  const send=async()=>{dispatches++;return 'unknown' as const;};
  assert.equal((await sendOnce(env,'hello',id,send,sync)).status,'unknown');
  assert.equal((await sendOnce(env,'hello',id,send,async()=>{throw new Error('unexpected poll');})).duplicate,true);
  assert.equal(polls,1);
  assert.equal(dispatches,1);
  await assert.rejects(()=>sendOnce(env,'new text',second,send,async()=>{polls++;throw new Error('poll unavailable');}),/poll unavailable/);
  assert.equal(dispatches,1);
  assert.equal(db.sql.prepare('SELECT count(*) AS n FROM weixin_send_receipts').get()?.n,1);
});

test('unattended Owner-only notification accepts old or missing observation timestamp after trusted sync',async()=>{
 const {env,db,bindReady}=fixture();await bindReady();
 let sends=0,polls=0;
 const send=async()=>{sends++;return 'accepted' as const;};
 const sync=async()=>{polls++;};
 db.sql.prepare('UPDATE weixin_binding SET last_verified_context_at=?').run(Math.floor(Date.now()/1000)-86401);
 assert.equal((await sendOnce(env,'old observation',id,send,sync)).status,'accepted');
 db.sql.prepare('UPDATE weixin_binding SET last_verified_context_at=NULL').run();
 assert.equal((await sendOnce(env,'missing observation',second,send,sync)).status,'accepted');
 assert.equal(polls,2);assert.equal(sends,2);
 assert.equal(db.sql.prepare('SELECT count(*) AS n FROM weixin_send_receipts').get()?.n,2);
});

test('definite upstream rejection stores bounded codes, unknown stores none and duplicate never resends',async()=>{
 const {env,db,bindReady}=fixture();await bindReady();
 let sends=0;
 const result=await sendOnce(env,'reject test',id,async()=>{
  sends++;return {status:'rejected' as const,upstream_ret:-2,upstream_errcode:1001};
 });
 assert.equal(result.status,'rejected');
 const row=db.sql.prepare('SELECT upstream_ret,upstream_errcode,status FROM weixin_send_receipts WHERE request_id=?').get(id)!;
 assert.equal(row.status,'rejected');assert.equal(row.upstream_ret,-2);assert.equal(row.upstream_errcode,1001);
 const dup=await sendOnce(env,'reject test',id,async()=>{sends++;return 'accepted';});
 assert.equal(dup.status,'rejected');assert.equal(dup.duplicate,true);assert.equal(sends,1);
 const uncertain=await sendOnce(env,'maybe delivered',second,async()=>{throw Error('network fail');});
 assert.equal(uncertain.status,'unknown');
 const row2=db.sql.prepare('SELECT status,upstream_ret,upstream_errcode FROM weixin_send_receipts WHERE request_id=?').get(second)!;
 assert.equal(row2.status,'unknown');assert.equal(row2.upstream_ret,null);assert.equal(row2.upstream_errcode,null);
});


test('unknown and receipt-write ambiguity emit only bounded invocation diagnostics and never resend',async()=>{
  const {env,db,bindReady}=fixture();await bindReady();
  const original=console.warn, logs:string[]=[];
  console.warn=(...args:unknown[])=>{logs.push(args.map(x=>JSON.stringify(x)).join(' '));};
  try {
    let sends=0;
    const originalPrepare=env.DB.prepare.bind(env.DB);
    const wrappedEnv={...env,DB:{prepare(query:string){
      const stmt=originalPrepare(query);
      if(query.startsWith('UPDATE weixin_send_receipts SET status=')){
        return {bind:(...args:unknown[])=>({run:async()=>{
          throw Error('synthetic receipt write failure - sensitive');
        }})};
      }
      return stmt;
    }}} as unknown as Env;
    const first=await sendOnce(wrappedEnv,'private-text',id,async()=>{sends++;return 'accepted';});
    assert.equal(first.status,'unknown');
    assert.equal(db.sql.prepare('SELECT status FROM weixin_send_receipts WHERE request_id=?').get(id)?.status,'unknown');
    assert.equal((await sendOnce(wrappedEnv,'private-text',id,async()=>{sends++;return 'accepted';})).duplicate,true);
    assert.equal(sends,1);
    assert.equal(logs.length,1);
    assert.ok(logs[0].includes('"phase":"receipt_update_exception"'));
    assert.ok(!logs[0].includes('sensitive')&&!logs[0].includes('private-text'));
  }finally{console.warn=original;}
});
