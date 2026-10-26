// M2: shared membership and durable preparation journal. NO writer lease or route cutover.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN=/^[A-Za-z0-9_-]{43,128}$/;
export const MODE='SHARED_AUTHORITY_PREPARE_ONLY';
const metricNumber=(x,lo,hi)=>typeof x==='number'&&Number.isFinite(x)&&x>=lo&&x<=hi?x:null;
const metricStatus=x=>['running','stopped','unknown'].includes(x)?x:'unknown';
const metricServices=['amh-panel','sshd','nginx','mysqld','mini-web','mhc-authority-agent','mhc-panel-tunnel','mhc-full-wp-php','mhc-full-wp-nginx'];
function telemetrySafe(v){
 if(!v||v.v!==1||typeof v!=='object'||Array.isArray(v))fail('TELEMETRY_INVALID');
 const safeStr=(v,n)=>typeof v==='string'?v.replace(/[\\x00-\\x1f\\x7f]/g,'').slice(0,n):'';
 const num=(x,max)=>metricNumber(x,0,max);
 return {v:1,device:safeStr(v.device,55),android:safeStr(v.android,12),
  cpu:{usagePct:metricNumber(v.cpu?.usagePct,0,100),cores:metricNumber(v.cpu?.cores,1,256)},
  memory:{totalMiB:num(v.memory?.totalMiB,1e8),freeMiB:num(v.memory?.freeMiB,1e8)},
  storage:{totalMiB:num(v.storage?.totalMiB,1e9),freeMiB:num(v.storage?.freeMiB,1e9)},
  network:{rxKiBs:num(v.network?.rxKiBs,1e9),txKiBs:num(v.network?.txKiBs,1e9),interfaces:num(v.network?.interfaces,128)},
  battery:{percentage:num(v.battery?.percentage,100),temperatureC:metricNumber(v.battery?.temperatureC,-25,100),
   status:['CHARGING','DISCHARGING','FULL','NOT_CHARGING','UNAVAILABLE','UNKNOWN'].includes(v.battery?.status)?v.battery.status:'UNKNOWN',
   health:['GOOD','OVERHEAT','DEAD','OVER_VOLTAGE','UNSPECIFIED_FAILURE','COLD','UNKNOWN'].includes(v.battery?.health)?v.battery.health:null},
  uptimeSec:num(v.uptimeSec,1e10),
  services:Object.fromEntries(metricServices.map(id=>[id,metricStatus(v.services?.[id])]))};
}
function metricPoint(m,now){
 return {at:new Date(now).toISOString(),cpuPct:m.cpu.usagePct,ramUsedMiB:m.memory.totalMiB!==null&&m.memory.freeMiB!==null?Math.max(0,m.memory.totalMiB-m.memory.freeMiB):null,
  batteryPct:m.battery.percentage,tempC:m.battery.temperatureC,diskFreeMiB:m.storage.freeMiB,rxKiBs:m.network.rxKiBs,txKiBs:m.network.txKiBs};
}

