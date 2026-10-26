// MHC TEST 0.4.0D — STRICT READ-ONLY, operator-assisted end-to-end LAB evidence gate.
// Does not change MariaDB, connectivity, file serving, HA, Cloudflare or services.
// Reports are not authentication certificates, atomic snapshot proof or HA authorization.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {proofAt,replicaCheck,progressed} from './gtid-acceptance.mjs';
import {labStatus} from './gtid-lab.mjs';
import {verifyBundle,scan,noLinksTo,jsonRead,LAB} from './file-delta-lab.mjs';
const HOME=process.env.HOME||os.homedir();
const ROOT=path.join(HOME,'.local/share/mhc-full-installer/d-acceptance');
const JOURNAL=path.join(ROOT,'receiver.json');
const SCOPE='MHC_D_E2E_EVIDENCE_LAB_NOT_HA';
const ID=/^delta-[0-9]{13}-[0-9a-f]{10}$/;
const SHA=/^[0-9a-f]{64}$/;
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const shaBytes=x=>crypto.createHash('sha256').update(x).digest('hex');
function fail(s){throw Error(s)}
async function st(p){try{return await fsp.lstat(p)}catch(e){if(e.code==='ENOENT')return null;throw e}}
function privateRegular(s){return !!s?.isFile()&&!s.isSymbolicLink()&&(s.mode&0o077)===0;}
async function guard(){
 const mark=path.join(HOME,'.config/mhc-full-installer/installed'),m=await st(mark);
 if(!privateRegular(m)||!/^TEST 0\.(?:3\.|4\.|5\.)/.test((await fsp.readFile(mark,'utf8')).trim()))fail('Completed private MHC TEST LAB install marker required');
 const home=await st(HOME);if(!home?.isDirectory()||home.isSymbolicLink())fail('Unsafe LAB home');
 for(const item of ['apps/thophuongpro/.env','.config/mini-hosting-cluster/node.json','.config/mini-hosting-cluster/ha.json','.config/mhc-full-installer/install-incomplete'])if(await st(path.join(HOME,item)))fail('STOP: production, cluster, HA or incomplete-install footprint');
 for(const type of ['static','sites']){const folder=path.join(HOME,'.config/mhc-full-installer',type),s=await st(folder);if(s){if(!s.isDirectory()||s.isSymbolicLink())fail('Unsafe LAB registration directory');const names=await fsp.readdir(folder);if(names.some(n=>n.endsWith(type==='static'?'.conf':'.env')))fail('STOP: a managed website is registered; use two disposable isolated LAB nodes');}}
 const root=await st(ROOT);if(root&&(!root.isDirectory()||root.isSymbolicLink()||(root.mode&0o077)!==0))fail('Unsafe private evidence store');
}
async function load(){const s=await st(JOURNAL);if(!s)return null;if(!privateRegular(s)||s.size>16384)fail('Unsafe evidence journal');const j=JSON.parse(await fsp.readFile(JOURNAL,'utf8'));
 if(j.schema!==1||j.scope!==SCOPE||!['baseline','disconnected','recovered'].includes(j.phase)||typeof j.baseline!=='object'||typeof j.createdAt!=='string')fail('Invalid evidence journal schema');
 return j;}
