// Read-only MHC bridge for the existing Android Mini Hosting Panel (9090).
// Does not import auth/secret files or expose write APIs.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const HOME=process.env.HOME||os.homedir();
const PREFIX=process.env.PREFIX||'/data/data/com.termux/files/usr';
process.env.SVDIR ||= path.join(PREFIX,'var/service');
const BIN=path.join(HOME,'.local/share/mhc-full-installer/bin');
const BOOT=path.join(HOME,'.config/mhc-full-installer/installed');
function sharedConfigured(){try{fs.lstatSync(path.join(HOME,'.config/mhc-full-installer/authority.json'));return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function sharedClient(){return import(pathToFileURL(path.join(BIN,'cluster-authority.mjs')).href);}
async function sharedView(){try{return await (await sharedClient()).sharedStatus();}catch(e){return {mode:'AUTHORITY_UNAVAILABLE',nodes:[],nodeCount:0,declaredPrimary:null,pending:null,canComplete:false,writeLeaseGranted:false,notice:/^AUTHORITY_[A-Z_]+$/.test(e.message)?e.message:'AUTHORITY_CONFIG_OR_CLIENT_INVALID'};}}
function run(file,args=[],ms=2200){return new Promise(resolve=>{
  execFile(file,args,{timeout:ms,maxBuffer:32768,encoding:'utf8',env:{...process.env}},(err,stdout,stderr)=>{
    resolve(err?null:String(stdout||stderr||'').trim().slice(0,32768));
  });
});}
function clean(s,max=100){return String(s||'').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,max);}
function present(name){return fs.existsSync(path.join(PREFIX,'bin',name));}
async function service(id){
 const v=await run(path.join(PREFIX,'bin/sv'),['status',id],1700);
 return {name:id,state:v===null?'not-observed':v.startsWith('run:')?'running':v.startsWith('down:')?'stopped':'unknown'};
}
async function moduleVersion(cmd,args){let v=await run(path.join(PREFIX,'bin',cmd),args,2000);return v===null?null:clean(v.split('\n')[0],110);}
export async function mhcModules(){
 const installed=fs.existsSync(BOOT);
 const services=await Promise.all(['nginx','mysqld','mini-web','amh-panel','mhc-full-wp-php','mhc-full-wp-nginx','mhc-full-panel','mhc-full-daily-backup','mhc-full-heartbeat','named-tunnel'].map(service));
 const versions=await Promise.all([
   moduleVersion('php',['-r','echo PHP_VERSION;']),
   moduleVersion('node',['--version']),
   moduleVersion('nginx',['-v']), // nginx may output on stderr; status still measured via runit
   moduleVersion('mariadb',['--version']),
   moduleVersion('php-fpm',['-v']),
   moduleVersion('wp',['--version'])
 ]);
 let extensionNames=[];
 if(present('php')){const p=await run(path.join(PREFIX,'bin/php'),['-m'],2400);if(p)extensionNames=p.split(/\r?\n/).filter(v=>/^[A-Za-z][A-Za-z0-9 _]+$/.test(v)&&!v.startsWith('Zend')).slice(0,60);}
 const [php,node,nginx,db,fpm,wp]=versions;
 return {mode:'READ_ONLY_LAB',installed,checkedAt:new Date().toISOString(),modules:[
   {id:'nginx',installed:present('nginx'),version:nginx,service:'mhc-full-wp-nginx'},
   {id:'php',installed:present('php'),version:php,service:'mhc-full-wp-php',extensions:extensionNames},
   {id:'php-fpm',installed:present('php-fpm'),version:fpm,service:'mhc-full-wp-php'},
   {id:'mariadb',installed:present('mariadb'),version:db,service:'mysqld'},
   {id:'node',installed:present('node'),version:node,service:'mini-web'},
   {id:'wp-cli',installed:present('wp'),version:wp,service:null}
 ],services,notice:'Installed binary or runit process does not prove HTTP, DB replication, or HA readiness.'};
}
export async function mhcCluster(){
 if(sharedConfigured())return sharedView();
 const cli=path.join(BIN,'cluster-summary.mjs');
 if(!fs.existsSync(cli))return {mode:'NOT_INSTALLED',nodeCount:0,alerts:[],capabilities:{},notice:'No MHC cluster metadata on this node.'};
 const raw=await run(process.execPath,[cli,'status'],3200);
 if(!raw)return {mode:'NOT_OBSERVED',nodeCount:0,alerts:[],capabilities:{},notice:'Read-only cluster status command unavailable.'};
 try{
  const data=JSON.parse(raw);
  const inv=Array.isArray(data.inventory?.items)?data.inventory.items:[];
  const alerts=Array.isArray(data.alerts?.items)?data.alerts.items:[];
  const flags=data.capabilities||{};
  return {mode:clean(data.mode),nodeCount:Number.isInteger(data.inventory?.total)?Math.min(data.inventory.total,10000):inv.length,
   nodes:inv.slice(0,100).map(x=>({label:clean(x.label||x.name||x.nodeId),state:clean(x.heartbeatState||x.status||'unverified'),lastSeen:clean(x.lastSeen||x.lastHeartbeat||'')})),
   alerts:alerts.slice(0,30).map(x=>({kind:clean(x.kind||x.type),message:clean(x.message||x.label,180)})),
   backupStatus:clean(data.backup?.status),cloneState:clean(data.clone?.state),
   capabilities:{haEligible:flags.haEligible===true,automaticFailover:flags.automaticFailover===true,gtidReplicationVerified:flags.gtidReplicationVerified===true,continuousFileReplicationVerified:flags.continuousFileReplicationVerified===true},
   notice:'Observed node metadata only, NOT authoritative proof of an active writer or HA.'};
 }catch{return {mode:'INVALID_REPORT',nodeCount:0,alerts:[],capabilities:{},notice:'Status JSON was unavailable or incomplete.'};}
}


// TEST 0.3.11: read-only observations for the ORIGINAL 9090 Panel.
// Avoid exposing filenames with user secrets, network identities, passwords, DB URLs or raw logs.
let monitorCache=null; let monitorCacheAt=0; let cpuPrevious=null;
const safeCount=(x,lo,hi)=>typeof x==='number'&&Number.isFinite(x)&&x>=lo&&x<=hi?x:null;
const SLUG=/^[a-z][a-z0-9-]{1,30}$/;
function regular(p){try{const st=fs.lstatSync(p);return st.isFile()&&!st.isSymbolicLink();}catch{return false;}}
function plainDir(p){try{const st=fs.lstatSync(p);return st.isDirectory()&&!st.isSymbolicLink();}catch{return false;}}
function registered(folder,ext,type){
 const base=path.join(HOME,'.config/mhc-full-installer',folder);
 if(!plainDir(base))return [];
 let names=[];try{names=fs.readdirSync(base);}catch{return [];}
 return names.filter(n=>n.endsWith(ext)&&SLUG.test(n.slice(0,-ext.length))&&regular(path.join(base,n))).slice(0,150).map(n=>{
   const slug=n.slice(0,-ext.length),root=path.join(HOME,'websites',slug);
   return {slug,type,filesPresent:plainDir(root),httpVerifiedNow:false,databaseVerifiedNow:false};
 });
}
export async function mhcSites(){
 const sites=[...registered('static','.conf','static'),...registered('sites','.env','wordpress')];
 return {scope:'LOCAL_MHC_METADATA_ONLY',sites:sites.slice(0,200),count:sites.length,
  notice:'Registration does not prove HTTP, WordPress login, or DB connectivity. No files, passwords or DB names are returned.'};
}
export async function mhcBackups(){
 const base=path.join(HOME,'hosting-backups/mhc-full');
 let entries=[];if(plainDir(base))try{entries=fs.readdirSync(base);}catch{}
 const snapshots=entries.filter(n=>/^snapshot-[0-9]{8}$/.test(n)&&plainDir(path.join(base,n))).sort().reverse().slice(0,14).map(n=>{
  const dir=path.join(base,n);const manifest=regular(path.join(dir,'SHA256SUMS'))||regular(path.join(dir,'manifest.json'));
  let createdAt=null;try{const st=fs.statSync(dir);createdAt=Number.isFinite(st.mtimeMs)?new Date(st.mtimeMs).toISOString():null;}catch{}
  return {date:n.slice(9),recorded:true,manifestPresent:manifest,integrityVerifiedNow:false,createdAt};
 });
 let latestRecorded=false;
 const marker=path.join(base,'latest-success-path');
 if(regular(marker))try{
  const val=fs.readFileSync(marker,'utf8').trim();
  latestRecorded=snapshots.some(s=>val===path.join(base,'snapshot-'+s.date));
 }catch{}
 const tasks=await Promise.all(['mhc-full-daily-backup','mhc-full-heartbeat'].map(service));
 return {scope:'MHC_LOCAL_ONLY',latestRecorded,snapshots,services:tasks,integrityVerifiedNow:false,
  notice:'Metadata only. Snapshot existence and SHA manifest presence are NOT current checksum or restore verification. Daily runit service alone cannot guarantee scheduling while Android sleeps.'};
}
export async function mhcMonitor(){
 // v2 collector shared with the heartbeat agent. Gracefully retain old local monitor if
 // this LAB node has not received the opt-in node-monitor.mjs asset yet.
 const collector=path.join(BIN,'node-monitor.mjs');
 if(regular(collector))try{
  const monitor=await import(pathToFileURL(collector).href);
  const metrics=await monitor.collectNodeMetrics();
  return {...metrics,scope:'LOCAL_ANDROID_NODE',
   battery:{...metrics.battery,available:metrics.battery.percentage!==null||metrics.battery.temperatureC!==null},
   notice:'Trạng thái thiết bị đang quan sát, không xác nhận quyền Primary. CPU/mạng có thể bị Android hạn chế quyền truy cập.'};
 }catch{/* not a reason to break the original Panel */}
 // Cached so multiple browsers cannot repeatedly launch Termux:API subprocesses.
 if(monitorCache&&Date.now()-monitorCacheAt<9000)return monitorCache;
 const cpus=os.cpus()||[];
 const total=cpus.reduce((a,c)=>a+Object.values(c.times||{}).reduce((x,y)=>x+y,0),0);
 const idle=cpus.reduce((a,c)=>a+(c.times?.idle||0),0);
 let usagePct=null;
 if(cpuPrevious){const d=total-cpuPrevious.total,di=idle-cpuPrevious.idle;
  if(d>0&&di>=0&&di<=d)usagePct=safeCount(Math.round((1-di/d)*100),0,100);
 }
 cpuPrevious={total,idle};
 const mem=os.totalmem(),free=os.freemem();
 const raw=await run(path.join(PREFIX,'bin/termux-battery-status'),[],2200);
 let battery={available:false,reason:'Termux:API unavailable'};
 if(raw&&raw.length<4096)try{
  const x=JSON.parse(raw),pct=safeCount(x.percentage,0,100),temp=safeCount(x.temperature,-25,100);
  if(pct!==null||temp!==null)battery={available:true,percentage:pct,temperatureC:temp,
    status:['CHARGING','FULL','DISCHARGING','NOT_CHARGING'].includes(x.status)?x.status:'UNKNOWN'};
 }catch{}
 const model=clean(await run(path.join(PREFIX,'bin/getprop'),['ro.product.model'],900)||'Android',55);
 monitorCache={scope:'LOCAL_OBSERVATION_ONLY',at:new Date().toISOString(),device:model,
  cpu:{usagePct,cores:cpus.length||null},
  memory:{totalMiB:safeCount(Math.round(mem/1048576),0,1e8),freeMiB:safeCount(Math.round(free/1048576),0,1e8)},
  uptimeSec:safeCount(Math.round(os.uptime()),0,1e10),battery,
  notice:'Battery temperature is NOT CPU temperature. Measurements are observations, not HA/Primary evidence.'};
 monitorCacheAt=Date.now();return monitorCache;
}

export async function mhcMonitorHistory(nodeId){
 if(!sharedConfigured())return {mode:'LOCAL_ONLY',history:{nodeId,points:[]},notice:'Chưa bật Shared Authority; lịch sử cụm không có.'};
 const r=await (await sharedClient()).sharedHistory(nodeId);
 return {mode:r.mode,history:r.history||{nodeId,points:[]},notice:'Dữ liệu lấy mẫu tối đa 12 giờ qua Cloudflare Shared Authority; đo đạc có thể bị Android hạn chế.'};
}


// TEST 0.4.0A: observer SUMMARY only; authenticated API must not leak manifest paths/hash.
export async function mhcReplication(){
 const cli=path.join(BIN,'replication-observer.mjs');
 if(!regular(cli))return {mode:'NOT_INSTALLED',replicationVerified:false,fileReplicationVerified:false,haEligible:false};
 const raw=await run(process.execPath,[cli,'status'],4000);
 const seedCli=path.join(BIN,'gtid-seed.mjs');
 const seedRaw=regular(seedCli)?await run(process.execPath,[seedCli,'seed-summary'],2600):null;
 let seed={mode:'NO_SEED_OBSERVED',seedCount:0,integrityCurrentlyVerified:false};
 if(seedRaw){try{const x=JSON.parse(seedRaw);seed={mode:['NO_SEED','SEEDS_PRESENT_NOT_REPLICATING'].includes(x.mode)?x.mode:'UNVERIFIED',
  seedCount:Number.isSafeInteger(x.seedCount)&&x.seedCount>=0&&x.seedCount<=1000?x.seedCount:0,
  integrityCurrentlyVerified:false};}catch{}}
 const acceptanceCli=path.join(BIN,'gtid-acceptance.mjs');
 const acceptanceRaw=regular(acceptanceCli)?await run(process.execPath,[acceptanceCli,'outage-report'],2400):null;
 let acceptance={mode:'NO_OUTAGE_EVIDENCE',phases:[],completed:false,haEligible:false};
 if(acceptanceRaw){try{const a=JSON.parse(acceptanceRaw);acceptance={mode:a.mode==='LAB_OUTAGE_EVIDENCE'?'LAB_OUTAGE_EVIDENCE':'NO_OUTAGE_EVIDENCE',
  phases:Array.isArray(a.phases)?a.phases.filter(x=>['baseline','disconnected','reconnected'].includes(x)).slice(0,3):[],
  completed:a.completed===true,haEligible:false};}catch{}}
 const deltaCli=path.join(BIN,'file-delta-lab.mjs');
 const deltaRaw=regular(deltaCli)?await run(process.execPath,[deltaCli,'status'],2600):null;
 let fileDelta={mode:'NOT_CONFIGURED',manifests:0,bundles:0,candidates:0,liveReplication:false};
 if(deltaRaw)try{const d=JSON.parse(deltaRaw);const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000?n:0;
  fileDelta={mode:d.mode==='LAB_FILE_DELTA_STAGING_ONLY'?d.mode:'UNVERIFIED',manifests:count(d.manifests),bundles:count(d.bundles),candidates:count(d.candidates),liveReplication:false};
 }catch{}
 const peerCli=path.join(BIN,'file-peer-lab.mjs');
 const peerRaw=regular(peerCli)?await run(process.execPath,[peerCli,'peer-status'],2600):null;
 let filePeer={mode:'NOT_CONFIGURED',verified:0,retryable:0,active:0,received:0,liveReplication:false};
 if(peerRaw)try{
  const p=JSON.parse(peerRaw);const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000?n:0;
  filePeer={mode:p.status==='LAB_PEER_TRANSPORT_ONLY'?p.status:'NOT_CONFIGURED',verified:count(p.verified),retryable:count(p.retryable),active:count(p.active),received:count(p.received),liveReplication:false};
 }catch{}
 const consistentCli=path.join(BIN,'file-consistent-lab.mjs');
 const consistentRaw=regular(consistentCli)?await run(process.execPath,[consistentCli,'consistent-status'],2600):null;
 let fileConsistent={mode:'NOT_CONFIGURED',offlineVersions:0,atomicSnapshotVerified:false,liveApply:false,haEligible:false};
 if(consistentRaw)try{const c=JSON.parse(consistentRaw);
  fileConsistent={mode:c.status==='OFFLINE_LAB_ONLY'?'OFFLINE_LAB_ONLY':'NOT_CONFIGURED',
   offlineVersions:Number.isSafeInteger(c.offlineVersions)&&c.offlineVersions>=0&&c.offlineVersions<=1000?c.offlineVersions:0,
   atomicSnapshotVerified:false,liveApply:false,haEligible:false};
 }catch{}
 const dCli=path.join(BIN,'lab-acceptance-gate.mjs');
 const dRaw=regular(dCli)?await run(process.execPath,[dCli,'report'],2800):null;
 let e2eAcceptance={review:'NOT_OBSERVED',phases:[],fileVerified:false,haEligible:false};
 if(dRaw)try{const d=JSON.parse(dRaw);
  e2eAcceptance={review:['LAB_EVIDENCE_COMPLETE_HUMAN_REVIEW_REQUIRED','LAB_EVIDENCE_INCOMPLETE_OR_STALE'].includes(d.review)?d.review:'NOT_OBSERVED',
   phases:[d.baselineObserved===true,d.outageObserved===true,d.recoveryObserved===true],
   distinctNewProbe:d.distinctNewProbe===true,fileVerified:d.fileVerified===true,
   haEligible:false};
 }catch{/* not an HA signal */}
 const labCli=path.join(BIN,'gtid-lab.mjs');
 const labRaw=regular(labCli)?await run(process.execPath,[labCli,'lab-status'],5500):null;
 let lab={mode:'NOT_OBSERVED',channelCount:null,channels:[],dataConvergenceVerified:false};
 if(labRaw){try{
  const l=JSON.parse(labRaw);const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000?n:null;
  lab={mode:clean(l.mode,45),channelCount:count(l.channelCount),
   channels:Array.isArray(l.channels)?l.channels.slice(0,12).map(c=>({
    ioRunning:c.ioRunning===true,sqlRunning:c.sqlRunning===true,
    lagSeconds:count(c.lagSeconds),usingGtid:['SLAVE_POS','CURRENT_POS'].includes(c.usingGtid)?c.usingGtid:'NONE_OR_UNKNOWN',
    errorObserved:c.errorObserved===true})):[],
   dataConvergenceVerified:false};
 }catch{/* fail closed: inaccessible replica telemetry */}}
 if(!raw)return {mode:'NOT_OBSERVED',replicationVerified:false,fileReplicationVerified:false,haEligible:false};
 try{const r=JSON.parse(raw),g=r.gtid||{},ch=r.change||{};
  const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=10000000?n:null;
  return {mode:clean(r.mode,50),observedAt:typeof r.observedAt==='string'?clean(r.observedAt,40):null,stale:r.stale!==false,
   files:count(r.files),rootCount:count(r.rootCount),
   change:{baseline:ch.baseline===true,added:count(ch.added),modified:count(ch.modified),removed:count(ch.removed)},
   gtid:{observed:g.observed===true,binaryLogEnabled:g.binaryLogEnabled===true,gtidStrictMode:g.gtidStrictMode===true,
    readOnly:g.readOnly===true,serverId:count(g.serverId)},
   lab,seed,acceptance,fileDelta,filePeer,fileConsistent,e2eAcceptance,replicationVerified:false,fileReplicationVerified:false,haEligible:false,
   notice:'v0.4D: nghiệm thu có 2 giao dịch thử, kiểm tra offline file và yêu cầu người vận hành kiểm chứng trên 2 Android LAB. Không có bảo đảm snapshot nguyên tử, quyền Primary hay HA.'};
 }catch{return {mode:'INVALID_REPORT',replicationVerified:false,fileReplicationVerified:false,haEligible:false};}
}

// TEST 0.5.0A: only return redacted OFFLINE simulation metadata.
async function mhcLoopback(){
 const cli=path.join(BIN,'manual-switchover-e2e-lab.mjs');
 const empty={status:'NOT_OBSERVED',eventCount:0,syntheticOnly:true,realFencingVerified:false};
 if(!regular(cli))return empty;
 const raw=await run(process.execPath,[cli,'status'],2400);
 if(!raw)return empty;
 try{const e=JSON.parse(raw);return {status:['NOT_RUN','SYNTHETIC_LAB_DRILL_PASS','SYNTHETIC_LAB_DRILL_ABORT'].includes(e.status)?e.status:'INVALID_REPORT',
  eventCount:Number.isInteger(e.eventCount)&&e.eventCount>=0&&e.eventCount<=40?e.eventCount:0,syntheticOnly:true,realFencingVerified:false};}
 catch{return {...empty,status:'INVALID_REPORT'}}
}
export async function mhcSwitchover(){
 const cli=path.join(BIN,'manual-switchover-lab.mjs');
 const unavailable={scope:'OFFLINE_SIMULATION_ONLY',state:'NOT_INSTALLED',simulatedSteps:[],authoritative:false,canSwitchPrimary:false,haEligible:false};
 if(!regular(cli))return {...unavailable,loopback:await mhcLoopback()};
 const raw=await run(process.execPath,[cli,'status'],1600);
 if(!raw)return {...unavailable,state:'NOT_OBSERVED',loopback:await mhcLoopback()};
 try{const v=JSON.parse(raw);
  const state=['NOT_STARTED','prepared','quiesce','catchup','lease','route','postcheck','completed','aborted'].includes(v.state)?v.state:'UNVERIFIED';
  const allowed=['prepared','quiesce','catchup','lease','route','postcheck','completed','aborted'];
  return {scope:'OFFLINE_SIMULATION_ONLY',state,simulatedSteps:Array.isArray(v.simulatedSteps)?v.simulatedSteps.filter(x=>allowed.includes(x)).slice(0,8):[],loopback:await mhcLoopback(),authoritative:false,canSwitchPrimary:false,haEligible:false,
    notice:'Operator claimed rehearsal + localhost synthetic E2E only. No live MariaDB replication, independent fencing, Cloudflare route or physical Android attestation.'};
 }catch{return {...unavailable,state:'INVALID_LOCAL_REPORT',loopback:await mhcLoopback()};}
}

// TEST 0.5.0B: read-only, redacted OFFLINE term/lease fault model status.
export async function mhcFencing(){
 const cli=path.join(BIN,'fencing-lease-lab.mjs');
 const fail={scope:'OFFLINE_MODEL_ONLY',review:'NOT_INSTALLED',scenarioCount:0,failedCount:0,
  authoritativeLease:false,realWriteGateInstalled:false,independentFenceVerified:false,canPromote:false,haEligible:false};
 if(!regular(cli))return fail;
 const raw=await run(process.execPath,[cli,'status'],1700);
 if(!raw)return {...fail,review:'NOT_OBSERVED'};
 try{const x=JSON.parse(raw);
  return {...fail,review:['NOT_RUN','SYNTHETIC_MODEL_PASS','SYNTHETIC_MODEL_FAILED','INVALID_LOCAL_REPORT'].includes(x.review)?x.review:'UNVERIFIED',
   scenarioCount:Number.isSafeInteger(x.scenarioCount)&&x.scenarioCount>=0&&x.scenarioCount<=1000?x.scenarioCount:0,
   failedCount:Number.isSafeInteger(x.failedCount)&&x.failedCount>=0&&x.failedCount<=1000?x.failedCount:0};
 }catch{return {...fail,review:'INVALID_LOCAL_REPORT'};}
}


// TEST 0.5.0B2: Panel must NEVER read Lab witness tokens or call the witness.
// Only show that operator-controlled LAB client metadata exists locally.
export async function mhcWitness(){
 const p=path.join(HOME,'.config/mhc-witness-lab/client.json');
 const configured=regular(p);
 return {scope:'ISOLATED_CLOUDFLARE_LAB_WITNESS',clientConfigured:configured,
  witnessContactVerifiedNow:false,leaseHeldVerifiedNow:false,realWriteGateInstalled:false,
  fencedOldWriterVerified:false,haEligible:false,canPromote:false,
  notice:'LAB-only Durable Object witness client. No existing production DB/HTTP/file write path uses this witness; Panel never loads its URL or credentials.'};
}

// TEST 0.5.0B5 — four offline LAB fixture types + real loopback HTTP LAB gateway; metadata only. Never reads secrets or contacts witness.
export async function mhcWritePaths(){
 const lab=plainDir(path.join(HOME,'mhc-writegate-lab'));
 const gatewayConfigured=plainDir(path.join(HOME,'.config/mhc-lab-http-write-gate'))&&regular(path.join(HOME,'.config/mhc-lab-http-write-gate/http-token'));
 return {scope:'ISOLATED_WRITE_GATE_FIXTURES_ONLY',isolatedCanaryInitialized:lab,
  isolatedHttpGateConfigured:gatewayConfigured,isolatedHttpLoopbackOnly:true,httpGatewayRunningVerifiedNow:false,
  guardedLabCanaryPaths:1,guardedLabFixtureTypes:4,guardedLabEntryPaths:6,isolatedMariaDbLabEndpointAvailable:true,isolatedMariaDbConfigured:regular(path.join(HOME,'mhc-db-lab/client.cnf')),unguardedProductionPaths:9,productionProtected:false,
  haEligible:false,readyToSwitch:false,witnessVerifiedNow:false,
  paths:['Nginx ingress','WordPress/PHP','MariaDB SQL','Sheet/uploads','Panel write APIs','Background jobs','SSH/shell','Backup/restore','Cloudflare routing'],
  notice:'Four offline file fixtures plus a dedicated MariaDB LAB app endpoint can use isolated HTTP with witness checks. None of nine production write-path groups is fully gated. No physical switchover authority.'};
}

// v0.5C Writer Audit: execute the locally installed READ-ONLY collector and return only allowlisted counts.
// Never grant switchover, publish raw file paths, SQL accounts, process args or credentials.
export async function mhcWriterAudit(){
 const cli=path.join(BIN,'writer-path-audit.mjs');
 const fallback={scope:'LOCAL_READ_ONLY_HOST_WRITE_PATH_INVENTORY',mode:'NOT_OBSERVED',pathCount:12,
  activeOrConfiguredCount:0,unverifiedFencingPaths:12,canSwitchPrimary:false,haEligible:false,
  notice:'No verified writer fencing; host audit tool unavailable.'};
 if(!regular(cli))return fallback;
 const raw=await run(process.execPath,[cli,'scan'],3600);
 if(!raw)return fallback;
 try{
  const p=JSON.parse(raw);
  if(p.scope!==fallback.scope||p.pathCount!==12||p.unverifiedFencingPaths!==12||p.readiness?.canSwitchPrimary!==false)return fallback;
  return {...fallback,mode:'READ_ONLY_OBSERVED',activeOrConfiguredCount:safeCount(p.activeOrConfiguredCount,0,12)??0,
   notice:'Local service/config presence only. 12 write surfaces remain unverified for independent fencing. No promotion authority.'};
 }catch{return fallback;}
}

// Manual selection only: never touches nginx, MariaDB, Cloudflare, SSH or live route.
export async function mhcPrimarySelection(){
 if(sharedConfigured())return sharedView();
 const cli=path.join(BIN,'manual-primary.mjs');
 if(!regular(cli))return {mode:'NOT_INSTALLED',nodes:[],declaredPrimary:null,pending:null};
 const raw=await run(process.execPath,[cli,'status'],2600);
 if(!raw)return {mode:'NOT_CONFIGURED',nodes:[],declaredPrimary:null,pending:null,notice:'Cluster controller inventory not available on this node.'};
 try{const x=JSON.parse(raw);return {mode:x.mode,nodes:x.nodes||[],declaredPrimary:x.declaredPrimary||null,pending:x.pending||null,notice:x.notice||'',automaticFailover:false,livePrimaryVerified:false};}
 catch{return {mode:'NOT_OBSERVED',nodes:[],declaredPrimary:null,pending:null};}
}
export async function mhcPrimaryAction(body){
 if(sharedConfigured())return (await sharedClient()).sharedAction(body);
 const op=body?.action, id=body?.id;
 if(!['begin','complete','abort'].includes(op)||typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))throw Error('Invalid primary selection request');
 const cli=path.join(BIN,'manual-primary.mjs');
 if(!regular(cli))throw Error('Primary selection module not installed');
 const flags=op==='begin'?['--confirm=PREPARE_MANUAL_PRIMARY']:op==='abort'?['--confirm=ABORT_MANUAL_PRIMARY']:
   ['--confirm=RECORD_OPERATOR_SELECTED_PRIMARY','--backup-restored','--old-writes-stopped','--target-tested','--routing-switched'];
 if(op==='complete'&&!['backupRestored','oldWritesStopped','targetTested','routingSwitched'].every(k=>body?.[k]===true))throw Error('All manual checklist confirmations are required');
 return await new Promise((resolve,reject)=>execFile(process.execPath,[cli,op,id,...flags],{timeout:4000,maxBuffer:8192,encoding:'utf8',env:{...process.env}},(err,out)=>{
  if(err)return reject(Error('Manual selection was not recorded. Inspect ~/mhc-full primary-select status and Panel logs.'));
  try{resolve(JSON.parse(out));}catch{reject(Error('Invalid selection result'));}
 }));
}

