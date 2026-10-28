// Controlled XZ3 management outage only. No website, writer, reboot or network changes.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';import {fileURLToPath,pathToFileURL} from 'node:url';
const [action,id]=process.argv.slice(2),home=os.homedir(),prefix=process.env.PREFIX;
const a='4ed4c025-62ae-4c2a-8d68-65dd76ecf550',b='4a9672d1-bb62-4286-946a-a78b73e57b24';
const fail=c=>{throw Error(c);};const dir=path.join(home,'.local/state/mhc-p32-recovery-drill'),journal=path.join(dir,'current.json');
const services=['mhc-authority-agent','mhc-panel-tunnel'];
function gate(){
 if(prefix!=='/data/data/com.termux/files/usr'||!['status','start','restore','rescue'].includes(action))fail('P32_DRILL_XZ3_TERMUX_ONLY');
 for(const f of ['apps/thophuongpro/.env','.config/mini-hosting-cluster/ha.json','.config/mini-hosting-cluster/node.json'])if(fs.existsSync(path.join(home,f)))fail('P32_DRILL_PRODUCTION_DENIED');
 const cfg=path.join(home,'.config/mhc-full-installer');if(fs.lstatSync(cfg).isSymbolicLink()||JSON.parse(fs.readFileSync(path.join(cfg,'node-identity.json'))).nodeId!==b||fs.readFileSync(path.join(cfg,'installed'),'utf8').trim()!=='TEST 0.5.0C-REMOTE-PANEL installed on clean Termux')fail('P32_DRILL_UNAPPROVED_NODE');
 let at=home;for(const part of path.relative(home,dir).split(path.sep)){at=path.join(at,part);if(fs.lstatSync(at,{throwIfNoEntry:false})?.isSymbolicLink())fail('P32_DRILL_SYMLINK_DENIED');}
 if(fs.existsSync(dir)&&(!fs.statSync(dir).isDirectory()||(fs.statSync(dir).mode&0o077)))fail('P32_DRILL_PRIVATE_DIRECTORY_REQUIRED');
}
function read(){try{const st=fs.lstatSync(journal);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)||st.size>16384)fail('P32_DRILL_UNSAFE_JOURNAL');const j=JSON.parse(fs.readFileSync(journal,'utf8'));if(j.schema!==1||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(j.drillId||'')||!['RESCUE_ARMED','STOPPED','RESTORE_FAILED','RESTORED_BY_OPERATOR','RESTORED_BY_BEST_EFFORT_TIMER','RESTORED_AFTER_START_FAILURE'].includes(j.phase)||j.websiteNodeId!==a||j.panelNodeId!==b||!Number.isFinite(Date.parse(j.startedAt))||Date.parse(j.rescueAt)-Date.parse(j.startedAt)!==720000)fail('P32_DRILL_INVALID_JOURNAL');return j;}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function save(v){const temp=journal+'.'+crypto.randomUUID();const fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(v)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,journal);}
function running(name){const r=spawnSync('sv',['status',path.join(prefix,'var/service',name)],{encoding:'utf8',timeout:10000});return r.status===0&&/^run:/.test(r.stdout||'');}
function service(action,name){if(!services.includes(name))fail('P32_DRILL_SERVICE_DENIED');const r=spawnSync('sv',['-w','15',action,path.join(prefix,'var/service',name)],{stdio:'ignore',timeout:20000});if(r.status!==0)fail('P32_DRILL_SERVICE_ACTION_FAILED');}
function view(j){return {scope:'XZ3_AGENT_AND_TUNNEL_OUTAGE_ONLY',phase:j?.phase||'NOT_STARTED',drillId:j?.drillId||null,startedAt:j?.startedAt||null,rescueAt:j?.rescueAt||null,restoredAt:j?.restoredAt||null,services:Object.fromEntries([...services,'amh-panel','sshd'].map(n=>[n,running(n)])),fullAndroidPowerOrNetworkOutageTested:false};}
function restore(reason,expected){const j=read();if(!j||expected&&expected!==j.drillId)fail('P32_DRILL_RESTORE_ID_MISMATCH');let failed=false;for(const n of services)try{service('up',n);}catch{failed=true;}if(failed||services.some(n=>!running(n))){save({...j,phase:'RESTORE_FAILED'});fail('P32_DRILL_RESTORE_NOT_RUNNING');}save({...j,phase:reason,restoredAt:new Date().toISOString()});return view(read());}
try{
 gate();
 if(action==='status'){console.log(JSON.stringify(view(read())));}
 else if(action==='restore'){console.log(JSON.stringify(restore('RESTORED_BY_OPERATOR',id)));}
 else if(action==='rescue'){
  const j=read();if(!j||j.drillId!==id||!['RESCUE_ARMED','STOPPED','RESTORE_FAILED'].includes(j.phase))process.exit(0);
  await new Promise(r=>setTimeout(r,Math.max(0,Date.parse(j.rescueAt)-Date.now())));
  for(let attempt=0;attempt<3;attempt++){const current=read();if(current?.drillId!==id||!['RESCUE_ARMED','STOPPED','RESTORE_FAILED'].includes(current.phase))break;try{console.log(JSON.stringify(restore('RESTORED_BY_BEST_EFFORT_TIMER',id)));break;}catch(e){if(attempt===2)throw e;await new Promise(r=>setTimeout(r,10000));}}
 }else{
  if(id!=='--confirm=STOP_XZ3_LAB_MANAGEMENT_FOR_RECOVERY_TEST')fail('P32_DRILL_EXPLICIT_SCOPE_REQUIRED');
  const old=read();if(old&&!old.phase.startsWith('RESTORED'))fail('P32_DRILL_ALREADY_ACTIVE');
  const {sharedStatus}=await import(pathToFileURL(path.join(home,'.local/share/mhc-full-installer/bin/cluster-authority.mjs')));const s=await sharedStatus();
  if(s.declaredPrimary||s.writeLeaseGranted!==false||!s.p32?.recoveryEnabled||s.p32.siteNodeId!==a||s.p32.panelNodeId!==b||s.p32.journal?.status!=='VERIFIED'||s.p32.journal?.kind!=='panel'||s.pending?.targetNodeId!==a)fail('P32_DRILL_AUTHORITY_PRECONDITION');
  if([...services,'amh-panel','sshd'].some(n=>!running(n)))fail('P32_DRILL_MANAGEMENT_NOT_HEALTHY');
  const {CandidateNode}=await import(pathToFileURL(path.join(home,'.local/share/mhc-full-installer/bin/p31-node.mjs')));if(new CandidateNode().state().desired==='PREVIEW')fail('P32_DRILL_XZ3_PREVIEW_ACTIVE');
  fs.mkdirSync(dir,{recursive:true,mode:0o700});if(old)fs.writeFileSync(path.join(dir,old.drillId+'.finished.json'),JSON.stringify(old),{flag:'wx',mode:0o600});
  const started=Date.now(),j={schema:1,drillId:crypto.randomUUID(),phase:'RESCUE_ARMED',startedAt:new Date(started).toISOString(),rescueAt:new Date(started+720000).toISOString(),revision:s.revision,epoch:s.epoch,routeRevision:s.p32.routeRevision,websiteNodeId:a,panelNodeId:b};save(j);
  const fd=fs.openSync(path.join(dir,j.drillId+'.rescue.log'),'wx',0o600);let child;
  try{child=spawn(process.execPath,[fileURLToPath(import.meta.url),'rescue',j.drillId],{detached:true,stdio:['ignore',fd,fd]});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();}finally{fs.closeSync(fd);}
  save({...j,rescuePid:child.pid});
  try{for(const n of services)service('down',n);save({...read(),phase:'STOPPED'});console.log(JSON.stringify(view(read())));}catch(e){restore('RESTORED_AFTER_START_FAILURE',j.drillId);throw e;}
 }
}catch(e){console.error(/^P32_DRILL_[A-Z0-9_]+$/.test(e.message)?e.message:'P32_DRILL_FAILED');process.exitCode=1;}
