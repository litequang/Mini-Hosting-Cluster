// Authenticated, resumable SQL admission gate installation on a managed LAB Standby.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {atomicPrivate} from './site-sync.mjs';
import {fenceConfigPath,readFenceConfig,sqlFenceStatements,inspectSqlFence,sqlFenceOpen} from './p4-fence.mjs';
const fail=code=>{throw Error(code);};
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function privateJson(file){
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.mode&0o077)fail('P4_INSTALL_JOURNAL_UNSAFE');
 return JSON.parse(fs.readFileSync(file));
}
function backupFile(source,target,expected){
 if(!fs.existsSync(target))fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
 fs.chmodSync(target,0o600);
 if(!fs.lstatSync(target).isFile()||fs.lstatSync(target).isSymbolicLink()||hash(fs.readFileSync(target))!==expected)fail('P4_INSTALL_BACKUP_CHANGED');
}
export async function installSqlFence(c,job){
 const n=c.node,s=await n.authorityState(),row=s.nodes.find(x=>x.nodeId===c.id.nodeId);
 if(process.env.PREFIX!=='/data/data/com.termux/files/usr'||!['fence-install','restore'].includes(job?.type)||row?.standby?.job?.id!==job.id||row.standby.job.status!=='RUNNING')fail('P4_INSTALL_VIA_SITE_JOB_REQUIRED');
 if(!['IDLE','COMMITTED','CANCELLED'].includes(s.p33.phase)||s.p33.lease?.nodeId===c.id.nodeId||n.state().desired!=='STANDBY'||await n.httpProbe()||fs.existsSync(n.childrenFile)||s.siteSync?.run&&['CREATING','APPLYING','BLOCKED'].includes(s.siteSync.run.status))fail('P4_INSTALL_REQUIRES_STANDBY');
 const dir=n.candidate.safe(n.dir+'/p4-install'),journal=dir+'/install.json';
 fs.mkdirSync(dir,{recursive:true,mode:0o700});fs.chmodSync(dir,0o700);
 let state=fs.existsSync(journal)?privateJson(journal):null,config=readFenceConfig(n.home);
 if(state?.stage!=='VERIFIED'&&state&&state.jobId!==job.id)fail('P4_INSTALL_RESUME_OWN_JOB_REQUIRED');
 if(state&&config)n.revoke(); // Also recovers a crash between the temporary GRANT and its finally block.
 n.database(true);
 if(!state){
  if(config)fail('P4_EXISTING_CONFIG_WITHOUT_JOURNAL');
  n.dataset();
  if(n.sql("SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='mhc_p33_lab'",true)!=='0')fail('P4_EXISTING_TRIGGERS_REFUSED');
  const tables=n.sql("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='mhc_p33_lab' AND ENGINE='InnoDB' ORDER BY TABLE_NAME",true).split('\n').filter(Boolean);
  const total=Number(n.sql("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='mhc_p33_lab'",true));
  if(tables.length!==total||total<12||total>32||tables.some(t=>!/^wp_[a-z_]+$/.test(t)&&t!=='mhc_p33_probe'))fail('P4_MANAGED_TABLE_SCOPE_INVALID');
  // Record ownership and the intended secret before any file/DDL mutation. A crash resumes this job.
  config={schema:1,protocol:1,siteId:'mhc-p33-wordpress-v1',database:'mhc_p33_lab',user:'mhc_p33_web',lockName:'mhc_p4_'+crypto.randomBytes(32).toString('hex'),tables};
  state={jobId:job.id,stage:'PREPARING',config,oldPhpSha256:hash(fs.readFileSync(n.base+'/php/php-fpm.conf')),oldDatasetSha256:hash(fs.readFileSync(n.base+'/dataset.json'))};
  atomicPrivate(journal,state);
 }
 if(!state.config||!['PREPARING','PREPARED','VERIFIED'].includes(state.stage))fail('P4_INSTALL_JOURNAL_INVALID');
 if(config&&JSON.stringify(config)!==JSON.stringify(state.config))fail('P4_INSTALL_CONFIG_CHANGED');
 config=state.config;
 backupFile(n.base+'/php/php-fpm.conf',dir+'/old-php.conf',state.oldPhpSha256);
 backupFile(n.base+'/dataset.json',dir+'/old-dataset.json',state.oldDatasetSha256);
 if(state.stage==='PREPARING'){
  // Only this journal owns this temporary dump. An interrupted dump is never accepted as a backup.
  const temp=dir+'/before.sql.partial',fd=fs.openSync(temp,'w',0o600);let dump;
  try{dump=spawnSync('mariadb-dump',['--no-defaults','-u','root','--single-transaction','--routines','--triggers','mhc_p33_lab'],{stdio:['ignore',fd,'pipe'],timeout:30000});fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  if(dump.status!==0||fs.statSync(temp).size<100)fail('P4_PRIVATE_BACKUP_FAILED');
  fs.renameSync(temp,dir+'/before.sql');state={...state,stage:'PREPARED',backupSha256:hash(fs.readFileSync(dir+'/before.sql'))};atomicPrivate(journal,state);
 }
 if(hash(fs.readFileSync(dir+'/before.sql'))!==state.backupSha256)fail('P4_INSTALL_BACKUP_CHANGED');
 let php=fs.readFileSync(dir+'/old-php.conf','utf8');
 if(/request_terminate_timeout/.test(php))fail('P4_EXISTING_PHP_TIMEOUT_REQUIRES_REVIEW');
 php+='\nrequest_terminate_timeout = 10s\nrequest_terminate_timeout_track_finished = yes\n';
 const current=fs.readFileSync(n.base+'/php/php-fpm.conf','utf8');
 if(hash(current)!==state.oldPhpSha256&&current!==php)fail('P4_PHP_CONFIG_CHANGED_DURING_INSTALL');
 const oldDataset=fs.readFileSync(dir+'/old-dataset.json'),manifest=JSON.parse(oldDataset);
 const desired={...manifest,files:manifest.files.map(f=>({...f,sha256:hash(f.path==='php/php-fpm.conf'?php:fs.readFileSync(path.join(n.base,f.path)))}))};
 const currentDataset=fs.readFileSync(n.base+'/dataset.json');
 if(hash(currentDataset)!==state.oldDatasetSha256&&JSON.stringify(JSON.parse(currentDataset))!==JSON.stringify(desired))fail('P4_DATASET_CHANGED_DURING_INSTALL');
 for(const f of manifest.files)if(f.path!=='php/php-fpm.conf'&&hash(fs.readFileSync(path.join(n.base,f.path)))!==f.sha256)fail('P4_DATASET_CHANGED_DURING_INSTALL');
 if(state.stage==='VERIFIED'){
  if(current!==php||JSON.stringify(JSON.parse(currentDataset))!==JSON.stringify(desired))fail('P4_VERIFIED_INSTALL_CHANGED');
  return inspectSqlFence(n,config);
 }
 // Changing data/configs outside this journal is never folded into a new "verified" manifest.
 if(!readFenceConfig(n.home))atomicPrivate(fenceConfigPath(n.home),config);
 const expected=sqlFenceStatements(config.database,config.tables,config.lockName,config.user);
 const existing=n.sql("SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='mhc_p33_lab' ORDER BY TRIGGER_NAME",true).split('\n').filter(Boolean);
 if(existing.some(v=>!expected.some(e=>e.name===v)))fail('P4_EXISTING_TRIGGERS_REFUSED');
 for(const e of expected)if(!existing.includes(e.name))n.sql(e.sql,true);
 const proof=inspectSqlFence(n,config);
 if(sqlFenceOpen(n,config))fail('P4_INSTALL_SQL_GATE_ALREADY_OPEN');
 try{
  n.sql("GRANT SELECT, INSERT, UPDATE, DELETE ON mhc_p33_lab.* TO 'mhc_p33_web'@'localhost'",true);
  const denied=n.command('mariadb',['--defaults-file='+n.base+'/db-client.cnf','-e',"UPDATE wp_options SET option_value=option_value WHERE option_name='blogname'"]);
  if(denied.status===0||!String(denied.stderr).includes('MHC_P4_LEASE_REQUIRED'))fail('P4_SQL_GATE_WRITE_DENIAL_NOT_PROVEN');
 }finally{n.revoke();}
 fs.writeFileSync(n.base+'/php/php-fpm.conf',php,{mode:0o600});atomicPrivate(n.base+'/dataset.json',desired);
 n.dataset();state={...state,stage:'VERIFIED',guardSha256:proof.guardSha256};atomicPrivate(journal,state);
 return proof;
}
