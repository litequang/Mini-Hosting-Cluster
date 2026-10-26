// MHC TEST 0.4.0B4 — GTID LAB acceptance evidence, not HA / production authorization.
// SOURCE probe writes a single disposable, explicitly-authorized LAB transaction.
// REPLICA check reads applied data and GTID locally. Outage samples never change networking.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {labStatus} from './gtid-lab.mjs';
const execute=promisify(execFile);
const HOME=process.env.HOME||os.homedir();
const STORE=path.join(HOME,'.local/share/mhc-full-installer/gtid-acceptance');
const MARK=path.join(HOME,'.config/mhc-full-installer/installed');
const SCHEMA=/^mhc_lab_[a-z][a-z0-9_]{2,30}$/;
const HEX=/^[a-f0-9]{32}$/;
const GTID=/^(?:[0-9]{1,10}-[0-9]{1,10}-[0-9]{1,20})(?:,[0-9]{1,10}-[0-9]{1,10}-[0-9]{1,20})*$/;
const SCOPE='MHC_GTID_ACCEPTANCE_LAB_ONLY';
const TABLE='mhc_b4_replication_probe';
function fail(message){throw Error(message);}
function isPrivateFile(file,max=8192){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)!==0||s.size>max)fail('Private regular LAB file (0600) required');}
function safeDir(dir){const s=fs.lstatSync(dir);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o022)!==0)fail('Unsafe LAB directory ownership/mode');}
function guard(){isPrivateFile(MARK);if(!/^TEST 0\.(?:3\.|4\.|5\.)/.test(fs.readFileSync(MARK,'utf8')))fail('Unknown LAB installation');safeDir(HOME);
 for(const x of ['apps/thophuongpro/.env','.config/mini-hosting-cluster/ha.json','.config/mhc-full-installer/install-incomplete'])if(fs.existsSync(path.join(HOME,x)))fail('STOP: production, HA or incomplete-install footprint');
 for(const sub of ['static','sites']){const dir=path.join(HOME,'.config/mhc-full-installer',sub);if(fs.existsSync(dir)){safeDir(dir);if(fs.readdirSync(dir).some(x=>x.endsWith(sub==='static'?'.conf':'.env')))fail('STOP: node hosts a registered website; use a dedicated database LAB instance');}}
}
async function mariadb(sql){try{const {stdout}=await execute('mariadb',['--no-defaults','--batch','--skip-column-names','--connect-timeout=2','-e',sql],{timeout:6000,maxBuffer:65536,env:{...process.env,MYSQL_PWD:''}});return stdout.replace(/[\r\n]+$/,'');}catch{fail('MariaDB LAB read-only query failed');}}
async function writeSql(sql){return new Promise((resolve,reject)=>{const child=spawn('mariadb',['--no-defaults','--batch','--skip-column-names','--connect-timeout=2'],{env:{...process.env,MYSQL_PWD:''},stdio:['pipe','ignore','pipe']});let completed=false;const timer=setTimeout(()=>{child.kill('SIGKILL');},10000);child.stderr.on('data',()=>{});child.on('error',()=>{if(completed)return;completed=true;clearTimeout(timer);reject(Error('MariaDB LAB writer unavailable'));});child.on('close',code=>{if(completed)return;completed=true;clearTimeout(timer);if(code!==0)reject(Error('LAB probe write failed; never retry blindly without checking DB'));else resolve();});child.stdin.on('error',()=>{});child.stdin.end(sql+'\n');});}
function parseGtid(s){if(typeof s!=='string'||!GTID.test(s)||s.length>2048)fail('GTID position unavailable/ambiguous');const out=new Map();for(const item of s.split(',')){const [domain,server,sequence]=item.split('-').map(BigInt);const key=String(domain);if(out.has(key))fail('GTID repeated domain is ambiguous');out.set(key,{server,sequence});}return out;}
function progressed(before,after){const a=parseGtid(after);if(!before){return a.size>0;}const b=parseGtid(before);let advanced=false;for(const [domain,v] of b){const next=a.get(domain);if(!next||next.server!==v.server||next.sequence<v.sequence)return false;if(next.sequence>v.sequence)advanced=true;}return advanced||a.size>b.size;}
function caughtUp(target,local){const source=parseGtid(target),replica=parseGtid(local);for(const [domain,mark] of source){const seen=replica.get(domain);if(!seen||seen.server!==mark.server||seen.sequence<mark.sequence)return false;}return true;}
async function instance(db,role){guard();if(!SCHEMA.test(db))fail('Only mhc_lab_* databases allowed');const fields=(await mariadb('SELECT @@global.server_id,@@global.log_bin,@@global.gtid_strict_mode,@@global.read_only,@@global.binlog_format;')).split('\t');if(fields.length!==5)fail('Unexpected MariaDB server variables');const [id,binlog,strict,readOnly,format]=fields;if(!/^[1-9][0-9]*$/.test(id)||!['1','ON'].includes(binlog)||!['1','ON'].includes(strict)||format!=='ROW'||!(['1','ON'].includes(readOnly)=== (role==='replica')))fail('LAB server id/binlog/GTID/ROW or read_only mismatched');
 const dbs=(await mariadb('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA;')).split(/\r?\n/).filter(Boolean);if(!dbs.includes(db)||dbs.some(x=>!['mysql','information_schema','performance_schema','sys',db].includes(x)))fail('Dedicated LAB instance with only specified schema required');return {serverId:Number(id),database:db};}
