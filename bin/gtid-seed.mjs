// MHC TEST 0.4.0B2 — auditable LAB GTID seed capture and verification.
// A dump is NOT a running replica. No SQL import, CHANGE MASTER, START SLAVE or HA.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {labStatus} from './gtid-lab.mjs';
const exec=promisify(execFile);
const HOME=process.env.HOME||os.homedir();
const BASE=path.join(HOME,'.local/share/mhc-full-installer');
const STORE=path.join(BASE,'gtid-seeds');
const MARK=path.join(HOME,'.config/mhc-full-installer/installed');
const DB=/^mhc_lab_[a-z][a-z0-9_]{2,30}$/;
const GTID=/^(?:[0-9]{1,10}-[0-9]{1,10}-[0-9]{1,20})(?:,[0-9]{1,10}-[0-9]{1,10}-[0-9]{1,20})*$/;
const MAX_SIZE=256*1024*1024;
const TIMEOUT=120000;
function fail(message){throw Error(message);}
function privateDir(p,create=false){
 if(create&&!fs.existsSync(p))fs.mkdirSync(p,{mode:0o700});
 const st=fs.lstatSync(p);if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o022))fail('Unsafe directory ownership/permissions');
}
function labGuard(){
 const st=fs.lstatSync(MARK);if(!st.isFile()||st.isSymbolicLink()||st.size>200)fail('LAB install marker missing or unsafe');
 const mark=fs.readFileSync(MARK,'utf8');
 if(!/^TEST 0\.(?:3\.|4\.|5\.)/.test(mark))fail('Unrecognized LAB marker');
 for(const p of ['apps/thophuongpro/.env','.config/mini-hosting-cluster/ha.json','.config/mhc-full-installer/install-incomplete']){
  if(fs.existsSync(path.join(HOME,p)))fail('STOP: live application, HA, identity or incomplete installation footprint');
 }
 privateDir(HOME);
 privateDir(path.join(HOME,'.local'));
 privateDir(path.join(HOME,'.local/share'));
 privateDir(BASE);
}
async function maria(sql){
 try{
  const {stdout}=await exec('mariadb',['--no-defaults','--batch','--skip-column-names','--connect-timeout=2','-e',sql],{
   timeout:5500,maxBuffer:16*1024,env:{...process.env,MYSQL_PWD:''}});
  return stdout.trim();
 }catch{fail('MariaDB read-only preflight not available');}
}
function validGtid(text){return GTID.test(text)&&text.length<=1024&&new Set(text.split(',').map(x=>x.split('-')[0])).size===text.split(',').length;}
function dumpGtid(header){
 // MariaDB --master-data=2 --gtid embeds a corresponding gtid_slave_pos in the dump.
 // Never use a separately queried, potentially later global GTID as seed coordinates.
 const matches=[...header.matchAll(/\b(?:SET\s+(?:GLOBAL\s+|@@GLOBAL\.)?)?gtid_slave_pos\s*=\s*['"]([^'"\r\n]+)['"]/gi)];
 const values=[...new Set(matches.map(m=>m[1]))];
 return values.length===1&&validGtid(values[0])?values[0]:null;
}
async function preflight(db){
 if(!DB.test(db))fail('Only databases named mhc_lab_<name> are accepted');
 labGuard();
 const vars=(await maria('SELECT @@global.server_id,@@global.log_bin,@@global.gtid_strict_mode,@@global.read_only,@@global.binlog_format;')).split(/\s+/);
 if(vars.length!==5||!/^[1-9][0-9]*$/.test(vars[0])||!['1','ON'].includes(vars[1])||!['1','ON'].includes(vars[2])||!['0','OFF'].includes(vars[3])||vars[4]!=='ROW'){
  fail('GTID LAB source preflight failed: require unique server_id, binlog, strict GTID, ROW and writable SOURCE');
 }
 const names=(await maria('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA;')).split(/\r?\n/).filter(Boolean);
 if(!names.includes(db)||names.some(n=>!['information_schema','performance_schema','mysql','sys',db].includes(n))){
  fail('Non-LAB database or missing LAB schema: use dedicated LAB MariaDB');
 }
 const engineRows=await maria(`SELECT TABLE_TYPE,COALESCE(ENGINE,'') FROM information_schema.TABLES WHERE TABLE_SCHEMA='${db}';`);
 const engines=engineRows.split(/\r?\n/).filter(Boolean);
 if(!engines.length||engines.some(x=>{const [type,engine]=x.split('\t');return type==='BASE TABLE'&&engine!=='InnoDB';})){
  fail('Source LAB database must exist and contain transactional InnoDB tables only');
 }
 // Refuse any preexisting replication channels on the SOURCE.
 const status=await labStatus();
 if(status.channelCount!==0||status.mode!=='NOT_CONFIGURED')fail('SOURCE must have no existing replication channels');
 return {serverId:Number(vars[0]),transactionalTables:engines.filter(x=>x.startsWith('BASE TABLE')).length};
}
async function runDump(db,output){
 const args=['--no-defaults','--single-transaction','--master-data=2','--gtid','--quick','--hex-blob','--routines','--triggers','--events','--databases',db];
 return await new Promise((resolve,reject)=>{
  const out=fs.createWriteStream(output,{flags:'wx',mode:0o600});
  const child=spawn('mariadb-dump',args,{env:{...process.env,MYSQL_PWD:''},stdio:['ignore','pipe','pipe']});
  let size=0,done=false;let errorSeen=false;
  const stop=e=>{if(done)return;done=true;clearTimeout(timer);try{child.kill('SIGKILL');}catch{};out.destroy();reject(e);};
  const timer=setTimeout(()=>stop(Error('Dump timed out')),TIMEOUT);
  child.once('error',()=>stop(Error('mariadb-dump executable failed')));
  child.stderr.on('data',()=>{errorSeen=true;}); // Never echo credentials, paths or SQL from external diagnostics.
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>MAX_SIZE){stop(Error('Dump exceeds private LAB size cap'));return;}if(!out.write(chunk))child.stdout.pause();});
  out.on('drain',()=>child.stdout.resume());
  out.on('error',()=>stop(Error('Cannot safely write private dump')));
  child.once('close',code=>{if(done)return;out.end(()=>{if(done)return;done=true;clearTimeout(timer);
   if(code!==0||errorSeen||size===0)reject(Error('mariadb-dump failed or returned diagnostics; no seed committed'));
   else resolve(size);
  });});
 });
}
async function sha(file){const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function verify(dir){
 const abs=path.resolve(dir);
 if(!abs.startsWith(path.resolve(HOME)+path.sep))fail('Only LAB seed directories under HOME may be inspected');
 privateDir(abs);
 let anc=path.dirname(abs);while(anc!==path.dirname(HOME)&&anc.startsWith(HOME)){privateDir(anc);if(anc===HOME)break;anc=path.dirname(anc);}
 for(const name of ['seed.json','seed.sql']){
  const stat=fs.lstatSync(path.join(abs,name));
  if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077))fail('Seed files must be private regular files');
 }
 const metaStat=fs.statSync(path.join(abs,'seed.json'));
 if(metaStat.size>8192)fail('Oversized metadata');
 const meta=JSON.parse(await fsp.readFile(path.join(abs,'seed.json'),'utf8'));
 if(meta.schema!==1||meta.scope!=='MHC_GTID_SEED_LAB_ONLY'||!DB.test(meta.database)||!validGtid(meta.dumpGtid)||
  !/^[a-f0-9]{64}$/.test(meta.sha256)||!Number.isSafeInteger(meta.bytes)||meta.bytes<1||meta.bytes>MAX_SIZE)fail('Invalid seed metadata');
 const st=fs.statSync(path.join(abs,'seed.sql'));
 if(st.size!==meta.bytes||await sha(path.join(abs,'seed.sql'))!==meta.sha256)fail('SQL dump content SHA256 mismatch');
 const fh=await fsp.open(path.join(abs,'seed.sql'),fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 let header;try{const buf=Buffer.alloc(Math.min(st.size,131072));const {bytesRead}=await fh.read(buf,0,buf.length,0);header=buf.toString('utf8',0,bytesRead);}finally{await fh.close();}
 if(dumpGtid(header)!==meta.dumpGtid)fail('SQL dump GTID metadata mismatch');
 return {mode:'SEED_VERIFIED_OFFLINE_ONLY',database:meta.database,bytes:meta.bytes,sha256Verified:true,
  dumpGtid:meta.dumpGtid,seedId:meta.seedId,sqlRestored:false,replicationRunning:false,convergenceVerified:false,haEligible:false,
  notice:'The seed is only an integrity-checked LAB SQL dump. Never import into a live DB or directly execute embedded GTID statements.'};
}
async function capture(db,confirmation){
 if(confirmation!=='--confirm=CAPTURE_CONSISTENT_LAB_GTID_SEED')fail('Explicit LAB-only confirmation required');
 const info=await preflight(db);
 if(!fs.existsSync(STORE))fs.mkdirSync(STORE,{mode:0o700});privateDir(STORE);
 const folder=await fsp.mkdtemp(path.join(STORE,'.pending-'));
 let committed=false;
 try{
  const sql=path.join(folder,'seed.sql');const size=await runDump(db,sql);
  const handle=await fsp.open(sql,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  let head;try{const buf=Buffer.alloc(Math.min(size,131072));const {bytesRead}=await handle.read(buf,0,buf.length,0);head=buf.toString('utf8',0,bytesRead);}finally{await handle.close();}
  const gtid=dumpGtid(head);
  if(!gtid)fail('Dump has no unambiguous embedded GTID position: refuse incomplete seed');
  const digest=await sha(sql);
  const seedId=crypto.randomUUID();
  const meta={schema:1,scope:'MHC_GTID_SEED_LAB_ONLY',seedId,database:db,sourceServerId:info.serverId,
   dumpGtid:gtid,transactionalTables:info.transactionalTables,bytes:size,sha256:digest,createdAt:new Date().toISOString(),
   noAutomaticImport:true,noHaGrants:true};
  await fsp.writeFile(path.join(folder,'seed.json'),JSON.stringify(meta,null,2)+'\n',{mode:0o600,flag:'wx'});
  const target=path.join(STORE,'seed-'+seedId);
  await fsp.rename(folder,target);committed=true;
  const result=await verify(target);
  return {...result,path:target,captured:true,note:'mariadb-dump --master-data=2 briefly coordinates binlog snapshot and may acquire a short global read lock; run only on idle LAB.'};
 }finally{if(!committed)await fsp.rm(folder,{recursive:true,force:true});}
}
async function review(dir){
 const seed=await verify(dir);
 const st=await labStatus();
 const gtids=(await maria('SELECT @@global.gtid_slave_pos;')).trim();
 const observed=validGtid(gtids)?gtids:null;
 return {seedVerified:true,receiverObserved:st.mode,receiverStreams:st.streamsObservedRunning===true,
  sourceSeedGtid:seed.dumpGtid,localSlaveGtid:observed,
  gtidsEqual:!!observed&&seed.dumpGtid===observed,
  dataConvergenceVerified:false,haEligible:false,replicationConfiguredAutomatically:false,
  notice:'Equality of GTIDs or running threads does NOT prove seed import, DB equality, file parity, single writer or HA.'};
}
async function summary(){
 let number=0,last=null;
 try{
  privateDir(STORE);
  const dirs=(await fsp.readdir(STORE)).filter(x=>/^seed-[a-f0-9-]{36}$/.test(x));
  number=Math.min(dirs.length,1000);
  if(dirs.length)last=dirs.sort().at(-1);
 }catch{}
 return {mode:number?'SEEDS_PRESENT_NOT_REPLICATING':'NO_SEED',seedCount:number,integrityCurrentlyVerified:false,
  replicaProvisioned:false,haEligible:false,notice:'Count is local metadata, not an authenticity/replica/HA attestation.'};
}
async function main(){const [cmd,...args]=process.argv.slice(2);
 if(cmd==='seed-capture'&&args.length===2)return console.log(JSON.stringify(await capture(args[0],args[1]),null,2));
 if(cmd==='seed-verify'&&args.length===1)return console.log(JSON.stringify(await verify(args[0]),null,2));
 if(cmd==='seed-review'&&args.length===1)return console.log(JSON.stringify(await review(args[0]),null,2));
 if(cmd==='seed-summary'&&args.length===0)return console.log(JSON.stringify(await summary(),null,2));
 throw Error('Usage: mhc-full replication seed-capture DB --confirm=CAPTURE_CONSISTENT_LAB_GTID_SEED | seed-verify PATH | seed-review PATH | seed-summary');
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))main().catch(()=>{console.error('GTID_SEED_ERROR: Operation refused or failed; inspect LAB preflight and seed integrity. No replication/HA configured.');process.exitCode=1;});
export {dumpGtid,validGtid,verify};
