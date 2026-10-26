#!/usr/bin/env node
// MHC 0.5C-FENCE — signed, ACTIVE HTTP canary evidence on TWO disposable LAB Termux nodes.
// Never changes HA/Cloudflare/DB/hosting; does NOT demonstrate independent or all-path fencing.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {preflightIdentity,createSignedEnvelope} from './physical-lab-attest.mjs';

const SCOPE='MHC_FENCE_HTTP_LAB_PROBE_NO_HA';
const ORIGINAL_SCOPE='MHC_PHYSICAL_EVIDENCE_LAB_ONLY_NO_HA';
const HTTP_SCOPE='ISOLATED_LOOPBACK_HTTP_WRITE_GATE_LAB_ONLY';
const CHALLENGE=/^[a-f0-9]{48}$/;
const HASH=/^[a-f0-9]{64}$/;
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const PHASES=Object.freeze({'old-denied':{role:'source',expected:503},'new-allowed':{role:'replica',expected:201},'witness-denied':{role:'replica',expected:503}});
const HOME=process.env.HOME||os.homedir();
const ROOT=path.join(HOME,'mhc-physical-lab');
const SECRET=path.join(HOME,'.config/mhc-lab-http-write-gate/http-token');
const MAX_AGE=12*60*1000;
const fail=message=>{throw Error(message)};
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
function readPrivateFile(file,limit=20000){
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size<1||st.size>limit||(process.platform!=='win32'&&(st.mode&0o077))||(process.getuid&&st.uid!==process.getuid()))fail('UNSAFE_PRIVATE_FILE');
 return fs.readFileSync(file,'utf8');
}
function identityFromFile(file){
 const id=JSON.parse(readPrivateFile(file));
 if(id.schema!==1||id.scope!==ORIGINAL_SCOPE||!ID.test(id.nodeId||'')||!HASH.test(id.fingerprint||'')||typeof id.publicKeyPem!=='string')fail('INVALID_PUBLIC_IDENTITY');
 try{if(sha(crypto.createPublicKey(id.publicKeyPem).export({type:'spki',format:'der'}))!==id.fingerprint)fail('PUBLIC_IDENTITY_FINGERPRINT_MISMATCH')}
 catch{fail('PUBLIC_IDENTITY_FINGERPRINT_MISMATCH')}
 return id;
}
function verifyGateResponse(code,body,phase,expectedSha){
 if(!Number.isInteger(code)||typeof body!=='string'||Buffer.byteLength(body)>4096)fail('INVALID_GATE_HTTP_RESPONSE');
 let payload;try{payload=JSON.parse(body)}catch{fail('INVALID_GATE_JSON')}
 if(!payload||payload.scope!==HTTP_SCOPE||payload.productionProtected===true||payload.haEligible===true||typeof payload.status!=='string')fail('NOT_LAB_GATE_RESPONSE');
 const expected=PHASES[phase]?.expected;
 if(!expected)fail('UNKNOWN_LAB_PHASE');
 const statusAllowed=code===201&&payload.status==='ISOLATED_LAB_ARTIFACT_PUBLISHED'&&payload.sha256===expectedSha&&payload.kind==='canary'&&Number.isSafeInteger(payload.epoch);
 const statusDenied=code===503&&payload.status==='WITNESS_OR_LAB_WRITE_DENIED';
 // For negative observations, require a live gateway returning an explicit denial,
 // not a network timeout/401/404/offline service (none prove lease fencing).
 const observed=(statusAllowed?'allowed':statusDenied?'denied':'unverified');
 return {observed,httpStatus:code,gateStatus:payload.status,expected:expected===201?'allowed':'denied',matchesExpected:code===expected&&(expected===201?statusAllowed:statusDenied)};
}
export async function liveCanaryProbe({phase,challenge,token,port=19096,nonce=crypto.randomBytes(16).toString('hex'),timeoutMs=4000}={}){
 if(!PHASES[phase]||!CHALLENGE.test(challenge||'')||!/^[a-f0-9]{64}$/.test(token||'')||!/^[a-f0-9]{32}$/.test(nonce||'')||!Number.isInteger(port)||port<1024||port>65535)fail('INVALID_LAB_PROBE_PARAMETERS');
 // The nonce and challenge bind this real POST to the operator's acceptance run.
 const bytes=Buffer.from(`MHC_LAB_GATE_PROBE:${phase}:${challenge}:${nonce}`,'utf8');
 const expectedSha=sha(bytes);
 const wire=await new Promise((resolve,reject)=>{
  const req=http.request({host:'127.0.0.1',port,method:'POST',path:'/v1/lab/canary',
   agent:false,headers:{authorization:`Bearer ${token}`,'content-type':'application/octet-stream','content-length':bytes.length,'connection':'close'}},res=>{
   let body='',size=0;
   res.on('data',b=>{size+=b.length;if(size>4096){req.destroy(Error('GATE_RESPONSE_TOO_LARGE'));return}body+=b.toString('utf8')});
   res.on('end',()=>resolve({code:res.statusCode,body}));
  });
  req.setTimeout(timeoutMs,()=>req.destroy(Error('LIVE_GATE_TIMEOUT')));
  req.on('error',e=>reject(Error('LIVE_LAB_GATE_NOT_OBSERVED: '+(e.code||'ERROR'))));
  req.end(bytes);
 });
 const result=verifyGateResponse(wire.code,wire.body,phase,expectedSha);
 return {phase,attemptSha256:expectedSha,attemptNonce:nonce,...result};
}
export function signProbe({identity,privateKeyPem,role,phase,challenge,result,at=new Date().toISOString(),bootFingerprint}={}){
 if(!PHASES[phase]||PHASES[phase].role!==role||!CHALLENGE.test(challenge||'')||!identity||!ID.test(identity.nodeId||'')||!HASH.test(identity.fingerprint||'')||!HASH.test(bootFingerprint||''))fail('INVALID_PROBE_SIGNING_METADATA');
 if(result?.phase!==phase||result?.attemptSha256?.length!==64||!HASH.test(result.attemptSha256)||!/^[a-f0-9]{32}$/.test(result.attemptNonce||'')||!['allowed','denied','unverified'].includes(result.observed)||typeof result.matchesExpected!=='boolean')fail('INVALID_PROBE_RESULT');
 const payload={schema:1,scope:SCOPE,nodeId:identity.nodeId,role,phase,challenge,measuredAt:at,bootFingerprint,
  httpStatus:result.httpStatus,gateStatus:result.gateStatus,observed:result.observed,expected:result.expected,
  attemptSha256:result.attemptSha256,attemptNonce:result.attemptNonce,matchesExpected:result.matchesExpected,
  assurances:{loopbackLabCanaryOnly:true,allHostingWritersFenced:false,independentFenceProven:false,
   databaseProtected:false,canSwitchPrimary:false,canArmHA:false}};
 return createSignedEnvelope(payload,privateKeyPem);
}
export function verifyFenceEvidence(envelopes,identities,pins,challenge,now=Date.now()){
 if(!CHALLENGE.test(challenge||'')||!Array.isArray(envelopes)||envelopes.length!==3||!identities?.source||!identities?.replica||!pins||!HASH.test(pins.source||'')||!HASH.test(pins.replica||''))fail('INVALID_FENCE_EVIDENCE_ARGUMENTS');
 const blockers=[];
 if(pins.source===pins.replica)blockers.push('DUPLICATE_SIGNING_KEY_PIN');
 for(const role of ['source','replica']){
  const id=identities[role];
  if(id.fingerprint!==pins[role])blockers.push('UNTRUSTED_'+role.toUpperCase()+'_KEY');
 }
 const phases=Object.keys(PHASES),receipts={};
 for(let i=0;i<3;i++){
  const env=envelopes[i],phase=phases[i],expected=PHASES[phase],p=env?.payload,id=identities[expected.role];
  if(!p||env.signatureScheme!=='Ed25519-v1'||typeof env.signature!=='string'){blockers.push('MISSING_SIGNED_'+phase);continue}
  try{if(!crypto.verify(null,Buffer.from(canonical(p)),id.publicKeyPem,Buffer.from(env.signature,'base64')))blockers.push('INVALID_SIGNATURE_'+phase)}
  catch{blockers.push('INVALID_SIGNATURE_'+phase)}
  if(p.scope!==SCOPE||p.schema!==1||p.phase!==phase||p.role!==expected.role||p.nodeId!==id.nodeId||p.challenge!==challenge)blockers.push('PROBE_IDENTITY_OR_CHALLENGE_'+phase);
  const t=Date.parse(p.measuredAt||'');
  if(!Number.isFinite(t)||t>now+60_000||now-t>MAX_AGE)blockers.push('STALE_OR_FUTURE_'+phase);
  if(!HASH.test(p.bootFingerprint||'')||!HASH.test(p.attemptSha256||'')||!/^[a-f0-9]{32}$/.test(p.attemptNonce||''))blockers.push('MALFORMED_PROBE_'+phase);
  else if(sha(Buffer.from(`MHC_LAB_GATE_PROBE:${phase}:${challenge}:${p.attemptNonce}`,'utf8'))!==p.attemptSha256)blockers.push('NONCE_BODY_HASH_MISMATCH_'+phase);
  const match=expected.expected===201?p.httpStatus===201&&p.observed==='allowed'&&p.gateStatus==='ISOLATED_LAB_ARTIFACT_PUBLISHED'
   :p.httpStatus===503&&p.observed==='denied'&&p.gateStatus==='WITNESS_OR_LAB_WRITE_DENIED';
  if(!match||p.matchesExpected!==true||p.expected!==(expected.expected===201?'allowed':'denied'))blockers.push('GATE_BEHAVIOR_UNEXPECTED_'+phase);
  if(p.assurances?.canSwitchPrimary!==false||p.assurances?.canArmHA!==false||p.assurances?.loopbackLabCanaryOnly!==true||p.assurances?.allHostingWritersFenced!==false)blockers.push('FALSE_AUTHORITY_CLAIM_'+phase);
  receipts[phase]=p;
 }
 const a=receipts['old-denied'],b=receipts['new-allowed'],c=receipts['witness-denied'];
 if(a&&b&&c){
  if(new Set([a.attemptNonce,b.attemptNonce,c.attemptNonce]).size!==3)blockers.push('REPLAYED_PROBE_NONCE');
  if(!(Date.parse(a.measuredAt)<Date.parse(b.measuredAt)&&Date.parse(b.measuredAt)<Date.parse(c.measuredAt)))blockers.push('INVALID_PROBE_ORDER');
  if(a.bootFingerprint===b.bootFingerprint)blockers.push('SAME_BOOT_INSTANCE_ACROSS_NODES');
  if(b.bootFingerprint!==c.bootFingerprint)blockers.push('REPLICA_BOOT_CHANGED_DURING_PROBE');
 }
 const unique=[...new Set(blockers)];
 return {scope:SCOPE,mode:'SIGNED_ACTIVE_LOOPBACK_CANARY_OBSERVATIONS_ONLY',signedLabCanarySequenceObserved:unique.length===0,
  blockerCount:unique.length,blockers:unique,coverage:{oldLabCanaryDenied:!!a&&a.httpStatus===503,newLabCanaryAccepted:!!b&&b.httpStatus===201,
   witnessOutageLabCanaryDenied:!!c&&c.httpStatus===503},limitations:{signedByPinnedKeysOnly:true,physicalDeviceIndependenceProven:false,
   independentlyEnforcedFencingProven:false,mariaDbWritesProtected:false,allHostingWritesProtected:false,
   cloudflareRoutingVerified:false,canSwitchPrimary:false,canArmHA:false},
  notice:'Only one disposable localhost HTTP canary route is exercised. Even PASS cannot authorize real switchover, protect MariaDB or prove independent fencing.'};
}
function bootFingerprint(){
 const boot=fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();
 if(!ID.test(boot))fail('LIVE_BOOT_ID_UNAVAILABLE');return sha(boot);
}
export async function captureLive(role,phase,challenge,confirm){
 if(confirm!=='--confirm=DISPOSABLE_LAB_CANARY_PROBE'||!PHASES[phase]||PHASES[phase].role!==role||!CHALLENGE.test(challenge||''))fail('LAB_CONFIRMATION_REQUIRED');
 // Real isolated Termux preflight, refuses registered websites, HA, and production footprints.
 const preflight=preflightIdentity();
 if(preflight.status!=='ISOLATED_LAB_PREFLIGHT_PASS'||preflight.canSwitchPrimary!==false)fail('ISOLATED_LAB_PREFLIGHT_FAILED');
 const dir=path.dirname(SECRET),stat=fs.lstatSync(dir);
 if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077))fail('UNSAFE_GATE_CONFIG_DIRECTORY');
 const token=readPrivateFile(SECRET,128).trim();
 const result=await liveCanaryProbe({role,phase,challenge,token});
 const privateKeyPem=readPrivateFile(path.join(ROOT,'private-key.pem'),20000);
 // Verify the installed identity matches its private key before signing.
 const derived=sha(crypto.createPublicKey(privateKeyPem).export({type:'spki',format:'der'}));
 if(derived!==preflight.identity.fingerprint)fail('IDENTITY_KEY_PAIR_MISMATCH');
 const signed=signProbe({identity:preflight.identity,privateKeyPem,role,phase,challenge,result,bootFingerprint:bootFingerprint()});
 const filename=`fence-${role}-${phase}-${challenge.slice(0,16)}.json`,out=path.join(ROOT,filename);
 fs.writeFileSync(out,JSON.stringify(signed,null,2)+'\n',{flag:'wx',mode:0o600});
 return {status:result.matchesExpected?'SIGNED_LIVE_LAB_GATE_OBSERVED':'UNEXPECTED_LAB_GATE_BEHAVIOR_RECORDED',
  role,phase,file:out,observed:result.observed,httpStatus:result.httpStatus,proofScope:'LAB_HTTP_CANARY_ONLY',canSwitchPrimary:false};
}
function plan(){return {release:'TEST 0.5.0C-FENCE-PROBE',scope:SCOPE,mode:'ACTIVE_ISOLATED_LAB_HTTP_CANARY',
  phases:['source old-denied','replica new-allowed','replica witness-denied'],
  capture:'mhc-full fence-probe capture ROLE PHASE CHALLENGE --confirm=DISPOSABLE_LAB_CANARY_PROBE',
  verify:'mhc-full fence-probe verify OLD_JSON NEW_JSON WITNESS_JSON SOURCE_PUB_JSON REPLICA_PUB_JSON CHALLENGE SOURCE_PIN REPLICA_PIN',
  sideEffect:'ONLY creates one new canary LAB file when gateway accepts (new-allowed); rejection cases must return HTTP 503 from a live gateway',
  notProven:['independent hard fencing','all app and DB writers gated','Cloudflare routing','two physical Android independent','safe switchover'],
  canSwitchPrimary:false,canArmHA:false};}
