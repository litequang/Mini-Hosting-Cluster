// MHC TEST 0.5.0B2: LAB-ONLY Cloudflare Durable Object witness.
// Not a production writer lock or proof that MariaDB/Nginx honor the lease.
// No takeover/HA grant API: expiry, clock anomaly or admin freeze are terminal.
export const SCOPE = 'MHC_LAB_WITNESS_ONLY_NO_HA';
const CID=/^[a-z][a-z0-9-]{2,39}$/;
const NID=/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/;
const TTL_MS=12000;
const noStore={'cache-control':'no-store','content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff'};
function respond(body, status=200){return new Response(JSON.stringify({...body,scope:SCOPE,productionReady:false,haEligible:false})+'\n',{status,headers:noStore});}
function constantTime(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);let diff=x.length^y.length;for(let i=0;i<Math.max(x.length,y.length);i++)diff|=(x[i]||0)^(y[i]||0);return diff===0&&x.length>0;}
function credential(req,env){
 const h=req.headers.get('authorization')||'';if(!h.startsWith('Bearer '))return null;
 const token=h.slice(7),node=req.headers.get('x-mhc-lab-node')||'';
 if(typeof env.LAB_ADMIN_TOKEN==='string'&&constantTime(token,env.LAB_ADMIN_TOKEN))return {role:'admin',node:null};
 if(!NID.test(node))return null;
 let keys={};try{keys=JSON.parse(env.LAB_NODE_KEYS_JSON||'{}');}catch{return null;}
 const key=Object.hasOwn(keys,node)?keys[node]:null;
 return typeof key==='string'&&constantTime(token,key)?{role:'node',node}:null;
}
export default {
 async fetch(request,env){
  const u=new URL(request.url),m=/^\/v1\/lab\/([a-z][a-z0-9-]{2,39})\/(status|verify|grant-initial|renew|freeze)$/.exec(u.pathname);
  if(!m||!CID.test(m[1])||!env.LAB_WITNESSES)return respond({error:'NOT_FOUND'},404);
  const [,cluster,action]=m,identity=credential(request,env);
  if(!identity)return respond({error:'UNAUTHORIZED'},401);
  const allowedMethod=['status','verify'].includes(action)?'GET':'POST';
  if(request.method!==allowedMethod)return respond({error:'METHOD_NOT_ALLOWED'},405);
  if(['grant-initial','freeze'].includes(action)&&identity.role!=='admin')return respond({error:'ADMIN_REQUIRED'},403);
  if(['verify','renew'].includes(action)&&identity.role!=='node')return respond({error:'NODE_REQUIRED'},403);
  let body={};if(request.method==='POST'){
   const declared=Number(request.headers.get('content-length')||'0');if(declared>2048)return respond({error:'BODY_TOO_LARGE'},413);
   const raw=await request.text();if(raw.length>2048)return respond({error:'BODY_TOO_LARGE'},413);
   try{body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{return respond({error:'INVALID_BODY'},400);}
  }
  const nonce=u.searchParams.get('nonce')||'';
  if(['status','verify'].includes(action)&&!/^[a-f0-9]{32}$/.test(nonce))return respond({error:'NONCE_REQUIRED'},400);
  if(action==='grant-initial'&&!NID.test(body.nodeId||''))return respond({error:'INVALID_NODE'},400);
  if(action==='renew'&&(!Number.isSafeInteger(body.epoch)||body.epoch<1))return respond({error:'INVALID_EPOCH'},400);
  const stub=env.LAB_WITNESSES.get(env.LAB_WITNESSES.idFromName(cluster));
  const headers=new Headers({'x-mhc-internal-role':identity.role,'x-mhc-internal-node':identity.node||'', 'content-type':'application/json'});
  return stub.fetch(new Request('https://witness.internal/'+action+(nonce?'?nonce='+nonce:''),{method:request.method,headers,body:request.method==='POST'?JSON.stringify(body):undefined}));
 }
};
function initialState(){return {schema:1,phase:'EMPTY',epoch:0,owner:null,expiresAtMs:0,lastSeenMs:0};}
function safeState(s){return s&&s.schema===1&&['EMPTY','LEASED','FROZEN'].includes(s.phase)&&Number.isSafeInteger(s.epoch)&&s.epoch>=0&&Number.isSafeInteger(s.expiresAtMs)&&s.expiresAtMs>=0&&Number.isSafeInteger(s.lastSeenMs)&&s.lastSeenMs>=0&&(s.owner===null||NID.test(s.owner));}
// Uses the synchronous SQLite-backed Durable Object KV. New namespace only; see wrangler.toml.
export class LabWitness {
 constructor(ctx,env){this.ctx=ctx;this.env=env;}
 async fetch(req){
  const u=new URL(req.url),action=u.pathname.slice(1),role=req.headers.get('x-mhc-internal-role'),node=req.headers.get('x-mhc-internal-node');
  if(!['status','verify','grant-initial','renew','freeze'].includes(action))return respond({error:'UNKNOWN_ACTION'},404);
  if(['grant-initial','freeze'].includes(action)&&role!=='admin')return respond({error:'ADMIN_REQUIRED'},403);
  if(['renew','verify'].includes(action)&&(!NID.test(node||'')||role!=='node'))return respond({error:'NODE_REQUIRED'},403);
  // IMPORTANT: parse request (async) BEFORE reading storage. The read->mutate->put
  // critical section must have no await to prevent concurrent grants with stale state.
  let error=null,code=200,changed=false;
  let body={};if(['grant-initial','renew'].includes(action)){
   try{body=await req.json();}catch{error='INVALID_BODY';code=400;}
  }
  const now=Date.now();let s=this.ctx.storage.kv.get('lease')??initialState();
  if(!safeState(s))return respond({error:'STORAGE_INVALID_FAIL_CLOSED'},503);
  const old=JSON.stringify(s);
  if(now<s.lastSeenMs||(s.phase==='LEASED'&&now>=s.expiresAtMs))s={...s,phase:'FROZEN',owner:null,expiresAtMs:0};
  s.lastSeenMs=Math.max(s.lastSeenMs,now);
  if(!error&&action==='grant-initial'){
   if(s.phase!=='EMPTY'||s.epoch!==0){error='INITIAL_GRANT_CLOSED';code=409;}
   else if(!NID.test(body.nodeId||'')){error='INVALID_NODE';code=400;}
   else{s={...s,phase:'LEASED',owner:body.nodeId,epoch:1,expiresAtMs:now+TTL_MS};changed=true;}
  }
  if(!error&&action==='renew'){
   if(s.phase!=='LEASED'||s.owner!==node||s.epoch!==body.epoch||now>=s.expiresAtMs){error='NOT_CURRENT_LEASE';code=409;}
   else{s={...s,expiresAtMs:now+TTL_MS};changed=true;}
  }
  if(action==='freeze'){s={...s,phase:'FROZEN',owner:null,expiresAtMs:0};changed=true;}
  // Persist fail-closed transitions before responding (including status/verify expiry).
  if(changed||JSON.stringify(s)!==old){this.ctx.storage.kv.put('lease',s);await this.ctx.storage.sync();}
  const nonce=u.searchParams.get('nonce')||null;
  const own=(role==='node'&&s.owner===node&&s.phase==='LEASED'&&now<s.expiresAtMs);
  if(action==='verify'&&!own){error='WRITE_GATE_DENIED';code=403;}
  return respond({action,nonce,phase:s.phase,epoch:s.epoch,serverNowMs:now,expiresAtMs:s.expiresAtMs,
    // Do not expose node identity to arbitrary authenticated peers; report only whether caller owns it.
    callerOwnsLease:own,allowedForLabGate:action==='verify'&&own,ttlMs:TTL_MS,
    ...(error?{error}:{})},code);
 }
}
