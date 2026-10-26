import {DurableObject} from 'cloudflare:workers';
import {dashboard} from './dashboard.mjs';
import {initialState,pulse,administer,publicStatus,validId} from './policy.mjs';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store'}});
function equal(a,b){if(!a||!b||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
async function readBody(req){const text=await req.text();if(text.length>8192)throw Error('Body too large');return JSON.parse(text||'{}');}
async function bearer(req){const v=req.headers.get('Authorization')||'';return v.startsWith('Bearer ')?v.slice(7):'';}
export class ClusterState extends DurableObject{
  async process(action,payload={}){
    return await this.ctx.storage.transaction(async tx=>{
      const now=Date.now();let s=await tx.get('state')||initialState();let decision=null;
      if(action==='pulse'){
        const r=pulse(s,payload.nodeId,payload.report||{},now);s=r.state;decision=r.decision;
      }else if(action==='admin')s=administer(s,payload.action,payload.params||{},now);
      else if(action!=='status')throw Error('Bad operation');
      if(action!=='status')await tx.put('state',s);
      return action==='pulse'?decision:publicStatus(s,now);
    });
  }
}
function allowedNode(req,env,id){
  if(!validId(id))return false;
  let keys={};try{keys=JSON.parse(env.MHC_NODE_TOKENS||'{}')}catch{}
  return equal(req.headers.get('authorization')?.replace(/^Bearer /,'')||'',keys[id]);
}
function isAdmin(req,env){return equal(req.headers.get('authorization')?.replace(/^Bearer /,'')||'',env.MHC_ADMIN_TOKEN)}
async function control(req,env,url){
  const cluster=env.MHC_CLUSTER_ID;if(!cluster)return json({error:'Cluster ID not configured'},503);
  const stub=env.CLUSTER.getByName(cluster);
  if(url.pathname==='/__mhc/api/pulse'){
    if(req.method!=='POST')return json({error:'POST required'},405);
    const payload=await readBody(req);
    if(!allowedNode(req,env,payload.nodeId))return json({error:'Forbidden'},403);
    const result=await stub.process('pulse',payload);return json(result);
  }
  if(!isAdmin(req,env))return json({error:'Unauthorized'},401);
  if(url.pathname==='/__mhc/api/status'&&req.method==='GET')return json(await stub.process('status'));
  if(url.pathname==='/__mhc/api/admin'&&req.method==='POST'){
    const payload=await readBody(req);
    return json(await stub.process('admin',payload));
  }
  return json({error:'Not found'},404);
}
async function route(req,env,url){
  const status=await env.CLUSTER.getByName(env.MHC_CLUSTER_ID).process('status');
  if(!status.current||status.leaseRemainingMs<=0||status.pending||status.blocked.includes(status.current))return json({error:'MHC: no fenced primary available'},503);
  let origins={};try{origins=JSON.parse(env.MHC_ORIGINS_JSON||'{}')}catch{}
  const target=origins[status.current];if(!target||!/^https:\/\/[a-zA-Z0-9.-]+\/?$/.test(target))return json({error:'Origin not configured'},503);
  if(!env.MHC_EDGE_SECRET)return json({error:'Edge secret not configured'},503);
  const destination=new URL(url.pathname+url.search,target);
  // Never route back to the public hostname; that could produce a proxy loop.
  if(destination.hostname===url.hostname)return json({error:'Recursive routing refused'},503);
  const headers=new Headers(req.headers);
  headers.delete('x-mhc-edge-secret');
  headers.set('x-mhc-edge-secret',env.MHC_EDGE_SECRET);
  headers.set('x-forwarded-host',url.hostname);
  headers.set('x-forwarded-proto','https');
  const upstream=new Request(destination,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:req.body,redirect:'manual'});
  try{return await fetch(upstream,{redirect:'manual'})}catch{return json({error:'Active origin unreachable'},502)}
}
export default {
  async fetch(req,env){
    try{
      const u=new URL(req.url);
      if(env.MHC_PUBLIC_HOST && u.hostname===env.MHC_PUBLIC_HOST && u.pathname.startsWith('/__mhc/'))return json({error:'Management endpoints are available only on the control hostname'},404);
      if(u.pathname.startsWith('/__mhc/api/'))return await control(req,env,u);
      if(u.pathname==='/__mhc/admin' && req.method==='GET')return dashboard();
      if(u.pathname==='/__mhc/healthz')return json({ok:true});
      // Routing must be explicitly configured on a separate zone route/hostname.
      if(env.MHC_PUBLIC_HOST && u.hostname===env.MHC_PUBLIC_HOST)return await route(req,env,u);
      return json({error:'No route for this hostname'},404);
    }catch(e){return json({error:e?.message||'Internal error'},400)}
  }
};
