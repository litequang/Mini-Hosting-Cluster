// MHC TEST 0.3.8 — allowlisted, observation-only member telemetry.
// Carries no paths, credentials, IPs, database names, or authorization semantics.
const SNAP = /^snapshot-[0-9]{8}$/;
const CLONE = new Set(['NO_LAB_CLONE','AMBIGUOUS_RECEIPTS','INVALID_RECEIPT','RECEIPT_RECORDED_NOT_REVERIFIED','STAGE_RECORDED_NOT_REVERIFIED','LAB_PREPARED_NOT_LIVE']);
const BACKUP = new Set(['NOT_VERIFIED','RECORDED_NOT_REVERIFIED']);
const FIELDS = new Set(['schema','clone','backup','readiness']);
const CLONE_FIELDS = new Set(['state','snapshot','stageRecorded','labRecorded','restoredSiteCount','sqlLabRecordedCount','wpPreviewPreparedCount']);
const BACKUP_FIELDS = new Set(['status','snapshot']);
function object(v,fields,name){
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!fields.has(k)))throw Error(`Invalid ${name} telemetry fields`);
}
function snap(x){return x===null || (typeof x==='string'&&SNAP.test(x));}
// Strictly rejects extra keys (including a forged haEligible, token, DB credentials).
export function sanitizeMemberReport(raw){
  object(raw,FIELDS,'member');
  if(raw.schema!==1||raw.readiness!=='OBSERVED_LAB_METADATA_ONLY')throw Error('Invalid LAB-only telemetry schema');
  object(raw.clone,CLONE_FIELDS,'clone');object(raw.backup,BACKUP_FIELDS,'backup');
  const c=raw.clone,b=raw.backup;
  if(!CLONE.has(c.state)||!snap(c.snapshot)||typeof c.stageRecorded!=='boolean'||typeof c.labRecorded!=='boolean'||
     ![c.restoredSiteCount,c.sqlLabRecordedCount,c.wpPreviewPreparedCount].every(n=>n===null||(Number.isInteger(n)&&n>=0&&n<=1000)))throw Error('Invalid clone observation');
  if(!BACKUP.has(b.status)||!snap(b.snapshot))throw Error('Invalid backup observation');
  if(c.state==='NO_LAB_CLONE'&&(c.snapshot!==null||c.stageRecorded||c.labRecorded))throw Error('Contradictory clone telemetry');
  if(c.labRecorded&&!c.stageRecorded)throw Error('LAB requires recorded stage');
  if(c.state==='LAB_PREPARED_NOT_LIVE'&&!c.labRecorded)throw Error('LAB status without evidence');
  if(c.state==='STAGE_RECORDED_NOT_REVERIFIED'&&!c.stageRecorded)throw Error('Stage status without evidence');
  if(b.status==='NOT_VERIFIED'&&b.snapshot!==null)throw Error('Unverified backup cannot name snapshot');
  return {schema:1,clone:{state:c.state,snapshot:c.snapshot,stageRecorded:c.stageRecorded,labRecorded:c.labRecorded,restoredSiteCount:c.restoredSiteCount,sqlLabRecordedCount:c.sqlLabRecordedCount,wpPreviewPreparedCount:c.wpPreviewPreparedCount},
    backup:{status:b.status,snapshot:b.snapshot},readiness:'OBSERVED_LAB_METADATA_ONLY'};
}
export function createMemberReport(summary){
  const c=summary?.clone||{},b=summary?.backup||{};
  return sanitizeMemberReport({schema:1,clone:{state:CLONE.has(c.state)?c.state:'NO_LAB_CLONE',snapshot:SNAP.test(c.snapshot||'')?c.snapshot:null,
    stageRecorded:c.stageRecorded===true,labRecorded:c.labRecorded===true,
    restoredSiteCount:Number.isInteger(c.restoredSiteCount)?c.restoredSiteCount:null,
    sqlLabRecordedCount:Number.isInteger(c.sqlLabRecordedCount)?c.sqlLabRecordedCount:null,
    wpPreviewPreparedCount:Number.isInteger(c.wpPreviewPreparedCount)?c.wpPreviewPreparedCount:null},
    backup:{status:BACKUP.has(b.status)?b.status:'NOT_VERIFIED',snapshot:SNAP.test(b.snapshot||'')?b.snapshot:null},
    readiness:'OBSERVED_LAB_METADATA_ONLY'});
}
