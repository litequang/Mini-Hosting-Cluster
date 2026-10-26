// MHC 0.5C WRITER-AUDIT — read-only inventory of possible bypass write paths.
// Scanning a machine can NEVER confer fencing authority; missing observations stay UNKNOWN.
// No SQL, network, credential, command-line process dump, service changes or file writes.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const RELEASE='TEST 0.5.0C-WRITER-AUDIT';
export const SURFACES=Object.freeze([
 {id:'http_ingress',label:'HTTP ingress / Nginx',services:['nginx','mini-web','mhc-full-wp-nginx'],signals:['nginxConfig','siteRegistration']},
 {id:'php_wordpress',label:'PHP-FPM / WordPress',services:['mhc-full-wp-php','php-fpm'],signals:['siteRegistration','wpRoots']},
 {id:'mariadb_direct',label:'MariaDB socket / SQL clients',services:['mysqld','mariadb'],signals:['mariaSocket']},
 {id:'database_privileges',label:'MariaDB privileged/local writers',services:['mysqld','mariadb'],signals:['mariaSocket']},
 {id:'file_upload',label:'Direct filesystem / uploads',services:[],signals:['siteRegistration','wpRoots']},
 {id:'sheet_files',label:'Sheet / Sheet+ file changes',services:[],signals:['siteRegistration','tpEnv']},
 {id:'web_admin',label:'Hosting admin Panel APIs',services:['amh-panel','mhc-full-panel'],signals:['panelSource']},
 {id:'background_jobs',label:'Scheduled jobs / cron',services:['crond','mhc-full-daily-backup','mhc-full-heartbeat'],signals:['backupTask']},
 {id:'shell_ssh',label:'Termux SSH/shell',services:['sshd'],signals:['termuxEnv']},
 {id:'backup_restore',label:'Backup / restore entrypoints',services:[],signals:['installedMarker','backupTask']},
 {id:'cloudflare_route',label:'Cloudflare / ingress routing',services:['named-tunnel','cloudflared'],signals:['cloudflaredConfig']},
 {id:'external_writers',label:'External clients / Android apps',services:[],signals:['termuxEnv']}
]);
const SERVICE_NAMES=[...new Set(SURFACES.flatMap(s=>s.services))];
const SAFE_STATE=new Set(['running','stopped','not_observed','unknown']);
const SAFE_SIGNAL=['nginxConfig','siteRegistration','wpRoots','mariaSocket','tpEnv','panelSource','backupTask','termuxEnv','installedMarker','cloudflaredConfig'];
const VERSION_SCHEMA=1;
function safeType(file){
 try{const st=fs.lstatSync(file);return st.isSymbolicLink()?'symlink':st.isDirectory()?'directory':st.isFile()?'file':st.isSocket()?'socket':'other';}catch{return 'missing';}
}
function hasRegistration(home){
 for(const [dir,ext] of [['static','.conf'],['sites','.env']]){
  const d=path.join(home,'.config/mhc-full-installer',dir);
  if(safeType(d)!=='directory')continue;
  try{if(fs.readdirSync(d).some(n=>n.endsWith(ext)&&/^[a-z][a-z0-9-]{1,30}\.(?:conf|env)$/.test(n)&&safeType(path.join(d,n))==='file'))return true;}catch{return false;}
 }
 return false;
}
function someDirectoryEntries(d){
 if(safeType(d)!=='directory')return false;
 try{return fs.readdirSync(d).some(x=>!x.startsWith('.')&&safeType(path.join(d,x))==='directory');}catch{return false;}
}
export function observeLocalSignals(home=process.env.HOME||os.homedir(),prefix=process.env.PREFIX||'/data/data/com.termux/files/usr'){
 // Metadata only: never read file contents, path contents, credentials, env values or DB names.
 const ss={
  nginxConfig:safeType(path.join(prefix,'etc/nginx/nginx.conf'))==='file',
  siteRegistration:hasRegistration(home),
  wpRoots:someDirectoryEntries(path.join(home,'websites')),
  mariaSocket:[path.join(prefix,'var/run/mysqld.sock'),path.join(prefix,'var/lib/mysql/mysql.sock'),path.join(prefix,'var/run/mysqld/mysqld.sock')].some(p=>safeType(p)==='socket'),
  tpEnv:safeType(path.join(home,'apps/thophuongpro/.env'))==='file',
  panelSource:safeType(path.join(home,'android-hosting-panel/src/server.mjs'))==='file',
  backupTask:safeType(path.join(home,'hosting-backups/mhc-full'))==='directory',
  termuxEnv:prefix==='/data/data/com.termux/files/usr',
  installedMarker:safeType(path.join(home,'.config/mhc-full-installer/installed'))==='file',
  cloudflaredConfig:safeType(path.join(home,'.cloudflared/config.yml'))==='file'
 };
 return ss;
}
function runSv(name,prefix){
 return new Promise(resolve=>{
  const cmd=path.join(prefix,'bin/sv');
  // Termux tools may be symlinks; allow them only when their resolved target stays inside PREFIX.
  try{const real=fs.realpathSync(cmd);if(!real.startsWith(prefix+path.sep)||!fs.statSync(cmd).isFile()){resolve('not_observed');return;}}
  catch{resolve('not_observed');return;}
  execFile(cmd,['status',name],{timeout:1200,maxBuffer:1500,encoding:'utf8'},(err,out)=>{
   const s=String(out||'');
   resolve(err&&(!s.startsWith('run:')&&!s.startsWith('down:'))?'not_observed':s.startsWith('run:')?'running':s.startsWith('down:')?'stopped':'unknown');
  });
 });
}
export async function observeServices(prefix=process.env.PREFIX||'/data/data/com.termux/files/usr'){
 const pairs=await Promise.all(SERVICE_NAMES.map(async s=>[s,await runSv(s,prefix)]));
 return Object.fromEntries(pairs);
}
export function analyzeWritePaths({signals={},services={},observedAt=new Date().toISOString()}={}){
 // Disallow a caller from asserting arbitrary path protection. The ONLY supported
 // conclusion is that production enforcement has NOT been independently verified.
 const sanitizedSignals=Object.fromEntries(SAFE_SIGNAL.map(k=>[k,signals[k]===true]));
 const sanitizedServices=Object.fromEntries(SERVICE_NAMES.map(k=>[k,SAFE_STATE.has(services[k])?services[k]:'not_observed']));
 const paths=SURFACES.map(def=>{
  const running=def.services.filter(s=>sanitizedServices[s]==='running');
  const configFound=def.signals.filter(s=>sanitizedSignals[s]);
  const detected=running.length>0||configFound.length>0;
  return {id:def.id,label:def.label,
   observation:running.length?'RUNNING_SERVICE':configFound.length?'CONFIG_PRESENT':'NOT_OBSERVED',
   liveServiceCount:running.length,configSignalCount:configFound.length,
   fenceStatus:'NOT_ATTESTED',canBypassGate:'NOT_EXCLUDED',safeToWrite:false};
 });
 const activePaths=paths.filter(p=>p.observation!=='NOT_OBSERVED').length;
 return {schema:VERSION_SCHEMA,release:RELEASE,scope:'LOCAL_READ_ONLY_HOST_WRITE_PATH_INVENTORY',observedAt,
  pathCount:paths.length,activeOrConfiguredCount:activePaths,unverifiedFencingPaths:paths.length,paths,
  serviceStates:sanitizedServices,
  limitations:{onlyKnownServicesObserved:true,fullProcessAndDBGrantCoverage:false,phpDirectWriteDeniedProven:false,
   directSqlDeniedProven:false,rawFileWriteDeniedProven:false,externalClientsExcluded:false,independentFenceProven:false,
   twoAndroidLabValidated:false},
  readiness:{canSwitchPrimary:false,canModifyRouting:false,canArmHA:false,productionWriteProtectionVerified:false,
   reason:'ALL_REAL_WRITE_PATHS_NOT_INDEPENDENTLY_FENCED'},
  notice:'Observation is read-only. Stopped or absent services do not prove no alternate writers. No privileges, config content, credentials or raw paths are collected.'};
}
export async function liveAudit(){return analyzeWritePaths({signals:observeLocalSignals(),services:await observeServices()});}
function cli(){return {release:RELEASE,scope:'LOCAL_READ_ONLY',commands:['mhc-full writer-audit plan','mhc-full writer-audit scan'],
  writeSideEffects:false,queriesMariaDB:false,networkRequests:false,serviceRestarts:false,
  requirement:'Run scan separately on each node and review ALL bypass paths before any physical switchover. Nothing can authorize promotion.',
  canSwitchPrimary:false,canArmHA:false};}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 const cmd=process.argv[2];
 if(process.argv.length!==3||!['plan','scan'].includes(cmd)){
  console.error('Usage: mhc-full writer-audit plan|scan (read-only; does not authorize switchover)');process.exitCode=2;
 }else if(cmd==='plan')console.log(JSON.stringify(cli(),null,2));
 else liveAudit().then(x=>console.log(JSON.stringify(x,null,2))).catch(()=>{console.error('WRITER_AUDIT_UNAVAILABLE; no authorization granted');process.exitCode=1;});
}
