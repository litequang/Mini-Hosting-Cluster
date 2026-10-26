#!/usr/bin/env node
// Mini Hosting Cluster v0.1: local inventory, authenticated-SSH node registry, read-only health.
// No promotion, fencing or traffic-routing action is implemented in this release.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

export const ROOT = path.join(os.homedir(), '.config', 'mini-hosting-cluster');
export const FILE = path.join(ROOT, 'node.json');
const SHARE = path.join(os.homedir(), '.local','share','mini-hosting-cluster');
const RELAY = path.join(os.homedir(), 'standby-sync');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LABEL = /^[\p{L}\p{N}_.-]{1,40}$/u;
const SSHUSER = /^[a-zA-Z_][a-zA-Z0-9_]{0,49}$/;
const HOST = /^(?!-)[a-zA-Z0-9][a-zA-Z0-9.-]{0,251}$/;
const SSHKEY = path.join(os.homedir(),'.ssh','mini-hosting-standby-ed25519');
function requireOk(cond,msg){ if(!cond)throw Error(msg); }
function safeString(s,re,name){ requireOk(typeof s==='string'&&re.test(s),`Invalid ${name}`); return s; }
function validPort(s){const n=Number(s); requireOk(Number.isInteger(n)&&n>0&&n<65536, 'Invalid SSH port');return n;}
function atomicSave(value){
 fs.mkdirSync(ROOT,{recursive:true,mode:0o700});
 const tmp=path.join(ROOT,`node.json.${process.pid}.${crypto.randomUUID()}.tmp`);
 fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});
 fs.renameSync(tmp,FILE);fs.chmodSync(FILE,0o600);
}
export function readConfig(){ if(!fs.existsSync(FILE))return null;return JSON.parse(fs.readFileSync(FILE,'utf8')); }
function get(){const c=readConfig();requireOk(c,'Node is not initialized; use init-primary or join-standby');return c;}
function exec(bin,args,timeout=1500){try{return execFileSync(bin,args,{encoding:'utf8',timeout,stdio:['ignore','pipe','ignore']}).trim();}catch{return '';}}
function service(name){const s=exec('sv',['status',name],1500);return s.startsWith('run:')?'run':s.startsWith('down:')?'down':'unknown';}
function backup(){let name='',time=null,verified=false;
 const last=path.join(os.homedir(),'hosting-backups/thophuongpro/latest-success-path');
 try {const v=fs.readFileSync(last,'utf8').trim();if(/^\/data\/data\/com\.termux\/files\/home\/hosting-backups\/thophuongpro\/snapshot-[\d-]+$/.test(v)){
  name=path.basename(v);verified=fs.existsSync(path.join(v,'SHA256SUMS'));
  time=fs.statSync(path.join(v,'SHA256SUMS')).mtime.toISOString();}}
 catch{}return {name,checksumManifestPresent:verified,mtime:time};}
function storage(){const s=exec('df',['-Pk',os.homedir()],1500).split('\n');if(s.length<2)return null;
 const a=s.at(-1).trim().split(/\s+/);return {availableMiB:Math.floor(Number(a[3])/1024)||0};}
export function health(){const c=readConfig();const latest=(()=>{try{return fs.readFileSync(path.join(RELAY,'latest-applied'),'utf8').trim();}catch{return null;}})();
 const ready=fs.existsSync(path.join(os.homedir(),'recovery-input/RECOVERED.txt'));
 return {nodeId:c?.nodeId||null,label:c?.label||os.hostname(),clusterId:c?.clusterId||null,
 role:c?.role||'unconfigured',observedAt:new Date().toISOString(),appPresent:fs.existsSync(path.join(os.homedir(),'apps/thophuongpro/.env')),
 restoreMarker:ready,snapshotApplied:latest,backup:backup(),storage:storage(),
 services:{mysqld:service('mysqld'),nginx:service('nginx'),miniWeb:service('mini-web'),tunnel:service('named-tunnel'),panel:service('amh-panel'),standbySync:service('standby-sync')},
 promotionReady:false,promotionBlockedReason:'No GTID catch-up, distributed fencing or single-writer lease in v0.1'};
}
function ssh(host,user,port,args,timeout=7000){const arr=['-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=4','-o','ServerAliveInterval=3','-o','ServerAliveCountMax=1','-i',SSHKEY,'-p',String(port),`${user}@${host}`,...args];
 return execFileSync('ssh',arr,{encoding:'utf8',timeout,stdio:['ignore','pipe','pipe']}).trim();}
