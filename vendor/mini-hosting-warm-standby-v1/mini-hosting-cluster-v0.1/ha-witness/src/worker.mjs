// Independent Cloudflare Durable Object lease arbitrator. Never deployed automatically.
// Only authenticated nodes can renew/acquire. Only HA_ADMIN_TOKEN can change policy.
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const LEASE=30_000, WINDOW=20_000;
const HEAD={'content-type':'application/json;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const reply=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:HEAD});
async function digest(s){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function fresh(p,now,ttl){const t=Date.parse(p?.observedAt||'');return Number.isFinite(t)&&t<=now+3000&&t>=now-ttl;}
function gtid(s){return typeof s==='string'&&s.length>0&&s.length<512&&/^\d+-\d+-\d+(,\d+-\d+-\d+)*$/.test(s);}
function leaderHealthy(p){return p&&typeof p==='object'&&p.appDatabase==='thophuong_pro'&&p.db?.available===true&&p.db?.logBin===true&&gtid(p.db.gtidBinlogPos)&&p.services&&typeof p.observedAt==='string';}
function proof(p){return leaderHealthy(p)&&p.assets?.verified===true&&fresh(p.assets,Date.now(),300_000)&&typeof p.assets?.checkpoint==='string'&&/^[a-f0-9]{64}$/.test(p.assets.checkpoint);}
function candidate(p,old,now,rpo,graceful=false){if(!proof(p)||!fresh(p,now,WINDOW))return 'NODE_UNHEALTHY';
 if(p.db.slaveIo!=='Yes'||p.db.slaveSql!=='Yes'||p.db.secondsBehind!==0)return 'REPLICA_NOT_CAUGHT_UP';
 if(p.services.miniWeb==='run'||p.services.tunnel==='run')return 'NODE_ALREADY_SERVING';
 if(!old||!proof(old))return 'NO_LEADER_CHECKPOINT';
 if(!gtid(p.db.gtidSlavePos)||p.db.gtidSlavePos!==old.db.gtidBinlogPos)return 'GTID_MISMATCH';
 if(p.assets.checkpoint!==old.assets.checkpoint)return 'ASSETS_MISMATCH';
 if(p.db.serverId===old.db.serverId)return 'DUPLICATE_SERVER_ID';
 if(!graceful&&(rpo<=0||!fresh(old,now,rpo*1000)))return 'RPO_UNPROVEN';
 if(graceful&&(old.db.readOnly!==true||old.services.miniWeb!=='down'||old.services.tunnel!=='down'))return 'RELEASE_FENCING_UNPROVEN';
 return null;
}
export default {async fetch(request,env){
 if(request.method!=='POST')return reply({error:'POST only'},405);
 const length=Number(request.headers.get('content-length')||0);if(length>12000)return reply({error:'Too large'},413);
 let v;try{const t=await request.text();if(t.length>12000)throw Error();v=JSON.parse(t);}catch{return reply({error:'Invalid body'},400);}
 if(!UUID.test(v?.clusterId))return reply({error:'Bad cluster'},400);
 const token=(request.headers.get('authorization')||'').match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1];if(!token)return reply({error:'Authorization required'},401);
 const isAdmin=env.HA_ADMIN_TOKEN&&token.length===env.HA_ADMIN_TOKEN.length&&token===env.HA_ADMIN_TOKEN;
 const id=env.CLUSTERS.idFromName(v.clusterId);return env.CLUSTERS.get(id).fetch(new Request('https://ha.internal'+new URL(request.url).pathname,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...v,credentialHash:await digest(token),isAdmin})}));
 }};
