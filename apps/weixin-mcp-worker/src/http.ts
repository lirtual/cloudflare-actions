import {handleAdmin} from './admin.ts';
import type {Env} from './types.ts';

// Owner management is the sole HTTP ingress. Weixin Action execution is
// private Service Binding RPC via WeixinActionProvider.
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    if(!env.ADMIN_HOST||url.protocol!=='https:'||url.port||
       url.hostname!==env.ADMIN_HOST||url.search)
      return Response.json({error:'not_found'},{status:404,
        headers:{'cache-control':'no-store'}});
    return handleAdmin(request,env);
  },
};
