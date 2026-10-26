// TEST 0.5.0B — OFFLINE lease/term/fencing fault model ONLY.
// NO MariaDB/SSH/Cloudflare/network, HA arms, runit controls or real writer permissions.
// A model pass proves only these deterministic assertions, NOT split-brain prevention.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const SCOPE='MHC_OFFLINE_FENCING_LEASE_FAULT_LAB_ONLY';
export const CONFIRM='--confirm=OFFLINE_FAULT_MODEL_NO_REAL_AUTHORITY';
export const TTL_MS=30000;
const HOME=process.env.HOME||os.homedir();
const REPORT_DIR=path.join(HOME,'mhc-fencing-lab');
const REPORT=path.join(REPORT_DIR,'report.json');
const UUID=/^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
const fail=(m)=>{throw Error(m)};
function assert(condition,message){if(!condition)fail(message)}
export function fresh(){return {schema:1,scope:SCOPE,clockMs:0,epoch:0,phase:'EMPTY',owner:null,lastOwner:null,leaseUntilMs:null,fencedEpoch:0};}
const immutableState=s=>structuredClone(s);
function shape(s){
 assert(s&&typeof s==='object'&&s.schema===1&&s.scope===SCOPE,'Not an offline LAB state');
 assert(Number.isSafeInteger(s.clockMs)&&s.clockMs>=0&&Number.isSafeInteger(s.epoch)&&s.epoch>=0,'Invalid epoch/clock');
 assert(['EMPTY','LEASED','UNCERTAIN','FENCED'].includes(s.phase),'Invalid phase');
 assert((s.owner===null||UUID.test(s.owner))&&(s.lastOwner===null||UUID.test(s.lastOwner)),'Invalid simulated node');
 assert(s.leaseUntilMs===null||(Number.isSafeInteger(s.leaseUntilMs)&&s.leaseUntilMs>=0),'Invalid lease deadline');
 assert(Number.isSafeInteger(s.fencedEpoch)&&s.fencedEpoch>=0&&s.fencedEpoch<=s.epoch,'Invalid fence epoch');
}
const controlsOk=c=>c?.witnessOnline===true&&c?.edgeTermGate===true&&c?.watchdogAlive===true&&c?.originTermGate===true;
export function writeAllowed(s,node,term,now,c){
 shape(s);
 // The model does NOT control all write paths: this is only a synthetic gate.
 return s.phase==='LEASED'&&s.owner===node&&s.epoch===term&&
  Number.isSafeInteger(now)&&now>=s.clockMs&&now<s.leaseUntilMs&&controlsOk(c);
}
export function transition(input,action,now,controls={}){
 shape(input);assert(action&&typeof action==='object','Invalid action');
 assert(Number.isSafeInteger(now)&&now>=input.clockMs,'CLOCK_ROLLBACK_OR_INVALID_TIME');
 const s=immutableState(input);s.clockMs=now;
 // Safety requires all observed gates for a new lease/renewal. A stale or
 // unreachable witness is never equivalent to a revoked previous writer.
 if(action.type==='INITIAL_GRANT'){
  assert(s.phase==='EMPTY'&&s.epoch===0,'INITIAL_ONLY_ON_EMPTY_CLUSTER');
  assert(controlsOk(controls),'WITNESS_AND_ALL_WRITE_GATES_REQUIRED');
  assert(UUID.test(action.node),'BAD_NODE');
  s.epoch=1;s.phase='LEASED';s.owner=action.node;s.lastOwner=action.node;s.leaseUntilMs=now+TTL_MS;return s;
 }
 if(action.type==='RENEW'){
  assert(controlsOk(controls),'LEASE_RENEW_FAIL_CLOSED');
  assert(s.phase==='LEASED'&&s.owner===action.node&&s.epoch===action.term&&now<s.leaseUntilMs,'STALE_OR_EXPIRED_RENEWAL');
  s.leaseUntilMs=now+TTL_MS;return s;
 }
 if(action.type==='TICK'){
  if(s.phase==='LEASED'&&now>=s.leaseUntilMs){s.phase='UNCERTAIN';s.lastOwner=s.owner;s.owner=null;s.leaseUntilMs=null;}
  return s;
 }
 if(action.type==='RELEASE'){
  assert(controls.witnessOnline===true,'WITNESS_REQUIRED_FOR_RELEASE');
  assert(s.phase==='LEASED'&&s.owner===action.node&&s.epoch===action.term&&now<s.leaseUntilMs,'NOT_CURRENT_OWNER');
  assert(controls.ingressStopped===true&&controls.dbReadOnly===true&&controls.drained===true,'SOURCE_QUIESCE_NOT_ATTESTED');
  s.phase='UNCERTAIN';s.lastOwner=s.owner;s.owner=null;s.leaseUntilMs=null;return s;
 }
 if(action.type==='FENCE_ACK'){
  assert(s.phase==='UNCERTAIN','NO_OUTSTANDING_OWNER_TO_FENCE');
  assert(controls.witnessOnline===true&&controls.independentFenceConfirmed===true&&controls.edgeTermRevoked===true&&controls.oldOriginBlocked===true&&controls.oldDbReadOnly===true,'INDEPENDENT_FENCE_NOT_CONFIRMED');
  assert(action.fencedNode===s.lastOwner&&action.term===s.epoch,'STALE_FENCE_ACK');
  s.fencedEpoch=s.epoch;s.phase='FENCED';return s;
 }
 if(action.type==='PROMOTE'){
  assert(s.phase==='FENCED'&&s.fencedEpoch===s.epoch,'FENCING_BEFORE_PROMOTION_REQUIRED');
  assert(UUID.test(action.node)&&action.node!==s.lastOwner,'TARGET_MUST_DIFFER');
  assert(controlsOk(controls)&&controls.dataCaughtUp===true&&controls.fileCheckpointMatches===true&&controls.targetBootGate===true,'DATA_OR_WRITER_GATE_INCOMPLETE');
  s.epoch++;s.phase='LEASED';s.owner=action.node;s.lastOwner=action.node;s.leaseUntilMs=now+TTL_MS;return s;
 }
 fail('UNKNOWN_OFFLINE_ACTION');
}
const C=Object.freeze({witnessOnline:true,edgeTermGate:true,watchdogAlive:true,originTermGate:true});
function expectedBlock(fn){try{fn();return false}catch{return true}}
// Each scenario has explicit expectations, not just a successful script exit.
export function scenarios(){
 const results=[];const check=(name,test)=>results.push({name,passed:test===true});
 const a='lab_A',b='lab_B';const s0=fresh();
 check('no-writer-before-first-grant',!writeAllowed(s0,a,1,0,C));
 check('initial-grant-blocked-without-witness',expectedBlock(()=>transition(s0,{type:'INITIAL_GRANT',node:a},0,{...C,witnessOnline:false})));
 check('initial-grant-blocked-without-origin-gate',expectedBlock(()=>transition(s0,{type:'INITIAL_GRANT',node:a},0,{...C,originTermGate:false})));
 const s1=transition(s0,{type:'INITIAL_GRANT',node:a},100,C);
 check('single-synthetic-holder',writeAllowed(s1,a,1,100,C)&&!writeAllowed(s1,b,1,100,C));
 check('competing-grant-blocked',expectedBlock(()=>transition(s1,{type:'INITIAL_GRANT',node:b},101,C)));
 check('expired-term-cannot-write',!writeAllowed(s1,a,1,30100,C));
 check('lost-witness-blocks-write',!writeAllowed(s1,a,1,200,{...C,witnessOnline:false}));
 check('dead-watchdog-blocks-write',!writeAllowed(s1,a,1,200,{...C,watchdogAlive:false}));
 check('edge-term-gate-off-blocks-write',!writeAllowed(s1,a,1,200,{...C,edgeTermGate:false}));
 check('origin-term-gate-off-blocks-write',!writeAllowed(s1,a,1,200,{...C,originTermGate:false}));
 check('wrong-term-blocked',!writeAllowed(s1,a,2,200,C));
 check('renew-after-expiry-blocked',expectedBlock(()=>transition(s1,{type:'RENEW',node:a,term:1},30100,C)));
 check('clock-rollback-blocked',expectedBlock(()=>transition(s1,{type:'TICK'},99,C)));
 const uncertain=transition(s1,{type:'TICK'},30100,C);
 check('expiry-produces-uncertain-not-free',uncertain.phase==='UNCERTAIN'&&uncertain.owner===null&&uncertain.epoch===1);
 check('no-takeover-without-fence',expectedBlock(()=>transition(uncertain,{type:'PROMOTE',node:b},30200,{...C,dataCaughtUp:true,fileCheckpointMatches:true,targetBootGate:true})));
 check('fence-needs-independent-proof',expectedBlock(()=>transition(uncertain,{type:'FENCE_ACK',fencedNode:a,term:1},30200,{...C,independentFenceConfirmed:false})));
 const proof={...C,independentFenceConfirmed:true,edgeTermRevoked:true,oldOriginBlocked:true,oldDbReadOnly:true};
 check('wrong-fence-term-rejected',expectedBlock(()=>transition(uncertain,{type:'FENCE_ACK',fencedNode:a,term:2},30200,proof)));
 const fenced=transition(uncertain,{type:'FENCE_ACK',fencedNode:a,term:1},30200,proof);
 check('fenced-but-no-writer',!writeAllowed(fenced,a,1,30200,C)&&fenced.phase==='FENCED');
 check('promotion-needs-catchup',expectedBlock(()=>transition(fenced,{type:'PROMOTE',node:b},30201,{...C,dataCaughtUp:false,fileCheckpointMatches:true,targetBootGate:true})));
 check('promotion-needs-file-consistency',expectedBlock(()=>transition(fenced,{type:'PROMOTE',node:b},30201,{...C,dataCaughtUp:true,fileCheckpointMatches:false,targetBootGate:true})));
 check('promotion-needs-boot-gate',expectedBlock(()=>transition(fenced,{type:'PROMOTE',node:b},30201,{...C,dataCaughtUp:true,fileCheckpointMatches:true,targetBootGate:false})));
 const after=transition(fenced,{type:'PROMOTE',node:b},30201,{...C,dataCaughtUp:true,fileCheckpointMatches:true,targetBootGate:true});
 check('new-epoch-and-exclusive-synthetic-holder',after.epoch===2&&writeAllowed(after,b,2,30201,C)&&!writeAllowed(after,a,1,30201,C));
 check('replay-old-renew-rejected',expectedBlock(()=>transition(after,{type:'RENEW',node:a,term:1},30202,C)));
 check('duplicate-promote-rejected',expectedBlock(()=>transition(after,{type:'PROMOTE',node:a},30202,{...C,dataCaughtUp:true,fileCheckpointMatches:true,targetBootGate:true})));
 check('only-current-owner-can-release',expectedBlock(()=>transition(after,{type:'RELEASE',node:a,term:1},30202,{...C,ingressStopped:true,dbReadOnly:true,drained:true})));
 check('release-must-drain',expectedBlock(()=>transition(after,{type:'RELEASE',node:b,term:2},30202,{...C,ingressStopped:true,dbReadOnly:true,drained:false})));
 const rel=transition(after,{type:'RELEASE',node:b,term:2},30202,{...C,ingressStopped:true,dbReadOnly:true,drained:true});
 check('graceful-release-still-not-free',rel.phase==='UNCERTAIN'&&!writeAllowed(rel,b,2,30202,C));
 check('witness-outage-disallows-fence',expectedBlock(()=>transition(rel,{type:'FENCE_ACK',fencedNode:b,term:2},30203,{...proof,witnessOnline:false})));
 check('no-failback-without-fresh-fence',expectedBlock(()=>transition(rel,{type:'PROMOTE',node:a},30203,{...C,dataCaughtUp:true,fileCheckpointMatches:true,targetBootGate:true})));
 return {scope:SCOPE,scenarioCount:results.length,passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).map(x=>x.name),results,
  allSyntheticChecksPassed:results.every(x=>x.passed),authoritativeLease:false,realWriteGateInstalled:false,independentFenceVerified:false,canPromote:false,haEligible:false,
  notice:'Pure deterministic OFFLINE model. Booleans simulate witness/fence/term; no independent external proof, persistent distributed lock, Android watchdog, live GTID, edge gate or Cloudflare routing.'};
}
function privateFile(p){try{const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077))fail('Unsafe report permissions');if(s.size>40000)fail('Report too large');return fs.readFileSync(p,'utf8')}catch(e){if(e.code==='ENOENT')return null;throw e}}
function labGuard(){
 const mark=path.join(HOME,'.config/mhc-full-installer/installed');
 const installed=privateFile(mark);
 assert(installed&&/^TEST 0\.(?:3\.|4\.|5\.)/.test(installed),'Completed TEST marker required');
 for(const p of ['apps/thophuongpro/.env','.config/mini-hosting-cluster/node.json','.config/mini-hosting-cluster/ha.json','.config/mhc-full-installer/install-incomplete'])assert(!fs.existsSync(path.join(HOME,p)),'Production/HA/partial marker present');
 for(const [n,suffix] of [['static','.conf'],['sites','.env']]){
  const dir=path.join(HOME,'.config/mhc-full-installer',n);
  if(fs.existsSync(dir)){
   assert(!fs.lstatSync(dir).isSymbolicLink(),'Unsafe registration folder');
   assert(!fs.readdirSync(dir).some(x=>x.endsWith(suffix)),'Served website registered; use isolated disposable LAB');
  }
 }
}
function writeReport(o){
 if(fs.existsSync(REPORT_DIR)){const s=fs.lstatSync(REPORT_DIR);assert(s.isDirectory()&&!s.isSymbolicLink()&&!(s.mode&0o077),'Unsafe LAB report directory')}else fs.mkdirSync(REPORT_DIR,{mode:0o700});
 assert(!fs.existsSync(REPORT),'Existing rehearsal report; never overwrite');
 const tmp=path.join(REPORT_DIR,'.report-'+crypto.randomBytes(8).toString('hex'));
 try{fs.writeFileSync(tmp,JSON.stringify({...o,generatedAt:new Date().toISOString()},null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(tmp,REPORT)}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}
}
function status(){
 let report=null,invalid=false;
 const txt=privateFile(REPORT);
 if(txt){try{
  const x=JSON.parse(txt);
  if(x.scope!==SCOPE||typeof x.allSyntheticChecksPassed!=='boolean'||!Number.isSafeInteger(x.scenarioCount)||!Array.isArray(x.failed))invalid=true;
  else report=x;
 }catch{invalid=true}}
 return {scope:SCOPE,review:invalid?'INVALID_LOCAL_REPORT':report?(report.allSyntheticChecksPassed?'SYNTHETIC_MODEL_PASS':'SYNTHETIC_MODEL_FAILED'):'NOT_RUN',
  scenarioCount:report?.scenarioCount||0,failedCount:report?.failed?.length||0,
  authoritativeLease:false,realWriteGateInstalled:false,independentFenceVerified:false,canPromote:false,haEligible:false,
  notice:'No real lease, no independent fencing, no automatic failover. A PASS is only simulation.'};
}
async function main(args=process.argv.slice(2)){
 const cmd=args[0];
 if(cmd==='plan'&&args.length===1){console.log(JSON.stringify({scope:SCOPE,change:'None',methods:['scenarios','status','rehearse'],requiresDedicatedEmptyLab:true,cloudflareCalls:0,mariaDbWrites:0,liveLeaseGranted:false},null,2));return;}
 if(cmd==='scenarios'&&args.length===1){const r=scenarios();console.log(JSON.stringify(r,null,2));if(!r.allSyntheticChecksPassed)process.exitCode=1;return;}
 if(cmd==='status'&&args.length===1){console.log(JSON.stringify(status(),null,2));return;}
 if(cmd==='rehearse'&&args.length===2&&args[1]===CONFIRM){labGuard();const r=scenarios();if(!r.allSyntheticChecksPassed)fail('Synthetic safety invariants failed');writeReport(r);console.log(JSON.stringify(status(),null,2));return;}
 fail('Usage: mhc-full fencing plan|scenarios|status|rehearse '+CONFIRM);
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))main().catch(e=>{console.error('FENCING_LAB_BLOCKED:',e.message);process.exitCode=1});
