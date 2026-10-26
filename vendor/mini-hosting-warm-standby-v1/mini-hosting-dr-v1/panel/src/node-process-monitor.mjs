// Scoped, read-only process monitor for Panel v1.3.
// Android can deny /proc/PID/stat, so inaccessible readings stay null.
import fs from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execFileAsync=promisify(execFile);
const previous=new Map();
const MAX_AGE=10*60*1000;
function readCpuTicks(pid){
 try{
  const line=fs.readFileSync(`/proc/${pid}/stat`,'utf8');
  const end=line.lastIndexOf(')');
  if(end<0)return null;
  const fields=line.slice(end+1).trim().split(/\s+/);
  // First item is field 3 (state); utime field 14, stime 15; starttime field 22.
  const ticks=Number(fields[11])+Number(fields[12]), start=fields[19];
  return Number.isFinite(ticks)&&/^\d+$/.test(start)?{ticks,start}:null;
 }catch{return null;}
}
function readRSS(pid){
 try{const s=fs.readFileSync(`/proc/${pid}/status`,'utf8');const match=s.match(/^VmRSS:\s+(\d+)\s+kB/m);return match?Number(match[1])*1024:null;}catch{return null;}
}
function kind(args,pid){
 const command=args.join(' ');
 if(pid===process.pid)return 'Mini Hosting Panel';
 if(command.includes('android-hosting-panel/monitor/server.mjs'))return 'Panel Monitor';
 if(command.includes('dist/server.cjs'))return 'Thờ Phượng Pro';
 if(command.includes('src/server.mjs'))return 'Node.js server';
 if(command.includes('server.js'))return 'Node.js app';
 return 'Node.js khác';
}
function parsePs(stdout){
 const result=[];
 for(const line of stdout.split(/\r?\n/).slice(1)){
  const fields=line.trim().split(/\s+/);
  if(fields.length<8)continue;
  const pid=Number(fields[1]),ppid=Number(fields[2]);
  const args=fields.slice(7);
  if(!Number.isInteger(pid)||pid<1||!Number.isInteger(ppid)||!args.some(a=>/\bnode(?:js)?$/.test(a)||a.includes('/bin/node')))continue;
  result.push({pid,ppid,args});
 }
 return result;
}
export async function nodeProcessStats(){
 let entries=[];
 try{
  const {stdout}=await execFileAsync('ps',['-ef'],{timeout:3500,maxBuffer:256*1024,encoding:'utf8'});
  entries=parsePs(stdout);
 }catch{/* Keep API usable when Android restricts ps. */}
 const now=Date.now(),data=[];
 for(const entry of entries.slice(0,40)){
  const reading=readCpuTicks(entry.pid),old=previous.get(entry.pid);
  let cpuPct=null;
  if(reading&&old&&old.start===reading.start){
   const seconds=(now-old.time)/1000;
   const delta=reading.ticks-old.ticks;
   if(seconds>=0.5&&delta>=0){
    // Linux USER_HZ on Android arm64 is normally 100; per-core, may exceed 100%.
    cpuPct=Math.round((delta/100/seconds)*1000)/10;
   }
  }
  if(reading)previous.set(entry.pid,{...reading,time:now});
  data.push({pid:entry.pid,ppid:entry.ppid,name:kind(entry.args,entry.pid),cpuPct,rssBytes:readRSS(entry.pid),cpuReadable:!!reading});
 }
 const live=new Set(entries.map(x=>x.pid));
 for(const [pid,last] of previous)if(!live.has(pid)||now-last.time>MAX_AGE)previous.delete(pid);
 return {processes:data,observedAt:new Date(now).toISOString(),cpuBasis:'1 CPU core = 100%; CPU measured between consecutive refreshes; — means unavailable'};
}
