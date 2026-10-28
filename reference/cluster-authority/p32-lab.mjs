// One bounded LAB routing journal in the existing DO. Never grants a writer/Primary.
import {p3Config,p3SwitchDns,p3SwitchPanelDns,p3InspectDns} from './p3-route.mjs';
export const P32_BUILD='MHC-P32-READONLY-20261027';
export const LAB_NODES=['4ed4c025-62ae-4c2a-8d68-65dd76ecf550','4a9672d1-bb62-4286-946a-a78b73e57b24'];
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HEX=/^[a-f0-9]{64}$/;
const fail=(code,status=409)=>{throw Object.assign(Error(code),{status});};
const digest=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export function p32Config(env){
 if(env.MHC_P32_LAB_ENABLED!=='READ_ONLY_ROUTING')fail('P32_NOT_ENABLED');
 const adapter={MHC_P3_LAB_ENABLED:'OPERATOR_ASSISTED_DNS_ONLY',MHC_P3_INITIAL_PRIMARY_NODE_ID:env.MHC_P32_INITIAL_NODE_ID,MHC_P3_ROUTES_JSON:env.MHC_P32_ROUTES_JSON,MHC_P3_CF_TOKEN:env.MHC_P32_CF_TOKEN};
 const routes=p3Config(adapter);
 if(!LAB_NODES.includes(env.MHC_P32_INITIAL_NODE_ID)||routes.length!==2||routes.some(r=>r.hostname!==({site:'preview-lab.giaouoc.com',panel:'panel-lab.giaouoc.com'})[r.kind])||new Set(routes.map(r=>r.kind)).size!==2||new Set(routes.map(r=>r.zoneId)).size!==1)fail('P32_EXACT_LAB_ALLOWLIST_REQUIRED');
 let keys;try{keys=JSON.parse(env.MHC_P32_PROOF_KEYS_JSON||'null');}catch{fail('P32_PROOF_KEYS_INVALID');}
 if(!keys||Array.isArray(keys)||Object.keys(keys).length!==2)fail('P32_PROOF_KEYS_INVALID');
 for(const r of routes){
  if(Object.keys(r.nodeTargets).length!==2||LAB_NODES.some(id=>!UUID.test((r.nodeTargets[id]||'').split('.')[0])))fail('P32_TWO_SEPARATE_TUNNELS_REQUIRED');
  if(r.nodeTargets[LAB_NODES[0]]===r.nodeTargets[LAB_NODES[1]])fail('P32_TWO_SEPARATE_TUNNELS_REQUIRED');
 }
 for(const id of LAB_NODES)if(typeof keys[id]!=='string'||keys[id].length>500||!/^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=\n]+\n-----END PUBLIC KEY-----\s*$/.test(keys[id]))fail('P32_PROOF_KEYS_INVALID');
 if(new Set(LAB_NODES.map(id=>keys[id].replace(/\s/g,''))).size!==2)fail('P32_DISTINCT_NODE_KEYS_REQUIRED');
 if(LAB_NODES.some(id=>routes.some(r=>r.nodeTargets[id]!==routes[0].nodeTargets[id])))fail('P32_INCONSISTENT_NODE_TUNNEL_MAP');
 return {adapter,routes,keys,initial:env.MHC_P32_INITIAL_NODE_ID};
}
export function p32View(env,r){return {enabled:env.MHC_P32_LAB_ENABLED==='READ_ONLY_ROUTING',mode:'READ_ONLY_LAB_ROUTES',build:P32_BUILD,routeRevision:r?.revision||0,siteNodeId:r?.siteNodeId||env.MHC_P32_INITIAL_NODE_ID||null,panelNodeId:r?.panelNodeId||env.MHC_P32_INITIAL_NODE_ID||null,journal:r?.journal||null,writerLeaseGranted:false,changesDeclaredPrimary:false,recoveryEnabled:env.MHC_P32_PANEL_RECOVERY_ENABLED==='LAB_PANEL_ONLY'&&env.MHC_P33_ENABLED!=='MANUAL_MANAGED_SITE'};}
export function p32BlocksPreparation(r){return ['DNS_REQUESTED','DNS_AWAITING_HTTP'].includes(r?.journal?.status);}
export async function verifyLabProof(envelope,c,state,{nodeId,nonce,origin=false,website=false,now=Date.now()}){
 const p=envelope?.proof;
 if(!p||p.schema!==1||!LAB_NODES.includes(nodeId)||p.nodeId!==nodeId||p.clusterId!==state.clusterId||p.epoch!==state.epoch||p.revision!==state.revision||p.operationId!==(state.pending?.operationId||null)||!HEX.test(p.nonce||'')||(nonce&&p.nonce!==nonce)||!Number.isSafeInteger(p.checkedAt)||p.expiresAt!==p.checkedAt+15000||now<p.checkedAt-2000||now>p.expiresAt)fail('P32_PROOF_STALE_OR_MISMATCH');
 if(p.scope!=='ISOLATED_P31_DATASET_ONLY'||p.role!=='STANDBY_READ_ONLY'||p.writerGranted!==false||p.fencingVerified!==false||p.nodeWritersFenced!==false||p.previewReady!==true||!p.management?.['amh-panel']||!p.management?.['mhc-authority-agent']||!p.management?.sshd||p.database?.writeDenied!==true||p.database?.select!==true||!HEX.test(p.dataset?.manifestSha256||''))fail('P32_READ_ONLY_PROOF_REQUIRED');
 if(website&&(!p.websiteServing||p.http?.status!==200||!HEX.test(p.http?.bodySha256||'')||p.http?.httpMutationDenied!==true||p.http?.staticVerified!==true||p.http?.mediaVerified!==true))fail('P32_PREVIEW_NOT_SERVING');
 if(origin&&(p.origin?.accessVerified!==true||!['panel-lab.giaouoc.com','panel-lab.giaouoc.com:443'].includes(p.origin?.host)))fail('P32_PUBLIC_ACCESS_ORIGIN_REQUIRED');
 if(origin&&website&&(p.origin?.preview?.hostname!=='preview-lab.giaouoc.com'||p.origin.preview.status!==200||p.origin.preview.nodeId!==nodeId||p.origin.preview.bodySha256!==p.http.bodySha256))fail('P32_PUBLIC_PREVIEW_IDENTITY_MISMATCH');
 try{
  const pem=c.keys[nodeId].replace(/-----[^\n]+-----|\s/g,'');const key=await crypto.subtle.importKey('spki',bytes(pem),'Ed25519',false,['verify']);
  if(typeof envelope.signature!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(envelope.signature))fail('P32_SIGNATURE_INVALID');
  const signature=bytes(envelope.signature.replaceAll('-','+').replaceAll('_','/')+'==');
  if(!await crypto.subtle.verify('Ed25519',key,signature,new TextEncoder().encode(JSON.stringify(p))))fail('P32_SIGNATURE_INVALID');
 }catch{fail('P32_SIGNATURE_INVALID');}
 return p;
}
const healthy=(h,now)=>h&&now-h.receivedAt>=0&&now-h.receivedAt<=90000&&now-(h.metricsAt||0)>=0&&now-(h.metricsAt||0)<=90000&&h.telemetry?.services?.['amh-panel']==='running'&&h.telemetry?.services?.['mhc-panel-tunnel']==='running';
export async function p32Action({ctx,env,action,body={},nodeId,authorize,fetcher=fetch,now=Date.now(),internal=false}){
 const c=p32Config(env),fingerprint=await digest(JSON.stringify({routes:c.routes,keys:c.keys}));
 const planned=await ctx.storage.transaction(async tx=>{
  const s=await tx.get('state');if(!s||s.schema!==1||!Number.isSafeInteger(s.epoch)||!Number.isSafeInteger(s.revision))fail('P32_AUTHORITY_STATE_INVALID');
  if(!internal&&!await authorize(s))fail('ROLE_DENIED',403);
  const state={...s,clusterId:env.MHC_CLUSTER_ID};
  const r=await tx.get('p32')||{revision:0,siteNodeId:c.initial,panelNodeId:c.initial,journal:null};
  if(action==='p32-status')return {skip:true,view:p32View(env,r)};
  let target=body.targetNodeId,kind=body.kind||'both',rollback=action==='p32-rollback';
  if(internal){
   if(action!=='p32-recover'||env.MHC_P32_PANEL_RECOVERY_ENABLED!=='LAB_PANEL_ONLY')return {skip:true};
   if(r.journal?.status==='DNS_REQUESTED'){
    if(r.journal.cause!=='RECOVERY'||now-r.journal.lastTryAt<90000||!healthy(s.heartbeats?.[r.journal.targetNodeId],now))return {skip:true};
    target=r.journal.targetNodeId;
   }else{
    if(r.journal&&r.journal.status!=='VERIFIED'&&r.journal.status!=='ROLLBACK_VERIFIED')return {skip:true};
    const old=s.heartbeats?.[r.panelNodeId],age=now-old?.receivedAt;
    if(!old||age<300000||age>2592000000||!Number.isFinite(age))return {skip:true};
    target=LAB_NODES.filter(id=>id!==r.panelNodeId&&healthy(s.heartbeats?.[id],now)).sort((a,b)=>s.heartbeats[b].receivedAt-s.heartbeats[a].receivedAt||a.localeCompare(b))[0];
    if(!target)return {skip:true};
   }
   kind='panel';
  }else{
   if(!UUID.test(body.requestId||''))fail('P32_REQUEST_ID_REQUIRED');
   const old=await tx.get('p32-request:'+body.requestId),requestDigest=await digest(JSON.stringify([nodeId,action,body]));
   if(old){if(old.digest!==requestDigest)fail('P32_IDEMPOTENCY_CONFLICT');return {skip:true,view:p32View(env,r)};}
   if(body.expectedRevision!==s.revision||body.expectedRouteRevision!==r.revision)fail('P32_REVISION_CONFLICT');
   if(action==='p32-confirm'){
    const j=r.journal;if(!j||!['DNS_AWAITING_HTTP','ROLLBACK_DNS_AWAITING_HTTP'].includes(j.status)||j.fingerprint!==fingerprint)fail('P32_NO_CONFIRMABLE_ROUTE');
    await verifyLabProof(body.envelope,c,state,{nodeId:j.targetNodeId,nonce:j.challenge,origin:true,website:j.kind==='both',now});
    r.journal={...j,status:j.rollback?'ROLLBACK_VERIFIED':'VERIFIED',httpVerifiedAt:new Date(now).toISOString(),httpVerified:true,writerLeaseGranted:false};r.revision++;
    await tx.put('p32',r);await tx.put('p32-request:'+body.requestId,{digest:requestDigest});
    await tx.put('p32-audit:'+String(r.revision).padStart(16,'0'),{action,status:r.journal.status,at:new Date(now).toISOString(),nodeId});
    return {skip:true,view:p32View(env,r)};
   }
   if(!['p32-route','p32-resume','p32-rollback'].includes(action))fail('P32_ACTION_INVALID');
   if(action==='p32-resume'){
    const j=r.journal;if(j?.status!=='DNS_REQUESTED'||now-j.lastTryAt<60000)fail('P32_RESUME_COOLDOWN_OR_STATE');target=j.targetNodeId;kind=j.kind;rollback=j.rollback===true;
   }else if(rollback){
    const j=r.journal;if(!j||!['DNS_REQUESTED','DNS_AWAITING_HTTP','VERIFIED'].includes(j.status)||j.status==='DNS_REQUESTED'&&now-j.lastTryAt<60000)fail('P32_ROLLBACK_NOT_READY');
    if(j.kind==='both'&&j.from.siteNodeId!==j.from.panelNodeId)fail('P32_SPLIT_ROUTE_ROLLBACK_REQUIRES_REVIEW');target=j.from.panelNodeId;kind=j.kind;
   }else if(p32BlocksPreparation(r)||r.journal?.status==='ROLLBACK_DNS_AWAITING_HTTP')fail('P32_ROUTE_PENDING');
   if(!LAB_NODES.includes(target)||!['both','panel'].includes(kind))fail('P32_TARGET_INVALID');
   const p=await verifyLabProof(body.envelope,c,state,{nodeId:target,website:kind==='both'&&!rollback,now});
   if(await tx.get('p32-nonce:'+p.nonce))fail('P32_PROOF_REPLAY');await tx.put('p32-nonce:'+p.nonce,{at:now});
   if(kind==='both'&&!rollback&&(s.pending?.targetNodeId!==target||s.pending?.status!=='PREPARED_NO_WRITER_GRANT'))fail('P32_PREPARED_PREVIEW_REQUIRED');
   await tx.put('p32-request:'+body.requestId,{digest:requestDigest});
  }
  if(r.journal?.status==='DNS_REQUESTED'&&r.journal.fingerprint!==fingerprint)fail('P32_CONFIG_CHANGED_DURING_ROUTE');
  const retry=(action==='p32-resume'||internal&&r.journal?.status==='DNS_REQUESTED');
  const from=retry?r.journal.from:rollback?{siteNodeId:r.journal.targetNodeId,panelNodeId:r.journal.targetNodeId}:{siteNodeId:r.siteNodeId,panelNodeId:r.panelNodeId};
  r.journal={schema:1,operationId:retry?r.journal.operationId:internal?crypto.randomUUID():body.requestId,attemptId:crypto.randomUUID(),targetNodeId:target,kind,from,status:'DNS_REQUESTED',rollback,cause:internal?'RECOVERY':'MANUAL',lastTryAt:now,fingerprint,challenge:random(),httpVerified:false,writerLeaseGranted:false};
  r.revision++;await tx.put('p32',r);
  await tx.put('p32-audit:'+String(r.revision).padStart(16,'0'),{action,status:'DNS_REQUESTED',at:new Date(now).toISOString(),nodeId:internal?null:nodeId,targetNodeId:target,kind});
  return {journal:r.journal};
 });
 if(planned.skip)return planned.view||null;
 const j=planned.journal;
 // Reconcile actual DNS on every attempt; no blind abort or rollback after PATCH.
 let result;
 if(j.kind==='panel')result=j.from.panelNodeId===j.targetNodeId?await p3InspectDns(c.adapter,{panel:j.targetNodeId},fetcher,true):await p3SwitchPanelDns(c.adapter,{fromNodeId:j.from.panelNodeId,targetNodeId:j.targetNodeId},fetcher);
 else if(j.from.siteNodeId===j.targetNodeId&&j.from.panelNodeId===j.targetNodeId)result=await p3InspectDns(c.adapter,{site:j.targetNodeId,panel:j.targetNodeId},fetcher);
 else if(j.from.siteNodeId===j.targetNodeId){
  await p3InspectDns(c.adapter,{site:j.targetNodeId,panel:j.from.panelNodeId},fetcher);
  result=await p3SwitchPanelDns(c.adapter,{fromNodeId:j.from.panelNodeId,targetNodeId:j.targetNodeId},fetcher);
 }else result=await p3SwitchDns(c.adapter,{fromNodeId:j.from.siteNodeId,panelFromNodeId:j.from.panelNodeId,targetNodeId:j.targetNodeId},fetcher);
 return ctx.storage.transaction(async tx=>{
  const r=await tx.get('p32');if(r?.journal?.attemptId!==j.attemptId||r.journal.status!=='DNS_REQUESTED')fail('P32_JOURNAL_CONFLICT');
  r.panelNodeId=j.targetNodeId;if(j.kind==='both')r.siteNodeId=j.targetNodeId;
  r.journal={...r.journal,status:j.rollback?'ROLLBACK_DNS_AWAITING_HTTP':'DNS_AWAITING_HTTP',dnsVerifiedAt:new Date(now).toISOString(),records:result.records,httpVerified:false};r.revision++;
  await tx.put('p32',r);await tx.put('p32-audit:'+String(r.revision).padStart(16,'0'),{action:'DNS_VERIFIED_HTTP_PENDING',at:new Date(now).toISOString(),targetNodeId:j.targetNodeId,kind:j.kind});return p32View(env,r);
 });
}
