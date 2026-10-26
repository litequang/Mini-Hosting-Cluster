#!/usr/bin/env node
// Optional outbound-only public-cloud telemetry. READ ONLY; never receives remote commands.
// Secrets live only in ~/.config/mini-hosting-cluster/online.json (0600).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {health, readConfig, ROOT} from './cli.mjs';

const CONFIG=path.join(ROOT,'online.json');
const COLLECTOR='https://telemetry.thophuong.com';
const WAIT_MS=60_000;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function requireIdentity(){const x=readConfig();if(!x?.nodeId||!x?.clusterId||!['primary','standby'].includes(x.role))throw Error('Cluster identity missing: initialize/join local cluster first.');return x;}
function config(){return JSON.parse(fs.readFileSync(CONFIG,'utf8'));}
function diskFallback(){try{const s=execFileSync('df',['-Pk',os.homedir()],{encoding:'utf8',timeout:2200}).trim().split('\n').at(-1).trim().split(/\s+/);return {total:Number(s[1])*1024,used:Number(s[2])*1024,available:Number(s[3])*1024};}catch{return null;}}

function memoryFallback(){
 try{const v=execFileSync('free',['-b'],{encoding:'utf8',timeout:1800}).split(/\r?\n/).find(x=>/^Mem:\s+/.test(x)).trim().split(/\s+/).slice(1).map(Number);
  if(v.length>=6&&v.every(Number.isFinite))return {total:v[0],used:v[1],available:v.at(-1)};
 }catch{}
 return {total:os.totalmem(),used:null,available:null};
}
function processFallback(){
 try{const lines=execFileSync('ps',['-ef'],{encoding:'utf8',timeout:1800,maxBuffer:256*1024}).split(/\r?\n/).slice(1);
  return lines.flatMap(line=>{
   const p=line.trim().split(/\s+/);if(p.length<8)return [];
   const pid=Number(p[1]),args=p.slice(7).join(' '),exe=args.split(/\s+/)[0].split('/').at(-1);
   if(!Number.isInteger(pid)||!['node','nodejs'].includes(exe))return [];
   let name='Node.js · Khác';
   if(args.includes('dist/server.cjs'))name='Thờ Phượng Pro · Web/API';
   else if(args.includes('android-hosting-panel/monitor/server.mjs'))name='Mini Hosting · LAN Monitor';
   else if(args.includes('android-hosting-panel/src/server.mjs'))name='Mini Hosting · Panel';
   else if(args.includes('mini-hosting-cluster/src/online-agent.mjs'))name='Mini Hosting · Cloud Agent';
   let rssBytes=null;try{const m=fs.readFileSync('/proc/'+pid+'/status','utf8').match(/^VmRSS:\s+(\d+)\s+kB/m);if(m)rssBytes=Number(m[1])*1024;}catch{}
   // Return a fixed label, never a command line or environment string.
   return [{name,rssBytes,uptimeSec:null}];
  }).slice(0,12);
 }catch{return [];}
}

