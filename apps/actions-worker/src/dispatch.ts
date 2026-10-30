import {ACTION_MANIFEST as WEIXIN_MANIFEST,providerIdentity,bindingIdentity,
 readActionReceipt,sendTextAction,type TextInvocation,type ReceiptQuery}
 from '../../weixin-mcp-worker/src/provider.ts';
import {ACTION_MANIFEST as BARK_MANIFEST,getContract as barkContract,
 sendNotification,type Invocation} from '../../bark-provider/src/notification.ts';
import type {Env as WeixinEnv} from '../../weixin-mcp-worker/src/types.ts';
import type {Env as BarkEnv} from '../../bark-provider/src/notification.ts';

export type Env=WeixinEnv & BarkEnv;
// Build-time, reviewed catalog: no runtime configuration or dynamic imports.
export const ACTION_CATALOG=Object.freeze({
 'bark.send_notification':Object.freeze({...BARK_MANIFEST,
   service:'cloudflare-actions',entrypoint:'ActionsEntrypoint'}),
 'weixin.send_text':Object.freeze({...WEIXIN_MANIFEST,
   service:'cloudflare-actions',entrypoint:'ActionsEntrypoint'}),
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
  async getContract(action_id:string){
   const action=registered(action_id),manifest=ACTION_CATALOG[action];
   const identity=action==='weixin.send_text'
    ?await providerIdentity(env,manifest):await barkContract(env,manifest);
   return {...identity,manifest};
  },
  async execute(action_id:string,invocation:unknown){
   const action=registered(action_id);
   if(!invocation||typeof invocation!=='object'||Array.isArray(invocation))
    throw new Error('invalid_invocation');
   return action==='weixin.send_text'
    ?sendTextAction(env,invocation as TextInvocation,undefined,undefined,ACTION_CATALOG[action])
    :sendNotification(env,invocation as Invocation,undefined,ACTION_CATALOG[action]);
  },
  async getReceipt(action_id:string,query:unknown){
   if(registered(action_id)!=='weixin.send_text')throw new Error('receipt_not_supported');
   return readActionReceipt(env,query as ReceiptQuery);
  },
  async getBinding(action_id:string){
   if(registered(action_id)!=='weixin.send_text')throw new Error('binding_not_supported');
   return bindingIdentity(env);
  },
 };
}
