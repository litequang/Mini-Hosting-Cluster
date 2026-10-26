#!/usr/bin/env node
// MHC v0.3: optional, fail-closed control-agent; no production changes until explicit arm.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readConfig} from './cli.mjs';

const HOME=os.homedir();
const ROOT=path.join(HOME,'.config/mini-hosting-cluster');
const CONTROL=path.join(ROOT,'control.json');
const LEASE=path.join(ROOT,'lease.json');
const ONLINE=path.join(ROOT,'online.json');
const SEAL=path.join(ROOT,'file-seal.json');
const COLLECTOR='https://telemetry.thophuong.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function read(p){try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return null;}}
function write(p,v){fs.mkdirSync(path.dirname(p),{recursive:true,mode:0o700});const t=p+'.'+process.pid+'.tmp';fs.writeFileSync(t,JSON.stringify(v,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(t,p);fs.chmodSync(p,0o600);}
function sh(cmd,args,timeout=5000){return execFileSync(cmd,args,{encoding:'utf8',timeout,stdio:['ignore','pipe','pipe']}).trim();}
function service(n){try{return sh('sv',['status',n],2000).startsWith('run:');}catch{return false;}}
function sql(q){return sh('mariadb',['--no-defaults','-u','root','-N','-B','-e',q],7000);}
function mysql(){try{const s=sql("SELECT @@global.gtid_current_pos, @@global.gtid_binlog_pos, @@global.read_only, @@global.log_bin").split('\t');
 if(s.length!==4)return {ok:false};const [gtid,binlog,readonly,logBin]=s;
 // MariaDB GTID exact comparison is deliberately conservative.
 const status=sh('mariadb',['--no-defaults','-u','root','-e','SHOW SLAVE STATUS\\G'],7000);
 const repl=status.includes('Slave_IO_Running: Yes')&&status.includes('Slave_SQL_Running: Yes')&&/Seconds_Behind_Master:\s*0\b/.test(status);
 return {ok:true,gtid,binlog,readonly:readonly==='1',logBin:logBin==='1',replication:repl};
 }catch{return {ok:false};}}
const bootId=()=>{try{return fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();}catch{return null;}};
function localLeaseValid(){const l=read(LEASE),up=os.uptime()*1000;
 return !!(l?.bootId&&l.bootId===bootId()&&Number.isFinite(l.validUptimeMs)&&up>=l.writtenUptimeMs&&up<l.validUptimeMs&&l.term>0);}
function makeProof(c){const db=mysql(),seal=read(SEAL);const enabled=read(CONTROL)?.armed===true;
 const servicesStopped=!service('mini-web')&&!service('named-tunnel');
 const guarded=service('mhc-fence-guard');
 return {fencingReady:enabled&&guarded,databaseReady:db.ok&&db.logBin,
  filesReady:!!(seal?.digest&&seal?.directory===path.join(HOME,'apps/thophuongpro/storage/sheets')),
  replicationCaughtUp:(c.role==='primary'||localLeaseValid())?db.ok&&db.logBin:db.replication,
  fenced:servicesStopped&&db.readonly,gtid:db.gtid||'',fileSeal:seal?.digest||'',availableMiB:Math.floor(os.freemem()/1048576),uptimeSec:Math.floor(os.uptime()),batteryPercentage:null,charging:false};
}
function fence(){// Tunnel FIRST, app SECOND, MariaDB read-only LAST. Any failure reported loudly.
 const wasServing=service('mini-web')||service('named-tunnel');
 if(wasServing)try{fs.unlinkSync(SEAL)}catch{}
 for(const n of ['named-tunnel','mini-web']){try{sh('sv',['down',n],4500)}catch(e){throw Error('Unable to fence '+n+': '+e.message)}}
 sql('SET GLOBAL read_only=ON');
 const db=mysql();if(service('named-tunnel')||service('mini-web')||!db.ok||!db.readonly)throw Error('FENCING INCOMPLETE: do not switch primary');
 if(wasServing)sealFiles(); // final files checkpoint AFTER writes have stopped
 try{fs.unlinkSync(LEASE)}catch{}
 return true;
}
function assertIdentity(){const c=readConfig(),o=read(ONLINE);if(!c?.nodeId||!c.clusterId)throw Error('Cluster identity missing.');
 if(!o?.token||o.clusterId!==c.clusterId||o.nodeId!==c.nodeId||o.collector!==COLLECTOR)throw Error('Cloud enrollment missing or mismatched.');
 return {c,o};}
async function pulse(c,o,proof){const ac=new AbortController(),t=setTimeout(()=>ac.abort(),8000);
 try{const r=await fetch(COLLECTOR+'/v1/control',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+o.token},body:JSON.stringify({clusterId:c.clusterId,nodeId:c.nodeId,proof}),signal:ac.signal});
 const v=await r.json().catch(()=>({error:'Invalid response'}));if(!r.ok)throw Error('Cloud '+r.status+': '+String(v.error||'failed'));return v;
 }finally{clearTimeout(t);}}
