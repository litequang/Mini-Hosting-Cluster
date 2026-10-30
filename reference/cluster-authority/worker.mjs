import {safeUsage} from './usage-safe.mjs';
import {JobWake} from './job-wake.mjs';
import {syncPublic} from './site-sync.mjs';
import {SITE_ACTIONS,siteAction,siteEffectiveEnv,siteReadiness,siteCleanup,siteSyncMaintenance} from './site-standby.mjs';
import {p33Action,p33View,p33Enabled,P33_ACTIONS} from './p33-manual.mjs';
import {N1_ACTIONS,n1Action,n1EffectiveEnv,n1PublicView,verifyN1Enrollment} from './n1-onboarding.mjs';
import {p3Config,p3SwitchDns,p3SwitchPanelDns} from './p3-route.mjs';
import {p3RecoveryPlan} from './p3-recovery.mjs';
import {p32Action,p32View,p32BlocksPreparation,P32_BUILD} from './p32-lab.mjs';
// M2: shared membership and durable preparation journal. NO writer lease or route cutover.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN=/^[A-Za-z0-9_-]{43,128}$/;
export const MODE='SHARED_AUTHORITY_PREPARE_ONLY';
// Join protocol: 10-minute, 192-bit random one-time challenge. Persist only hash.
const JOIN_HEX=/^[0-9a-f]{48}$/;
const JOIN_LABEL=/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,60}$/;
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const randomHex=()=>Array.from(crypto.getRandomValues(new Uint8Array(24))).map(x=>x.toString(16).padStart(2,'0')).join('');

