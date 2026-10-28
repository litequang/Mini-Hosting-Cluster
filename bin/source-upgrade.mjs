#!/usr/bin/env node
// Transactional source-only LAB upgrade. Never installs packages, changes credentials or routes.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export const LAB_NODES=['4ed4c025-62ae-4c2a-8d68-65dd76ecf550','4a9672d1-bb62-4286-946a-a78b73e57b24'];
export const PANEL_FILES=['src/server.mjs','src/system.mjs','src/mhc-integration.mjs','src/mhc-remote-access.mjs','public/index.html','public/app.js','public/style.css'];
export const LEGACY_BOOT_SHA='dfb55b50c571c154843dd035e0c272d8c7a82b5959312e737d36399b112dca85';
export const OLD_CANONICAL_SHA='82142c143ce49c2e259b8ce68f1dae1bcad2b13ac4368117e752e558e66d027f';
export const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
export const supportedRuntime=(platform,prefix)=>['android','linux'].includes(platform)&&prefix==='/data/data/com.termux/files/usr';
const fail=code=>{throw Error(code);};
const exists=p=>{try{return fs.lstatSync(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function privateDir(p){fs.mkdirSync(p,{recursive:true,mode:0o700});if(fs.lstatSync(p).isSymbolicLink())fail('UNSAFE_DIRECTORY');fs.chmodSync(p,0o700);}
function atomic(p,bytes,mode=0o600){fs.mkdirSync(path.dirname(p),{recursive:true,mode:0o700});const t=p+'.mhc-'+crypto.randomUUID();try{fs.writeFileSync(t,bytes,{mode,flag:'wx'});fs.chmodSync(t,mode);fs.renameSync(t,p);}finally{if(exists(t))fs.unlinkSync(t);}}
const save=(p,v)=>atomic(p,JSON.stringify(v,null,2)+'\n');
export class SourceUpgrade{
 constructor(options={}){
  this.home=path.resolve(options.home||os.homedir());this.prefix=options.prefix||process.env.PREFIX||'';
  this.state=path.join(this.home,'.local/state/mhc-source-upgrade');this.fixture=options.fixture===true;
  this.command=options.command||((cmd,args)=>spawnSync(cmd,args,{encoding:'utf8',timeout:20000,maxBuffer:524288,env:{...process.env,HOME:this.home,PREFIX:this.prefix,SVDIR:path.join(this.prefix,'var/service')}}));
  this.services=options.services||{status:n=>this.serviceStatus(n),set:(n,up)=>this.checked('sv',['-w','15',up?'up':'down',path.join(this.prefix,'var/service',n)],'SERVICE_'+n+'_FAILED')};
  this.acquire=options.acquire||((p)=>fs.readFileSync(p));this.syntax=options.syntax||((p,e)=>this.checkSyntax(p,e));
  this.health=options.health||((before,expected)=>this.realHealth(before,expected));this.hook=options.hook||(()=>{});
 }
 checked(cmd,args,code){const r=this.command(cmd,args);if(r.status!==0||r.error)fail(code);return r.stdout;}
 safe(p){const rel=path.relative(this.home,p);if(rel.startsWith('..')||path.isAbsolute(rel))fail('DESTINATION_OUTSIDE_HOME');let q=this.home;for(const part of rel.split(path.sep)){q=path.join(q,part);if(exists(q)?.isSymbolicLink())fail('SYMLINK_DESTINATION');}return p;}
 destination(e){
  if(typeof e.area!=='string'||typeof e.path!=='string'||e.path.includes('\\')||e.path.split('/').some(s=>!s||s==='.'||s==='..'))fail('MANIFEST_PATH_INVALID');
  let p;
  if(e.area==='managed'&&/^bin\/[A-Za-z0-9_./-]+$/.test(e.path))p=path.join(this.home,'.local/share/mhc-full-installer',e.path);
  else if(e.area==='panel'&&PANEL_FILES.includes(e.path))p=path.join(this.home,'android-hosting-panel',e.path);
  else if(e.area==='home'&&e.path==='mhc-full')p=path.join(this.home,e.path);
  else if(e.area==='boot'&&['10-mhc-start','10-start-hosting'].includes(e.path))p=path.join(this.home,'.termux/boot',e.path);
  else fail('MANIFEST_DESTINATION_DENIED');
  return this.safe(p);
 }
 gate(){
  if(!this.fixture&&!supportedRuntime(process.platform,this.prefix))fail('TERMUX_REQUIRED');
  for(const p of ['apps/thophuongpro/.env','.config/mini-hosting-cluster/ha.json','.config/mini-hosting-cluster/node.json','.config/mhc-full-installer/install-incomplete'])if(exists(path.join(this.home,p)))fail('PRODUCTION_OR_INCOMPLETE_NODE');
  const active=this.safe(path.join(this.home,'.local/state/mhc-p33-node/state.json'));if(exists(active)&&json(active).desired==='ACTIVE')fail('P33_QUIESCE_MANAGED_WRITER_BEFORE_SOURCE_UPGRADE');
  const cfg=path.join(this.home,'.config/mhc-full-installer');
  if(fs.readFileSync(path.join(cfg,'installed'),'utf8').trim()!=='TEST 0.5.0C-REMOTE-PANEL installed on clean Termux')fail('UNKNOWN_INSTALLER_MARKER');
  this.nodeId=json(this.safe(path.join(cfg,'node-identity.json'))).nodeId;if(!LAB_NODES.includes(this.nodeId))fail('NODE_NOT_APPROVED_LAB');
  for(const p of ['android-hosting-panel/src/server.mjs','android-hosting-panel/data/admin.json','.config/mhc-full-installer/authority.json'])if(!exists(this.safe(path.join(this.home,p))))fail('REQUIRED_EXISTING_STATE_MISSING');
  for(const n of ['amh-panel','mhc-authority-agent'])if(!exists(path.join(this.prefix,'var/service',n,'run')))fail('MANAGEMENT_SERVICE_MISSING');
 }
 serviceStatus(n){const r=this.command('sv',['status',path.join(this.prefix,'var/service',n)]);const m=/^run:.*?\(pid (\d+)\)/.exec(r.stdout||'');return {running:!!m,pid:m?Number(m[1]):null};}
 shared(){const r=this.command(process.execPath,[path.join(this.home,'.local/share/mhc-full-installer/bin/cluster-authority.mjs'),'status']);if(r.status!==0)fail('AUTHORITY_STATUS_FAILED');const s=JSON.parse(r.stdout);if(s.writeLeaseGranted!==false||s.mode!=='SHARED_AUTHORITY_PREPARE_ONLY')fail('AUTHORITY_SAFETY_MISMATCH');const node=s.nodes?.find(n=>n.nodeId===this.nodeId);if(!node)fail('AUTHORITY_NODE_MISSING');return {clusterId:s.clusterId,revision:s.revision,epoch:s.epoch,lastSeenAt:node.lastSeenAt,telemetryRecent:node.telemetryRecent};}
 async baseline(){const services=Object.fromEntries(['amh-panel','mhc-authority-agent'].map(n=>[n,this.services.status(n)]));if(Object.values(services).some(s=>!s.running))fail('MANAGEMENT_NOT_HEALTHY_BEFORE_UPGRADE');return {services,shared:this.fixture?null:this.shared()};}
 async realHealth(before,expected){
  const end=Date.now()+60000;let last='MANAGEMENT_HEALTH_FAILED';
  while(Date.now()<end){try{
   for(const n of ['amh-panel','mhc-authority-agent']){const s=this.services.status(n);if(!s.running||s.pid===before.services[n].pid)fail('PROCESS_NOT_RELOADED_'+n);}
   const root=await fetch('http://127.0.0.1:9090/',{signal:AbortSignal.timeout(4000)});if(root.status!==200)fail('PANEL_HTTP_FAILED');
   const asset=await fetch('http://127.0.0.1:9090/app.js',{signal:AbortSignal.timeout(4000)});if(asset.status!==200||digest(Buffer.from(await asset.arrayBuffer()))!==expected)fail('PANEL_ASSET_MISMATCH');
   const s=this.shared();if(s.clusterId!==before.shared.clusterId||s.revision!==before.shared.revision||s.epoch!==before.shared.epoch)fail('SHARED_STATE_CHANGED');
   if(!s.telemetryRecent||!s.lastSeenAt||s.lastSeenAt===before.shared.lastSeenAt)fail('FRESH_HEARTBEAT_REQUIRED');return s;
  }catch(e){last=e.message;await pause(1000);}}
  fail(last);
 }
 checkSyntax(p,e){let cmd,args;if(e.path.endsWith('.mjs')){cmd=process.execPath;args=['--check',p];}else if(e.path.endsWith('.js')){cmd=process.execPath;args=['--check',p];}else if(e.path.endsWith('.sh')||e.path==='mhc-full'){cmd='bash';args=['-n',p];}else return;this.checked(cmd,args,'SOURCE_SYNTAX_FAILED');}
 async load(packageDir,expectedManifest){
  this.gate();const root=path.resolve(packageDir);if(fs.lstatSync(root).isSymbolicLink()||fs.lstatSync(path.join(root,'manifest.json')).isSymbolicLink()||fs.lstatSync(path.join(root,'upgrader.mjs')).isSymbolicLink())fail('PACKAGE_SYMLINK_DENIED');
  const raw=fs.readFileSync(path.join(root,'manifest.json'));const hash=digest(raw);if(expectedManifest&&hash!==expectedManifest)fail('MANIFEST_HASH_MISMATCH');
  const m=JSON.parse(raw);if(m.format!=='mhc-source-upgrade-v1'||!/^MHC-LAB-[A-Za-z0-9._-]{3,70}$/.test(m.version)||!/^[a-f0-9]{40}$/.test(m.commit)||!Array.isArray(m.files)||m.files.length<10||m.files.length>300)fail('MANIFEST_INVALID');
  if(digest(fs.readFileSync(path.join(root,'upgrader.mjs')))!==m.engineSha256)fail('UPGRADER_HASH_MISMATCH');
  const seen=new Set();for(const e of m.files){const dest=this.destination(e);if(seen.has(dest)||!/^payload\/[0-9]+(?:\.[a-z]+)?$/.test(e.source)||!/^[a-f0-9]{64}$/.test(e.sha256)||![0o600,0o700].includes(e.mode))fail('MANIFEST_ENTRY_INVALID');seen.add(dest);}
  for(const f of PANEL_FILES)if(!m.files.some(e=>e.area==='panel'&&e.path===f)||!m.files.some(e=>e.area==='managed'&&e.path==='bin/legacy-panel-src/'+f))fail('PANEL_MANIFEST_INCOMPLETE');
  for(const f of ['bin/cluster-authority.mjs','bin/node-monitor.mjs','bin/source-upgrade.mjs','bin/node-boot.sh','bin/node-doctor.sh','bin/legacy-panel.sh'])if(!m.files.some(e=>e.area==='managed'&&e.path===f))fail('MANAGED_MANIFEST_INCOMPLETE');
  if(!m.files.some(e=>e.area==='home'&&e.path==='mhc-full')||!m.files.some(e=>e.area==='boot'&&e.path==='10-mhc-start'))fail('BOOT_OR_LAUNCHER_MISSING');
  const boot=this.safe(path.join(this.home,'.termux/boot/10-start-hosting')),canonical=this.safe(path.join(this.home,'.termux/boot/10-mhc-start'));
  if(exists(boot)&&digest(fs.readFileSync(boot))!==LEGACY_BOOT_SHA)fail('UNKNOWN_LEGACY_BOOT_REQUIRES_REVIEW');
  const newBoot=m.files.find(e=>e.area==='boot');if(exists(canonical)&&![OLD_CANONICAL_SHA,newBoot.sha256].includes(digest(fs.readFileSync(canonical))))fail('UNKNOWN_CANONICAL_BOOT_REQUIRES_REVIEW');
  const stage=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-upgrade-stage-'));fs.chmodSync(stage,0o700);
  try{let total=0;for(let i=0;i<m.files.length;i++){const e=m.files[i],source=path.join(root,e.source);if(fs.lstatSync(path.dirname(source)).isSymbolicLink()||!fs.lstatSync(source).isFile()||fs.lstatSync(source).isSymbolicLink())fail('PACKAGE_PAYLOAD_UNSAFE');const bytes=Buffer.from(await this.acquire(source,e));if(digest(bytes)!==e.sha256)fail('SOURCE_HASH_MISMATCH');total+=bytes.length;const ext=path.extname(e.path)||'.sh',p=path.join(stage,i+ext);fs.writeFileSync(p,bytes,{mode:e.mode});this.syntax(p,e);e.stage=p;}
   if(!this.fixture){const space=fs.statfsSync(this.home);if(space.bavail*space.bsize<total*3+16*1024*1024)fail('INSUFFICIENT_BACKUP_SPACE');}
   for(const f of PANEL_FILES){const a=m.files.find(e=>e.area==='panel'&&e.path===f),b=m.files.find(e=>e.area==='managed'&&e.path==='bin/legacy-panel-src/'+f);if(a.sha256!==b.sha256)fail('LIVE_MANAGED_MANIFEST_DRIFT');}
   return {manifest:m,hash,stage,retired:boot};
  }catch(e){fs.rmSync(stage,{recursive:true});throw e;}
 }
 mismatches(p){return p.manifest.files.filter(e=>{const f=this.destination(e);return !exists(f)||digest(fs.readFileSync(f))!==e.sha256||(!(this.fixture&&process.platform==='win32')&&(fs.statSync(f).mode&0o777)!==e.mode);}).map(e=>e.area+':'+e.path).concat(exists(p.retired)?['boot:10-start-hosting']:[]);}
 async plan(dir,hash){const p=await this.load(dir,hash);try{return {version:p.manifest.version,commit:p.manifest.commit,manifestSha256:p.hash,fileCount:p.manifest.files.length,changes:this.mismatches(p),services:Object.fromEntries(['amh-panel','mhc-authority-agent'].map(n=>[n,this.services.status(n)]))};}finally{fs.rmSync(p.stage,{recursive:true});}}
 lock(){this.safe(this.state);privateDir(this.state);const l=path.join(this.state,'lock');try{fs.mkdirSync(l,{mode:0o700});}catch(e){if(e.code==='EEXIST')fail('UPGRADE_LOCKED_REVIEW_PENDING_TRANSACTION');throw e;}save(path.join(l,'owner.json'),{pid:process.pid,at:new Date().toISOString()});return ()=>fs.rmSync(l,{recursive:true});}
 snapshot(tx,targets){const entries=[];targets.forEach((target,i)=>{this.safe(target);const st=exists(target),e={target:path.relative(this.home,target),exists:!!st};if(st){if(!st.isFile())fail('BACKUP_NOT_REGULAR_FILE');e.mode=st.mode&0o777;e.sha256=digest(fs.readFileSync(target));fs.copyFileSync(target,path.join(tx,'file-'+i));fs.chmodSync(path.join(tx,'file-'+i),0o600);}entries.push(e);});return entries;}
 async restore(tx,record){
  for(const n of ['mhc-authority-agent','amh-panel'])this.services.set(n,false);
  record.entries.forEach((e,i)=>{const p=this.safe(path.join(this.home,e.target));if(e.exists){const bytes=fs.readFileSync(path.join(tx,'file-'+i));if(digest(bytes)!==e.sha256)fail('BACKUP_HASH_MISMATCH');atomic(p,bytes,e.mode);}else if(exists(p))fs.unlinkSync(p);});
  for(const n of ['amh-panel','mhc-authority-agent'])this.services.set(n,record.before.services[n].running);
  for(let i=0;i<record.entries.length;i++){const e=record.entries[i],p=path.join(this.home,e.target);if(e.exists?(!exists(p)||digest(fs.readFileSync(p))!==e.sha256):!!exists(p))fail('ROLLBACK_FILE_VERIFY_FAILED');}
  const app=path.join(this.home,'android-hosting-panel/public/app.js');await this.health(record.before,digest(fs.readFileSync(app)));
  record.phase='ROLLED_BACK';record.rolledBackAt=new Date().toISOString();save(path.join(tx,'transaction.json'),record);
 }
 async apply(dir,hash){
  const p=await this.load(dir,hash);let unlock;try{unlock=this.lock();}catch(e){fs.rmSync(p.stage,{recursive:true});throw e;}let tx,record;
  try{
   for(const d of fs.readdirSync(this.state).filter(n=>n.startsWith('tx-'))){const f=path.join(this.state,d,'transaction.json');if(exists(f)&&!['DONE','ROLLED_BACK'].includes(json(f).phase))fail('PENDING_TRANSACTION_REQUIRES_ROLLBACK');}
   const before=await this.baseline();if(!this.mismatches(p).length){const stamp=path.join(this.state,'current.json');const current=exists(stamp)?json(stamp):null;if(current?.manifestSha256!==p.hash)save(stamp,{version:p.manifest.version,commit:p.manifest.commit,manifestSha256:p.hash,transaction:null,appliedAt:new Date().toISOString()});return {status:'ALREADY_CURRENT',version:p.manifest.version,manifestSha256:p.hash};}
   tx=path.join(this.state,'tx-'+new Date().toISOString().replace(/[^0-9]/g,'')+'-'+crypto.randomBytes(3).toString('hex'));privateDir(tx);
   const targets=p.manifest.files.map(e=>this.destination(e)).concat([p.retired,path.join(this.state,'current.json')]);
   record={schema:1,version:p.manifest.version,commit:p.manifest.commit,manifestSha256:p.hash,phase:'BACKED_UP',before,entries:this.snapshot(tx,targets)};
   const configBackup=path.join(tx,'management-config');privateDir(configBackup);
   for(const n of ['amh-panel','mhc-authority-agent','sshd','mhc-panel-tunnel'])for(const f of ['run','finish','down','log/run']){const src=path.join(this.prefix,'var/service',n,f);if(exists(src)?.isFile()){const out=path.join(configBackup,n,f);privateDir(path.dirname(out));fs.copyFileSync(src,out);fs.chmodSync(out,0o600);}}
   const bootDir=path.join(this.home,'.termux/boot');if(exists(bootDir))for(const n of fs.readdirSync(bootDir)){const src=path.join(bootDir,n);if(exists(src)?.isFile()){privateDir(path.join(tx,'boot-before'));fs.copyFileSync(src,path.join(tx,'boot-before',n));}}
   save(path.join(tx,'transaction.json'),record);await this.hook('backed-up');
   record.phase='APPLYING';save(path.join(tx,'transaction.json'),record);
   for(const n of ['mhc-authority-agent','amh-panel'])this.services.set(n,false);
   for(const e of p.manifest.files){atomic(this.destination(e),fs.readFileSync(e.stage),e.mode);await this.hook('file-written',e);}
   if(exists(p.retired))fs.unlinkSync(p.retired);
   for(const n of ['amh-panel','mhc-authority-agent'])this.services.set(n,true);
   record.phase='VERIFYING';save(path.join(tx,'transaction.json'),record);
   if(this.mismatches(p).length)fail('APPLIED_FILES_MISMATCH');
   const shared=await this.health(before,p.manifest.files.find(e=>e.area==='panel'&&e.path==='public/app.js').sha256);
   save(path.join(this.state,'current.json'),{version:p.manifest.version,commit:p.manifest.commit,manifestSha256:p.hash,transaction:path.basename(tx),appliedAt:new Date().toISOString()});
   record.phase='DONE';save(path.join(tx,'transaction.json'),record);
   return {status:'APPLIED',version:p.manifest.version,commit:p.manifest.commit,fileCount:p.manifest.files.length,transaction:path.basename(tx),manifestSha256:p.hash,shared};
  }catch(e){if(record){try{await this.restore(tx,record);}catch{record.phase='ROLLBACK_FAILED';save(path.join(tx,'transaction.json'),record);throw Error('ROLLBACK_FAILED_RESCUE_REQUIRED:'+path.basename(tx));}throw Error('APPLY_FAILED_ROLLED_BACK:'+e.message+':'+path.basename(tx));}throw e;
  }finally{unlock();fs.rmSync(p.stage,{recursive:true});}
 }
 async verify(dir,hash){const p=await this.load(dir,hash);try{const changes=this.mismatches(p);if(changes.length)fail('INSTALLED_MANIFEST_MISMATCH');const current=json(path.join(this.state,'current.json'));if(current.version!==p.manifest.version||current.commit!==p.manifest.commit||current.manifestSha256!==p.hash)fail('INSTALLED_VERSION_RECORD_MISMATCH');const services=Object.fromEntries(['amh-panel','mhc-authority-agent'].map(n=>[n,this.services.status(n)]));if(Object.values(services).some(s=>!s.running))fail('INSTALLED_SERVICE_NOT_RUNNING');const shared=this.fixture?null:this.shared();if(shared&&!shared.telemetryRecent)fail('INSTALLED_TELEMETRY_NOT_RECENT');return {status:'VERIFIED',version:p.manifest.version,commit:p.manifest.commit,fileCount:p.manifest.files.length,manifestSha256:p.hash,services,shared};}finally{fs.rmSync(p.stage,{recursive:true});}}
 async rollback(id){this.gate();if(!/^tx-[0-9]{14,20}-[a-f0-9]{6}$/.test(id))fail('TRANSACTION_ID_INVALID');const unlock=this.lock();try{const tx=path.join(this.state,id),record=json(path.join(tx,'transaction.json'));if(record.phase==='ROLLED_BACK')return {status:'ALREADY_ROLLED_BACK',transaction:id};await this.restore(tx,record);return {status:'ROLLED_BACK',transaction:id};}finally{unlock();}}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),mode=args[0],at=args.indexOf('--package'),hashAt=args.indexOf('--manifest-sha256');
 try{const u=new SourceUpgrade(),dir=at>=0?args[at+1]:path.dirname(fileURLToPath(import.meta.url)),hash=hashAt>=0?args[hashAt+1]:undefined;
  const result=mode==='--plan'?await u.plan(dir,hash):mode==='--apply'?await u.apply(dir,hash):mode==='--verify'?await u.verify(dir,hash):mode==='--rollback'?await u.rollback(args[1]):fail('USAGE_PLAN_APPLY_VERIFY_ROLLBACK');console.log(JSON.stringify(result,null,2));
 }catch(e){console.error('MHC_SOURCE_UPGRADE_FAILED '+String(e.message).replace(/[^A-Za-z0-9_:. -]/g,'').slice(0,250));process.exitCode=1;}
}
