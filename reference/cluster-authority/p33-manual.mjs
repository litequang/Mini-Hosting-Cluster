// Manual ownership of one explicitly managed LAB WordPress site. Never fences root/shell.
import {controlNodes,controlAdapter,verifyControlProof} from './control-nodes.mjs';
import {n1EffectiveEnv} from './n1-onboarding.mjs';
import {p32Config} from './p32-lab.mjs';
import {p3SwitchDns,p3SwitchPanelDns,p3InspectDns} from './p3-route.mjs';
export const P33_SCOPE='MHC_MANAGED_WORDPRESS_LAB';
export const P33_ACTIONS=['p33-begin','p33-fenced','p33-active','p33-route','p33-confirm','p33-renew','p33-control','p33-cancel','p33-refence'];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hex=/^[a-f0-9]{64}$/;
const fail=(c,status=409)=>{throw Object.assign(Error(c),{status});};
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(v=>v.toString(16).padStart(2,'0')).join('');
const nonce=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(v=>v.toString(16).padStart(2,'0')).join('');
export const p33Enabled=e=>e.MHC_P33_ENABLED==='MANUAL_MANAGED_SITE';
export function p33View(env,r,now=Date.now()){
 const controlOnlyNodeIds=Object.keys(controlNodes(env)),siteNodeIds=Object.keys(JSON.parse(env.MHC_P32_PROOF_KEYS_JSON||'{}'));
 const lease=r?.lease&&r.lease.expiresAt>now?r.lease:null;
 return {enabled:p33Enabled(env),controlOnlyNodeIds,siteNodeIds,scope:P33_SCOPE,revision:r?.revision||0,epoch:r?.epoch||0,phase:r?.phase||'IDLE',operationId:r?.operationId||null,targetNodeId:r?.targetNodeId||null,primaryNodeId:r?.primaryNodeId||null,lease,writerLeaseGranted:!!lease,challenge:r?.challenge||null,journal:r?.journal||null,automaticFailover:false,controlRecoveryEnabled:p33Enabled(env)&&env.MHC_P32_PANEL_RECOVERY_ENABLED==='LAB_PANEL_ONLY',nodeWritersFenced:false,notice:'Chỉ website WordPress LAB do MHC quản lý; không fence root/shell/SQL đặc quyền hoặc website khác.'};
}
export async function p33Proof(envelope,c,s,r,{nodeId,kind,now}){
 const p=envelope?.proof;
 if(!p||p.schema!==3||p.scope!==P33_SCOPE||p.nodeId!==nodeId||p.clusterId!==s.clusterId||p.epoch!==r.epoch||p.operationId!==r.operationId||p.nonce!==r.challenge||p.revision!==r.revision||p.expiresAt-p.checkedAt!==15000||now<p.checkedAt-2000||now>p.expiresAt||!['FENCED','ACTIVE','READY','PUBLIC_PANEL','PUBLIC_SITE'].includes(p.kind)||kind&&p.kind!==kind)fail('P33_PROOF_STALE_OR_MISMATCH');
 try{
  const pem=c.keys[nodeId]?.replace(/-----[^-]+-----|\s/g,'');if(!pem)throw Error();
  const key=await crypto.subtle.importKey('spki',Uint8Array.from(atob(pem),v=>v.charCodeAt(0)),'Ed25519',false,['verify']);
  if(!/^[A-Za-z0-9_-]{86}$/.test(envelope.signature||''))throw Error();
  const sig=Uint8Array.from(atob(envelope.signature.replaceAll('-','+').replaceAll('_','/')+'=='),v=>v.charCodeAt(0));
  if(!await crypto.subtle.verify('Ed25519',key,sig,new TextEncoder().encode(JSON.stringify(p))))throw Error();
 }catch{fail('P33_SIGNATURE_INVALID');}
 if(p.management?.panel!==true||p.management?.agent!==true||p.dataset?.verified!==true)fail('P33_NODE_NOT_READY');
 return p;
}
const healthy=(s,id,now)=>{const h=s.heartbeats?.[id];return h&&now-h.receivedAt>=0&&now-h.receivedAt<=90000&&now-(h.metricsAt||0)>=0&&now-(h.metricsAt||0)<=90000&&h.telemetry?.services?.['amh-panel']==='running'&&h.telemetry?.services?.['mhc-panel-tunnel']==='running';};
export async function p33Action({ctx,env,action,body={},nodeId,authorize,fetcher=fetch,now=Date.now(),internal=false}){
 if(!p33Enabled(env))fail('P33_NOT_ENABLED',403);
 env=await ctx.storage.transaction(tx=>n1EffectiveEnv(env,tx));
 const c=p32Config(env),management=controlNodes(env,c.keys),adapter=controlAdapter(c,management),fingerprint=await sha(JSON.stringify({routes:c.routes,keys:c.keys}));
 const planned=await ctx.storage.transaction(async tx=>{
  const state=await tx.get('state');if(!state||state.schema!==1||!Number.isSafeInteger(state.revision)||!Number.isSafeInteger(state.epoch))fail('P33_STATE_INVALID',503);
  const role=internal?'scheduled':await authorize(state);if(!internal&&role!==(action==='p33-renew'?'agent':'panel'))fail('ROLE_DENIED',403);
  const s={...state,clusterId:env.MHC_CLUSTER_ID},routes=await tx.get('p32');if(!routes)fail('P33_ROUTE_BASELINE_REQUIRED');
  const r=await tx.get('p33')||{revision:0,epoch:state.epoch,phase:'IDLE',lease:null,primaryNodeId:null,operationId:null,targetNodeId:null,challenge:null};
  if(r.fingerprint&&r.fingerprint!==fingerprint)fail('P33_CONFIG_CHANGED');
  if(action!=='p33-renew'&&r.journal?.controlProfileSha256&&(!management[r.journal.targetNodeId]||await sha(JSON.stringify(management[r.journal.targetNodeId]))!==r.journal.controlProfileSha256))fail('CONTROL_REGISTRY_CHANGED');
  if(internal){
   if(action!=='p33-recover-control'||env.MHC_P32_PANEL_RECOVERY_ENABLED!=='LAB_PANEL_ONLY')return {view:p33View(env,r,now)};
   if(!['IDLE','COMMITTED','CANCELLED'].includes(r.phase))return {view:p33View(env,r,now)};
   const old=r.journal;let target;
   if(old?.status==='DNS_REQUESTED'){
    if(old.cause!=='RECOVERY'||now-(old.lastTryAt||0)<90000||!healthy(s,old.targetNodeId,now))return {view:p33View(env,r,now)};target=old.targetNodeId;
   }else{
    if(old&&old.status!=='VERIFIED')return {view:p33View(env,r,now)};
    const h=s.heartbeats?.[routes.panelNodeId],age=now-h?.receivedAt;if(!h||!Number.isFinite(age)||age<300000||age>2592000000)return {view:p33View(env,r,now)};
    target=Object.keys(c.keys).filter(id=>id!==routes.panelNodeId&&healthy(s,id,now)).sort((a,b)=>s.heartbeats[b].receivedAt-s.heartbeats[a].receivedAt||a.localeCompare(b))[0];
    if(!target)return {view:p33View(env,r,now)};
   }
   r.fingerprint=fingerprint;r.journal={operationId:old?.status==='DNS_REQUESTED'?old.operationId:crypto.randomUUID(),kind:'panel',cause:'RECOVERY',targetNodeId:target,status:'DNS_REQUESTED',from:old?.status==='DNS_REQUESTED'?old.from:{siteNodeId:routes.siteNodeId,panelNodeId:routes.panelNodeId},challenge:nonce(),attemptId:crypto.randomUUID(),lastTryAt:now};
   r.revision++;state.revision++;await tx.put('p33',r);await tx.put('state',state);
   await tx.put('p33-audit:'+String(r.revision).padStart(16,'0'),{action,at:new Date(now).toISOString(),targetNodeId:target,kind:'panel',writerLeaseChanged:false});
   return {journal:r.journal};
  }
  if(action==='p33-renew'){
   if(r.targetNodeId!==nodeId||!['ACTIVATING','ACTIVE','DNS_REQUESTED','AWAITING_PUBLIC','COMMITTED'].includes(r.phase)||!r.lease||r.lease.nodeId!==nodeId||r.lease.epoch!==body.epoch||r.operationId!==body.operationId||r.lease.expiresAt<=now||!healthy(s,nodeId,now))fail('P33_LEASE_NOT_RENEWABLE');
   r.lease={...r.lease,expiresAt:now+90000};await tx.put('p33',r);return {view:p33View(env,r,now)};
  }
  if(!uuid.test(body.requestId||''))fail('P33_REQUEST_ID_REQUIRED');
  const key='p33-request:'+body.requestId,digest=await sha(JSON.stringify([nodeId,action,body])),previous=await tx.get(key);
  if(previous){if(previous.digest!==digest)fail('P33_IDEMPOTENCY_CONFLICT');return {view:p33View(env,r,now)};}
  if(body.expectedRevision!==state.revision||body.expectedP33Revision!==r.revision)fail('P33_REVISION_CONFLICT');
  if(action==='p33-begin'){
   if(!['IDLE','COMMITTED','CANCELLED'].includes(r.phase)||r.journal&&r.journal.status!=='VERIFIED')fail('P33_TRANSITION_PENDING');
   if(state.pending||routes.journal&&['DNS_REQUESTED','DNS_AWAITING_HTTP','ROLLBACK_DNS_AWAITING_HTTP'].includes(routes.journal.status))fail('P33_PREVIOUS_OPERATION_PENDING');
   if(!c.keys[body.targetNodeId]||!healthy(s,body.targetNodeId,now))fail('P33_TARGET_NOT_READY');
   if(body.acceptTargetData!==true)fail('P33_TARGET_DATA_ACCEPTANCE_REQUIRED',400);
   r.previousPrimaryNodeId=state.declaredPrimary?.nodeId||r.primaryNodeId||null;state.declaredPrimary=null;state.epoch++;r.epoch=state.epoch;r.operationId=body.requestId;r.targetNodeId=body.targetNodeId;r.primaryNodeId=null;r.lease=null;r.phase='FENCING';r.challenge=nonce();r.fingerprint=fingerprint;r.journal=null;
   r.dataChoice='USE_EXISTING_TARGET_DATA_NO_AUTOMATIC_REPLICATION';
  }else if(action==='p33-control'){
   if(!['IDLE','COMMITTED','CANCELLED'].includes(r.phase)||r.journal&&r.journal.status!=='VERIFIED')fail('P33_TRANSITION_PENDING');
   if(!c.keys[body.targetNodeId]&&!management[body.targetNodeId]||!healthy(s,body.targetNodeId,now))fail('P33_TARGET_NOT_READY');
   if(!hex.test(body.nonce||''))fail('P33_CONTROL_CHALLENGE_REQUIRED');
   if(management[body.targetNodeId])await verifyControlProof(body.envelope,management[body.targetNodeId],s,r,{nodeId:body.targetNodeId,nonce:body.nonce,kind:'READY',now});
   else {const p=await p33Proof(body.envelope,c,s,{...r,challenge:body.nonce},{nodeId:body.targetNodeId,now});if(!['READY','ACTIVE','FENCED'].includes(p.kind))fail('P33_CONTROL_PROOF_INVALID');}
   r.fingerprint=fingerprint;
   r.journal={...(management[body.targetNodeId]?{controlProfileSha256:await sha(JSON.stringify(management[body.targetNodeId]))}:{}),operationId:body.requestId,targetNodeId:body.targetNodeId,kind:'panel',status:'DNS_REQUESTED',from:{siteNodeId:routes.siteNodeId,panelNodeId:routes.panelNodeId},challenge:nonce(),attemptId:crypto.randomUUID()};
  }else{
   if(body.operationId!==r.operationId)fail('P33_OPERATION_MISMATCH');
   if(action==='p33-fenced'||action==='p33-cancel'){
    if(action==='p33-fenced'&&r.phase!=='FENCING'||action==='p33-cancel'&&!['FENCING','ACTIVATING','ACTIVE'].includes(r.phase))fail('P33_FENCE_PHASE_INVALID');
    if(!Array.isArray(body.envelopes)||body.envelopes.length!==Object.keys(c.keys).length)fail('P33_ALL_NODES_FENCE_REQUIRED');
    for(const id of Object.keys(c.keys)){
     const p=await p33Proof(body.envelopes.find(e=>e.proof?.nodeId===id),c,s,r,{nodeId:id,kind:'FENCED',now});
     if(p.httpStopped!==true||p.database?.writeDenied!==true||p.database?.connections!==0||p.childrenStopped!==true)fail('P33_MANAGED_WRITERS_NOT_FENCED');
    }
    r.lease=action==='p33-fenced'?{nodeId:r.targetNodeId,epoch:r.epoch,operationId:r.operationId,expiresAt:now+90000,scope:P33_SCOPE}:null;r.phase=action==='p33-fenced'?'ACTIVATING':'CANCELLED';
    if(action==='p33-cancel'){r.primaryNodeId=null;state.declaredPrimary=null;}
   }else if(action==='p33-refence'){
    if(!['ACTIVATING','ACTIVE','DNS_REQUESTED','AWAITING_PUBLIC'].includes(r.phase)||r.journal?.kind==='panel')fail('P33_REFENCE_PHASE_INVALID');
    if(r.lease&&r.lease.expiresAt>now)fail('P33_LEASE_STILL_ACTIVE');
    // An expired transition cannot resurrect its lease. Re-quiesce every node at a new epoch.
    state.epoch++;r.epoch=state.epoch;r.lease=null;r.phase='FENCING';r.challenge=nonce();
    if(r.journal?.status==='DNS_REQUESTED')r.journal={...r.journal,attemptId:crypto.randomUUID()};
   }else if(action==='p33-active'){
    if(r.phase!=='ACTIVATING'||!r.lease||r.lease.expiresAt<=now)fail('P33_ACTIVATION_PHASE_INVALID');
    const p=await p33Proof(body.envelope,c,s,r,{nodeId:r.targetNodeId,kind:'ACTIVE',now});
    if(p.database?.writeReadDelete!==true||p.httpServing!==true||p.wordpress!==true)fail('P33_ACTIVE_APP_NOT_PROVEN');r.phase='ACTIVE';
   }else if(action==='p33-route'){
    if(r.journal?.status==='DNS_REQUESTED'){
     if(now-(r.journal.lastTryAt||0)<30000)fail('P33_ROUTE_RETRY_COOLDOWN');
    }else{
     if(r.phase!=='ACTIVE'||!r.lease||r.lease.expiresAt<=now)fail('P33_ACTIVE_LEASE_REQUIRED');
     await p33Proof(body.envelope,c,s,r,{nodeId:r.targetNodeId,kind:'ACTIVE',now});
     r.journal={operationId:r.operationId,targetNodeId:r.targetNodeId,kind:'both',status:'DNS_REQUESTED',from:{siteNodeId:routes.siteNodeId,panelNodeId:routes.panelNodeId},challenge:nonce(),attemptId:crypto.randomUUID()};r.phase='DNS_REQUESTED';
    }
    if(r.journal.kind==='both'&&(!r.lease||r.lease.expiresAt<=now))fail('P33_ACTIVE_LEASE_REQUIRED');
    if(!healthy(s,r.journal.targetNodeId,now))fail('P33_TARGET_NOT_READY');r.journal.attemptId=crypto.randomUUID();
   }else if(action==='p33-confirm'){
    const j=r.journal;if(j?.status!=='AWAITING_PUBLIC')fail('P33_NO_PUBLIC_CHECK_PENDING');
    const challengeState={...r,challenge:j.challenge};
    const p=j.kind==='panel'&&management[j.targetNodeId]?await verifyControlProof(body.panelEnvelope,management[j.targetNodeId],s,r,{nodeId:j.targetNodeId,nonce:j.challenge,kind:'PUBLIC_PANEL',now}):await p33Proof(body.panelEnvelope,c,s,challengeState,{nodeId:j.targetNodeId,kind:'PUBLIC_PANEL',now});
    if(p.accessVerified!==true||p.host!=='panel-lab.giaouoc.com')fail('P33_PUBLIC_ACCESS_REQUIRED');
    if(j.kind==='both'){
     if(!r.lease||r.lease.expiresAt<=now)fail('P33_ACTIVE_LEASE_REQUIRED');
     const w=await p33Proof(body.siteEnvelope,c,s,challengeState,{nodeId:r.targetNodeId,kind:'PUBLIC_SITE',now});
     if(w.httpServing!==true||w.wordpress!==true||w.leaseEpoch!==r.epoch)fail('P33_PUBLIC_SITE_INVALID');
     r.phase='COMMITTED';r.primaryNodeId=r.targetNodeId;
     state.declaredPrimary={nodeId:r.targetNodeId,label:[...JSON.parse(env.MHC_MEMBERS_JSON||'[]'),...(s.dynamicMembers||[])].find(n=>n.nodeId===r.targetNodeId)?.label||'Managed LAB Primary',scope:P33_SCOPE,epoch:r.epoch,recordedAt:new Date(now).toISOString(),authority:'SIGNED_MANAGED_WRITER_AND_PUBLIC_ROUTE',writerLeaseGranted:true,fencingVerified:true,nodeWritersFenced:false};
    }
    r.journal={...j,status:'VERIFIED',httpVerifiedAt:new Date(now).toISOString()};
   }else fail('P33_ACTION_INVALID');
  }
  r.revision++;state.revision++;if(r.journal?.status==='DNS_REQUESTED')r.journal.lastTryAt=now;
  await tx.put('p33',r);await tx.put('state',state);await tx.put(key,{digest});
  await tx.put('p33-audit:'+String(r.revision).padStart(16,'0'),{action,nodeId,at:new Date(now).toISOString(),revision:r.revision,epoch:r.epoch,operationId:r.operationId,phase:r.phase,scope:P33_SCOPE});
  return r.journal?.status==='DNS_REQUESTED'&&['p33-route','p33-control'].includes(action)?{journal:r.journal}:{view:p33View(env,r,now)};
 });
 if(planned.view)return planned.view;
 const j=planned.journal,from=j.from,target=j.targetNodeId;
 if(j.kind==='panel'){
  if(from.panelNodeId===target)await p3InspectDns(adapter,{panel:target},fetcher,true);
  else await p3SwitchPanelDns(adapter,{fromNodeId:from.panelNodeId,targetNodeId:target},fetcher);
 }else if(from.siteNodeId===target){
  await p3InspectDns(adapter,{site:target,panel:from.panelNodeId},fetcher);
  if(from.panelNodeId!==target)await p3SwitchPanelDns(adapter,{fromNodeId:from.panelNodeId,targetNodeId:target},fetcher);
 }else await p3SwitchDns(adapter,{fromNodeId:from.siteNodeId,panelFromNodeId:from.panelNodeId,targetNodeId:target},fetcher);
 return ctx.storage.transaction(async tx=>{
  const r=await tx.get('p33'),s=await tx.get('state'),routes=await tx.get('p32');if(r?.journal?.attemptId!==j.attemptId||r.journal.status!=='DNS_REQUESTED')fail('P33_JOURNAL_CONFLICT');
  r.journal={...r.journal,status:'AWAITING_PUBLIC',dnsVerifiedAt:new Date(now).toISOString()};if(j.kind==='both')r.phase='AWAITING_PUBLIC';r.revision++;s.revision++;
  routes.panelNodeId=target;if(j.kind==='both')routes.siteNodeId=target;routes.revision++;routes.journal={status:'P33_MANAGED',operationId:j.operationId,kind:j.kind};
  await tx.put('p33',r);await tx.put('p32',routes);await tx.put('state',s);return p33View(env,r,now);
 });
}
