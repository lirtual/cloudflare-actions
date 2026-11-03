import {WorkerEntrypoint} from 'cloudflare:workers';
import {createActionDispatcher,type Env} from './dispatch.ts';

// Owner QR/HTTP endpoints are retired from the single private Actions Worker.
// Keep the Service Binding entrypoint and its reviewed four-action catalog.
export class ActionsEntrypoint extends WorkerEntrypoint<Env>{
 async listActions(){return createActionDispatcher(this.env).listActions();}
 async getContract(action_id:string,contract_digest?:string){
  return createActionDispatcher(this.env).getContract(action_id,contract_digest);
 }
 async execute(action_id:string,invocation:unknown){
  return createActionDispatcher(this.env).execute(action_id,invocation);
 }
 async getReceipt(action_id:string,query:unknown){
  return createActionDispatcher(this.env).getReceipt(action_id,query);
 }
 async getBinding(action_id:string){
  return createActionDispatcher(this.env).getBinding(action_id);
 }
 override async fetch(_request:Request){return new Response('Not Found',{status:404});}
}
export default ActionsEntrypoint;