async function ensureStore(){await fsp.mkdir(STORE,{recursive:true,mode:0o700});safeDir(STORE);}
async function proofAt(p){const abs=path.resolve(p);if(!abs.startsWith(path.resolve(HOME)+path.sep))fail('Proof must be under LAB HOME');isPrivateFile(abs);const a=JSON.parse(await fsp.readFile(abs,'utf8'));if(Object.keys(a).sort().join(',')!==['afterGtid','beforeGtid','createdAt','database','probeId','scope','serverId','value'].sort().join(',')||a.scope!==SCOPE||!SCHEMA.test(a.database)||!HEX.test(a.probeId)||!HEX.test(a.value)||!Number.isSafeInteger(a.serverId)||a.serverId<1||!GTID.test(a.afterGtid)||(a.beforeGtid!==''&&!GTID.test(a.beforeGtid))||!progressed(a.beforeGtid,a.afterGtid)||!Number.isFinite(Date.parse(a.createdAt)))fail('Invalid LAB probe proof');return a;}
async function planSource(db){const s=await instance(db,'source');const status=await labStatus();if(status.mode!=='NOT_CONFIGURED'||status.channelCount!==0)fail('Source must not have a replica channel');return {...s,mode:'SOURCE_LAB_PRECHECK_ONLY',safeToAutoPromote:false,sourceProbeMayWriteOnExplicitConfirmation:true};}
async function sourceProbe(db,confirmation){if(confirmation!=='--confirm=WRITE_DEDICATED_GTID_LAB_PROBE')fail('Explicit LAB-only write confirmation required');const s=await planSource(db);const before=(await mariadb('SELECT @@global.gtid_binlog_pos;')).trim();if(before)parseGtid(before);
 // Create the dedicated probe table only on the standalone source. No site or production tables are touched.
 await writeSql(`CREATE TABLE IF NOT EXISTS \`${db}\`.\`${TABLE}\` (probe_id CHAR(32) NOT NULL PRIMARY KEY, probe_value CHAR(32) NOT NULL) ENGINE=InnoDB;`);
 const probeId=crypto.randomBytes(16).toString('hex'),value=crypto.randomBytes(16).toString('hex');
 await writeSql(`INSERT INTO \`${db}\`.\`${TABLE}\` (probe_id,probe_value) VALUES ('${probeId}','${value}');`);
 const after=(await mariadb('SELECT @@global.gtid_binlog_pos;')).trim();if(!progressed(before,after))fail('Write may have committed, but source GTID progression could not be proven; inspect LAB manually');
 const row=await mariadb(`SELECT probe_value FROM \`${db}\`.\`${TABLE}\` WHERE probe_id='${probeId}';`);if(row!==value)fail('Source probe readback failed');
 await ensureStore();const file=path.join(STORE,`proof-${probeId}.json`),proof={scope:SCOPE,serverId:s.serverId,database:db,probeId,value,beforeGtid:before,afterGtid:after,createdAt:new Date().toISOString()};
 const handle=await fsp.open(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|(fs.constants.O_NOFOLLOW||0),0o600);try{await handle.writeFile(JSON.stringify(proof,null,2)+'\n');await handle.sync();}finally{await handle.close();}
 return {mode:'SOURCE_LAB_PROBE_COMMITTED',proofFile:file,probeId,sourceGtidAdvanced:true,replicaProven:false,haEligible:false,note:'Copy private proof over a trusted channel to the replica LAB. Metadata is not an authenticity certificate.'};}
