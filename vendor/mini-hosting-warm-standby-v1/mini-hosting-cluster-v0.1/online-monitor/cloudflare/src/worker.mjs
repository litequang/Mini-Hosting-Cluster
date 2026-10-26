import { HTML, CLIENT_JS, CSS } from './ui.mjs';

const MONITOR_HOST='monitor.thophuong.com';
const TELEMETRY_HOST='telemetry.thophuong.com';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEADERS={'cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer','cross-origin-resource-policy':'same-origin'};
function result(obj,status=200){return new Response(JSON.stringify(obj),{status,headers:{...HEADERS,'content-type':'application/json;charset=utf-8'}})}
function text(str,status=200,type='text/plain;charset=utf-8'){
 return new Response(str,{status,headers:{...HEADERS,'content-type':type,
  'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"}});
}
async function digest(input){const arr=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input)));return Array.from(arr,x=>x.toString(16).padStart(2,'0')).join('');}
function smallStr(s,max=80){return typeof s==='string'?s.slice(0,max):null}
function number(n,min,max){const v=Number(n);return n!==null&&n!==undefined&&Number.isFinite(v)&&v>=min&&v<=max?v:null;}
function obj(o){return o&&typeof o==='object'&&!Array.isArray(o)?o:{};}
function state(s){return ['run','down','unknown'].includes(s)?s:'unknown';}
function safeBytes(n){return number(n,0,1e15);}
function truncateProcesses(raw){return Array.isArray(raw)?raw.slice(0,12).map(x=>({
 name:smallStr(x?.name,90),rssBytes:safeBytes(x?.rssBytes),uptimeSec:number(x?.uptimeSec,0,1e10)
})):[];}
// All data accepted into the DO is strictly allowlisted. No command, paths, IPs,
// credentials, env values, process args, Wifi SSID or shell logs are stored.
export function sanitize(raw){
 const x=obj(raw), s=obj(x.services),m=obj(x.monitor),b=obj(m.battery),ram=obj(m.memory),disk=obj(m.disk),wifi=obj(m.wifi),network=obj(m.network);
 return {nodeId:smallStr(x.nodeId,40),clusterId:smallStr(x.clusterId,40),label:smallStr(x.label,40),declaredRole:x.declaredRole==='primary'?'primary':'standby',
 observedAt:smallStr(x.observedAt,40),
 services:{mysqld:state(s.mysqld),nginx:state(s.nginx),miniWeb:state(s.miniWeb),tunnel:state(s.tunnel),panel:state(s.panel),standbySync:state(s.standbySync)},
 appPresent:x.appPresent===true,snapshotApplied:smallStr(x.snapshotApplied,100),backupName:smallStr(x.backupName,100),
 syncAgeSeconds:number(x.syncAgeSeconds,0,1e9),
 storageAvailableMiB:number(x.storageAvailableMiB,0,1e9),
 monitor:{battery:{available:b.available===true,percentage:number(b.percentage,0,100),temperatureC:number(b.temperatureC,-30,120),plugged:smallStr(b.plugged,30),status:smallStr(b.status,30),health:smallStr(b.health,30)},
 memory:{total:safeBytes(ram.total),used:safeBytes(ram.used),available:safeBytes(ram.available)},
 disk:{total:safeBytes(disk.total),used:safeBytes(disk.used),available:safeBytes(disk.available)},
 wifi:{status:['online','offline','unknown'].includes(wifi.status)?wifi.status:'unknown',rssi:number(wifi.rssi,-130,0),speedMbps:number(wifi.speedMbps,0,1e5)},
 systemUptimeSec:number(m.systemUptimeSec,0,1e10),nodeProcesses:truncateProcesses(m.nodeProcesses),
 outagesLast24h:number(network.outagesLast24h,0,1e7)}};
}
async function haAdmin(env,action,v){
 if(!env.HA_ADMIN_TOKEN||!uuid.test(env.HA_CLUSTER_ID||''))return result({error:'HA admin not configured; monitor remains read-only'},503);
 const r=await fetch('https://ha-control.thophuong.com/v1/admin/'+action,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+env.HA_ADMIN_TOKEN},body:JSON.stringify({clusterId:env.HA_CLUSTER_ID,...v})});
 return result(await r.json().catch(()=>({error:'HA witness unavailable'})),r.status);
}
function store(env){return env.STORE.get(env.STORE.idFromName('mini-hosting-cluster-monitor-all-nodes-v1'));}
async function proxy(env,action,payload){return store(env).fetch(new Request('https://durable.internal/'+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}));}
async function authViewer(ctx,env){
 // Fail closed even if the customer forgets to enable hostname-based Access.
 if(!ctx?.access || !env.ACCESS_ALLOWED_EMAIL)return false;
 try{const identity=await ctx.access.getIdentity();return typeof identity?.email==='string'&&identity.email.toLowerCase()===env.ACCESS_ALLOWED_EMAIL.toLowerCase();}
 catch{return false;}
}
export default {async fetch(request,env,ctx){
 const url=new URL(request.url), host=url.hostname.toLowerCase();
 if(host!==MONITOR_HOST&&host!==TELEMETRY_HOST)return text('Unknown hostname',404);
 if(host===MONITOR_HOST){
  if(!(await authViewer(ctx,env)))return text('Cloudflare Access authorization required',403);
  if(request.method==='GET'&&url.pathname==='/')return text(HTML,200,'text/html;charset=utf-8');
  if(request.method==='GET'&&url.pathname==='/app.js')return text(CLIENT_JS,200,'text/javascript;charset=utf-8');
  if(request.method==='GET'&&url.pathname==='/style.css')return text(CSS,200,'text/css;charset=utf-8');
  if(request.method==='GET'&&url.pathname==='/api/nodes')return await proxy(env,'nodes',{});
  if(request.method==='POST'&&url.pathname==='/api/pair')return await proxy(env,'pair',{});
  if(request.method==='GET'&&url.pathname==='/api/ha')return await haAdmin(env,'status',{});
  if(request.method==='POST'&&url.pathname==='/api/ha/config'){
   if(request.headers.get('origin')!=='https://monitor.thophuong.com'||request.headers.get('content-type')?.split(';')[0]!=='application/json')return text('Invalid request origin or content type',403);
   if(Number(request.headers.get('content-length')||0)>512)return text('Payload too large',413);
   let v;try{const raw=await request.text();if(raw.length>512)throw Error();v=JSON.parse(raw);}catch{return text('Invalid JSON',400);}
   if(!['manual','auto'].includes(v.mode)||!uuid.test(v.preferredNodeId||'')||!Number.isInteger(v.maxRpoSeconds)||v.maxRpoSeconds<0||v.maxRpoSeconds>300)return text('Invalid HA config',400);
   return await haAdmin(env,'config',{mode:v.mode,preferredNodeId:v.preferredNodeId,maxRpoSeconds:v.maxRpoSeconds});
  }
  return text('Not found',404);
 }
 if(request.method!=='POST'||!['/v1/enroll','/v1/heartbeat'].includes(url.pathname))return text('Not found',404);
 if(Number(request.headers.get('content-length')||0)>16000)return text('Payload too large',413);
 const raw=await request.text();if(raw.length>16000)return text('Payload too large',413);
 let v;try{v=JSON.parse(raw);}catch{return text('Invalid JSON',400);}
 if(!uuid.test(v?.clusterId)||!uuid.test(v?.nodeId))return text('Invalid identity',400);
 if(url.pathname==='/v1/enroll'){
  const code=v?.pairingCode, token=v?.token;
  if(typeof code!=='string'||code.length<20||code.length>150||typeof token!=='string'||token.length<36||token.length>200)return text('Bad enrollment',400);
  return await proxy(env,'enroll',{clusterId:v.clusterId,nodeId:v.nodeId,label:smallStr(v.label,40)||'Node',tokenHash:await digest(token),pairHash:await digest(code)});
 }
 const bearer=/^Bearer ([A-Za-z0-9_-]{36,200})$/.exec(request.headers.get('authorization')||'');
 if(!bearer)return text('Authorization required',401);
 const data=sanitize(v);
 return await proxy(env,'heartbeat',{clusterId:v.clusterId,nodeId:v.nodeId,tokenHash:await digest(bearer[1]),data});
}};