async function writeJournal(obj){
 await fsp.mkdir(ROOT,{recursive:true,mode:0o700});
 const d=await st(ROOT);if(!d?.isDirectory()||d.isSymbolicLink()||(d.mode&0o077)!==0)fail('Unsafe evidence directory');
 const lock=path.join(ROOT,'journal.lock');try{await fsp.mkdir(lock,{mode:0o700});}catch{fail('Evidence journal locked; inspect interrupted operation, never clear blindly');}
 try{const tmp=path.join(ROOT,`.pending-${crypto.randomBytes(8).toString('hex')}`);await fsp.writeFile(tmp,JSON.stringify(obj,null,2)+'\n',{mode:0o600,flag:'wx'});
  const f=await fsp.open(tmp,'r');try{await f.sync()}finally{await f.close()};await fsp.rename(tmp,JOURNAL);
 }finally{await fsp.rmdir(lock)}
}
function note(j){return {scope:SCOPE,phase:j?.phase||'NOT_STARTED',baselineObserved:!!j?.baseline,outageObserved:!!j?.disconnected,recoveryObserved:!!j?.recovered,distinctNewProbe:!!j?.recovered?.probeAdvanced,fileEvidenceRecorded:!!j?.file,independentDeviceVerification:false,atomicDatabaseFileSnapshotVerified:false,writeFencingVerified:false,standbyReady:false,haEligible:false};}
async function baseline(p){await guard();if(await load())fail('Existing acceptance journal cannot be overwritten');
 const proof=await proofAt(p),result=await replicaCheck(p);
 if(!result.validationPassed)fail('Baseline replica GTID/row/IO/SQL must pass');
 const now=new Date().toISOString();const j={schema:1,scope:SCOPE,phase:'baseline',createdAt:now,baseline:{probeId:proof.probeId,serverId:proof.serverId,database:proof.database,afterGtid:proof.afterGtid,observedAt:now}};
 await writeJournal(j);return {...note(j),notice:'Baseline transaction observed on isolated replica; one row is not full database parity.'};}
async function disconnected(){await guard();const j=await load();if(!j||j.phase!=='baseline')fail('Record baseline first, exactly once');
 const status=await labStatus();if(status.channelCount!==1||status.channels?.[0]?.ioStateKnown!==true||status.channels[0].ioRunning!==false)fail('Replica IO disconnect not observed from MariaDB');
 j.phase='disconnected';j.disconnected={observedAt:new Date().toISOString(),ioObservedDown:true};await writeJournal(j);
 return {...note(j),notice:'IO down was observed; no MHC network disruption or writer fencing occurred.'};}
async function recovered(p,confirm){await guard();if(confirm!=='--confirm=SECOND_SOURCE_PROBE_CREATED_DURING_OUTAGE')fail('Operator confirmation of a SECOND source probe created during outage required');
 const j=await load();if(!j||j.phase!=='disconnected')fail('Observe outage before recovery; do not reuse phases');
 const proof=await proofAt(p),result=await replicaCheck(p);
 if(!result.validationPassed||proof.serverId!==j.baseline.serverId||proof.database!==j.baseline.database||proof.probeId===j.baseline.probeId||!progressed(j.baseline.afterGtid,proof.afterGtid))fail('New post-outage source transaction and replica catch-up NOT proven');
 j.phase='recovered';j.recovered={probeId:proof.probeId,afterGtid:proof.afterGtid,observedAt:new Date().toISOString(),probeAdvanced:true,ioAndSqlRunning:true,sourceProbeDuringOutageOperatorAttested:true};
 await writeJournal(j);return {...note(j),notice:'Operator-attested second source write followed by replica GTID+row catch-up. No cross-device clock/provenance attestation.'};}
