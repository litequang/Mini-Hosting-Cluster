// MHC Node Monitor v2: read-only, bounded, privacy-preserving device telemetry.
// No IP, SSID, BSSID, file paths, process arguments, environment or credentials are sent.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
const HOME=process.env.HOME||os.homedir();
const PREFIX=process.env.PREFIX||'/data/data/com.termux/files/usr';
const SERV=['amh-panel','sshd','nginx','mysqld','mini-web','mhc-authority-agent','mhc-panel-tunnel','mhc-full-wp-php','mhc-full-wp-nginx'];
const range=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:null;
const clean=(s,max=55)=>String(s||'').replace(/[\x00-\x1f\x7f]/g,'').slice(0,max);
let lastCpu=null,lastNetwork=null,cache=null,cacheAt=0;
function proc(file,args=[],timeout=900){
 return new Promise(resolve=>{
  execFile(file,args,{timeout,maxBuffer:4096,encoding:'utf8'},(err,out)=>resolve(err?null:String(out||'').trim().slice(0,4096)));
 });
}
function cpu(){
 let values=[];try{values=os.cpus()||[];}catch{}
 const total=values.reduce((a,c)=>a+Object.values(c.times||{}).reduce((x,y)=>x+y,0),0);
 const idle=values.reduce((a,c)=>a+(c.times?.idle||0),0);
 let pct=null;
 if(lastCpu&&total>lastCpu.total&&idle>=lastCpu.idle&&idle-lastCpu.idle<=total-lastCpu.total)
  pct=range(Math.round(100*(1-(idle-lastCpu.idle)/(total-lastCpu.total))),0,100);
 if(total>0)lastCpu={total,idle};
 return {usagePct:pct,cores:values.length||null};
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
async function services(){
 const list=await Promise.all(SERV.map(async id=>{
  const r=await proc(path.join(PREFIX,'bin/sv'),['status',path.join(PREFIX,'var/service',id)],1400);
  return [id,r===null?'unknown':r.startsWith('run:')?'running':r.startsWith('down:')?'stopped':'unknown'];
 }));
 return Object.fromEntries(list);
}
export async function collectNodeMetrics(){
 if(cache&&Date.now()-cacheAt<10000)return cache;
 const [power,status,model,android]=await Promise.all([
  battery(),services(),proc(path.join(PREFIX,'bin/getprop'),['ro.product.model'],900),
  proc(path.join(PREFIX,'bin/getprop'),['ro.build.version.release'],900)
 ]);
 const ramTotal=os.totalmem()/1048576,ramFree=os.freemem()/1048576;
 const m={
  v:1,at:new Date().toISOString(),device:clean(model||'Android'),android:clean(android||'',12),
  cpu:cpu(),
  memory:{totalMiB:range(Math.round(ramTotal),0,1e8),freeMiB:range(Math.round(ramFree),0,1e8)},
  storage:disk(),network:network(),
  battery:power,uptimeSec:range(Math.round(os.uptime()),0,1e10),
  services:status
 };
 cache=m;cacheAt=Date.now();return m;
}
export function compactTelemetry(m){
 if(!m||m.v!==1)return null;
 const pct=x=>range(x,0,100),mib=x=>range(x,0,1e9),temp=x=>range(x,-25,100);
 const state=s=>['running','stopped','unknown'].includes(s)?s:'unknown';
 const svc=Object.fromEntries(SERV.map(k=>[k,state(m.services?.[k])]));
 return {v:1,at:typeof m.at==='string'&&/^\d{4}-\d\d-\d\dT/.test(m.at)?m.at:null,
  device:clean(m.device),android:clean(m.android,12),
  cpu:{usagePct:pct(m.cpu?.usagePct),cores:range(m.cpu?.cores,1,256)},
  memory:{totalMiB:mib(m.memory?.totalMiB),freeMiB:mib(m.memory?.freeMiB)},
  storage:{totalMiB:mib(m.storage?.totalMiB),freeMiB:mib(m.storage?.freeMiB)},
  network:{rxKiBs:mib(m.network?.rxKiBs),txKiBs:mib(m.network?.txKiBs),interfaces:range(m.network?.interfaces,0,128)},
  battery:{percentage:pct(m.battery?.percentage),temperatureC:temp(m.battery?.temperatureC),
   status:['CHARGING','DISCHARGING','FULL','NOT_CHARGING','UNAVAILABLE','UNKNOWN'].includes(m.battery?.status)?m.battery.status:'UNKNOWN',
   health:['GOOD','OVERHEAT','DEAD','OVER_VOLTAGE','UNSPECIFIED_FAILURE','COLD','UNKNOWN'].includes(m.battery?.health)?m.battery.health:null},
  uptimeSec:range(m.uptimeSec,0,1e10),services:svc};
}
