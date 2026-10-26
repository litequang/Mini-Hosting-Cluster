// MHC TEST 0.5.0A — manual switchover REHEARSAL ONLY.
// NO SQL, SSH, service control, Cloudflare, lease acquisition, routing or HA mutation.
// Operator-supplied LAB statements can never authorize real switchover.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const HOME=process.env.HOME||os.homedir();
const BASE=path.join(HOME,'mhc-switchover-lab');
const EVIDENCE=path.join(BASE,'evidence.json');
const JOURNAL=path.join(BASE,'rehearsal.json');
const SCOPE='ISOLATED_MANUAL_SWITCHOVER_REHEARSAL_NOT_HA';
const CONFIRM='--confirm=SIMULATE_WITHOUT_CHANGING_ANY_SERVER';
const STEPS=['quiesce','catchup','lease','route','postcheck'];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GTID=/^\d+-\d+-\d+(,\d+-\d+-\d+)*$/;
const HASH=/^[a-f0-9]{64}$/;
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function fail(m){throw Error(m)}
function exact(v,fields,label){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!==fields.slice().sort().join(','))fail(`${label} schema mismatch; no unknown or missing fields allowed`)}
function statSafe(file,type){let s;try{s=fs.lstatSync(file)}catch(e){if(e.code==='ENOENT')return null;throw e}if(s.isSymbolicLink()||((s.mode&0o077)!==0)|| (type==='file'&&!s.isFile())||(type==='dir'&&!s.isDirectory()))fail(`Unsafe private LAB ${type}`);return s}
function checkDir(){const d=statSafe(BASE,'dir');if(!d)fail('Private ~/mhc-switchover-lab directory absent (mkdir -m 700)');return d}
function readPrivate(file,max=16384){checkDir();const s=statSafe(file,'file');if(!s)return null;if(s.size>max)fail('LAB input too large');return fs.readFileSync(file,'utf8')}
function storePrivate(file,obj){checkDir();const temp=path.join(BASE,'.pending-'+crypto.randomBytes(6).toString('hex'));fs.writeFileSync(temp,JSON.stringify(obj,null,2)+'\n',{mode:0o600,flag:'wx'});try{fs.renameSync(temp,file)}finally{if(fs.existsSync(temp))fs.unlinkSync(temp)}}
function guardLab(){
 const mark=path.join(HOME,'.config/mhc-full-installer/installed');const s=statSafe(mark,'file');if(!s||!/^TEST 0\.(?:3\.|4\.|5\.)/.test(fs.readFileSync(mark,'utf8')))fail('Completed MHC TEST marker needed for isolated LAB rehearsal');
 for(const name of ['apps/thophuongpro/.env','.config/mini-hosting-cluster/node.json','.config/mini-hosting-cluster/ha.json','.config/mhc-full-installer/install-incomplete'])if(fs.existsSync(path.join(HOME,name)))fail('STOP: existing production, HA or partial installation footprint');
 for(const [folder,ext] of [['static','.conf'],['sites','.env']]){const dir=path.join(HOME,'.config/mhc-full-installer',folder);if(fs.existsSync(dir)){if(fs.lstatSync(dir).isSymbolicLink())fail('Unsafe site registration');if(fs.readdirSync(dir).some(n=>n.endsWith(ext)))fail('STOP: registered website exists: use disposable empty LAB only');}}
 // Do not create or inspect real Cloudflare/DB/lease files. This is never permission to promote.
}
function template(now=new Date().toISOString()){
 const id1='10000000-0000-4000-8000-000000000001',id2='10000000-0000-4000-8000-000000000002';
 return {schema:1,scope:SCOPE,capturedAt:now,clusterId:'10000000-0000-4000-8000-000000000003',
  source:{nodeId:id1,serverId:101,gtid:'0-101-10',filesSha256:'a'.repeat(64),ingressStopped:false,dbReadOnly:false,transactionsDrained:false,backupVerified:false,restoreDrillVerified:false},
  target:{nodeId:id2,serverId:102,gtid:'0-101-9',filesSha256:'b'.repeat(64),dbReadOnly:true,ioRunning:false,sqlRunning:false,applicationStopped:true},
  witness:{claimedReachable:false,claimedOwnerNodeId:id1,claimedTerm:1,claimedFenceIndependent:false},
  route:{publicIngressDisabled:false,isolatedLab:true},acceptance:{gtidAndroidE2E:false,fileAndroidE2E:false}};
}
function validateShape(e){
 exact(e,['schema','scope','capturedAt','clusterId','source','target','witness','route','acceptance'],'Evidence');
 exact(e.source,['nodeId','serverId','gtid','filesSha256','ingressStopped','dbReadOnly','transactionsDrained','backupVerified','restoreDrillVerified'],'source');
 exact(e.target,['nodeId','serverId','gtid','filesSha256','dbReadOnly','ioRunning','sqlRunning','applicationStopped'],'target');
 exact(e.witness,['claimedReachable','claimedOwnerNodeId','claimedTerm','claimedFenceIndependent'],'witness');
 exact(e.route,['publicIngressDisabled','isolatedLab'],'route');
 exact(e.acceptance,['gtidAndroidE2E','fileAndroidE2E'],'acceptance');
 if(e.schema!==1||e.scope!==SCOPE||![e.clusterId,e.source.nodeId,e.target.nodeId,e.witness.claimedOwnerNodeId].every(x=>typeof x==='string'&&UUID.test(x)))fail('Invalid LAB identifiers/scope');
 for(const n of [e.source,e.target])if(!Number.isSafeInteger(n.serverId)||n.serverId<=0||!GTID.test(n.gtid)||!HASH.test(n.filesSha256))fail('Invalid server identity, GTID or SHA256');
 if(!Number.isSafeInteger(e.witness.claimedTerm)||e.witness.claimedTerm<=0)fail('Invalid claimed lease term');
 for(const [p,fields] of [[e.source,['ingressStopped','dbReadOnly','transactionsDrained','backupVerified','restoreDrillVerified']],[e.target,['dbReadOnly','ioRunning','sqlRunning','applicationStopped']],[e.witness,['claimedReachable','claimedFenceIndependent']],[e.route,['publicIngressDisabled','isolatedLab']],[e.acceptance,['gtidAndroidE2E','fileAndroidE2E']]])for(const k of fields)if(typeof p[k]!=='boolean')fail('Invalid boolean '+k);
 if(Number.isNaN(Date.parse(e.capturedAt))||!/^\d{4}-\d\d-\d\dT/.test(e.capturedAt))fail('Invalid evidence date');
}
function evaluate(e,now=Date.now()){
 validateShape(e);const blockers=[];const rule=(code,test)=>{if(!test)blockers.push(code)};
 rule('SOURCE_AND_TARGET_MUST_DIFFER',e.source.nodeId!==e.target.nodeId&&e.source.serverId!==e.target.serverId);
 rule('EVIDENCE_MUST_BE_FRESH_5_MINUTES',Math.abs(now-Date.parse(e.capturedAt))<=300000);
 rule('SOURCE_WRITES_MUST_BE_QUIESCED',e.source.ingressStopped&&e.source.dbReadOnly&&e.source.transactionsDrained);
 rule('BACKUP_AND_RESTORE_DRILL_MUST_BE_ATTESTED',e.source.backupVerified&&e.source.restoreDrillVerified);
 rule('REPLICA_MUST_STAY_NONWRITER',e.target.dbReadOnly&&e.target.applicationStopped);
 rule('REPLICATION_IO_SQL_MUST_RUN',e.target.ioRunning&&e.target.sqlRunning);
 rule('GTID_MUST_MATCH_EXACTLY',e.source.gtid===e.target.gtid);
 rule('FILES_MUST_MATCH_SHA256',e.source.filesSha256===e.target.filesSha256);
 rule('WITNESS_OWNER_TERM_AND_INDEPENDENT_FENCE_CLAIM_REQUIRED',e.witness.claimedReachable&&e.witness.claimedFenceIndependent&&e.witness.claimedOwnerNodeId===e.source.nodeId);
 rule('LAB_INGRESS_MUST_BE_ISOLATED',e.route.isolatedLab&&e.route.publicIngressDisabled);
 rule('PHYSICAL_ANDROID_LAB_ACCEPTANCE_CLAIM_REQUIRED',e.acceptance.gtidAndroidE2E&&e.acceptance.fileAndroidE2E);
 return {scope:SCOPE,mode:'OPERATOR_CLAIMS_ONLY',simulatedGatePass:!blockers.length,blockers,blockerCount:blockers.length,
  authoritativeEvidence:false,canSwitchPrimary:false,haEligible:false,automaticFailover:false,
  notice:'All flags are untrusted operator LAB claims, NOT a verified witness, live GTID read, fencing, edge routing or production authorization.'};
}
function loadEvidence(){const txt=readPrivate(EVIDENCE);if(!txt)fail('No private LAB evidence file; use sample to create a template');const e=JSON.parse(txt);validateShape(e);return {e,digest:sha(txt)};}
function readJournal(){const txt=readPrivate(JOURNAL);if(!txt)return null;const j=JSON.parse(txt);exact(j,['schema','scope','evidenceSha256','phase','events','createdAt'],'Journal');if(j.schema!==1||j.scope!==SCOPE||!HASH.test(j.evidenceSha256)||!Array.isArray(j.events)||j.events.length>8)fail('Invalid journal');let previous='GENESIS';for(const [i,r] of j.events.entries()){
  exact(r,['index','step','previous','hash','at'],'Event');if(r.index!==i||typeof r.step!=='string'||!r.at||r.previous!==previous||r.hash!==sha(JSON.stringify({index:r.index,step:r.step,previous:r.previous,at:r.at,evidenceSha256:j.evidenceSha256})))fail('Journal integrity mismatch');previous=r.hash;
 }return j;}
