// Pure HA decisions. No device changes or secrets in this module.
export const LEASE_MS=30_000;
export const HEALTH_MS=20_000;
export function isFresh(timestamp,now=Date.now(),max=HEALTH_MS){
 const t=Date.parse(timestamp||'');return Number.isFinite(t)&&t<=now+3000&&now-t>=0&&now-t<=max;
}
export function isSafeGTID(value){return typeof value==='string'&&value.length>0&&value.length<512&&/^\d+-\d+-\d+(,\d+-\d+-\d+)*$/.test(value);}
export function readyForTakeover(candidate,leader,now=Date.now(),maxRpoSec=0){
 const reasons=[];
 if(!candidate||candidate.db?.available!==true)reasons.push('Database not available');
 if(candidate?.db?.slaveIo!=='Yes'||candidate?.db?.slaveSql!=='Yes')reasons.push('GTID replica IO/SQL not healthy');
 if(!isSafeGTID(candidate?.db?.gtidSlavePos))reasons.push('No valid replica GTID');
 if(candidate?.db?.secondsBehind!==0)reasons.push('Replica not confirmed caught up');
 if(candidate?.services?.miniWeb==='run'||candidate?.services?.tunnel==='run')reasons.push('Candidate already serving before lease');
 if(!candidate?.assets?.verified||!candidate.assets.checkpoint)reasons.push('No verified incremental asset checkpoint');
 if(!leader||!isSafeGTID(leader.db?.gtidBinlogPos))reasons.push('No authoritative last leader GTID checkpoint');
 else if(candidate.db?.gtidSlavePos!==leader.db.gtidBinlogPos)reasons.push('GTID differs from last leader checkpoint');
 if(leader && candidate?.assets?.checkpoint!==leader?.assets?.checkpoint)reasons.push('Asset checkpoint mismatch');
 if(!leader?.observedAt||!isFresh(leader.observedAt,now,Math.max(0,maxRpoSec)*1000))
  reasons.push('Zero-loss cannot be proven since last leader checkpoint; explicit RPO required');
 return {ready:reasons.length===0,reasons};
}
export function mayAcquire({leaderId,expiresAt=0,candidateId,now=Date.now(),mode='manual',preferredNodeId=null,eligible=false}){
 if(!eligible)return {grant:false,reason:'NOT_READY'};
 if(leaderId===candidateId&&expiresAt>now)return {grant:true,reason:'RENEW'};
 if(leaderId&&expiresAt>now)return {grant:false,reason:'LEASE_HELD'};
 if(mode==='manual'&&candidateId!==preferredNodeId)return {grant:false,reason:'MANUAL_TARGET_ONLY'};
 if(mode!=='manual'&&mode!=='auto')return {grant:false,reason:'INVALID_MODE'};
 return {grant:true,reason:'NEW_TERM'};
}
