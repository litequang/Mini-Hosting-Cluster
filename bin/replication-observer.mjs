// MHC TEST 0.4.0A — READ-ONLY replication observer.
// Scans only explicitly registered MHC website content and canonical Sheet storage.
// This is NOT MariaDB replication, a backup, or a HA readiness attestation.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
const HOME=process.env.HOME||os.homedir();
const CFG=path.join(HOME,'.config/mhc-full-installer');
const STORE=path.join(HOME,'.local/share/mhc-full-installer/observer');
const LATEST=path.join(STORE,'latest.json');
const PREVIOUS=path.join(STORE,'previous.json');
const ROOT_BASE=path.join(HOME,'websites');
const TPP_STORAGE=path.join(HOME,'apps/thophuongpro/storage/sheets');
const SLUG=/^[a-z][a-z0-9-]{1,30}$/;
const MAX_FILES=20000,MAX_BYTES=8*1024**3,MAX_SINGLE=512*1024**2,MAX_REPORT=12*1024**2;
const safePathPart=name=>typeof name==='string'&&!name.includes('\u0000')&&!name.includes('\n')&&!name.includes('\r')&&name!=='.'&&name!=='..';
function privateDirectory(p){const s=fs.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink())throw Error('Unsafe directory or symlink: '+p);}
async function readReport(p){
 try{const s=await fsp.lstat(p);if(!s.isFile()||s.isSymbolicLink()||s.size>MAX_REPORT)return null;
  const j=JSON.parse(await fsp.readFile(p,'utf8'));
  return j.schema===1&&j.scope==='MHC_CONTENT_OBSERVER_ONLY'&&Array.isArray(j.roots)&&typeof j.files==='object'&&j.files!==null&&!Array.isArray(j.files)?j:null;
 }catch{return null;}
}
function noSecrets(p){return !/(^|\/)\.|(^|\/)(wp-config\.php|config\.php|id_rsa|authorized_keys|\.env)(\/|$)/i.test('/'+p);}
async function discover(){
 const roots=[];let slots=[];
 for(const [sub,ext,type] of [['static','.conf','static'],['sites','.env','wordpress']]){
  const folder=path.join(CFG,sub);
  try{privateDirectory(folder);slots=await fsp.readdir(folder,{withFileTypes:true});}catch{continue;}
  for(const f of slots){if(!f.isFile()||f.isSymbolicLink()||!f.name.endsWith(ext))continue;
   const slug=f.name.slice(0,-ext.length);if(!SLUG.test(slug))continue;
   const rel=type==='wordpress'?'wp-content/uploads':'';
   roots.push({id:`${type}:${slug}`,dir:path.join(ROOT_BASE,slug,rel)});
  }
 }
 // TPP is never copied, executed, restored or opened by the observer. Only canonical Sheet files are hashed.
 try{privateDirectory(TPP_STORAGE);roots.push({id:'tpp:sheets',dir:TPP_STORAGE});}catch{}
 roots.sort((a,b)=>a.id.localeCompare(b.id));
 return roots;
}
async function hashOne(p){
 const fd=await fsp.open(p,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 try{
  const before=await fd.stat();
  if(!before.isFile()||before.size>MAX_SINGLE)throw Error('Unsupported or oversized file');
  const digest=crypto.createHash('sha256');
  for await(const c of fd.createReadStream({autoClose:false,highWaterMark:128*1024}))digest.update(c);
  const after=await fd.stat();
  const live=await fsp.lstat(p);
  if(!live.isFile()||live.isSymbolicLink()||live.ino!==before.ino||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ino!==before.ino)throw Error('File changed while hashing');
  return {size:after.size,sha256:digest.digest('hex')};
 }finally{await fd.close();}
}
async function scanFiles(roots){
 const files=Object.create(null);let count=0,bytes=0;
 for(const root of roots){
  // No parent symlink traversal, including the site folder and wp-content.
  const base=path.resolve(root.dir),home=path.resolve(HOME);
  if(!(base.startsWith(home+path.sep)))throw Error('Root outside Termux HOME');
  let current=base;
  while(current!==home){privateDirectory(current);current=path.dirname(current);}
  const walk=async(dir,parts,depth)=>{
   if(depth>25)throw Error('Directory nesting exceeds safe limit');
   const entries=await fsp.readdir(dir,{withFileTypes:true});
   entries.sort((a,b)=>a.name.localeCompare(b.name));
   for(const e of entries){
    if(!safePathPart(e.name))throw Error('Invalid filename in observed content');
    const relative=[...parts,e.name].join('/');
    if(!noSecrets(relative))continue;
    const file=path.join(dir,e.name),st=await fsp.lstat(file);
    if(st.isSymbolicLink())throw Error('Symlink in observed content; scan aborted');
    if(st.isDirectory())await walk(file,[...parts,e.name],depth+1);
    else if(st.isFile()){
     if(++count>MAX_FILES||st.size>MAX_SINGLE||(bytes+=st.size)>MAX_BYTES)throw Error('Scan safety limit exceeded');
     files[root.id+'/'+relative]=await hashOne(file);
    }else throw Error('Special file in observed content');
   }
  };
  await walk(base,[],0);
 }
 return {files,count,bytes};
}
const GTID=/^(?:\d{1,10}-\d{1,10}-\d{1,20})(?:,\d{1,10}-\d{1,10}-\d{1,20})*$/;
async function mysql(args,timeout=2200){
 try{
  const r=await execute('mariadb',['--no-defaults','--batch','--skip-column-names','--connect-timeout=2',...args],{timeout,maxBuffer:4096,env:{...process.env,MYSQL_PWD:''}});
  return r.stdout.trim();
 }catch{return null;}
}
function bool(v){return v==='ON'||v==='1'?true:v==='OFF'||v==='0'?false:null;}
export async function probeGtid(){
 // Never queries application tables, usernames, replication credentials or hostnames.
 const q=`SELECT @@global.server_id,@@global.log_bin,@@global.read_only,@@global.gtid_strict_mode,@@global.gtid_binlog_pos,@@global.gtid_slave_pos;`;
 const line=(await mysql(['-e',q]))?.split('\n')[0];
 if(!line)return {observed:false,reason:'MariaDB socket/query unavailable',replicationVerified:false};
 const v=line.split('\t');if(v.length!==6)return {observed:false,reason:'Unexpected MariaDB response',replicationVerified:false};
 const [id,log,readonly,strict,binlog,slave]=v;
 const number=Number(id);
 return {observed:true,serverId:Number.isSafeInteger(number)&&number>=0?number:null,
  binaryLogEnabled:bool(log),readOnly:bool(readonly),gtidStrictMode:bool(strict),
  gtidBinlogPos:binlog&&GTID.test(binlog)&&binlog.length<=512?binlog:null,
  gtidSlavePos:slave&&GTID.test(slave)&&slave.length<=512?slave:null,
  replicationVerified:false,note:'Local GTID positions are not proof of an active slave, catch-up, remote equivalence or fencing.'};
}
function compareFiles(previous,current){
 if(!previous)return {baseline:true,added:0,modified:0,removed:0};
 const p=previous.files,c=current.files;let added=0,modified=0,removed=0;
 for(const [name,value] of Object.entries(c)){
  if(!Object.hasOwn(p,name))added++;
  else if(p[name]?.sha256!==value.sha256||p[name]?.size!==value.size)modified++;
 }
 for(const name of Object.keys(p))if(!Object.hasOwn(c,name))removed++;
 return {baseline:false,added,modified,removed};
}
async function writeAtomic(p,content){
 const temp=path.join(STORE,'.'+path.basename(p)+'-'+process.pid+'-'+crypto.randomBytes(6).toString('hex'));
 const file=await fsp.open(temp,'wx',0o600);
 try{await file.writeFile(content,'utf8');await file.sync();}finally{await file.close();}
 try{await fsp.rename(temp,p);}catch(e){await fsp.unlink(temp).catch(()=>{});throw e;}
}
export async function observeScan(){
 const roots=await discover();if(roots.length===0)throw Error('No registered MHC content roots; nothing scanned');
 const previous=await readReport(LATEST);
 if(!previous && fs.existsSync(LATEST))throw Error('Existing observer manifest invalid; refusing to overwrite baseline');
 const {files,count,bytes}=await scanFiles(roots);
 const report={schema:1,scope:'MHC_CONTENT_OBSERVER_ONLY',observedAt:new Date().toISOString(),
  roots:roots.map(r=>r.id),fileCount:count,totalBytes:bytes,files,gtid:await probeGtid()};
 const diff=compareFiles(previous,report);
 if(Buffer.byteLength(JSON.stringify(report))>MAX_REPORT)throw Error('Manifest size limit exceeded');
 await fsp.mkdir(STORE,{recursive:true,mode:0o700});privateDirectory(STORE);
 if(previous)await writeAtomic(PREVIOUS,JSON.stringify(previous));
 await writeAtomic(LATEST,JSON.stringify(report));
 return {status:'SCAN_RECORDED_LOCAL_ONLY',...diff,files:count,bytes,roots:report.roots,gtid:report.gtid,observedAt:report.observedAt};
}
export async function observeStatus(){
 const latest=await readReport(LATEST),old=await readReport(PREVIOUS);
 if(!latest)return {mode:'NOT_SCANNED',gtid:await probeGtid(),replicationVerified:false,fileReplicationVerified:false,haEligible:false,notice:'No manifest yet. Run mhc-full replication scan on an isolated LAB node.'};
 const diff=compareFiles(old,latest);
 // Never return file paths/hashes on Panel/API, even to authenticated admin.
 const ageSec=Math.max(0,Math.floor((Date.now()-Date.parse(latest.observedAt))/1000));
 return {mode:'LOCAL_OBSERVATION_ONLY',observedAt:latest.observedAt,stale:!Number.isFinite(ageSec)||ageSec>300,
  ageSec:Number.isFinite(ageSec)?ageSec:null,rootCount:latest.roots.length,files:latest.fileCount,
  totalBytes:latest.totalBytes,change:diff,gtid:latest.gtid,
  replicationVerified:false,fileReplicationVerified:false,haEligible:false,
  notice:'GTID and file deltas are local observations, NOT cross-node replication, canonical equality, writer rights or HA readiness.'};
}
async function main(){const cmd=process.argv[2]||'status';
 if(cmd==='status'){console.log(JSON.stringify(await observeStatus(),null,2));return;}
 if(cmd==='gtid'){console.log(JSON.stringify(await probeGtid(),null,2));return;}
 if(cmd==='scan'){console.log(JSON.stringify(await observeScan(),null,2));return;}
 throw Error('Usage: mhc-full replication status|gtid|scan (read-only content; scan stores private SHA manifest)');
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))main().catch(e=>{console.error('OBSERVE_ERROR:',e.message);process.exitCode=1;});