export class ClusterLease {
 constructor(ctx,env){this.ctx=ctx;this.env=env;
  this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS nodes(id TEXT PRIMARY KEY, token_hash TEXT NOT NULL)`);
  this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS control(id INTEGER PRIMARY KEY CHECK(id=1), mode TEXT, preferred TEXT, leader TEXT, term INTEGER, expiry INTEGER, rpo INTEGER, leader_proof TEXT, released_to TEXT)`);
  this.ctx.storage.sql.exec(`INSERT OR IGNORE INTO control VALUES (1,'manual',NULL,NULL,0,0,0,NULL,NULL)`);
 }
 async fetch(request){const action=new URL(request.url).pathname, v=await request.json(),sql=this.ctx.storage.sql, now=Date.now();
  const rec=()=>sql.exec('SELECT * FROM control WHERE id=1').toArray()[0];const row=rec();
  const who=()=>{const n=sql.exec('SELECT token_hash FROM nodes WHERE id=?',v.nodeId).toArray()[0];return UUID.test(v.nodeId||'')&&n?.token_hash===v.credentialHash;};
  if(action.startsWith('/v1/admin/')){
   if(!v.isAdmin)return reply({error:'Admin credential required'},403);
   if(action==='/v1/admin/register'){
    if(!UUID.test(v.nodeId||'')||typeof v.nodeTokenHash!=='string'||!/^[a-f0-9]{64}$/.test(v.nodeTokenHash))return reply({error:'Invalid node'},400);
    const prior=sql.exec('SELECT token_hash FROM nodes WHERE id=?',v.nodeId).toArray()[0];
    if(prior&&prior.token_hash!==v.nodeTokenHash)return reply({error:'Existing node credentials cannot be overwritten'},409);
    sql.exec('INSERT OR IGNORE INTO nodes(id,token_hash) VALUES(?,?)',v.nodeId,v.nodeTokenHash);return reply({ok:true});
   }
   if(action==='/v1/admin/config'){
    if(!['manual','auto'].includes(v.mode)||!UUID.test(v.preferredNodeId||''))return reply({error:'Mode and preferred node required'},400);
    if(!sql.exec('SELECT id FROM nodes WHERE id=?',v.preferredNodeId).toArray().length)return reply({error:'Preferred node not registered'},400);
    const rpo=Number(v.maxRpoSeconds);if(!Number.isInteger(rpo)||rpo<0||rpo>300)return reply({error:'RPO 0..300'},400);
    if(row.leader&&row.expiry>now&&row.preferred!==v.preferredNodeId)return reply({error:'Cannot change preferred while a live leader lease exists; planned switchover required'},409);
    sql.exec('UPDATE control SET mode=?,preferred=?,rpo=? WHERE id=1',v.mode,v.preferredNodeId,rpo);return reply({ok:true,mode:v.mode,preferredNodeId:v.preferredNodeId,rpo});
   }
   if(action==='/v1/admin/status')return reply({mode:row.mode,preferredNodeId:row.preferred,leaderId:row.leader,term:row.term,expiresAt:row.expiry,maxRpoSeconds:row.rpo,nodes:sql.exec('SELECT id FROM nodes').toArray().map(x=>x.id)});
   return reply({error:'Unknown admin command'},404);
  }
  if(!who())return reply({error:'Unregistered node or bad credentials'},403);
  if(action==='/v1/status')return reply({mode:row.mode,preferredNodeId:row.preferred,leaderId:row.expiry>now?row.leader:null,term:row.term,expiresAt:row.expiry,maxRpoSeconds:row.rpo});
  if(action==='/v1/release'){
   if(row.leader!==v.nodeId)return reply({error:'Not last known leader'},409);
   // Operator must have stopped local web and tunnel prior to release.
   if(v.proof?.services?.miniWeb!=='down'||v.proof?.services?.tunnel!=='down'||v.proof?.db?.readOnly!==true)return reply({error:'Leader is not fenced and read-only'},409);
   if(!proof(v.proof))return reply({error:'Bad checkpoint'},409);
   if(!UUID.test(v.targetNodeId||'')||v.targetNodeId===v.nodeId||!sql.exec('SELECT id FROM nodes WHERE id=?',v.targetNodeId).toArray().length)return reply({error:'Target standby not registered'},409);
   sql.exec("UPDATE control SET expiry=0,preferred=?,mode='manual',leader_proof=?,released_to=? WHERE id=1",v.targetNodeId,JSON.stringify(v.proof),v.targetNodeId);return reply({released:true,term:row.term,targetNodeId:v.targetNodeId});
  }
  if(action!=='/v1/lease')return reply({error:'Not found'},404);
  const p=v.proof;if(p?.clusterId!==v.clusterId||p?.nodeId!==v.nodeId||!leaderHealthy(p)||!fresh(p,now,WINDOW))return reply({granted:false,reason:'INVALID_PROOF',leaderId:row.leader});
  if(row.leader===v.nodeId&&row.expiry>now){
   // Renewal must not require repeated full 500 MB asset hashing; failover does.
   // Existing holder may renew only while DB health remains good; service processes may be running.
   sql.exec('UPDATE control SET expiry=?,leader_proof=? WHERE id=1',now+LEASE,JSON.stringify(p));return reply({granted:true,leaderId:v.nodeId,term:row.term,expiresAt:now+LEASE});
  }
  if(row.leader&&row.expiry>now)return reply({granted:false,reason:'LEASE_HELD',leaderId:row.leader,expiresAt:row.expiry});
  if(!row.preferred)return reply({granted:false,reason:'NOT_CONFIGURED'});
  if(row.mode==='manual'&&row.preferred!==v.nodeId)return reply({granted:false,reason:'NOT_SELECTED',leaderId:row.leader});
  if(!proof(p))return reply({granted:false,reason:'INCREMENTAL_ASSETS_UNVERIFIED'});
  const old=row.leader_proof?JSON.parse(row.leader_proof):null;
  if(old){const why=candidate(p,old,now,row.rpo,row.released_to===v.nodeId);if(why)return reply({granted:false,reason:why,leaderId:row.leader});}
  else if(v.nodeId!==row.preferred)return reply({granted:false,reason:'BOOTSTRAP_PREFERRED_ONLY'});
  // All mutations in this DO are sequentially serialized; no two grants overlap.
  sql.exec('UPDATE control SET leader=?,term=?,expiry=?,leader_proof=?,released_to=NULL WHERE id=1',v.nodeId,row.term+1,now+LEASE,JSON.stringify(p));
  return reply({granted:true,leaderId:v.nodeId,term:row.term+1,expiresAt:now+LEASE});
 }
}
