// On-node acceptance client: password/session remain in memory, never arguments/output.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
const [action,id,fixedRevision,fixedRequest]=process.argv.slice(2),home=os.homedir(),origin='http://127.0.0.1:9090';let cookie='',csrf='';
async function call(route,body,auth=true){const r=await fetch(origin+route,{method:body?'POST':'GET',headers:{...(auth&&cookie?{cookie}:{}),...(body?{'content-type':'application/json',origin,...(auth?{'x-csrf-token':csrf}:{})}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000),redirect:'error'});const data=await r.json();return {status:r.status,data,setCookie:r.headers.get('set-cookie')};}
function safeState(s){return {revision:s.revision,epoch:s.epoch,declaredPrimary:s.declaredPrimary,pending:s.pending?{operationId:s.pending.operationId,targetNodeId:s.pending.targetNodeId,status:s.pending.status}:null,writeLeaseGranted:s.writeLeaseGranted};}
function safeProof(p){return {nodeId:p.nodeId,scope:p.scope,version:p.version,epoch:p.epoch,revision:p.revision,previewReady:p.previewReady,websiteServing:p.websiteServing,activation:p.activation,writerGranted:p.writerGranted,nodeWritersFenced:p.nodeWritersFenced,http:p.http?{status:p.http.status,mediaVerified:p.http.mediaVerified,staticVerified:p.http.staticVerified}:null,problems:p.problems,verified:p.verified,problem:p.problem};}
try{
 const nodeId=JSON.parse(fs.readFileSync(path.join(home,'.config/mhc-full-installer/node-identity.json'))).nodeId;
 if(!['4ed4c025-62ae-4c2a-8d68-65dd76ecf550','4a9672d1-bb62-4286-946a-a78b73e57b24'].includes(nodeId))throw Error('P31_NOT_APPROVED_LAB');
 assert.equal((await call('/api/mhc/p31-readiness',null,false)).status,401);
 const passwordFile=[path.join(home,'.config/mhc-full-installer/panel-login-once'),path.join(home,'.local/state/mhc-p31-lab/panel-test-password')].find(p=>fs.existsSync(p));if(!passwordFile)throw Error('P31_PANEL_PASSWORD_FILE_UNAVAILABLE');const st=fs.lstatSync(passwordFile);if(st.isSymbolicLink()||(st.mode&0o077)||st.size>1000)throw Error('P31_PANEL_PASSWORD_FILE_UNSAFE');
 const password=fs.readFileSync(passwordFile,'utf8').trim();const login=await call('/api/login',{username:'admin',password},false);if(login.status!==200)throw Error('P31_PANEL_EXISTING_PASSWORD_LOGIN_FAILED');cookie=login.setCookie.split(';')[0];csrf=login.data.csrf;
 const current=(await call('/api/mhc/primary-selection')).data;
 if(!['status','csrf-test'].includes(action)&&!current.p31?.enabled)throw Error('P31_NOT_CONFIGURED');
 if(action==='status'){const r=await call('/api/mhc/p31-readiness');assert.equal(r.status,200);console.log(JSON.stringify({action,state:safeState(current),readiness:{...r.data,nodes:r.data.nodes?.map(safeProof)}}));}
 else if(action==='begin'||action==='begin-fixed'){
  const r=await call('/api/mhc/primary-selection',{action:'begin',id,requestId:fixedRequest||crypto.randomUUID(),expectedRevision:action==='begin-fixed'?Number(fixedRevision):current.revision});console.log(JSON.stringify({action,status:r.status,outcome:r.status===200?'ACCEPTED':'REJECTED',...(r.status===200?{state:safeState(r.data)}:{error:r.data.error})}));
 }
 else if(['prepare','standby','promote-test','route-denied'].includes(action)){
  const op=action==='prepare'?'p31-prepare':action==='standby'?'p31-standby':action==='promote-test'?'p31-promote':'route';
  const body={action:op,id:action==='route-denied'?current.pending?.operationId:id||current.pending?.targetNodeId,requestId:crypto.randomUUID(),expectedRevision:current.revision,epoch:current.epoch,operationId:current.pending?.operationId||null,backupRestored:true,oldWritersStopped:true,targetHttpChecked:true,targetPanelAccessChecked:true,acceptDataLossRisk:true,labOnly:true};
  const r=await call('/api/mhc/primary-selection',body);
  if(action==='promote-test'||action==='route-denied'){assert.notEqual(r.status,200);assert.match(r.data.error||'',action==='promote-test'?/P31_UNPROVEN_WRITER_FENCING/:/P31_CLOUDFLARE_AND_WRITER_CUTOVER_DISABLED/);console.log(JSON.stringify({action,status:r.status,refused:true,error:r.data.error}));}
  else{if(r.status!==200)throw Error('P31_PANEL_ACTION_FAILED_'+String(r.data.error).replace(/[^A-Z_]/g,'').slice(0,90));console.log(JSON.stringify({action,status:r.status,proof:safeProof(r.data)}));}
 }
 else if(action==='abort'){
  assert.equal(current.pending?.status,'PREPARED_NO_WRITER_GRANT');const r=await call('/api/mhc/primary-selection',{action:'abort',id:current.pending.operationId,requestId:crypto.randomUUID(),expectedRevision:current.revision});assert.equal(r.status,200);console.log(JSON.stringify({action,state:safeState(r.data)}));
 }else if(action==='csrf-test'){
  const old=csrf;csrf='';const r=await call('/api/mhc/primary-selection',{action:'p31-prepare',id});csrf=old;assert.equal(r.status,403);console.log('REAL_PANEL_AUTH_AND_CSRF_PASS');
 }else throw Error('P31_UNKNOWN_TEST');
}catch(e){console.error(/^P31_[A-Z_]+$/.test(e.message)?e.message:'P31_PANEL_ACCEPTANCE_FAILED');process.exitCode=1;}
