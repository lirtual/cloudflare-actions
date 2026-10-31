import {ACTION_MANIFEST as WEIXIN_MANIFEST,providerIdentity,bindingIdentity,
 readActionReceipt,sendTextAction,sendDownloadCompleteAction,sendGenericTextAction,DOWNLOAD_ACTION_MANIFEST,
 type TextInvocation,type DownloadInvocation,type GenericInvocation,type ReceiptQuery}
 from '../../weixin-mcp-worker/src/provider.ts';
import {ACTION_MANIFEST as BARK_MANIFEST,getContract as barkContract,
 sendNotification,type Invocation} from '../../bark-provider/src/notification.ts';
import type {Env as WeixinEnv} from '../../weixin-mcp-worker/src/types.ts';
import type {Env as BarkEnv} from '../../bark-provider/src/notification.ts';
import {DUB_MANIFEST,shortenDub} from './dub.ts';
import {ENVSHARE_MANIFEST,shareEnvshare} from './envshare.ts';

export type Env=WeixinEnv & BarkEnv;
// Build-time, reviewed catalog: no runtime configuration or dynamic imports.
export const ACTION_CATALOG=Object.freeze({
 'dub.shorten_url':DUB_MANIFEST,
 'envshare.share_text':ENVSHARE_MANIFEST,
 'bark.send_notification':Object.freeze({...BARK_MANIFEST,
   service:'cloudflare-actions',entrypoint:'ActionsEntrypoint'}),
 'weixin.send_text':Object.freeze({...WEIXIN_MANIFEST,
   service:'cloudflare-actions',entrypoint:'ActionsEntrypoint'}),
 'weixin.notify_download':Object.freeze({...DOWNLOAD_ACTION_MANIFEST,
   service:'cloudflare-actions',entrypoint:'ActionsEntrypoint'}),
});
// New text-first transport on the unified Worker. Version 2 remains immutable
// on the old Worker for already-published Plans and historical receipts.
export const UNIFIED_GENERIC_MANIFEST=Object.freeze({
 ...ACTION_CATALOG['weixin.send_text'],version:3,
 input_schema:{type:'object',additionalProperties:false,required:['text'],
  properties:{text:{type:'string',minLength:1,maxLength:2048},session_step_id:{type:'string'}}},
});
type ActionId=keyof typeof ACTION_CATALOG;
function registered(value:string):ActionId{
 if(!Object.hasOwn(ACTION_CATALOG,value))throw new Error('unknown_action');
 return value as ActionId;
}

/** The Workflow's durable admission is authoritative; this private RPC
 * independently validates each action's input and runtime contract.
 * The HTTP Owner entrypoint does not expose any of these operations.
 */
export function createActionDispatcher(env:Env){
 return {
  async listActions(){
   return Object.keys(ACTION_CATALOG).map(action_id=>({action_id}));
  },
  async getContract(action_id:string,contract_digest?:string){
   const action=registered(action_id);
   const normal=ACTION_CATALOG[action];
   const digest=action==='weixin.send_text'?
     await providerIdentity(env,normal):null;
   // A requested digest selects that exact reviewed contract, never a fallback.
   // Without a digest, weixin.send_text advertises the current v3 contract;
   // the original v1 remains available only to callers pinning its digest.
   const manifest=action==='weixin.send_text'&&contract_digest!==digest?.contract_digest?
      UNIFIED_GENERIC_MANIFEST:normal;
   const identity=action!=='bark.send_notification'&&action!=='dub.shorten_url'&&action!=='envshare.share_text'
    ?await providerIdentity(env,manifest):await barkContract(env,manifest);
   if(contract_digest!==undefined&&contract_digest!==identity.contract_digest)
    throw new Error('unknown_contract');
   return {...identity,manifest};
  },
  async execute(action_id:string,invocation:unknown){
   const action=registered(action_id);
   if(!invocation||typeof invocation!=='object'||Array.isArray(invocation))
    throw new Error('invalid_invocation');
   if(action==='dub.shorten_url')return shortenDub(env,invocation as Parameters<typeof shortenDub>[1]);
   if(action==='envshare.share_text')return shareEnvshare(env,invocation as Parameters<typeof shareEnvshare>[1]);
   return action==='weixin.send_text'
    ?((await providerIdentity(env,UNIFIED_GENERIC_MANIFEST)).contract_digest===
      (invocation as GenericInvocation).contract_digest
      ?sendGenericTextAction(env,invocation as GenericInvocation,undefined,undefined,UNIFIED_GENERIC_MANIFEST)
      :sendTextAction(env,invocation as TextInvocation,undefined,undefined,ACTION_CATALOG[action]))
    :action==='weixin.notify_download'
    ?sendDownloadCompleteAction(env,invocation as DownloadInvocation,undefined,undefined,ACTION_CATALOG[action])
    :sendNotification(env,invocation as Invocation,undefined,ACTION_CATALOG[action]);
  },
  async getReceipt(action_id:string,query:unknown){
   if(registered(action_id)!=='weixin.send_text'&&action_id!=='weixin.notify_download')throw new Error('receipt_not_supported');
   return readActionReceipt(env,query as ReceiptQuery);
  },
  async getBinding(action_id:string){
   if(registered(action_id)!=='weixin.send_text'&&action_id!=='weixin.notify_download')throw new Error('binding_not_supported');
   return bindingIdentity(env);
  },
 };
}