async function replicaCheck(file){const proof=await proofAt(file);const local=await instance(proof.database,'replica');if(local.serverId===proof.serverId)fail('Source/replica server IDs must differ');const status=await labStatus();if(status.channelCount!==1||status.channels?.[0]?.usingGtid!=='SLAVE_POS')fail('Exactly one slave_pos replication channel required');const pos=(await mariadb('SELECT @@global.gtid_slave_pos;')).trim();const gtidCaughtUp=caughtUp(proof.afterGtid,pos);
 const result=await mariadb(`SELECT probe_value FROM \`${proof.database}\`.\`${TABLE}\` WHERE probe_id='${proof.probeId}';`);const rowMatch=result===proof.value;
 const c=status.channels[0];return {mode:'REPLICA_LAB_PROBE_OBSERVED',schema:proof.database,probeId:proof.probeId,ioRunning:c.ioRunning===true,sqlRunning:c.sqlRunning===true,lagSeconds:c.lagSeconds,gtidCaughtUp,rowMatch,
  validationPassed:gtidCaughtUp&&rowMatch&&c.ioRunning===true&&c.sqlRunning===true&&!c.errorObserved,
  fullDataParityVerified:false,haEligible:false,notice:'Proof of one applied LAB transaction only; does not prove entire DB equality, file parity, writer fencing, RPO or failover.'};}
const PHASES=['baseline','disconnected','reconnected'];
async function sample(phase,proofFile){if(!PHASES.includes(phase))fail('Invalid acceptance phase');const check=await replicaCheck(proofFile);const status=await labStatus();const c=status.channels?.[0]||{};
 if(phase==='baseline'||phase==='reconnected'){if(!check.validationPassed)fail('Cannot record healthy phase without observed GTID+row and running threads');}
 else if(c.ioRunning!==false||c.ioStateKnown!==true||status.channelCount!==1)fail('Disconnect not observed: IO thread is still running or status unknown');
 await ensureStore();const target=path.join(STORE,'outage-evidence.json');let journal={schema:1,scope:SCOPE,probeId:check.probeId,samples:[]};
 if(fs.existsSync(target)){isPrivateFile(target,16384);journal=JSON.parse(await fsp.readFile(target,'utf8'));if(journal.schema!==1||journal.scope!==SCOPE||journal.probeId!==check.probeId||!Array.isArray(journal.samples)||journal.samples.length>2)fail('Existing outage evidence incompatible');}
 if(PHASES[journal.samples.length]!==phase)fail('Outage phases must be baseline -> disconnected -> reconnected, never overwrite');
 journal.samples.push({phase,observedAt:new Date().toISOString(),ioRunning:c.ioRunning===true,sqlRunning:c.sqlRunning===true,gtidCaughtUp:check.gtidCaughtUp,rowMatch:check.rowMatch,lagSeconds:check.lagSeconds});
 const tmp=path.join(STORE,`.journal-${process.pid}-${crypto.randomBytes(6).toString('hex')}`);await fsp.writeFile(tmp,JSON.stringify(journal,null,2)+'\n',{mode:0o600,flag:'wx'});await fsp.rename(tmp,target);
 return {mode:'LAB_OUTAGE_PHASE_RECORDED',phase,sampleCount:journal.samples.length,reportPath:target,networkChangedByMhc:false,haEligible:false};}
async function report(){guard();const file=path.join(STORE,'outage-evidence.json');if(!fs.existsSync(file))return {mode:'NO_OUTAGE_EVIDENCE',completed:false,haEligible:false};isPrivateFile(file,16384);const j=JSON.parse(await fsp.readFile(file,'utf8'));if(j.schema!==1||j.scope!==SCOPE||!Array.isArray(j.samples)||j.samples.length>3||j.samples.some((x,i)=>x.phase!==PHASES[i]))fail('Outage evidence invalid');return {mode:'LAB_OUTAGE_EVIDENCE',phases:j.samples.map(x=>x.phase),completed:j.samples.length===3&&j.samples[0].ioRunning&&!j.samples[1].ioRunning&&j.samples[2].ioRunning&&j.samples[2].gtidCaughtUp&&j.samples[2].rowMatch,haEligible:false,notice:'Human-reviewed LAB evidence only. No full DB parity, network fencing or auto HA entitlement.'};}
async function main(){const [cmd,...args]=process.argv.slice(2);let response;
 if(cmd==='source-plan'&&args.length===1)response=await planSource(args[0]);
 else if(cmd==='source-probe'&&args.length===2)response=await sourceProbe(args[0],args[1]);
 else if(cmd==='replica-check'&&args.length===1)response=await replicaCheck(args[0]);
 else if(cmd==='outage-sample'&&args.length===2)response=await sample(args[0],args[1]);
 else if(cmd==='outage-report'&&args.length===0)response=await report();
 else fail('Usage: mhc-full replication source-plan LAB_DB | source-probe LAB_DB --confirm=WRITE_DEDICATED_GTID_LAB_PROBE | replica-check PRIVATE_PROOF | outage-sample baseline|disconnected|reconnected PRIVATE_PROOF | outage-report');
 console.log(JSON.stringify(response,null,2));}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))main().catch(e=>{console.error('GTID_ACCEPTANCE_LAB_ERROR:',e.message);process.exitCode=1;});
export {parseGtid,progressed,caughtUp,proofAt,planSource,replicaCheck};
