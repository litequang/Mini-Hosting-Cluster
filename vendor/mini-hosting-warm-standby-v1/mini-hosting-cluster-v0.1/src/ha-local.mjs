// Fail-closed local control layer. The installer never arms or invokes this automatically.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {readConfig,health} from './cli.mjs';
import {readyForTakeover,isSafeGTID} from './ha-policy.mjs';
import {fingerprint} from './asset-digest.mjs';
const ROOT=path.join(os.homedir(),'.config/mini-hosting-cluster');
const HA=path.join(ROOT,'ha.json');
const STATE=path.join(ROOT,'ha-state.json');
const VERSION=1;
const GOOD_HOST=/^https:\/\/[a-z0-9.-]+(?::443)?$/i;
const UUID=/^[a-f0-9-]{36}$/i;
function req(ok,msg){if(!ok)throw Error(msg);}
function put(file,obj){fs.mkdirSync(ROOT,{recursive:true,mode:0o700});const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(obj,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(tmp,file);fs.chmodSync(file,0o600);}
function get(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}}
export function haConfig(){return get(HA)||{version:VERSION,mode:'manual',armed:false,preferredNodeId:null,witness:null,maxRpoSeconds:0};}
function cfg(){const c=readConfig();req(c?.nodeId&&c?.clusterId,'Initialize cluster first');return c;}
function cli(bin,args,{timeout=4500}={}){return execFileSync(bin,args,{encoding:'utf8',timeout,stdio:['ignore','pipe','ignore']}).trim();}
function query(sql){try{return cli('mariadb',['--no-defaults','-u','root','-N','-B','-e',sql]);}catch{return null;}}
function readSlave(){const v=query('SHOW SLAVE STATUS\\G');if(!v)return {};const o={};for(const line of v.split('\n')){const m=/^\s*([A-Za-z_]+):\s*(.*?)\s*$/.exec(line);if(m)o[m[1]]=m[2];}return o;}
export function appDb(){try{const env=fs.readFileSync(path.join(os.homedir(),'apps/thophuongpro/.env'),'utf8');const line=env.split(/\r?\n/).find(x=>/^MYSQL_DATABASE=/.test(x));return line?line.slice('MYSQL_DATABASE='.length).trim().replace(/^['\"]|['\"]$/g,''):null;}catch{return null;}}
export function dbHealth(){const raw=query('SELECT @@global.read_only,@@global.log_bin,@@global.gtid_binlog_pos,@@global.gtid_slave_pos,@@global.server_id,@@global.event_scheduler');
 if(!raw)return {available:false};const [readOnly,logBin,gtidBinlogPos,gtidSlavePos,serverId,eventScheduler]=raw.split('\t');
 const r=readSlave(),lag=r.Seconds_Behind_Master==='NULL'||r.Seconds_Behind_Master===undefined?null:Number(r.Seconds_Behind_Master);
 return {available:true,readOnly:readOnly==='1',logBin:logBin==='1',gtidBinlogPos,gtidSlavePos,serverId:Number(serverId),eventScheduler,slaveIo:r.Slave_IO_Running||null,slaveSql:r.Slave_SQL_Running||null,secondsBehind:Number.isFinite(lag)?lag:null};}
export function assetHealth(){const p=path.join(os.homedir(),'standby-sync','asset-checkpoint.json');const x=get(p);let applied=null;try{applied=fs.readFileSync(path.join(os.homedir(),'standby-sync/latest-applied'),'utf8').trim();}catch{}return {verified:x?.verified===true&&x.snapshotApplied===applied,checkpoint:typeof x?.checkpoint==='string'?x.checkpoint:null,observedAt:x?.observedAt||null};}
export function proof(){const c=cfg(),h=health();return {clusterId:c.clusterId,nodeId:c.nodeId,label:c.label,observedAt:new Date().toISOString(),services:h.services,appDatabase:appDb(),db:dbHealth(),assets:assetHealth(),snapshot:h.snapshotApplied||null};}
function safeConfig(){const h=haConfig();return {...h,witness:h.witness?{url:h.witness.url,tokenConfigured:!!h.witness.token}:null};}
async function request(endpoint,payload={}){const c=cfg(),h=haConfig();req(h.witness?.url&&h.witness?.token,'Witness not configured');
 const control=new AbortController(),timer=setTimeout(()=>control.abort(),4500);
 try{const r=await fetch(h.witness.url+'/v1/'+endpoint,{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+h.witness.token},signal:control.signal,body:JSON.stringify({clusterId:c.clusterId,nodeId:c.nodeId,...payload})});
 const x=await r.json();if(!r.ok)throw Error('Witness '+r.status+': '+(x.error||'failed'));return x;
 }finally{clearTimeout(timer);}}
function setReadOnly(value){const r=query('SET GLOBAL read_only='+(value?'ON':'OFF'));req(r!==null,'Could not change MariaDB read_only');}
function service(s,up){const r=cli('sv',[up?'up':'down',s]);return r;}
function existsService(name){const pre=process.env.PREFIX||'/data/data/com.termux/files/usr';return fs.existsSync(path.join(pre,'var/service',name));}
function stopWriter(){// Always stop ingress BEFORE database read-only, never touch Panel/SSH.
 for(const name of ['named-tunnel','mini-web']){try{service(name,false);}catch{}}
 if(existsService('tpp-backup')){try{cli('sv-disable',['tpp-backup']);service('tpp-backup',false);}catch{}}
 try{setReadOnly(true);}catch{}
 put(STATE,{...get(STATE),serving:false,at:new Date().toISOString(),reason:'lease-lost-or-fenced'});
}
function startWriter(lease){req(lease?.granted&&lease?.term>0,'No authoritative lease');
 // Race mitigation: keep DB read-only until this host has exclusive lease.
 req(proof().db.available&&proof().appDatabase==='thophuong_pro','DB unavailable or application does not point to canonical database');
 // Replica must stop applying upstream transactions before the first local application write.
 const db=dbHealth();if(db.slaveIo==='Yes'||db.slaveSql==='Yes'){req(query('STOP SLAVE')!==null,'Could not stop MariaDB replica before promotion');
  const stopped=dbHealth();req(stopped.slaveIo!=='Yes'&&stopped.slaveSql!=='Yes','Replica remains active: refusing promotion');}
 setReadOnly(false);try{service('mini-web',true);service('named-tunnel',true);}catch(e){stopWriter();throw e;}
 if(existsService('tpp-backup')){try{cli('sv-enable',['tpp-backup']);service('tpp-backup',true);}catch(e){console.error('Backup service did not start:',e.message);}}
 put(STATE,{serving:true,at:new Date().toISOString(),term:lease.term,expiresAt:lease.expiresAt});
}
export async function runTick({dryRun=false}={}){
 const h=haConfig(),c=cfg(),p=proof();if(!h.armed)return {armed:false,action:'NOOP',reason:'HA disabled; existing services untouched',proof:p};
 const cur=get(STATE)||{};
 if(cur.releasePending){if(!dryRun)stopWriter();return {armed:true,action:'MANUAL_RELEASE_PENDING',targetNodeId:cur.targetNodeId,reason:'Never auto-reacquire writer role after operator began a release'};}
 let remote;try{remote=await request('lease',{proof:p});}catch(e){if(!dryRun)stopWriter();return {armed:true,action:dryRun?'WOULD_FENCE':'FENCED',reason:e.message};}
 if(remote.granted&&remote.leaderId===c.nodeId){
  if(dryRun)return {armed:true,action:cur.serving?'WOULD_RENEW':'WOULD_START',lease:remote};
  if(!cur.serving)startWriter(remote);else put(STATE,{...cur,term:remote.term,expiresAt:remote.expiresAt,at:new Date().toISOString()});
  return {armed:true,action:'SERVING',lease:{term:remote.term,expiresAt:remote.expiresAt}};
 }
 if(!dryRun)stopWriter();return {armed:true,action:dryRun?'WOULD_FENCE':'FENCED',reason:remote.reason||'No lease',leaderId:remote.leaderId||null};
}
async function cmd(a){const sub=a[0]||'status',c=cfg(),h=haConfig();switch(sub){
 case 'status':{let witness=null;try{if(h.witness?.url)witness=await request('status');}catch(e){witness={error:e.message};}return console.log(JSON.stringify({node:{nodeId:c.nodeId,label:c.label,inventoryRole:c.role},config:safeConfig(),state:get(STATE),witness,proof:proof()},null,2));}
 case 'doctor':{const p=proof();const reasons=[];if(!p.db.available)reasons.push('MariaDB not accessible as root');if(!p.db.logBin)reasons.push('MariaDB binary log disabled');if(p.appDatabase!=='thophuong_pro')reasons.push('Application database is not canonical thophuong_pro (shadow snapshot cannot be promoted)');if(!p.db.readOnly)reasons.push('MariaDB is writable: must be read_only=ON before HA arming');if(!isSafeGTID(p.db.gtidBinlogPos))reasons.push('Primary binlog GTID is absent');if(c.role==='standby'&&(p.db.slaveIo!=='Yes'||p.db.slaveSql!=='Yes'||p.db.secondsBehind!==0||!isSafeGTID(p.db.gtidSlavePos)))reasons.push('Replica GTID IO/SQL not healthy and caught up');if(!h.witness?.url)reasons.push('Cloudflare witness not configured');if(p.services.miniWeb==='run'||p.services.tunnel==='run')reasons.push('Serving website/tunnel: HA arming requires planned maintenance and stopped ingress');if(!p.assets.verified)reasons.push('Incremental assets not verified; snapshot sync insufficient');return console.log(JSON.stringify({safeToEnable:reasons.length===0,diagnostics:reasons,proof:p},null,2));}
 case 'configure':{
  const url=a[1],token=a[2];req(!h.armed,'Disarm before reconfiguring witness');req(GOOD_HOST.test(url),'Witness must be trusted HTTPS host (no paths)');req(typeof token==='string'&&token.length>=32,'Provide secure per-node token (at least 32 chars)');put(HA,{...h,witness:{url,token}});return console.log('Witness config saved locally, not active.');}
 case 'mode':{req(['manual','auto'].includes(a[1]),'Expected manual|auto');req(!h.armed,'Change mode while disarmed');put(HA,{...h,mode:a[1]});return console.log('Local preference set to '+a[1]+'; configure same in witness admin independently.');}
 case 'prefer':{req(UUID.test(a[1]||''),'Expected peer node UUID');req(!h.armed,'Change preference while disarmed');put(HA,{...h,preferredNodeId:a[1]});return console.log('Local preference saved; witness admin must approve selection.');}
 case 'backup-source':{const [host,user,port,id]=a.slice(1);req(/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,251}$/.test(host||''),'Invalid peer host');req(/^[a-zA-Z_][a-zA-Z0-9_]{0,49}$/.test(user||''),'Invalid SSH user');req(Number.isInteger(Number(port))&&Number(port)>0&&Number(port)<65536,'Invalid SSH port');req(UUID.test(id||'')&&id!==c.nodeId,'Invalid peer UUID');put(path.join(ROOT,'ha-backup.json'),{host,user,port:Number(port),nodeId:id});return console.log('Peer backup source saved; activate mhc-peer-backup only after verifying SSH identity.');}
 case 'rpo':{const s=Number(a[1]);req(Number.isInteger(s)&&s>=0&&s<=300,'RPO must be 0..300 seconds');req(!h.armed,'Disarm before RPO change');put(HA,{...h,maxRpoSeconds:s});return console.log('Local RPO preference '+s+'s; witness admin must approve separately.');}
 case 'arm':{req(a[1]==='--confirm=HA_FENCING','Confirmation required: --confirm=HA_FENCING');req(h.witness?.url&&h.witness?.token,'Witness not configured');req(!h.armed,'Already armed');
  // Strictly never arm a live production primary before planned maintenance.
  req(purgedForArm(proof(),c),'Preflight rejected. Run doctor; configure MariaDB GTID and incremental asset verification. Existing production must be planned for cutover.');
  // Disable automatic starts at boot, but do not start or stop a production web service here.
  try{cli('sv-disable',['mini-web']);cli('sv-disable',['named-tunnel']);}catch{throw Error('Could not disable autonomous web/tunnel starts; HA remains unarmed');}
  put(HA,{...h,armed:true});console.log('HA fencing ARMED. Start mhc-ha runit guard immediately.');return;}
 case 'disarm':{req(a[1]==='--confirm=DISARM','Confirmation required');req(!get(STATE)?.serving,'Cannot disarm while HA leader serving: release lease and stop first');put(HA,{...h,armed:false});console.log('Disarmed; no services modified.');return;}
 case 'release':{req(UUID.test(a[1]||'')&&a[1]!==c.nodeId,'Expected target standby UUID');req(a[2]==='--confirm=SWITCH_PRIMARY','Confirmation required: --confirm=SWITCH_PRIMARY');req(h.armed,'HA guard must be armed');
   // Release current leader ONLY after ingress is fenced and DB writes blocked. If witness unavailable, remain fenced.
   put(STATE,{...get(STATE),releasePending:true,targetNodeId:a[1],serving:false,at:new Date().toISOString()});
   stopWriter();const current=await fingerprint();req(assetHealth().verified&&assetHealth().checkpoint===current,'Storage changed after checkpoint. Keep writer fenced; run mhc sync-assets on standby and retry release.');
   const p=proof();req(p.db.readOnly===true&&p.services.miniWeb==='down'&&p.services.tunnel==='down','Cannot verify local fencing: stop');
   const response=await request('release',{proof:p,targetNodeId:a[1]});put(STATE,{serving:false,releasePending:true,releasedAt:new Date().toISOString(),targetNodeId:a[1]});console.log(JSON.stringify(response));return;}
 case 'tick':return console.log(JSON.stringify(await runTick({dryRun:a.includes('--dry-run')}),null,2));
 case 'loop':{for(;;){try{console.log(JSON.stringify(await runTick()));}catch(e){console.error('HA tick failure:',e.message);if(haConfig().armed)stopWriter();}await new Promise(r=>setTimeout(r,3000));}}
 default:throw Error('Commands: ha status|doctor|configure <https://witness> <token>|mode manual|auto|prefer <nodeUUID>|backup-source <host> <sshUser> <port> <peerUUID>|rpo <seconds>|arm --confirm=HA_FENCING|disarm --confirm=DISARM|release <target-nodeUUID> --confirm=SWITCH_PRIMARY|tick [--dry-run]|loop');
}}
function purgedForArm(p,c){return p.db.available&&p.db.readOnly&&p.db.logBin&&p.appDatabase==='thophuong_pro'&&isSafeGTID(p.db.gtidBinlogPos)&&p.assets.verified&&!!p.assets.checkpoint&&// app must already be nonserving; do not stop production implicitly
 p.services.miniWeb!=='run'&&p.services.tunnel!=='run' && (c.role==='primary'||(p.db.slaveIo==='Yes'&&p.db.slaveSql==='Yes'&&p.db.secondsBehind===0));}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))cmd(process.argv.slice(2)).catch(e=>{console.error('ERROR:',e.message);process.exitCode=1;});
