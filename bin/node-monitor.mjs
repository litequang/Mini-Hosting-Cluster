// MHC Node Monitor v2: read-only, bounded, privacy-preserving device telemetry.
// No IP, SSID, BSSID, file paths, process arguments, environment or credentials are sent.
import {collectAuthorityUsage,safeUsage} from './authority-usage.mjs';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {onboardingObservation} from './node-onboarding.mjs';
const HOME=process.env.HOME||os.homedir();
const PREFIX=process.env.PREFIX||'/data/data/com.termux/files/usr';
const SERV=['amh-panel','sshd','nginx','mysqld','mini-web','mhc-authority-agent','mhc-panel-tunnel','mhc-full-wp-php','mhc-full-wp-nginx','named-tunnel','php-fpm','mhc-full-daily-backup'];
const range=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:null;
const clean=(s,max=55)=>String(s||'').replace(/[\x00-\x1f\x7f]/g,'').slice(0,max);
let lastNetwork=null,cache=null,cacheAt=0;
function proc(file,args=[],timeout=900,limit=4096){
 return new Promise(resolve=>{
  execFile(file,args,{timeout,maxBuffer:Math.min(262144,limit),encoding:'utf8'},(err,out)=>resolve(err?null:String(out||'').trim().slice(0,limit)));
 });
}
function disk(){
 try{
  const d=fs.statfsSync(HOME),size=d.bsize||d.frsize||0;
  if(!(size>0))return {totalMiB:null,freeMiB:null};
  const total=Math.round(Number(d.blocks)*size/1048576);
  const free=Math.round(Number(d.bavail)*size/1048576);
  return {totalMiB:range(total,0,1e9),freeMiB:range(free,0,1e9)};
 }catch{return {totalMiB:null,freeMiB:null};}
}
function network(){
 try{
  const text=fs.readFileSync('/proc/net/dev','utf8').slice(0,16000);
  let rx=0,tx=0,used=0;
  for(const line of text.split('\n').slice(2)){
   const x=/^\s*([^:]+):\s*(.+)$/.exec(line);if(!x)continue;
   const iface=x[1].trim(),v=x[2].trim().split(/\s+/);
   if(iface==='lo'||v.length<16||!/^\d+$/.test(v[0])||!/^\d+$/.test(v[8]))continue;
   rx+=Number(v[0]);tx+=Number(v[8]);used++;
  }
  if(!used||!Number.isSafeInteger(rx)||!Number.isSafeInteger(tx))return {rxKiBs:null,txKiBs:null,interfaces:null};
  const now=Date.now();
  let r=null,t=null;
  if(lastNetwork&&now>lastNetwork.at&&rx>=lastNetwork.rx&&tx>=lastNetwork.tx){
   const sec=(now-lastNetwork.at)/1000;
   if(sec>=2){r=range(Math.round((rx-lastNetwork.rx)/1024/sec),0,1e9);t=range(Math.round((tx-lastNetwork.tx)/1024/sec),0,1e9);}
  }
  lastNetwork={rx,tx,at:now};
  return {rxKiBs:r,txKiBs:t,interfaces:used};
 }catch{return {rxKiBs:null,txKiBs:null,interfaces:null};}
}
async function battery(){
 const raw=await proc(path.join(PREFIX,'bin/termux-battery-status'),[],2200);
 if(!raw)return {percentage:null,temperatureC:null,status:'UNAVAILABLE',health:null};
 try{
  const v=JSON.parse(raw),status=String(v.status||'').toUpperCase(),health=String(v.health||'').toUpperCase();
  return {
   percentage:range(v.percentage,0,100),temperatureC:range(v.temperature,-25,100),
   status:['CHARGING','DISCHARGING','FULL','NOT_CHARGING','UNKNOWN'].includes(status)?status:'UNKNOWN',
   health:['GOOD','OVERHEAT','DEAD','OVER_VOLTAGE','UNSPECIFIED_FAILURE','COLD','UNKNOWN'].includes(health)?health:null
  };
 }catch{return {percentage:null,temperatureC:null,status:'UNAVAILABLE',health:null};}
}

