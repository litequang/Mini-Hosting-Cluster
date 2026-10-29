// P4.0: one managed LAB site / one pair, reusing the existing DO and site jobs.
// No DNS, lease grant, election, or private snapshot payload is handled here.
const fail=c=>{throw Object.assign(Error(c),{status:409});};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const syncBusy=v=>!!v?.run&&['CREATING','APPLYING','BLOCKED'].includes(v.run.status);
export function syncSchedule(v){
 if(v?.kind==='interval'&&Number.isSafeInteger(v.minutes)&&v.minutes>=5&&v.minutes<=10080)return {kind:'interval',minutes:v.minutes,timeZone:'Asia/Ho_Chi_Minh'};
 if(v?.kind==='daily'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v.at||''))return {kind:'daily',at:v.at,timeZone:'Asia/Ho_Chi_Minh'};
 fail('SITE_SYNC_SCHEDULE_INVALID');
}
export function syncNextAt(schedule,now){
 if(schedule.kind==='interval')return now+schedule.minutes*60000;
 const [h,m]=schedule.at.split(':').map(Number),day=Math.floor((now+7*3600000)/86400000)*86400000;
 const at=day+(h*60+m)*60000-7*3600000;return at>now?at:at+86400000;
}
export function syncPublic(v,now=Date.now()){
 v=v||{revision:0,enabled:false,schedule:syncSchedule({kind:'interval',minutes:60})};
 const a=v.lastApplied;
 return {...v,rpoAgeSeconds:a?Math.max(0,Math.floor((now-a.sourceSnapshotAt)/1000)):null};
}
function assertPair(c,v){
 const {r,s,rows,now,known,fresh}=c,source=v.sourceNodeId,target=v.targetNodeId;
 if(!uuid.test(source||'')||!uuid.test(target||'')||source===target||!known(source)||!known(target))fail('SITE_SYNC_PAIR_INVALID');
 if(r?.phase!=='COMMITTED'||r.journal?.status!=='VERIFIED'||r.primaryNodeId!==source||r.lease?.nodeId!==source||r.lease.epoch!==r.epoch||r.lease.expiresAt<=now)fail('SITE_SYNC_PRIMARY_LEASE_REQUIRED');
 if(!fresh(s,source,now)||!fresh(s,target,now))fail('SITE_SYNC_NODE_OFFLINE');
 for(const id of [source,target]){
  const row=rows[id];if(row?.evidence?.ready!==true||now-row.evidence.checkedAt>=180000||row.evidence.syncProtocol!==1)fail('SITE_SYNC_NODE_UPGRADE_OR_VERIFY_REQUIRED');
  if(['QUEUED','RUNNING','WAITING'].includes(row.job?.status)||row.job?.status==='FAILED'&&['restore','sync-apply'].includes(row.job.type)&&row.job.rollbackVerified!==true)fail('SITE_NODE_BUSY');
 }
 if(rows[target].evidence.writeDenied!==true||rows[target].evidence.activeWriter===true)fail('SITE_SYNC_TARGET_NOT_STANDBY');
}
async function begin(tx,c,v,requestId,initiator){
 if(syncBusy(v))fail('SITE_SYNC_BUSY');assertPair(c,v);
 const uploads=await tx.get('site-upload-jobs')||[];if(uploads.length>=2)fail('SITE_TWO_BACKUPS_IN_PROGRESS');
 const {now,rows,r}=c,sourceJobId=crypto.randomUUID(),targetJobId=crypto.randomUUID();
 const run={id:requestId,sourceJobId,targetJobId,sourceNodeId:v.sourceNodeId,targetNodeId:v.targetNodeId,epoch:r.epoch,operationId:r.operationId,status:'CREATING',createdAt:now,updatedAt:now,initiator};
 const sync={runId:requestId,sourceNodeId:v.sourceNodeId,targetNodeId:v.targetNodeId,epoch:r.epoch,operationId:r.operationId};
 rows[v.sourceNodeId]={...rows[v.sourceNodeId],job:{id:sourceJobId,nodeId:v.sourceNodeId,type:'sync-backup',status:'QUEUED',snapshotId:null,sync,createdAt:now,updatedAt:now}};
 rows[v.targetNodeId]={...rows[v.targetNodeId],job:{id:targetJobId,nodeId:v.targetNodeId,type:'sync-apply',status:'WAITING',snapshotId:null,sync,createdAt:now,updatedAt:now}};
 await tx.put('site-nodes',rows);await tx.put('site-upload-jobs',[...uploads,{id:sourceJobId,nodeId:v.sourceNodeId,createdAt:now}]);
 v={...v,run,lastError:null,retryCount:0,nextAt:v.enabled?syncNextAt(v.schedule,now):null};await tx.put('site-sync',v);
 await tx.put('site-audit:'+requestId,{action:'sync',sourceNodeId:v.sourceNodeId,targetNodeId:v.targetNodeId,at:now,initiator});return v;
}
export async function syncAction(tx,c,body,nodeId){
 let v=await tx.get('site-sync')||{revision:0,enabled:false,schedule:syncSchedule({kind:'interval',minutes:60})};
 if(body.action==='status')return syncPublic(v,c.now);
 if(!uuid.test(body.requestId||'')||body.confirm!==true)fail('SITE_EXPLICIT_CONFIRMATION_REQUIRED');
 const previous=await tx.get('site-sync-request:'+body.requestId),digest=JSON.stringify([nodeId,body]);
 if(previous){if(previous!==digest)fail('SITE_IDEMPOTENCY_CONFLICT');return syncPublic(v,c.now);}
 if(body.expectedRevision!==v.revision)fail('SITE_SYNC_REVISION_CONFLICT');
 if(body.action==='configure'){
  if(syncBusy(v))fail('SITE_SYNC_BUSY');
  if(typeof body.enabled!=='boolean'||!uuid.test(body.targetNodeId||'')||!c.known(body.targetNodeId)||!c.known(body.sourceNodeId)||body.sourceNodeId===body.targetNodeId)fail('SITE_SYNC_PAIR_INVALID');
  const schedule=syncSchedule(body.schedule);
  if(body.enabled&&(v.lastApplied?.sourceNodeId!==body.sourceNodeId||v.lastApplied?.targetNodeId!==body.targetNodeId))fail('SITE_SYNC_VERIFIED_MANUAL_RUN_REQUIRED');
  v={...v,revision:v.revision+1,sourceNodeId:body.sourceNodeId,targetNodeId:body.targetNodeId,schedule,enabled:body.enabled,nextAt:body.enabled?syncNextAt(schedule,c.now):null,retryCount:0};
  await tx.put('site-sync',v);
 }else if(body.action==='run')v=await begin(tx,c,v,body.requestId,nodeId);
 else if(body.action==='resume'){
  if(v.run?.status!=='BLOCKED')fail('SITE_SYNC_NO_BLOCKED_RUN');
  const row=c.rows[v.run.targetNodeId];if(row?.job?.id!==v.run.targetJobId||row.job.type!=='sync-apply')fail('SITE_SYNC_RUN_MISMATCH');
  row.job={...row.job,status:'QUEUED',updatedAt:c.now};await tx.put('site-nodes',c.rows);
  v={...v,run:{...v.run,status:'APPLYING',updatedAt:c.now}};await tx.put('site-sync',v);
 }
 else fail('SITE_SYNC_ACTION_INVALID');
 await tx.put('site-sync-request:'+body.requestId,digest);return syncPublic(v,c.now);
}
export async function syncTimer(tx,c){
 let v=await tx.get('site-sync');
 if(syncBusy(v)){
  if(c.now-v.run.createdAt<900000)return;
  const run=v.run;
  if(run.status==='CREATING'){
   for(const id of [run.sourceNodeId,run.targetNodeId]){const row=c.rows[id];if(row?.job?.sync?.runId===run.id)row.job={...row.job,status:'FAILED',errorCode:'SITE_SYNC_SOURCE_TIMEOUT',rollbackVerified:true,updatedAt:c.now};}
   v={...v,lastError:'SITE_SYNC_SOURCE_TIMEOUT',run:{...run,status:'FAILED',updatedAt:c.now}};await tx.put('site-nodes',c.rows);
  }else if(run.status==='APPLYING')v={...v,lastError:'SITE_SYNC_TARGET_TIMEOUT',run:{...run,status:'BLOCKED',updatedAt:c.now}};
  await tx.put('site-sync',v);return;
 }
 if(!v?.enabled||!v.nextAt||v.nextAt>c.now)return;
 try{await begin(tx,c,v,crypto.randomUUID(),'schedule');}catch(e){
  if(!e.status)throw e;v={...v,lastError:e.message,retryCount:(v.retryCount||0)+1};
  v.nextAt=v.retryCount<3?c.now+60000:syncNextAt(v.schedule,c.now);if(v.retryCount>=3)v.retryCount=0;
  await tx.put('site-sync',v);
 }
}
export async function syncReceipt(tx,rows,job,p,snapshot,now){
 if(!job.type.startsWith('sync-'))return;
 let v=await tx.get('site-sync'),run=v?.run;
 if(!run||job.sync?.runId!==run.id||!['CREATING','APPLYING','BLOCKED'].includes(run.status))fail('SITE_SYNC_RUN_MISMATCH');
 if(p.errorCode){
  const safe=job.type==='sync-backup'||p.rollbackVerified===true;
  if(job.type==='sync-backup')rows[run.targetNodeId].job={...rows[run.targetNodeId].job,status:'FAILED',errorCode:p.errorCode,rollbackVerified:true,updatedAt:now};
  job.rollbackVerified=safe;
  v={...v,lastError:p.errorCode,run:{...run,status:safe?'FAILED':'BLOCKED',updatedAt:now}};
 }else if(job.type==='sync-backup'){
  rows[run.targetNodeId].job={...rows[run.targetNodeId].job,status:'QUEUED',snapshotId:snapshot.id,updatedAt:now};
  v={...v,run:{...run,status:'APPLYING',snapshotId:snapshot.id,sourceSnapshotAt:snapshot.sourceSnapshotAt,updatedAt:now}};
 }else{
  const a=p.applied;if(!a||a.siteId!==snapshot?.siteId||a.build!==snapshot?.build||a.schema!==snapshot?.schema||a.manifestSha256!==snapshot?.manifestSha256||a.snapshotId!==job.snapshotId||a.sourceNodeId!==run.sourceNodeId||a.targetNodeId!==run.targetNodeId||a.sourceSnapshotAt!==snapshot?.sourceSnapshotAt||a.sha256!==snapshot?.sha256||a.verified!==true||!Number.isSafeInteger(a.restoreAt)||a.restoreAt<run.createdAt||a.restoreAt>now+2000)fail('SITE_SYNC_APPLIED_PROOF_INVALID');
  v={...v,lastApplied:a,lastError:null,run:{...run,status:'VERIFIED',updatedAt:now}};
 }
 await tx.put('site-sync',v);
}