export class MonitorStore {
 constructor(ctx,env){
  this.ctx=ctx;this.env=env;
  this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS nodes (
   node_id TEXT PRIMARY KEY, cluster_id TEXT NOT NULL, label TEXT NOT NULL,
   token_hash TEXT NOT NULL, first_seen_ms INTEGER NOT NULL,
   seen_ms INTEGER, body TEXT NOT NULL)`);
  this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS pairing (
   hash TEXT PRIMARY KEY, expires_ms INTEGER NOT NULL)`);
 }
 async fetch(request){
  const url=new URL(request.url),a=url.pathname.slice(1);let v;
  try{v=await request.json();}catch{return result({error:'Bad JSON'},400);}
  const sql=this.ctx.storage.sql;
  if(a==='pair'){
   const code=crypto.randomUUID()+'-'+crypto.randomUUID();
   const hash=await digest(code), now=Date.now();
   sql.exec('DELETE FROM pairing WHERE expires_ms < ?',now);
   sql.exec('INSERT INTO pairing(hash,expires_ms) VALUES (?,?)',hash,now+10*60000);
   return result({pairingCode:code,validSeconds:600});
  }
  if(a==='enroll'){
   const pair=sql.exec('SELECT expires_ms FROM pairing WHERE hash = ?',v.pairHash).toArray()[0];
   if(!pair||pair.expires_ms<Date.now())return result({error:'Invalid or expired pairing code'},403);
   // Single-use token; never overwrite enrolled node credentials via a second pairing.
   const existing=sql.exec('SELECT node_id FROM nodes WHERE node_id = ?',v.nodeId).toArray()[0];
   if(existing)return result({error:'Node already enrolled; revoke manually before re-enrolling'},409);
   sql.exec('DELETE FROM pairing WHERE hash = ?',v.pairHash);
   sql.exec('INSERT INTO nodes(node_id,cluster_id,label,token_hash,first_seen_ms,seen_ms,body) VALUES (?,?,?,?,?,?,?)',
    v.nodeId,v.clusterId,v.label,v.tokenHash,Date.now(),null,'{}');
   return result({ok:true,nodeId:v.nodeId});
  }
  if(a==='heartbeat'){
   const row=sql.exec('SELECT cluster_id,token_hash FROM nodes WHERE node_id = ?',v.nodeId).toArray()[0];
   if(!row||row.cluster_id!==v.clusterId||row.token_hash!==v.tokenHash)return result({error:'Invalid node credentials'},403);
   if(v.data.nodeId!==v.nodeId||v.data.clusterId!==v.clusterId)return result({error:'Heartbeat identity mismatch'},400);
   sql.exec('UPDATE nodes SET seen_ms=?,body=? WHERE node_id=?',Date.now(),JSON.stringify(v.data),v.nodeId);
   return result({ok:true});
  }
  if(a==='nodes'){
   const rows=sql.exec('SELECT node_id,cluster_id,label,first_seen_ms,seen_ms,body FROM nodes ORDER BY label LIMIT 200').toArray();
   const now=Date.now();
   const nodes=rows.map(x=>{
    let data;try{data=JSON.parse(x.body);}catch{data={};}
    return {nodeId:x.node_id,clusterId:x.cluster_id,label:x.label,firstSeenAt:new Date(x.first_seen_ms).toISOString(),
     lastSeenAt:x.seen_ms?new Date(x.seen_ms).toISOString():null,
     online:x.seen_ms!==null&&now-x.seen_ms<180000,
     health:data};
   });
   const serving=nodes.filter(x=>x.online&&x.health?.services?.miniWeb==='run'&&x.health?.services?.tunnel==='run');
   return result({asOf:new Date(now).toISOString(),nodes,observedServingCandidates:serving.map(x=>x.nodeId),
    authoritativeLeader:null,autoFailoverEnabled:false,
    warning:'Candidate only: service status cannot prove traffic routing, data freshness or fencing. Manual/automatic failover is NOT active.'});
  }
  return result({error:'Not found'},404);
 }
}
