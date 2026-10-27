#!/usr/bin/env node
// P3.1: isolated read-only candidate rehearsal. NEVER grants a writer or changes routes.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HEX=/^[a-f0-9]{64}$/;const LAB=['4ed4c025-62ae-4c2a-8d68-65dd76ecf550','4a9672d1-bb62-4286-946a-a78b73e57b24'];
export const MAX_CLOCK_SKEW_MS=2000;
const fail=c=>{throw Error(c);};export const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function privateJson(p,fixture=false){const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.size>2e6||(!fixture&&(s.mode&0o077)))fail('P31_PRIVATE_FILE_UNSAFE');return JSON.parse(fs.readFileSync(p,'utf8'));}
function save(p,v){fs.mkdirSync(path.dirname(p),{recursive:true,mode:0o700});const t=p+'.'+crypto.randomUUID(),fd=fs.openSync(t,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(v)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(t,p);}
export function validateAuthority(s,c,now=Date.now()){
 if(s?.mode!=='SHARED_AUTHORITY_PREPARE_ONLY'||s.clusterId!==c.clusterId||s.writeLeaseGranted!==false||s.automaticFailover!==false||!Number.isSafeInteger(s.epoch)||s.epoch<0||!Number.isSafeInteger(s.revision)||s.revision<0)fail('P31_AUTHORITY_INVALID');
 const own=s.nodes?.find(n=>n.nodeId===c.nodeId),age=now-Date.parse(own?.lastSeenAt);
 // Authority records receive time on its own clock. A fresh heartbeat can be
 // slightly ahead of Android; use the same bounded skew as proof verification.
 if(own?.heartbeatRecent!==true||own.telemetryRecent!==true||!Number.isFinite(age)||age < -MAX_CLOCK_SKEW_MS||age>90000)fail('P31_AGENT_STALE');return s;
}
export function matchesPending(s,r){return s.pending?.status==='PREPARED_NO_WRITER_GRANT'&&s.pending.operationId===r.operationId&&s.pending.targetNodeId===r.nodeId&&s.pending.epoch===r.epoch&&s.epoch===r.epoch&&s.revision===r.revision;}
export function verifyProof(envelope,{publicKey,nonce,nodeId,clusterId,epoch,revision,operationId=null,now=Date.now(),used=new Set()}){
 const p=envelope?.proof;if(!p||p.schema!==1||!HEX.test(nonce)||p.nonce!==nonce||p.nodeId!==nodeId||p.clusterId!==clusterId||p.epoch!==epoch||p.revision!==revision||p.operationId!==operationId||p.writerGranted!==false||p.fencingVerified!==false||p.role!=='STANDBY_READ_ONLY'||p.expiresAt-p.checkedAt!==15000||now<p.checkedAt-MAX_CLOCK_SKEW_MS||now>p.expiresAt||used.has(nonce))fail('P31_PROOF_STALE_REPLAY_OR_MISMATCH');
 if(p.scope!=='ISOLATED_P31_DATASET_ONLY'||p.nodeWritersFenced!==false)fail('P31_PROOF_SCOPE_INVALID');
 if(typeof envelope.signature!=='string'||envelope.signature.length>200||!crypto.verify(null,Buffer.from(JSON.stringify(p)),publicKey,Buffer.from(envelope.signature,'base64url')))fail('P31_PROOF_SIGNATURE_INVALID');used.add(nonce);return p;
}
export class CandidateNode{
 constructor(o={}){this.home=path.resolve(o.home||os.homedir());this.prefix=o.prefix||process.env.PREFIX||'';this.fixture=o.fixture===true;this.now=o.now||Date.now;this.authority=o.authority||(()=>import('./cluster-authority.mjs').then(m=>m.sharedStatus('agent')));this.command=o.command||((cmd,args)=>spawnSync(cmd,args,{encoding:'utf8',timeout:5000,maxBuffer:65536}));this.spawn=o.spawn||spawn;this.fetch=o.fetch||fetch;this.runtime=o.runtime;this.cfg=path.join(this.home,'.config/mhc-full-installer/p31');this.dir=path.join(this.home,'.local/state/mhc-p31-node');this.base=path.join(this.home,'.local/share/mhc-p31-lab');this.stateFile=path.join(this.dir,'state.json');}
 safe(p){const rel=path.relative(this.home,p);if(rel.startsWith('..')||path.isAbsolute(rel))fail('P31_PATH_INVALID');let at=this.home;for(const v of rel.split(path.sep)){at=path.join(at,v);const st=fs.lstatSync(at,{throwIfNoEntry:false});if(st?.isSymbolicLink())fail('P31_SYMLINK_DENIED');}return p;}
 config(){
  if(!this.fixture&&(!['android','linux'].includes(process.platform)||this.prefix!=='/data/data/com.termux/files/usr'))fail('P31_TERMUX_ONLY');
  for(const f of ['apps/thophuongpro/.env','.config/mini-hosting-cluster/ha.json','.config/mini-hosting-cluster/node.json'])if(fs.existsSync(path.join(this.home,f)))fail('P31_PRODUCTION_DENIED');
  this.safe(this.cfg);this.safe(this.base);this.safe(this.dir);
  const c=privateJson(path.join(this.cfg,'config.json'),this.fixture),identity=privateJson(path.join(this.home,'.config/mhc-full-installer/node-identity.json'),this.fixture);
  if(c.schema!==1||c.enabled!==true||!LAB.includes(c.nodeId)||c.nodeId!==identity.nodeId||!UUID.test(c.clusterId)||c.datasetId!=='mhc-p31-synthetic-v1')fail('P31_CONFIG_INVALID');
  if(fs.readFileSync(path.join(this.home,'.config/mhc-full-installer/installed'),'utf8').trim()!=='TEST 0.5.0C-REMOTE-PANEL installed on clean Termux')fail('P31_MARKER_INVALID');
  return c;
 }
 state(){try{return privateJson(this.stateFile,this.fixture);}catch(e){if(e.code==='ENOENT')return {schema:1,desired:'STANDBY',generation:null};throw e;}}
 event(event,fields={}){this.safe(this.dir);fs.mkdirSync(this.dir,{recursive:true,mode:0o700});fs.appendFileSync(path.join(this.dir,'events.jsonl'),JSON.stringify({at:new Date(this.now()).toISOString(),event,...fields})+'\n',{mode:0o600});}
 statusService(n){const r=this.command('sv',['status',path.join(this.prefix,'var/service',n)]);return r.status===0&&/^run:/.test(r.stdout||'');}
 async authorityState(){return validateAuthority(await this.authority(),this.config(),this.now());}
 dataset(){
  const meta=privateJson(this.safe(path.join(this.base,'dataset.json')),this.fixture);
  if(meta.schema!==1||meta.datasetId!=='mhc-p31-synthetic-v1'||!HEX.test(meta.sourceArchiveSha256)||meta.sourceSqlTransferred!==false||meta.originalCredentialsCopied!==false||!Array.isArray(meta.files)||meta.files.length<10||meta.files.length>10000)fail('P31_DATASET_INVALID');
  const seen=new Set();for(const f of meta.files){if(typeof f.path!=='string'||!(/^(site\/|static\/|synthetic-lab\.sql\.gz$|db-client\.cnf$|php\/php-fpm\.conf$|nginx\/nginx\.conf$)/.test(f.path))||f.path.includes('\\')||f.path.split('/').some(x=>!x||x==='.'||x==='..')||seen.has(f.path)||!HEX.test(f.sha256))fail('P31_DATASET_MANIFEST_INVALID');seen.add(f.path);const p=this.safe(path.join(this.base,f.path)),st=fs.lstatSync(p);if(!st.isFile()||hash(fs.readFileSync(p))!==f.sha256)fail('P31_DATASET_CHANGED');}
  if(['site/wp-config.php','synthetic-lab.sql.gz','static/index.html','db-client.cnf','php/php-fpm.conf','nginx/nginx.conf'].some(p=>!seen.has(p)))fail('P31_DATASET_INCOMPLETE');
  return {datasetId:meta.datasetId,sourceArchiveSha256:meta.sourceArchiveSha256,manifestSha256:hash(fs.readFileSync(path.join(this.base,'dataset.json'))),fileCount:meta.files.length,preparedAt:meta.preparedAt};
 }
 database(){
  this.safe(path.join(this.base,'db-client.cnf'));
  const args=['--defaults-file='+path.join(this.base,'db-client.cnf'),'-N','-B'];
  const read=this.command('mariadb',[...args,'-e',"SELECT COUNT(*) FROM wp_posts WHERE post_title='MHC P3.1 isolated LAB dataset'"]);
  const grants=this.command('mariadb',[...args,'-e','SHOW GRANTS']);
  const lines=(grants.stdout||'').trim().split('\n');
  if(read.status!==0||read.stdout.trim()!=='1'||grants.status!==0||!lines.some(x=>/^GRANT SELECT ON `mhc_p31_lab`\.\* TO /.test(x))||lines.some(x=>!/^GRANT (USAGE ON \*\.\*|SELECT ON `mhc_p31_lab`\.\*) TO /.test(x)||/WITH GRANT OPTION/.test(x)))fail('P31_SQL_READ_ONLY_NOT_VERIFIED');
  const denied=this.command('mariadb',[...args,'-e',"UPDATE wp_options SET option_value=option_value WHERE option_name='blogname'"]);
  if(denied.status===0||!/UPDATE command denied/i.test(denied.stderr||''))fail('P31_SQL_DENIAL_NOT_VERIFIED');
  return {select:true,writeDenied:true,scope:'DEDICATED_WEB_ACCOUNT_ONLY'};
 }
 async httpProbe(c){
  async function get(fetcher,url,method='GET'){const r=await fetcher(url,{method,redirect:'error',signal:AbortSignal.timeout(3000)});let bytes=Buffer.alloc(0);if(r.body){for await(const b of r.body){bytes=Buffer.concat([bytes,Buffer.from(b)]);if(bytes.length>524288)fail('P31_HTTP_TOO_LARGE');}}return {status:r.status,bytes,node:r.headers.get('x-mhc-node')};}
  const root=await get(this.fetch,'http://127.0.0.1:18131/');
  if(root.status!==200||root.node!==c.nodeId||!root.bytes.includes('MHC P3.1 isolated LAB dataset')||root.bytes.includes('<?php'))fail('P31_HTTP_IDENTITY_OR_PHP_FAILED');
  const asset=await get(this.fetch,'http://127.0.0.1:18131/static-demo.html');if(asset.status!==200||hash(asset.bytes)!==hash(fs.readFileSync(path.join(this.base,'static/index.html'))))fail('P31_STATIC_FAILED');
  const media=fs.readdirSync(path.join(this.base,'site/wp-content/uploads/p31')).filter(n=>/^[A-Za-z0-9_.-]+\.(png|jpe?g|gif|webp)$/i.test(n)).sort()[0];if(!media)fail('P31_MEDIA_MISSING');
  const image=await get(this.fetch,'http://127.0.0.1:18131/wp-content/uploads/p31/'+media);if(image.status!==200||hash(image.bytes)!==hash(fs.readFileSync(path.join(this.base,'site/wp-content/uploads/p31',media))))fail('P31_MEDIA_FAILED');
  for(const [url,method] of [['/','POST'],['/wp-cron.php','GET'],['/wp-login.php','GET'],['/wp-json/','GET']])if((await get(this.fetch,'http://127.0.0.1:18131'+url,method)).status!==403)fail('P31_HTTP_WRITE_GATE_FAILED');
  return {status:200,phpRendered:true,staticVerified:true,mediaVerified:true,httpMutationDenied:true,bodySha256:hash(root.bytes)};
 }
 async probe(nonce,origin=null){
  const c=this.config();if(!HEX.test(nonce||''))fail('P31_NONCE_INVALID');const s=await this.authorityState();
  const problems=[];let dataset=null,database=null,http=null;
  for(const [key,fn] of [['dataset',()=>this.dataset()],['database',()=>this.database()],['http',()=>this.httpProbe(c)]])try{const v=await fn();if(key==='dataset')dataset=v;else if(key==='database')database=v;else http=v;}catch(e){problems.push(/^P31_[A-Z_]+$/.test(e.message)?e.message:'P31_'+key.toUpperCase()+'_UNAVAILABLE');}
  const management=Object.fromEntries(['amh-panel','mhc-authority-agent','sshd'].map(n=>[n,this.statusService(n)]));
  if(Object.values(management).some(v=>!v))problems.push('P31_MANAGEMENT_NOT_HEALTHY');
  const current=privateJson(path.join(this.home,'.local/state/mhc-source-upgrade/current.json'),this.fixture);
  const latest=await this.authorityState();if(latest.epoch!==s.epoch||latest.revision!==s.revision)fail('P31_AUTHORITY_CHANGED_DURING_PROBE');
  const checkedAt=this.now(),state=this.state();
  const proof={schema:1,nodeId:c.nodeId,clusterId:c.clusterId,nonce,checkedAt,expiresAt:checkedAt+15000,epoch:s.epoch,revision:s.revision,operationId:s.pending?.operationId||null,version:current.version,commit:current.commit,role:'STANDBY_READ_ONLY',writerGranted:false,fencingVerified:false,activation:state.desired==='PREVIEW'&&http?'READ_ONLY_PREVIEW':'STANDBY_QUARANTINE',previewReady:!!dataset&&!!database&&Object.values(management).every(Boolean),websiteServing:!!http,dataset,database,http,management,problems,blocker:'P31_PRIVILEGED_AND_SAME_UID_WRITERS_NOT_FENCED'};
  const key=this.safe(path.join(this.cfg,'proof-key.pem')),st=fs.lstatSync(key);if(st.isSymbolicLink()||(!this.fixture&&(st.mode&0o077)))fail('P31_SIGNING_KEY_UNSAFE');
  Object.assign(proof,{scope:'ISOLATED_P31_DATASET_ONLY',nodeWritersFenced:false});
  if(origin!==null){
   if(!origin||typeof origin.host!=='string'||origin.host.length>253||typeof origin.accessVerified!=='boolean')fail('P31_ORIGIN_CONTEXT_INVALID');
   proof.origin={host:origin.host,accessVerified:origin.accessVerified};
   if(origin.preview){const p=origin.preview;if(p.hostname!=='preview-lab.giaouoc.com'||p.status!==200||!HEX.test(p.bodySha256||'')||p.nodeId!==c.nodeId)fail('P31_ORIGIN_PREVIEW_INVALID');proof.origin.preview={hostname:p.hostname,status:p.status,bodySha256:p.bodySha256,nodeId:p.nodeId};}
  }
  return {proof,signature:crypto.sign(null,Buffer.from(JSON.stringify(proof)),fs.readFileSync(key)).toString('base64url')};
 }
 validateRequest(r,c){if(!r||!['probe','prepare','standby','promote'].includes(r.action)||r.nodeId!==c.nodeId||!HEX.test(r.nonce||'')||!UUID.test(r.requestId||'')||!Number.isSafeInteger(r.epoch)||r.epoch<0||!Number.isSafeInteger(r.revision)||r.revision<0)fail('P31_REQUEST_INVALID');}
 async accept(r){
  const c=this.config();this.validateRequest(r,c);if(r.action==='probe')return this.probe(r.nonce);
  if(r.action==='promote'){this.event('PROMOTION_REFUSED',{reason:'P31_PRIVILEGED_AND_SAME_UID_WRITERS_NOT_FENCED'});fail('P31_UNPROVEN_WRITER_FENCING');}
  fs.mkdirSync(this.dir,{recursive:true,mode:0o700});this.safe(this.dir);const lock=path.join(this.dir,'operation.lock');try{fs.mkdirSync(lock,{mode:0o700});}catch{fail('P31_OPERATION_LOCKED_INSPECT_IF_CRASHED');}
  try{
   const digest=hash(JSON.stringify([r.action,r.nodeId,r.operationId||null,r.epoch,r.revision]));const file=path.join(this.dir,'receipt-'+r.requestId+'.json');let receipt;try{receipt=privateJson(file,this.fixture);}catch(e){if(e.code!=='ENOENT')throw e;}
   if(receipt&&receipt.digest!==digest)fail('P31_IDEMPOTENCY_CONFLICT');
   const s=await this.authorityState();if(s.epoch!==r.epoch||s.revision!==r.revision)fail('P31_AUTHORITY_REVISION_EPOCH_CHANGED');
   if(r.action==='prepare'){
    if(!matchesPending(s,r))fail('P31_PENDING_MISMATCH');this.dataset();this.database();
    if(!this.statusService('mhc-authority-agent')||!this.statusService('amh-panel')||!this.statusService('mhc-lab-p31'))fail('P31_AGENT_OR_SUPERVISOR_DOWN');
    if(!receipt){this.event('PREVIEW_REQUESTED',{operationId:r.operationId,epoch:r.epoch,requestId:r.requestId});save(this.stateFile,{schema:1,desired:'PREVIEW',generation:crypto.randomUUID(),operationId:r.operationId,epoch:r.epoch,revision:r.revision});save(file,{digest,action:r.action});}
   }else{this.event('STANDBY_REQUESTED',{requestId:r.requestId,epoch:r.epoch});save(this.stateFile,{schema:1,desired:'STANDBY',generation:crypto.randomUUID(),reason:'OPERATOR_QUARANTINE'});save(file,{digest,action:r.action});}
   if(this.runtime)await this.runtime(r.action);else await sleep(2500);
   const after=await this.authorityState();if(r.action==='prepare'&&!matchesPending(after,r))fail('P31_PENDING_CHANGED_DURING_ACTIVATION');
   if(receipt&&this.state().desired!=='PREVIEW')return this.probe(r.nonce);
   const until=Date.now()+10000;
   do{const result=await this.probe(r.nonce);if(r.action==='prepare'?result.proof.websiteServing:!result.proof.websiteServing)return result;if(this.runtime)break;await sleep(500);}while(Date.now()<until);
   fail('P31_PREVIEW_START_OR_STOP_HEALTH_FAILED');
  }catch(e){if(r.action==='prepare'){save(this.stateFile,{schema:1,desired:'STANDBY',generation:crypto.randomUUID(),reason:'ACTIVATION_FAILED'});this.event('PREVIEW_FAILED_CLOSED',{requestId:r.requestId});}throw e;}
  finally{fs.rmdirSync(lock);}
 }
 async watch(){
  this.config();this.event('SUPERVISOR_START_QUARANTINE');save(this.stateFile,{schema:1,desired:'STANDBY',generation:crypto.randomUUID(),reason:'RESTART_REQUIRES_NEW_PREPARATION'});
  // A SIGKILL can orphan detached PHP/Nginx. Reap only recorded process groups
  // whose kernel start time still matches; PID reuse must never kill another service.
  const childFile=path.join(this.dir,'children.json');
  const reap=()=>{let old;try{old=privateJson(childFile,this.fixture);}catch(e){if(e.code==='ENOENT')return;throw e;}if(!Array.isArray(old)||old.length>2)fail('P31_CHILD_JOURNAL_INVALID');for(const p of old){if(!Number.isInteger(p.pid)||p.pid<2||!/^\d+$/.test(p.start))fail('P31_CHILD_JOURNAL_INVALID');try{const stat=fs.readFileSync('/proc/'+p.pid+'/stat','utf8').split(') ').slice(1).join(') ').split(' ');if(stat[19]===p.start&&Number(stat[2])===p.pid)process.kill(-p.pid,'SIGKILL');}catch(e){if(!['ENOENT','ESRCH'].includes(e.code))throw e;}}fs.unlinkSync(childFile);};
  reap();
  let children=[],generation=null,stopping=false;
  const stop=async()=>{const old=children;children=[];for(const p of old)try{process.kill(-p.pid,'SIGTERM');}catch{}await sleep(300);for(const p of old)try{process.kill(-p.pid,'SIGKILL');}catch{}if(fs.existsSync(childFile))fs.unlinkSync(childFile);generation=null;};
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{if(!stopping){stopping=true;void stop().then(()=>process.exit(0));}});
  while(!stopping){let state={};try{state=this.state();
   if(state.desired!=='PREVIEW'){if(children.length)await stop();}
   else{
    const s=await this.authorityState();const r={...state,nodeId:this.config().nodeId};if(!matchesPending(s,r)||!this.statusService('mhc-authority-agent')||!this.statusService('amh-panel'))fail('P31_AUTHORITY_AGENT_OR_PENDING_LOST');
    if(children.some(p=>p.exitCode!==null||p.signalCode!==null))fail('P31_CHILD_EXITED');
    if(generation!==state.generation){await stop();this.dataset();this.database();const again=await this.authorityState();if(!matchesPending(again,r))fail('P31_PENDING_CHANGED');
     const php=this.spawn(path.join(this.prefix,'bin/php-fpm'),['-y',path.join(this.base,'php/php-fpm.conf'),'-F'],{detached:true,stdio:'ignore'});
     children=[php];php.on('error',()=>{});
     const record=()=>save(childFile,children.map(p=>{if(!p.pid)fail('P31_CHILD_START_FAILED');const st=fs.readFileSync('/proc/'+p.pid+'/stat','utf8').split(') ').slice(1).join(') ').split(' ');return {pid:p.pid,start:st[19]};}));record();
     const nginx=this.spawn(path.join(this.prefix,'bin/nginx'),['-p',path.join(this.base,'nginx')+'/', '-c',path.join(this.base,'nginx/nginx.conf'),'-g','daemon off;'],{detached:true,stdio:'ignore'});
     children.push(nginx);nginx.on('error',()=>{});record();generation=state.generation;this.event('READ_ONLY_PREVIEW_STARTED',{epoch:state.epoch,operationId:state.operationId});
    }
   }
  }catch(e){await stop();let current;try{current=this.state();}catch{}if(!current||current.generation===state.generation)save(this.stateFile,{schema:1,desired:'STANDBY',generation:crypto.randomUUID(),reason:'AUTHORITY_AGENT_OR_DATA_UNVERIFIED'});this.event('PREVIEW_QUARANTINED',{reason:/^P31_[A-Z_]+$/.test(e.message)?e.message:'P31_CHECK_FAILED'});}
  await sleep(1000);}
 }
}
export async function main(args){const n=new CandidateNode();if(args[0]==='watch')return n.watch();if(args[0]==='accept'){
 if(process.env.SSH_ORIGINAL_COMMAND&&process.env.SSH_ORIGINAL_COMMAND!=='mhc-p31')fail('P31_SSH_COMMAND_DENIED');let data='';for await(const b of process.stdin){data+=b;if(data.length>8192)fail('P31_REQUEST_TOO_LARGE');}return n.accept(JSON.parse(data));
}fail('Usage: p31-node watch|accept');}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).then(v=>{if(v)console.log(JSON.stringify(v));}).catch(e=>{console.error(/^P31_[A-Z_]+$/.test(e.message)?e.message:'P31_OPERATION_FAILED');process.exitCode=1;});
