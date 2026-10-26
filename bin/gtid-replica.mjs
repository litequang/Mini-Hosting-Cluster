// MHC TEST 0.4.0B3 — Explicit LAB-only GTID replica attach, after an independently restored seed.
// Never imports SQL, creates DB/users, opens ports, promotes a node or modifies Cloudflare.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {verify as verifySeed} from './gtid-seed.mjs';
import {labStatus} from './gtid-lab.mjs';
const exec=promisify(execFile),HOME=process.env.HOME||os.homedir();
const MARK=path.join(HOME,'.config/mhc-full-installer/installed');
const SCOPE='MHC_GTID_REPLICA_LAB_ONLY';
const GTID=/^(?:[0-9]{1,10}-[0-9]{1,10}-[0-9]{1,20})(?:,[0-9]{1,10}-[0-9]{1,10}-[0-9]{1,20})*$/;
const dbName=/^mhc_lab_[a-z][a-z0-9_]{2,30}$/;
function stop(message){throw Error(message);}
function safeFile(file){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)!==0||s.size>8192)stop('Only private regular LAB configuration files (0600) accepted');}
function guard(){
 safeFile(MARK);if(!/^TEST 0\.(?:3\.|4\.|5\.)/.test(fs.readFileSync(MARK,'utf8')))stop('Unknown LAB installation');
 for(const p of ['apps/thophuongpro/.env','.config/mini-hosting-cluster/ha.json','.config/mhc-full-installer/install-incomplete'])if(fs.existsSync(path.join(HOME,p)))stop('STOP: production, HA or partial installation footprint');
 const homeStat=fs.lstatSync(HOME);if(!homeStat.isDirectory()||homeStat.isSymbolicLink()||(homeStat.mode&0o022))stop('Unsafe HOME permissions');
}
async function query(sql){
 try{const {stdout}=await exec('mariadb',['--no-defaults','--batch','--skip-column-names','--connect-timeout=2','-e',sql],
 {timeout:5500,maxBuffer:131072,env:{...process.env,MYSQL_PWD:''}});return stdout.replace(/[\r\n]+$/,'');}
 catch{stop('Local MariaDB LAB check unavailable; operation refused');}
}
async function inspectedSeed(seedPath){
 const seed=await verifySeed(seedPath);
 const meta=JSON.parse(await fsp.readFile(path.join(path.resolve(seedPath),'seed.json'),'utf8'));
 if(!dbName.test(meta.database)||!Number.isSafeInteger(meta.sourceServerId)||meta.sourceServerId<1||!GTID.test(meta.dumpGtid)||meta.transactionalTables<1)
  stop('Seed metadata incomplete; cannot attach');
 return {seed,meta};
}
async function preflight(seedPath){
 guard();
 const {seed,meta}=await inspectedSeed(seedPath);
 const variables=(await query('SELECT @@global.server_id,@@global.log_bin,@@global.gtid_strict_mode,@@global.read_only,@@global.binlog_format,@@global.gtid_slave_pos,@@global.gtid_binlog_pos;')).split('\t');
 if(variables.length!==7)stop('Unexpected MariaDB GTID variables');
 const [id,binlog,strict,ro,format,slavePos,localBinlogPos]=variables;
 if(!/^[1-9][0-9]*$/.test(id)||Number(id)===meta.sourceServerId||!['1','ON'].includes(binlog)||!['1','ON'].includes(strict)||!['1','ON'].includes(ro)||format!=='ROW')
  stop('Replica must be distinct LAB server-id, log_bin/strict GTID/ROW enabled and read_only=ON');
 if(slavePos!==meta.dumpGtid||!GTID.test(slavePos))stop('Replica gtid_slave_pos must equal the exact restored seed GTID');
 if(localBinlogPos!=='')stop('Replica has local GTID/binlog changes; do not attach a divergent instance');
 const databases=(await query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA;')).split(/\r?\n/).filter(Boolean);
 if(!databases.includes(meta.database)||databases.some(x=>!['information_schema','performance_schema','mysql','sys',meta.database].includes(x)))
  stop('Dedicated LAB instance must contain only the restored seed application database');
 const tables=await query(`SELECT TABLE_TYPE,COALESCE(ENGINE,'') FROM information_schema.TABLES WHERE TABLE_SCHEMA='${meta.database}';`);
 const types=tables.split(/\r?\n/).filter(Boolean).map(x=>x.split('\t'));
 const count=types.filter(x=>x[0]==='BASE TABLE'&&x[1]==='InnoDB').length;
 if(count!==meta.transactionalTables||types.some(x=>x[0]==='BASE TABLE'&&x[1]!=='InnoDB'))stop('LAB seed table count / InnoDB baseline mismatch');
 const status=await labStatus();
 if(status.mode!=='NOT_CONFIGURED'||status.channelCount!==0)stop('Existing replication channel or unreadable receiver state');
 return {scope:SCOPE,mode:'SEED_RESTORED_PRECHECK_ONLY',seedVerified:true,seedGtidMatchesLocal:true,
  sourceServerId:meta.sourceServerId,replicaServerId:Number(id),schema:meta.database,tableCount:count,
  dataEqualityVerified:false,replicationRunning:false,haEligible:false};
}
async function profileData(file){
 const abs=path.resolve(file);if(!abs.startsWith(path.resolve(HOME)+path.sep))stop('Profile must be stored beneath LAB HOME');
 safeFile(abs);
 const p=JSON.parse(await fsp.readFile(abs,'utf8'));
 if(Object.keys(p).sort().join(',')!=='host,password,port,scope,user'||p.scope!==SCOPE||p.host!=='127.0.0.1'||
  !Number.isInteger(p.port)||p.port<1024||p.port>65535||!/^mhc_repl_[a-z][a-z0-9_]{2,24}$/.test(p.user)||
  typeof p.password!=='string'||p.password.length<20||p.password.length>128||!(/^[A-Za-z0-9!@#%+=:._-]+$/).test(p.password))
  stop('Invalid private profile; require pinned SSH tunnel to localhost and restricted LAB account');
 return p;
}
function privateSql(sql){
 // Use STDIN so the replication password does not appear in argv, shell history or reports.
 return new Promise((resolve,reject)=>{
  const child=spawn('mariadb',['--no-defaults','--batch','--skip-column-names','--connect-timeout=2'],
   {env:{...process.env,MYSQL_PWD:''},stdio:['pipe','ignore','pipe']});
  let closed=false;let diagnostic=false;
  const timer=setTimeout(()=>{child.kill('SIGKILL');},8000);
  child.stderr.on('data',()=>{diagnostic=true;});
  child.on('error',()=>{closed=true;clearTimeout(timer);reject(Error('MariaDB SQL client unavailable'));});
  child.on('close',code=>{if(closed)return;closed=true;clearTimeout(timer);
   if(code!==0||diagnostic)reject(Error('MariaDB LAB attach step failed. Inspect receiver locally; do not retry blindly.'));
   else resolve();});
  child.stdin.on('error',()=>{});child.stdin.end(sql+'\n');
 });
}
async function attach(seedPath,profilePath,confirmation){
 if(confirmation!=='--confirm=ATTACH_ISOLATED_GTID_REPLICA_LAB')stop('Explicit destructive LAB-only confirmation required');
 const checks=await preflight(seedPath);
 const p=await profileData(profilePath);
 // Read-only networking probe; fail closed if forwarding to source has not been configured.
 const port=Number(p.port);
 try{const net=await import('node:net');await new Promise((resolve,reject)=>{
  const s=net.connect({host:'127.0.0.1',port});
  s.setTimeout(1600);s.once('connect',()=>{s.destroy();resolve();});s.once('error',reject);s.once('timeout',()=>{s.destroy();reject(Error('timeout'));});
 });}catch{stop('LAB SSH local port forward not reachable; do not expose MariaDB on LAN/WAN');}
 // Reverify both checksum and receiver state directly before writes.
 await preflight(seedPath);
 // No RESET SLAVE or implicit GTID modification. The restored seed must have set gtid_slave_pos.
 const escaped=x=>x.replaceAll("'","''");
 await privateSql(`CHANGE MASTER TO MASTER_HOST='127.0.0.1', MASTER_PORT=${port}, MASTER_USER='${escaped(p.user)}', MASTER_PASSWORD='${escaped(p.password)}', MASTER_USE_GTID=slave_pos, MASTER_CONNECT_RETRY=5;`);
 // Failure here leaves a configured channel; require manual review instead of unsafe blind retry.
 await privateSql('START SLAVE;');
 const status=await labStatus();
 return {scope:SCOPE,mode:'REPLICA_ATTACH_ATTEMPTED',seedVerified:true,seedGtidMatchesAtAttach:true,
  replicaServerId:checks.replicaServerId,channelCount:status.channelCount,receiverState:status.mode,
  ioRunning:status.channels?.[0]?.ioRunning===true,sqlRunning:status.channels?.[0]?.sqlRunning===true,
  replicationProven:false,convergenceVerified:false,haEligible:false,
  notice:'Asynchronous replica START requested. Verify IO+SQL, source writes, SQL results, GTID progression and reconnect on two LAB devices. No HA entitlement.'};
}
async function observe(){guard();const s=await labStatus();
 return {scope:SCOPE,mode:s.mode,channelCount:s.channelCount,
  channels:(s.channels||[]).map(c=>({ioRunning:c.ioRunning,sqlRunning:c.sqlRunning,usingGtid:c.usingGtid,lagSeconds:c.lagSeconds,errorObserved:c.errorObserved})),
  dataConvergenceVerified:false,haEligible:false,notice:'Live LOCAL receiver observation, not a consistency or failover certificate.'};}
async function main(){const [cmd,...args]=process.argv.slice(2);
 if(cmd==='replica-plan'&&args.length===1)return console.log(JSON.stringify(await preflight(args[0]),null,2));
 if(cmd==='replica-attach'&&args.length===3)return console.log(JSON.stringify(await attach(args[0],args[1],args[2]),null,2));
 if(cmd==='replica-observe'&&args.length===0)return console.log(JSON.stringify(await observe(),null,2));
 throw Error('Usage: mhc-full replication replica-plan SEED_DIR | replica-attach SEED_DIR PRIVATE_PROFILE --confirm=ATTACH_ISOLATED_GTID_REPLICA_LAB | replica-observe');
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))main().catch(e=>{
 console.error('GTID_REPLICA_LAB_ERROR:',e.message);process.exitCode=1;
});
export {preflight,profileData};
