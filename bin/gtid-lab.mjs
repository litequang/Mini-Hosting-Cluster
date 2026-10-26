// MHC v0.4B.1 — MariaDB GTID LAB preflight, plan and replica telemetry.
// No SQL writes, users, passwords, CHANGE MASTER, START SLAVE, port opening or HA grants.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {probeGtid} from './replication-observer.mjs';
const execute=promisify(execFile);
const HOME=process.env.HOME||os.homedir();
const PREFIX=process.env.PREFIX||'/data/data/com.termux/files/usr';
const DATA=path.join(HOME,'.local/share/mhc-full-installer/gtid-lab');
const MARK=path.join(HOME,'.config/mhc-full-installer/installed');
const MAX_CHANNELS=12;
function safeInt(s,min=0,max=4294967295){
 if(typeof s!=='string'||!/^(0|[1-9][0-9]{0,9})$/.test(s))return null;
 const n=Number(s);return Number.isSafeInteger(n)&&n>=min&&n<=max?n:null;
}
function parseVertical(input){
 if(typeof input!=='string'||input.length>128*1024)throw Error('Unexpected or oversized replication status');
 if(input.trim()==='')return [];
 const records=[];let row=null;
 for(const line of input.split(/\r?\n/)){
  if(/^\*{5,}\s*\d+\.\s*row\s*\*{5,}\s*$/i.test(line.trim())){
   if(row&&Object.keys(row).length)records.push(row);
   row=Object.create(null);continue;
  }
  const m=line.match(/^\s*([A-Za-z][A-Za-z_0-9]*):\s*(.*?)\s*$/);
  if(m){if(!row)row=Object.create(null);row[m[1].toLowerCase()]=m[2];}
 }
 if(row&&Object.keys(row).length)records.push(row);
 if(records.length>MAX_CHANNELS)throw Error('Too many replication channels to summarize safely');
 return records;
}
function summary(record){
 const io=record.slave_io_running||record.replica_io_running||'Unknown';
 const sql=record.slave_sql_running||record.replica_sql_running||'Unknown';
 const lag=record.seconds_behind_master??record.seconds_behind_source;
 const lagSec=lag===undefined||lag==='NULL'?null:safeInt(lag,0,1000000000);
 const name=record.connection_name||record.channel_name||'';
 // Do not emit names: connection labels can contain human-supplied secrets/hosts.
 const errorCode=['last_io_errno','last_sql_errno','last_io_error_code','last_sql_error_code'].some(k=>record[k]&&record[k]!=='0');
 return {ioRunning:io==='Yes',sqlRunning:sql==='Yes',ioStateKnown:['Yes','No','Connecting'].includes(io),
  sqlStateKnown:['Yes','No'].includes(sql),lagSeconds:lagSec,lagKnown:lagSec!==null,
  usingGtid:record.using_gtid==='Slave_Pos'?'SLAVE_POS':record.using_gtid==='Current_Pos'?'CURRENT_POS':'NONE_OR_UNKNOWN',
  upstreamServerId:safeInt(record.master_server_id||record.source_server_id||''),
  sqlDelaySeconds:safeInt(record.sql_delay||'0',0,1000000000),
  errorObserved:errorCode,connectionLabelHidden:!!name};
}
async function rawMaria(sql){
 try{
  const {stdout}=await execute('mariadb',['--no-defaults','--batch','--skip-column-names','--connect-timeout=2','-e',sql],{
   timeout:4500,maxBuffer:128*1024,env:{...process.env,MYSQL_PWD:''}});
  return stdout;
 }catch{return null;}
}
export async function labStatus(){
 const gtid=await probeGtid();
 let raw=await rawMaria('SHOW ALL SLAVES STATUS\\G');
 if(raw===null)raw=await rawMaria('SHOW SLAVE STATUS\\G');
 if(raw===null)return {schema:1,mode:'UNOBSERVABLE',observedAt:new Date().toISOString(),gtid:{
  observed:gtid.observed===true,serverId:gtid.serverId??null,binaryLogEnabled:gtid.binaryLogEnabled??null,
  gtidStrictMode:gtid.gtidStrictMode??null,readOnly:gtid.readOnly??null},channels:[],channelCount:null,
  dataConvergenceVerified:false,continuousReplicationVerified:false,haEligible:false,
  notice:'Cannot query local replica status. No remote or HA evidence.'};
 let records;
 try{records=parseVertical(raw);}catch{return {schema:1,mode:'INVALID_STATUS',observedAt:new Date().toISOString(),
  channels:[],channelCount:null,dataConvergenceVerified:false,continuousReplicationVerified:false,haEligible:false,
  notice:'Invalid or oversized replica status; no conclusions permitted.'};}
 const channels=records.map(summary);
 const healthy=channels.length===1&&channels[0].ioRunning&&channels[0].sqlRunning&&
  channels[0].usingGtid==='SLAVE_POS'&&!channels[0].errorObserved&&gtid.observed;
 const mode=channels.length===0?'NOT_CONFIGURED':healthy?'STREAMS_RUNNING_UNVERIFIED':'CONFIGURED_NEEDS_REVIEW';
 return {schema:1,mode,observedAt:new Date().toISOString(),gtid:{
  observed:gtid.observed===true,serverId:gtid.serverId??null,binaryLogEnabled:gtid.binaryLogEnabled??null,
  gtidStrictMode:gtid.gtidStrictMode??null,readOnly:gtid.readOnly??null},
  channelCount:channels.length,channels,
  streamsObservedRunning:healthy,dataConvergenceVerified:false,continuousReplicationVerified:false,haEligible:false,
  notice:'IO+SQL running and lag are local observations only; no GTID catch-up, snapshot consistency, remote authority or fencing proof.'};
}
function ensureLab(){
 let mark;
 try{const st=fs.lstatSync(MARK);if(!st.isFile()||st.isSymbolicLink())throw Error();mark=fs.readFileSync(MARK,'utf8');}
 catch{throw Error('STOP: completed TEST LAB marker required');}
 if(!/^TEST 0\.(?:3\.|4\.|5\.)/.test(mark))throw Error('STOP: unknown installed marker');
 for(const file of [path.join(HOME,'apps/thophuongpro/.env'),path.join(HOME,'.config/mini-hosting-cluster/ha.json'),path.join(HOME,'.config/mhc-full-installer/install-incomplete')]){
  if(fs.existsSync(file))throw Error('STOP: production, HA or incomplete-install footprint detected');
 }
 for(const dir of [HOME,path.join(HOME,'.local'),path.join(HOME,'.local/share'),path.join(HOME,'.local/share/mhc-full-installer')]){
  if(fs.existsSync(dir)&&(!fs.lstatSync(dir).isDirectory()||fs.lstatSync(dir).isSymbolicLink()))throw Error('STOP: unsafe LAB path');
 }
}
export async function labPlan(role,idText){
 if(!['source','replica'].includes(role))throw Error('Usage: lab-plan source|replica SERVER_ID');
 const id=safeInt(idText,1);
 if(id===null)throw Error('Invalid server-id; use unique integer 1..4294967295');
 ensureLab();
 await fsp.mkdir(DATA,{recursive:true,mode:0o700});
 if(fs.lstatSync(DATA).isSymbolicLink())throw Error('Unsafe LAB output directory');
 const bytes=[
 '# MANUAL REVIEW ONLY — DO NOT auto-install into MariaDB /etc config',
 '# Unique server-id per device. Only for empty/sanitized isolated LAB MariaDB.',
 '[mysqld]',
 `server_id=${id}`,
 `log_bin=${PREFIX}/var/lib/mysql/mhc-lab-bin`,
 'binlog_format=ROW',
 'gtid_strict_mode=ON',
 'log_slave_updates=ON',
 ...(role==='replica'?['read_only=ON','skip_slave_start=ON',`relay_log=${PREFIX}/var/lib/mysql/mhc-lab-relay`]:[]),
 '# Keep MariaDB TCP bound to localhost; use independently authenticated SSH forwarding.',
 '# Verify backup + source GTID + consistent snapshot BEFORE setting MASTER_USE_GTID=slave_pos.',
 ''
 ].join('\n');
 const name=`${role}-server-${id}.cnf`;
 const target=path.join(DATA,name);
 const fd=await fsp.open(target,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
 try{await fd.writeFile(bytes);await fd.sync();}finally{await fd.close();}
 const st=await labStatus();
 return {mode:'CONFIG_TEMPLATE_ONLY',template:target,role,proposedServerId:id,
  currentServerId:st.gtid?.serverId??null,localState:st.mode,applied:false,
  pending:['Backup and restore rehearsal on both LAB nodes','Independent unique server IDs','Manually review MariaDB config location and binary log directory','Restrict SQL replication account and SSH trust','Restore consistent source snapshot to an EMPTY replica schema','Manual CHANGE MASTER/START SLAVE only after confirmed LAB preflight','Observe GTID progression and compare source/replica data/checkpoints','Test network interruptions without auto promotion'],
  notice:'Template only; MHC did not modify MariaDB, network, replica credentials, DNS, HA or files outside LAB template store.'};
}
async function main(){const [command,...args]=process.argv.slice(2);
 if(command==='lab-status'&&args.length===0)return console.log(JSON.stringify(await labStatus(),null,2));
 if(command==='lab-plan'&&args.length===2)return console.log(JSON.stringify(await labPlan(args[0],args[1]),null,2));
 throw Error('Usage: mhc-full replication lab-status | lab-plan source|replica SERVER_ID');
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))main().catch(e=>{console.error('GTID_LAB_ERROR:',e.message);process.exitCode=1;});
