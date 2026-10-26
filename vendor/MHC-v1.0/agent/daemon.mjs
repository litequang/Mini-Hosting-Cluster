import os from 'node:os';import fs from 'node:fs';import path from 'node:path';import {setTimeout as sleep} from 'node:timers/promises';
import {loadConfig,leasePath,writeJson,closeLease,localProbe,replicaStatus,svc,mysql,machineBoot} from './common.mjs';
let config=loadConfig();
if(config.armed) {
  // On process restart, a cached disk lease cannot authorize writes.
  closeLease();
  svc('down',config.siteService||'mini-web');
}
let lastMode=null;
function mysqlReadonly(on){if(config.protectDatabase!==true)return;
 const v=mysql('SET GLOBAL read_only = '+(on?'ON':'OFF'));if(v===null)throw Error('Could not set DB read_only');
}
function demote(){closeLease();if(config.armed){
 svc('down',config.siteService||'mini-web');
 try{mysqlReadonly(true)}catch(e){console.error('DB readonly fence error:',e.message)}
}}
function promote(decision){
 // Conservative local lease is shorter than DO. Independent gateway checks EVERY request.
 const liveMs=Math.max(0,Math.min(12000,decision.leaseRemainingMs-8500));
 if(liveMs<2000)throw Error('No safe lease time left');
 // A local snapshot job MUST NOT overwrite the newly serving writer.
 // Stop future snapshot jobs and refuse to promote during an in-flight import.
 const syncLock=path.join(os.homedir(),'standby-sync/.sync-lock');
 if(fs.existsSync(syncLock))throw Error('Snapshot import in progress; cannot promote');
 const standbySvc=process.env.PREFIX?path.join(process.env.PREFIX,'var/service/standby-sync'):null;
 if(standbySvc && fs.existsSync(standbySvc)) {
   svc('down','standby-sync');
   try{fs.writeFileSync(path.join(standbySvc,'down'),'')}catch(e){throw Error('Could not disable standby-sync: '+e.message)}
   if(fs.existsSync(syncLock))throw Error('Sync interrupted or in progress; cannot promote');
 }
 // A promoted MariaDB replica must stop replaying old-primary GTIDs.
 const replica=replicaStatus();
 if(replica.io!=='unknown' || replica.sql!=='unknown') {
   if(mysql('STOP SLAVE')===null)throw Error('Could not stop replica before accepting writes');
 }
 mysqlReadonly(false);
 writeJson(leasePath,{role:'primary',owner:config.nodeId,term:decision.term,
   deadlineEpochMs:Date.now()+liveMs,deadlineUptimeSec:os.uptime()+liveMs/1000,bootId:machineBoot()});
 svc('up',config.siteService||'mini-web');
}
async function tick(){
 config=loadConfig(); // honor ARM/DISARM changes without stale cached settings
 const probe=localProbe(config);probe.armed=config.armed===true;
 let result;
 try{
 const response=await fetch(new URL('/__mhc/api/pulse',config.controlUrl),{
   method:'POST',headers:{'authorization':'Bearer '+config.token,'content-type':'application/json'},
   body:JSON.stringify({nodeId:config.nodeId,report:probe}),signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw Error('Coordinator HTTP '+response.status);
 result=await response.json();
 }catch(e){demote();throw e}
 if(!config.armed){closeLease();return {role:'unarmed',...result}}
 if(probe.healthy && result.role==='primary'&&result.owner===config.nodeId){try{promote(result)}catch(e){demote();throw e}}
 else demote();
 if(lastMode!==result.role){console.log(new Date().toISOString(),'ROLE',result.role,'term',result.term,'owner',result.owner,'mode',result.mode);lastMode=result.role}
 return result;
}
const once=process.argv.includes('--once');
process.on('SIGTERM',()=>{demote();process.exit(0)});
process.on('SIGINT',()=>{demote();process.exit(0)});
if(once){try{console.log(JSON.stringify(await tick(),null,2))}catch(e){console.error(e.message);process.exitCode=1}}
else for(;;){try{await tick()}catch(e){console.error(new Date().toISOString(),e.message)}await sleep(4500)}
