// TEST 0.5.0C-DRILL: mocked signed SSH responses / three-stage recovery; no Android contacted.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {generateIdentity,createSignedEnvelope,compareEvidence} from '../bin/physical-lab-attest.mjs';
import {verifyThreePhaseDrill,compareGtid,collectStage} from '../bin/field-recovery-drill.mjs';

const base=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-three-phase-'));
let count=0;
function ok(cond,msg){assert.ok(cond,msg);count++;}
function bad(f,msg){assert.throws(f,undefined,msg);count++;}
const SOURCE=generateIdentity(),REPLICA=generateIdentity();
const scope='MHC_PHYSICAL_EVIDENCE_LAB_ONLY_NO_HA';
const keys={source:SOURCE,replica:REPLICA};
const BOOT={source:'1'.repeat(64),replica:'2'.repeat(64)};
const FH={before:'3'.repeat(64),after:'4'.repeat(64)};
const now=Date.now();
const t=[now-12000,now-8000,now-4000];
const phases=['baseline','outage','recovered'];
const challenges=phases.map(()=>crypto.randomBytes(24).toString('hex'));
const key=path.join(base,'id');const kh=path.join(base,'kh');
fs.writeFileSync(key,'test key only',{mode:0o600});fs.writeFileSync(kh,'test known_hosts',{mode:0o600});
const config={schema:1,scope,outputRoot:base,ssh:{privateKey:key,knownHosts:kh},nodes:[
 {role:'source',host:'192.168.100.61',port:8022,user:'u0_a180',pinnedIdentityFingerprint:SOURCE.identity.fingerprint},
 {role:'replica',host:'192.168.100.62',port:8022,user:'u0_a181',pinnedIdentityFingerprint:REPLICA.identity.fingerprint}]};
