// MHC v0.3: independent Durable Object control-plane. Authoritative term/lease.
// This is a decision service, NOT hardware fencing or a replication engine.
const H={'content-type':'application/json;charset=utf-8','cache-control':'no-store'};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ok=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:H});
const deadlineMs=20000, nodeFreshMs=16000;
function score(p){let n=0;const mem=Number(p?.availableMiB);if(Number.isFinite(mem))n+=Math.min(40,Math.floor(Math.max(0,mem)/256));
 const uptime=Number(p?.uptimeSec);if(Number.isFinite(uptime))n+=Math.min(20,Math.floor(Math.max(0,uptime)/86400)*4);
 if(p?.charging===true)n+=20;const battery=Number(p?.batteryPercentage);if(p?.batteryPercentage!==null&&p?.batteryPercentage!==undefined&&Number.isFinite(battery)){if(battery<15)n-=100;else if(battery>70)n+=10;}return n;}
function validId(s){return typeof s==='string'&&UUID.test(s);}
function eligible(p){return p&&p.fencingReady===true&&p.databaseReady===true&&p.filesReady===true&&p.replicationCaughtUp===true&&typeof p.gtid==='string'&&p.gtid.length>0&&typeof p.fileSeal==='string'&&p.fileSeal.length===64;}
export class ClusterArbiter {
 constructor(ctx,env){this.ctx=ctx;this.env=env;const db=ctx.storage.sql;
  db.exec(`CREATE TABLE IF NOT EXISTS clusters (
    cluster_id TEXT PRIMARY KEY, mode TEXT NOT NULL DEFAULT 'observe',
    preferred_node TEXT, requested_node TEXT,
    holder TEXT, term INTEGER NOT NULL DEFAULT 0, expires_ms INTEGER NOT NULL DEFAULT 0,
    data_gtid TEXT, file_seal TEXT, changed_ms INTEGER NOT NULL DEFAULT 0)`);
  db.exec(`CREATE TABLE IF NOT EXISTS candidates (
    cluster_id TEXT NOT NULL, node_id TEXT NOT NULL, seen_ms INTEGER NOT NULL,
    body TEXT NOT NULL, PRIMARY KEY(cluster_id,node_id))`);
 }
 load(id){return this.ctx.storage.sql.exec('SELECT * FROM clusters WHERE cluster_id=?',id).toArray()[0];}
 ensure(id){const db=this.ctx.storage.sql;db.exec("INSERT OR IGNORE INTO clusters(cluster_id,mode,changed_ms) VALUES (?,'observe',?)",id,Date.now());return this.load(id);}
 node(id,n){const x=this.ctx.storage.sql.exec('SELECT * FROM candidates WHERE cluster_id=? AND node_id=?',id,n).toArray()[0]; if(!x)return null;
  try{return {...x,proof:JSON.parse(x.body)}}catch{return null;}}
 live(id){return this.ctx.storage.sql.exec('SELECT * FROM candidates WHERE cluster_id=?',id).toArray().map(x=>({nodeId:x.node_id,seenMs:x.seen_ms,proof:JSON.parse(x.body)}));}
 // A replica may only claim an unowned or expired lease if its verified GTID/file seal
 // EQUAL the last acknowledged writer checkpoint. Any uncertainty => no promotion.
 ready(candidate,cluster,now){if(!candidate||now-candidate.seen_ms>=nodeFreshMs||!eligible(candidate.proof))return false;
  if(cluster.data_gtid&&candidate.proof.gtid!==cluster.data_gtid)return false;
  if(cluster.file_seal&&candidate.proof.fileSeal!==cluster.file_seal)return false;
  return true;}
 async fetch(request){let p;try{p=await request.json();}catch{return ok({error:'Invalid JSON'},400);}
  if(!validId(p?.clusterId))return ok({error:'Invalid cluster'},400);
  const db=this.ctx.storage.sql, now=Date.now();let c=this.ensure(p.clusterId);
  if(new URL(request.url).pathname==='/view'){
   return ok({clusterId:p.clusterId,mode:c.mode,preferredNodeId:c.preferred_node,requestedNodeId:c.requested_node,
    authoritativeLeader:c.holder,term:c.term,leaseExpiresAt:c.expires_ms?new Date(c.expires_ms).toISOString():null,
    controlEnabled:c.mode!=='observe',autoFailoverEnabled:c.mode==='auto',
    nodes:this.live(p.clusterId).map(n=>({nodeId:n.nodeId,online:now-n.seenMs<nodeFreshMs,ready:eligible(n.proof),score:score(n.proof),proof:n.proof})),
    warning:'Lease is control-plane authority, not proof of hardware fencing. Production activation requires protected service wrappers, GTID, file sealing and independent guard.'});
  }
  if(new URL(request.url).pathname==='/policy'){
   if(!['observe','manual','auto'].includes(p.mode))return ok({error:'Invalid mode'},400);
   if(p.preferredNodeId!==null&&p.preferredNodeId!==undefined&&!validId(p.preferredNodeId))return ok({error:'Invalid preferred node'},400);
   const preferred=p.preferredNodeId??null;
   if(preferred&&!this.node(p.clusterId,preferred))return ok({error:'Preferred node not enrolled in control plane'},409);
   // prevent optimistic race against stale browser state
   if(!Number.isSafeInteger(p.expectedTerm)||p.expectedTerm!==c.term)return ok({error:'Term changed; refresh and retry',term:c.term},409);
   // enabling mode is NOT sufficient to activate local process fencing; that is per-node opt-in
   db.exec('UPDATE clusters SET mode=?,preferred_node=?,changed_ms=? WHERE cluster_id=?',p.mode,preferred,now,p.clusterId);
   return ok({ok:true,mode:p.mode,term:c.term});
  }
  if(new URL(request.url).pathname==='/switch'){
   if(c.mode==='observe')return ok({error:'Control plane in observe mode'},409);
   if(!validId(p.targetNodeId)||!Number.isSafeInteger(p.expectedTerm)||p.expectedTerm!==c.term)return ok({error:'Invalid target or stale term'},409);
   const target=this.node(p.clusterId,p.targetNodeId);
   if(!this.ready(target,c,now))return ok({error:'Target not ready / GTID or file seal mismatch'},409);
   db.exec('UPDATE clusters SET requested_node=?,changed_ms=? WHERE cluster_id=?',p.targetNodeId,now,p.clusterId);
   return ok({ok:true,requestedNodeId:p.targetNodeId,term:c.term,
    message:'Pending: incumbent must fence and acknowledge before lease transfers.'});
  }
  if(new URL(request.url).pathname!=='/pulse')return ok({error:'Not found'},404);
  if(!validId(p.nodeId)||!p.proof||typeof p.proof!=='object')return ok({error:'Invalid node proof'},400);
  const proof={availableMiB:Number.isFinite(Number(p.proof.availableMiB))?Math.max(0,Math.min(10000000,Number(p.proof.availableMiB))):null,
   uptimeSec:Number.isFinite(Number(p.proof.uptimeSec))?Math.max(0,Math.min(1e10,Number(p.proof.uptimeSec))):null,
   charging:p.proof.charging===true,batteryPercentage:Number.isFinite(Number(p.proof.batteryPercentage))&&p.proof.batteryPercentage!==null?Math.max(0,Math.min(100,Number(p.proof.batteryPercentage))):null,
   fencingReady:p.proof.fencingReady===true,databaseReady:p.proof.databaseReady===true,
   filesReady:p.proof.filesReady===true,replicationCaughtUp:p.proof.replicationCaughtUp===true,
   fenced:p.proof.fenced===true,gtid:String(p.proof.gtid||'').slice(0,512),fileSeal:String(p.proof.fileSeal||'').slice(0,128)};
  db.exec('INSERT INTO candidates(cluster_id,node_id,seen_ms,body) VALUES (?,?,?,?) ON CONFLICT(cluster_id,node_id) DO UPDATE SET seen_ms=excluded.seen_ms,body=excluded.body',p.clusterId,p.nodeId,now,JSON.stringify(proof));
  c=this.load(p.clusterId);
  if(c.mode==='observe')return ok({action:'observe',term:c.term,holder:c.holder,ttlMs:0});
  // Auto failback is a PLANNED DRAIN, never forced if incumbent is disconnected.
  if(c.mode==='auto'&&c.holder&&c.expires_ms>now&&c.preferred_node&&c.holder!==c.preferred_node&&!c.requested_node){
   const pref=this.node(p.clusterId,c.preferred_node);
   if(this.ready(pref,c,now)){
    db.exec('UPDATE clusters SET requested_node=?,changed_ms=? WHERE cluster_id=?',c.preferred_node,now,p.clusterId);c=this.load(p.clusterId);
   }
  }
  // The existing holder must voluntarily confirm fencing before an immediate manual handover;
  // expiry alone is NOT sufficient for protected production (old node could be alive offline).
  if(c.holder===p.nodeId&&proof.fenced&&eligible(proof)&&c.requested_node&&c.requested_node!==p.nodeId){
   db.exec('UPDATE clusters SET holder=NULL,expires_ms=0,data_gtid=?,file_seal=?,changed_ms=? WHERE cluster_id=?',proof.gtid||null,proof.fileSeal||null,now,p.clusterId);c=this.load(p.clusterId);
  }
  if(c.holder===p.nodeId&&(!c.requested_node||c.requested_node===p.nodeId)){
   if(eligible(proof)&&!proof.fenced){
    db.exec('UPDATE clusters SET expires_ms=?,data_gtid=?,file_seal=?,changed_ms=? WHERE cluster_id=?',now+deadlineMs,proof.gtid||null,proof.fileSeal||null,now,p.clusterId);
    return ok({action:'serve',term:c.term,holder:p.nodeId,ttlMs:deadlineMs});
   }
   // A holder may report fenced because local guard stopped the services on lost lease;
   // retaining the term is safe, but never issue a serving grant without readiness.
   return ok({action:'fence',term:c.term,holder:c.holder,ttlMs:0,reason:'incumbent not ready or fenced'});
  }
  if(c.holder&&c.expires_ms>now)return ok({action:'fence',term:c.term,holder:c.holder,ttlMs:0,reason:'another node has live lease'});
  // CRITICAL: never auto-grant after lost incumbent WITHOUT explicit fencing acknowledgement.
  // True network partition or Android killed process cannot provide that evidence.
  if(c.holder&&c.expires_ms<=now){return ok({action:'fence',term:c.term,holder:c.holder,ttlMs:0,
   reason:'incumbent lease expired without remote fencing attestation; operator intervention required'});}
  let candidate=c.requested_node;
  if(!candidate&&c.mode==='auto'&&c.term>0){
   const available=this.live(p.clusterId).filter(x=>this.ready({...x,seen_ms:x.seenMs},c,now));
   available.sort((a,b)=>Number(b.nodeId===c.preferred_node)-Number(a.nodeId===c.preferred_node)||score(b.proof)-score(a.proof)||a.nodeId.localeCompare(b.nodeId));
   candidate=available[0]?.nodeId||null;
  }
  if(candidate!==p.nodeId||!eligible(proof)||!this.ready(this.node(p.clusterId,p.nodeId),c,now))
   return ok({action:'fence',term:c.term,holder:null,ttlMs:0,reason:'not selected or missing readiness proof'});
  // First assignment or previously fenced incumbent: new monotonic term.
  db.exec('UPDATE clusters SET holder=?,term=term+1,expires_ms=?,requested_node=NULL,data_gtid=?,file_seal=?,changed_ms=? WHERE cluster_id=?',p.nodeId,now+deadlineMs,proof.gtid||null,proof.fileSeal||null,now,p.clusterId);
  c=this.load(p.clusterId);
  return ok({action:'serve',term:c.term,holder:p.nodeId,ttlMs:deadlineMs});
 }
}
