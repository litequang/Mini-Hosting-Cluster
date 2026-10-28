#!/usr/bin/env node
// Fresh-only, resumable installation of the original Panel. No cluster or writer grant.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';import {fileURLToPath,pathToFileURL} from 'node:url';
const PREFIX='/data/data/com.termux/files/usr',MARKER='TEST 0.5.0C-REMOTE-PANEL installed on clean Termux';
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const fail=c=>{throw Error(c);};
export const STAGES=['packages','runtime','identity','panel-admin','services','verify'];
export async function waitForSupervisor(paths,exists=fs.existsSync,pause=ms=>new Promise(r=>setTimeout(r,ms)),attempts=60){for(let i=0;i<attempts;i++){if(paths.every(p=>exists(p)))return;await pause(250);}fail('N1_SUPERVISOR_NOT_READY_RETRY_SAME_RELEASE');}
const footprints=['.config/mhc-full-installer','.local/share/mhc-full-installer','android-hosting-panel','apps','.config/mini-hosting-cluster','.local/share/mini-hosting-cluster','.nginx','.cloudflared'];
function exists(p){return !!fs.lstatSync(p,{throwIfNoEntry:false});}
function safe(p){let v=path.resolve(p);for(;;){if(fs.lstatSync(v,{throwIfNoEntry:false})?.isSymbolicLink())fail('N1_SYMLINK_REFUSED');const up=path.dirname(v);if(up===v)break;v=up;}return p;}
function privateJson(p,fixture=false){safe(p);const s=fs.statSync(p);if(!s.isFile()||s.size>262144||!fixture&&(s.mode&0o077))fail('N1_PRIVATE_STATE_UNSAFE');return JSON.parse(fs.readFileSync(p,'utf8'));}
function atomic(p,bytes,mode=0o600){safe(p);fs.mkdirSync(path.dirname(p),{recursive:true,mode:0o700});const tmp=p+'.'+crypto.randomUUID()+'.tmp',fd=fs.openSync(tmp,'wx',mode);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,p);}
function writeOnce(p,bytes,mode=0o600){safe(p);if(exists(p)){if(!fs.statSync(p).isFile()||!fs.readFileSync(p).equals(Buffer.from(bytes)))fail('N1_EXISTING_FILE_DIFFERS');return;}atomic(p,bytes,mode);}
export function verifyRelease(root,manifestBytes,expected){
 if(!/^[a-f0-9]{64}$/.test(expected)||digest(manifestBytes)!==expected)fail('N1_MANIFEST_CHECKSUM_FAILED');
 const m=JSON.parse(manifestBytes);if(m.format!=='mhc-new-node-v1'||!/^MHC-N1-[A-Za-z0-9._-]{3,65}$/.test(m.version)||!(/^[a-f0-9]{40}$/.test(m.commit))||!Array.isArray(m.files)||m.files.length<10||m.files.length>2000)fail('N1_RELEASE_INVALID');
 const seen=new Set();for(const f of m.files){if(typeof f.path!=='string'||! /^(bin|vendor|scripts)\/[A-Za-z0-9_./-]+$/.test(f.path)&&f.path!=='install.sh'||f.path.split('/').some(p=>!p||p==='.'||p==='..')||seen.has(f.path)||! /^[a-f0-9]{64}$/.test(f.sha256)||![0o600,0o700].includes(f.mode))fail('N1_MANIFEST_PATH_INVALID');seen.add(f.path);const p=safe(path.join(root,f.path));if(!fs.statSync(p).isFile()||digest(fs.readFileSync(p))!==f.sha256)fail('N1_SOURCE_CHECKSUM_FAILED');}
 for(const p of ['bin/new-node-install.mjs','bin/mhc-full-wrapper','bin/node-boot-entry.sh','bin/cluster-authority.mjs','bin/legacy-panel-src/src/server.mjs'])if(!seen.has(p))fail('N1_RELEASE_INCOMPLETE');
 return m;
}
export class FreshInstaller{
 constructor(o={}){this.home=path.resolve(o.home||os.homedir());this.prefix=o.prefix||process.env.PREFIX;this.source=path.resolve(o.source||path.join(path.dirname(fileURLToPath(import.meta.url)),'..'));this.fixture=o.fixture===true;this.execute=o.execute||((cmd,args,options={})=>spawnSync(cmd,args,{encoding:'utf8',timeout:options.timeout||15000,maxBuffer:131072,...options}));this.pause=o.pause||(()=>{});this.stateDir=path.join(this.home,'.local/state/mhc-new-node-install');this.file=path.join(this.stateDir,'progress.json');this.config=path.join(this.home,'.config/mhc-full-installer');this.managed=path.join(this.home,'.local/share/mhc-full-installer');this.panel=path.join(this.home,'android-hosting-panel');this.report=null;}
 command(cmd,args,options={}){const r=this.execute(cmd,args,options);if(r.error||r.status!==0)fail('N1_COMMAND_FAILED_'+path.basename(cmd).replace(/[^A-Za-z0-9]/g,'_').toUpperCase());return (r.stdout||'').trim();}
 hardware(){
  const prop=k=>{try{return this.command('getprop',[k],{timeout:1000}).replace(/[^A-Za-z0-9 _.,:-]/g,'').slice(0,80);}catch{return null;}};
  const st=fs.statfsSync(this.home);let battery=null;try{const b=JSON.parse(this.command('termux-battery-status',[],{timeout:5000}));if(Number.isFinite(b.percentage))battery={percentage:b.percentage,temperature:Number.isFinite(b.temperature)?b.temperature:null};}catch{}
  const architecture=this.fixture?'arm64':os.arch(),memoryMiB=Math.floor(os.totalmem()/1048576),freeDiskMiB=Math.floor(Number(st.bavail)*Number(st.bsize)/1048576);
  return {model:prop('ro.product.model'),android:prop('ro.build.version.release'),sdk:prop('ro.build.version.sdk'),soc:prop('ro.soc.model'),architecture,cpuCores:os.availableParallelism(),memoryMiB,freeDiskMiB,battery,recommendedRole:memoryMiB<2048?'MANAGEMENT_LIGHT':'HOSTING_CAPABLE_STANDBY',androidPermissionsVerified:false,actions:['OPEN_TERMUX_BOOT_ONCE','ALLOW_UNRESTRICTED_BATTERY_TERMUX_BOOT_API',...(!battery?['CHECK_TERMUX_API_APP_AND_PERMISSION']:[])]};
 }
 preflight(){
  if(!this.fixture&&(this.prefix!==PREFIX||process.platform!=='android'&&process.platform!=='linux'||os.arch()!=='arm64'))fail('N1_STANDARD_ARM64_TERMUX_REQUIRED');
  safe(this.home);safe(this.stateDir);for(const p of ['apps/thophuongpro/.env','.config/mini-hosting-cluster/node.json','.config/mini-hosting-cluster/ha.json'])if(exists(path.join(this.home,p)))fail('N1_PRODUCTION_OR_LEGACY_CLUSTER_REFUSED');
  const existing=exists(this.file)?privateJson(this.file,this.fixture):null;
  if(existing){if(existing.schema!==1||existing.home!==this.home||!/^MHC-N1-/.test(existing.version)||!Array.isArray(existing.completed))fail('N1_JOURNAL_INVALID');}
  else{
   for(const p of footprints)if(exists(path.join(this.home,p)))fail('N1_EXISTING_INSTALLATION_REFUSED');
   const boot=path.join(this.home,'.termux/boot');if(exists(boot)&&fs.readdirSync(safe(boot)).length)fail('N1_EXISTING_BOOT_REFUSED');
   for(const s of ['amh-panel','mhc-authority-agent','mhc-panel-tunnel','mhc-lab-p31','mhc-lab-p33','mini-web','named-tunnel'])if(exists(path.join(this.prefix,'var/service',s)))fail('N1_EXISTING_SERVICE_REFUSED');
   const data=path.join(this.prefix,'var/lib/mysql');if(exists(data)&&fs.readdirSync(safe(data),{withFileTypes:true}).some(d=>d.isDirectory()&&!['mysql','performance_schema','sys','test'].includes(d.name)))fail('N1_EXISTING_DATABASE_REFUSED');
  }
  const hardware=this.hardware();if(hardware.architecture!=='arm64'||hardware.freeDiskMiB<3072)fail('N1_HARDWARE_REQUIREMENTS_NOT_MET');
  return {fresh:!existing,resumable:!!existing,hardware,journal:existing};
 }
 save(){atomic(this.file,JSON.stringify(this.report,null,2)+'\n');}
 async run(manifestFile,expected){
  const release=verifyRelease(this.source,fs.readFileSync(safe(manifestFile)),expected),p=this.preflight();
  if(p.journal&&(p.journal.commit!==release.commit||p.journal.manifestSha256!==expected))fail('N1_RESUME_REQUIRES_ORIGINAL_RELEASE');
  this.report=p.journal||{schema:1,home:this.home,version:release.version,commit:release.commit,manifestSha256:expected,startedAt:new Date().toISOString(),completed:[],hardware:p.hardware,phase:'IN_PROGRESS',role:'STANDBY_NO_WRITER_GRANT',joined:false,routeReady:false,siteReady:false,eligiblePrimary:false};this.save();
  for(const stage of STAGES){
   for(const receipts of Object.values(this.report.receipts||{}))for(const r of receipts){const p=safe(path.join(r.area==='prefix'?this.prefix:this.home,r.path));if(!exists(p)||digest(fs.readFileSync(p))!==r.sha256)fail('N1_COMPLETED_OUTPUT_CHANGED');}
   if(this.report.completed.includes(stage))continue;
   this.report.currentStage=stage;this.save();this.pause(stage,'before');
   try{await this[stage.replace('-','_')](release);this.receipts(stage,release);this.pause(stage,'after');this.report.completed.push(stage);this.report.errorCode=null;this.save();}
   catch(e){this.report.phase='INTERRUPTED';this.report.errorCode=/^N1_[A-Z0-9_]+$/.test(e.message)?e.message:'N1_STAGE_FAILED';this.save();throw e;}
  }
  this.report.phase='INSTALLED';this.report.installedAt=new Date().toISOString();this.report.currentStage=null;this.save();return this.status();
 }
 receipts(stage,release){
  let files=[];
  if(stage==='runtime'){const vendor='vendor/mini-hosting-warm-standby-v1/mini-hosting-dr-v1/panel/';files=[...release.files.filter(f=>f.path.startsWith('bin/')).map(f=>'.local/share/mhc-full-installer/'+f.path),...release.files.filter(f=>f.path.startsWith(vendor)&&/^(src|public|tools)\//.test(f.path.slice(vendor.length))).map(f=>'android-hosting-panel/'+f.path.slice(vendor.length)),...release.files.filter(f=>f.path.startsWith('bin/legacy-panel-src/')).map(f=>'android-hosting-panel/'+f.path.slice('bin/legacy-panel-src/'.length)),'mhc-full','.termux/boot/10-mhc-start','.config/mhc-full-installer/installed','.config/mhc-full-installer/new-node-release.json'];files=[...new Set(files)];}
  if(stage==='identity')files=['.config/mhc-full-installer/node-identity.json','.config/mhc-full-installer/node-proof-key.pem','.config/mhc-full-installer/node-proof-key.pub','.ssh/id_ed25519_mhc_node','.ssh/id_ed25519_mhc_node.pub'];
  if(stage==='panel-admin')files=['.config/mhc-full-installer/panel-login-once','android-hosting-panel/data/admin.json'];
  this.report.receipts ||= {};this.report.receipts[stage]=files.map(p=>({area:'home',path:p,sha256:digest(fs.readFileSync(safe(path.join(this.home,p))))}));
 }
 status(){const s=privateJson(this.file,this.fixture);return {version:s.version,sourceCommit:s.commit,phase:s.phase,currentStage:s.currentStage,completed:s.completed,hardware:s.hardware,nodeId:s.nodeId,role:s.role,joined:false,routeReady:false,siteReady:false,eligiblePrimary:false,errorCode:s.errorCode||null,localChecks:s.localChecks||null};}
 packages(){
  this.command('pkg',['update','-y'],{timeout:300000,stdio:'inherit'});
  this.command('pkg',['install','-y','nodejs','nginx','php','php-fpm','mariadb','openssh','termux-services','termux-api','cloudflared','git','curl','coreutils','python','rsync','tar','gzip','unzip','openssl-tool','util-linux'],{timeout:600000,stdio:'inherit'});
  for(const c of ['node','nginx','php','php-fpm','mariadb','mariadb-dump','sshd','sv','flock','python3','cloudflared'])this.command('sh',['-c','command -v "$1"','n1-check',c]);
 }
 runtime(release){
  for(const f of release.files.filter(f=>f.path.startsWith('bin/'))){const dest=path.join(this.managed,f.path);writeOnce(dest,fs.readFileSync(path.join(this.source,f.path)),f.mode);}
  writeOnce(path.join(this.home,'mhc-full'),fs.readFileSync(path.join(this.source,'bin/mhc-full-wrapper')),0o700);
  const vendor='vendor/mini-hosting-warm-standby-v1/mini-hosting-dr-v1/panel/';
  for(const f of release.files.filter(f=>f.path.startsWith(vendor))){const rel=f.path.slice(vendor.length);if(!/^(src|public|tools)\//.test(rel)&&rel!=='package.json')continue;const override='bin/legacy-panel-src/'+rel,selected=release.files.some(x=>x.path===override)?override:f.path;writeOnce(path.join(this.panel,rel),fs.readFileSync(path.join(this.source,selected)),f.mode);}
  for(const f of release.files.filter(f=>f.path.startsWith('bin/legacy-panel-src/')))writeOnce(path.join(this.panel,f.path.slice('bin/legacy-panel-src/'.length)),fs.readFileSync(path.join(this.source,f.path)),f.mode);
  writeOnce(path.join(this.home,'.termux/boot/10-mhc-start'),fs.readFileSync(path.join(this.source,'bin/node-boot-entry.sh')),0o700);
  writeOnce(path.join(this.config,'installed'),MARKER+'\n');
  writeOnce(path.join(this.config,'new-node-release.json'),JSON.stringify({schema:1,version:release.version,commit:release.commit,manifestSha256:this.report.manifestSha256})+'\n');
 }
 identity(){
  const file=path.join(this.config,'node-identity.json');let id;
  if(exists(file)){id=privateJson(file,this.fixture);if(!/^[a-f0-9-]{36}$/.test(id.nodeId)||id.kind!=='new-node-standby')fail('N1_IDENTITY_CHANGED');}
  else{id={schema:1,nodeId:crypto.randomUUID(),label:(this.report.hardware.model||'Android Node').replace(/[^A-Za-z0-9 _.-]/g,' ').trim().slice(0,60),kind:'new-node-standby',createdAt:new Date().toISOString()};atomic(file,JSON.stringify(id)+'\n');}
  const key=path.join(this.config,'node-proof-key.pem');if(!exists(key)){const keys=crypto.generateKeyPairSync('ed25519');atomic(key,keys.privateKey.export({type:'pkcs8',format:'pem'}));}
  safe(key);if(!this.fixture&&(fs.statSync(key).mode&0o077))fail('N1_PRIVATE_KEY_UNSAFE');const publicKey=crypto.createPublicKey(fs.readFileSync(key));writeOnce(path.join(this.config,'node-proof-key.pub'),publicKey.export({type:'spki',format:'pem'}));
  const ssh=path.join(this.home,'.ssh/id_ed25519_mhc_node');if(!exists(ssh)){safe(ssh);fs.mkdirSync(path.dirname(ssh),{recursive:true,mode:0o700});this.command('ssh-keygen',['-q','-t','ed25519','-N','','-C','mhc-node','-f',ssh]);}else if(!this.fixture&&(fs.statSync(safe(ssh)).mode&0o077))fail('N1_SSH_KEY_UNSAFE');
  this.report.nodeId=id.nodeId;
 }
 async panel_admin(){
  const security=await import(pathToFileURL(path.join(this.panel,'src/security.mjs'))),config=await import(pathToFileURL(path.join(this.panel,'src/config.mjs')));config.ensureDirs();
  const file=path.join(this.config,'panel-login-once');let password;
  if(exists(file)){safe(file);if(fs.statSync(file).mode&0o077)fail('N1_PRIVATE_PASSWORD_UNSAFE');password=fs.readFileSync(file,'utf8').trim();}
  else{password=security.makePassword();atomic(file,password+'\n');}
  if(!security.configured())security.setPassword(password);else if(!security.checkPassword(password))fail('N1_EXISTING_ADMIN_DIFFERS');
 }
 async services(){
  const s=path.join(this.prefix,'var/service'),log=path.join(this.prefix,'var/log/sv/amh-panel');fs.mkdirSync(safe(log),{recursive:true,mode:0o700});
  writeOnce(path.join(s,'amh-panel/run'),'#!'+this.prefix+'/bin/sh\ncd "$HOME/android-hosting-panel" || exit 1\nexec '+this.prefix+'/bin/node src/server.mjs 2>&1\n',0o700);
  writeOnce(path.join(s,'amh-panel/log/run'),'#!'+this.prefix+'/bin/sh\nexec '+this.prefix+'/bin/svlogd -tt '+log+'\n',0o700);
  // Agent is installed but inert until pairing; it cannot heartbeat without its own credentials.
  writeOnce(path.join(s,'mhc-authority-agent/down'),'');
  writeOnce(path.join(s,'mhc-authority-agent/run'),'#!'+this.prefix+'/bin/sh\nexec '+this.prefix+'/bin/node "$HOME/.local/share/mhc-full-installer/bin/cluster-authority.mjs" watch\n',0o700);
  for(const svc of ['sshd','mysqld'])if(!exists(path.join(s,svc,'run')))fail('N1_TERMUX_SERVICE_MISSING');
  // MariaDB is shared infrastructure, but this is a verified fresh device. Preserve its
  // package service before pinning the new instance to Unix socket access only.
  const sqlRun=path.join(s,'mysqld/run'),sqlCommand='#!'+this.prefix+'/bin/sh\nexec '+this.prefix+'/bin/mariadbd --skip-networking --skip-name-resolve 2>&1\n',backup=path.join(this.stateDir,'mysqld-package-run');
  if(fs.readFileSync(safe(sqlRun),'utf8')!==sqlCommand){if(exists(backup))fail('N1_DATABASE_SERVICE_CHANGED');atomic(backup,fs.readFileSync(sqlRun));atomic(sqlRun,sqlCommand,0o700);}
  // Hosting runtimes are prerequisites only; no default website or public listener.
  for(const name of ['nginx','php-fpm'])if(exists(path.join(s,name,'run')))writeOnce(path.join(s,name,'down'),'');
  this.command('bash',['-c','. "$PREFIX/etc/profile.d/start-services.sh"'],{timeout:15000,stdio:'inherit',env:{...process.env,HOME:this.home,PREFIX:this.prefix,SVDIR:s}});
  await waitForSupervisor(['mysqld','amh-panel','sshd'].map(name=>path.join(s,name,'supervise/ok')));
  for(const name of ['mysqld','amh-panel']){this.command('sv-enable',[name],{env:{...process.env,SVDIR:s}});this.command('sv',['-w','15','up',path.join(s,name)],{timeout:18000});}
  this.command('sv-enable',['sshd'],{env:{...process.env,SVDIR:s}});
  let up=this.execute('sv',['-w','3','up',path.join(s,'sshd')],{encoding:'utf8',timeout:5000});
  await new Promise(r=>setTimeout(r,500));
  if(up.status!==0||!this.command('sv',['status',path.join(s,'sshd')]).startsWith('run:')){
   const listeners=[];
   for(const p of fs.readdirSync('/proc').filter(x=>/^\d+$/.test(x))){try{const dir='/proc/'+p,cmd=fs.readFileSync(dir+'/cmdline','utf8').split('\0')[0],stat=fs.readFileSync(dir+'/stat','utf8').split(') ').at(-1).split(' ');if(fs.statSync(dir).uid===process.getuid()&&stat[1]==='1'&&(cmd===this.prefix+'/bin/sshd'||cmd==='sshd'||/^sshd:.*\[listener\]/.test(cmd)))listeners.push(Number(p));}catch{}}
   if(listeners.length!==1)fail('N1_SSH_LISTENER_REVIEW_REQUIRED');
   // Only the daemon listener is stopped; authenticated session children survive.
   process.kill(listeners[0],'SIGTERM');
   up=this.execute('sv',['-w','10','up',path.join(s,'sshd')],{encoding:'utf8',timeout:12000});
   if(up.status!==0){this.execute(this.prefix+'/bin/sshd',[],{stdio:'ignore',timeout:5000});fail('N1_SSH_SUPERVISOR_FAILED_LISTENER_RESCUE_ATTEMPTED');}
  }
 }
 async verify(){
  for(let i=0;i<20;i++){try{const r=await fetch('http://127.0.0.1:9090/',{signal:AbortSignal.timeout(1000)});await r.arrayBuffer();if(r.status===200){this.report.localChecks={panelHttp:200,sqlSelect1:this.command('mariadb',['--no-defaults','-u','root','-N','-B','-e','SELECT 1'])==='1',sqlNetworkingDisabled:this.command('mariadb',['--no-defaults','-u','root','-N','-B','-e','SELECT @@skip_networking'])==='1',managedPanel:true,managedSsh:this.command('sv',['status',path.join(this.prefix,'var/service/sshd')]).startsWith('run:'),bootEntryPrepared:true,androidRebootVerified:false,agent:'WAITING_FOR_JOIN',website:'NOT_CONFIGURED',writerGranted:false};if(!this.report.localChecks.sqlSelect1||!this.report.localChecks.sqlNetworkingDisabled||!this.report.localChecks.managedSsh)fail('N1_LOCAL_SERVICE_HEALTH_FAILED');return;}}catch(e){if(e.message==='N1_LOCAL_SERVICE_HEALTH_FAILED')throw e;}await new Promise(r=>setTimeout(r,500));}fail('N1_PANEL_HEALTH_FAILED');
 }
}
async function main(){const [mode,manifest,expected]=process.argv.slice(2),n=new FreshInstaller();if(mode==='--plan'){const p=n.preflight();return {fresh:p.fresh,resumable:p.resumable,hardware:p.hardware,changesMade:false};}if(mode==='--status')return n.status();if(mode!=='--install'||!manifest||!expected)fail('N1_USAGE_INVALID');return n.run(manifest,expected);}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(v=>console.log(JSON.stringify(v,null,2))).catch(e=>{console.error(/^N1_[A-Z0-9_]+$/.test(e.message)?e.message:'N1_INSTALL_FAILED_INSPECT_PRIVATE_PROGRESS');process.exitCode=1;});