async function inspectFiles(id){
 if(!ID.test(id||''))fail('Invalid LAB delta id');
 const box=path.join(LAB,'inbox',id),{m,next}=await verifyBundle(box);
 const receipt=await jsonRead(path.join(LAB,'transport/receipts',id+'.json'),4096);
 const cpfile=path.join(box,'checkpoint.json');await noLinksTo(cpfile);const raw=await fsp.readFile(cpfile);
 const cp=JSON.parse(raw.toString('utf8'));
 if(receipt.schema!==1||receipt.id!==id||receipt.status!=='CHECKSUM_VERIFIED_NOT_APPLIED'||receipt.checkpointSha256!==shaBytes(raw)||!SHA.test(receipt.checkpointSha256))fail('C2 receiver receipt/checkpoint mismatch');
 if(cp.schema!==1||cp.scope!=='MHC_C3_QUIESCED_OFFLINE_LAB_ONLY'||cp.deltaId!==id||cp.bundleMetaSha256!==digest(m)||cp.fileManifestSha256!==digest(next.files))fail('C3 checkpoint does not match bundle and manifest');
 const report=await jsonRead(path.join(LAB,'reports',id+'-c3-offline.json'),4096);
 if(report.schema!==1||report.id!==id||report.status!=='OFFLINE_VERSIONED_LAB_COPY_NOT_LIVE'||report.atomicDatabaseFileSnapshotVerified!==false||report.liveApply!==false||report.haEligible!==false||report.manifestSha256!==digest(next.files)||report.checkpointMetaSha256!==cp.bundleMetaSha256||report.files!==next.fileCount)fail('C3 LAB receipt missing or unsafe');
 const applied=path.join(LAB,'applied',id);await noLinksTo(applied);const now=await scan(applied);
 if(digest(now.files)!==digest(next.files)||now.fileCount!==next.fileCount)fail('Offline applied tree drift/tampering detected');
 return {id,files:now.fileCount,manifestSha256:digest(next.files),receiptSha256:receipt.checkpointSha256,gtidCheckpointPresent:true};
}
async function files(id){await guard();const inspected=await inspectFiles(id),j=await load();
 if(!j||j.phase!=='recovered'||j.file)fail('Capture a new recovered proof before adding one offline file version');
 j.file={...inspected,observedAt:new Date().toISOString()};await writeJournal(j);
 return {...note(j),offlineFilesReverified:inspected.files,notice:'This is an offline candidate only, not atomic DB/filesystem consistency or live replica readiness.'};}
async function report(){await guard();const j=await load();if(!j)return { ...note(null),review:'INCOMPLETE',next:'baseline PRIVATE_PROOF',reminder:'Do not send raw source proof files, GTIDs, tokens or SQL to chat.'};
 let fresh=true,fileVerified=false,problem=null;
 try{
  if(!Number.isFinite(Date.parse(j.createdAt))||Date.now()-Date.parse(j.createdAt)>48*3600*1000||Date.parse(j.createdAt)>Date.now()+5*60*1000)fresh=false;
  if(j.file){const f=await inspectFiles(j.file.id);fileVerified=f.manifestSha256===j.file.manifestSha256&&f.receiptSha256===j.file.receiptSha256;}
 }catch{problem='Offline candidate or private evidence has changed; check locally';}
 const complete=j.phase==='recovered'&&!!j.disconnected&&!!j.recovered?.probeAdvanced&&!!j.file&&fileVerified&&fresh&&!problem;
 return {...note(j),fresh,fileVerified,review:complete?'LAB_EVIDENCE_COMPLETE_HUMAN_REVIEW_REQUIRED':'LAB_EVIDENCE_INCOMPLETE_OR_STALE',reason:problem,offlineFileCount:fileVerified?j.file.files:null,fullDatabaseParityVerified:false,devicePairIndependentlyAuthenticated:false,sourceOutageProbeTimingIndependentlyVerified:false,notice:'Two-node physical Android validation and supervised outage are required. No standby/HA/Primary authorization regardless of outcome.'};}
async function main(){const [cmd,...args]=process.argv.slice(2);let value;
 if(cmd==='baseline'&&args.length===1)value=await baseline(args[0]);
 else if(cmd==='disconnected'&&args.length===0)value=await disconnected();
 else if(cmd==='recovered'&&args.length===2)value=await recovered(args[0],args[1]);
 else if(cmd==='files'&&args.length===1)value=await files(args[0]);
 else if(cmd==='report'&&args.length===0)value=await report();
 else fail('Usage: mhc-full lab-accept baseline PRIVATE_PROOF | disconnected | recovered SECOND_PRIVATE_PROOF --confirm=SECOND_SOURCE_PROBE_CREATED_DURING_OUTAGE | files DELTA_ID | report');
 console.log(JSON.stringify(value,null,2));}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))main().catch(e=>{console.error('MHC_D_LAB_ACCEPT:',e.message);process.exitCode=1});
export {inspectFiles,report};