function numeric(n,a,b){const x=Number(n);return n!==null&&n!==undefined&&Number.isFinite(x)&&x>=a&&x<=b?x:null;}
async function lanMonitor(){try{const controller=new AbortController();const t=setTimeout(()=>controller.abort(),1700);try{const r=await fetch('http://127.0.0.1:9091/api/status',{signal:controller.signal,headers:{host:'127.0.0.1:9091'}});if(!r.ok)return null;return await r.json();}finally{clearTimeout(t);}}catch{return null;}}
function optionalBattery(){try{const raw=execFileSync('termux-battery-status',[],{encoding:'utf8',timeout:1600,stdio:['ignore','pipe','ignore']});const b=JSON.parse(raw);if(b?.API_ERROR)return {available:false};return {available:true,percentage:numeric(b.percentage,0,100),temperatureC:numeric(b.temperature,-30,120),plugged:String(b.plugged||'').slice(0,30),status:String(b.status||'').slice(0,30)};}catch{return {available:false};}}
export async function makeTelemetry(){
 const c=requireIdentity(), h=health(),local=await lanMonitor();
 const monitor=local?{battery:local.battery,wifi:local.wifi,memory:local.memory,disk:local.disk,systemUptimeSec:local.systemUptimeSec,
 nodeProcesses:(local.nodeProcesses||[]).map(p=>({name:p.name,rssBytes:p.rssBytes,uptimeSec:p.uptimeSec})),network:{outagesLast24h:local.network?.outagesLast24h}}
 :{battery:optionalBattery(),wifi:{status:'unknown'},memory:memoryFallback(),disk:diskFallback(),systemUptimeSec:Math.round(os.uptime()),nodeProcesses:processFallback(),network:{outagesLast24h:null}};
 let syncAgeSeconds=null;try{const raw=fs.readFileSync(path.join(os.homedir(),'standby-sync/last-applied-at'),'utf8').trim();const d=Date.parse(raw);if(Number.isFinite(d))syncAgeSeconds=Math.max(0,Math.floor((Date.now()-d)/1000));}catch{}
 return {clusterId:c.clusterId,nodeId:c.nodeId,label:c.label,declaredRole:c.role,observedAt:new Date().toISOString(),
 services:h.services,appPresent:h.appPresent,snapshotApplied:h.snapshotApplied,backupName:h.backup?.name||null,
 storageAvailableMiB:h.storage?.availableMiB??null,syncAgeSeconds,monitor};
}
async function post(endpoint,payload,token=null){const controller=new AbortController(),t=setTimeout(()=>controller.abort(),10000);
 try{const r=await fetch(COLLECTOR+endpoint,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(payload),signal:controller.signal});
 const body=await r.json().catch(()=>({error:'HTTP '+r.status}));if(!r.ok)throw Error('Cloud '+r.status+': '+String(body.error||'request failed'));return body;
 }finally{clearTimeout(t);}}
async function enroll(code){const c=requireIdentity();if(fs.existsSync(CONFIG))throw Error('Already enrolled. Refusing to overwrite cloud token.');
 if(!/^[a-f0-9-]{70,100}$/i.test(code))throw Error('Invalid pairing code');
 const token=crypto.randomBytes(32).toString('base64url');
 await post('/v1/enroll',{clusterId:c.clusterId,nodeId:c.nodeId,label:c.label,pairingCode:code,token});
 fs.mkdirSync(ROOT,{recursive:true,mode:0o700});const temp=CONFIG+'.'+process.pid+'.tmp';
 fs.writeFileSync(temp,JSON.stringify({version:1,collector:COLLECTOR,token,nodeId:c.nodeId,clusterId:c.clusterId,enrolledAt:new Date().toISOString()},null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(temp,CONFIG);fs.chmodSync(CONFIG,0o600);
 console.log('CLOUD ENROLL OK: node registered. Telemetry is outbound and read-only.');
 console.log('Do not share '+CONFIG+' or the pairing code.');
}
async function push(){const c=requireIdentity(), auth=config();if(auth.clusterId!==c.clusterId||auth.nodeId!==c.nodeId||auth.collector!==COLLECTOR)throw Error('Cloud identity/endpoint mismatch; refusing telemetry');
 await post('/v1/heartbeat',await makeTelemetry(),auth.token);console.log('HEARTBEAT OK '+new Date().toISOString());}
async function loop(){for(;;){try{await push();}catch(e){console.error('HEARTBEAT FAILED: '+e.message);}await pause(WAIT_MS);}}
const isMain=process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname);
if(isMain){(async()=>{
 const cmd=process.argv[2];switch(cmd){case 'enroll':await enroll(process.argv[3]||'');break;
 case 'push':await push();break;case 'loop':await loop();break;
 case 'status':{const exists=fs.existsSync(CONFIG);const c=readConfig();console.log(JSON.stringify({configured:exists,nodeId:c?.nodeId,role:c?.role,collector:COLLECTOR,tokenNotShown:true},null,2));break;}
 default:throw Error('Usage: online-agent.mjs enroll <pairingCode> | push | loop | status');}
 })().catch(e=>{console.error('ERROR: '+e.message);process.exitCode=1;});}
