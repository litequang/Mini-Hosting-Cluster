// Original Agent/Panel bridge for one MHC-managed LAB site. No LAN peer or SSH transport.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import nodeHttp from 'node:http';import {spawn,spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {sharedSiteRequest,sharedStatus} from './cluster-authority.mjs';
import {ManagedNode,P33_SCOPE,validManagedLease} from './p33-node.mjs';
import {atomicPrivate,applyStandbySnapshot,pruneSyncCache} from './site-sync.mjs';
const SITE='mhc-p33-wordpress-v1',CHUNK=196608,MAX=64*1024*1024,home=()=>process.env.HOME||os.homedir(),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),fail=c=>{throw Error(c);};
export function safePublicGrants(lines){return lines.every(v=>{
 if(/^GRANT USAGE ON \*\.\* TO (`PUBLIC`|PUBLIC)$/.test(v))return true;
 const match=/^GRANT [A-Z ,]+ ON `([^`]+)`\.\* TO (`PUBLIC`|PUBLIC)$/.exec(v);if(!match)return false;
 // MariaDB fresh packages grant PUBLIC access to test/test_%. Those do not match mhc_p33_lab.
 return match[1]==='test'||match[1].replaceAll('\\','')==='test_%';
});}
const errorCode=e=>/^((AUTHORITY_)?SITE_|P33_|N1_)[A-Z0-9_]+$/.test(e.message)?e.message.replace(/^AUTHORITY_/,''):'SITE_PREPARATION_FAILED';
function save(p,v){return atomicPrivate(p,v);}
function read(p){const st=fs.lstatSync(p);if(st.isSymbolicLink()||!st.isFile()||(st.mode&0o077))fail('SITE_PRIVATE_FILE_UNSAFE');return JSON.parse(fs.readFileSync(p));}
function context(){
 if(process.env.PREFIX!=='/data/data/com.termux/files/usr')fail('SITE_TERMUX_REQUIRED');
 const h=home(),node=new ManagedNode(),dir=node.candidate.safe(path.join(h,'.config/mhc-full-installer')),id=read(path.join(dir,'node-identity.json')),a=read(path.join(dir,'authority.json'));
 if(id.nodeId!==a.nodeId||['apps/thophuongpro/.env','.config/mini-hosting-cluster/ha.json','.config/mini-hosting-cluster/node.json'].some(p=>fs.existsSync(path.join(h,p))))fail('SITE_LAB_IDENTITY_REQUIRED');
 const legacy=fs.existsSync(path.join(dir,'p31/config.json')),key=node.candidate.safe(path.join(dir,legacy?'p31/proof-key.pem':'node-proof-key.pem'));
 fs.mkdirSync(node.candidate.safe(path.join(h,'.local/state/mhc-site-standby')),{recursive:true,mode:0o700});
 return {h,node,dir,id,a,key,legacy,work:path.join(h,'.local/state/mhc-site-standby')};
}
function command(cmd,args,options={}){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:120000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe'],...options});if(r.status!==0||r.error)fail((r.stderr||'').match(/\bSITE_[A-Z0-9_]{1,80}\b/)?.[0]||'SITE_'+(cmd==='php'?'PHP_DATA_FAILED':cmd==='python'?'ARCHIVE_FAILED':'COMMAND_FAILED'));return r.stdout;}
function php(c,mode,content){return command('php',[fileURLToPath(new URL('./site-standby-data.php',import.meta.url)),mode],{env:{...process.env,MHC_SITE_BASE:c.node.base,MHC_SITE_CONTENT:content,MHC_SITE_SOCKET:c.node.sql('SELECT @@socket',true)}});}
function archive(mode,site,file,content){return JSON.parse(command('python',[fileURLToPath(new URL('./site-standby-archive.py',import.meta.url)),mode,site,file,content]));}
function sign(c,jobId,fields){const st=fs.lstatSync(c.key);if(st.isSymbolicLink()||(st.mode&0o077))fail('SITE_SIGNING_KEY_UNSAFE');const proof={schema:1,scope:'MHC_SITE_STANDBY_LAB',siteId:SITE,clusterId:c.a.clusterId,nodeId:c.id.nodeId,jobId,checkedAt:Date.now(),...fields};return {proof,signature:crypto.sign(null,Buffer.from(JSON.stringify(proof)),fs.readFileSync(c.key)).toString('base64url')};}
async function requireStandby(c){const s=await sharedStatus('agent');if(s.p33?.lease?.nodeId===c.id.nodeId&&s.p33.lease.expiresAt>Date.now()||c.node.state().desired==='ACTIVE')fail('SITE_ACTIVE_WRITER_REFUSED');if(s.p33?.enabled!==true)fail('SITE_MANUAL_AUTHORITY_REQUIRED');return s;}
function makeConfigs(c){
 const b=c.node.base,p=process.env.PREFIX;for(const x of ['logs','php','nginx'])fs.mkdirSync(path.join(b,x),{recursive:true,mode:0o700});
 const php=`[global]\npid = ${b}/php/php-fpm.pid\nerror_log = ${b}/logs/php-fpm.log\ndaemonize = no\n[www]\nlisten = 127.0.0.1:19133\nlisten.allowed_clients = 127.0.0.1\npm = ondemand\npm.max_children = 2\npm.process_idle_timeout = 5s\nclear_env = yes\nphp_admin_value[memory_limit] = 128M\nphp_admin_flag[log_errors] = on\nphp_admin_flag[display_errors] = off\n`;
 const nginx=`worker_processes 1;\npid ${b}/nginx/nginx.pid;\nerror_log ${b}/logs/nginx-error.log crit;\nevents { worker_connections 64; }\nhttp { include ${p}/etc/nginx/mime.types; access_log off; client_max_body_size 8m; server { listen 127.0.0.1:18133; server_name preview-lab.giaouoc.com; root ${b}/site; index index.php; add_header X-MHC-Node '${c.id.nodeId}' always; location = /wp-cron.php { return 403; } location = /xmlrpc.php { return 403; } location / { try_files $uri $uri/ /index.php?$args; } location ~* ^/wp-content/uploads/.*\\.php$ { return 403; } location ~ /\\. { return 403; } location = /wp-config.php { return 403; } location ~ \\.php$ { try_files $uri =404; include ${p}/etc/nginx/fastcgi_params; fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name; fastcgi_param HTTP_PROXY ''; fastcgi_param HTTPS on; fastcgi_pass 127.0.0.1:19133; } } }\n`;
 for(const [f,v]of [['php/php-fpm.conf',php],['nginx/nginx.conf',nginx]])fs.writeFileSync(path.join(b,f),v,{mode:0o600,flag:'wx'});
}
async function ensureService(c){
 const service=path.join(process.env.PREFIX,'var/service/mhc-lab-p33'),run=`#!/data/data/com.termux/files/usr/bin/sh\nexport HOME=${c.h}\nexec ${process.env.PREFIX}/bin/node ${c.h}/.local/share/mhc-full-installer/bin/p33-node.mjs watch\n`;
 if(fs.existsSync(service)){if(fs.lstatSync(service).isSymbolicLink()||fs.readFileSync(path.join(service,'run'),'utf8')!==run)fail('SITE_EXISTING_SERVICE_DIFFERS');}
 else{fs.mkdirSync(service,{mode:0o700});fs.writeFileSync(path.join(service,'down'),'');fs.writeFileSync(path.join(service,'run'),run,{mode:0o700,flag:'wx'});}
 for(let i=0;i<60&&!fs.existsSync(path.join(service,'supervise/ok'));i++)await sleep(250);
 if(!fs.existsSync(path.join(service,'supervise/ok')))fail('SITE_SUPERVISOR_NOT_READY');
 command(path.join(process.env.PREFIX,'bin/sv-enable'),['mhc-lab-p33'],{env:{...process.env,SVDIR:path.dirname(service)}});command('sv',['-w','10','up',service]);
}
export async function verifyLocalSite(c=context()){
 const s=await sharedStatus('agent');if(validManagedLease(s,c.id.nodeId)&&c.node.state().desired==='ACTIVE'){
  const p=(await c.node.proof(crypto.randomBytes(32).toString('hex'),'ACTIVE')).proof;
  return {ready:true,syncProtocol:1,siteId:SITE,dataset:p.dataset,http:p.httpServing,php:p.wordpress,sql:p.database.writeReadDelete,files:true,writerGate:true,writeDenied:false,activeWriter:true,activeLease:{epoch:p.epoch,operationId:p.operationId},management:Object.values(p.management).every(Boolean),credentialsCopied:false};
 }
 await requireStandby(c);const n=c.node;if(!fs.existsSync(n.base+'/dataset.json'))fail('SITE_WEBSITE_DATABASE_MISSING');const dataset=n.dataset();if(!Object.values(n.management()).every(Boolean)||!n.candidate.statusService('mhc-lab-p33'))fail('SITE_MANAGEMENT_OR_GUARD_NOT_RUNNING');
 n.database(true);if(await n.httpProbe()||fs.existsSync(n.childrenFile))fail('SITE_STANDBY_GATE_NOT_CLOSED');
 command('php-fpm',['-t','-y',path.join(n.base,'php/php-fpm.conf')]);command('nginx',['-t','-p',path.join(n.base,'nginx')+'/', '-c',path.join(n.base,'nginx/nginx.conf')]);
 // A temporary loopback-only GET probe uses the same PHP/FPM/Nginx config and SELECT-only account.
 // It has different ports/PIDs, never a public route, and is reaped after every check or crash retry.
 const probe=path.join(c.work,'probe'),children=[];fs.mkdirSync(probe,{recursive:true,mode:0o700});
 const childFile=path.join(probe,'children.json');
 function reap(){if(!fs.existsSync(childFile))return;for(const p of read(childFile)){try{const st=fs.readFileSync('/proc/'+p.pid+'/stat','utf8').split(') ').slice(1).join(') ').split(' ');if(st[19]===p.start&&Number(st[2])===p.pid)process.kill(-p.pid,'SIGKILL');}catch(e){if(!['ENOENT','ESRCH'].includes(e.code))throw e;}}fs.unlinkSync(childFile);}
 reap();
 for(const [file,src]of [['php.conf','php/php-fpm.conf'],['nginx.conf','nginx/nginx.conf']])fs.writeFileSync(path.join(probe,file),fs.readFileSync(path.join(n.base,src),'utf8').replaceAll('19133','19135').replaceAll('18133','18135').replaceAll(n.base+'/php/php-fpm.pid',probe+'/php.pid').replaceAll(n.base+'/nginx/nginx.pid',probe+'/nginx.pid'),{mode:0o600});
 let http=false;
 try{
  for(const [cmd,args]of [['php-fpm',['-y',probe+'/php.conf','-F']],['nginx',['-p',n.base+'/nginx/','-c',probe+'/nginx.conf','-g','daemon off;']]]){const p=spawn(path.join(process.env.PREFIX,'bin',cmd),args,{detached:true,stdio:'ignore'});p.on('error',()=>{});if(!p.pid)fail('SITE_PROBE_PROCESS_FAILED');children.push(p);save(childFile,children.map(v=>({pid:v.pid,start:fs.readFileSync('/proc/'+v.pid+'/stat','utf8').split(') ').slice(1).join(') ').split(' ')[19]})));}
  for(let i=0;i<24;i++){try{const r=await new Promise((resolve,reject)=>{const req=nodeHttp.request({hostname:'127.0.0.1',port:18135,path:'/',headers:{host:'preview-lab.giaouoc.com'},timeout:1500},res=>{let body='';res.on('data',b=>{body+=b;if(body.length>524288){req.destroy();reject(Error('SITE_PROBE_TOO_LARGE'));}});res.on('end',()=>resolve({status:res.statusCode,node:res.headers['x-mhc-node'],body}));});req.on('error',reject);req.on('timeout',()=>req.destroy());req.end();});if(r.status===200&&r.node===c.id.nodeId&&r.body.includes('MHC Manual Primary LAB')&&!r.body.includes('<?php')){http=true;break;}}catch{}await sleep(250);}
  if(!http)fail('SITE_HTTP_PHP_CONTENT_FAILED');
 }finally{reap();}
 await sleep(200);n.database(true);return {ready:true,syncProtocol:1,siteId:SITE,dataset,http,php:true,sql:true,files:true,writerGate:true,writeDenied:true,management:true,credentialsCopied:false};
}
async function backup(c,job){
 if(job.type==='sync-backup'){
  const s=await sharedStatus('agent');if(!validManagedLease(s,c.id.nodeId)||s.p33.phase!=='COMMITTED'||s.p33.epoch!==job.sync?.epoch||s.p33.operationId!==job.sync?.operationId||s.siteSync?.run?.id!==job.sync?.runId||c.node.state().desired!=='ACTIVE')fail('SITE_SYNC_PRIMARY_LEASE_REQUIRED');
  c.node.dataset();c.node.database(false);
 }else{await requireStandby(c);c.node.dataset();c.node.database(true);}
 const d=path.join(c.work,job.id);fs.mkdirSync(d,{recursive:true,mode:0o700});const file=d+'/backup.tar.gz',meta=d+'/backup.json',content=d+'/content.json';let b;
 if(fs.existsSync(meta)){b=read(meta);if(hash(fs.readFileSync(file))!==b.sha256)fail('SITE_LOCAL_BACKUP_CHANGED');}
 else{php(c,'export',content);const packed=archive('pack',c.node.base+'/site',file,content),bytes=fs.statSync(file).size;if(bytes>MAX)fail('SITE_BACKUP_TOO_LARGE');b={id:job.id,siteId:SITE,bytes,chunks:Math.ceil(bytes/CHUNK),sha256:hash(fs.readFileSync(file)),manifestSha256:packed.manifestSha256,credentialsIncluded:false,...(job.type==='sync-backup'?{sourceSnapshotAt:JSON.parse(fs.readFileSync(content)).snapshotAt,sourceEpoch:job.sync.epoch,build:JSON.parse(fs.readFileSync(content)).build,schema:JSON.parse(fs.readFileSync(content)).tableSchema}:{})};save(meta,b);}
 const fd=fs.openSync(file,'r');try{for(let start=0;start<b.chunks;start+=3)await Promise.all(Array.from({length:Math.min(3,b.chunks-start)},async(_,offset)=>{const index=start+offset,bytes=Buffer.alloc(Math.min(CHUNK,b.bytes-index*CHUNK));fs.readSync(fd,bytes,0,bytes.length,index*CHUNK);await retry(()=>sharedSiteRequest('site-upload',{jobId:job.id,index,data:bytes.toString('base64'),sha256:hash(bytes)}));}));}finally{fs.closeSync(fd);}
 return {backup:b};
}
async function restore(c,job,snapshot){
 await requireStandby(c);if(!snapshot||snapshot.id!==job.snapshotId||snapshot.siteId!==SITE||snapshot.credentialsIncluded!==false||snapshot.bytes>MAX)fail('SITE_BACKUP_INVALID');
 const publicGrants=c.node.sql('SHOW GRANTS FOR PUBLIC',true).split('\n').filter(Boolean);if(!safePublicGrants(publicGrants))fail('SITE_PUBLIC_DATABASE_PRIVILEGES_UNSAFE');
 const d=path.join(c.work,job.id);fs.mkdirSync(d,{recursive:true,mode:0o700});const journal=d+'/restore.json',content=d+'/content.json',file=d+'/backup.tar.gz';let state=fs.existsSync(journal)?read(journal):null;
 if(!state){if(fs.existsSync(c.node.base)||c.node.sql("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='mhc_p33_lab'",true)!=='0'||c.node.sql("SELECT COUNT(*) FROM mysql.user WHERE User='mhc_p33_web'",true)!=='0')fail('SITE_EXISTING_DATA_REFUSED_USE_VERIFY');state={jobId:job.id,snapshotId:snapshot.id,sha256:snapshot.sha256,stage:'DOWNLOAD',createdAt:Date.now()};save(journal,state);}
 if(state.snapshotId!==snapshot.id||state.sha256!==snapshot.sha256)fail('SITE_RESTORE_JOURNAL_CONFLICT');
 const progress=(stage,done=snapshot.bytes)=>retry(()=>siteProgress({jobId:job.id,stage,done,total:snapshot.bytes}));
 if(state.stage==='DOWNLOAD'){
  await progress('DOWNLOADING',0);
  for(let start=0;start<snapshot.chunks;start+=3){await Promise.all(Array.from({length:Math.min(3,snapshot.chunks-start)},async(_,offset)=>{const index=start+offset,p=d+'/chunk-'+index;if(fs.existsSync(p))return;const s=(await retry(()=>sharedSiteRequest('site-download',{jobId:job.id,index}))).site,bytes=Buffer.from(s.data,'base64');if(hash(bytes)!==s.sha256||bytes.length!==s.size)fail('SITE_DOWNLOAD_CHECKSUM_MISMATCH');const tmp=p+'.tmp';fs.writeFileSync(tmp,bytes,{mode:0o600});fs.renameSync(tmp,p);}));if(start%12===0)await progress('DOWNLOADING',Math.min(snapshot.bytes,(start+3)*CHUNK));}
  await progress('VERIFYING_CHECKSUM');
  const fd=fs.openSync(file,'w',0o600);try{for(let i=0;i<snapshot.chunks;i++)fs.writeSync(fd,fs.readFileSync(d+'/chunk-'+i));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  if(fs.statSync(file).size!==snapshot.bytes||hash(fs.readFileSync(file))!==snapshot.sha256)fail('SITE_BACKUP_CHECKSUM_MISMATCH');
  // Extract into a journal-owned staging directory. An interrupted extract resumes by verifying existing bytes.
  await progress('EXTRACTING');const packed=archive('unpack',d+'/stage/site',file,content);if(packed.manifestSha256!==snapshot.manifestSha256)fail('SITE_BACKUP_MANIFEST_MISMATCH');
  state.stage='EXTRACTED';save(journal,state);
 }
 if(state.stage==='EXTRACTED'){
  await progress('INSTALLING');
  if(fs.existsSync(c.node.base)){if(!fs.existsSync(c.node.base+'/restore-owner.json')||read(c.node.base+'/restore-owner.json').jobId!==job.id)fail('SITE_EXISTING_DATA_REFUSED_USE_VERIFY');}
  else{fs.mkdirSync(c.node.base,{mode:0o700});save(c.node.base+'/restore-owner.json',{jobId:job.id,snapshotId:snapshot.id});}
  if(fs.existsSync(d+'/stage/site'))fs.renameSync(d+'/stage/site',c.node.base+'/site');
  if(!fs.existsSync(c.node.base+'/php/php-fpm.conf'))makeConfigs(c);
  if(!c.legacy)save(path.join(c.dir,'site-standby.json'),{schema:1,scope:P33_SCOPE,siteId:SITE,nodeId:c.id.nodeId,clusterId:c.a.clusterId,keyFlavor:'N1'});
  try{php(c,'install',content);}finally{if(fs.existsSync(c.node.base+'/db-client.cnf'))c.node.revoke();}state.stage='INSTALLED';save(journal,state);
 }
 if(state.stage==='INSTALLED'){await progress('RESTORING_DATABASE');try{php(c,'import',content);}finally{c.node.revoke();}state.stage='IMPORTED';save(journal,state);}
 php(c,'check',content);
 if(!fs.existsSync(c.node.base+'/dataset.json')){
  const files=['site/wp-config.php','db-client.cnf','php/php-fpm.conf','nginx/nginx.conf','site/wp-content/themes/p33lab/index.php'].map(p=>({path:p,sha256:hash(fs.readFileSync(c.node.base+'/'+p))}));
  save(c.node.base+'/dataset.json',{schema:3,datasetId:SITE,preparedAt:new Date().toISOString(),originalCredentialsCopied:false,restoreVerified:true,sourceSnapshot:{id:snapshot.id,sha256:snapshot.sha256,nodeId:snapshot.nodeId},files});
 }
 await progress('VERIFYING_SITE');await ensureService(c);const evidence=await verifyLocalSite(c);state.stage='VERIFIED';save(journal,state);return {evidence};
}
async function retry(fn){for(let i=0;i<4;i++)try{return await fn();}catch(e){if(i===3||!/(UNREACHABLE|UNAVAILABLE|API_FAILED)/.test(e.message))throw e;await sleep(500*(i+1));}}
export async function siteProgress(body,request=sharedSiteRequest){try{return await request('site-progress',body);}catch(e){if(!['AUTHORITY_INVALID_ACTION','AUTHORITY_NOT_FOUND'].includes(e.message))throw e;return {progressUnsupported:true};}}
export async function enqueueSiteJob(action,body,request=sharedSiteRequest,delay=sleep){
 // A periodic read-only check takes a few seconds. Wait for it instead of making a user click again.
 // Never preempt backup/restore/manual work or replace its journal.
 for(let i=0;i<12;i++)try{return await request(action,body);}catch(e){
  if(e.message!=='AUTHORITY_SITE_NODE_BUSY')throw e;
  const current=(await request('site-job',{targetNodeId:body.targetNodeId})).site?.job;
  if(current?.type!=='verify'||!['QUEUED','RUNNING','DONE','FAILED'].includes(current.status)||i===11)throw e;
  await delay(400);
 }
}
let task=null,nextPoll=0;
export async function siteAgentTick(){
 if(fs.existsSync(path.join(home(),'.local/state/mhc-source-upgrade/lock')))return;
 if(task||Date.now()<nextPoll)return;nextPoll=Date.now()+2500;
 const c=context(),reply=await sharedSiteRequest('site-poll'),job=reply.site?.job;if(!job)return;
 task=(async()=>{let fields;try{if(['backup','sync-backup'].includes(job.type))fields=await backup(c,job);else if(job.type==='sync-apply')fields=await applyStandbySnapshot(c,job,reply.site.snapshot,{read,php,archive,verify:verifyLocalSite,request:(a,b)=>retry(()=>sharedSiteRequest(a,b)),standby:requireStandby});else if(job.type==='restore')fields=await restore(c,job,reply.site.snapshot);else if(job.type==='verify')fields={evidence:await verifyLocalSite(c)};else if(job.type==='manual')fields={request:job.request,envelope:await c.node.accept(job.request)};else fail('SITE_JOB_TYPE_INVALID');}catch(e){fields={errorCode:errorCode(e).startsWith('SITE_')?errorCode(e):'SITE_'+errorCode(e)};}
  await retry(()=>sharedSiteRequest('site-result',{jobId:job.id,envelope:sign(c,job.id,fields)}));
  if(!fields.errorCode&&['sync-backup','sync-apply'].includes(job.type))pruneSyncCache(c,job,job.type==='sync-backup'?'backup':'apply');
 })().catch(e=>console.error(errorCode(e))).finally(()=>{task=null;});
}
export async function sitePanelAction(body){
 if(['sync-status','sync-configure','sync-run','sync-resume'].includes(body?.action))return sharedSiteRequest('site-sync',{...body,action:body.action.slice(5)});
 if(!['status','backup','restore','verify'].includes(body?.action))fail('SITE_PANEL_ACTION_INVALID');
 const action=body.action==='status'?'site-job':'site-start';return (action==='site-job'?sharedSiteRequest:enqueueSiteJob)(action,{targetNodeId:body.nodeId,...(body.action!=='status'?{type:body.action,requestId:body.requestId,confirm:body.confirm===true,resume:body.resume===true,preserveExisting:body.preserveExisting===true,snapshotId:body.snapshotId||null}:{})});
}
export async function siteManualEnvelope(targetNodeId,request){
 await enqueueSiteJob('site-call',{targetNodeId,requestId:request.requestId,request});
 for(let i=0;i<50;i++){const s=(await sharedSiteRequest('site-job',{targetNodeId})).site,j=s.job;if(j?.id!==request.requestId)fail('SITE_MANUAL_JOB_CHANGED');if(j.status==='FAILED')fail(j.errorCode);if(j.status==='DONE')return {envelope:j.result.envelope,publicKey:s.publicKey,clusterId:(await sharedStatus()).clusterId};await sleep(500);}
 fail('SITE_MANUAL_AGENT_TIMEOUT');
}