export async function mhcAutomaticElection(){
 if(sharedConfigured())return {configured:true,enabled:false,mode:'SHARED_AUTHORITY_PREPARE_ONLY',notice:'Auto cutover requires the shared activation/route flow (M3/M4).'};
 const script=path.join(BIN,'auto-primary.mjs');if(!regular(script))return {configured:false,mode:'NOT_INSTALLED'};
 const raw=await run(process.execPath,[script,'status'],3000);
 if(!raw)return {configured:false,mode:'CONTROLLER_NOT_CONFIGURED',notice:'Node is not the election controller or has no inventory.'};
 try{const x=JSON.parse(raw);return {configured:true,enabled:x.enabled===true,mode:clean(x.mode,32),primaryOffline:x.primaryOffline===true,
  chosenCandidate:x.chosenCandidate?{nodeId:x.chosenCandidate.nodeId,label:clean(x.chosenCandidate.label),backupStamp:clean(x.chosenCandidate.backupStamp),backupActualDataVerified:false}:null,
  quarantinedCount:Array.isArray(x.quarantined)?x.quarantined.length:0,
  pendingRoute:x.pendingRoute?{from:clean(x.pendingRoute.from,36),to:clean(x.pendingRoute.to,36),status:'RECOVERY_REQUIRED'}:null,
  lastElection:x.lastElection?{at:clean(x.lastElection.at),to:x.lastElection.to,routeVerified:x.lastElection.routeVerified===true,fencingVerified:false}:null,
  notice:'Election is best-effort: backup dates/heartbeat are hints, old writers not independently fenced.'};}
 catch{return {configured:false,mode:'INVALID_ELECTION_STATUS'};}
}

// LAB node-role guard local status: strictly allowlisted fields; no credentials or service paths.
export async function mhcNodeGuard(){
 const script=path.join(BIN,'node-role-guard.mjs');const fallback={armed:false,services:[],lastCheck:null,independentFencingProven:false};
 if(!regular(script))return fallback;
 const raw=await run(process.execPath,[script,'status'],2500);if(!raw)return fallback;
 try{const x=JSON.parse(raw);return {armed:x.armed===true,services:(Array.isArray(x.services)?x.services:[]).filter(v=>/^(mhc-lab-[a-z0-9-]{1,40}|nginx|php-fpm|mariadb|mysqld|mhc-full-wp-nginx|mhc-full-wp-php|named-tunnel|mini-web)$/.test(v)).slice(0,6),
  lastCheck:x.lastCheck?{at:clean(x.lastCheck.at,48),reason:clean(x.lastCheck.reason,70),allowed:x.lastCheck.allowed===true}:null,
  independentFencingProven:false};}catch{return fallback;}
}
