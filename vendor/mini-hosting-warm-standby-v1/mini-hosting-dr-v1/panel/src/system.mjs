import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {HOME,LOG_DIR,NGINX,NGINX_CONFIG,SERVICE_DIR,TERMUX,registry,SITES,readJson,saveRegistry,DATA} from './config.mjs';
import {serviceOK,slugOK,hostOK} from './security.mjs';
const exec=promisify(execFile);
export async function cmd(file,args=[],timeout=15000,maxBuffer=1024*1024){
 try{const {stdout,stderr}=await exec(file,args,{timeout,maxBuffer,encoding:'utf8',env:process.env});return {ok:true,out:stdout.trim(),err:stderr.trim()};}
 catch(e){return {ok:false,out:String(e.stdout||'').slice(-4000),err:String(e.stderr||e.message||'').slice(-4000)};}
}
export async function shellStatus(name){if(!serviceOK(name))throw Error('Service not allowed');return await cmd(path.join(TERMUX,'bin/sv'),['status',name]);}
export async function serviceAction(name,action){if(!serviceOK(name)||name==='amh-panel'||!['up','down','restart'].includes(action))throw Error('Invalid service or action');if(name==='mini-web'||name==='named-tunnel'||name==='nginx'||name==='mysqld') { if(action==='down')throw Error('Critical service cannot be stopped from panel'); }return await cmd(path.join(TERMUX,'bin/sv'),[action,name],25000);}
export function getLog(name){if(!serviceOK(name))throw Error('Service not allowed');const p=path.join(LOG_DIR,name,'current');try{const s=fs.readFileSync(p,'utf8');return s.slice(-16000);}catch(e){return `Chưa có log: ${e.code||e.message}`;}}
// Battery values are provided by the Android OS via Termux:API (no root).
// A timeout/failure must never break the hosting administration UI.
async function phoneBattery(){
 const r=await cmd(path.join(TERMUX,'bin','termux-battery-status'),[],8000,16*1024);
 if(!r.ok)return {available:false};
 try{
  const b=JSON.parse(r.out);
  const pct=Number(b.percentage),temp=Number(b.temperature);
  return {
   available:true,
   percentage:Number.isFinite(pct)&&pct>=0&&pct<=100?pct:null,
   temperature:Number.isFinite(temp)&&temp>=-20&&temp<=100?temp:null,
   status:typeof b.status==='string'?b.status.slice(0,32):null,
   plugged:typeof b.plugged==='string'?b.plugged.slice(0,32):null,
   health:typeof b.health==='string'?b.health.slice(0,32):null,
   sampledAt:new Date().toISOString()
  };
 }catch{return {available:false};}
}
export async function systemStats(){
 const cpuPct=await (async()=>{try{const sample=()=>fs.readFileSync('/proc/stat','utf8').split('\n')[0].trim().split(/\s+/).slice(1).map(Number);const a=sample();await new Promise(r=>setTimeout(r,150));const b=sample();const idle=(b[3]-a[3])+(b[4]-a[4]);const total=b.reduce((x,y)=>x+y,0)-a.reduce((x,y)=>x+y,0);return total>0?Math.round((1-idle/total)*100):null;}catch{return null;}})();
 const mem=(()=>{try{const t=fs.readFileSync('/proc/meminfo','utf8'),v=k=>Number(t.match(new RegExp(`^${k}:\\s+(\\d+)`,'m'))?.[1]||0)*1024;return {total:v('MemTotal'),available:v('MemAvailable')};}catch{return {total:os.totalmem(),available:os.freemem()};}})();
 const df=await cmd('df',['-k',HOME]);const lines=df.out.split('\n');const last=lines.at(-1)?.trim().split(/\s+/)||[];
 const total=Number(last.at(-5))*1024,used=Number(last.at(-4))*1024,available=Number(last.at(-3))*1024;
 const names=['nginx','mysqld','mini-web','named-tunnel','mini-tunnel','amh-panel'];const services={};
 await Promise.all(names.map(async n=>{if(n==='amh-panel'){services[n]={ok:true,out:'panel is responding'};}else services[n]=await shellStatus(n);}));
 const r=registry();await Promise.all(r.sites.filter(s=>s.type==='node').map(async s=>services['amh-site-'+s.slug]=await shellStatus('amh-site-'+s.slug)));
 const device=(await cmd('getprop',['ro.product.model'],1800,2048)).out.slice(0,80)||'Android Termux';
 return {battery:await phoneBattery(),cpuPct,device,time:new Date().toISOString(),uptime:os.uptime(),mem,disk:Number.isFinite(total)?{total,used,available}:null,platform:process.platform,arch:process.arch,node:process.version,services,nginxIntegrated:r.nginxIntegrated,sites:r.sites.length};
}
function nginxEscape(str){if(!/^[a-z0-9.-]+$/.test(str))throw Error('Unsafe nginx value');return str;}
function nginxConf(site){
 const host=nginxEscape(site.hostname);
 const common=`    listen 127.0.0.1:8080;\n    server_name ${host};\n    access_log ${TERMUX}/var/log/nginx/${site.slug}-access.log;\n`;
 if(site.type==='static')return `# Android Mini Hosting managed site: ${site.slug}\nserver {\n${common}    root ${SITES}/${site.slug}/public;\n    index index.html;\n    location / { try_files $uri $uri/ /index.html; }\n    location ~ /\\. { deny all; }\n}\n`;
 return `# Android Mini Hosting managed site: ${site.slug}\nserver {\n${common}    location / {\n        proxy_pass http://127.0.0.1:${site.port};\n        proxy_http_version 1.1;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;\n        proxy_set_header Upgrade $http_upgrade;\n        proxy_set_header Connection "upgrade";\n    }\n}\n`;
}
export async function nginxTest(){return await cmd(path.join(TERMUX,'bin/nginx'),['-t','-p',path.join(HOME,'.nginx'),' -c'.trim(),NGINX_CONFIG]);}
export async function reloadNginx(){const test=await nginxTest();if(!test.ok)throw Error('nginx -t failed: '+test.err);const r=await cmd(path.join(TERMUX,'bin/nginx'),['-s','reload','-p',path.join(HOME,'.nginx'),'-c',NGINX_CONFIG]);if(!r.ok)throw Error('nginx reload failed: '+r.err);return {test,reload:r};}
export async function regenerateNginx(sites){
 const old=new Map();const staged=[];
 for(const site of sites){if(!slugOK(site.slug)||!hostOK(site.hostname))throw Error('Invalid site');staged.push([path.join(NGINX,site.slug+'.conf'),nginxConf(site)]);}
 fs.mkdirSync(NGINX,{recursive:true});
 for(const f of fs.readdirSync(NGINX).filter(f=>f.endsWith('.conf'))){const file=path.join(NGINX,f);old.set(file,fs.readFileSync(file));}
 try{
  for(const f of old.keys())fs.rmSync(f);
  for(const [f,s] of staged)fs.writeFileSync(f,s,{mode:0o600});
  if(registry().nginxIntegrated)await reloadNginx();
 }catch(e){for(const [f] of staged)fs.rmSync(f,{force:true});for(const [f,b] of old)fs.writeFileSync(f,b);throw e;}
}
// Identify http{ } with a simple lexer that respects quotes, # comments and nested braces.
export function httpBlockClose(text){const match=/\bhttp\s*\{/g;const found=match.exec(text);if(!found)throw Error('http{} block missing');let depth=1,quote='',comment=false,escape=false;for(let i=found.index+found[0].length;i<text.length;i++){
 const c=text[i];if(comment){if(c==='\n')comment=false;continue;}
 if(quote){if(escape){escape=false;continue;}if(c==='\\'){escape=true;continue;}if(c===quote)quote='';continue;}
 if(c==='#'){comment=true;continue;}if(c==='"'||c==="'"){quote=c;continue;}if(c==='{')depth++;else if(c==='}'&&!--depth)return i;
 }throw Error('Nginx http block not closed');}
export async function integrateNginx(){
 const state=registry();if(state.nginxIntegrated)return {already:true};
 if(!fs.existsSync(NGINX_CONFIG))throw Error('Current .nginx/nginx.conf missing — do not overwrite');
 const original=fs.readFileSync(NGINX_CONFIG,'utf8'),line=`    include ${NGINX}/*.conf;`;
 if(original.includes(line))throw Error('Already includes managed sites; reconcile manually');
 const pos=httpBlockClose(original),modified=original.slice(0,pos)+line+'\n'+original.slice(pos);
 const backup=NGINX_CONFIG+'.amh-backup-'+new Date().toISOString().replace(/[:.]/g,'-');fs.copyFileSync(NGINX_CONFIG,backup);
 try{
  fs.writeFileSync(NGINX_CONFIG,modified);
  const test=await nginxTest();if(!test.ok)throw Error(test.err||test.out);
  const reload=await reloadNginx();state.nginxIntegrated=true;saveRegistry(state);return {ok:true,backup,reload};
 }catch(e){fs.copyFileSync(backup,NGINX_CONFIG);throw Error('Integration rolled back: '+e.message);}
}
export async function createService(site){
 if(site.type!=='node')return;
 const dir=path.join(SERVICE_DIR,'amh-site-'+site.slug);fs.mkdirSync(path.join(dir,'log'),{recursive:true});
 const run=`#!/data/data/com.termux/files/usr/bin/sh\ncd ${SITES}/${site.slug}/app\nexport PORT=${site.port}\nexec ${process.execPath} ${site.entry||'server.js'} 2>&1\n`;
 fs.writeFileSync(path.join(dir,'run'),run,{mode:0o700});fs.chmodSync(path.join(dir,'run'),0o700);
 const link=path.join(dir,'log/run');try{fs.symlinkSync(path.join(TERMUX,'share/termux-services/svlogger'),link);}catch(e){if(e.code!=='EEXIST')throw e;}
 return await cmd(path.join(TERMUX,'bin/sv-enable'),['amh-site-'+site.slug]);
}
export async function removeService(site){if(site.type!=='node')return;const n='amh-site-'+site.slug;await cmd(path.join(TERMUX,'bin/sv-disable'),[n]);await cmd(path.join(TERMUX,'bin/sv'),['down',n]);const folder=path.join(SERVICE_DIR,n);if(fs.existsSync(folder))fs.rmSync(folder,{recursive:true,force:true});}
