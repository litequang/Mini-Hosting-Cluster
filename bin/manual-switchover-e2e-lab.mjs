// MHC TEST 0.5.0C-WRITER-AUDIT — real loopback HTTP traffic; SYNTHETIC IN-MEMORY DB and witness.
// Exercises manual switchover sequencing ONLY, never connects to MariaDB/SSH/Cloudflare, never modifies HA or DNS.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const SCOPE='ISOLATED_LOOPBACK_HTTP_SWITCHOVER_SYNTHETIC_NOT_HA';
export const CONFIRM='--confirm=RUN_SYNTHETIC_LOOPBACK_SWITCHOVER_ONLY';
const HASH=/^[0-9a-f]{64}$/;
const LIMIT=2048;
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const serialize=o=>JSON.stringify(o);
function failure(message){throw Error(message)}
function goodFile(p,type){let x;try{x=fs.lstatSync(p)}catch(e){if(e.code==='ENOENT')return false;throw e}if(x.isSymbolicLink()||(x.mode&0o077)!==0||(type==='dir'?!x.isDirectory():!x.isFile()))failure('Unsafe private LAB '+type);return true}
function prohibitRealData(home){
 const marker=path.join(home,'.config/mhc-full-installer/installed');
 if(!goodFile(marker,'file')||!/^TEST 0\.(3\.|4\.|5\.)/.test(fs.readFileSync(marker,'utf8')))failure('Completed MHC TEST marker required');
 for(const rel of ['apps/thophuongpro/.env','.config/mini-hosting-cluster/node.json','.config/mini-hosting-cluster/ha.json','.config/mhc-full-installer/install-incomplete'])if(fs.existsSync(path.join(home,rel)))failure('STOP: production/HA or incomplete installation footprint');
 for(const [d,ext] of [['static','.conf'],['sites','.env']]){
  const f=path.join(home,'.config/mhc-full-installer',d);
  if(fs.existsSync(f)){if(fs.lstatSync(f).isSymbolicLink())failure('Unsafe site directory');if(fs.readdirSync(f).some(n=>n.endsWith(ext)))failure('STOP: registered hosting site exists');}
 }
}
function audit(j,step,detail={}){
 const prev=j.events.at(-1)?.hash||'GENESIS',at=new Date().toISOString(),index=j.events.length;
 const event={index,step,at,detail,previous:prev};event.hash=sha(serialize(event));j.events.push(event);return event;
}
function validateEvents(events){
 if(!Array.isArray(events)||events.length>40)failure('Invalid E2E audit size');
 let previous='GENESIS';for(let i=0;i<events.length;i++){
  const e=events[i],{hash,...unsigned}=e;
  if(e.index!==i||e.previous!==previous||!HASH.test(hash)||sha(serialize(unsigned))!==hash)failure('E2E audit integrity mismatch');previous=hash;
 }
}
function send(res,status,payload){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(serialize(payload))}
function readPayload(req){return new Promise((resolve,reject)=>{let b=Buffer.alloc(0);req.on('data',x=>{b=Buffer.concat([b,x]);if(b.length>LIMIT){reject(Error('Payload too large'));req.destroy();}});req.on('end',()=>{try{const x=JSON.parse(b.toString('utf8'));if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).sort().join(',')!=='value'||typeof x.value!=='string'||!/^fixture-[0-9a-z]{1,18}$/.test(x.value))throw Error('Bad LAB fixture');resolve(x);}catch(e){reject(e)}});req.on('error',reject)})}
function open(server){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port))})}
function close(server){return new Promise(resolve=>{if(!server.listening)return resolve();server.close(()=>resolve());server.closeAllConnections?.()})}
function doPost(port,token,value){return new Promise((resolve,reject)=>{
 const buf=Buffer.from(serialize({value}));const req=http.request({host:'127.0.0.1',port,path:'/v1/write',method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','content-length':buf.length},timeout:2000},res=>{let data='';res.on('data',b=>data+=b);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(data)}))});req.on('error',reject);req.on('timeout',()=>req.destroy(Error('Timeout')));req.end(buf)
 })}
function digest(items){return sha(serialize(items))}
export async function runSynthetic(options={}){
 const faults={oldFenceFails:false,divergentFiles:false,witnessOfflineAtHandoff:false,crashAfterFence:false,...options};
 if(Object.keys(faults).some(x=>!['oldFenceFails','divergentFiles','witnessOfflineAtHandoff','crashAfterFence'].includes(x)))failure('Unknown simulation fault');
 if(Object.values(faults).some(x=>typeof x!=='boolean'))failure('Faults must be booleans');
 const state={route:'A',owner:'A',term:1,witnessOnline:true,fenced:{A:false,B:false},logs:{A:[],B:[]}};
 const token=crypto.randomBytes(32).toString('hex');const events=[];
 const journal={schema:1,scope:SCOPE,createdAt:new Date().toISOString(),scenario:Object.keys(faults).filter(k=>faults[k]).sort(),events};
 const canWrite=n=>state.witnessOnline&&state.owner===n&&state.term>=1&&!state.fenced[n];
 const serveNode=n=>http.createServer(async(req,res)=>{
  if(req.url!=='/v1/write'||req.method!=='POST')return send(res,404,{ok:false});
  if(req.headers.authorization!==`Bearer ${token}`)return send(res,401,{ok:false});
  if(!canWrite(n))return send(res,423,{ok:false,reason:'FENCED_OR_NO_LEASE'});
  try{const body=await readPayload(req);if(!canWrite(n))return send(res,423,{ok:false,reason:'LEASE_CHANGED'});
   state.logs[n].push(body.value);return send(res,201,{ok:true,node:n,sequence:state.logs[n].length});
  }catch{return send(res,400,{ok:false});}
 });
 const serverA=serveNode('A'),serverB=serveNode('B');let portA,portB,portIngress;
 const ingress=http.createServer(async(req,res)=>{
  if(req.method!=='POST'||req.url!=='/v1/write')return send(res,404,{ok:false});
  if(req.headers.authorization!==`Bearer ${token}`)return send(res,401,{ok:false});
  const target=state.route;
  if(target===null||!canWrite(target))return send(res,503,{ok:false,reason:'INGRESS_CLOSED'});
  try{const body=await readPayload(req);if(target!==state.route||!canWrite(target))return send(res,503,{ok:false,reason:'INGRESS_CHANGED'});
   const r=await doPost(target==='A'?portA:portB,token,body.value);
   return send(res,r.status,r.data);
  }catch{return send(res,503,{ok:false,reason:'UPSTREAM_NOT_READY'});}
 });
 let result;
 try{
  portA=await open(serverA);portB=await open(serverB);portIngress=await open(ingress);
  audit(journal,'LAB_LISTENERS_STARTED',{loopbackOnly:true,realDatabase:false});
  const first=await doPost(portIngress,token,'fixture-a1');if(first.status!==201||first.data.node!=='A')failure('Baseline source write failed');
  audit(journal,'BASELINE_WRITTEN',{sourceCount:1});
  state.route=null;const frozen=await doPost(portIngress,token,'fixture-denied');if(frozen.status!==503)failure('Frozen ingress accepted write');
  audit(journal,'INGRESS_FROZEN',{blocked:true});
  // Local writer remains writable until individually fenced; tests that routing alone is insufficient.
  const during=await doPost(portA,token,'fixture-a2');if(during.status!==201)failure('Source lab transaction while paused failed');
  audit(journal,'SECOND_SOURCE_EVENT',{differentFromBaseline:true});
  state.logs.B=[...state.logs.A];if(faults.divergentFiles)state.logs.B.push('fixture-diverged');
  const convergence=digest(state.logs.A)===digest(state.logs.B);
  audit(journal,'FILE_AND_SEQUENCE_REVIEW',{matched:convergence,sourceEvents:state.logs.A.length,targetEvents:state.logs.B.length});
  if(!convergence)failure('SYNC_DIVERGENCE');
  if(!faults.oldFenceFails)state.fenced.A=true;
  const directly=await doPost(portA,token,'fixture-old-node');
  const oldRejected=directly.status===423;
  audit(journal,'OLD_WRITER_FENCE_CHECK',{verifiedDenied:oldRejected});
  if(!oldRejected)failure('OLD_WRITER_STILL_ACCEPTING_WRITES');
  if(faults.crashAfterFence)failure('CRASH_AFTER_FENCE');
  if(faults.witnessOfflineAtHandoff)state.witnessOnline=false;
  if(!state.witnessOnline)failure('WITNESS_OFFLINE_CANNOT_HANDOFF');
  // Synthetic lease handoff: NOT a Cloudflare witness, and never confers real writer authority.
  state.term++;state.owner='B';state.route='B';
  audit(journal,'LAB_ROUTE_SELECTED',{syntheticTerm:state.term,newNode:'B',oldWriterStillDenied:true});
  const after=await doPost(portIngress,token,'fixture-b3');
  if(after.status!==201||after.data.node!=='B')failure('Target did not receive post-handoff fixture');
  if((await doPost(portA,token,'fixture-old-retry')).status!==423)failure('Old node resumed writing');
  audit(journal,'POST_HANDOFF_TEST',{targetAccepted:true,oldDenied:true});
  state.witnessOnline=false;
  const witnessLost=await doPost(portIngress,token,'fixture-rejected-after-witness-loss');
  if(witnessLost.status!==503)failure('Writer accepted after witness loss');
  audit(journal,'WITNESS_LOSS_FAIL_CLOSED',{denied:true});
  result={status:'SYNTHETIC_LAB_DRILL_PASS',targetEvents:state.logs.B.length,
   oldWriterDenied:true,postHandoffTargetAccepted:true,witnessLossDenied:true};
 }catch(e){state.route=null;state.witnessOnline=false;
  audit(journal,'SAFE_ABORT',{code:String(e.message||'UNKNOWN').slice(0,80)});
  result={status:'SYNTHETIC_LAB_DRILL_ABORT',reason:String(e.message||'UNKNOWN').slice(0,80),routeFrozen:true,
   realNodeFenced:false};
 }finally{await Promise.all([close(ingress),close(serverA),close(serverB)]);}
 audit(journal,'DRILL_FINISHED',{status:result.status});
 return {...result,scope:SCOPE,events:journal.events,syntheticWitnessOnly:true,
  realMariaDbReplicationVerified:false,realFencingVerified:false,productionRoutingChanged:false,
  realWriterAuthorityGranted:false,canSwitchPrimary:false,haEligible:false,
  notice:'Executed actual loopback HTTP requests against synthetic in-memory nodes. Not two Android hosts, not MariaDB GTID, not Cloudflare witness or real fencing.'};
}
function redacted(report){
 const {events,...summary}=report;return {...summary,eventCount:events.length,auditHead:events.at(-1)?.hash||null,auditIntegrityChecked:true};
}
function privateStatus(home){
 const d=path.join(home,'mhc-switchover-e2e-lab');if(!goodFile(d,'dir'))return {status:'NOT_RUN',scope:SCOPE,canSwitchPrimary:false};
 const f=path.join(d,'report.json');if(!goodFile(f,'file'))return {status:'NOT_RUN',scope:SCOPE,canSwitchPrimary:false};
 if(fs.statSync(f).size>32768)failure('Oversized E2E report');
 const r=JSON.parse(fs.readFileSync(f,'utf8'));if(r.schema!==1||r.scope!==SCOPE||!r.result||typeof r.result.status!=='string')failure('Invalid E2E report');validateEvents(r.events);
 if(r.events.length<2||r.events.at(-1).step!=='DRILL_FINISHED'||!['SYNTHETIC_LAB_DRILL_PASS','SYNTHETIC_LAB_DRILL_ABORT'].includes(r.result.status)||r.result.status!==r.events.at(-1).detail?.status)failure('E2E report result integrity mismatch');
 if(r.result.auditHead!==r.events.at(-1)?.hash)failure('E2E report digest mismatch');
 return {scope:SCOPE,status:r.result.status,eventCount:r.events.length,auditHead:r.result.auditHead,
  canSwitchPrimary:false,haEligible:false,realFencingVerified:false,realMariaDbReplicationVerified:false,auditHashNotSignature:true,
  note:'Local synthetic drill report, NOT a production switchover attestation.'};
}
function checkedLabDirectory(home){
 const d=path.join(home,'mhc-switchover-e2e-lab');if(!fs.existsSync(d))fs.mkdirSync(d,{mode:0o700});goodFile(d,'dir');return d;
}
function persist(d,r){
 const temp=path.join(d,'.report-'+crypto.randomBytes(8).toString('hex'));
 const {events,...summary}=r;const result={...summary,auditHead:events.at(-1)?.hash||null};
 const data=JSON.stringify({schema:1,scope:SCOPE,result,events},null,2)+'\n';
 fs.writeFileSync(temp,data,{mode:0o600,flag:'wx'});
 try{const f=fs.openSync(temp,'r');try{fs.fsyncSync(f)}finally{fs.closeSync(f)}fs.renameSync(temp,path.join(d,'report.json'))}
 finally{if(fs.existsSync(temp))fs.unlinkSync(temp)}
}
async function withLabLock(d,callback){
 const lock=path.join(d,'run.lock'),fd=fs.openSync(lock,'wx',0o600);
 try{fs.writeSync(fd,`${process.pid}\n`);fs.fsyncSync(fd);return await callback()}
 finally{fs.closeSync(fd);fs.unlinkSync(lock)}
}

async function main(args=process.argv.slice(2)){
 const cmd=args[0];
 if(cmd==='plan'&&args.length===1){console.log(JSON.stringify({scope:SCOPE,release:'TEST 0.5.0C-WRITER-AUDIT',
  commands:['plan','status',`run ${CONFIRM}`],mode:'SYNTHETIC_LOOPBACK_ONLY',servicesAffected:0,
  noMariadb:true,noCloudflare:true,noSSH:true,noProductionRoutes:true,canSwitchPrimary:false},null,2));return}
 const home=process.env.HOME||os.homedir();
 if(cmd==='status'&&args.length===1){console.log(JSON.stringify(privateStatus(home),null,2));return}
 if(cmd==='run'&&args.length===2&&args[1]===CONFIRM){prohibitRealData(home);const d=checkedLabDirectory(home);await withLabLock(d,async()=>{const r=await runSynthetic();persist(d,r);console.log(JSON.stringify(redacted(r),null,2));if(r.status!=='SYNTHETIC_LAB_DRILL_PASS')process.exitCode=1});return}
 failure(`Usage: mhc-full switchover-e2e plan|status|run ${CONFIRM}`);
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))main().catch(e=>{console.error('STOP: '+String(e.message).replace(/[\r\n]/g,' ').slice(0,160));process.exitCode=1});