// Wi-Fi connection status/RSSI, never SSID/BSSID/IP.
async function wifi(){
 const raw=await proc(path.join(PREFIX,'bin/termux-wifi-connectioninfo'),[],2000);
 if(!raw)return {state:'unknown',rssiDbm:null};
 try{
  const v=JSON.parse(raw),rssi=range(v.rssi,-127,0);
  return {state:rssi===null?'unknown':'connected',rssiDbm:rssi};
 }catch{return {state:'unknown',rssiDbm:null};}
}
async function nodeProcesses(){
 const raw=await proc(path.join(PREFIX,'bin/ps'),['-ef'],2600,131072);
 if(!raw)return [];
 const result=[];
 for(const line of raw.split(/\r?\n/).slice(1)){
  const fields=line.trim().split(/\s+/);
  if(fields.length<8)continue;
  const pid=Number(fields[1]),args=fields.slice(7),cmd=args.join(' ');
  if(!Number.isSafeInteger(pid)||pid<1||!args.some(a=>/(?:^|\/)node(?:js)?$/.test(a)))continue;
  const name=cmd.includes('android-hosting-panel')?'Mini Hosting Panel':
   cmd.includes('cluster-authority.mjs')?'Cluster Agent':
   cmd.includes('monitor/server.mjs')?'LAN Monitor':
   cmd.includes('dist/server.cjs')?'Web Node.js':'Node.js khác';
  let rssMiB=null;
  try{
   const v=fs.readFileSync('/proc/'+pid+'/status','utf8').match(/^VmRSS:\s+(\d+)\s+kB/m);
   if(v)rssMiB=range(Math.round(Number(v[1])/1024),0,1e7);
  }catch{}
  result.push({name,rssMiB});if(result.length>=6)break;
 }
 return result;
}
function snapshot(){
 const root=path.join(HOME,'hosting-backups/mhc-full');
 try{
  const names=fs.readdirSync(root).filter(x=>/^snapshot-\d{8}$/.test(x)).sort().reverse();
  if(!names.length)return {name:null,recordedAt:null,verified:false};
  const name=names[0],date=fs.statSync(path.join(root,name)).mtimeMs;
  return {name,recordedAt:Number.isFinite(date)?new Date(date).toISOString():null,verified:false};
 }catch{return {name:null,recordedAt:null,verified:false};}
}

async function services(){
 const list=await Promise.all(SERV.map(async id=>{
  const r=await proc(path.join(PREFIX,'bin/sv'),['status',path.join(PREFIX,'var/service',id)],1400);
  return [id,r===null?'unknown':r.startsWith('run:')?'running':r.startsWith('down:')?'stopped':'unknown'];
 }));
 return Object.fromEntries(list);
}
export async function collectNodeMetrics(){
 if(cache&&Date.now()-cacheAt<10000)return cache;
 const [power,status,model,android,wireless,processes]=await Promise.all([
  battery(),services(),proc(path.join(PREFIX,'bin/getprop'),['ro.product.model'],900),
  proc(path.join(PREFIX,'bin/getprop'),['ro.build.version.release'],900),wifi(),nodeProcesses()
 ]);
 const ramTotal=os.totalmem()/1048576,ramFree=os.freemem()/1048576;
 const m={
  v:1,at:new Date().toISOString(),device:clean(model||'Android'),android:clean(android||'',12),
  cloudflareUsage:collectAuthorityUsage(HOME),wifi:wireless,processes,snapshot:snapshot(),
  memory:{totalMiB:range(Math.round(ramTotal),0,1e8),freeMiB:range(Math.round(ramFree),0,1e8)},
  storage:disk(),network:network(),
  battery:power,uptimeSec:range(Math.round(os.uptime()),0,1e10),
  onboarding:onboardingObservation({home:HOME,services:status}),services:status
 };
 cache=m;cacheAt=Date.now();return m;
}
export function compactTelemetry(m){
 if(!m||m.v!==1)return null;
 const pct=x=>range(x,0,100),mib=x=>range(x,0,1e9),temp=x=>range(x,-25,100);
 const state=s=>['running','stopped','unknown'].includes(s)?s:'unknown';
 const svc=Object.fromEntries(SERV.map(k=>[k,state(m.services?.[k])]));
 return {cloudflareUsage:safeUsage(m.cloudflareUsage),v:1,at:typeof m.at==='string'&&/^\d{4}-\d\d-\d\dT/.test(m.at)?m.at:null,
  device:clean(m.device),android:clean(m.android,12),
  memory:{totalMiB:mib(m.memory?.totalMiB),freeMiB:mib(m.memory?.freeMiB)},
  storage:{totalMiB:mib(m.storage?.totalMiB),freeMiB:mib(m.storage?.freeMiB)},
  network:{rxKiBs:mib(m.network?.rxKiBs),txKiBs:mib(m.network?.txKiBs),interfaces:range(m.network?.interfaces,0,128)},
  wifi:{state:m.wifi?.state==='connected'?'connected':'unknown',rssiDbm:range(m.wifi?.rssiDbm,-127,0)},
  processes:(Array.isArray(m.processes)?m.processes:[]).slice(0,6).map(p=>({
   name:['Mini Hosting Panel','Cluster Agent','LAN Monitor','Web Node.js','Node.js khác'].includes(p?.name)?p.name:'Node.js khác',
   rssMiB:mib(p?.rssMiB)})),
  snapshot:{name:/^snapshot-\d{8}$/.test(m.snapshot?.name||'')?m.snapshot.name:null,
   recordedAt:typeof m.snapshot?.recordedAt==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(m.snapshot.recordedAt)?m.snapshot.recordedAt:null,
   verified:false},
  battery:{percentage:pct(m.battery?.percentage),temperatureC:temp(m.battery?.temperatureC),
   status:['CHARGING','DISCHARGING','FULL','NOT_CHARGING','UNAVAILABLE','UNKNOWN'].includes(m.battery?.status)?m.battery.status:'UNKNOWN',
   health:['GOOD','OVERHEAT','DEAD','OVER_VOLTAGE','UNSPECIFIED_FAILURE','COLD','UNKNOWN'].includes(m.battery?.health)?m.battery.health:null},
  uptimeSec:range(m.uptimeSec,0,1e10),onboarding:onboardingObservation({home:HOME,services:svc}),services:svc};
}