function addEvent(j,step){const index=j.events.length,previous=j.events.length?j.events.at(-1).hash:'GENESIS',at=new Date().toISOString();j.events.push({index,step,previous,at,hash:sha(JSON.stringify({index,step,previous,at,evidenceSha256:j.evidenceSha256}))});j.phase=step;storePrivate(JOURNAL,j);}
function report(){const j=readJournal();return {scope:SCOPE,state:j?j.phase:'NOT_STARTED',simulatedSteps:j?j.events.map(x=>x.step):[],journalHash:j?.events.at(-1)?.hash||null,
  auditHashNotSignature:true,actualServiceChanges:0,realLeaseAcquired:false,realTrafficSwitched:false,writerAuthorityGranted:false,haEligible:false,notice:'Local simulation log ONLY; hash-chain detects accidental editing, not hostile changes or real authority.'};}
async function main(args=process.argv.slice(2)){
 const [cmd,sub,confirm]=args;
 if(cmd==='sample'&&args.length===1){console.log(JSON.stringify(template(),null,2));return}
 if(cmd==='status'&&args.length===1){console.log(JSON.stringify(report(),null,2));return}
 if(cmd==='plan'&&args.length===1){const {e}=loadEvidence();console.log(JSON.stringify({...evaluate(e),orderedSimulationSteps:STEPS,rollbackPolicy:'ABORT journal only; no SQL, filesystem, service, Cloudflare or lease changes performed'},null,2));return}
 if(!['start','advance','abort'].includes(cmd))fail('Usage switchover sample|plan|status|start --confirm=SIMULATE_WITHOUT_CHANGING_ANY_SERVER|advance STEP --confirm=SIMULATE_WITHOUT_CHANGING_ANY_SERVER|abort --confirm=SIMULATE_WITHOUT_CHANGING_ANY_SERVER');
 guardLab();if((cmd==='advance'?confirm:sub)!==CONFIRM)fail('Explicit offline simulation confirmation required');
 const j=readJournal();
 if(cmd==='abort'){if(!j||j.phase==='aborted'||j.phase==='completed')fail('No active rehearsal to abort');addEvent(j,'aborted');console.log(JSON.stringify(report(),null,2));return;}
 const {e,digest}=loadEvidence();const gate=evaluate(e);if(!gate.simulatedGatePass)fail('BLOCKED LAB rehearsal: '+gate.blockers.join(', '));
 if(cmd==='start'){if(j)fail('Existing LAB journal; do not reset or overwrite evidence');const state={schema:1,scope:SCOPE,evidenceSha256:digest,phase:'NEW',events:[],createdAt:new Date().toISOString()};addEvent(state,'prepared');}
 else{
  if(!j||j.evidenceSha256!==digest)fail('Missing journal or evidence changed after rehearsal start');if(j.phase==='aborted'||j.phase==='completed')fail('Rehearsal already terminal');
  const next=STEPS[j.events.length-1];if(sub!==next)fail(`Out-of-order simulated step; expected ${next||'none'}`);addEvent(j,sub);if(sub==='postcheck'){addEvent(j,'completed')}
 }
 console.log(JSON.stringify(report(),null,2));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))main().catch(err=>{console.error('SWITCHOVER_LAB_BLOCKED:',err.message);process.exitCode=1});
export {SCOPE,STEPS,template,validateShape,evaluate};
