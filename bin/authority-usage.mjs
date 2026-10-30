// Local bounded counters only. No network, credentials, payloads, nonces or billing authority.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';
const allowed=new Set('status heartbeat history invite join begin abort route route-resume complete p32-status p32-route p32-resume p32-confirm p32-rollback p33-begin p33-fenced p33-active p33-route p33-confirm p33-renew p33-control p33-cancel p33-refence n1-provision n1-publish n1-control-proof site-start site-poll site-result site-upload site-download site-call site-job site-progress site-sync'.split(' '));
const kinds=new Set(['success','quota','rateLimit','auth','timeout','network','server','rejected']),day=now=>new Date(now).toISOString().slice(0,10);
const root=home=>path.join(home,'.local/state/mhc-cf-usage');
let counts={schema:1,days:{}},lastFlush=0,file=null;
export function recordAuthorityAttempt(action,kind='success',now=Date.now()){
 if(!allowed.has(action)||!kinds.has(kind))return;
 try{
  const key=day(now),r=counts.days[key]||={attempts:0,byAction:{},outcomes:{}};
  r.attempts++;r.byAction[action]=(r.byAction[action]||0)+1;r.outcomes[kind]=(r.outcomes[kind]||0)+1;counts.updatedAt=now;
  for(const old of Object.keys(counts.days).sort().slice(0,-2))delete counts.days[old];
  if(now-lastFlush<60000)return;
  const dir=root(process.env.HOME||os.homedir());fs.mkdirSync(dir,{recursive:true,mode:0o700});
  if(fs.lstatSync(dir).isSymbolicLink())return;
  if(!file&&fs.readdirSync(dir).filter(v=>/^process-[0-9]+-[a-f0-9]{8}\.json$/.test(v)).length>=512)return;
  file ||= path.join(dir,'process-'+process.pid+'-'+crypto.randomBytes(4).toString('hex')+'.json');
  const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(counts),{mode:0o600});fs.renameSync(temp,file);lastFlush=now;
 }catch{/* instrumentation must never block a safety request */}
}
export function collectAuthorityUsage(home=process.env.HOME||os.homedir(),now=Date.now()){
 const out={schema:1,day:day(now),attempts:0,byAction:{},outcomes:{},updatedAt:now,source:'LOCAL_ATTEMPTS_ESTIMATED',incomplete:false},dir=root(home);
 try{
  if(fs.lstatSync(dir).isSymbolicLink())return {...out,incomplete:true};
  const files=fs.readdirSync(dir).filter(f=>/^process-[0-9]+-[a-f0-9]{8}\.json$/.test(f));out.incomplete=files.length>=512;
  for(const name of files.slice(0,512)){
   const file=path.join(dir,name),st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>32768){out.incomplete=true;continue;}
   const value=JSON.parse(fs.readFileSync(file)),r=value.schema===1&&value.days?.[out.day];if(!r)continue;
   if(!Number.isSafeInteger(r.attempts)||r.attempts<0||r.attempts>1e9){out.incomplete=true;continue;}
   out.attempts+=r.attempts;
   for(const [k,v]of Object.entries(r.byAction||{}))if(allowed.has(k)&&Number.isSafeInteger(v)&&v>=0&&v<=r.attempts)out.byAction[k]=(out.byAction[k]||0)+v;
   for(const [k,v]of Object.entries(r.outcomes||{}))if(kinds.has(k)&&Number.isSafeInteger(v)&&v>=0&&v<=r.attempts)out.outcomes[k]=(out.outcomes[k]||0)+v;
  }
 }catch(e){if(e.code!=='ENOENT')out.incomplete=true;}
 return out;
}
export function readMetricsSnapshot(home=process.env.HOME||os.homedir()){
 try{const dir=root(home),file=path.join(dir,'cloudflare-metrics.json');if(fs.lstatSync(dir).isSymbolicLink())return null;const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>32768)return null;const v=JSON.parse(fs.readFileSync(file));
 const number=x=>Number.isSafeInteger(x)&&x>=0?x:null;if(v.status!=='MEASURED'||!/^\d{4}-\d\d-\d\dT/.test(v.period?.start||'')||!/^\d{4}-\d\d-\d\dT/.test(v.period?.end||''))return null;
 return {source:'MEASURED_SNAPSHOT',period:{start:v.period.start.slice(0,20),end:v.period.end.slice(0,20)},workers:{mhc:number(v.workers?.mhc),account:number(v.workers?.account),otherScripts:number(v.workers?.otherScripts)},durableObjects:{mhc:number(v.durableObjects?.mhc),account:number(v.durableObjects?.account)},plan:'UNAVAILABLE',duration:'UNAVAILABLE',sqliteRows:'UNAVAILABLE'};
 }catch{return null;}
}
export function requestForecast(nodes,{active=1,bytes=23172996,syncPerDay=0,visits=0,panelHours=0}={}){
 const n1=Math.max(0,nodes-2),base=6480*nodes+1920*n1,writer=89760*active,chunks=2*Math.ceil(bytes/196608)*syncPerDay,extras=32*syncPerDay+Math.ceil(panelHours*3600/20)+visits,workerHttp=base+writer+chunks+extras;
 return {nodes,n1,active,source:'ESTIMATED',workerHttp,workerConservative:workerHttp+1440,durableObjects:workerHttp+1440,components:{heartbeat:2880*nodes,idleJobPoll:1440*nodes,siteHealth:2160*nodes,n1Provision:1920*n1,writer,chunks,extras,cron:1440},assumptions:'24h healthy zero-latency cadence; two legacy nodes; one managed site; mutations/other account users extra'};
}
export function budgetLevel(requests){return requests>=90000?'Critical':requests>=50000?'High':requests>=40000?'Warning':'Normal';}
export function safeUsage(value){
 if(value?.schema!==1||!/^\d{4}-\d\d-\d\d$/.test(value.day||'')||!Number.isSafeInteger(value.attempts)||value.attempts<0||value.attempts>1e9)return null;
 const clean=(obj,keys)=>Object.fromEntries(Object.entries(obj||{}).filter(([k,v])=>keys.has(k)&&Number.isSafeInteger(v)&&v>=0&&v<=value.attempts));
 return {schema:1,day:value.day,attempts:value.attempts,byAction:clean(value.byAction,allowed),outcomes:clean(value.outcomes,kinds),updatedAt:Number.isSafeInteger(value.updatedAt)?value.updatedAt:null,incomplete:value.incomplete===true};
}
export function usageSummary(shared,local=null,metrics=null){
 const records=(shared?.nodes||[]).map(n=>safeUsage(n.telemetry?.cloudflareUsage)).filter(v=>v?.day===day(Date.now()));
 const attempts=records.reduce((n,r)=>n+r.attempts,0),actions={};for(const r of records)for(const [k,v]of Object.entries(r.byAction||{}))actions[k]=(actions[k]||0)+v;
 const forecasts=[3,5,10].map(n=>requestForecast(n,{active:1,syncPerDay:24,visits:1000,panelHours:8}));
 return {source:'ESTIMATED',day:day(Date.now()),workerAttempts:attempts,doRequests:{source:'ESTIMATED_UPPER_BOUND',max:attempts,min:0},reportedNodes:records.length,totalNodes:shared?.nodes?.length||0,incomplete:records.length!==(shared?.nodes?.length||0)||records.some(v=>v.incomplete),local,metrics:metrics||{source:'UNAVAILABLE'},forecasts,largest:Object.entries(actions).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([action,attempts])=>({action,attempts})),level:budgetLevel(Math.max(attempts,requestForecast(Math.max(1,shared?.nodes?.length||3),{active:shared?.writeLeaseGranted?1:0}).durableObjects)),notice:'Local attempts may never reach Cloudflare; counters lag up to60s and are not billing. Forecast is one-site workload; current Free plan/duration/rows need verification. Safety requests are never throttled by this display.'};
}
