#!/usr/bin/env node
// MHC 0.5C-DRILL: three separate SSH collections; signed observer evidence only.
// Never changes network, databases, filesystem of a remote node, routing, or writer authority.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {collectField,verifyField,loadConfig,plan as fieldPlan} from './field-lab-coordinator.mjs';

const SCOPE='MHC_PHYSICAL_EVIDENCE_LAB_ONLY_NO_HA';
const PHASES=['baseline','outage','recovered'];
const GTID=/^\d{1,10}-\d{1,10}-\d{1,20}(?:,\d{1,10}-\d{1,10}-\d{1,20})*$/;
const fatal=s=>{throw Error(s)};
function secureFile(file){
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<2||stat.size>50000||(process.platform!=='win32'&&(stat.mode&0o077)!==0))fatal('Missing or nonprivate signed LAB evidence');
 return JSON.parse(fs.readFileSync(file,'utf8'));
}
function parseGtid(text){
 if(typeof text!=='string'||text.length>2048||!GTID.test(text))return null;
 const out=new Map();
 for(const item of text.split(',')){
  const [domain,server,seq]=item.split('-').map(BigInt);
  const key=domain.toString();if(out.has(key))return null;
  out.set(key,{server,seq});
 }
 return out;
}
// Require same domains and server ownership. Do not interpret divergent MariaDB domains as catch-up.
export function compareGtid(before,after){
 const a=parseGtid(before),b=parseGtid(after);
 if(!a||!b||a.size!==b.size)return {valid:false,advanced:false};
 let advanced=false;
 for(const [domain,prev] of a){const next=b.get(domain);
  if(!next||next.server!==prev.server||next.seq<prev.seq)return {valid:false,advanced:false};
  if(next.seq>prev.seq)advanced=true;
 }
 return {valid:true,advanced};
}
function fileIsSame(a,b){return !!(a?.observed&&b?.observed&&a.treeSha256===b.treeSha256&&a.fileCount===b.fileCount&&a.totalBytes===b.totalBytes&&/^[a-f0-9]{64}$/.test(a.treeSha256||''));}
function oneStage(config,dir,phase){
 const result=verifyField(config,dir); // validates every signature, key PIN, freshness, recorded result and private file modes
 const stage=secureFile(path.join(dir,'stage.json'));
 const summary=secureFile(path.join(dir,'result.json'));
 if(stage.schema!==1||stage.scope!==SCOPE||stage.phase!==phase||stage.challenge!==summary.challenge||stage.canSwitchPrimary!==false||stage.canArmHA!==false)fatal('Stage metadata mismatch');
 const source=secureFile(path.join(dir,'source-evidence.json')).payload;
 const replica=secureFile(path.join(dir,'replica-evidence.json')).payload;
 const sourceId=secureFile(path.join(dir,'source-identity.json'));
 const replicaId=secureFile(path.join(dir,'replica-identity.json'));
 if(result.result.verifiedSignatures!==true||result.result.distinctSigningKeys!==true||result.result.distinctBootInstances!==true)fatal('Signed two-node provenance did not verify');
 return {phase,challenge:stage.challenge,source,replica,sourceId,replicaId,report:result.result};
}
export function verifyThreePhaseDrill(config,baselineDir,outageDir,recoveredDir){
 const runs=[oneStage(config,baselineDir,'baseline'),oneStage(config,outageDir,'outage'),oneStage(config,recoveredDir,'recovered')];
 const [a,b,c]=runs,blockers=[];
 const deny=(condition,reason)=>{if(condition)blockers.push(reason)};
 deny(new Set(runs.map(x=>x.challenge)).size!==3,'REPLAYED_CHALLENGE');
 for(const r of runs){
  deny(r.source.role!=='source'||r.replica.role!=='replica','ROLE_MISMATCH_'+r.phase);
  deny(r.source.maria?.readOnly!==false||r.replica.maria?.readOnly!==true,'DB_ROLE_UNSAFE_'+r.phase);
  deny(r.replica.maria?.channelCount!==1||r.replica.maria?.usingGtid!=='SLAVE_POS','REPLICA_CHANNEL_UNSAFE_'+r.phase);
  deny(r.source.maria?.serverId===r.replica.maria?.serverId,'DUPLICATE_SERVER_ID_'+r.phase);
  deny(r.source.guard?.isolatedLab!==true||r.replica.guard?.isolatedLab!==true,'LAB_GUARD_NOT_ATTESTED_'+r.phase);
  deny(!(r.source.file?.observed&&r.replica.file?.observed),'FILE_PROBE_MISSING_'+r.phase);
 }
 for(const role of ['source','replica']){
  const ref=a[role];
  for(const r of [b,c]){
   deny(ref.nodeId!==r[role].nodeId,'NODE_ID_CHANGED_'+role);
   deny(a[role+'Id'].fingerprint!==r[role+'Id'].fingerprint,'PINNED_KEY_CHANGED_'+role);
   deny(ref.bootFingerprint!==r[role].bootFingerprint,'BOOT_CHANGED_'+role);
   deny(ref.maria?.serverId!==r[role].maria?.serverId,'SERVER_ID_CHANGED_'+role);
  }
  let prev=-Infinity;
  for(const r of runs){const ts=Date.parse(r[role].measuredAt||'');
   deny(!Number.isFinite(ts)||ts<=prev,'NONMONOTONIC_SIGNED_TIME_'+role);prev=ts;
  }
 }
 for(const r of runs){
  const src=Date.parse(r.source.measuredAt||''),dst=Date.parse(r.replica.measuredAt||'');
  deny(!Number.isFinite(src)||!Number.isFinite(dst)||Math.abs(src-dst)>90000,'CAPTURE_CLOCK_SKEW_'+r.phase);
 }
 const baselineGtid=compareGtid(a.source.maria?.gtidBinlogPos,a.replica.maria?.gtidSlavePos);
 const outageAdvance=compareGtid(a.source.maria?.gtidBinlogPos,b.source.maria?.gtidBinlogPos);
 const outageReplica=compareGtid(a.replica.maria?.gtidSlavePos,b.replica.maria?.gtidSlavePos);
 const outageLag=compareGtid(b.replica.maria?.gtidSlavePos,b.source.maria?.gtidBinlogPos);
 const recoveryAdvance=compareGtid(b.source.maria?.gtidBinlogPos,c.source.maria?.gtidBinlogPos);
 const recoveryCatchup=compareGtid(c.source.maria?.gtidBinlogPos,c.replica.maria?.gtidSlavePos);
 deny(!baselineGtid.valid||baselineGtid.advanced,'BASELINE_GTID_NOT_EQUAL');
 deny(a.replica.maria?.ioRunning!==true||a.replica.maria?.sqlRunning!==true,'BASELINE_THREADS_UNHEALTHY');
 deny(b.replica.maria?.ioRunning!==false,'OUTAGE_IO_NOT_OBSERVED_DOWN');
 deny(!outageAdvance.valid||!outageAdvance.advanced,'SOURCE_DID_NOT_ADVANCE_DURING_OUTAGE');
 deny(!outageReplica.valid,'REPLICA_GTID_REGRESSED_DURING_OUTAGE');
 deny(!outageLag.valid||!outageLag.advanced,'REPLICA_NOT_OBSERVED_BEHIND_SOURCE');
 deny(!recoveryAdvance.valid,'SOURCE_GTID_REGRESSED_DURING_RECOVERY');
 deny(!recoveryCatchup.valid||recoveryCatchup.advanced,'RECOVERED_REPLICA_NOT_CAUGHT_UP');
 deny(c.replica.maria?.ioRunning!==true||c.replica.maria?.sqlRunning!==true,'RECOVERED_THREADS_UNHEALTHY');
 deny(!fileIsSame(a.source.file,a.replica.file),'BASELINE_FILE_NOT_EQUAL');
 deny(fileIsSame(a.source.file,b.source.file),'SOURCE_FILE_DID_NOT_CHANGE_DURING_OUTAGE');
 deny(!fileIsSame(a.replica.file,b.replica.file),'REPLICA_FILE_CHANGED_WHILE_OUTAGE');
 deny(!fileIsSame(b.source.file,c.source.file),'SOURCE_FILE_CHANGED_AFTER_OUTAGE');
 deny(!fileIsSame(c.source.file,c.replica.file),'RECOVERED_FILE_NOT_EQUAL');
 const unique=[...new Set(blockers)];
 return {scope:SCOPE,mode:'THREE_SIGNED_OBSERVATION_STAGES_NO_HA',
  verifiedSignedObservations:runs.every(x=>x.report.verifiedSignatures),
  observedOutageCatchupAndFileDelta:unique.length===0,
  blockerCount:unique.length,blockers:unique,
  conclusions:{signaturesAndPinnedKeysChecked:true,physicalDeviceIndependenceProven:false,
   sqlRowContentsProven:false,atomicDbFileConsistencyProven:false,
   authenticatedFencingProven:false,allWritePathsGated:false,cloudflareRoutingProven:false,
   canSwitchPrimary:false,canArmHA:false},
  notice:'Read-only observations require independently operated LAB changes; cannot prove fencing, SQL row equality, split-brain safety or authorize switchover.'};
}
export async function collectStage(config,phase,transport){
 if(!PHASES.includes(phase))fatal('Choose baseline|outage|recovered');
 const {runDir,summary}=await collectField(config,transport);
 await fsp.writeFile(path.join(runDir,'stage.json'),JSON.stringify({schema:1,scope:SCOPE,phase,challenge:summary.challenge,canSwitchPrimary:false,canArmHA:false},null,2)+'\n',{flag:'wx',mode:0o600});
 return {phase,runDir,observationGatePassed:summary.result.observationGatePassed,
  blockerCount:summary.result.blockerCount,blockers:summary.result.blockers,canSwitchPrimary:false};
}
function plan(){return {release:'TEST 0.5.0C-WRITER-AUDIT',mode:'READ_ONLY_THREE_STAGE_SIGNED_PHYSICAL_LAB_EVIDENCE',
  stages:PHASES,prerequisites:'Two independently pinned, isolated Android LAB nodes, manually operated GTID outage and file delta',
  capture:'field-drill collect CONFIG_JSON baseline|outage|recovered',
  verify:'field-drill verify CONFIG_JSON BASELINE_DIR OUTAGE_DIR RECOVERED_DIR',
  remoteSideEffects:'Each field capture writes one signed evidence receipt on its LAB node; no SQL writes, network operations, or promotions',
  canSwitchPrimary:false,canArmHA:false,field:fieldPlan()};}
async function main(){const [cmd,...args]=process.argv.slice(2);
 if(cmd==='plan'&&args.length===0)return console.log(JSON.stringify(plan(),null,2));
 if(cmd==='collect'&&args.length===2){const r=await collectStage(loadConfig(args[0]),args[1]);console.log(JSON.stringify(r,null,2));return;}
 if(cmd==='verify'&&args.length===4){const r=verifyThreePhaseDrill(loadConfig(args[0]),...args.slice(1));console.log(JSON.stringify(r,null,2));if(!r.observedOutageCatchupAndFileDelta)process.exitCode=1;return;}
 fatal('Usage: field-drill plan | collect CONFIG_JSON baseline|outage|recovered | verify CONFIG_JSON BASELINE_DIR OUTAGE_DIR RECOVERED_DIR');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('FIELD_DRILL_ERROR:',e.message);process.exitCode=1});
