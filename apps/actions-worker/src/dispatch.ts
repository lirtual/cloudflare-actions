import {ACTION_MANIFEST as BARK_MANIFEST,getContract as pinnedContract,
 sendNotification,type Invocation} from './bark.ts';
import type {Env as BarkEnv} from './bark.ts';
import {DUB_MANIFEST,shortenDub} from './dub.ts';
import {ENVSHARE_MANIFEST,shareEnvshare} from './envshare.ts';
import {LITTERBOX_MANIFEST,uploadLitterbox} from './litterbox.ts';
import {DIAGNOSTIC_MANIFEST,pingDiagnostic} from './diagnostic.ts';

export type Env=BarkEnv;
// Exact, build-time allowlist. Legacy Weixin identities are deliberately
// absent even when their historical digest or old receipt still exists.
export const ACTION_CATALOG=Object.freeze({
 'dub.shorten_url':DUB_MANIFEST,
 'envshare.share_text':ENVSHARE_MANIFEST,
 'litterbox.upload_file':LITTERBOX_MANIFEST,
 'bark.send_notification':BARK_MANIFEST,
 'diagnostic.ping':DIAGNOSTIC_MANIFEST,
});
type ActionId=keyof typeof ACTION_CATALOG;
function registered(action:string):ActionId{
 if(!Object.hasOwn(ACTION_CATALOG,action))throw Error('unknown_action');
 return action as ActionId;
}

export function createActionDispatcher(env:Env){
 return {
  async listActions(){return Object.keys(ACTION_CATALOG).map(action_id=>({action_id}));},
  async getContract(action_id:string,contract_digest?:string){
   const manifest=ACTION_CATALOG[registered(action_id)];
   const identity=await pinnedContract(env,manifest);
   if(contract_digest!==undefined&&contract_digest!==identity.contract_digest)
    throw Error('unknown_contract');
   return {...identity,manifest};
  },
  async execute(action_id:string,invocation:unknown){
   const action=registered(action_id);
   if(!invocation||typeof invocation!=='object'||Array.isArray(invocation))
    throw Error('invalid_invocation');
   if(action==='dub.shorten_url')return shortenDub(env,invocation as Parameters<typeof shortenDub>[1]);
   if(action==='envshare.share_text')return shareEnvshare(env,invocation as Parameters<typeof shareEnvshare>[1]);
   if(action==='litterbox.upload_file')return uploadLitterbox(env,invocation as Parameters<typeof uploadLitterbox>[1]);
   if(action==='diagnostic.ping')return pingDiagnostic(env,invocation);
   return sendNotification(env,invocation as Invocation,undefined,ACTION_CATALOG[action]);
  },
  async getReceipt(action_id:string,_query:unknown){
   registered(action_id);
   throw Error('receipt_not_supported');
  },
  async getBinding(action_id:string){
   registered(action_id);
   throw Error('binding_not_supported');
  },
 };
}
