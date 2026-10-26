// MHC TEST 0.5.0C-WRITER-AUDIT: sanitized READ-ONLY local device/service observations.
// Never reads application .env, DB credentials, SSH tokens, or HA lease.
import os from 'node:os';
import path from 'node:path';
import {promises as fs} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const HOME=process.env.HOME||os.homedir();
const CONFIG=path.join(HOME,'.config/mhc-full-installer');
const BACKUPS=path.join(HOME,'hosting-backups/mhc-full');
const services=[
  ['mhc-full-wp-nginx','Nginx (MHC)'],['mhc-full-wp-php','PHP-FPM'],
  ['mysqld','MariaDB'],['amh-panel','Hosting Panel 9090'],
  ['mhc-full-panel','MHC Dashboard'],['mhc-full-daily-backup','Daily backup'],
  ['mhc-full-heartbeat','Node heartbeat'],['nginx','Nginx (legacy)'],
  ['mini-web','Thờ Phượng Pro (legacy)'],['named-tunnel','Cloudflare Tunnel']
];
const allowedVersion=/^[\w.+ -]{1,90}$/;
const number=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max?n:null;
const text=(v,max=70)=>typeof v==='string'?v.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,max):null;
async function command(file,args=[],timeout=1200){
  try{const x=await exec(file,args,{timeout,maxBuffer:8192,env:{...process.env,LC_ALL:'C'}});return x.stdout.trim();}
  catch(e){return typeof e.stdout==='string'?e.stdout.trim():null;}
}
async function version(file,args,extract){
  const s=await command(file,args,1500);
  if(!s)return null;
  const candidate=extract(s);return allowedVersion.test(candidate||'')?candidate:null;
}
async function read(p,max=10000){try{const st=await fs.lstat(p);if(!st.isFile()||st.isSymbolicLink()||st.size>max)return null;return await fs.readFile(p,'utf8');}catch{return null;}}
async function checkService(name,label){
  const raw=await command('sv',['status',name],900);
  // sv can exit nonzero for down, still provides output.
  const match=raw?.match(/^(run|down|fail):\s/);
  const state=match?.[1]==='run'?'running':match?.[1]==='down'?'stopped':'unknown';
  return {name,label,state};
}
async function device(){
  const model=await command('getprop',['ro.product.model'],900);
  return {model:text(model)||'Unknown Android / Linux device',architecture:os.arch(),uptimeSec:number(os.uptime(),0,1e10)};
}
async function battery(){
  const data=await command('termux-battery-status',[],2200);
  if(!data||data.length>4096)return {available:false,reason:'Termux:API unavailable or permission denied'};
  try{const v=JSON.parse(data),pct=number(v.percentage,0,100),temp=number(v.temperature,-20,95);
    if(pct===null&&temp===null)return {available:false,reason:'Battery information unavailable'};
    return {available:true,percentage:pct,temperatureC:temp,charging:['CHARGING','FULL'].includes(v.status)||String(v.plugged||'').startsWith('PLUGGED_'),status:text(v.status,35)||'UNKNOWN'};
  }catch{return {available:false,reason:'Termux:API returned invalid data'};}
}
async function wifi(){
  const raw=await command('termux-wifi-connectioninfo',[],1700);
  if(!raw||raw.length>4096)return {available:false};
  try{const w=JSON.parse(raw);
    // Deliberately exclude SSID, BSSID, local IP/MAC, connected network identity.
    const rssi=number(w.rssi,-140,0),linkMbps=number(w.link_speed_mbps??w.link_speed,0,100000),frequencyMhz=number(w.frequency_mhz??w.frequency,200,8000);
    if(rssi===null&&linkMbps===null)return {available:false};
    return {available:true,rssiDbm:rssi,linkMbps,frequencyMhz};
  }catch{return {available:false};}
}
async function networkCounters(){
  const raw=await read('/proc/net/dev',16384);if(!raw)return null;
  let receiveBytes=0,transmitBytes=0,found=false;
  for(const line of raw.split('\n')){
    const m=line.match(/^\s*([a-zA-Z0-9_.-]+):\s*([\d\s]+)$/);
    if(!m||m[1]==='lo')continue;
    const numbers=m[2].trim().split(/\s+/).map(Number);
    if(numbers.length<16||numbers.some(n=>!Number.isFinite(n)))continue;
    receiveBytes+=numbers[0];transmitBytes+=numbers[8];found=true;
  }
  return found?{receiveBytes,transmitBytes}:null;
}
let priorNetwork=null;
async function network(){
  const [w,c]=await Promise.all([wifi(),networkCounters()]);
  let rxKiBs=null,txKiBs=null;
  const now=Date.now();
  if(c&&priorNetwork&&now>priorNetwork.time){
    const dt=(now-priorNetwork.time)/1000;
    const rx=c.receiveBytes-priorNetwork.receiveBytes,tx=c.transmitBytes-priorNetwork.transmitBytes;
    if(rx>=0&&tx>=0&&dt>0.5){rxKiBs=number(Math.round(rx/dt/1024),0,1e10);txKiBs=number(Math.round(tx/dt/1024),0,1e10);}
  }
  if(c)priorNetwork={...c,time:now};
  return {wifi:w,rxKiBs,txKiBs,scope:'Device interface totals, not per-site usage; unavailable if Android restricts /proc/net/dev'};
}
function mem(){
  const total=os.totalmem(),free=os.freemem();
  return {totalMiB:number(Math.round(total/1048576),1,1e9),freeMiB:number(Math.round(free/1048576),0,1e9),usedPct:total>0?number(Math.round(100*(total-free)/total),0,100):null,scope:'device (Android memory may include OS caches)'};
}
async function disk(){
  const result=await command('df',['-Pk',HOME],1400);const line=result?.trim().split('\n').at(-1)||'';
  const fields=line.trim().split(/\s+/),totalKiB=Number(fields.at(-5)),usedKiB=Number(fields.at(-4)),availableKiB=Number(fields.at(-3));
  if(!Number.isFinite(totalKiB)||!Number.isFinite(usedKiB)||!Number.isFinite(availableKiB)||totalKiB<=0)return {available:false};
  return {available:true,totalGiB:Math.round(totalKiB/1048576*10)/10,freeGiB:Math.round(availableKiB/1048576*10)/10,usedPct:number(Math.round(usedKiB/totalKiB*100),0,100)};
}
let priorCpu=null;
async function cpu(){
  const value=await read('/proc/stat',4096);const m=value?.match(/^cpu\s+([\d\s]+)/m);
  if(!m)return {usagePct:null,reason:'Android does not expose /proc/stat'};
  const ns=m[1].trim().split(/\s+/).map(Number);
  if(ns.length<4||ns.some(n=>!Number.isFinite(n)))return {usagePct:null,reason:'Invalid CPU counters'};
  const total=ns.reduce((a,b)=>a+b,0),idle=ns[3]+(ns[4]||0);
  let usagePct=null;
  if(priorCpu){const delta=total-priorCpu.total,deltaIdle=idle-priorCpu.idle;
    if(delta>0&&deltaIdle>=0&&deltaIdle<=delta)usagePct=number(Math.round(100*(delta-deltaIdle)/delta),0,100);
  }
  priorCpu={total,idle};
  return {usagePct,reason:usagePct===null?'Waiting for next sample / counters unavailable':null};
}
async function websiteCounts(){
  const count=async(folder,ext)=>{try{const entries=await fs.readdir(path.join(CONFIG,folder),{withFileTypes:true});return entries.filter(e=>e.isFile()&&e.name.endsWith(ext)&&/^[a-z][a-z0-9-]{1,30}$/.test(e.name.slice(0,-ext.length))).length;}catch{return 0;}};
  return {static:await count('static','.conf'),wordpress:await count('sites','.env')};
}
async function backup(){
  const p=await read(path.join(BACKUPS,'latest-success-path'),4096);
  return {recorded:!!p,integrityVerifiedNow:false,description:p?'Snapshot marker exists; run backup verify':'No completed snapshot marker'};
}
async function moduleVersions(){
  const [node,php,nginx,mariadb,wp,python]=await Promise.all([
    version('node',['--version'],s=>s.split('\n')[0]),
    version('php',['-r','echo PHP_VERSION;'],s=>s.split('\n')[0]),
    version('nginx',['-v'],s=>s.match(/nginx\/([\w.]+)/)?.[1]),
    version('mariadb',['--version'],s=>s.match(/Distrib\s+([\w.]+)/)?.[1]),
    version('wp',['--version'],s=>s.match(/WP-CLI\s+([\w.]+)/)?.[1]),
    version('python3',['--version'],s=>s.match(/Python\s+([\w.]+)/)?.[1])
  ]);
  // nginx -v writes to stderr. A null version means unknown, not uninstalled.
  const extensions=(await command('php',['-m'],1500))||'';
  const moduleSet=new Set(extensions.split(/\r?\n/).map(s=>s.trim().toLowerCase()));
  return {node,php,nginx,mariadb,wpCli:wp,python,phpExtensions:Object.fromEntries(['curl','dom','gd','intl','mbstring','mysqli','openssl','zip','opcache'].map(x=>[x,moduleSet.has(x)]))};
}
export async function observeServer(){
  // bounded read-only observations. Values should not be interpreted as a security or HA attestation.
  const [dev,cpuInfo,memory,storage,power,networkInfo,states,modules,websites,lastBackup]=await Promise.all([
    device(),cpu(),Promise.resolve(mem()),disk(),battery(),network(),Promise.all(services.map(([name,label])=>checkService(name,label))),moduleVersions(),websiteCounts(),backup()
  ]);
  return {schema:1,release:'TEST 0.5.0C-WRITER-AUDIT',observedAt:new Date().toISOString(),source:'local read-only observation (not HA attestation)',device:dev,cpu:cpuInfo,memory,disk:storage,battery:power,network:networkInfo,services:states,modules,websites,backup:lastBackup,ha:{eligible:false,writerLeaseVerified:false,gtidVerified:false,cloudflareRouteVerified:false}};
}
