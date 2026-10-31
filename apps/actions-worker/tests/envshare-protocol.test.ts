import test from 'node:test';
import assert from 'node:assert/strict';
import {createDecipheriv,webcrypto} from 'node:crypto';

// Offline fixture for chronark/envshare v2 protocol. This is NOT a runnable
// Cloudflare Action and must not be mistaken for live third-party acceptance.
const B58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58(bytes:Uint8Array):string{
 let value=0n;
 for(const b of bytes)value=value*256n+BigInt(b);
 let s='';
 while(value){s=B58[Number(value%58n)]+s;value/=58n;}
 for(const b of bytes){if(b!==0)break;s='1'+s;}
 return s;
}
function fromBase58(value:string):Uint8Array{
 let n=0n;
 for(const c of value){
  const d=B58.indexOf(c);
  if(d<0)throw Error('invalid_base58');
  n=n*58n+BigInt(d);
 }
 const out:number[]=[];
 while(n>0n){out.unshift(Number(n%256n));n/=256n;}
 for(const c of value){if(c!=='1')break;out.unshift(0);}
 return Uint8Array.from(out);
}

test('EnvShare v2 ciphertext-only store payload and composite fragment are independently decryptable',async()=>{
 const plaintext='TOKEN=only-in-chat\nUTF8=加密文本';
 const id=new Uint8Array(16);
 id.set([0,255,1,2,3,4,5,6,7,8,9,10,11,12,13,14]);
 const key=webcrypto.getRandomValues(new Uint8Array(16));
 const iv=webcrypto.getRandomValues(new Uint8Array(16));
 const aes=await webcrypto.subtle.importKey('raw',key,'AES-GCM',false,['encrypt']);
 const encrypted=new Uint8Array(await webcrypto.subtle.encrypt(
  {name:'AES-GCM',iv},aes,new TextEncoder().encode(plaintext)));
 const wire={encrypted:base58(encrypted),iv:base58(iv),ttl:86400,reads:1};
 const payload=JSON.stringify(wire);
 // The only approved storage-side fields: no plaintext, key or share URL.
 assert.deepEqual(Object.keys(wire).sort(),['encrypted','iv','reads','ttl']);
 assert(!payload.includes(plaintext));
 assert(!payload.includes('TOKEN='));
 assert(!payload.includes(base58(key)));
 const fragment=base58(new Uint8Array([2,...id,...key]));
 const fullLink='https://envshare.dev/unseal#'+fragment;
 assert(!payload.includes(fragment));
 const decoded=fromBase58(fragment);
 assert.equal(decoded.length,33);
 assert.equal(decoded[0],2);
 assert.deepEqual(decoded.slice(1,17),id);
 assert.deepEqual(decoded.slice(17),key);
 assert.deepEqual(fromBase58(wire.iv),iv);
 assert.deepEqual(fromBase58(wire.encrypted),encrypted);
 const authTag=encrypted.slice(-16);
 const decipher=createDecipheriv('aes-128-gcm',key,iv);
 decipher.setAuthTag(authTag);
 const restored=Buffer.concat([
  decipher.update(encrypted.slice(0,-16)),decipher.final()
 ]).toString('utf8');
 assert.equal(restored,plaintext);
 // Proposed future Workflow persistence must contain encrypted input and a
 // safe ID only. This does not test or claim the current workflow does so.
 const proposedRunInputs={encrypted:wire.encrypted,iv:wire.iv,ttl:86400,reads:1};
 const proposedStepResult={status:'accepted',share_id:base58(id)};
 const recorded=JSON.stringify({inputs:proposedRunInputs,result:proposedStepResult});
 assert(!recorded.includes(plaintext));
 assert(!recorded.includes(fragment));
 assert(!recorded.includes(base58(key)));
 assert(!recorded.includes(fullLink));
});

test('EnvShare v2 Base58 fixture handles leading zeros and rejects nonalphabet characters',()=>{
 const bytes=Uint8Array.from([0,0,1,2,255,0]);
 assert.deepEqual(fromBase58(base58(bytes)),bytes);
 assert.equal(base58(new Uint8Array(16)),'1'.repeat(16));
 assert.throws(()=>fromBase58('O0Il'),/invalid_base58/);
});
