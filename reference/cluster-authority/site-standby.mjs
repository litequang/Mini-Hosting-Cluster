import {syncAction,syncTimer,syncPublic,syncBusy,syncReceipt} from './site-sync.mjs';
// One explicitly managed LAB site. Authenticated, bounded relay; never arbitrary remote commands.
import {n1EffectiveEnv,n1EnableSiteRoute} from './n1-onboarding.mjs';
import {p32Config} from './p32-lab.mjs';
import {controlNodes} from './control-nodes.mjs';
export const SITE_ACTIONS=['site-start','site-poll','site-result','site-upload','site-download','site-call','site-job','site-progress','site-sync'];
export const SITE_ID='mhc-p33-wordpress-v1',CHUNK_BYTES=196608,MAX_BYTES=64*1024*1024;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,hex=/^[a-f0-9]{64}$/;
const fail=(c,status=409)=>{throw Object.assign(Error(c),{status});};
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
const text=s=>new TextEncoder().encode(s);
const fresh=(s,id,now)=>{const h=s.heartbeats?.[id];return h&&now>=h.receivedAt&&now-h.receivedAt<90000&&now>=h.metricsAt&&now-h.metricsAt<90000&&h.telemetry?.services?.['amh-panel']==='running'&&h.telemetry?.services?.['mhc-authority-agent']==='running';};
export async function siteEffectiveEnv(env,tx){return {...await n1EffectiveEnv(env,tx),MHC_SITE_NODES_JSON:JSON.stringify(await tx.get('site-registry')||{})};}
export function siteProfiles(env){
 const base=p32Config(env),management=controlNodes(env,base.keys),extra=JSON.parse(env.MHC_SITE_NODES_JSON||'{}'),keys={...base.keys},routes=base.routes.map(r=>({...r,nodeTargets:{...r.nodeTargets}}));
 if(Object.keys(extra).length>198)fail('SITE_REGISTRY_INVALID');
 for(const [id,v]of Object.entries(extra)){
  if(!uuid.test(id)||!management[id]||v.publicKey!==management[id].publicKey||v.tunnelId!==management[id].tunnelId||v.siteId!==SITE_ID||!hex.test(v.manifestSha256||''))fail('SITE_REGISTRY_INVALID');
  keys[id]=v.publicKey;for(const r of routes)r.nodeTargets[id]=v.tunnelId+'.cfargotunnel.com';
 }
 return {...base,keys,routes,baseKeys:base.keys,baseRoutes:base.routes};
}
export async function verifySiteEnvelope(envelope,key,{clusterId,nodeId,jobId,now}){
 const p=envelope?.proof;
 if(!p||p.schema!==1||p.scope!=='MHC_SITE_STANDBY_LAB'||p.clusterId!==clusterId||p.nodeId!==nodeId||p.jobId!==jobId||p.siteId!==SITE_ID||!Number.isSafeInteger(p.checkedAt)||p.checkedAt>now+2000||now-p.checkedAt>60000||!/^[A-Za-z0-9_-]{86}$/.test(envelope.signature||''))fail('SITE_PROOF_INVALID');
 try{const k=await crypto.subtle.importKey('spki',Uint8Array.from(atob(key.replace(/-----[^-]+-----|\s/g,'')),c=>c.charCodeAt(0)),'Ed25519',false,['verify']);const sig=Uint8Array.from(atob(envelope.signature.replaceAll('-','+').replaceAll('_','/')+'=='),c=>c.charCodeAt(0));if(!await crypto.subtle.verify('Ed25519',k,sig,text(JSON.stringify(p))))throw Error();}catch{fail('SITE_SIGNATURE_INVALID');}return p;
}
export function siteReadiness(env,s,id,row,n1,now=Date.now()){
 const h=s.heartbeats?.[id],installed=h?.telemetry?.onboarding?.installPhase==='INSTALLED'||!!h?.telemetry&&!h.telemetry.onboarding,joined=!!h,management=fresh(s,id,now),legacy=!!JSON.parse(env.MHC_P32_PROOF_KEYS_JSON||'{}')[id];
 const route=management&&h.telemetry?.services?.['mhc-panel-tunnel']==='running'&&(legacy||n1?.phase==='CONTROL_REGISTERED'&&now-n1.verifiedAt<90000);
 const evidence=row?.evidence,maintenance=row?.job?.type==='fence-install'&&row.job.status!=='DONE'||row?.job?.type==='sync-apply'&&row.job.status!=='DONE'&&row.job.rollbackVerified!==true,site=!maintenance&&management&&evidence?.ready===true&&now-evidence.checkedAt<180000,approved=legacy||!!JSON.parse(env.MHC_SITE_NODES_JSON||'{}')[id];
 const blockers=[];if(maintenance)blockers.push(row.job.type==='fence-install'?'SITE_FENCE_INSTALL_INCOMPLETE':'SITE_SYNC_APPLY_IN_PROGRESS');if(!management)blockers.push('MANAGEMENT_OFFLINE');if(!route)blockers.push('TUNNEL_ROUTE_NOT_VERIFIED');if(!site)blockers.push(evidence?.errorCode||'SITE_DATA_AND_WRITER_GATE_NOT_VERIFIED');if(!approved)blockers.push('SITE_CANDIDATE_NOT_APPROVED');
 return {siteId:SITE_ID,states:{INSTALLED:!!installed,JOINED:joined,MANAGEMENT_READY:!!management,ROUTE_READY:!!route,SITE_READY:!!site,ELIGIBLE_PRIMARY:!!site&&!!route&&approved},blockers,lastCheckedAt:evidence?.checkedAt||null,preparedAt:evidence?.dataset?.preparedAt||null,dataset:evidence?.dataset||null,job:row?.job?publicJob(row.job):null};
}
function publicJob(j){return {id:j.id,nodeId:j.nodeId,type:j.type,status:j.status,stage:j.status==='DONE'?'DONE':j.stage||j.status,progress:j.progress||null,createdAt:j.createdAt,updatedAt:j.updatedAt,errorCode:j.errorCode||null,snapshotId:j.snapshotId||null,...(j.result?{result:j.result}:{}),...(j.request?{request:j.request}:{}),...(j.sync?{sync:j.sync}:{})};}
async function cleanup(tx,now){
 const snapshots=await tx.get('site-snapshots')||[],pending=await tx.get('site-upload-jobs')||[],rows=await tx.get('site-nodes')||{};
 const sync=await tx.get('site-sync'),expired=snapshots.filter(v=>now-v.createdAt>=86400000&&!(syncBusy(sync)&&sync.run.snapshotId===v.id)),abandoned=pending.filter(v=>now-v.createdAt>=86400000||rows[v.nodeId]?.job?.id!==v.id||rows[v.nodeId]?.job?.status==='FAILED');
 for(const v of [...expired,...abandoned])for(let i=0;i<(v.chunks||Math.ceil(MAX_BYTES/CHUNK_BYTES));i++)await tx.delete('site-chunk:'+v.id+':'+i);
 const keep=snapshots.filter(v=>!expired.includes(v)),uploads=pending.filter(v=>!abandoned.includes(v));await tx.put('site-snapshots',keep);await tx.put('site-upload-jobs',uploads);return {snapshots:keep,uploads};
}
export async function siteCleanup(ctx,now=Date.now()){await ctx.storage.transaction(tx=>cleanup(tx,now));}
export async function siteSyncMaintenance(ctx,env,now=Date.now()){
 if(env.MHC_P33_ENABLED!=='MANUAL_MANAGED_SITE')return;
 return ctx.storage.transaction(async tx=>{const effective=await siteEffectiveEnv(env,tx),profiles=siteProfiles(effective),before=(await tx.get('site-sync'))?.run?.id;await syncTimer(tx,{s:await tx.get('state'),r:await tx.get('p33'),rows:await tx.get('site-nodes')||{},known:id=>profiles.keys[id],fresh,now});const after=(await tx.get('site-sync'))?.run;return after?.id!==before&&after?.status==='CREATING'?[after.sourceNodeId,after.targetNodeId]:[];});
}
export async function siteAction({ctx,env,action,body={},nodeId,authorize,now=Date.now(),fetcher=fetch}){
 if(env.MHC_P33_ENABLED!=='MANUAL_MANAGED_SITE')fail('SITE_LAB_NOT_ENABLED',403);
 let enable=null;
 const result=await ctx.storage.transaction(async tx=>{
  const s=await tx.get('state'),role=s&&await authorize(s);if(!role)fail('UNAUTHORIZED',401);
  const panel=['site-start','site-call','site-job','site-sync'].includes(action);if(role!==(panel?'panel':'agent'))fail('ROLE_DENIED',403);
  env=await siteEffectiveEnv(env,tx);const base=p32Config(env),management=controlNodes(env,base.keys),known=id=>base.keys[id]||management[id]?.publicKey;
  if(!known(nodeId))fail('SITE_APPROVED_MEMBERSHIP_REQUIRED',403);
  const rows=await tx.get('site-nodes')||{},snapshots=await tx.get('site-snapshots')||[],target=action==='site-sync'?nodeId:panel?body.targetNodeId:nodeId;
  if(!uuid.test(target||'')||!known(target))fail('SITE_TARGET_NOT_APPROVED');
  let row=rows[target]||{},job=row.job;const r=await tx.get('p33');
  if(action==='site-sync')return {sync:await syncAction(tx,{s,r,rows,known:id=>siteProfiles(env).keys[id],fresh,now},body,nodeId)};
  const sync=await tx.get('site-sync');
  if(action==='site-start'||action==='site-call'){
   const type=action==='site-call'?'manual':body.type;
   if(syncBusy(sync))fail('SITE_SYNC_BUSY');
   if(job?.type==='fence-install'&&job.status==='FAILED'&&job.id!==body.requestId)fail('SITE_FENCE_INSTALL_RESUME_REQUIRED');
   if(!uuid.test(body.requestId||'')||!['backup','restore','verify','manual','fence-install'].includes(type))fail('SITE_REQUEST_INVALID');
   if(job?.id===body.requestId){if(job.type!==type||job.snapshotId!==(body.snapshotId||null))fail('SITE_IDEMPOTENCY_CONFLICT');if(job.status==='FAILED'&&body.resume===true&&body.confirm===true){job={...job,status:'QUEUED',errorCode:null,updatedAt:now};rows[target]={...row,job};await tx.put('site-nodes',rows);}return {job:publicJob(job)};}
   if(['RUNNING','QUEUED'].includes(job?.status))fail('SITE_NODE_BUSY');
   if(!fresh(s,target,now))fail('SITE_TARGET_OFFLINE');
   if(type!=='manual'&&(!['IDLE','COMMITTED','CANCELLED'].includes(r?.phase||'IDLE')||r?.lease?.nodeId===target&&r.lease.expiresAt>now))fail('SITE_WRITER_OR_TRANSITION_ACTIVE');
   if(['backup','fence-install'].includes(type)&&body.confirm!==true||type==='restore'&&(body.confirm!==true||body.preserveExisting!==true))fail('SITE_EXPLICIT_CONFIRMATION_REQUIRED');
   if(type==='restore'){
    const snapshot=snapshots.find(v=>v.id===body.snapshotId&&v.status==='VERIFIED'&&now-v.createdAt<86400000);if(!snapshot||snapshot.siteId!==SITE_ID||snapshot.nodeId===target)fail('SITE_VERIFIED_BACKUP_REQUIRED');
   }
   let request=null;
   if(type==='manual'){
    request=body.request;if(!request||!['p33-ready','p33-fence','p33-activate','p33-active','control-ready'].includes(request.action)||request.nodeId!==target||!hex.test(request.nonce||'')||request.epoch!==r?.epoch||request.revision!==r?.revision||request.operationId!==r?.operationId)fail('SITE_MANUAL_REQUEST_INVALID');
    if(request.action==='control-ready'?!management[target]:!siteProfiles(env).keys[target])fail('SITE_CANDIDATE_NOT_APPROVED');
   }
   if(type==='backup'){
    const clean=await cleanup(tx,now);if(clean.uploads.length>=2)fail('SITE_TWO_BACKUPS_IN_PROGRESS');
    await tx.put('site-upload-jobs',[...clean.uploads,{id:body.requestId,nodeId:target,createdAt:now}]);
   }
   job={id:body.requestId,nodeId:target,type,status:'QUEUED',createdAt:now,updatedAt:now,snapshotId:body.snapshotId||null,...(request?{request}:{})};
   rows[target]={...row,job};await tx.put('site-nodes',rows);await tx.put('site-audit:'+job.id,{action:type,target,createdBy:nodeId,at:now,siteId:SITE_ID});return {job:publicJob(job)};
  }
  if(action==='site-job')return {job:job?publicJob(job):null,snapshots:snapshots.filter(v=>v.status==='VERIFIED'&&now-v.createdAt<86400000).map(({chunks,...v})=>v),readiness:siteReadiness(env,s,target,row,await tx.get('n1-node:'+target),now),publicKey:known(target)};
  if(action==='site-poll'){
   if(job?.status==='WAITING')return {job:null};
   if(job?.type==='sync-apply'&&job.status==='FAILED'&&job.rollbackVerified!==true)return {job:null};
   if(syncBusy(sync)&&[sync.run.sourceNodeId,sync.run.targetNodeId].includes(target)&&!['RUNNING','QUEUED'].includes(job?.status))return {job:null};
   // Preserve failed restore's job ID so the UI can resume its private on-node journal.
   // A background health check must never replace the operator's recoverable task.
   if(['restore','fence-install'].includes(job?.type)&&job.status==='FAILED')return {job:null};
   if(!job||!['QUEUED','RUNNING'].includes(job.status)||now-job.createdAt>86400000&&!job.sync){
    if(now-(row.nextCheckAt||0)<0)return {job:null};
    if(!['IDLE','COMMITTED','CANCELLED'].includes(r?.phase||'IDLE'))return {job:null};
    job={id:crypto.randomUUID(),nodeId:target,type:'verify',status:'QUEUED',createdAt:now,updatedAt:now,snapshotId:null};row.nextCheckAt=now+120000;
   }
   job={...job,status:'RUNNING',updatedAt:now};rows[target]={...row,job};await tx.put('site-nodes',rows);return {job:publicJob(job),snapshot:snapshots.find(v=>v.id===job.snapshotId)||null};
  }
  if(action==='site-result'&&job?.id===body.jobId&&['DONE','FAILED'].includes(job.status)){
   const p=await verifySiteEnvelope(body.envelope,known(nodeId),{clusterId:env.MHC_CLUSTER_ID,nodeId,jobId:job.id,now});const {checkedAt,...stable}=p;
   if(job.resultDigest!==await sha(text(JSON.stringify(stable))))fail('SITE_RESULT_CONFLICT');return {job:publicJob(job)};
  }
  if(!job||body.jobId!==job.id||!['RUNNING','QUEUED'].includes(job.status)||now-job.createdAt>86400000&&!job.sync)fail('SITE_JOB_MISMATCH');
  if(action==='site-progress'){
   if(!['backup','restore','sync-backup','sync-apply'].includes(job.type)||!['DOWNLOADING','VERIFYING_CHECKSUM','EXTRACTING','INSTALLING','RESTORING_DATABASE','VERIFYING_SITE'].includes(body.stage)||!Number.isSafeInteger(body.done)||!Number.isSafeInteger(body.total)||body.done<0||body.total<0||body.done>body.total||body.total>MAX_BYTES)fail('SITE_PROGRESS_INVALID');
   job={...job,stage:body.stage,progress:{done:body.done,total:body.total},updatedAt:now};rows[target]={...row,job};await tx.put('site-nodes',rows);return {accepted:true};
  }
  if(action==='site-upload'){
   if(!['backup','sync-backup'].includes(job.type)||!Number.isInteger(body.index)||body.index<0||body.index>=Math.ceil(MAX_BYTES/CHUNK_BYTES)||typeof body.data!=='string'||body.data.length>CHUNK_BYTES*4/3||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.data)||!hex.test(body.sha256||''))fail('SITE_CHUNK_INVALID');
   const bytes=Uint8Array.from(atob(body.data),c=>c.charCodeAt(0));if(!bytes.length||bytes.length>CHUNK_BYTES||await sha(bytes)!==body.sha256)fail('SITE_CHUNK_CHECKSUM_MISMATCH');
   const k='site-chunk:'+job.id+':'+body.index,old=await tx.get(k);if(old&&old.sha256!==body.sha256)fail('SITE_CHUNK_CONFLICT');await tx.put(k,{data:body.data,sha256:body.sha256,size:bytes.length});job.stage='UPLOADING_BACKUP';job.updatedAt=now;rows[target]={...row,job};await tx.put('site-nodes',rows);return {accepted:true,index:body.index};
  }
  if(action==='site-download'){
   const snap=snapshots.find(v=>v.id===job.snapshotId&&v.status==='VERIFIED');if(!['restore','sync-apply'].includes(job.type)||!snap||!Number.isInteger(body.index)||body.index<0||body.index>=snap.chunks)fail('SITE_DOWNLOAD_DENIED');const chunk=await tx.get('site-chunk:'+snap.id+':'+body.index);if(!chunk)fail('SITE_CHUNK_MISSING');return chunk;
  }
  if(action!=='site-result')fail('SITE_ACTION_INVALID');
  const p=await verifySiteEnvelope(body.envelope,known(nodeId),{clusterId:env.MHC_CLUSTER_ID,nodeId,jobId:job.id,now});
  if(p.errorCode){if(!/^SITE_[A-Z0-9_]{1,80}$/.test(p.errorCode))fail('SITE_ERROR_INVALID');if(job.type==='verify'||job.type==='restore'||job.type==='fence-install'||job.type==='sync-apply'&&p.rollbackVerified!==true)row.evidence={ready:false,checkedAt:now,errorCode:p.errorCode};job={...job,status:'FAILED',errorCode:p.errorCode,updatedAt:now};}
  else if(job.type==='manual'){
   if(!p.envelope||JSON.stringify(p.request)!==JSON.stringify(job.request))fail('SITE_MANUAL_RESULT_MISMATCH');job={...job,status:'DONE',updatedAt:now,result:{envelope:p.envelope}};
  }else if(['backup','sync-backup'].includes(job.type)){
   const b=p.backup;if(!b||b.id!==job.id||b.siteId!==SITE_ID||!hex.test(b.sha256||'')||!hex.test(b.manifestSha256||'')||!Number.isSafeInteger(b.bytes)||b.bytes<1||b.bytes>MAX_BYTES||b.chunks!==Math.ceil(b.bytes/CHUNK_BYTES)||b.credentialsIncluded!==false)fail('SITE_BACKUP_INVALID');
   if(job.type==='sync-backup'&&(!Number.isSafeInteger(b.sourceSnapshotAt)||b.sourceSnapshotAt<job.createdAt-2000||b.sourceSnapshotAt>now+2000||b.sourceEpoch!==job.sync.epoch||!hex.test(b.build||'')||!hex.test(b.schema||'')))fail('SITE_SYNC_PROVENANCE_INVALID');
   let bytes=0;for(let i=0;i<b.chunks;i++){const c=await tx.get('site-chunk:'+job.id+':'+i);if(!c||c.size!==(i===b.chunks-1?b.bytes-i*CHUNK_BYTES:CHUNK_BYTES))fail('SITE_BACKUP_INCOMPLETE');bytes+=c.size;}if(bytes!==b.bytes)fail('SITE_BACKUP_INCOMPLETE');
   // Keep at most two snapshots (24h). Erase expired/evicted chunks, including private payloads.
   const keep=snapshots.filter(v=>now-v.createdAt<86400000).slice(-1);for(const v of snapshots.filter(v=>!keep.includes(v)))for(let i=0;i<v.chunks;i++)await tx.delete('site-chunk:'+v.id+':'+i);
   const snapshot={...b,nodeId,createdAt:now,status:'VERIFIED'};await tx.put('site-snapshots',[...keep,snapshot]);await tx.put('site-upload-jobs',(await tx.get('site-upload-jobs')||[]).filter(v=>v.id!==job.id));job={...job,status:'DONE',updatedAt:now,result:{snapshotId:job.id,bytes:b.bytes,sha256:b.sha256}};
  }else{
   const e=p.evidence;
   const active=e?.activeWriter===true&&r?.lease?.nodeId===nodeId&&r.lease.expiresAt>now&&e.activeLease?.epoch===r.epoch&&e.activeLease?.operationId===r.operationId;
   if(job.type==='sync-apply'&&e?.syncProtocol!==1)fail('SITE_SYNC_PROTOCOL_REQUIRED');
   if(e?.ready!==true||e.siteId!==SITE_ID||e.dataset?.verified!==true||!hex.test(e.dataset.manifestSha256||'')||e.http!==true||e.php!==true||e.sql!==true||e.files!==true||e.writerGate!==true||!(e.writeDenied===true||active)||e.management!==true||e.credentialsCopied!==false)fail('SITE_EVIDENCE_INCOMPLETE');
   row.evidence={...e,checkedAt:p.checkedAt};job={...job,status:'DONE',updatedAt:now,result:{ready:true,dataset:e.dataset}};
   if(management[nodeId])enable={nodeId,entry:management[nodeId],evidence:row.evidence};
  }
  const {checkedAt,...stable}=p;job.resultDigest=await sha(text(JSON.stringify(stable)));
  // Readiness polling must not postpone independent HTTP/PHP/SQL verification forever.
  if(job.type==='verify'||job.type==='restore'||job.type==='sync-apply')row.nextCheckAt=now+120000;
  if(job.type.startsWith('sync-'))await syncReceipt(tx,rows,job,p,(await tx.get('site-snapshots')||[]).find(v=>v.id===(job.type==='sync-backup'?job.id:job.snapshotId)),now);
  rows[target]={...row,job};await tx.put('site-nodes',rows);return {job:publicJob(job)};
 });
 if(enable){
  // Exact LAB ingress only. No DNS/lease/ownership change. Retry on the next verify if CF is unavailable.
  await n1EnableSiteRoute({ctx,env,nodeId:enable.nodeId,fetcher});
  await ctx.storage.transaction(async tx=>{const r=await tx.get('p33');if(!['IDLE','COMMITTED','CANCELLED'].includes(r?.phase||'IDLE'))fail('SITE_TRANSITION_ACTIVE');const registry=await tx.get('site-registry')||{};const entry={...enable.entry,siteId:SITE_ID,manifestSha256:enable.evidence.dataset.manifestSha256,verifiedAt:now};if(registry[enable.nodeId]&&registry[enable.nodeId].publicKey!==entry.publicKey)fail('SITE_EXISTING_PIN_CHANGED');registry[enable.nodeId]=entry;await tx.put('site-registry',registry);});
 }
 return result;
}
