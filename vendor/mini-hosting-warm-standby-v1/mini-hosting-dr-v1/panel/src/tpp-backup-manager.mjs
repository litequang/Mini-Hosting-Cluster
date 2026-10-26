// Read and manage the EXISTING verified TPP Backup v1 snapshots only.
// Never performs SQL restore or changes the backup scheduler.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const ROOT=path.join(os.homedir(),'hosting-backups','thophuongpro');
const STATE=path.join(os.homedir(),'.local/state','tpp-backup');
const SCRIPT=path.join(os.homedir(),'.local/share/tpp-backup','backup-now.sh');
const VERIFY=path.join(os.homedir(),'.local/share/tpp-backup','verify-latest.sh');
const SERVICE='/data/data/com.termux/files/usr/var/service/tpp-backup';
const SV='/data/data/com.termux/files/usr/bin/sv';
const SNAPSHOT=/^snapshot-\d{8}-\d{6}-\d+$/;
const FILES=['database.sql.gz','storage.tar.gz','app-release.tar.gz','external-sheets.tar.gz','INFO.txt','SHA256SUMS'];
const isFile=p=>{try{return fs.lstatSync(p).isFile();}catch{return false;}};
const readText=(p,max=8000)=>{try{if(!isFile(p))return '';const s=fs.readFileSync(p,'utf8');return s.slice(-max);}catch{return '';}};
const snapshotDir=name=>{
 if(typeof name!=='string'||!SNAPSHOT.test(name))throw Error('Invalid snapshot name');
 const dir=path.join(ROOT,name);
 if(!fs.existsSync(dir)||!fs.lstatSync(dir).isDirectory()||fs.realpathSync(path.dirname(dir))!==path.dirname(fs.realpathSync(dir)))throw Error('Snapshot not found');
 return dir;
};
function snapshots(){
 if(!fs.existsSync(ROOT))return [];
 return fs.readdirSync(ROOT).filter(n=>SNAPSHOT.test(n)).sort().reverse().slice(0,30).flatMap(name=>{
  let dir;try{dir=snapshotDir(name);}catch{return [];}
  const files=FILES.filter(f=>isFile(path.join(dir,f))).map(f=>({name:f,size:fs.statSync(path.join(dir,f)).size}));
  return [{name,createdAt:fs.statSync(dir).mtime.toISOString(),size:files.reduce((t,f)=>t+f.size,0),files,complete:FILES.filter(f=>f!=='external-sheets.tar.gz').every(f=>files.some(x=>x.name===f))}];
 });
}
function lockInfo(){
 const dir=path.join(ROOT,'.backup-lock');
 if(!fs.existsSync(dir))return {locked:false,running:false};
 const pid=Number(readText(path.join(dir,'pid'),30).trim());
 if(Number.isInteger(pid)&&pid>1){
  try{process.kill(pid,0);return {locked:true,running:true};}catch{}
 }
 return {locked:true,running:false};
}
export async function backupStatus(){
 const list=snapshots(),lock=lockInfo();
 let service='unknown';
 try{const {stdout}=await exec(SV,['status',SERVICE],{timeout:4000,maxBuffer:4000});service=stdout.trim().startsWith('run:')?'running':'stopped';}catch{service='unavailable';}
 const latest=readText(path.join(ROOT,'latest-success-path'),500).trim();
 return {installed:isFile(SCRIPT)&&isFile(VERIFY),service,locked:lock.locked,running:lock.running,
  latestName:list.some(x=>path.join(ROOT,x.name)===latest)?path.basename(latest):null,
  lastSuccess:readText(path.join(ROOT,'last-success-date'),30).trim()||null,
  schedule:'03:00 mỗi ngày (giờ của điện thoại)',retention:7,
  snapshots:list,log:readText(path.join(STATE,'log','current'),6000),manualLog:readText(path.join(STATE,'manual.log'),2500),
  offDeviceConfigured:false};
}
export async function startBackup(){
 if(!isFile(SCRIPT))throw Error('Backup v1 is not installed');
 if(lockInfo().locked)throw Error('Backup is running or lock needs inspection. No duplicate started.');
 fs.mkdirSync(STATE,{recursive:true,mode:0o700});
 const fd=fs.openSync(path.join(STATE,'manual.log'),'a',0o600);
 try{
  const child=spawn(SCRIPT,[],{cwd:os.homedir(),detached:true,stdio:['ignore',fd,fd],env:process.env});
  child.unref();
  return {started:true,pid:child.pid,message:'Backup started; refresh the list after it finishes.'};
 }finally{fs.closeSync(fd);}
}
export async function verifyLatest(){
 if(!isFile(VERIFY))throw Error('Backup verifier is not installed');
 if(lockInfo().locked)throw Error('Backup active or lock present. Verify later.');
 try{
  const {stdout}=await exec(VERIFY,[],{timeout:180000,maxBuffer:24*1024,encoding:'utf8'});
  const out=stdout.trim();
  if(!out.includes('VERIFIED:'))throw Error('No VERIFIED result');
  return {ok:true,report:out.slice(-5000)};
 }catch(e){throw Error('Verification failed: '+String(e.stderr||e.message).slice(-600));}
}
export function downloadableSnapshot(name,file){
 if(!FILES.includes(file))throw Error('Invalid backup component');
 const f=path.join(snapshotDir(name),file);
 if(!isFile(f))throw Error('Backup component not found');
 return {path:f,filename:`${name}-${file}`,size:fs.statSync(f).size};
}
