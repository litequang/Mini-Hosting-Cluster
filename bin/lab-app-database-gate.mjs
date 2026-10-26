// MHC TEST 0.5.0C-LAB — real MariaDB client insert behind LAB HTTP/witness gate.
// ONLY dedicated MariaDB test instance on private Unix socket; NEVER production SQL fencing.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assertIsolatedLab,verifyLabLease} from './write-path-gate-lab.mjs';
const HOME=process.env.HOME||os.homedir();
const DBHOME=path.join(HOME,'mhc-db-lab');
const OPTIONS=path.join(DBHOME,'client.cnf');
const SOCK=path.join(DBHOME,'run','mariadb.sock');
const DB='mhc_lab_app';
const MAX_PAYLOAD=512;
function fail(x){throw new Error(x)}
function ownerSafe(st){return typeof process.getuid!=='function'||st.uid===process.getuid()}
function privateDir(dir){
 const st=fs.lstatSync(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)||!ownerSafe(st))fail('UNSAFE_DB_LAB_DIRECTORY');
}
function privateFile(file){
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o077)||!ownerSafe(st)||st.size<10||st.size>2048)fail('UNSAFE_DB_LAB_CLIENT_OPTIONS');
}
export function checkDbLabConfig(){
 assertIsolatedLab();privateDir(DBHOME);privateDir(path.join(DBHOME,'run'));privateFile(OPTIONS);
 const content=fs.readFileSync(OPTIONS,'utf8');
 // Strict client config: localhost-only Unix socket in the dedicated LAB tree.
 // No host, port, plugin, command, init-command, or include directives.
 const lines=content.split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#'));
 if(lines[0]!=='[client]')fail('DB_LAB_CLIENT_SECTION_REQUIRED');
 const fields=new Map();
 for(const line of lines.slice(1)){
  const m=/^(user|password|socket|protocol)=(.*)$/.exec(line);
  if(!m||fields.has(m[1]))fail('DB_LAB_CLIENT_OPTIONS_NOT_ALLOWLISTED');
  fields.set(m[1],m[2]);
 }
 if(fields.size!==4||fields.get('protocol')!=='socket'||fields.get('socket')!==SOCK||
    !/^mhc_lab_writer$/.test(fields.get('user')||'')||
    !fields.get('password')||fields.get('password').length<20||fields.get('password').length>128)fail('DB_LAB_CLIENT_OPTIONS_UNSAFE');
 // Do not follow a symbolic link to the database socket or any outside instance.
 const st=fs.lstatSync(SOCK);
 if(!st.isSocket()||st.isSymbolicLink()||!ownerSafe(st))fail('DEDICATED_DB_LAB_SOCKET_REQUIRED');
 return {configured:true,db:DB,socketDedicated:true,productionProtected:false,haEligible:false};
}
export function parseBody(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<2||bytes.length>2048)fail('INVALID_LAB_DB_PAYLOAD');
 let x;try{x=JSON.parse(bytes.toString('utf8'))}catch{fail('INVALID_LAB_DB_JSON')}
 if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).sort().join(',')!=='id,value')fail('INVALID_LAB_DB_SCHEMA');
 if(typeof x.id!=='string'||!/^[a-f0-9]{32}$/.test(x.id))fail('INVALID_LAB_DB_ID');
 if(typeof x.value!=='string'||x.value.length<1||Buffer.byteLength(x.value,'utf8')>MAX_PAYLOAD||/[\u0000-\u001f\u007f]/.test(x.value))fail('INVALID_LAB_DB_VALUE');
 return x;
}
export function sqlForRecord(x){
 const bytes=Buffer.from(x.value,'utf8');
 // Fixed SQL, hex encoded values, no user-provided names or SQL fragments.
 return `INSERT INTO ${DB}.write_events (request_id, payload_sha256, value_bytes) VALUES (UNHEX('${x.id}'), UNHEX('${crypto.createHash('sha256').update(bytes).digest('hex')}'), UNHEX('${bytes.toString('hex')}'));\n`;
}
export async function sqlExecutor(sql){
 checkDbLabConfig();
 return await new Promise((resolve,reject)=>{
  // Never expose DB password in process argv/environment. Isolated option file is 0600.
  const proc=spawn('mariadb',[`--defaults-file=${OPTIONS}`,'--batch','--skip-column-names','--silent'],
    {stdio:['pipe','ignore','pipe'],env:{PATH:process.env.PATH||'/usr/bin:/bin',HOME},cwd:DBHOME});
  let error='',done=false;
  const timer=setTimeout(()=>{proc.kill('SIGKILL');},4000);
  proc.stderr.on('data',b=>{error+=(b.length>256?'error':b.toString('utf8')).slice(0,256);});
  proc.on('error',e=>{if(!done){done=true;clearTimeout(timer);reject(Error('DB_LAB_CLIENT_START_FAILED'))}});
  proc.on('close',code=>{if(done)return;done=true;clearTimeout(timer);
   if(code!==0)reject(Error('DB_LAB_INSERT_FAILED'));else resolve({inserted:true});
  });
  proc.stdin.on('error',()=>{});proc.stdin.end(sql);
 });
}
export async function writeLabDb(bytes,{check=undefined,execute=sqlExecutor}={}){
 const x=parseBody(bytes);
 // Requiring config prior to making any witness queries also blocks Vsmart sites.
 if(execute===sqlExecutor)checkDbLabConfig();else assertIsolatedLab();
 const first=await verifyLabLease(check);
 const second=await verifyLabLease(check);
 if(first.epoch!==second.epoch)fail('DB_LAB_WITNESS_EPOCH_CHANGED');
 if(second.validForMs<3000)fail('DB_LAB_LEASE_TOO_SHORT');
 // A witness request and SQL COMMIT cannot be atomic across systems. This is NOT fencing.
 await execute(sqlForRecord(x));
 return {scope:'DEDICATED_MARIADB_APP_LAB_ONLY',inserted:true,requestId:x.id,
  epoch:second.epoch,payloadSha256:crypto.createHash('sha256').update(x.value,'utf8').digest('hex'),
  witnessVerifiedBeforeWrite:true,atomicWitnessAndSql:false,productionProtected:false,haEligible:false};
}
export function plan(){return {scope:'DEDICATED_MARIADB_APP_LAB_ONLY',database:DB,configPresent:fs.existsSync(OPTIONS),
 schemaSetupManually:true,credentialsMustBeUnprivileged:true,hostingProtected:false,physicalLabVerified:false,
 notice:'The only SQL path guarded is the dedicated mhc_lab_app.write_events endpoint. Direct SQL shell, PHP, site files and backups are NOT gated.'};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.slice(2).join(' ')!=='plan'){console.error('Usage: mhc-full app-db-gate plan (read-only)');process.exitCode=2}
 else console.log(JSON.stringify(plan(),null,2));
}
