// One MHC-owned WordPress LAB site. Same-UID/root/out-of-band writers are outside scope.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {LeaseDeadline,SqlFenceSession,readFenceConfig,inspectSqlFence,sqlFenceOpen,closeSqlFence} from './p4-fence.mjs';
import {CandidateNode} from './p31-node.mjs';import {sharedStatus,sharedManagedRequest} from './cluster-authority.mjs';
export const P33_SCOPE='MHC_MANAGED_WORDPRESS_LAB';
const hex=/^[a-f0-9]{64}$/,uuid=/^[a-f0-9-]{36}$/;
const fail=c=>{throw Error(c);},sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function json(p,fixture=false){const st=fs.lstatSync(p);if(!st.isFile()||st.isSymbolicLink()||st.size>131072||!fixture&&(st.mode&0o077))fail('P33_PRIVATE_FILE_UNSAFE');return JSON.parse(fs.readFileSync(p,'utf8'));}
function save(p,v){fs.mkdirSync(path.dirname(p),{recursive:true,mode:0o700});const t=p+'.'+crypto.randomUUID(),fd=fs.openSync(t,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(v)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(t,p);}
function unlink(p){try{fs.unlinkSync(p);}catch(e){if(e.code!=='ENOENT')throw e;}}
export function validManagedLease(s,nodeId,now=Date.now()){
 const r=s?.p33,l=r?.lease;
 return !!s?.clusterId&&r?.enabled===true&&r.scope===P33_SCOPE&&l?.scope===P33_SCOPE&&r.targetNodeId===nodeId&&l.nodeId===nodeId&&l.epoch===r.epoch&&l.operationId===r.operationId&&Number.isSafeInteger(l.expiresAt)&&now<l.expiresAt&&l.expiresAt-now<=92000&&['ACTIVATING','ACTIVE','DNS_REQUESTED','AWAITING_PUBLIC','COMMITTED'].includes(r.phase);
}
export function testDatabaseGrant(line){const m=/^GRANT [A-Z ,]+ ON `([^`]+)`\.\* TO /.exec(line);return !!m&&!line.includes('WITH GRANT OPTION')&&(m[1]==='test'||m[1].replaceAll('\\','')==='test_%');}
export function readOnlyGrants(lines){lines=lines.filter(l=>!testDatabaseGrant(l));return lines.some(l=>/^GRANT SELECT ON `mhc_p33_lab`\.\* TO /.test(l))&&lines.every(l=>/^GRANT (USAGE ON \*\.\*|SELECT ON `mhc_p33_lab`\.\*) TO /.test(l)&&!l.includes('WITH GRANT OPTION'));}
export class ManagedNode{
 constructor(o={}){this.home=path.resolve(o.home||os.homedir());this.prefix=o.prefix||process.env.PREFIX||'';this.fixture=o.fixture===true;this.now=o.now||Date.now;this.authority=o.authority||(()=>sharedStatus('agent'));this.renew=o.renew||sharedManagedRequest;this.command=o.command||((cmd,args)=>spawnSync(cmd,args,{encoding:'utf8',timeout:8000,maxBuffer:65536}));this.fetch=o.fetch||fetch;this.base=path.join(this.home,'.local/share/mhc-p33-lab');this.dir=path.join(this.home,'.local/state/mhc-p33-node');this.file=path.join(this.dir,'state.json');this.childrenFile=path.join(this.dir,'children.json');this.candidate=new CandidateNode({home:this.home,prefix:this.prefix,fixture:this.fixture});}
 config(){
  const file=path.join(this.home,'.config/mhc-full-installer/site-standby.json');
  if(!fs.existsSync(file)){const c=this.candidate.config();this.candidate.safe(this.base);this.candidate.safe(this.dir);return {...c,keyFlavor:'P31'};}
  if(!this.fixture&&this.prefix!=='/data/data/com.termux/files/usr'||['apps/thophuongpro/.env','.config/mini-hosting-cluster/ha.json','.config/mini-hosting-cluster/node.json'].some(p=>fs.existsSync(path.join(this.home,p))))fail('P33_LAB_ONLY');
  const c=json(this.candidate.safe(file),this.fixture),identity=json(path.join(this.home,'.config/mhc-full-installer/node-identity.json'),this.fixture),authority=json(path.join(this.home,'.config/mhc-full-installer/authority.json'),this.fixture);
  if(c.schema!==1||c.scope!==P33_SCOPE||c.siteId!=='mhc-p33-wordpress-v1'||c.keyFlavor!=='N1'||c.nodeId!==identity.nodeId||c.clusterId!==authority.clusterId||c.nodeId!==authority.nodeId||!uuid.test(c.nodeId))fail('P33_SITE_CONFIG_INVALID');
  this.candidate.safe(this.base);this.candidate.safe(this.dir);return c;
 }
 state(){try{return json(this.file,this.fixture);}catch(e){if(e.code==='ENOENT')return {desired:'STANDBY'};throw e;}}
 event(event,fields={}){fs.mkdirSync(this.dir,{recursive:true,mode:0o700});fs.appendFileSync(path.join(this.dir,'events.jsonl'),JSON.stringify({at:new Date(this.now()).toISOString(),event,...fields})+'\n',{mode:0o600});}
 sql(query,root=false){const args=root?['--no-defaults','-u','root']:['--defaults-file='+this.candidate.safe(path.join(this.base,'db-client.cnf'))];const r=this.command('mariadb',[...args,'--batch','--skip-column-names','-e',query]);if(r.status!==0||r.error)fail('P33_SQL_COMMAND_FAILED');return (r.stdout||'').trim();}
 management(){return {panel:this.candidate.statusService('amh-panel'),agent:this.candidate.statusService('mhc-authority-agent')};}
 dataset(){
  if(fs.existsSync(path.join(this.base,'sync-maintenance.json')))fail('P33_SITE_MAINTENANCE');
  const m=json(this.candidate.safe(path.join(this.base,'dataset.json')),this.fixture);
  if(m.schema!==3||m.datasetId!=='mhc-p33-wordpress-v1'||m.originalCredentialsCopied!==false||m.restoreVerified!==true||!Number.isFinite(Date.parse(m.preparedAt))||!Array.isArray(m.files)||m.files.length<4||m.files.length>20)fail('P33_DATASET_INVALID');
  for(const f of m.files){if(!['site/wp-config.php','db-client.cnf','php/php-fpm.conf','nginx/nginx.conf','site/wp-content/themes/p33lab/index.php'].includes(f.path)||!hex.test(f.sha256))fail('P33_MANIFEST_INVALID');const p=this.candidate.safe(path.join(this.base,f.path));if(!fs.lstatSync(p).isFile()||hash(fs.readFileSync(p))!==f.sha256)fail('P33_DATASET_CHANGED');}
  if(new Set(m.files.map(f=>f.path)).size!==5)fail('P33_DATASET_INCOMPLETE');
  if(this.sql("SELECT COUNT(*) FROM wp_posts WHERE post_title='MHC Manual Primary LAB'")!=='1')fail('P33_WORDPRESS_DATA_NOT_READY');
  return {verified:true,datasetId:m.datasetId,preparedAt:m.preparedAt,restoreVerified:true,manifestSha256:hash(fs.readFileSync(path.join(this.base,'dataset.json'))),replication:false};
 }
 database(fenced=false,writeTest=false){
  const grants=this.sql('SHOW GRANTS').split('\n').filter(l=>!testDatabaseGrant(l));
  if(fenced){
   if(!readOnlyGrants(grants))fail('P33_SQL_READ_ONLY_NOT_VERIFIED');
   const deny=this.command('mariadb',['--defaults-file='+path.join(this.base,'db-client.cnf'),'-e',"UPDATE wp_options SET option_value=option_value WHERE option_name='blogname'"]);
   if(deny.status===0||!/UPDATE command denied/i.test(deny.stderr||''))fail('P33_SQL_WRITE_DENIAL_NOT_VERIFIED');
   const count=Number(this.sql("SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE USER='mhc_p33_web'",true));
   if(count!==0)fail('P33_SQL_CONNECTIONS_NOT_DRAINED');return {writeDenied:true,connections:0};
  }
  if(!grants.some(l=>/^GRANT SELECT, INSERT, UPDATE, DELETE ON `mhc_p33_lab`\.\* TO /.test(l))||grants.some(l=>!/^(GRANT USAGE ON \*\.\* TO |GRANT SELECT, INSERT, UPDATE, DELETE ON `mhc_p33_lab`\.\* TO )/.test(l)||l.includes('WITH GRANT OPTION')))fail('P33_SQL_SCOPE_INVALID');
  if(writeTest){const id=crypto.randomUUID();if(this.sql(`INSERT INTO mhc_p33_probe(id) VALUES('${id}'); SELECT COUNT(*) FROM mhc_p33_probe WHERE id='${id}'; DELETE FROM mhc_p33_probe WHERE id='${id}';`)!=='1')fail('P33_SQL_WRITE_READ_DELETE_FAILED');}
  return {writeDenied:false,writeReadDelete:writeTest};
 }
 revoke(){
  closeSqlFence(this);
  this.sql("REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'mhc_p33_web'@'localhost'; GRANT SELECT ON mhc_p33_lab.* TO 'mhc_p33_web'@'localhost';",true);
  const ids=this.sql("SELECT ID FROM information_schema.PROCESSLIST WHERE USER='mhc_p33_web'",true).split('\n').filter(Boolean);
  for(const id of ids){if(!/^\d+$/.test(id))fail('P33_SQL_CONNECTION_ID_INVALID');try{this.sql('KILL CONNECTION '+id,true);}catch{if(this.sql("SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE ID="+id,true)!=='0')fail('P33_SQL_CONNECTION_DRAIN_FAILED');}}
 }
 reap(){
  let records;try{records=json(this.childrenFile,this.fixture);}catch(e){if(e.code==='ENOENT')return;throw e;}
  if(!Array.isArray(records)||records.length>2)fail('P33_CHILD_JOURNAL_INVALID');
  for(const p of records){if(!Number.isInteger(p.pid)||p.pid<2||!/^\d+$/.test(p.start)||!['php','nginx'].includes(p.kind))fail('P33_CHILD_JOURNAL_INVALID');try{const st=fs.readFileSync('/proc/'+p.pid+'/stat','utf8').split(') ').slice(1).join(') ').split(' ');if(st[19]===p.start&&Number(st[2])===p.pid)process.kill(-p.pid,'SIGKILL');}catch(e){if(!['ENOENT','ESRCH'].includes(e.code))throw e;}}
  unlink(this.childrenFile);
 }
 async authorityState(){const c=this.config(),s=await this.authority();if(s.clusterId!==c.clusterId||s.p33?.enabled!==true||s.p33.scope!==P33_SCOPE)fail('P33_AUTHORITY_NOT_CONFIGURED');return s;}
 async httpProbe(){try{const r=await this.fetch('http://127.0.0.1:18131/',{redirect:'manual',signal:AbortSignal.timeout(4000)});const body=await r.text();return r.status===200&&r.headers.get('x-mhc-node')===this.config().nodeId&&body.includes('MHC Manual Primary LAB')&&!body.includes('<?php');}catch{return false;}}
 async proof(nonce,kind='READY',origin=null){
  if(!hex.test(nonce||''))fail('P33_NONCE_INVALID');const c=this.config(),s=await this.authorityState(),r=s.p33,dataset=this.dataset(),management=this.management();
  if(!Object.values(management).every(Boolean))fail('P33_MANAGEMENT_NOT_READY');
  const live=validManagedLease(s,c.nodeId,this.now())&&this.state().desired==='ACTIVE';
  let database={writeDenied:false},httpServing=false,httpStopped=false,childrenStopped=false;
  if(kind==='FENCED'){database=this.database(true);httpStopped=!await this.httpProbe();childrenStopped=!fs.existsSync(this.childrenFile);if(!httpStopped||!childrenStopped||this.state().desired!=='STANDBY')fail('P33_MANAGED_WRITERS_NOT_STOPPED');}
  if(['ACTIVE','PUBLIC_SITE'].includes(kind)){if(!live)fail('P33_NO_ACTIVE_LEASE');database=this.database(false,kind==='ACTIVE');httpServing=await this.httpProbe();if(!httpServing)fail('P33_HTTP_NOT_SERVING');}
  if(kind==='PUBLIC_PANEL'&&(origin?.accessVerified!==true||origin.host!=='panel-lab.giaouoc.com'))fail('P33_PUBLIC_ACCESS_REQUIRED');
  const latest=await this.authorityState();if(latest.p33.revision!==r.revision||latest.p33.operationId!==r.operationId)fail('P33_AUTHORITY_CHANGED_DURING_PROOF');
  const fence=inspectSqlFence(this);if(fence.verified&&kind==='FENCED'&&sqlFenceOpen(this))fail('P33_SQL_GATE_NOT_CLOSED');const checkedAt=this.now(),p={schema:3,scope:P33_SCOPE,nodeId:c.nodeId,clusterId:c.clusterId,epoch:r.epoch,revision:r.revision,operationId:r.operationId,nonce,checkedAt,expiresAt:checkedAt+15000,kind,dataset,management,database,fence,httpServing,httpStopped,childrenStopped,wordpress:true,leaseEpoch:live?r.epoch:null,nodeWritersFenced:false,...(kind==='PUBLIC_PANEL'?{host:origin.host,accessVerified:true}:{})};
  const key=this.candidate.safe(path.join(this.home,'.config/mhc-full-installer',c.keyFlavor==='N1'?'node-proof-key.pem':'p31/proof-key.pem')),st=fs.lstatSync(key);if(st.isSymbolicLink()||!this.fixture&&(st.mode&0o077))fail('P33_SIGNING_KEY_UNSAFE');return {proof:p,signature:crypto.sign(null,Buffer.from(JSON.stringify(p)),fs.readFileSync(key)).toString('base64url')};
 }
 async accept(request){
  const c=this.config();if(!['p33-ready','p33-fence','p33-activate','p33-active'].includes(request?.action)||request.nodeId!==c.nodeId||!hex.test(request.nonce||'')||!uuid.test(request.requestId||''))fail('P33_REQUEST_INVALID');
  if(request.action==='p33-ready')return this.proof(request.nonce);
  const s=await this.authorityState(),r=s.p33;if(request.epoch!==r.epoch||request.operationId!==r.operationId||request.revision!==r.revision)fail('P33_OPERATION_CHANGED');
  if(request.action==='p33-fence'){
   save(this.file,{desired:'STANDBY',generation:crypto.randomUUID(),reason:'MANUAL_QUIESCE'});this.reap();this.revoke();
   for(let i=0;i<30;i++){if(!await this.httpProbe()&&!fs.existsSync(this.childrenFile))return this.proof(request.nonce,'FENCED');await sleep(200);}fail('P33_FENCE_DID_NOT_STOP_HTTP');
  }
  if(request.action==='p33-active')return this.proof(request.nonce,'ACTIVE');
  if(!validManagedLease(s,c.nodeId,this.now())||!this.candidate.statusService('mhc-lab-p33'))fail('P33_ACTIVATION_NOT_AUTHORIZED');
  const old=this.state();if(old.desired!=='ACTIVE'||old.epoch!==r.epoch||old.operationId!==r.operationId)save(this.file,{desired:'ACTIVE',generation:crypto.randomUUID(),epoch:r.epoch,operationId:r.operationId});
  for(let i=0;i<60;i++){if(await this.httpProbe())return this.proof(request.nonce,'ACTIVE');await sleep(200);}fail('P33_ACTIVATION_FAILED');
 }
 async watch(){
  const c=this.config();this.dataset();save(this.file,{desired:'STANDBY',generation:crypto.randomUUID(),reason:'RESTART_QUARANTINE'});this.reap();this.revoke();this.event('START_QUARANTINE');
  let children=[],server=null,sockets=new Set(),generation=null,stopping=false,sqlSession=null;const deadline=new LeaseDeadline();
  const stop=async()=>{if(sqlSession){await sqlSession.close();sqlSession=null;}deadline.clear();for(const socket of sockets)socket.destroy();if(server){server.close();server=null;}for(const p of children)try{process.kill(-p.pid,'SIGKILL');}catch{}children=[];this.reap();this.revoke();generation=null;};
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{if(!stopping){stopping=true;save(this.file,{desired:'STANDBY',generation:crypto.randomUUID(),reason:'SERVICE_STOP_QUARANTINE'});void stop().then(()=>process.exit(0)).catch(()=>process.exit(1));}});
  const record=()=>save(this.childrenFile,children.map((p,i)=>{if(!p.pid)fail('P33_CHILD_START_FAILED');const st=fs.readFileSync('/proc/'+p.pid+'/stat','utf8').split(') ').slice(1).join(') ').split(' ');return {pid:p.pid,start:st[19],kind:i?'nginx':'php'};}));
  while(!stopping){let state={};try{
   state=this.state();const fenceConfig=readFenceConfig(this.home);if(state.desired!=='ACTIVE'){if(generation||children.length||server)await stop();await sleep(500);continue;}
   const leaseStarted=os.uptime()*1000;let s=await this.authorityState();if(!validManagedLease(s,c.nodeId,this.now())||s.p33.epoch!==state.epoch||s.p33.operationId!==state.operationId||!Object.values(this.management()).every(Boolean))fail('P33_LEASE_OR_MANAGEMENT_LOST');
   if(s.p33.lease.expiresAt-this.now()<45000)s=await this.renew('p33-renew',{epoch:state.epoch,operationId:state.operationId});
   if(!validManagedLease(s,c.nodeId,this.now()))fail('P33_RENEWAL_INVALID');
   if(fenceConfig){const budget=deadline.observe(s,c.nodeId,leaseStarted);if(sqlSession)await sqlSession.heartbeat(budget);}
   if(children.some(p=>p.exitCode!==null||p.signalCode!==null))fail('P33_CHILD_EXITED');
   if(generation!==state.generation){
    await stop();this.dataset();
    const again=await this.authorityState();if(!validManagedLease(again,c.nodeId,this.now())||again.p33.operationId!==state.operationId)fail('P33_ACTIVATION_LEASE_CHANGED');
    if(fenceConfig){inspectSqlFence(this,fenceConfig);const started=os.uptime()*1000,fresh=await this.authorityState();const budget=deadline.observe(fresh,c.nodeId,started);sqlSession=new SqlFenceSession(fenceConfig.lockName);await sqlSession.start(budget);}
    this.sql("GRANT SELECT, INSERT, UPDATE, DELETE ON mhc_p33_lab.* TO 'mhc_p33_web'@'localhost';",true);
    const php=spawn(path.join(this.prefix,'bin/php-fpm'),['-y',path.join(this.base,'php/php-fpm.conf'),'-F'],{detached:true,stdio:'ignore'});php.on('error',()=>{});children=[php];record();
    const nginx=spawn(path.join(this.prefix,'bin/nginx'),['-p',path.join(this.base,'nginx')+'/', '-c',path.join(this.base,'nginx/nginx.conf'),'-g','daemon off;'],{detached:true,stdio:'ignore'});nginx.on('error',()=>{});children.push(nginx);record();
    server=http.createServer((req,res)=>{void (async()=>{
     if(!['127.0.0.1:18131','localhost:18131'].includes(req.headers.host))return res.writeHead(403).end('Host denied');
     const current=this.state(),fresh=await this.authorityState();
     if(current.desired!=='ACTIVE'||current.generation!==state.generation||!validManagedLease(fresh,c.nodeId,this.now())||fresh.p33.epoch!==current.epoch||fresh.p33.operationId!==current.operationId)return res.writeHead(503,{'cache-control':'no-store'}).end('Standby');
     if(req.url.startsWith('/__mhc_primary')){
      if(req.method!=='GET')return res.writeHead(405).end();const nonce=new URL(req.url,'http://127.0.0.1').searchParams.get('nonce');
      const proof=await this.proof(nonce,'PUBLIC_SITE');return res.writeHead(200,{'content-type':'application/json','cache-control':'no-store','x-mhc-node':c.nodeId}).end(JSON.stringify(proof));
     }
     if(!['GET','HEAD','POST'].includes(req.method))return res.writeHead(405).end();
     const headers={...req.headers,host:'preview-lab.giaouoc.com','x-forwarded-proto':'https'};for(const k of ['connection','proxy-connection','transfer-encoding','cf-access-jwt-assertion','authorization'])delete headers[k];
     if(headers.cookie)headers.cookie=headers.cookie.split(';').filter(v=>!/^\s*CF_Authorization=/.test(v)).join(';');
     const proxy=http.request({hostname:'127.0.0.1',port:18133,path:req.url,method:req.method,headers,timeout:10000},up=>{res.writeHead(up.statusCode,{...up.headers,'x-mhc-node':c.nodeId,'cache-control':'no-store'});up.pipe(res);});
     const absolute=setTimeout(()=>{proxy.destroy();res.destroy();},10000);absolute.unref?.();res.on('close',()=>clearTimeout(absolute));
     let bytes=0;req.on('data',b=>{bytes+=b.length;if(bytes>8*1024*1024){proxy.destroy();res.destroy();}});req.on('aborted',()=>proxy.destroy());proxy.on('timeout',()=>proxy.destroy());proxy.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Backend unavailable');});req.pipe(proxy);
    })().catch(()=>{if(!res.headersSent)res.writeHead(503,{'cache-control':'no-store'});res.end('Primary authority unavailable');});});
    server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(18131,'127.0.0.1',resolve);});generation=state.generation;this.event('MANAGED_WRITER_ACTIVE',{epoch:state.epoch,operationId:state.operationId});
   }
  }catch(e){try{await stop();}catch{}if(this.state().generation===state.generation)save(this.file,{desired:'STANDBY',generation:crypto.randomUUID(),reason:'AUTHORITY_OR_RUNTIME_FAILED_CLOSED'});this.event('MANAGED_WRITER_QUARANTINED',{reason:/^(P33|P4)_[A-Z_]+$/.test(e.message)?e.message:'P33_RUNTIME_UNAVAILABLE'});}
  await sleep(1000);}
 }
}
async function main(){const n=new ManagedNode();if(process.argv[2]==='watch')return n.watch();if(process.argv[2]==='accept'){if(process.env.SSH_ORIGINAL_COMMAND&&process.env.SSH_ORIGINAL_COMMAND!=='mhc-p31')fail('P33_SSH_COMMAND_DENIED');let b='';for await(const chunk of process.stdin){b+=chunk;if(b.length>8192)fail('P33_REQUEST_TOO_LARGE');}return n.accept(JSON.parse(b));}fail('P33_USAGE_INVALID');}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(v=>{if(v)console.log(JSON.stringify(v));}).catch(e=>{console.error(/^P33_[A-Z_]+$/.test(e.message)?e.message:'P33_OPERATION_FAILED');process.exitCode=1;});
