import {WorkerEntrypoint} from 'cloudflare:workers';
import ownerHttp from '../../weixin-mcp-worker/src/http.ts';
import {createActionDispatcher,type Env} from './dispatch.ts';

export default class ActionsEntrypoint extends WorkerEntrypoint<Env>{
 async listActions(){return createActionDispatcher(this.env).listActions();}
 async getContract(action_id:string){return createActionDispatcher(this.env).getContract(action_id);}
 async execute(action_id:string,invocation:unknown){return createActionDispatcher(this.env).execute(action_id,invocation);}
 async getReceipt(action_id:string,query:unknown){return createActionDispatcher(this.env).getReceipt(action_id,query);}
 async getBinding(action_id:string){return createActionDispatcher(this.env).getBinding(action_id);}
 override async fetch(request:Request){return ownerHttp.fetch(request,this.env);}
}
