import {handleAdmin} from './admin.ts';
import type {Env} from './types.ts';

// Owner management is the sole HTTP ingress. Weixin Action execution is
// private Service Binding RPC via WeixinActionProvider.
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    if(!env.ADMIN_HOST||url.protocol!=='https:'||url.port||
       url.hostname!==env.ADMIN_HOST)
      return Response.json({error:'not_found'},{status:404,
        headers:{'cache-control':'no-store'}});
    // ChatGPT appends this tracker to links. Redirect only the public GET
    // entry URL to its canonical path; never change POST or admin operations.
    if(request.method==='GET'&&url.pathname==='/setup'&&
       url.search==='?utm_source=chatgpt.com')
      return new Response(null,{status:303,headers:{
        location:'https://'+env.ADMIN_HOST+'/setup','cache-control':'no-store',
      }});
    if(url.search)
      return Response.json({error:'not_found'},{status:404,
        headers:{'cache-control':'no-store'}});
    return handleAdmin(request,env);
  },
};
