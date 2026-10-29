import {WorkerEntrypoint} from 'cloudflare:workers';
import {getContract,sendNotification,type Env,type Invocation} from './notification.ts';
export default class BarkActionProvider extends WorkerEntrypoint<Env>{
 async getContract(){return getContract(this.env);}
 async sendNotification(input:Invocation){return sendNotification(this.env,input);}
 override async fetch(){return new Response('Not Found',{status:404});}
}
