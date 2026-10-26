import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';
export const root=process.env.MHC_HOME||path.join(os.homedir(),'mhc-v1');
export const configPath=path.join(root,'config.json');
export const leasePath=path.join(root,'lease.json');
export function loadConfig(){const c=JSON.parse(fs.readFileSync(configPath,'utf8'));
 if(!c.nodeId||!c.token||!c.controlUrl||!/^https:\/\//.test(c.controlUrl))throw Error('Invalid config.json');return c;}
export function writeJson(dest,v){fs.mkdirSync(path.dirname(dest),{recursive:true,mode:0o700});const t=dest+'.'+process.pid+'.tmp';fs.writeFileSync(t,JSON.stringify(v,null,2)+'\n',{mode:0o600});fs.renameSync(t,dest);}
export function machineBoot(){try{return fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim()}catch{return 'unknown'}}
export function currentlyLeased(c,clock=Date.now(),uptime=os.uptime()){
 try{const v=JSON.parse(fs.readFileSync(leasePath,'utf8'));
   return v.owner===c.nodeId && v.term>0 && v.role==='primary' &&
     v.bootId===machineBoot() && clock<v.deadlineEpochMs && uptime<v.deadlineUptimeSec;
 }catch{return false}
}
export function closeLease(){writeJson(leasePath,{role:'standby',owner:null,term:0,deadlineEpochMs:0,deadlineUptimeSec:0,bootId:machineBoot()})}
export function svc(command,name,verbose=false){
 if(!/^[a-z0-9-]+$/.test(name))throw Error('Invalid service name');
 const sv=process.env.PREFIX?path.join(process.env.PREFIX,'bin/sv'):'sv';
 try{return execFileSync(sv,[command,name],{timeout:5000,encoding:'utf8',stdio:verbose?'inherit':['ignore','pipe','pipe']}).toString()}
 catch(e){if(verbose)throw e;return String(e.stdout||e.stderr||e.message)}
}
export function mysql(sql){try{return execFileSync('mariadb',['--no-defaults','-u','root','-N','-B','-e',sql],{timeout:4000,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()}catch{return null}}
export function replicaStatus(){
 try{
 const s=execFileSync('mariadb',['--no-defaults','-u','root','-e','SHOW SLAVE STATUS\\G'],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','pipe']});
 const m=Object.fromEntries([...s.matchAll(/^\s*([a-zA-Z_]+):\s*(.*?)\s*$/gm)].map((x)=>[x[1],x[2]]));
 const lag=Number(m.Seconds_Behind_Master);
 return {replicationReady:m.Slave_SQL_Running==='Yes'&&m.Slave_IO_Running==='Yes' && Number.isFinite(lag)&&lag>=0&&lag<=5 && !!m.Using_Gtid && m.Using_Gtid!=='No',lagSeconds: Number.isFinite(lag)?lag:null,io:m.Slave_IO_Running||'unknown',sql:m.Slave_SQL_Running||'unknown'};
 }catch{return {replicationReady:false,lagSeconds:null,io:'unknown',sql:'unknown'}}
}
export function healthMetrics(){
 let diskFreeGb=0,batteryPct=null;
 try{const rows=execFileSync('df',['-Pk',os.homedir()],{encoding:'utf8',timeout:1500}).trim().split('\n');
   const fields=rows.at(-1).trim().split(/\s+/);diskFreeGb=Number(fields[3])*1024/(1024**3);
 }catch{}
 try{const b=JSON.parse(execFileSync('termux-battery-status',{encoding:'utf8',timeout:1500}));
   if(Number.isFinite(b.percentage))batteryPct=b.percentage;
 }catch{} // Termux:API may be unavailable on X7b; do not punish missing battery.
 return {cpuCores:os.cpus().length,memFreeGb:os.freemem()/(1024**3),diskFreeGb,
         uptimeDays:os.uptime()/86400,batteryPct};
}
export function localProbe(c){
 const app=path.join(os.homedir(),'apps/thophuongpro');
 let dbName=null;
 try{
  const env=fs.readFileSync(path.join(app,'.env'),'utf8');
  const m=env.match(/^MYSQL_DATABASE\s*=\s*['"]?([a-zA-Z_][a-zA-Z0-9_]{0,63})/m);
  if(m)dbName=m[1];
 }catch{}
 const releasePresent=fs.existsSync(path.join(app,'dist/server.cjs')) &&
   fs.existsSync(path.join(app,'storage/sheets'));
 const db=mysql('SELECT 1')==='1';
 const tableCount=db&&dbName?Number(mysql(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${dbName}'`)):0;
 // Protect specifically the production Thờ Phượng Pro deployment (93 tables today).
 const healthy=releasePresent && db && Number.isInteger(tableCount) && tableCount>=80;
 const r=replicaStatus();
 let snapshot=null;try{snapshot=fs.readFileSync(path.join(os.homedir(),'standby-sync/latest-applied'),'utf8').trim()}catch{}
 // Snapshot identity alone NEVER implies a lossless promotion.
 return {healthy,tableCount,releasePresent,metrics:healthMetrics(),replicationReady:c.replicationMode==='gtid'&&r.replicationReady,
   lagSeconds:r.lagSeconds,snapshot,appStatus:svc('status',c.siteService||'mini-web').startsWith('run:')?'running':'stopped'};
}
