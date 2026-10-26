#!/usr/bin/env node
// MHC TEST 0.5.0C-WRITER-AUDIT — two-node signed LAB observations; NEVER grants writer authority.
// Node public keys must be pinned OUT OF BAND. Signatures prove control of keys, not device hardware or fencing.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {probeGtid} from './replication-observer.mjs';
import {labStatus} from './gtid-lab.mjs';

const ROOT=path.join(process.env.HOME||os.homedir(),'mhc-physical-lab');
const CFG=path.join(process.env.HOME||os.homedir(),'.config/mhc-full-installer');
const SCOPE='MHC_PHYSICAL_EVIDENCE_LAB_ONLY_NO_HA';
const CHALLENGE=/^[a-f0-9]{48}$/;
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HASH=/^[a-f0-9]{64}$/;
const GTID=/^\d{1,10}-\d{1,10}-\d{1,20}(?:,\d{1,10}-\d{1,10}-\d{1,20})*$/;
const MAX_AGE_MS=15*60*1000,MAX_FILES=3000,MAX_BYTES=256*1024*1024,MAX_FILE=32*1024*1024;
const blockers=(...names)=>names.filter(Boolean);
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const bad=msg=>{throw Error(msg)};
function canonical(obj){if(Array.isArray(obj))return '['+obj.map(canonical).join(',')+']';if(obj&&typeof obj==='object')return '{'+Object.keys(obj).sort().map(k=>JSON.stringify(k)+':'+canonical(obj[k])).join(',')+'}';return JSON.stringify(obj);}
function statSafe(p,type,privateMode=true){const s=fs.lstatSync(p);
 if(s.isSymbolicLink()||(type==='dir'?!s.isDirectory():!s.isFile()))bad('Unsafe file/directory type');
 if(privateMode&&(s.mode&0o077)!==0)bad('Private LAB path must have 0700/0600 permissions');
 if(type==='file'&&(s.size>20000||s.size<1))bad('Unexpected private evidence file size');return s;
}
function labGuard({requireTermux=true}={}){
 const home=process.env.HOME||os.homedir();
 if(requireTermux&&(process.env.PREFIX!=='/data/data/com.termux/files/usr'||process.arch!=='arm64'))bad('Dedicated aarch64 Termux LAB required');
 if(fs.existsSync(path.join(home,'apps/thophuongpro/.env'))||fs.existsSync(path.join(home,'.config/mini-hosting-cluster/ha.json'))||
  fs.existsSync(path.join(home,'.config/mini-hosting-cluster/node.json'))||fs.existsSync(path.join(CFG,'install-incomplete')))
  bad('STOP: production, HA or incomplete installer detected');
 for(const dir of [path.join(CFG,'sites'),path.join(CFG,'static'),path.join(home,'websites')]){
  if(fs.existsSync(dir)&&(!fs.lstatSync(dir).isDirectory()||fs.lstatSync(dir).isSymbolicLink()||fs.readdirSync(dir).length>0))bad('STOP: existing website or unsafe site registry');
 }
 const marker=path.join(CFG,'installed');statSafe(marker,'file');
 if(!/^TEST 0\.(?:3\.|4\.|5\.)/.test(fs.readFileSync(marker,'utf8')))bad('Unrecognized LAB install marker');
 if(fs.existsSync(ROOT))statSafe(ROOT,'dir');
 return true;
}
function ensureRoot(){if(!fs.existsSync(ROOT))fs.mkdirSync(ROOT,{mode:0o700});statSafe(ROOT,'dir');return ROOT;}
function publicIdentity(identity){return {schema:1,scope:SCOPE,nodeId:identity.nodeId,publicKeyPem:identity.publicKeyPem,
 fingerprint:sha(crypto.createPublicKey(identity.publicKeyPem).export({type:'spki',format:'der'}))};}
