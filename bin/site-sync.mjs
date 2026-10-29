// Existing managed LAB site only. Target credentials stay local, app SQL remains SELECT-only.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const fail=c=>{throw Error(c);};
export function atomicPrivate(p,v){
 fs.mkdirSync(path.dirname(p),{recursive:true,mode:0o700});const t=p+'.'+crypto.randomUUID(),fd=fs.openSync(t,'wx',0o600);
 try{fs.writeFileSync(fd,JSON.stringify(v)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(t,p);
 if(process.platform==='win32')return;const dir=fs.openSync(path.dirname(p),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
}
export function assertSyncStandby(s,nodeId,job){
 const r=s?.p33,run=s?.siteSync?.run;
 if(!r?.enabled||r.phase!=='COMMITTED'||r.epoch!==job.sync?.epoch||r.operationId!==job.sync?.operationId||r.primaryNodeId!==job.sync?.sourceNodeId||nodeId!==job.sync?.targetNodeId||r.lease?.nodeId===nodeId&&r.lease.expiresAt>Date.now()||run?.id!==job.sync?.runId||!['APPLYING','BLOCKED'].includes(run.status))fail('SITE_SYNC_AUTHORITY_CHANGED');
}
function treeHashes(dir,out={},prefix=''){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const rel=prefix+e.name,p=path.join(dir,e.name);if(e.isDirectory())treeHashes(p,out,rel+'/');else if(e.isFile())out[rel]=hash(fs.readFileSync(p));else fail('SITE_SYNC_UNSAFE_TREE');}return out;}
function safeTree(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isSymbolicLink()||!e.isDirectory()&&!e.isFile())fail('SITE_SYNC_UNSAFE_TREE');if(e.isDirectory())safeTree(p);}}
export function pruneSyncCache(c,job,type){
 const root=path.resolve(c.work),current=path.join(root,job.id);
 if(!/^[a-f0-9-]{36}$/.test(job.id)||!['backup','apply'].includes(type))fail('SITE_SYNC_CACHE_INVALID');
 atomicPrivate(current+'/sync-cache.json',{scope:'MHC_P40_CACHE',id:job.id,nodeId:c.id.nodeId,type,at:Date.now()});
 const entries=[];
 for(const e of fs.readdirSync(root,{withFileTypes:true})){
  if(!e.isDirectory()||e.isSymbolicLink()||!/^[a-f0-9-]{36}$/.test(e.name))continue;
  const dir=path.join(root,e.name),f=dir+'/sync-cache.json';if(!fs.existsSync(f)||fs.lstatSync(f).isSymbolicLink())continue;
  const m=JSON.parse(fs.readFileSync(f));if(m.scope==='MHC_P40_CACHE'&&m.id===e.name&&m.nodeId===c.id.nodeId&&m.type===type)entries.push({dir,at:m.at});
 }
 // Only old completed P4.0 caches owned by this node. N1.3 restore/backups are never selected.
 for(const e of entries.sort((a,b)=>Number(b.dir===current)-Number(a.dir===current)||b.at-a.at).slice(2)){if(e.dir===current||path.dirname(e.dir)!==root)continue;safeTree(e.dir);fs.rmSync(e.dir,{recursive:true});}
}
export async function applyStandbySnapshot(c,job,snapshot,o){
 const {read,php,archive,verify,request,standby}=o,n=c.node,d=path.join(c.work,job.id),marker=n.base+'/sync-maintenance.json';
 fs.mkdirSync(d,{recursive:true,mode:0o700});const journal=d+'/apply.json',content=d+'/content.json',file=d+'/backup.tar.gz',oldContent=d+'/old-content.json',oldManifest=d+'/old-dataset.json';
 const guard=async()=>{const s=await standby(c);assertSyncStandby(s,c.id.nodeId,job);if(n.state().desired==='ACTIVE'||await n.httpProbe()||fs.existsSync(n.childrenFile))fail('SITE_SYNC_TARGET_NOT_STANDBY');n.database(true);return s;};
 if(!snapshot||snapshot.id!==job.snapshotId||snapshot.siteId!=='mhc-p33-wordpress-v1'||snapshot.credentialsIncluded!==false||snapshot.nodeId!==job.sync?.sourceNodeId||snapshot.sourceEpoch!==job.sync?.epoch||!Number.isSafeInteger(snapshot.sourceSnapshotAt)||snapshot.bytes>64*1024*1024)fail('SITE_SYNC_SNAPSHOT_INVALID');
 let state=fs.existsSync(journal)?read(journal):{jobId:job.id,snapshotId:snapshot.id,sha256:snapshot.sha256,stage:'DOWNLOAD'};
 if(state.jobId!==job.id||state.snapshotId!==snapshot.id||state.sha256!==snapshot.sha256)fail('SITE_SYNC_JOURNAL_CONFLICT');
 const applied=()=>({snapshotId:snapshot.id,siteId:snapshot.siteId,sourceNodeId:snapshot.nodeId,targetNodeId:c.id.nodeId,sourceSnapshotAt:snapshot.sourceSnapshotAt,restoreAt:state.restoreAt,sha256:snapshot.sha256,manifestSha256:snapshot.manifestSha256,build:snapshot.build,schema:snapshot.schema,verified:true});
 async function rollback(){
  await guard();
  if(!fs.existsSync(oldContent)||!fs.existsSync(oldManifest))fail('SITE_SYNC_ROLLBACK_BACKUP_MISSING');
  if(hash(fs.readFileSync(oldContent))!==state.oldContentSha256||hash(fs.readFileSync(oldManifest))!==state.oldManifestSha256)fail('SITE_SYNC_ROLLBACK_CHECKSUM_MISMATCH');
  if(fs.existsSync(d+'/old-site')&&JSON.stringify(treeHashes(d+'/old-site'))!==JSON.stringify(state.oldFiles))fail('SITE_SYNC_ROLLBACK_FILES_CHANGED');
  if(fs.existsSync(d+'/old-site')){
   if(fs.existsSync(n.base+'/site')){if(fs.existsSync(d+'/failed-site'))fail('SITE_SYNC_ROLLBACK_JOURNAL_CONFLICT');fs.renameSync(n.base+'/site',d+'/failed-site');}
   fs.renameSync(d+'/old-site',n.base+'/site');
  }
  php(c,'apply',oldContent);php(c,'check',oldContent);atomicPrivate(n.base+'/dataset.json',read(oldManifest));
  if(fs.existsSync(marker))fs.unlinkSync(marker);await verify(c);state.stage='ROLLED_BACK';atomicPrivate(journal,state);
  return {errorCode:state.errorCode||'SITE_SYNC_INTERRUPTED_ROLLED_BACK',rollbackVerified:true};
 }
 if(state.stage==='ROLLED_BACK')return {errorCode:state.errorCode||'SITE_SYNC_INTERRUPTED_ROLLED_BACK',rollbackVerified:true};
 if(state.stage==='APPLYING'||state.stage==='ROLLING_BACK'){
  state.errorCode=state.errorCode||'SITE_SYNC_INTERRUPTED_ROLLED_BACK';state.stage='ROLLING_BACK';atomicPrivate(journal,state);
  try{return await rollback();}catch{return {errorCode:'SITE_SYNC_ROLLBACK_REQUIRED',rollbackVerified:false};}
 }
 try{
  await guard();
  if(state.stage==='VERIFIED'){php(c,'check',content);return {evidence:await verify(c),applied:applied()};}
  n.dataset();
  if(state.stage==='DOWNLOAD'){
   const disk=fs.statfsSync(d);if(Number(disk.bavail)*Number(disk.bsize)<768*1024*1024)fail('SITE_SYNC_DISK_SPACE_REQUIRED');
   atomicPrivate(journal,state);
   for(let start=0;start<snapshot.chunks;start+=3)await Promise.all(Array.from({length:Math.min(3,snapshot.chunks-start)},async(_,offset)=>{
    const index=start+offset,p=d+'/chunk-'+index;if(fs.existsSync(p))return;
    const s=(await request('site-download',{jobId:job.id,index})).site,b=Buffer.from(s.data,'base64');
    if(b.length!==s.size||hash(b)!==s.sha256)fail('SITE_DOWNLOAD_CHECKSUM_MISMATCH');fs.writeFileSync(p+'.tmp',b,{mode:0o600});fs.renameSync(p+'.tmp',p);
   }));
   const fd=fs.openSync(file,'w',0o600);try{for(let i=0;i<snapshot.chunks;i++)fs.writeSync(fd,fs.readFileSync(d+'/chunk-'+i));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
   if(fs.statSync(file).size!==snapshot.bytes||hash(fs.readFileSync(file))!==snapshot.sha256)fail('SITE_BACKUP_CHECKSUM_MISMATCH');
   const unpack=archive('unpack',d+'/stage/site',file,content);if(unpack.manifestSha256!==snapshot.manifestSha256)fail('SITE_BACKUP_MANIFEST_MISMATCH');
   const data=JSON.parse(fs.readFileSync(content));if(data.snapshotAt!==snapshot.sourceSnapshotAt||data.build!==snapshot.build||data.tableSchema!==snapshot.schema)fail('SITE_SYNC_PROVENANCE_MISMATCH');
   await guard();safeTree(n.base+'/site');safeTree(d+'/stage/site');
   php(c,'export-local',oldContent);php(c,'check',oldContent);const old=JSON.parse(fs.readFileSync(oldContent));
   if(old.build!==data.build||old.tableSchema!==data.tableSchema)fail('SITE_SYNC_BUILD_SCHEMA_INCOMPATIBLE');
   // No source wp-config, users, options, salts or SQL password ever enters the portable archive.
   fs.copyFileSync(n.base+'/site/wp-config.php',d+'/stage/site/wp-config.php');fs.chmodSync(d+'/stage/site/wp-config.php',0o600);
   atomicPrivate(oldManifest,read(n.base+'/dataset.json'));state.oldContentSha256=hash(fs.readFileSync(oldContent));state.oldManifestSha256=hash(fs.readFileSync(oldManifest));state.oldFiles=treeHashes(n.base+'/site');state.stage='BACKED_UP';atomicPrivate(journal,state);
  }
  if(state.stage!=='BACKED_UP')fail('SITE_SYNC_JOURNAL_INVALID');
  await guard();if(hash(fs.readFileSync(oldContent))!==state.oldContentSha256||hash(fs.readFileSync(oldManifest))!==state.oldManifestSha256||JSON.stringify(treeHashes(n.base+'/site'))!==JSON.stringify(state.oldFiles))fail('SITE_SYNC_LOCAL_DATA_CHANGED');atomicPrivate(marker,{jobId:job.id,snapshotId:snapshot.id});state.stage='APPLYING';atomicPrivate(journal,state);
  php(c,'apply',content);php(c,'check',content);
  fs.renameSync(n.base+'/site',d+'/old-site');fs.renameSync(d+'/stage/site',n.base+'/site');
  state.restoreAt=Date.now();const previous=read(oldManifest),files=previous.files.map(f=>({...f,sha256:hash(fs.readFileSync(n.base+'/'+f.path))}));
  atomicPrivate(n.base+'/dataset.json',{...previous,files,sourceSnapshot:applied()});
  fs.unlinkSync(marker);const evidence=await verify(c);await guard();
  atomicPrivate(journal,{...state,stage:'VERIFIED'});state.stage='VERIFIED';return {evidence,applied:applied()};
 }catch(e){
  const code=/^SITE_[A-Z0-9_]+$/.test(e.message)?e.message:'SITE_SYNC_APPLY_FAILED';
  if(state.stage==='APPLYING'){
   state.errorCode=code;state.stage='ROLLING_BACK';atomicPrivate(journal,state);
   try{return await rollback();}catch{return {errorCode:'SITE_SYNC_ROLLBACK_REQUIRED',rollbackVerified:false};}
  }
  return {errorCode:code,rollbackVerified:!fs.existsSync(marker)&&!['ROLLING_BACK','VERIFIED'].includes(state.stage)};
 }
}
