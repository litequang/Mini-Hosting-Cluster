// Pure deterministic lease policy. Dates are coordinator time, never client time.
export const DEFAULTS = Object.freeze({leaseMs: 30000, fenceMs: 12000, freshMs: 18000});
export function initialState() {
  return {version:1, mode:'manual',strategy:'preferred', preferred:null, current:null, term:0, leaseUntil:0,
    fenceUntil:0, pending:null, lastOwner:null, previouslyServed:[], blocked:[], nodes:{},
    allowRiskyAuto:false, autoFailback:false, bootstrap:false, updatedAt:0};
}
export function nodeScore(n){
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const m=n.metrics||{};
 let score=25*clamp((Number(m.cpuCores)||0)/8,0,1) +
   25*clamp((Number(m.memFreeGb)||0)/6,0,1) +
   30*clamp((Number(m.diskFreeGb)||0)/40,0,1) +
   20*clamp((Number(m.uptimeDays)||0)/10,0,1);
 if(Number.isFinite(m.batteryPct)&&m.batteryPct<20)score-=20;
 return Math.round(Math.max(0,score));
}
const goodId = x => typeof x==='string' && /^[a-zA-Z0-9_-]{2,64}$/.test(x);
export function validId(x) {return goodId(x);}
export function liveNode(s,id,now,opts=DEFAULTS) {
  const n=s.nodes[id];return !!n && (now-n.seenAt)<=opts.freshMs && n.armed===true && n.healthy===true;
}
export function eligible(s,id,now,opts=DEFAULTS) {
  if(!goodId(id)||!liveNode(s,id,now,opts)||s.blocked.includes(id))return false;
  const n=s.nodes[id];
  if(s.term===0 && id===s.preferred && s.bootstrap)return true;
  if(s.lastOwner===id)return true; // same unchanged writer recovering after short outage
  // With only snapshots we cannot establish zero-loss after a source disappears.
  // Strict policy requires human confirmation (one-time approved node) or proof of a
  // completed controlled handoff, never a self-reported "replica is current" guess.
  if(s.pendingApproval===id && (s.approvalExpiresAt||0)>now)return true;
  if(s.mode==='auto' && s.allowRiskyAuto && n.lastReplicaGoodAt && now-n.lastReplicaGoodAt<=90000)return true;
  return false;
}
export function pulse(state,id,report,now,opts=DEFAULTS) {
  const s=structuredClone(state);
  if(!goodId(id))throw Error('Invalid node id');
  const previous=s.nodes[id]||{};
  s.nodes[id]={seenAt:now,lastReplicaGoodAt:report.replicationReady===true?now:previous.lastReplicaGoodAt||null,
    armed:report.armed===true,healthy:report.healthy===true,
    replicationReady:report.replicationReady===true, lagSeconds:Number.isFinite(report.lagSeconds)?report.lagSeconds:null,
    snapshot:typeof report.snapshot==='string'?report.snapshot.slice(0,100):null,
    metrics:report.metrics&&typeof report.metrics==='object'?{
      cpuCores:Math.max(0,Math.min(64,Number(report.metrics.cpuCores)||0)),
      memFreeGb:Math.max(0,Math.min(1024,Number(report.metrics.memFreeGb)||0)),
      diskFreeGb:Math.max(0,Math.min(2048,Number(report.metrics.diskFreeGb)||0)),
      uptimeDays:Math.max(0,Math.min(10000,Number(report.metrics.uptimeDays)||0)),
      batteryPct:Number.isFinite(report.metrics.batteryPct)?Math.max(0,Math.min(100,report.metrics.batteryPct)):null
    }:null,
    tableCount:Number.isInteger(report.tableCount)?report.tableCount:null,
    releasePresent:report.releasePresent===true,
    appStatus:typeof report.appStatus==='string'?report.appStatus.slice(0,40):'unknown'};
  if(s.current && s.leaseUntil<=now){
    s.lastOwner=s.current;
    s.current=null;
    // Owner's local shorter deadline expires BEFORE DO's lease. Fence delay adds margin.
    s.fenceUntil=Math.max(s.fenceUntil,s.leaseUntil+opts.fenceMs);
  }
  if(s.current && !s.pending && s.mode==='auto' && s.autoFailback && s.preferred && s.current!==s.preferred && eligible(s,s.preferred,now,opts)) {
    s.pending=s.preferred; // safe scheduled switchover, still waits expiry + fencing
  }
  if(s.current && s.pending && s.pending!==s.current) {
    // Stop granting renewal. Existing lease expires naturally.
  }else if(s.current===id && report.armed===true && report.healthy===true){
    s.leaseUntil=now+opts.leaseMs;
  }
  if(!s.current && now>=s.fenceUntil) {
    let candidates=[];
    if(s.pending) candidates=[s.pending];
    else if(s.mode==='manual') candidates=[s.preferred];
    else if(s.strategy==='score')candidates=Object.keys(s.nodes).sort((a,b)=>nodeScore(s.nodes[b])-nodeScore(s.nodes[a])||a.localeCompare(b));
    else candidates=[s.preferred,...Object.keys(s.nodes).filter(x=>x!==s.preferred).sort()];
    // Disable auto-failback by default; the old primary must first be rejoined.
    if(s.mode==='auto' && !s.autoFailback && s.previouslyServed.length && s.pending===null) {
      const last=s.previouslyServed.at(-1);
      if(last && eligible(s,last,now,opts))candidates=[last,...candidates.filter(x=>x!==last)];
    }
    const chosen=candidates.find(x=>eligible(s,x,now,opts));
    if(chosen){
      if(s.lastOwner && s.lastOwner!==chosen && !s.blocked.includes(s.lastOwner))s.blocked.push(s.lastOwner);
      s.current=chosen;s.term+=1;s.leaseUntil=now+opts.leaseMs;
      if(!s.previouslyServed.includes(chosen))s.previouslyServed.push(chosen);
      if(s.pendingApproval===chosen){s.pendingApproval=null;s.approvalExpiresAt=0}
      if(s.pending===chosen)s.pending=null;
      // An old primary cannot return without a verified rejoin/explicit approval.
      s.blocked=s.blocked.filter(x=>x!==chosen);
    }
  }
  s.updatedAt=now;
  return {state:s, decision:{role:(s.current===id&&s.leaseUntil>now&&!s.pending)?'primary':'standby',
    owner:s.current,term:s.term,leaseUntil:s.current===id&& !s.pending?s.leaseUntil:0,
    leaseRemainingMs:s.current===id&& !s.pending?Math.max(0,s.leaseUntil-now):0,
    mode:s.mode,pending:s.pending,fenceUntil:s.fenceUntil}};
}
export function administer(state,action,params,now) {
  const s=structuredClone(state);
  if(action==='bootstrap') {
    if(s.term!==0)throw Error('Bootstrap only before first lease');
    if(!goodId(params.nodeId))throw Error('Bad node');
    s.preferred=params.nodeId;s.bootstrap=true;s.mode='manual';
  }else if(action==='mode') {
    if(!['auto','manual'].includes(params.mode))throw Error('Mode must be auto or manual');
    s.mode=params.mode;
  }else if(action==='strategy') {
    if(!['preferred','score'].includes(params.strategy))throw Error('Strategy must be preferred or score');
    s.strategy=params.strategy;
  }else if(action==='prefer') {
    if(!goodId(params.nodeId))throw Error('Bad node');s.preferred=params.nodeId;
  }else if(action==='handoff') {
    if(!goodId(params.nodeId) || params.confirm!=='DATA_VERIFIED')throw Error('Verified data confirmation required');
    if(params.nodeId===s.current)throw Error('Already primary');
    s.pending=params.nodeId;
    s.pendingApproval=params.nodeId; // ADMIN authorizes only one deliberate handoff.
    s.approvalExpiresAt=now+300000; // expire after 5 minutes; never replay days later
    if(s.current){
      const old=s.current;
      if(!s.blocked.includes(old))s.blocked.push(old);
      // DO still holds old lease until expiry, but will not renew it.
    }
  }else if(action==='allow-risky-auto') {
    if(params.confirm!=='I_ACCEPT_POSSIBLE_DATA_LOSS')throw Error('Explicit RPO acknowledgment required');
    s.allowRiskyAuto=params.enabled===true;
  }else if(action==='auto-failback') {
    s.autoFailback=params.enabled===true;
  }else if(action==='confirm-rejoin') {
    if(!goodId(params.nodeId))throw Error('Bad node');
    if(params.confirm!=='DATA_REJOIN_VERIFIED')throw Error('Data verification acknowledgment required');
    s.blocked=s.blocked.filter(x=>x!==params.nodeId);
  }else if(action==='approve-once') {
    if(!goodId(params.nodeId) || params.confirm!=='DATA_VERIFIED')throw Error('Data verification acknowledgment required');
    s.pendingApproval=params.nodeId;
    s.approvalExpiresAt=now+300000;
  }else throw Error('Unknown action');
  s.updatedAt=now;
  return s;
}
export function publicStatus(s,now,opts=DEFAULTS){
  return {mode:s.mode,strategy:s.strategy||'preferred',preferred:s.preferred,current:s.current,term:s.term,lastOwner:s.lastOwner,
    leaseRemainingMs:Math.max(0,s.leaseUntil-now),fenceRemainingMs:Math.max(0,s.fenceUntil-now),
    pending:s.pending,allowRiskyAuto:s.allowRiskyAuto,autoFailback:s.autoFailback,
    blocked:s.blocked,nodes:Object.fromEntries(Object.entries(s.nodes).map(([id,n])=>[id,{
      online:now-n.seenAt<=opts.freshMs,armed:n.armed,healthy:n.healthy,
      replicationReady:n.replicationReady,lastReplicaGoodAgoMs:n.lastReplicaGoodAt?now-n.lastReplicaGoodAt:null,lagSeconds:n.lagSeconds,snapshot:n.snapshot,appStatus:n.appStatus,score:nodeScore(n),metrics:n.metrics,tableCount:n.tableCount,releasePresent:n.releasePresent,lastSeenAgoMs:Math.max(0,now-n.seenAt)
    }]))};
}