const makePayload=(phase,role)=>{
 const index=phases.indexOf(phase),source=role==='source';
 const sg=['0-101-40','0-101-43','0-101-44'][index];
 const rg=['0-101-40','0-101-40','0-101-44'][index];
 const tree=phase==='baseline'?FH.before:(source||phase==='recovered'?FH.after:FH.before);
 return {schema:1,scope,nodeId:keys[role].identity.nodeId,role,challenge:challenges[index],measuredAt:new Date(t[index]+(source?0:100)).toISOString(),bootFingerprint:BOOT[role],
  file:{observed:true,fileCount:1,totalBytes:7,treeSha256:tree},
  maria:source?{observed:true,serverId:101,readOnly:false,gtidBinlogPos:sg,channelCount:0,ioRunning:false,sqlRunning:false}:
   {observed:true,serverId:202,readOnly:true,gtidSlavePos:rg,channelCount:1,ioRunning:phase!=='outage',sqlRunning:true,usingGtid:'SLAVE_POS'},
  guard:{isolatedLab:true},authority:{canSwitchPrimary:false,actualFencingVerified:false,haEligible:false}};
};
function writePrivate(p,o){fs.writeFileSync(p,JSON.stringify(o,null,2)+'\n',{mode:0o600});}
function stage(phase,mutate=()=>{}){
 const ix=phases.indexOf(phase),dir=path.join(base,`${phase}-${crypto.randomBytes(5).toString('hex')}`);
 fs.mkdirSync(dir,{mode:0o700});
 const p={source:makePayload(phase,'source'),replica:makePayload(phase,'replica')};mutate(p);
 const evidence={source:createSignedEnvelope(p.source,SOURCE.privateKeyPem),replica:createSignedEnvelope(p.replica,REPLICA.privateKeyPem)};
 for(const role of ['source','replica']){
  writePrivate(path.join(dir,`${role}-identity.json`),keys[role].identity);
  writePrivate(path.join(dir,`${role}-evidence.json`),evidence[role]);
 }
 const result=compareEvidence(evidence.source,evidence.replica,SOURCE.identity,REPLICA.identity,challenges[ix]);
 writePrivate(path.join(dir,'result.json'),{schema:1,scope,challenge:challenges[ix],result});
 writePrivate(path.join(dir,'stage.json'),{schema:1,scope,phase,challenge:challenges[ix],canSwitchPrimary:false,canArmHA:false});
 return dir;
}
try{
 ok(compareGtid('0-10-1','0-10-2').valid&&compareGtid('0-10-1','0-10-2').advanced,'GTID strictly advanced');
 ok(compareGtid('0-10-2','0-10-2').valid&&!compareGtid('0-10-2','0-10-2').advanced,'GTID equal');
 for(const [a,b] of [['0-10-3','0-10-2'],['0-10-3','0-20-4'],['0-10-1','0-10-2,1-12-1'],['x','0-10-4'],['0-10-4,0-10-5','0-10-5']])
  ok(!compareGtid(a,b).valid,`Reject invalid or divergent GTID: ${a}`);
 const dirs=phases.map(p=>stage(p));
 let result=verifyThreePhaseDrill(config,...dirs);
 ok(result.observedOutageCatchupAndFileDelta,'Pass three separate signed stages');
 ok(result.blockerCount===0,'No blockers in healthy staged drill');
 ok(result.conclusions.canSwitchPrimary===false&&!result.conclusions.authenticatedFencingProven,'Never permit switchover or claim fencing');
 ok(result.conclusions.sqlRowContentsProven===false&&!result.conclusions.atomicDbFileConsistencyProven,'GTID/file observation not row data parity');
 const shouldBlock=(phase,modify,expected)=>{
  const other=[...dirs],i=phases.indexOf(phase);other[i]=stage(phase,modify);
  const r=verifyThreePhaseDrill(config,...other);
  ok(!r.observedOutageCatchupAndFileDelta&&r.blockers.includes(expected),`Block ${expected}`);
 };
 shouldBlock('outage',p=>p.replica.maria.ioRunning=true,'OUTAGE_IO_NOT_OBSERVED_DOWN');
 shouldBlock('outage',p=>p.source.maria.gtidBinlogPos='0-101-40','SOURCE_DID_NOT_ADVANCE_DURING_OUTAGE');
 shouldBlock('outage',p=>p.replica.maria.gtidSlavePos='0-101-43','REPLICA_NOT_OBSERVED_BEHIND_SOURCE');
 shouldBlock('outage',p=>p.replica.maria.gtidSlavePos='0-101-39','REPLICA_GTID_REGRESSED_DURING_OUTAGE');
 shouldBlock('outage',p=>p.replica.file.treeSha256=FH.after,'REPLICA_FILE_CHANGED_WHILE_OUTAGE');
 shouldBlock('outage',p=>p.source.file.treeSha256=FH.before,'SOURCE_FILE_DID_NOT_CHANGE_DURING_OUTAGE');
 shouldBlock('recovered',p=>p.replica.maria.gtidSlavePos='0-101-43','RECOVERED_REPLICA_NOT_CAUGHT_UP');
 shouldBlock('recovered',p=>p.source.maria.gtidBinlogPos='0-101-42','SOURCE_GTID_REGRESSED_DURING_RECOVERY');
 shouldBlock('recovered',p=>p.replica.maria.ioRunning=false,'RECOVERED_THREADS_UNHEALTHY');
 shouldBlock('recovered',p=>p.replica.file.treeSha256=FH.before,'RECOVERED_FILE_NOT_EQUAL');
 shouldBlock('recovered',p=>p.source.file.treeSha256=FH.before,'SOURCE_FILE_CHANGED_AFTER_OUTAGE');
 shouldBlock('outage',p=>p.source.bootFingerprint='9'.repeat(64),'BOOT_CHANGED_source');
 shouldBlock('recovered',p=>p.replica.maria.serverId=203,'SERVER_ID_CHANGED_replica');
 shouldBlock('outage',p=>p.replica.maria.readOnly=false,'DB_ROLE_UNSAFE_outage');
 shouldBlock('outage',p=>p.replica.maria.usingGtid='NO','REPLICA_CHANNEL_UNSAFE_outage');
 bad(()=>verifyThreePhaseDrill(config,dirs[0],stage('outage',p=>p.replica.guard.isolatedLab=false),dirs[2]),'Untrusted guard refuses signed observation');
 shouldBlock('outage',p=>p.source.measuredAt=new Date(t[0]-1000).toISOString(),'NONMONOTONIC_SIGNED_TIME_source');
 shouldBlock('outage',p=>p.replica.measuredAt=new Date(t[1]+200000).toISOString(),'CAPTURE_CLOCK_SKEW_outage');
 const swap=[dirs[1],dirs[0],dirs[2]];
 bad(()=>verifyThreePhaseDrill(config,...swap),'Phase labels cannot be swapped');
 const saved=fs.readFileSync(path.join(dirs[0],'stage.json'),'utf8');
 fs.writeFileSync(path.join(dirs[0],'stage.json'),saved.replace('baseline','outage'));
 bad(()=>verifyThreePhaseDrill(config,...dirs),'Tampered stage label refused');fs.writeFileSync(path.join(dirs[0],'stage.json'),saved);
 const evid=fs.readFileSync(path.join(dirs[1],'source-evidence.json'),'utf8');
 fs.writeFileSync(path.join(dirs[1],'source-evidence.json'),evid.replace('0-101-43','0-101-99'));
 bad(()=>verifyThreePhaseDrill(config,...dirs),'Tampered signed evidence refused');fs.writeFileSync(path.join(dirs[1],'source-evidence.json'),evid);
 fs.chmodSync(path.join(dirs[2],'result.json'),0o644);
 bad(()=>verifyThreePhaseDrill(config,...dirs),'Insecure run receipt refused');fs.chmodSync(path.join(dirs[2],'result.json'),0o600);
 // Test automatic stage collection, including the expected non-healthy outage observation.
 const sourcePayload=makePayload('outage','source'),replicaPayload=makePayload('outage','replica');
 const mock=async(args,{role,stage})=>{
  if(stage==='preflight')return JSON.stringify({status:'ISOLATED_LAB_PREFLIGHT_PASS',scope,identity:keys[role].identity,captureAvailable:true,canSwitchPrimary:false,canArmHA:false,canModifyRouting:false});
  if(stage==='capture')return JSON.stringify({status:'SIGNED_OBSERVATION_RECORDED',role,nodeId:keys[role].identity.nodeId,canSwitchPrimary:false});
  const p=structuredClone(role==='source'?sourcePayload:replicaPayload);
  // actual random challenge is present on the remote command in the capture call; saved mock synchronizes it below
  const signedChallenge=mock.challenge;
  p.challenge=signedChallenge;return JSON.stringify(createSignedEnvelope(p,keys[role].privateKeyPem));
 };
 // Force collectField random challenge to be used in signatures via capture command side effect.
 const transport=async(args,meta)=>{if(meta.stage==='capture'){const m=args.at(-1).match(/\b([a-f0-9]{48})$/);if(m)mock.challenge=m[1];}return mock(args,meta)};
 const collected=await collectStage(config,'outage',transport);
 ok(collected.phase==='outage'&&collected.canSwitchPrimary===false,'LAB stage auto collection is never promotion');
 ok(!collected.observationGatePassed,'Expected outage evidence is an observation FAIL until final cross-phase review');
 ok(fs.existsSync(path.join(collected.runDir,'stage.json')),'Stage label persisted next to signed evidence');
 const before=fs.readdirSync(base).length;
 await assert.rejects(()=>collectStage(config,'not-a-phase',transport));count++;
 ok(fs.readdirSync(base).length===before,'Invalid phase triggers no SSH/data mutations');
 // Avoid linter complaints in toolchain with strict module imports

}finally{fs.rmSync(base,{recursive:true,force:true})}
console.log(`PASS: ${count} three-stage signed physical LAB outage/catch-up/file-delta assertions (mock SSH + mock MariaDB only)`);
