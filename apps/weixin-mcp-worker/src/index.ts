import {WorkerEntrypoint} from 'cloudflare:workers';
import http from './http.ts';
import type {Env} from './types.ts';
import {sendTextAction,readActionReceipt,bindingIdentity,type TextInvocation,type ReceiptQuery} from './provider.ts';
export default class WeixinActionProvider extends WorkerEntrypoint<Env>{
  async sendText(input:TextInvocation){return sendTextAction(this.env,input);}
  async getReceipt(query:ReceiptQuery){return readActionReceipt(this.env,query);}
  async getBinding(){return bindingIdentity(this.env);}
  override async fetch(request:Request):Promise<Response>{return http.fetch(request,this.env);}
}