const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
function equal(a,b){if(typeof a!=='string'||typeof b!=='string')return false;let n=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)n|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return n===0;}
function members(env){
 const m=JSON.parse(env.MHC_MEMBERS_JSON||'null');
 if(!Array.isArray(m)||!m.length||m.length>200)fail('MEMBERS_NOT_CONFIGURED',503);
 const ids=new Set(),keys=new Set();
 for(const n of m){
  if(!UUID.test(n.nodeId)||ids.has(n.nodeId)||typeof n.label!=='string'||n.label.length>80)fail('MEMBERS_INVALID',503);
  ids.add(n.nodeId);
  for(const k of [n.agentKey,n.panelKey]){if(!TOKEN.test(k)||keys.has(k))fail('MEMBERS_KEYS_INVALID',503);keys.add(k);}
 }
 return m;
}
async function json(req){
 // Bound streamed input before JSON parsing, including requests without Content-Length.
 const reader=req.body?.getReader();if(!reader)return {};
 const chunks=[];let size=0;
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();fail('BODY_TOO_LARGE',413);}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const x of chunks){bytes.set(x,offset);offset+=x.length;}
 let b;try{b=JSON.parse(new TextDecoder().decode(bytes));}catch{fail('INVALID_BODY');}
 if(!b||typeof b!=='object'||Array.isArray(b))fail('INVALID_BODY');return b;
}
export default {async fetch(request,env){
 try{
  const u=new URL(request.url),match=/^\/v1\/clusters\/([0-9a-f-]{36})\/(status|heartbeat|begin|abort|history)$/.exec(u.pathname);
  if(!match||match[1]!==env.MHC_CLUSTER_ID||!UUID.test(match[1]))return reply({error:'NOT_FOUND'},404);
  const action=match[2],list=members(env),id=request.headers.get('x-mhc-node');
  const node=list.find(n=>n.nodeId===id),token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
  const role=node&&equal(token,node.panelKey)?'panel':node&&equal(token,node.agentKey)?'agent':null;
  if(!role)return reply({error:'UNAUTHORIZED'},401);
  if(action==='heartbeat'&&role!=='agent'||['begin','abort','history'].includes(action)&&role!=='panel')return reply({error:'ROLE_DENIED'},403);
  if(request.method!==(['status','history'].includes(action)?'GET':'POST'))return reply({error:'METHOD_NOT_ALLOWED'},405);
  const nonce=request.headers.get('x-mhc-nonce');if(!UUID.test(nonce||''))fail('NONCE_REQUIRED');
  const targetNodeId=action==='history'?request.headers.get('x-mhc-target'):null;
  if(action==='history'&&(!UUID.test(targetNodeId||'')||!list.some(n=>n.nodeId===targetNodeId)))fail('MONITOR_TARGET_INVALID',400);
  const body=action==='history'?{targetNodeId}:action==='status'?{}:await json(request);
  const stub=env.MHC_AUTHORITY.get(env.MHC_AUTHORITY.idFromName(match[1]));
  // Only the authenticated Worker can call this binding; no caller headers are forwarded.
  return await stub.fetch(new Request('https://authority.internal/'+action,{method:'POST',body:JSON.stringify({action,body,nodeId:id,role,nonce,clusterId:match[1]})}));
 }catch(e){return reply({error:e.status?e.message:'AUTHORITY_UNAVAILABLE'},e.status||503);}
}};
export class ClusterAuthority {
 constructor(ctx,env){this.ctx=ctx;this.env=env;}
 async fetch(req){
  try{
   const {action,body,nodeId,role,nonce,clusterId}=await req.json();
   if(clusterId!==this.env.MHC_CLUSTER_ID||!UUID.test(nodeId)||!UUID.test(nonce))fail('INVALID_INTERNAL_REQUEST');
   const list=members(this.env);if(!list.some(n=>n.nodeId===nodeId))fail('UNAUTHORIZED',401);
   if(!['status','heartbeat','begin','abort','history'].includes(action))fail('INVALID_ACTION');
   if(action==='heartbeat'&&role!=='agent'||['begin','abort','history'].includes(action)&&role!=='panel')fail('ROLE_DENIED',403);
   const now=Date.now();
   const result=await this.ctx.storage.transaction(async tx=>{
    const s=await tx.get('state')||{schema:1,revision:0,epoch:0,pending:null,heartbeats:{}};
    if(s.schema!==1||!Number.isSafeInteger(s.revision)||s.revision<0||!Number.isSafeInteger(s.epoch)||s.epoch<0||!s.heartbeats)fail('STATE_INVALID',503);
    let receipt=null;
    if(action==='heartbeat'){
     if(!Number.isSafeInteger(body.sequence)||body.sequence<1||!Number.isSafeInteger(body.sentAt)||Math.abs(now-body.sentAt)>60000)fail('HEARTBEAT_INVALID');
     const old=s.heartbeats[nodeId];if(old&&body.sequence<=old.sequence)fail('HEARTBEAT_REPLAY',409);
     const telemetry=body.telemetry===undefined?null:telemetrySafe(body.telemetry);
     const oldMetricsAt=old?.metricsAt||null;
     s.heartbeats[nodeId]={sequence:body.sequence,receivedAt:now,
      metricsAt:telemetry?now:oldMetricsAt,telemetry:telemetry||old?.telemetry||null};
     if(telemetry){
      // An inexpensive rolling 12-hour trend: one sample per 5 minutes per node.
      const key='monitor-history:'+nodeId;
      const history=await tx.get(key)||[];
      if(!Array.isArray(history))fail('METRICS_HISTORY_INVALID',503);
      if(history.length===0||now-Date.parse(history.at(-1).at)>=300000){
       await tx.put(key,[...history.slice(-143),metricPoint(telemetry,now)]);
      }
     }
     await tx.put('state',s);
    }else if(action==='history'){
     if(!UUID.test(body.targetNodeId||'')||!list.some(n=>n.nodeId===body.targetNodeId))fail('MONITOR_TARGET_INVALID');
    }else if(action!=='status'){
     if(!UUID.test(body.requestId||'')||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)fail('MUTATION_ID_REVISION_REQUIRED');
     const digest=JSON.stringify([nodeId,action,body.expectedRevision,body.targetNodeId??null,body.operationId??null]);
     const key='request:'+body.requestId,old=await tx.get(key);
     if(old){if(old.digest!==digest)fail('IDEMPOTENCY_CONFLICT',409);receipt=old.receipt;}
     else{
      if(s.revision!==body.expectedRevision)fail('REVISION_CONFLICT',409);
      if(action==='begin'){
       if(s.pending)fail('TRANSITION_PENDING',409);
       if(!list.some(n=>n.nodeId===body.targetNodeId))fail('UNKNOWN_TARGET');
       const hb=s.heartbeats[body.targetNodeId];if(!hb||now-hb.receivedAt<0||now-hb.receivedAt>180000)fail('TARGET_HEARTBEAT_STALE',409);
       s.epoch++;
       s.pending={operationId:body.requestId,targetNodeId:body.targetNodeId,epoch:s.epoch,status:'PREPARED_NO_WRITER_GRANT',createdAt:new Date(now).toISOString()};
      }else{
       if(!UUID.test(body.operationId||'')||s.pending?.operationId!==body.operationId)fail('PENDING_MISMATCH',409);
       s.pending=null;
      }
      s.revision++;
      receipt={requestId:body.requestId,action,revision:s.revision,epoch:s.epoch,operationId:action==='begin'?body.requestId:body.operationId};
      await tx.put('state',s);
      await tx.put(key,{digest,receipt});
      await tx.put('audit:'+String(s.revision).padStart(16,'0'),{...receipt,nodeId,at:new Date(now).toISOString()});
     }
    }
    const nodes=list.map(n=>({nodeId:n.nodeId,label:n.label,
     heartbeatRecent:!!s.heartbeats[n.nodeId]&&now-s.heartbeats[n.nodeId].receivedAt>=0&&now-s.heartbeats[n.nodeId].receivedAt<=180000,
     lastSeenAt:s.heartbeats[n.nodeId]?new Date(s.heartbeats[n.nodeId].receivedAt).toISOString():null,
     telemetryRecent:!!s.heartbeats[n.nodeId]?.metricsAt&&now-s.heartbeats[n.nodeId].metricsAt>=0&&now-s.heartbeats[n.nodeId].metricsAt<=180000,
     metricsAt:s.heartbeats[n.nodeId]?.metricsAt?new Date(s.heartbeats[n.nodeId].metricsAt).toISOString():null,
     telemetry:s.heartbeats[n.nodeId]?.telemetry||null,role:'STANDBY_NO_WRITER_GRANT'}));
    const history=action==='history'?await tx.get('monitor-history:'+body.targetNodeId)||[]:null;
    return {mode:MODE,clusterId,revision:s.revision,epoch:s.epoch,
     nodes:action==='history'?[]:nodes,nodeCount:nodes.length,
     ...(action==='history'?{history:{nodeId:body.targetNodeId,points:Array.isArray(history)?history.slice(-144):[]}}:{}),
     declaredPrimary:null,pending:s.pending?{...s.pending,label:nodes.find(n=>n.nodeId===s.pending.targetNodeId)?.label||'Removed member'}:null,
     callerSequence:s.heartbeats[nodeId]?.sequence||0,receipt,canComplete:false,writeLeaseGranted:false,
     automaticFailover:false,livePrimaryVerified:false,notice:'Shared preparation only. Candidate activation, writer fencing and web/admin routing are not implemented by this authority.'};
   });
   return reply({...result,nonce});
  }catch(e){return reply({error:e.status?e.message:'AUTHORITY_STORAGE_UNAVAILABLE'},e.status||503);}
 }
}