async function iteration(){const {c,o}=assertIdentity(),armed=read(CONTROL)?.armed===true;
 const proof=makeProof(c);const at=os.uptime()*1000;
 const response=await pulse(c,o,proof);
 if(!armed){console.log('OBSERVE',response.action,'term',response.term);return;}
 if(response.action==='serve'&&response.holder===c.nodeId&&Number.isInteger(response.term)&&response.term>0&&response.ttlMs>=10000){
  if(!proof.fencingReady||!proof.databaseReady||!proof.filesReady||!proof.replicationCaughtUp)throw Error('Local prerequisites not fulfilled');
  // Grant is TIME-LIMITED. Guardian will cut app/tunnel even when this agent loses cloud.
  const life=Math.min(response.ttlMs,20000)-5000;
  write(LEASE,{nodeId:c.nodeId,term:response.term,bootId:bootId(),writtenUptimeMs:at,validUptimeMs:at+life});
  if(!localLeaseValid())throw Error('Cannot establish monotonic boot-bound lease');
  // Switch from replicated read-only DB into serving DB only after lease is persisted.
  const db=mysql();if(db.replication)sql('STOP SLAVE');
  sql('SET GLOBAL read_only=OFF');
  sh('sv-enable',['mini-web']);sh('sv',['up','mini-web']);
  sh('sv-enable',['named-tunnel']);sh('sv',['up','named-tunnel']);
  console.log('SERVE term',response.term,'lease_ms',life);
 }else{
  fence();console.log('FENCED',response.reason||response.action);
 }
}
async function loop(){for(;;){try{await iteration();}catch(e){console.error('CONTROL FAILED:',e.message);
   if(read(CONTROL)?.armed===true)try{fence();}catch(x){console.error('CRITICAL FENCING:',x.message);}}
  await sleep(4000);}}
function sealFiles(){const root=path.join(HOME,'apps/thophuongpro/storage/sheets');if(!fs.statSync(root).isDirectory())throw Error('Sheet directory missing');
 const digest=crypto.createHash('sha256');let count=0,changed=0;
 function walk(dir){for(const x of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){const absolute=path.join(dir,x.name),relative=path.relative(root,absolute);
  if(x.isDirectory()){walk(absolute);continue;}
  if(!x.isFile()||x.isSymbolicLink())throw Error('Unsupported path or symlink: '+relative);
  const before=fs.statSync(absolute),fd=fs.openSync(absolute,'r');try{const hash=crypto.createHash('sha256'),buffer=Buffer.allocUnsafe(512*1024);let n;
   while((n=fs.readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,n));
   const after=fs.statSync(absolute);if(before.size!==after.size||before.mtimeMs!==after.mtimeMs){changed++;continue;}
   digest.update(relative+'\0'+before.size+'\0'+hash.digest('hex')+'\n');count++;
  }finally{fs.closeSync(fd);}}
 }
 walk(root);if(changed)throw Error(changed+' file(s) modified while sealing; refuse to record');
 const entry={version:1,digest:digest.digest('hex'),directory:root,fileCount:count,createdAt:new Date().toISOString()};write(SEAL,entry);console.log(JSON.stringify(entry,null,2));}
function arm(){const {c}=assertIdentity();if(!process.argv.includes('--confirm=FENCED'))throw Error('Require --confirm=FENCED');
 if(service('mini-web')||service('named-tunnel'))throw Error('STOP: Web/Tunnel active. Maintenance handover required before arming; no service will be stopped implicitly.');
 if(!service('mhc-fence-guard'))throw Error('Guardian not running');
 try{const procs=sh('ps',['-ef'],3000);if(procs.split('\n').some(x=>x.includes('dist/server.cjs')))throw Error('Orphan Tho Phuong Pro Node process detected; cannot arm.');}catch(e){if(e.message.startsWith('Orphan'))throw e;throw Error('Cannot inspect processes before arming');}const proof=makeProof(c);
 if(!proof.databaseReady||!proof.filesReady)throw Error('GTID/binlog or file seal not ready. Run mhc seal-files and configure binlog.');
 fence();write(CONTROL,{armed:true,armedAt:new Date().toISOString()});console.log('ARMED: service supervisor may start/stop Mini-Web/Tunnel. Set control policy in Cloudflare Monitor.');}
function disarm(){if(!process.argv.includes('--confirm=FENCED'))throw Error('Require --confirm=FENCED');fence();write(CONTROL,{armed:false,disarmedAt:new Date().toISOString()});console.log('DISARMED. Web/tunnel remain OFF; manual recovery needed.');}
async function main(){switch(process.argv[2]){
 case 'loop':return loop();case 'once':return iteration();case 'seal-files':return sealFiles();
 case 'arm':return arm();case 'disarm':return disarm();case 'fence':return fence();
 case 'status':{const c=readConfig(),l=read(LEASE);console.log(JSON.stringify({armed:read(CONTROL)?.armed===true,leaseValid:localLeaseValid(),term:l?.term||null,proof:c?makeProof(c):null},null,2));return;}
 default:throw Error('Usage: control-agent.mjs loop|once|seal-files|arm --confirm=FENCED|disarm --confirm=FENCED|fence|status');}}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))main().catch(e=>{console.error('ERROR:',e.message);process.exitCode=1;});
export {localLeaseValid,makeProof};
