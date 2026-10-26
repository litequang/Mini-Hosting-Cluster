// MHC v0.4C.1 — isolated LAB incremental file delta handoff, NOT live replication.
// No production paths, no SSH commands, no database, no automatic deletion of served files.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const HOME=process.env.HOME||os.homedir();
const LAB=path.join(HOME,'mhc-file-lab');
const SOURCE=path.join(LAB,'source'), REPLICA=path.join(LAB,'replica');
const REPORTS=path.join(LAB,'reports'), OUTBOX=path.join(LAB,'outbox'), CANDIDATES=path.join(LAB,'candidates');
const SCOPE='MHC_ISOLATED_FILE_LAB_ONLY', SHA=/^[0-9a-f]{64}$/;
const MAX_FILES=20000, MAX_BYTES=8*1024**3, MAX_FILE=512*1024**2, MAX_DEPTH=25;
const badNames=new Set(['.env','.htaccess','.htpasswd','wp-config.php','id_rsa','id_ed25519','authorized_keys','ha.json','online.json','node.json','private.key']);
const info={scope:SCOPE,liveReplication:false,gtidCoupled:false,standbyReady:false,haEligible:false};
function deny(message){throw Error(message);}
function assertName(s){
 if(typeof s!=='string'||s.length<1||s==='.'||s==='..'||s.includes('\\')||/[\x00-\x1f\x7f]/.test(s)||badNames.has(s.toLowerCase())||s.startsWith('.'))deny('Unsafe or secret file/directory name in LAB');
}
function validateRel(rel){
 if(typeof rel!=='string'||rel.startsWith('/')||rel.length>2048)deny('Invalid manifest path');
 const bits=rel.split('/');if(bits.length>MAX_DEPTH||bits.some(s=>!s))deny('Invalid path depth');
 bits.forEach(assertName);return bits;
}
function ensurePathLab(p){
 const r=path.resolve(p),b=path.resolve(LAB);
 if(r!==b&&!r.startsWith(b+path.sep))deny('Path must remain inside isolated LAB');
 return r;
}
async function noLinksTo(p,{exists=true}={}){
 const abs=ensurePathLab(p), parts=path.relative(LAB,abs).split(path.sep).filter(Boolean);
 let cursor=LAB;
 const l=await fsp.lstat(LAB).catch(()=>null);
 if(!l||!l.isDirectory()||l.isSymbolicLink())deny('LAB root is absent or unsafe');
 for(const part of parts){
  assertName(part);cursor=path.join(cursor,part);
  const s=await fsp.lstat(cursor).catch(()=>null);
  if(!s){if(exists)deny('Required LAB path does not exist');return;}
  if(s.isSymbolicLink()||(!s.isFile()&&!s.isDirectory()))deny('Symlink or special path rejected');
 }
}
async function directory(p,create=false){
 ensurePathLab(p);
 if(create){
  await noLinksTo(path.dirname(p));
  await fsp.mkdir(p,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});
 }
 await noLinksTo(p);
 if(!(await fsp.lstat(p)).isDirectory())deny('Expected a directory');
}
async function setup(){await directory(LAB);}
async function hashFile(file){
 const fd=await fsp.open(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 try{
  const before=await fd.stat();if(!before.isFile()||before.size>MAX_FILE)deny('Unsupported or oversized input file');
  const h=crypto.createHash('sha256');
  for await(const c of fd.createReadStream({autoClose:false,highWaterMark:128*1024}))h.update(c);
  const after=await fd.stat(),live=await fsp.lstat(file);
  if(!live.isFile()||live.isSymbolicLink()||before.ino!==after.ino||before.ino!==live.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs)deny('File changed while hashing');
  return {size:before.size,sha256:h.digest('hex')};
 }finally{await fd.close();}
}
async function scan(root){
 await directory(root);
 let count=0,bytes=0;const files=Object.create(null);
 const walk=async(p,parts)=>{
  if(parts.length>MAX_DEPTH)deny('Directory nesting excessive');
  const entries=await fsp.readdir(p,{withFileTypes:true});entries.sort((a,b)=>a.name.localeCompare(b.name));
  for(const e of entries){
   assertName(e.name);const rel=[...parts,e.name];validateRel(rel.join('/'));
   const file=path.join(p,e.name),st=await fsp.lstat(file);
   if(st.isSymbolicLink())deny('Symlink in LAB content is forbidden');
   if(st.isDirectory())await walk(file,rel);
   else if(st.isFile()){
    if(++count>MAX_FILES||(bytes+=st.size)>MAX_BYTES)deny('Scan size limits exceeded');
    files[rel.join('/')]=await hashFile(file);
   }else deny('Device/socket/FIFO in LAB content forbidden');
  }
 };
 await walk(root,[]);
 return {schema:1,scope:SCOPE,files,fileCount:count,totalBytes:bytes};
}
function checkManifest(data){
 if(!data||data.schema!==1||data.scope!==SCOPE||!data.files||Array.isArray(data.files)||typeof data.files!=='object')deny('Untrusted manifest schema');
 const keys=Object.keys(data.files);if(keys.length>MAX_FILES)deny('Manifest too large');
 let bytes=0;
 for(const rel of keys){validateRel(rel);const d=data.files[rel];if(!d||!Number.isSafeInteger(d.size)||d.size<0||d.size>MAX_FILE||!SHA.test(d.sha256))deny('Unsafe file metadata');bytes+=d.size;}
 if(bytes>MAX_BYTES||data.fileCount!==keys.length||data.totalBytes!==bytes)deny('Manifest totals mismatch');
 return data;
}
async function jsonRead(p,max=12*1024**2){
 await noLinksTo(p);const s=await fsp.lstat(p);if(!s.isFile()||s.size>max)deny('Invalid metadata file');
 return JSON.parse(await fsp.readFile(p,'utf8'));
}
async function jsonWrite(p,data){
 await noLinksTo(path.dirname(p));
 const file=await fsp.open(p,'wx',0o600);
 try{await file.writeFile(JSON.stringify(data,null,2)+'\n');await file.sync();}finally{await file.close();}
}
async function copyChecked(from,to,expected){
 await noLinksTo(from);await noLinksTo(path.dirname(to));
 const before=await hashFile(from);
 if(before.sha256!==expected.sha256||before.size!==expected.size)deny('Source contents changed since manifest');
 const inp=await fsp.open(from,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 let out;
 try{
  out=await fsp.open(to,'wx',0o600);
  for await(const data of inp.createReadStream({autoClose:false,highWaterMark:128*1024}))await out.writeFile(data);
  await out.sync();
 }finally{await out?.close();await inp.close();}
 const after=await hashFile(to);const sourceAfter=await hashFile(from);
 if(after.sha256!==expected.sha256||after.size!==expected.size||sourceAfter.sha256!==expected.sha256||sourceAfter.size!==expected.size)deny('Copy integrity mismatch');
}
async function makeParent(root,rel){
 const bits=validateRel(rel);let dir=root;
 for(const name of bits.slice(0,-1)){
  dir=path.join(dir,name);await directory(dir,true);
 }
}
const equal=(a,b)=>a&&b&&a.sha256===b.sha256&&a.size===b.size;
function computeDelta(base,next){
 const changed=[],removed=[];let bytes=0;
 for(const [name,meta] of Object.entries(next.files))if(!equal(base.files[name],meta)){changed.push(name);bytes+=meta.size;}
 for(const name of Object.keys(base.files))if(!next.files[name])removed.push(name);
 changed.sort();removed.sort();return {changed,removed,bytes};
}
async function manifestCmd(which){
 const root=which==='source'?SOURCE:which==='replica'?REPLICA:null;if(!root)deny('Use manifest source|replica');
 const data=await scan(root);await directory(REPORTS,true);
 const name=which+'-'+Date.now()+'-'+crypto.randomBytes(3).toString('hex')+'.json';
 await jsonWrite(path.join(REPORTS,name),data);
 return {...info,status:'MANIFEST_SAVED',which,path: 'mhc-file-lab/reports/'+name,files:data.fileCount,bytes:data.totalBytes};
}
async function bundleCmd(basename){
 if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}\.json$/.test(basename))deny('Baseline must be a safe manifest filename');
 const base=checkManifest(await jsonRead(path.join(REPORTS,basename)));
 const current=await scan(SOURCE),diff=computeDelta(base,current);
 await directory(OUTBOX,true);
 const id='delta-'+Date.now()+'-'+crypto.randomBytes(5).toString('hex');
 const target=path.join(OUTBOX,id);await directory(target,true);
 try{
  await directory(path.join(target,'payload'),true);
  for(const rel of diff.changed){
   await makeParent(path.join(target,'payload'),rel);
   await copyChecked(path.join(SOURCE,rel),path.join(target,'payload',rel),current.files[rel]);
  }
  await jsonWrite(path.join(target,'meta.json'),{schema:1,scope:SCOPE,id,baseline:base,next:current,changed:diff.changed,removed:diff.removed});
  return {...info,status:'DELTA_BUNDLE_BUILT',id,changed:diff.changed.length,removed:diff.removed.length,payloadBytes:diff.bytes,notice:'Transfer this private bundle via a pinned SSH channel. Files are staged, not applied to running sites.'};
 }catch(e){await fsp.rm(target,{recursive:true,force:true}).catch(()=>{});throw e;}
}
async function verifyBundle(folder){
 const full=ensurePathLab(folder);await directory(full);
 const m=await jsonRead(path.join(full,'meta.json'));
 if(m.schema!==1||m.scope!==SCOPE||!/^(delta-[0-9]{13}-[0-9a-f]{10})$/.test(m.id)||path.basename(full)!==m.id)deny('Invalid bundle identity');
 const base=checkManifest(m.baseline),next=checkManifest(m.next),expected=computeDelta(base,next);
 if(JSON.stringify(m.changed)!==JSON.stringify(expected.changed)||JSON.stringify(m.removed)!==JSON.stringify(expected.removed))deny('Changed-file list mismatch');
 const payload=path.join(full,'payload');const got=await scan(payload);
 if(got.fileCount!==expected.changed.length)deny('Payload file count does not match delta');
 for(const k of expected.changed)if(!equal(got.files[k],next.files[k]))deny('Payload SHA-256 mismatch');
 return {m,base,next,expected,full};
}
async function stageCmd(id){
 if(!/^delta-[0-9]{13}-[0-9a-f]{10}$/.test(id))deny('Invalid bundle id');
 const box=path.join(LAB,'inbox',id);const alt=path.join(OUTBOX,id);
 const pick=fs.existsSync(box)?box:alt;
 const {next,base,expected,full}=await verifyBundle(pick);
 const current=await scan(REPLICA);
 if(JSON.stringify(current.files)!==JSON.stringify(base.files))deny('Replica baseline diverged: refresh baseline, do not merge blindly');
 await directory(CANDIDATES,true);
 const output=path.join(CANDIDATES,id);if(fs.existsSync(output))deny('Candidate already exists; refusing overwrite');
 await fsp.mkdir(output,{mode:0o700}); // exclusive reservation; never reuse an existing candidate
 try{
  // Copy files unchanged from verified replica, additions/updates from verified delta payload.
  for(const [rel,meta] of Object.entries(next.files)){
   await makeParent(output,rel);
   const src=expected.changed.includes(rel)?path.join(full,'payload',rel):path.join(REPLICA,rel);
   await copyChecked(src,path.join(output,rel),meta);
  }
  const result=await scan(output);
  if(JSON.stringify(result.files)!==JSON.stringify(next.files))deny('Candidate checksum mismatch');
  await jsonWrite(path.join(REPORTS,id+'-receipt.json'),{schema:1,scope:SCOPE,id,createdAt:new Date().toISOString(),fileCount:next.fileCount,sha256:crypto.createHash('sha256').update(JSON.stringify(next.files)).digest('hex'),source:'LAB_CANDIDATE_NOT_LIVE'});
  return {...info,status:'CANDIDATE_VERIFIED_OFFLINE',id,files:next.fileCount,changed:expected.changed.length,removedFromCandidate:expected.removed.length,notice:'Replica and serving sites remain unchanged; candidate is NOT a GTID-consistent or HA-ready replica.'};
 }catch(e){await fsp.rm(output,{recursive:true,force:true}).catch(()=>{});throw e;}
}
async function statusCmd(){
 let manifests=0,bundles=0,candidates=0;
 for(const [p,k] of [[REPORTS,'manifests'],[OUTBOX,'bundles'],[CANDIDATES,'candidates']]){
  if(fs.existsSync(p)){await directory(p);const items=await fsp.readdir(p);if(k==='manifests')manifests=items.filter(x=>x.endsWith('.json')).length;
   if(k==='bundles')bundles=items.filter(x=>x.startsWith('delta-')).length;
   if(k==='candidates')candidates=items.filter(x=>x.startsWith('delta-')).length;}
 }
 return {...info,mode:'LAB_FILE_DELTA_STAGING_ONLY',manifests,bundles,candidates};
}
async function main(){
 const [cmd,arg,...extra]=process.argv.slice(2);if(extra.length)deny('Too many arguments');
 if(cmd==='status'&&!fs.existsSync(LAB)){console.log(JSON.stringify({...info,mode:'NOT_CONFIGURED',manifests:0,bundles:0,candidates:0},null,2));return;}
 await setup();let result;
 if(cmd==='manifest')result=await manifestCmd(arg);
 else if(cmd==='bundle')result=await bundleCmd(arg);
 else if(cmd==='verify'||cmd==='verify-outbox'){if(!arg||!/^delta-[0-9]{13}-[0-9a-f]{10}$/.test(arg))deny('Invalid bundle id');const target=cmd==='verify-outbox'?path.join(OUTBOX,arg):(fs.existsSync(path.join(LAB,'inbox',arg))?path.join(LAB,'inbox',arg):path.join(OUTBOX,arg));const x=await verifyBundle(target);result={...info,status:'DELTA_CHECKSUM_VERIFIED',id:arg,changed:x.expected.changed.length,removed:x.expected.removed.length};}
 else if(cmd==='stage')result=await stageCmd(arg);
 else if(cmd==='status')result=await statusCmd();
 else deny('Usage: mhc-full file-sync manifest source|replica | bundle BASELINE_FILENAME | verify BUNDLE_ID | verify-outbox BUNDLE_ID | stage BUNDLE_ID | status');
 console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))main().catch(e=>{console.error('FILE_SYNC_LAB_ERROR:',e.message);process.exitCode=1;});
// Shared hardened LAB primitives for C3; importing this module never runs its CLI.
export {scan,checkManifest,verifyBundle,copyChecked,makeParent,directory,noLinksTo,jsonRead,jsonWrite,hashFile,LAB,SOURCE,REPLICA};