function verifyFiles(args){
 const [oldFile,newFile,witnessFile,sourceIdFile,replicaIdFile,challenge,sourcePin,replicaPin]=args;
 const identities={source:identityFromFile(sourceIdFile),replica:identityFromFile(replicaIdFile)};
 const envelopes=[oldFile,newFile,witnessFile].map(p=>JSON.parse(readPrivateFile(p)));
 return verifyFenceEvidence(envelopes,identities,{source:sourcePin,replica:replicaPin},challenge);
}
async function main(){const [cmd,...args]=process.argv.slice(2);
 if(cmd==='plan'&&args.length===0)return console.log(JSON.stringify(plan(),null,2));
 if(cmd==='capture'&&args.length===4){const r=await captureLive(...args);console.log(JSON.stringify(r,null,2));if(r.status!=='SIGNED_LIVE_LAB_GATE_OBSERVED')process.exitCode=1;return}
 if(cmd==='verify'&&args.length===8){const r=verifyFiles(args);console.log(JSON.stringify(r,null,2));if(!r.signedLabCanarySequenceObserved)process.exitCode=1;return}
 fail('Usage: fence-probe plan | capture ROLE PHASE CHALLENGE --confirm=DISPOSABLE_LAB_CANARY_PROBE | verify OLD_JSON NEW_JSON WITNESS_JSON SOURCE_PUB_JSON REPLICA_PUB_JSON CHALLENGE SOURCE_PIN REPLICA_PIN');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('FENCE_PROBE_DENIED:',e.message);process.exitCode=1});