const metricNumber=(x,lo,hi)=>typeof x==='number'&&Number.isFinite(x)&&x>=lo&&x<=hi?x:null;
const metricStatus=x=>['running','stopped','unknown'].includes(x)?x:'unknown';
const metricServices=['amh-panel','sshd','nginx','mysqld','mini-web','mhc-authority-agent','mhc-panel-tunnel','mhc-full-wp-php','mhc-full-wp-nginx','named-tunnel','php-fpm','mhc-full-daily-backup'];
function telemetrySafe(v){
 if(!v||v.v!==1||typeof v!=='object'||Array.isArray(v))fail('TELEMETRY_INVALID');
 const safeStr=(v,n)=>typeof v==='string'?Array.from(v).filter(c=>c.charCodeAt(0)>=32&&c.charCodeAt(0)!==127).join('').slice(0,n):'';
 const num=(x,max)=>metricNumber(x,0,max);
 return {cloudflareUsage:safeUsage(v.cloudflareUsage),v:1,device:safeStr(v.device,55),android:safeStr(v.android,12),
  memory:{totalMiB:num(v.memory?.totalMiB,1e8),freeMiB:num(v.memory?.freeMiB,1e8)},
  storage:{totalMiB:num(v.storage?.totalMiB,1e9),freeMiB:num(v.storage?.freeMiB,1e9)},
  network:{rxKiBs:num(v.network?.rxKiBs,1e9),txKiBs:num(v.network?.txKiBs,1e9),interfaces:num(v.network?.interfaces,128)},
  battery:{percentage:num(v.battery?.percentage,100),temperatureC:metricNumber(v.battery?.temperatureC,-25,100),
   status:['CHARGING','DISCHARGING','FULL','NOT_CHARGING','UNAVAILABLE','UNKNOWN'].includes(v.battery?.status)?v.battery.status:'UNKNOWN',
   health:['GOOD','OVERHEAT','DEAD','OVER_VOLTAGE','UNSPECIFIED_FAILURE','COLD','UNKNOWN'].includes(v.battery?.health)?v.battery.health:null},
  uptimeSec:num(v.uptimeSec,1e10),
  wifi:{state:v.wifi?.state==='connected'?'connected':'unknown',
   rssiDbm:metricNumber(v.wifi?.rssiDbm,-127,0)},
  processes:(Array.isArray(v.processes)?v.processes:[]).slice(0,6).map(p=>({
   name:['Mini Hosting Panel','Cluster Agent','LAN Monitor','Web Node.js','Node.js khác'].includes(p?.name)?p.name:'Node.js khác',
   rssMiB:num(p?.rssMiB,1e7)})),
  snapshot:{name:/^snapshot-\d{8}$/.test(v.snapshot?.name||'')?v.snapshot.name:null,
   recordedAt:typeof v.snapshot?.recordedAt==='string'&&/^\d{4}-\d\d-\d\dT/.test(v.snapshot.recordedAt)?v.snapshot.recordedAt.slice(0,32):null,
   verified:false},
  ...(v.onboarding?.v===1?{onboarding:{v:1,
   installPhase:['IN_PROGRESS','INTERRUPTED','INSTALLED'].includes(v.onboarding.installPhase)?v.onboarding.installPhase:'INTERRUPTED',
   sourceCommit:/^[a-f0-9]{40}$/.test(v.onboarding.sourceCommit||'')?v.onboarding.sourceCommit:null,
   stage:['packages','runtime','identity','panel-admin','services','verify'].includes(v.onboarding.stage)?v.onboarding.stage:null,
   completedStages:num(v.onboarding.completedStages,6),authorityConfigured:v.onboarding.authorityConfigured===true,
   managementRunning:v.onboarding.managementRunning===true,tunnelRunning:v.onboarding.tunnelRunning===true,
   routeVerified:false,siteVerified:false,eligiblePrimary:false,androidRebootVerified:false,
   blockers:(Array.isArray(v.onboarding.blockers)?v.onboarding.blockers:[]).filter(x=>['INSTALL_INCOMPLETE','PAIRING_REQUIRED','MANAGEMENT_NOT_RUNNING','TUNNEL_NOT_RUNNING','CONTROL_PROOF_REQUIRED','SITE_RESTORE_AND_GUARDS_REQUIRED'].includes(x)).slice(0,6),
   errorCode:/^N1_[A-Z0-9_]{1,90}$/.test(v.onboarding.errorCode||'')?v.onboarding.errorCode:null}}:{}),
  services:Object.fromEntries(metricServices.map(id=>[id,metricStatus(v.services?.[id])]))};
}
function metricPoint(m,now){
 return {at:new Date(now).toISOString(),ramUsedMiB:m.memory.totalMiB!==null&&m.memory.freeMiB!==null?Math.max(0,m.memory.totalMiB-m.memory.freeMiB):null,
  batteryPct:m.battery.percentage,tempC:m.battery.temperatureC,diskFreeMiB:m.storage.freeMiB,rxKiBs:m.network.rxKiBs,txKiBs:m.network.txKiBs,wifiRssiDbm:m.wifi.rssiDbm};
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
async function authorizedRole(s,staticList,nodeId,role,dynamicToken){
 if(role==='dynamic'){
  const member=(s.dynamicMembers||[]).find(n=>n.nodeId===nodeId);
  if(!member||!TOKEN.test(dynamicToken||''))fail('UNAUTHORIZED',401);
  const value=await hash(dynamicToken);return equal(value,member.panelDigest)?'panel':equal(value,member.agentDigest)?'agent':null;
 }
 if(role!=='joining'&&!staticList.some(n=>n.nodeId===nodeId))fail('UNAUTHORIZED',401);
 return role;
}
async function json(req,max=4096){
 // Bound streamed input before JSON parsing, including requests without Content-Length.
 const reader=req.body?.getReader();if(!reader)return {};
 const chunks=[];let size=0;
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();fail('BODY_TOO_LARGE',413);}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const x of chunks){bytes.set(x,offset);offset+=x.length;}
 let b;try{b=JSON.parse(new TextDecoder().decode(bytes));}catch{fail('INVALID_BODY');}
 if(!b||typeof b!=='object'||Array.isArray(b))fail('INVALID_BODY');return b;
}
export default {
 async scheduled(event,env,ctx){
  // P3.3 is manual only; do not race the legacy LAB DNS recovery journal.
  if(p33Enabled(env)){
   if(env.MHC_P32_PANEL_RECOVERY_ENABLED==='LAB_PANEL_ONLY'&&UUID.test(env.MHC_CLUSTER_ID||'')){const stub=env.MHC_AUTHORITY.get(env.MHC_AUTHORITY.idFromName(env.MHC_CLUSTER_ID));ctx.waitUntil(stub.fetch(new Request('https://authority.internal/p33-maintenance',{method:'POST'})));}return;
  }
  // Cron survives Android outages and must never grant writer privileges.
  if(env.MHC_P32_LAB_ENABLED==='READ_ONLY_ROUTING'&&env.MHC_P32_PANEL_RECOVERY_ENABLED==='LAB_PANEL_ONLY'&&UUID.test(env.MHC_CLUSTER_ID||'')){
   const stub=env.MHC_AUTHORITY.get(env.MHC_AUTHORITY.idFromName(env.MHC_CLUSTER_ID));ctx.waitUntil(stub.fetch(new Request('https://authority.internal/p32-maintenance',{method:'POST'})));return;
  }
  if(env.MHC_P3_PANEL_RECOVERY_ENABLED!=='LAB_PANEL_ONLY'||!UUID.test(env.MHC_CLUSTER_ID||''))return;
  const stub=env.MHC_AUTHORITY.get(env.MHC_AUTHORITY.idFromName(env.MHC_CLUSTER_ID));
  ctx.waitUntil(stub.fetch(new Request('https://authority.internal/maintenance',{method:'POST'})));
 },
 async fetch(request,env){
 try{
  const u=new URL(request.url),match=/^\/v1\/clusters\/([0-9a-f-]{36})\/(status|heartbeat|begin|abort|route|route-resume|complete|history|invite|join|p32-status|p32-route|p32-resume|p32-confirm|p32-rollback|p33-begin|p33-fenced|p33-active|p33-route|p33-confirm|p33-renew|p33-control|p33-cancel|p33-refence|n1-provision|n1-publish|n1-control-proof|site-start|site-poll|site-result|site-upload|site-download|site-call|site-job|site-progress|site-sync)$/.exec(u.pathname);
  if(!match||match[1]!==env.MHC_CLUSTER_ID||!UUID.test(match[1]))return reply({error:'NOT_FOUND'},404);
  const action=match[2],list=members(env),id=request.headers.get('x-mhc-node');
  const node=list.find(n=>n.nodeId===id),token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
  const staticRole=node&&equal(token,node.panelKey)?'panel':node&&equal(token,node.agentKey)?'agent':null;
  // Dynamic member credentials can only be verified inside this cluster's Durable Object.
  const role=action==='join'?'joining':staticRole||(UUID.test(id||'')&&TOKEN.test(token)?'dynamic':null);
  if(!role)return reply({error:'UNAUTHORIZED'},401);
  if(action==='heartbeat'&&role==='panel'||(['begin','abort','route','route-resume','complete','history','invite'].includes(action)||action.startsWith('p32-'))&&role==='agent'||action.startsWith('p33-')&&role!=='dynamic'&&role!==(action==='p33-renew'?'agent':'panel'))return reply({error:'ROLE_DENIED'},403);
  if(request.method!==(['status','history','p32-status'].includes(action)?'GET':'POST'))return reply({error:'METHOD_NOT_ALLOWED'},405);
  const nonce=request.headers.get('x-mhc-nonce');if(!UUID.test(nonce||''))fail('NONCE_REQUIRED');
  const targetNodeId=action==='history'?request.headers.get('x-mhc-target'):null;
  if(action==='history'&&!UUID.test(targetNodeId||''))fail('MONITOR_TARGET_INVALID',400);
  const body=action==='history'?{targetNodeId}:['status','p32-status'].includes(action)?{}:await json(request,action==='site-upload'?270000:action==='site-result'?32768:action.startsWith('p33-')?32768:action.startsWith('p32-')||action==='n1-publish'?16384:4096);
  const stub=env.MHC_AUTHORITY.get(env.MHC_AUTHORITY.idFromName(match[1]));
  // Only the authenticated Worker can call this binding; no caller headers are forwarded.
  return await stub.fetch(new Request('https://authority.internal/'+action,{method:'POST',body:JSON.stringify({action,body,nodeId:id,role,nonce,clusterId:match[1],
   ...(role==='dynamic'?{dynamicToken:token}:{})})}));
 }catch(e){return reply({error:e.status?e.message:'AUTHORITY_UNAVAILABLE'},e.status||503);}
}};
export class ClusterAuthority {
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.jobWake=new JobWake();}
 async fetch(req){
  if(new URL(req.url).pathname==='/p33-maintenance'&&req.method==='POST'){
   try{await siteCleanup(this.ctx);for(const id of await siteSyncMaintenance(this.ctx,this.env)||[])this.jobWake.notify(id);return reply({p33:await p33Action({ctx:this.ctx,env:this.env,action:'p33-recover-control',internal:true})});}catch(e){return reply({error:e.status?e.message:'P33_CONTROL_RECOVERY_UNAVAILABLE'},e.status||503);}
  }
  if(new URL(req.url).pathname==='/maintenance'&&req.method==='POST')return this.recoverPanel();
  if(new URL(req.url).pathname==='/p32-maintenance'&&req.method==='POST'){
   try{return reply({p32:await p32Action({ctx:this.ctx,env:this.env,action:'p32-recover',internal:true})});}catch(e){return reply({error:e.status?e.message:'P32_RECOVERY_UNAVAILABLE'},e.status||503);}
  }
  try{
   const {action,body,nodeId,role,nonce,clusterId,dynamicToken}=await req.json();
   if(clusterId!==this.env.MHC_CLUSTER_ID||!UUID.test(nonce))fail('INVALID_INTERNAL_REQUEST');
   if(action!=='join'&&!UUID.test(nodeId))fail('INVALID_INTERNAL_REQUEST');
   if(!['status','heartbeat','begin','abort','route','route-resume','complete','history','invite','join','p32-status','p32-route','p32-resume','p32-confirm','p32-rollback',...P33_ACTIONS,...N1_ACTIONS,...SITE_ACTIONS].includes(action))fail('INVALID_ACTION');
   const staticList=members(this.env);
   const now=Date.now();
   if(SITE_ACTIONS.includes(action)){
    const observed=this.jobWake.version(nodeId),invoke=time=>siteAction({ctx:this.ctx,env:this.env,action,body,nodeId,authorize:s=>authorizedRole(s,staticList,nodeId,role,dynamicToken),now:time});
    let site=await invoke(now);
    if(action==='site-poll'&&!site.job&&body.waitMs===60000){
     const row=await this.ctx.storage.transaction(async tx=>(await tx.get('site-nodes')||{})[nodeId]),job=row?.job;
     const dormant=job?.status==='WAITING'||job?.status==='FAILED'&&['restore','fence-install','sync-apply'].includes(job.type);
     const due=!dormant&&row?.nextCheckAt>Date.now()?row.nextCheckAt-Date.now():60000;
     await this.jobWake.wait(nodeId,observed,Math.min(60000,due));site=await invoke(Date.now());
    }
    if(['site-start','site-call'].includes(action))this.jobWake.notify(body.targetNodeId);
    if(action==='site-sync'&&body.action==='run'){this.jobWake.notify(site.sync?.run?.sourceNodeId);this.jobWake.notify(site.sync?.run?.targetNodeId);}
    if(action==='site-result'&&site.job?.type==='sync-backup'&&site.job.status==='DONE')this.jobWake.notify(site.job.sync?.targetNodeId);
    const status=await this.fetch(new Request('https://authority.internal/status',{method:'POST',body:JSON.stringify({action:'status',body:{},nodeId,role,nonce,clusterId,dynamicToken})}));
    if(!status.ok)return status;return reply({...await status.json(),site});
   }
   if(N1_ACTIONS.includes(action)){
    let value;try{value=await n1Action({ctx:this.ctx,env:this.env,action,body,nodeId,authorize:s=>authorizedRole(s,staticList,nodeId,role,dynamicToken),now});}
    catch(error){
     if(action!=='n1-control-proof'||!['N1_CONTROL_PROOF_PENDING','CONTROL_PROOF_STALE_OR_MISMATCH'].includes(error.message))throw error;
     const context=await this.ctx.storage.transaction(async tx=>({n:await tx.get('n1-node:'+body.targetNodeId),r:await tx.get('p33'),job:(await tx.get('site-nodes')||{})[body.targetNodeId]?.job}));
     const r=context.r,n=context.n;if(n?.phase!=='CONTROL_REGISTERED'||!n.verifiedAt||Date.now()-n.verifiedAt>90000||!['IDLE','COMMITTED','CANCELLED'].includes(r?.phase)||r.journal&&r.journal.status!=='VERIFIED')throw error;
     const old=context.job,existing=old?.type==='manual'&&old.request?.action==='control-ready'&&['QUEUED','RUNNING'].includes(old.status)&&old.request.epoch===r.epoch&&old.request.revision===r.revision&&old.request.operationId===r.operationId;
     const request=existing?old.request:{action:'control-ready',nodeId:body.targetNodeId,nonce:Array.from(crypto.getRandomValues(new Uint8Array(32))).map(v=>v.toString(16).padStart(2,'0')).join(''),requestId:crypto.randomUUID(),epoch:r.epoch,revision:r.revision,operationId:r.operationId};
     try{await siteAction({ctx:this.ctx,env:this.env,action:'site-call',body:{targetNodeId:body.targetNodeId,requestId:request.requestId,request},nodeId,authorize:s=>authorizedRole(s,staticList,nodeId,role,dynamicToken),now:Date.now()});}
     catch(e){if(!['SITE_NODE_BUSY','SITE_SYNC_BUSY','SITE_FENCE_INSTALL_RESUME_REQUIRED'].includes(e.message))throw e;}
     this.jobWake.notify(body.targetNodeId);fail('N1_CONTROL_PROOF_PENDING',409);
    }
    const status=await this.fetch(new Request('https://authority.internal/status',{method:'POST',body:JSON.stringify({action:'status',body:{},nodeId,role,nonce,clusterId,dynamicToken})}));
    if(!status.ok)return status;return reply({...await status.json(),n1:value});
   }
   if(action.startsWith('p33-')){
    const p33=await p33Action({ctx:this.ctx,env:this.env,action,body,nodeId,authorize:s=>authorizedRole(s,staticList,nodeId,role,dynamicToken),now});
    const status=await this.fetch(new Request('https://authority.internal/status',{method:'POST',body:JSON.stringify({action:'status',body:{},nodeId,role,nonce,clusterId,dynamicToken})}));
    if(!status.ok)return status;return reply({...await status.json(),p33});
   }
   if(p33Enabled(this.env)&&(['begin','abort','route','route-resume','complete'].includes(action)||action.startsWith('p32-')&&action!=='p32-status'))fail('P33_USE_MANAGED_MANUAL_PIPELINE',409);
   if(action.startsWith('p32-')){
    const view=await p32Action({ctx:this.ctx,env:this.env,action,body,nodeId,authorize:async s=>(await authorizedRole(s,staticList,nodeId,role,dynamicToken))==='panel',now});
    const status=await this.fetch(new Request('https://authority.internal/status',{method:'POST',body:JSON.stringify({action:'status',body:{},nodeId,role,nonce,clusterId,dynamicToken})}));
    if(!status.ok)return status;return reply({...await status.json(),p32:view});
   }
   if(['route','route-resume','complete'].includes(action))p3Config(this.env);
   const result=await this.ctx.storage.transaction(async tx=>{
    const s=await tx.get('state')||{schema:1,revision:0,epoch:0,pending:null,heartbeats:{}};
    if(s.schema!==1||!Number.isSafeInteger(s.revision)||s.revision<0||!Number.isSafeInteger(s.epoch)||s.epoch<0||!s.heartbeats)fail('STATE_INVALID',503);
    const dynamic=Array.isArray(s.dynamicMembers)?s.dynamicMembers:[];
    const list=[...staticList,...dynamic.map(n=>({nodeId:n.nodeId,label:n.label}))];
    const effectiveRole=await authorizedRole(s,staticList,nodeId,role,dynamicToken);
    if(!effectiveRole)fail('UNAUTHORIZED',401);
    if(action==='join'&&role!=='joining')fail('ROLE_DENIED',403);
    if(action==='heartbeat'&&effectiveRole!=='agent'||['begin','abort','route','route-resume','complete','history','invite'].includes(action)&&effectiveRole!=='panel'||action==='status'&&effectiveRole==='joining')fail('ROLE_DENIED',403);
    let receipt=null;
    if(action==='invite'){
     if(!UUID.test(body.requestId||'')||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision!==s.revision)fail('REVISION_CONFLICT',409);
     const code=randomHex();
     s.pendingInvite={hash:await hash(code),expiresAt:now+600000,createdBy:nodeId,createdAt:new Date(now).toISOString()};
     s.revision++;
     await tx.put('state',s);
     await tx.put('audit:'+String(s.revision).padStart(16,'0'),{action:'INVITE_CREATED',nodeId,at:new Date(now).toISOString(),revision:s.revision});
     receipt={action:'invite',joinSecret:code,expiresAt:new Date(s.pendingInvite.expiresAt).toISOString(),revision:s.revision};
    }else if(action==='join'){
     if(!UUID.test(body.nodeId||'')||body.nodeId!==nodeId||!JOIN_LABEL.test(body.label||'')||!JOIN_HEX.test(body.joinSecret||'')||
       !TOKEN.test(body.agentKey||'')||!TOKEN.test(body.panelKey||'')||body.agentKey===body.panelKey)fail('JOIN_INVALID');
     if(list.length>=200)fail('CLUSTER_FULL',409);
     if(list.some(n=>n.nodeId===body.nodeId))fail('JOIN_ID_CONFLICT',409);
     if(!s.pendingInvite||s.pendingInvite.expiresAt<=now||!equal(await hash(body.joinSecret),s.pendingInvite.hash))fail('JOIN_CODE_EXPIRED_OR_INVALID',401);
     const controlPublicKey=body.control?await verifyN1Enrollment(body.control,{clusterId,nodeId:body.nodeId,joinSecret:body.joinSecret}):null;
     if(controlPublicKey){const pins=[...Object.values(JSON.parse(this.env.MHC_P32_PROOF_KEYS_JSON||'{}')),...Object.values(JSON.parse(this.env.MHC_CONTROL_NODES_JSON||'{}')).map(v=>v.publicKey),...dynamic.map(n=>n.controlPublicKey).filter(Boolean)];if(pins.some(p=>p.replace(/\s/g,'')===controlPublicKey.replace(/\s/g,'')))fail('N1_PROOF_KEY_ALREADY_ENROLLED');}
     s.dynamicMembers=[...dynamic,{nodeId:body.nodeId,label:body.label,agentDigest:await hash(body.agentKey),panelDigest:await hash(body.panelKey),enrolledAt:new Date(now).toISOString(),...(controlPublicKey?{controlPublicKey}:{})}];
     s.pendingInvite=null;s.revision++;
     await tx.put('state',s);
     await tx.put('audit:'+String(s.revision).padStart(16,'0'),{action:'NODE_JOINED',nodeId:body.nodeId,at:new Date(now).toISOString(),revision:s.revision});
     receipt={action:'join',nodeId:body.nodeId,revision:s.revision,joined:true};
    }else if(action==='heartbeat'){
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
      if(['begin','abort'].includes(action)&&p32BlocksPreparation(await tx.get('p32')))fail('P32_ROUTE_PENDING',409);
      if(action==='begin'){
       if(s.pending)fail('TRANSITION_PENDING',409);
       if(s.panelRecovery?.status==='DNS_REQUESTED')fail('P3_PANEL_RECOVERY_IN_PROGRESS',409);
       if(!list.some(n=>n.nodeId===body.targetNodeId))fail('UNKNOWN_TARGET');
       const hb=s.heartbeats[body.targetNodeId];if(!hb||now-hb.receivedAt<0||now-hb.receivedAt>180000)fail('TARGET_HEARTBEAT_STALE',409);
       const fromNodeId=s.declaredPrimary?.nodeId||this.env.MHC_P3_INITIAL_PRIMARY_NODE_ID||null;
       if(fromNodeId===body.targetNodeId)fail('TARGET_IS_CURRENT_PRIMARY',409);
       s.epoch++;
       s.pending={operationId:body.requestId,targetNodeId:body.targetNodeId,fromNodeId,epoch:s.epoch,status:'PREPARED_NO_WRITER_GRANT',createdAt:new Date(now).toISOString()};
      }else if(action==='route'){
       if(!UUID.test(body.operationId||'')||s.pending?.operationId!==body.operationId||s.pending.status!=='PREPARED_NO_WRITER_GRANT')fail('P3_PENDING_NOT_PREPARED',409);
       if(!['backupRestored','oldWritersStopped','targetHttpChecked','targetPanelAccessChecked','acceptDataLossRisk','labOnly'].every(k=>body[k]===true))fail('P3_OPERATOR_CONFIRMATIONS_REQUIRED',400);
       const t=s.heartbeats[s.pending.targetNodeId],metric=t?.telemetry;
       if(!t||now-t.receivedAt>180000||now-(t.metricsAt||0)>180000||metric?.services?.['amh-panel']!=='running'||metric?.services?.nginx!=='running')fail('P3_TARGET_NOT_READY',409);
       if(!UUID.test(s.pending.fromNodeId||''))fail('P3_INCUMBENT_NOT_CONFIGURED',409);
       s.pending={...s.pending,status:'ROUTING_REQUESTED',lastRouteTryAt:now,operatorAttestedAt:new Date(now).toISOString(),operatorPanelNodeId:nodeId,
         note:'LAB attestation only, not independent writer fencing'};
      }else if(action==='route-resume'){
       if(!UUID.test(body.operationId||'')||s.pending?.operationId!==body.operationId||s.pending.status!=='ROUTING_REQUESTED')fail('P3_NO_ROUTE_TO_RESUME',409);
       if(now-(s.pending.lastRouteTryAt||0)<30000)fail('P3_ROUTE_RETRY_TOO_SOON',409);
       s.pending={...s.pending,lastRouteTryAt:now};
      }else if(action==='complete'){
       if(!UUID.test(body.operationId||'')||s.pending?.operationId!==body.operationId||s.pending.status!=='DNS_SWITCHED_AWAITING_HTTP_CONFIRM')fail('P3_DNS_NOT_VERIFIED',409);
       if(!['websitePublicChecked','panelPublicChecked','noNewWritesOnOldNode','acceptNonFencedLabRisk'].every(k=>body[k]===true))fail('P3_FINAL_CONFIRMATIONS_REQUIRED',400);
       const t=s.heartbeats[s.pending.targetNodeId];
       if(!t||now-t.receivedAt<0||now-t.receivedAt>180000)fail('P3_TARGET_HEARTBEAT_STALE',409);
       const previously=s.pending.fromNodeId,target=s.pending.targetNodeId;
       s.declaredPrimary={nodeId:target,label:list.find(n=>n.nodeId===target)?.label||'Node',
        recordedAt:new Date(now).toISOString(),authority:'OPERATOR_ATTESTED_LAB_DNS_ONLY',
        routingVerified:true,appAndPanelOperatorChecked:true,fencingVerified:false,writerLeaseGranted:false};
       s.retiredPrimaries=[...(s.retiredPrimaries||[]).filter(n=>n.nodeId!==target&&n.nodeId!==previously),
        {nodeId:previously,role:'STANDBY_REJOIN_REQUIRES_OPERATOR_REVIEW',at:new Date(now).toISOString()}].slice(-100);
       s.pending=null;
       if(s.panelRecovery){s.lastPanelRecovery=s.panelRecovery;s.panelRecovery=null;}
      }else{
       if(!UUID.test(body.operationId||'')||s.pending?.operationId!==body.operationId)fail('PENDING_MISMATCH',409);
       if(s.pending.status!=='PREPARED_NO_WRITER_GRANT')fail('P3_ROUTE_MAY_HAVE_CHANGED_NO_BLIND_ABORT',409);
       s.pending=null;
      }
      s.revision++;
      receipt={requestId:body.requestId,action,revision:s.revision,epoch:s.epoch,operationId:action==='begin'?body.requestId:body.operationId};
      await tx.put('state',s);
      await tx.put(key,{digest,receipt});
      await tx.put('audit:'+String(s.revision).padStart(16,'0'),{...receipt,nodeId,at:new Date(now).toISOString()});
     }
    }
    const effective=await siteEffectiveEnv(this.env,tx),p33=p33View(effective,await tx.get('p33')||{epoch:s.epoch},now);
    const nodes=await Promise.all(list.map(async n=>({nodeId:n.nodeId,label:n.label,
     heartbeatRecent:!!s.heartbeats[n.nodeId]&&now-s.heartbeats[n.nodeId].receivedAt>=0&&now-s.heartbeats[n.nodeId].receivedAt<=180000,
     lastSeenAt:s.heartbeats[n.nodeId]?new Date(s.heartbeats[n.nodeId].receivedAt).toISOString():null,
     telemetryRecent:!!s.heartbeats[n.nodeId]?.metricsAt&&now-s.heartbeats[n.nodeId].metricsAt>=0&&now-s.heartbeats[n.nodeId].metricsAt<=180000,
     metricsAt:s.heartbeats[n.nodeId]?.metricsAt?new Date(s.heartbeats[n.nodeId].metricsAt).toISOString():null,
     telemetry:s.heartbeats[n.nodeId]?.telemetry||null,n1:n1PublicView(await tx.get('n1-node:'+n.nodeId)),standby:siteReadiness(effective,s,n.nodeId,(await tx.get('site-nodes')||{})[n.nodeId],await tx.get('n1-node:'+n.nodeId),now),role:p33.enabled&&p33.lease?.nodeId===n.nodeId?'PRIMARY_MANAGED_SCOPE':'STANDBY_NO_WRITER_GRANT'})));
    const history=action==='history'?await tx.get('monitor-history:'+body.targetNodeId)||[]:null;
    return {trafficProtocol:1,serverNow:now,p33,siteRelayEnabled:true,n1Enabled:this.env.MHC_N1_ENABLED==='LAB_SELF_SERVICE',mode:MODE,clusterId,revision:s.revision,epoch:s.epoch,workerBuild:p33.enabled?'MHC-P33-MANUAL-20261028':P32_BUILD,sourceCommit:/^[a-f0-9]{40}$/.test(this.env.MHC_SOURCE_COMMIT||'')?this.env.MHC_SOURCE_COMMIT:null,p32:p32View(this.env,await tx.get('p32')),
     nodes:action==='history'?[]:nodes,nodeCount:nodes.length,
     ...(action==='history'?{history:{nodeId:body.targetNodeId,points:Array.isArray(history)?history.slice(-144):[]}}:{}),
     declaredPrimary:s.declaredPrimary||null,retiredPrimaries:s.retiredPrimaries||[],
     panelRecovery:s.panelRecovery||null,panelRecoveryEnabled:this.env.MHC_P3_PANEL_RECOVERY_ENABLED==='LAB_PANEL_ONLY',pending:s.pending?{...s.pending,label:nodes.find(n=>n.nodeId===s.pending.targetNodeId)?.label||'Removed member'}:null,
     siteSync:syncPublic(await tx.get('site-sync'),now),callerSequence:s.heartbeats[nodeId]?.sequence||0,receipt,canComplete:false,writeLeaseGranted:p33.enabled&&p33.writerLeaseGranted,
     automaticFailover:false,livePrimaryVerified:p33.enabled&&p33.phase==='COMMITTED'&&p33.writerLeaseGranted,notice:p33.enabled?p33.notice:'M3 LAB supports operator-attested DNS routing; application validation and writer fencing are NOT independently proven, no writer lease is granted.'};
   });
   if(action==='route'||action==='route-resume'){
    // Journal was committed before any external API side effects. A failed/partial PATCH
    // leaves ROUTING_REQUESTED: retry with route-resume after inspecting live DNS.
    const panelFrom=result.panelRecovery?.status==='DNS_SWITCHED_RECOVERY'?
      result.panelRecovery.targetNodeId:null;
    const applied=await p3SwitchDns(this.env,{...result.pending,panelFromNodeId:panelFrom});
    const completed=await this.ctx.storage.transaction(async tx=>{
     const st=await tx.get('state');
     if(!st?.pending||st.pending.operationId!==result.pending.operationId||
       st.pending.status!=='ROUTING_REQUESTED')fail('P3_JOURNAL_CONFLICT',409);
     st.pending={...st.pending,status:'DNS_SWITCHED_AWAITING_HTTP_CONFIRM',dnsRecords:applied.records,dnsVerifiedAt:new Date().toISOString()};
     st.revision++;
     await tx.put('state',st);
     await tx.put('audit:'+String(st.revision).padStart(16,'0'),
       {action:'P3_DNS_VERIFIED',at:new Date().toISOString(),nodeId,operationId:st.pending.operationId,revision:st.revision});
     return {revision:st.revision,pending:st.pending};
    });
    return reply({...result,...completed,receipt:{action:'route',dnsOnlyVerified:true,applicationVerified:false,writerFenced:false},nonce});
   }
   return reply({...result,nonce});
  }catch(e){return reply({error:e.status?e.message:'AUTHORITY_STORAGE_UNAVAILABLE'},e.status||503);}
 }
 // Scheduled recovery runs in Durable Object, independently of the serving phone.
 // Persist intent BEFORE DNS; retry verifies actual record and never changes site route.
 async recoverPanel(){
  try{
   if(this.env.MHC_P3_PANEL_RECOVERY_ENABLED!=='LAB_PANEL_ONLY')fail('P3_PANEL_RECOVERY_DISABLED',403);
   const now=Date.now(),staticList=members(this.env);
   const planned=await this.ctx.storage.transaction(async tx=>{
    const s=await tx.get('state');
    if(!s||s.schema!==1||!s.heartbeats)fail('STATE_INVALID',503);
    const dynamic=Array.isArray(s.dynamicMembers)?s.dynamicMembers:[];
    const list=[...staticList,...dynamic.map(n=>({nodeId:n.nodeId,label:n.label}))];
    const plan=p3RecoveryPlan(s,list,this.env,now);
    if(plan.kind==='skip')return plan;
    const routes=p3Config(this.env),panels=routes.filter(r=>r.kind==='panel');
    if(panels.length!==1||!panels[0].nodeTargets[plan.fromNodeId]||!panels[0].nodeTargets[plan.targetNodeId])
     fail('P3_RECOVERY_PANEL_TUNNELS_MISSING',409);
    const prior=s.panelRecovery;
    s.panelRecovery={fromNodeId:plan.fromNodeId,targetNodeId:plan.targetNodeId,
     status:'DNS_REQUESTED',startedAt:prior?.startedAt||new Date(now).toISOString(),lastRouteTryAt:now,
     note:'LAB Panel recovery only; no website route, Primary or writer lease changed.'};
    s.revision++;
    await tx.put('state',s);
    await tx.put('audit:'+String(s.revision).padStart(16,'0'),
     {action:plan.kind==='resume'?'P3_PANEL_RECOVERY_RETRY':'P3_PANEL_RECOVERY_REQUESTED',
      at:new Date(now).toISOString(),revision:s.revision,
      fromNodeId:plan.fromNodeId,targetNodeId:plan.targetNodeId});
    return plan;
   });
   if(planned.kind==='skip')return reply({ok:true,action:'P3_PANEL_RECOVERY_SKIPPED',reason:planned.reason});
   const applied=await p3SwitchPanelDns(this.env,planned);
   const completed=await this.ctx.storage.transaction(async tx=>{
    const s=await tx.get('state'),r=s?.panelRecovery;
    if(!r||r.status!=='DNS_REQUESTED'||r.fromNodeId!==planned.fromNodeId||
      r.targetNodeId!==planned.targetNodeId||s.pending)fail('P3_RECOVERY_JOURNAL_CONFLICT',409);
    s.panelRecovery={...r,status:'DNS_SWITCHED_RECOVERY',dnsVerifiedAt:new Date().toISOString(),records:applied.records};
    s.revision++;
    await tx.put('state',s);
    await tx.put('audit:'+String(s.revision).padStart(16,'0'),
     {action:'P3_PANEL_RECOVERY_DNS_VERIFIED',at:new Date().toISOString(),
      revision:s.revision,targetNodeId:r.targetNodeId});
    return {ok:true,action:'P3_PANEL_RECOVERY_DNS_VERIFIED',targetNodeId:r.targetNodeId,
     siteRouteChanged:false,writerLeaseGranted:false};
   });
   return reply(completed);
  }catch(e){return reply({error:e.status?e.message:'P3_PANEL_RECOVERY_FAILED'},e.status||503);}
 }
}