function onlineFromHeartbeat(p){const age=Date.now()-Date.parse(p.lastSeenAt||'');return Number.isFinite(age)&&age>=0&&age<180000;}
function roster(){const c=get();requireOk(c.role==='primary','Only the primary provides the cluster registry');return {clusterId:c.clusterId,nodeId:c.nodeId,primary:health(),nodes:(c.peers||[]).map(p=>({...p,online:onlineFromHeartbeat(p),health:p.lastHealth||null}))};}
function getRosterFromPrimary(c){
 try {const raw=ssh(c.primary.host,c.primary.user,c.primary.port,['node','"$HOME/.local/share/mini-hosting-cluster/src/cli.mjs"','roster-json']);const v=JSON.parse(raw);
  if(v.clusterId!==c.clusterId||v.nodeId!==c.primary.nodeId)throw Error('Primary identity mismatch');return v;
 }catch{return null;}
}
export function status(includeRemote=false){const c=readConfig();if(!c)return {initialized:false,local:health(),nodes:[]};
 let nodes=(c.peers||[]).map(p=>({...p,online:onlineFromHeartbeat(p),health:p.lastHealth||null}));
 if(includeRemote && c.role==='standby' && c.primary){const r=getRosterFromPrimary(c);if(r){nodes=[{nodeId:r.nodeId,label:'Primary',host:c.primary.host,user:c.primary.user,port:c.primary.port,online:true,health:r.primary},...r.nodes.filter(x=>x.nodeId!==c.nodeId)];}}
 return {initialized:true,clusterId:c.clusterId,declaredRole:c.role,
 warning:'NO AUTOMATIC FAILOVER. Snapshot standby may lag. These roles are inventory labels, not a fencing guarantee.',
 local:health(),nodes};}
function heartbeat(clusterId,nodeId,payload){const c=get();requireOk(c.role==='primary','Only primary receives heartbeats');
 requireOk(c.clusterId===safeString(clusterId,UUID,'cluster ID'),'Cluster mismatch');safeString(nodeId,UUID,'node ID');
 requireOk(payload.length<8192 && /^[A-Za-z0-9+/=]+$/.test(payload),'Invalid payload');
 const h=JSON.parse(Buffer.from(payload,'base64').toString('utf8'));
 requireOk(h.nodeId===nodeId&&h.clusterId===clusterId&&h.role==='standby','Heartbeat role or identity mismatch');
 const ix=(c.peers||[]).findIndex(p=>p.nodeId===nodeId);requireOk(ix>=0,'Unregistered node');
 // Strip payload to a deliberately small allowlist; no environment variables, passwords, tokens or paths.
 const sv=h.services||{};
 c.peers[ix].lastHealth={nodeId,role:'standby',label:c.peers[ix].label,storage:{availableMiB:Number(h.storage?.availableMiB)||0},
 services:Object.fromEntries(['mysqld','nginx','miniWeb','tunnel','panel','standbySync'].map(k=>[k,['run','down','unknown'].includes(sv[k])?sv[k]:'unknown'])),
 snapshotApplied:typeof h.snapshotApplied==='string'?h.snapshotApplied.slice(0,100):null,
 backup:{name:typeof h.backup?.name==='string'?h.backup.name.slice(0,100):''},promotionReady:false};
 c.peers[ix].lastSeenAt=new Date().toISOString();atomicSave(c);console.log('OK');}
function sendHeartbeat(){const c=get();requireOk(c.role==='standby','Heartbeats only sent by standby');const h=health();
 const payload=Buffer.from(JSON.stringify(h)).toString('base64');
 console.log(ssh(c.primary.host,c.primary.user,c.primary.port,['node','"$HOME/.local/share/mini-hosting-cluster/src/cli.mjs"','heartbeat',c.clusterId,c.nodeId,payload],7000));}
function initPrimary(label){requireOk(!readConfig(),'Already initialized; existing cluster identity preserved');
 requireOk(fs.existsSync(path.join(os.homedir(),'apps/thophuongpro/.env')),'Existing Tho Phuong Pro installation not found');
 requireOk(process.argv.includes('--confirm=PRIMARY'),'Must explicitly provide --confirm=PRIMARY');
 safeString(label,LABEL,'node label');atomicSave({version:1,clusterId:crypto.randomUUID(),nodeId:crypto.randomUUID(),role:'primary',label,peers:[],createdAt:new Date().toISOString()});
 console.log('Primary node initialized. No website/tunnel/database process modified.');console.log(JSON.stringify({clusterId:get().clusterId,nodeId:get().nodeId,label},null,2));}
