import {WorkerEntrypoint} from 'cloudflare:workers';
import ownerHttp from './http.ts';
import type {Env} from './types.ts';
import {sendTextAction,readActionReceipt,bindingIdentity,type TextInvocation,type ReceiptQuery,providerIdentity} from './provider.ts';
export default class WeixinActionProvider extends WorkerEntrypoint<Env>{
  async sendText(input:TextInvocation){return sendTextAction(this.env,input);}
  async getReceipt(query:ReceiptQuery){return readActionReceipt(this.env,query);}
  async getBinding(){return bindingIdentity(this.env);}
  async getContract(){return providerIdentity(this.env);}
  override async fetch(request:Request):Promise<Response>{return ownerHttp.fetch(request,this.env);}
}