export function generateIdentity(){const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
 const nodeId=crypto.randomUUID(),publicKeyPem=publicKey.export({type:'spki',format:'pem'}),identity=publicIdentity({nodeId,publicKeyPem});
 return {identity,privateKeyPem:privateKey.export({type:'pkcs8',format:'pem'})};}
function init(){labGuard();ensureRoot();const {identity,privateKeyPem}=generateIdentity();
 const outputs=[['identity-public.json',JSON.stringify(identity,null,2)+'\n'],['private-key.pem',privateKeyPem]];
 const created=[];
 try{for(const [name,data] of outputs){const p=path.join(ROOT,name);fs.writeFileSync(p,data,{flag:'wx',mode:0o600});created.push(p)}}
 catch(e){for(const p of created)fs.unlinkSync(p);throw e;}
 return {status:'LAB_IDENTITY_CREATED',publicIdentityFile:path.join(ROOT,'identity-public.json'),fingerprint:identity.fingerprint,
  nodeId:identity.nodeId,privateKeyNeverExport:true,canSwitchPrimary:false,
  note:'PIN the public file fingerprint out of band on the verifier; never send private-key.pem.'};
}
function readJson(p,max=20000){const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.size>max||s.size<2)bad('Invalid evidence file');return JSON.parse(fs.readFileSync(p,'utf8'));}
function bootFingerprint(){try{const s=fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();return ID.test(s)?sha(s):null}catch{return null}}
export async function scanFixture(root){statSafe(root,'dir');let count=0,bytes=0;const items=[];
 async function walk(base,rel,depth){if(depth>12)bad('Too deep fixture tree');
  for(const name of (await fsp.readdir(base)).sort()){
   if(name==='.'||name==='..'||name.includes('\0')||name.includes('\n'))bad('Bad fixture name');
   const r=rel?rel+'/'+name:name,p=path.join(base,name),st=await fsp.lstat(p);
   if(st.isSymbolicLink())bad('Symlink forbidden in physical LAB fixture');
   if(st.isDirectory()){if((st.mode&0o022)!==0)bad('Writable fixture directory');await walk(p,r,depth+1);continue;}
   if(!st.isFile())bad('Special file forbidden');if(st.size>MAX_FILE||bytes+st.size>MAX_BYTES||++count>MAX_FILES)bad('Fixture limits exceeded');
   const fd=await fsp.open(p,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let digest;
   try{const before=await fd.stat();if(before.ino!==st.ino||before.dev!==st.dev||before.size!==st.size)bad('Fixture changed during scan');
    const h=crypto.createHash('sha256');for await(const part of fd.createReadStream({autoClose:false}))h.update(part);digest=h.digest('hex');
    const after=await fd.stat();if(before.mtimeMs!==after.mtimeMs||before.size!==after.size||before.ino!==after.ino)bad('Fixture changed during scan');
   }finally{await fd.close().catch(()=>{})}
   bytes+=st.size;items.push([r,st.size,digest]);
  }
 }
 await walk(root,'',0);if(count===0)bad('No LAB fixture files to compare');
 return {observed:true,fileCount:count,totalBytes:bytes,treeSha256:sha(canonical(items))};
}
export function createSignedEnvelope(payload,privateKeyPem){
 const key=crypto.createPrivateKey(privateKeyPem),signature=crypto.sign(null,Buffer.from(canonical(payload)),key).toString('base64');
 return {payload,signature,signatureScheme:'Ed25519-v1'};
}
export function verifyEnvelope(envelope,identity,challenge,now=Date.now()){
 const failures=[];
 if(!envelope||!envelope.payload||envelope.signatureScheme!=='Ed25519-v1'||typeof envelope.signature!=='string')return {ok:false,failures:['INVALID_ENVELOPE']};
 const p=envelope.payload;
 if(identity?.scope!==SCOPE||identity?.schema!==1||!ID.test(identity?.nodeId||'')||typeof identity?.publicKeyPem!=='string')failures.push('UNTRUSTED_IDENTITY_FILE');
 else try{const fp=sha(crypto.createPublicKey(identity.publicKeyPem).export({type:'spki',format:'der'}));
  if(fp!==identity.fingerprint)failures.push('PINNED_KEY_FINGERPRINT_MISMATCH');
  else if(!crypto.verify(null,Buffer.from(canonical(p)),identity.publicKeyPem,Buffer.from(envelope.signature,'base64')))failures.push('BAD_SIGNATURE');
 }catch{failures.push('BAD_SIGNATURE_OR_KEY')}
 if(p.schema!==1||p.scope!==SCOPE||p.nodeId!==identity?.nodeId)failures.push('IDENTITY_OR_SCOPE_MISMATCH');
 if(p.challenge!==challenge||!CHALLENGE.test(challenge||''))failures.push('CHALLENGE_MISMATCH');
 if(!['source','replica'].includes(p.role))failures.push('INVALID_ROLE');
 if(typeof p.measuredAt!=='string'||!Number.isFinite(Date.parse(p.measuredAt))||Math.abs(now-Date.parse(p.measuredAt))>MAX_AGE_MS)failures.push('STALE_OR_FUTURE_EVIDENCE');
 if(!p.file?.observed||!HASH.test(p.file.treeSha256||'')||!(p.file.fileCount>0))failures.push('FILE_EVIDENCE_MISSING');
 if(!p.maria?.observed||!Number.isSafeInteger(p.maria.serverId)||p.maria.serverId<1)failures.push('LIVE_MARIADB_NOT_OBSERVED');
 if(p.guard?.isolatedLab!==true)failures.push('LAB_GUARD_NOT_ATTESTED');
 return {ok:failures.length===0,failures};
}
export function compareEvidence(source,replica,sourceIdentity,replicaIdentity,challenge,now=Date.now()){
 const a=verifyEnvelope(source,sourceIdentity,challenge,now),b=verifyEnvelope(replica,replicaIdentity,challenge,now);
 const blockers=[...a.failures.map(x=>'SOURCE_'+x),...b.failures.map(x=>'REPLICA_'+x)];
 const x=source?.payload||{},y=replica?.payload||{};
 if(x.role!=='source'||y.role!=='replica')blockers.push('ROLE_ORDER_INVALID');
 if(x.nodeId===y.nodeId||sourceIdentity?.fingerprint===replicaIdentity?.fingerprint)blockers.push('SAME_SIGNING_IDENTITY');
 if(!HASH.test(x.bootFingerprint||'')||!HASH.test(y.bootFingerprint||''))blockers.push('DISTINCT_HOST_BOOT_NOT_OBSERVABLE');
 else if(x.bootFingerprint===y.bootFingerprint)blockers.push('SAME_BOOT_INSTANCE');
 if(x.maria?.serverId===y.maria?.serverId)blockers.push('SAME_MARIADB_SERVER_ID');
 if(x.maria?.readOnly!==false)blockers.push('SOURCE_NOT_OBSERVED_READ_WRITE');
 if(y.maria?.readOnly!==true)blockers.push('REPLICA_NOT_OBSERVED_READ_ONLY');
 if(y.maria?.channelCount!==1||y.maria?.ioRunning!==true||y.maria?.sqlRunning!==true||y.maria?.usingGtid!=='SLAVE_POS')blockers.push('REPLICA_THREADS_NOT_OBSERVED_HEALTHY');
 const gtidMatch=GTID.test(x.maria?.gtidBinlogPos||'')&&x.maria.gtidBinlogPos===y.maria?.gtidSlavePos;
 if(!gtidMatch)blockers.push('GTID_POSITIONS_NOT_EQUAL');
 const fileMatch=HASH.test(x.file?.treeSha256||'')&&x.file.treeSha256===y.file?.treeSha256&&x.file.fileCount===y.file?.fileCount&&x.file.totalBytes===y.file?.totalBytes;
 if(!fileMatch)blockers.push('FILE_FIXTURE_NOT_EQUAL');
 const distinctKeys=sourceIdentity?.fingerprint!==replicaIdentity?.fingerprint&&x.nodeId!==y.nodeId;
 return {scope:SCOPE,mode:'SIGNED_TWO_NODE_OBSERVATION_NOT_SWITCHOVER',verifiedSignatures:a.ok&&b.ok,
  distinctSigningKeys:distinctKeys,distinctBootInstances:!!(x.bootFingerprint&&y.bootFingerprint&&x.bootFingerprint!==y.bootFingerprint),
  gtidPositionsMatched:gtidMatch,fileFixtureMatched:fileMatch,blockerCount:blockers.length,blockers,
  observationGatePassed:blockers.length===0,physicalHardwareIndependenceProven:false,
  independentFencingProven:false,actualTwoTransactionRecoveryProven:false,sqlDataEqualityProven:false,
  atomicDbFileSnapshotProven:false,liveWitnessProven:false,allWritePathsProtected:false,
  canSwitchPrimary:false,canModifyRouting:false,canArmHA:false,
  note:'Signed read-only observations can identify key holders and one boot session per host; they do NOT prove separate physical devices, atomic replication, independent fencing, or writer authority.'};
}
export async function liveCapture(role,challenge){
 labGuard();if(!['source','replica'].includes(role)||!CHALLENGE.test(challenge||''))bad('Role or challenge invalid');
 const identity=readJson(path.join(ROOT,'identity-public.json'));statSafe(path.join(ROOT,'private-key.pem'),'file');
 const privateKey=fs.readFileSync(path.join(ROOT,'private-key.pem'),'utf8');
 if(sha(crypto.createPublicKey(privateKey).export({type:'spki',format:'der'}))!==identity.fingerprint)bad('Private key does not match pinned LAB public identity');
 const root=path.join(ROOT,'share'),file=await scanFixture(root),gtid=await probeGtid(),receiver=await labStatus();
 if(!gtid.observed||!Number.isSafeInteger(gtid.serverId)||gtid.serverId<1)bad('Live local MariaDB GTID could not be observed');
 const ch=receiver.channels?.[0];
 const payload={schema:1,scope:SCOPE,nodeId:identity.nodeId,role,challenge,measuredAt:new Date().toISOString(),bootFingerprint:bootFingerprint(),
  file,maria:{observed:true,serverId:gtid.serverId,readOnly:gtid.readOnly,binaryLogEnabled:gtid.binaryLogEnabled,
  gtidBinlogPos:gtid.gtidBinlogPos,gtidSlavePos:gtid.gtidSlavePos,channelCount:receiver.channelCount,
  ioRunning:ch?.ioRunning===true,sqlRunning:ch?.sqlRunning===true,usingGtid:ch?.usingGtid||'NONE_OR_UNKNOWN'},
  guard:{isolatedLab:true},authority:{canSwitchPrimary:false,actualFencingVerified:false,haEligible:false}};
 const envelope=createSignedEnvelope(payload,privateKey),save=path.join(ROOT,`${role}-${challenge.slice(0,16)}.json`);
 fs.writeFileSync(save,JSON.stringify(envelope,null,2)+'\n',{mode:0o600,flag:'wx'});
 return {status:'SIGNED_OBSERVATION_RECORDED',evidenceFile:save,role,nodeId:identity.nodeId,gtidObserved:true,fileCount:file.fileCount,
  canSwitchPrimary:false,note:'Copy signed evidence and pinned public identity to offline verifier; never copy the private key.'};
}
export function verifyFiles(sourceFile,replicaFile,sourceKeyFile,replicaKeyFile,challenge,expectedSourceFingerprint,expectedReplicaFingerprint,now=Date.now()){
 if(!CHALLENGE.test(challenge||'')||!HASH.test(expectedSourceFingerprint||'')||!HASH.test(expectedReplicaFingerprint||'')||expectedSourceFingerprint===expectedReplicaFingerprint)bad('Invalid challenge or independent, manually pinned public key fingerprints');
 const a=readJson(sourceFile),b=readJson(replicaFile),ka=readJson(sourceKeyFile),kb=readJson(replicaKeyFile);
 if(ka.fingerprint!==expectedSourceFingerprint||kb.fingerprint!==expectedReplicaFingerprint)bad('Pinned public fingerprint does not match trusted operator input');
 return compareEvidence(a,b,ka,kb,challenge,now);
}
// Read-only preflight for an independently pinned, SSH-reachable disposable LAB device.
export function preflightIdentity(){
 labGuard();statSafe(ROOT,'dir');
 const identity=readJson(path.join(ROOT,'identity-public.json'));
 statSafe(path.join(ROOT,'private-key.pem'),'file');
 const privateKey=fs.readFileSync(path.join(ROOT,'private-key.pem'),'utf8');
 if(identity.scope!==SCOPE||identity.schema!==1||!ID.test(identity.nodeId||''))bad('Invalid LAB identity');
 const derived=publicIdentity({nodeId:identity.nodeId,publicKeyPem:identity.publicKeyPem});
 if(derived.fingerprint!==identity.fingerprint||sha(crypto.createPublicKey(privateKey).export({type:'spki',format:'der'}))!==identity.fingerprint)
  bad('LAB keypair mismatch');
 statSafe(path.join(ROOT,'share'),'dir');
 return {status:'ISOLATED_LAB_PREFLIGHT_PASS',scope:SCOPE,identity,bootFingerprint:bootFingerprint(),
  captureAvailable:true,canSwitchPrimary:false,canArmHA:false,canModifyRouting:false};
}
function plan(){return {scope:SCOPE,release:'TEST 0.5.0C-WRITER-AUDIT',
  commands:['plan','preflight','challenge','keygen --confirm=CREATE_DISPOSABLE_LAB_IDENTITY','capture source|replica CHALLENGE','verify SOURCE_JSON REPLICA_JSON SOURCE_PUBLIC_JSON REPLICA_PUBLIC_JSON CHALLENGE SOURCE_PINNED_SHA256 REPLICA_PINNED_SHA256'],
  isolation:'Requires standard aarch64 Termux with no site/prod/HA footprint, private key and dedicated mhc-physical-lab/share fixture',
  signedEvidence:true,liveMariaDbReadOnly:true,liveFileDigest:true,physicalDevicesNotRemotelyAuthenticated:true,
  productionAffected:false,canSwitchPrimary:false,haEligible:false};}
async function main(){const [cmd,...args]=process.argv.slice(2);
 if(cmd==='plan'&&args.length===0)return console.log(JSON.stringify(plan(),null,2));
 if(cmd==='preflight'&&args.length===0)return console.log(JSON.stringify(preflightIdentity(),null,2));
 if(cmd==='challenge'&&args.length===0)return console.log(crypto.randomBytes(24).toString('hex'));
 if(cmd==='keygen'&&args.join(' ')==='--confirm=CREATE_DISPOSABLE_LAB_IDENTITY')return console.log(JSON.stringify(init(),null,2));
 if(cmd==='capture'&&args.length===2)return console.log(JSON.stringify(await liveCapture(args[0],args[1]),null,2));
 if(cmd==='verify'&&args.length===7){const result=verifyFiles(...args);console.log(JSON.stringify(result,null,2));if(result.blockerCount)process.exitCode=1;return;} 
 bad('Usage: physical-accept plan|preflight|challenge|keygen --confirm=CREATE_DISPOSABLE_LAB_IDENTITY|capture source|replica CHALLENGE|verify SOURCE_JSON REPLICA_JSON SOURCE_PUB REPLICA_PUB CHALLENGE SOURCE_PINNED_SHA256 REPLICA_PINNED_SHA256');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('PHYSICAL_LAB_ERROR:',e.message);process.exitCode=1});