function registerNode(clusterId,nodeId,label,host,user,port){const c=get();requireOk(c.role==='primary','Only primary can accept node registration');
 requireOk(c.clusterId===safeString(clusterId,UUID,'cluster ID'),'Cluster ID mismatch');safeString(nodeId,UUID,'node ID');safeString(label,LABEL,'label');safeString(host,HOST,'host');safeString(user,SSHUSER,'SSH user');
 const n=validPort(port);requireOk(nodeId!==c.nodeId,'Cannot register self');
 const peer={nodeId,label,host,user,port:n};
 const old=(c.peers||[]).find(x=>x.nodeId===nodeId);if(old){requireOk(JSON.stringify(old)===JSON.stringify(peer),'Existing node ID has different details; refuse overwrite');}
 else {c.peers=[...(c.peers||[]),peer];atomicSave(c);}
 console.log(JSON.stringify({ok:true,clusterId:c.clusterId,nodeId}));}
function adopt(clusterId,nodeId,label,primaryHost,primaryUser,primaryPort){requireOk(!readConfig(),'Already initialized; refusing to overwrite identity');
 for(const [s,n,re] of [[clusterId,'cluster ID',UUID],[nodeId,'primary node ID',UUID],[label,'label',LABEL],[primaryHost,'primary host',HOST],[primaryUser,'SSH user',SSHUSER]])safeString(s,re,n);
 requireOk(fs.existsSync(path.join(os.homedir(),'recovery-input/RECOVERED.txt')),'Local restored snapshot marker missing');
 requireOk(fs.existsSync(path.join(os.homedir(),'apps/thophuongpro/.env')),'Application not restored');
 requireOk(service('named-tunnel')!=='run'&&service('mini-web')!=='run','STOP: disable website and tunnel before joining as standby');
 const data={version:1,clusterId,nodeId:crypto.randomUUID(),role:'standby',label,primary:{nodeId,host:primaryHost,user:primaryUser,port:validPort(primaryPort)},peers:[],createdAt:new Date().toISOString()};atomicSave(data);
 console.log(JSON.stringify({ok:true,nodeId:data.nodeId,clusterId}));}
function markRegistration(data){const c=get();requireOk(c.role==='standby','Not a standby');requireOk(c.nodeId===data,'Node ID mismatch');console.log('Registered standby',c.label,c.nodeId);}
function main(){const [cmd,...a]=process.argv.slice(2);switch(cmd){
 case 'health-json':return console.log(JSON.stringify(health()));
 case 'identity-json':{const c=get();return console.log(JSON.stringify({clusterId:c.clusterId,nodeId:c.nodeId,role:c.role,label:c.label}));}
 case 'init-primary':return initPrimary(a[0]||'Primary');
 case 'register':return registerNode(...a);
 case 'roster-json':return console.log(JSON.stringify(roster()));
 case 'heartbeat':return heartbeat(...a);
 case 'send-heartbeat':return sendHeartbeat();
 case 'adopt-standby':return adopt(...a);
 case 'registration-confirm':return markRegistration(a[0]);
 case 'status-json':return console.log(JSON.stringify(status(a.includes('--remote'))));
 case 'status':{const st=status(a.includes('--remote'));console.log(JSON.stringify(st,null,2));return;}
 case 'help':case undefined:console.log('Mini Hosting Cluster v0.1\nCommands:\n  mhc init-primary <node-label> --confirm=PRIMARY\n  mhc status [--remote]\n  mhc health-json\n  mhc identity-json\n  mhc join-standby <primary-IP> <SSH-user> [port] [node-label]\n  mhc sync-once\n  mhc bootstrap-new <primary-IP> <SSH-user> [port] [node-label]\n  mhc dashboard (SSH tunnel to port 9092)\nControl plane v0.3: observe/manual/auto; fail-closed until each node is explicitly armed and verified.');return;
 default:throw Error('Unknown command: '+cmd);
 }}
if(import.meta.url===`file://${process.argv[1]}`){try{main();}catch(e){console.error('ERROR:',e.message);process.exitCode=1;}}
