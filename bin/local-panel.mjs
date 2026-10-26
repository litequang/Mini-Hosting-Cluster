#!/usr/bin/env node
// MHC Full TEST 0.5.0C-WRITER-AUDIT — unified local server dashboard (LAB only).
// Not an HA control plane, never accepts connections on 0.0.0.0.
import http from 'node:http';
import {promises as fs, constants as fsConstants} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {buildClusterSummary} from './cluster-summary.mjs';
import {observeServer} from './server-observe.mjs';
import {PANEL_CSS} from './panel-theme.mjs';
const runFile = promisify(execFile);
const HOME = process.env.HOME || os.homedir();
const BASE = path.join(HOME,'.local/share/mhc-full-installer');
const CONFIG = path.join(HOME,'.config/mhc-full-installer');
const ROOT = path.join(HOME,'websites');
const TOKENFILE = path.join(CONFIG,'panel-admin-token');
const LOCKROOT=path.join(HOME,'hosting-backups/mhc-full');
const OPLOCK=path.join(LOCKROOT,'.site-operation-lock');
const BACKUPLOCK=path.join(LOCKROOT,'.backup-lock');
const CMD=path.join(BASE,'bin/sites.sh');
const TEST_PORT=Number(process.env.MHC_PANEL_TEST_PORT);
const PORT = process.env.MHC_PANEL_TEST==='1' && Number.isInteger(TEST_PORT) && TEST_PORT>=1024 && TEST_PORT<=65535 ? TEST_PORT : 19090;
const SLUG=/^[a-z][a-z0-9-]{1,30}$/;
const SAFEFILE=/^[a-zA-Z0-9_-][a-zA-Z0-9_. -]{0,120}$/;
const SAFE_EXT=new Set(['.html','.htm','.css','.js','.mjs','.json','.txt','.md','.svg','.xml','.webmanifest','.ico','.png','.jpg','.jpeg','.gif','.webp','.avif','.woff','.woff2','.ttf','.map','.pdf']);
const MAX_TEXT=262144, MAX_BINARY=8*1024*1024, MAX_ZIP=20*1024*1024;
const sessions=new Map(), failed=new Map();
const htmlEscape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const enc=encodeURIComponent;
const RELEASE='TEST 0.5.0C-WRITER-AUDIT';
// Only local, GET-able pages are legal post-login destinations. This prevents
// untrusted query strings from creating an open redirect or a POST replay.
const RETURN_PAGES=new Set(['/','/sites','/nodes','/cluster','/modules','/monitor','/backups']);
function loginDestination(input){
  if(typeof input!=='string'||input.length>512||input.includes('\\')||/[\u0000-\u001f\u007f]/.test(input))return '/';
  return RETURN_PAGES.has(input)?input:'/';
}
function loginForm(next='/',message=''){
  const safe=loginDestination(next);
  const warning=message?`<p role="alert" class="error">${htmlEscape(message)}</p>`:'';
  return `${warning}<form method="POST" action="/login"><input type="hidden" name="next" value="${htmlEscape(safe)}"><label>Admin token <input name="token" type="password" autocomplete="off" required autofocus></label><button type="submit">Sign in</button></form><p>Find the token on the phone with <code>~/mhc-full panel token</code>. Do not send it through chat.</p>`;
}
class HttpError extends Error {constructor(status,msg){super(msg);this.status=status;}}
const reject=(status,msg)=>{throw new HttpError(status,msg);};
const exists=async p=>{try{return await fs.lstat(p)}catch(e){if(e.code==='ENOENT')return null;throw e;}};
async function ensureToken(){
  await fs.mkdir(CONFIG,{recursive:true,mode:0o700});
  const st=await exists(TOKENFILE);
  if(st){if(!st.isFile()||st.isSymbolicLink()||(st.mode & 0o077))reject(500,'Panel token must be a regular 0600 file');return;}
  const fh=await fs.open(TOKENFILE,'wx',0o600);
  try{await fh.writeFile(crypto.randomBytes(32).toString('hex')+'\n');}finally{await fh.close();}
}
async function secret(){const s=(await fs.readFile(TOKENFILE,'utf8')).trim();if(!/^[0-9a-f]{64}$/.test(s))reject(500,'Invalid panel token');return s;}
function sameToken(a,b){const x=crypto.createHash('sha256').update(a).digest();const y=crypto.createHash('sha256').update(b).digest();return crypto.timingSafeEqual(x,y);}
function headers(res,contentType='text/html; charset=utf-8',nonce=''){
  res.setHeader('Content-Type',contentType);
  res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',`default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`);
}
function send(res,status,body,kind='text/html; charset=utf-8',nonce=''){
  headers(res,kind,nonce);res.writeHead(status);res.end(body);
}
function page(res,title,body,session=null,status=200,script='',active=''){
  const nonce=crypto.randomBytes(16).toString('base64');
  const signout=session?`<form method="POST" action="/logout"><input type="hidden" name="csrf" value="${session.csrf}"><button>Sign out</button></form>`:'';
  const links=[['/','Tổng quan'],['/monitor','Monitor'],['/modules','Modules'],['/sites','Websites'],['/backups','Backup'],['/cluster','Cluster'],['/nodes','Nodes']];
  const nav=session?links.map(([href,label])=>`<a href="${href}" class="${active===href?'active':''}">${label}</a>`).join(''):'<a href="/login">Sign in</a>';
  const footer=`<div class="sidefoot"><span class="safe-dot"></span>Loopback / SSH only<br>No public access · HA locked<br><small>Không thay thế Panel 9090</small></div>`;
  const markup=`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(title)} · MHC</title><style>${PANEL_CSS}</style></head><body><div class="shell"><aside class="sidebar"><div class="brand"><div class="brandmark">⌘</div><div><strong>MHC Server</strong><small>${RELEASE} · LAB</small></div></div><nav class="nav" aria-label="Quản trị">${nav}</nav>${footer}</aside><div class="content"><header class="topline"><span class="minor">SERVER MANAGER <span class="pill good">LOCAL ONLY</span></span>${signout}</header><main><p class="eyebrow">MHC Hosting Cluster</p><h1 class="heading">${htmlEscape(title)}</h1>${body}</main></div></div><script nonce="${nonce}">${script}</script></body></html>`;
  send(res,status,markup,'text/html; charset=utf-8',nonce);
}
function getSession(req){
  const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('mhc_session='));
  const id=cookie?.slice('mhc_session='.length);
  if(!id||!/^[0-9a-f]{64}$/.test(id))return null;
  const session=sessions.get(id);if(!session)return null;
  if(session.exp<Date.now()){sessions.delete(id);return null;}
  session.exp=Date.now()+30*60*1000;return session;
}
function requireSession(req){const session=getSession(req);if(!session)reject(401,'Login required');return session;}
function requireCsrf(req,token,session){
  const origin=req.headers.origin;
  if(origin&&![`http://localhost:${PORT}`,`http://127.0.0.1:${PORT}`].includes(origin))reject(403,'Invalid Origin');
  if(!token||!sameToken(token,session.csrf))reject(403,'CSRF validation failed');
}
async function body(req,max){
  const length=Number(req.headers['content-length']||0);if(Number.isFinite(length)&&length>max)reject(413,'Request too large');
  let size=0;const chunks=[];
  for await (const chunk of req){size+=chunk.length;if(size>max)reject(413,'Request too large');chunks.push(chunk);}
  return Buffer.concat(chunks,size);
}
async function form(req,max=300000){
  if(!(req.headers['content-type']||'').startsWith('application/x-www-form-urlencoded'))reject(415,'Expected form');
  return new URLSearchParams((await body(req,max)).toString('utf8'));
}
async function known(slug){
  if(!SLUG.test(slug||''))reject(400,'Invalid site slug');
  const cfg=path.join(CONFIG,'static',slug+'.conf');
  const cf=await exists(cfg);if(!cf||!cf.isFile()||cf.isSymbolicLink())reject(404,'Not a managed static site');
  const root=path.join(ROOT,slug);const st=await exists(root);
  if(!st||!st.isDirectory()||st.isSymbolicLink())reject(409,'Static site root missing or unsafe');
  const index=await exists(path.join(root,'index.html'));
  if(!index||!index.isFile()||index.isSymbolicLink())reject(409,'Static index missing or unsafe');
  return root;
}
async function sites(){
  const p=path.join(CONFIG,'static');let files=[];try{files=await fs.readdir(p)}catch(e){if(e.code!=='ENOENT')throw e;}
  return files.filter(f=>f.endsWith('.conf')&&SLUG.test(f.slice(0,-5))).map(f=>f.slice(0,-5)).sort();
}
function safeSegments(input,allowEmpty=false){
  if(typeof input!=='string'||input.includes('\\')||input.includes('\0')||input.startsWith('/')||input.length>500)reject(400,'Invalid relative path');
  if(input===''&&allowEmpty)return [];
  const segments=input.split('/');
  if(!segments.length||segments.some(p=>p==='.'||p==='..'||p.startsWith('.')||!SAFEFILE.test(p)||p.endsWith('.')))reject(400,'Unsafe file path');
  return segments;
}
async function inside(root,relative,mode='file'){
  const pieces=safeSegments(relative,mode==='directory');
  let cur=root;
  for(let i=0;i<pieces.length;i++){
    cur=path.join(cur,pieces[i]);const st=await exists(cur);
    if(st?.isSymbolicLink())reject(403,'Symlinks not allowed');
    if(i<pieces.length-1&&(!st||!st.isDirectory()))reject(404,'Parent directory missing');
    if(i===pieces.length-1&&st&&!st.isFile()&&!st.isDirectory())reject(403,'Unsupported file type');
  }
  if(mode==='file'){
    const ext=path.extname(pieces.at(-1)||'').toLowerCase();
    if(!SAFE_EXT.has(ext))reject(400,'Extension not allowed for static site file');
  }
  const parent=mode==='directory'?cur:path.dirname(cur);
  const real=await fs.realpath(parent).catch(()=>null);
  if(!real||(real!==root&&!real.startsWith(root+path.sep)))reject(403,'File outside site root');
  return cur;
}
async function withOpLock(work){
  await fs.mkdir(LOCKROOT,{recursive:true,mode:0o700});
  try{await fs.mkdir(OPLOCK)}catch(e){if(e.code==='EEXIST')reject(409,'A backup or site update is already running');throw e;}
  try{if(await exists(BACKUPLOCK))reject(409,'Backup running');return await work();}finally{await fs.rmdir(OPLOCK).catch(()=>{});}
}
async function writeStatic(root,relative,data){
  const filename=await inside(root,relative);const previous=await exists(filename);
  if(previous&& !previous.isFile())reject(409,'Target must be a regular file');
  if(relative==='index.html'&&data.length===0)reject(400,'Cannot empty site index');
  await withOpLock(async()=>{
    await inside(root,relative); // re-evaluate after lock
    const temp=path.join(path.dirname(filename),'.mhc-tmp-'+crypto.randomBytes(12).toString('hex'));
    try{
      await fs.writeFile(temp,data,{flag:'wx',mode:0o600});
      if(previous){
        const hist=path.join(BASE,'file-history',path.basename(root),Date.now()+'-'+crypto.randomBytes(5).toString('hex'));
        await fs.mkdir(hist,{recursive:true,mode:0o700});
        await fs.copyFile(filename,path.join(hist,'previous-file'));
        await fs.writeFile(path.join(hist,'path.txt'),relative+'\n',{mode:0o600});
      }
      await fs.rename(temp,filename);
    }finally{await fs.rm(temp,{force:true}).catch(()=>{});}
  });
}
async function fileListing(root,dir){
  const p=await inside(root,dir,'directory');const st=await fs.lstat(p);
  if(!st.isDirectory()||st.isSymbolicLink())reject(400,'Not a directory');
  const arr=await fs.readdir(p,{withFileTypes:true});return arr.filter(ent=>!ent.name.startsWith('.')).sort((a,b)=>a.name.localeCompare(b.name));
}
async function callSites(...args){
  try{return await runFile('bash',[CMD,...args],{env:{...process.env,HOME},timeout:120000,maxBuffer:1024*1024});}
  catch(e){reject(422,String(e.stderr||e.message).slice(0,1400));}
}
function navFiles(site,relative=''){return `/files?site=${enc(site)}&dir=${enc(relative)}`;}
const safeValue=v=>v===null||v===undefined?'—':String(v);
const pct=v=>Number.isFinite(v)?Math.max(0,Math.min(100,v)):0;
function serviceLabel(value){const c=value==='running'?'good':value==='stopped'?'warn':'neutral';return `<span class="pill ${c}">${htmlEscape(value)}</span>`;}
function progress(value){return `<div class="progress"><span style="width:${pct(value)}%"></span></div>`;}
function detailLine(label,value){return `<div class="metricline"><span>${htmlEscape(label)}</span><strong>${htmlEscape(safeValue(value))}</strong></div>`;}
const autoScript=String.raw`
const update=(key,text)=>{document.querySelectorAll('[data-observe="'+key+'"]').forEach(n=>n.textContent=text)};
const bar=(key,pct)=>{document.querySelectorAll('[data-bar="'+key+'"]').forEach(n=>n.style.width=(Number.isFinite(pct)?Math.max(0,Math.min(100,pct)):0)+'%')};
const history=[];
async function poll(){try{const r=await fetch('/api/system-observe',{cache:'no-store'});if(!r.ok)throw Error('session');const x=await r.json();
 const str=v=>v===null||v===undefined?'—':String(v);
 update('sample',new Date(x.observedAt).toLocaleTimeString());update('cpu',x.cpu.usagePct===null?'—':x.cpu.usagePct+'%');
 update('ram',x.memory.usedPct===null?'—':x.memory.usedPct+'%');
 update('disk',x.disk.available?x.disk.freeGiB+' GiB':'—');
 update('battery',x.battery.available&&x.battery.percentage!==null?x.battery.percentage+'%':'—');
 update('battery-temp',x.battery.available&&x.battery.temperatureC!==null?x.battery.temperatureC+' °C':'—');
 update('wifi',x.network?.wifi?.available?(x.network.wifi.linkMbps===null?'Wi-Fi đo được':x.network.wifi.linkMbps+' Mbps'):'—');
 update('network-rx',x.network?.rxKiBs===null?'—':x.network.rxKiBs+' KiB/s');
 update('network-tx',x.network?.txKiBs===null?'—':x.network.txKiBs+' KiB/s');
 bar('ram',x.memory.usedPct);bar('cpu',x.cpu.usagePct);bar('disk',x.disk.usedPct);
 for(const s of x.services){document.querySelectorAll('[data-service="'+s.name+'"]').forEach(n=>{n.textContent=s.state;n.className='pill '+(s.state==='running'?'good':s.state==='stopped'?'warn':'neutral')})}
 if(x.cpu.usagePct!==null){history.push(x.cpu.usagePct);if(history.length>40)history.shift();const graph=document.getElementById('cpu-history');if(graph){graph.replaceChildren();for(const value of history){const b=document.createElement('span');b.style.height=Math.max(4,value)+'%';graph.append(b)}}}
 }catch{update('sample','Không truy cập được / phiên đã hết hạn')}}
if(document.querySelector('[data-observe]')){setInterval(poll,15000);}
`;
function statCard(label,key,value,foot,percentage=null){return `<div class="card"><div class="stat-label">${htmlEscape(label)}</div><div class="stat-value" data-observe="${key}">${htmlEscape(safeValue(value))}</div>${percentage===null?'':`<div class="progress"><span data-bar="${key}" style="width:${pct(percentage)}%"></span></div>`}<div class="stat-foot">${htmlEscape(foot)}</div></div>`;}
async function viewHome(req,res,session){
 const [obs,summary]=await Promise.all([observeServer(),Promise.resolve(buildClusterSummary(HOME))]);
 const services=obs.services.filter(s=>['mhc-full-wp-nginx','mhc-full-wp-php','mysqld','mhc-full-panel','amh-panel','mhc-full-daily-backup'].includes(s.name));
 const rows=services.map(s=>`<div class="metricline"><span>${htmlEscape(s.label)}</span><span data-service="${htmlEscape(s.name)}" class="pill ${s.state==='running'?'good':s.state==='stopped'?'warn':'neutral'}">${htmlEscape(s.state)}</span></div>`).join('');
 const modules=`PHP ${obs.modules.php||'chưa xác minh'} · Node ${obs.modules.node||'—'} · MariaDB ${obs.modules.mariadb||'—'}`;
 const metrics=`<p class="lead">${htmlEscape(obs.device.model)} · Dữ liệu đọc trực tiếp tại node LAB · cập nhật ~15 giây, không phải giám sát HA</p><div class="grid stats">
 ${statCard('CPU · sử dụng','cpu',obs.cpu.usagePct===null?'—':obs.cpu.usagePct+'%',obs.cpu.usagePct===null?'Thiết bị chưa cung cấp số liệu':'Đo từ /proc/stat',obs.cpu.usagePct)}
 ${statCard('RAM · đã dùng','ram',safeValue(obs.memory.usedPct)+'%',obs.memory.totalMiB===null?'Chưa đọc được RAM':`${obs.memory.totalMiB} MiB toàn thiết bị`,obs.memory.usedPct)}
 ${statCard('Dung lượng trống','disk',obs.disk.available?`${obs.disk.freeGiB} GiB`:'—',obs.disk.available?`${obs.disk.totalGiB} GiB tổng bộ nhớ`:'Chưa đọc được',obs.disk.available?obs.disk.usedPct:null)}
 ${statCard('Pin Vsmart','battery',obs.battery.available?safeValue(obs.battery.percentage)+'%':'—',obs.battery.available?`Nhiệt độ pin ${safeValue(obs.battery.temperatureC)} °C`:'Termux:API chưa khả dụng')}
 </div>`;
 const html=`${metrics}<div class="grid twocol"><section class="card"><h3>Services · trạng thái quan sát</h3>${rows}<div class="quicklinks"><a href="/modules">Xem toàn bộ modules</a><a href="/monitor">Mở Monitor</a></div></section>
 <section class="card"><h3>Hosting & Cluster</h3>${detailLine('Website tĩnh',obs.websites.static)}${detailLine('WordPress đăng ký',obs.websites.wordpress)}${detailLine('Node đã ghép',summary.inventory.total)}${detailLine('Snapshot',obs.backup.recorded?'Có marker · chưa verify':'Chưa có')}
 <div class="cluster-gate" style="margin-top:14px">HA chưa đủ điều kiện · không cấp quyền Primary</div><div class="quicklinks"><a href="/sites">Quản lý Websites</a><a href="/cluster">Xem Cluster</a></div></section></div>
 <section class="card"><h3>Phiên bản thành phần</h3><p>${htmlEscape(modules)}</p><p class="small">Hiện thị phiên bản và trạng thái quan sát; PHP-FPM chạy không có nghĩa WordPress đã nghiệm thu HTTP/PHP.</p></section>
 <p class="small">Lấy mẫu lúc <span data-observe="sample">${htmlEscape(new Date(obs.observedAt).toLocaleTimeString())}</span>. Panel gốc cổng 9090 vẫn riêng và không bị chỉnh sửa.</p>
 <form method="POST" action="/create" class="card inlineform"><input type="hidden" name="csrf" value="${session.csrf}"><h3>Tạo nhanh website tĩnh</h3><label>Slug <input name="site" placeholder="landing" required pattern="[a-z][a-z0-9-]{1,30}"></label><button>Tạo site</button></form>`;
 page(res,'Tổng quan Server',html,session,200,autoScript,'/');
}
async function viewModules(req,res,session){
 const x=await observeServer();const a=x.modules;
 const versionRows=[['Node.js',a.node,'mhc-full / web apps'],['PHP',a.php,'PHP CLI'],['Nginx',a.nginx,'Phiên bản chưa đọc được có thể do nginx -v dùng stderr'],['MariaDB',a.mariadb,'Không xác nhận trạng thái DB chỉ từ phiên bản'],['WP-CLI',a.wpCli,'Nếu chưa cài, dùng quy trình cài WP-CLI'],['Python',a.python,'ZIP / restore tooling']];
 const versions=versionRows.map(([name,value,detail])=>`<tr><td><strong>${htmlEscape(name)}</strong><div class="small">${htmlEscape(detail)}</div></td><td>${value?htmlEscape(value):'<span class="pill neutral">Chưa phát hiện</span>'}</td></tr>`).join('');
 const sr=x.services.map(s=>`<tr><td>${htmlEscape(s.label)}</td><td><span data-service="${htmlEscape(s.name)}" class="pill ${s.state==='running'?'good':s.state==='stopped'?'warn':'neutral'}">${htmlEscape(s.state)}</span></td><td><code>${htmlEscape(s.name)}</code></td></tr>`).join('');
 const ext=Object.entries(a.phpExtensions).map(([name,enabled])=>`<span class="pill ${enabled?'good':'warn'}" style="margin:3px">${htmlEscape(name)} ${enabled?'✓':'—'}</span>`).join('');
 page(res,'Modules & Services',`<p class="lead">Các module cài đặt trên máy LAB, trạng thái runit đọc trực tiếp. Không cho bật/tắt dịch vụ qua web ở bản này.</p><div class="grid twocol"><section class="card"><h3>Phiên bản runtime</h3><div class="tablewrap"><table><tr><th>Module</th><th>Phiên bản quan sát</th></tr>${versions}</table></div></section><section class="card"><h3>PHP extensions</h3><p>${ext}</p><p class="small">Module PHP nhận diện qua <code>php -m</code>. Chưa có bảo đảm plugin WordPress tương thích PHP trên Android.</p></section></div><section class="card"><h3>Runit service inventory</h3><div class="tablewrap"><table><tr><th>Dịch vụ</th><th>Trạng thái</th><th>Tên runit</th></tr>${sr}</table></div></section><p class="small">Cập nhật trạng thái lúc <span data-observe="sample">${htmlEscape(new Date(x.observedAt).toLocaleTimeString())}</span>.</p>`,session,200,autoScript,'/modules');
}
async function viewMonitor(req,res,session){
 const x=await observeServer();
 const html=`<p class="lead">Theo dõi trực tiếp Vsmart / Termux (lấy mẫu ~15 giây). Tốc độ CPU chỉ hiện nếu Android cho đọc /proc/stat; nhiệt độ hiển thị là nhiệt độ pin, không phải CPU.</p><div class="grid stats">
 ${statCard('CPU usage','cpu',x.cpu.usagePct===null?'—':x.cpu.usagePct+'%','Có thể bị Android giới hạn',x.cpu.usagePct)}
 ${statCard('RAM usage','ram',safeValue(x.memory.usedPct)+'%',x.memory.totalMiB===null?'—':x.memory.totalMiB+' MiB',x.memory.usedPct)}
 ${statCard('Free storage','disk',x.disk.available?x.disk.freeGiB+' GiB':'—','Filesystem HOME',x.disk.available?x.disk.usedPct:null)}
 ${statCard('Battery','battery',x.battery.available?safeValue(x.battery.percentage)+'%':'—','Termux:API')}
 </div><div class="grid twocol"><section class="card"><h3>CPU · biểu đồ từ khi mở trang</h3><div id="cpu-history" class="live-graph"></div><p class="small">Lịch sử chỉ được giữ trong trình duyệt của phiên này, không ghi log hệ thống.</p></section><section class="card"><h3>Device</h3>${detailLine('Model',x.device.model)}${detailLine('Architecture',x.device.architecture)}${detailLine('Nhiệt độ pin',x.battery.available?safeValue(x.battery.temperatureC)+' °C':'Không khả dụng')}<div class="metricline"><span>Đo lại lúc</span><strong data-observe="sample">${htmlEscape(new Date(x.observedAt).toLocaleTimeString())}</strong></div><p class="small">CPU temperature và lịch sử Wi-Fi chưa được tích hợp vào Panel này.</p></section><section class="card"><h3>Mạng · quan sát cục bộ</h3><div class="metricline"><span>Wi-Fi tốc độ liên kết</span><strong data-observe="wifi">${x.network.wifi.available?safeValue(x.network.wifi.linkMbps)+' Mbps':'—'}</strong></div><div class="metricline"><span>Dữ liệu nhận</span><strong data-observe="network-rx">${safeValue(x.network.rxKiBs)} KiB/s</strong></div><div class="metricline"><span>Dữ liệu gửi</span><strong data-observe="network-tx">${safeValue(x.network.txKiBs)} KiB/s</strong></div><p class="small">Nếu Android từ chối quyền, màn hình hiển thị —. Không thu thập SSID, địa chỉ MAC hoặc IP.</p></section></div>`;
 page(res,'Monitor thiết bị',html,session,200,autoScript,'/monitor');
}
async function viewBackups(req,res,session){
 const x=await observeServer();const summary=buildClusterSummary(HOME);
 page(res,'Backup & Restore',`<p class="lead">Tổng quan chỉ đọc. Không tự tạo backup, restore hay kết nối peer từ giao diện.</p><div class="grid twocol"><section class="card"><h3>Snapshot local</h3><div class="stat-value">${x.backup.recorded?'Có ghi nhận':'Chưa có'}</div><p class="small">${htmlEscape(x.backup.description)}</p><span class="pill warn">SHA256 chưa kiểm tra trong lượt xem</span></section><section class="card"><h3>Clone / Restore Lab</h3>${detailLine('Trạng thái',summary.clone.state)}${detailLine('Snapshot',summary.clone.snapshot||'Chưa nhận')}<p class="small">Metadata offline, không đủ chứng minh dữ liệu có thể tiếp quản website.</p></section></div><section class="card"><h3>Lệnh quản trị qua Termux</h3><p><code>~/mhc-full backup verify</code> — xác minh checksum bằng lệnh riêng</p><p><code>~/mhc-full clone standby-status</code> — đọc readiness (LAB)</p><p class="alertnote">Backup mỗi 24h không thay thế GTID live replication. Restore production bị khóa ở luồng TEST.</p></section>`,session,200,'','/backups');
}
async function viewDashboard(req,res,session){
  const ss=await sites();let rows='';
  let services='';
  for(const name of ['mhc-full-wp-nginx','mhc-full-wp-php','mhc-full-daily-backup','mhc-full-panel']){
    let state='unknown / not configured';
    try{const result=await runFile('sv',['status',name],{timeout:1800,maxBuffer:2048});state=result.stdout.trim().slice(0,150);}catch(e){if(e.stdout)state=String(e.stdout).trim().slice(0,150);}
    services+=`<tr><td>${htmlEscape(name)}</td><td>${htmlEscape(state)}</td></tr>`;
  }
  for(const name of ss){rows+=`<tr><td>${htmlEscape(name)}</td><td>Static</td><td><a href="${navFiles(name)}">Manage files</a></td></tr>`;}
  const wpDir=path.join(CONFIG,'sites');let wordpress=[];
  try{wordpress=(await fs.readdir(wpDir)).filter(n=>n.endsWith('.env')).map(n=>n.slice(0,-4)).filter(n=>SLUG.test(n));}catch(e){if(e.code!=='ENOENT')throw e;}
  for(const name of wordpress)rows+=`<tr><td>${htmlEscape(name)}</td><td>WordPress</td><td>Metadata only — use WP-CLI</td></tr>`;
  const latest=path.join(LOCKROOT,'latest-success-path');const marker=await exists(latest)?'Recorded (run backup verify in Termux)':'No completed snapshot marker';
  page(res,'Server overview',`<p><strong>Backup:</strong> ${htmlEscape(marker)}</p><h3>Local service state (read only)</h3><table><tr><th>Managed service</th><th>Observed state</th></tr>${services}</table><h3>Websites</h3><table><tr><th>Website</th><th>Type</th><th>Action</th></tr>${rows}</table><section><h3>Create static website</h3><form method="POST" action="/create"><input type="hidden" name="csrf" value="${session.csrf}"><label>Slug <input name="site" placeholder="landing" required pattern="[a-z][a-z0-9-]{1,30}"></label><button>Create</button></form></section><p class="small">WordPress settings, SQL databases, HA leases, tunnel, and production service control are deliberately excluded.</p>`,session,200,'','/sites');
}
async function viewCluster(req,res,session){
  const summary=buildClusterSummary(HOME);
  const b=summary.backup;
  let body=`<p><strong>Mode:</strong> ${htmlEscape(summary.mode)} · <strong>Cluster:</strong> ${htmlEscape(summary.node.clusterId||'none')}</p>
    <p class="small">Metadata only, not a live monitor. No SQL/asset catch-up, lease, Cloudflare route or Primary rights are verified.</p>
    <section><h3>Local backup</h3><p>${htmlEscape(b.status)} · ${htmlEscape(b.snapshot||'No snapshot recorded')}</p>
    <p class="small">Latest backup is a recorded pointer; checksums were NOT recalculated here. Run <code>mhc-full backup verify</code> on the node.</p></section>
    <section><h3>Local clone / Restore Lab</h3><p>${htmlEscape(summary.clone.state)} ${htmlEscape(summary.clone.snapshot||'')}</p>
    <p class="small">Offline receipt, staged files and lab metadata are NOT currently re-verified. No running standby is claimed.</p></section>
    <section><h3>Registered nodes (${summary.inventory.total})</h3><table><tr><th>Name</th><th>Hardware</th><th>Heartbeat evidence</th><th>Clone approval</th><th>Member report (unverified claim)</th><th>Readiness</th></tr>`;
  for(const n of summary.inventory.items){
    body+=`<tr><td>${htmlEscape(n.label)}<p class="small"><code>${htmlEscape(n.nodeId)}</code></p></td><td>${htmlEscape(n.deviceModel||'Unmeasured')} · ${n.memoryMiB===null?'RAM unknown':htmlEscape(String(n.memoryMiB))+' MiB'}</td><td>${htmlEscape(n.heartbeat)}</td><td>${htmlEscape(n.cloneOffer)} ${htmlEscape(n.offeredSnapshot||'')}</td><td>${htmlEscape(n.memberReport.state)}<br><span class="small">${htmlEscape(n.memberReport.evidence?.clone.state||'Not reported')} · ${htmlEscape(n.memberReport.evidence?.clone.snapshot||'')} · ${htmlEscape(n.memberReport.evidence?.backup.status||'')} · SQL lab records ${htmlEscape(String(n.memberReport.evidence?.clone.sqlLabRecordedCount??'unknown'))} · WP preview records ${htmlEscape(String(n.memberReport.evidence?.clone.wpPreviewPreparedCount??'unknown'))}</span></td><td>NOT REPLICA READY</td></tr>`;
  }
  body+='</table><p class="small">Nodes beyond the first 200 are not displayed. Remote candidate reports are metadata observed via authenticated SSH heartbeat; not verified restore/SQL/HTTP execution or HA eligibility.</p></section>';
  if(summary.alerts?.items?.length)body+='<section><h3>Node alerts (observation only)</h3><ul>'+summary.alerts.items.map(x=>`<li>${htmlEscape(x.nodeId)} — ${htmlEscape(x.code)}</li>`).join('')+'</ul></section>';
  if(summary.warnings.length)body+='<section><h3>Warnings</h3><ul>'+summary.warnings.map(x=>`<li>${htmlEscape(x)}</li>`).join('')+'</ul></section>';
  body+='<section><h3>HA safety gates</h3><p><strong>NOT VERIFIED:</strong> single writer, DB GTID, continuous file sync, write fencing, Cloudflare traffic, failover.</p><p>No Primary selection or HA actions are exposed.</p></section>';
  body+='<p><a href="/api/cluster-summary">Download read-only JSON summary</a></p>';
  page(res,'Cluster overview (LAB / read-only)',body,session);
}
async function viewNodes(req,res,session){
  const readMetadata=async file=>{
    try{const st=await fs.lstat(file);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077))return null;
      const raw=await fs.readFile(file,'utf8');if(raw.length>1024*1024)return null;return JSON.parse(raw);
    }catch{return null;}
  };
  const id=await readMetadata(path.join(CONFIG,'node-identity.json'));
  const cluster=await readMetadata(path.join(CONFIG,'cluster.json'));
  const joined=await readMetadata(path.join(CONFIG,'joined.json'));
  const reg=await readMetadata(path.join(CONFIG,'members.json'));
  let rows='';
  if(cluster&&Array.isArray(reg?.nodes)){
    for(const n of reg.nodes.slice(0,200)){
      const cap=n.capability||{};
      const model=typeof cap.deviceModel==='string'?cap.deviceModel.slice(0,64):'—';
      const memory=Number.isInteger(cap.memoryMiB)?String(cap.memoryMiB)+' MiB':'—';
      const recentlySeen=typeof n.lastSeenAt==='string'&&Number.isFinite(Date.parse(n.lastSeenAt))&&Date.now()-Date.parse(n.lastSeenAt)>=0&&Date.now()-Date.parse(n.lastSeenAt)<180000;
      const observation=recentlySeen?'Recent authenticated heartbeat':'Not recently observed';
      rows+=`<tr><td>${htmlEscape(n.label||'Unknown')}</td><td><code>${htmlEscape(n.nodeId||'')}</code></td><td>${htmlEscape(model)}</td><td>${htmlEscape(memory)}</td><td>${htmlEscape(observation)}</td><td>Not replica-ready</td></tr>`;
    }
  }
  const overview=`<p><strong>Local node:</strong> ${htmlEscape(id?.label||'Not initialized')} ${id?.nodeId?'<code>'+htmlEscape(id.nodeId)+'</code>':''}</p><p><strong>Cluster:</strong> ${htmlEscape(cluster?.clusterId||joined?.clusterId||'Unassigned')}</p><p><strong>Enrollment state:</strong> ${cluster?'Controller / inventory only':joined?'Enrolled / not verified':'Standalone / no membership'}</p>`;
  const detail=cluster?`<table><tr><th>Label</th><th>Node ID</th><th>Device</th><th>RAM</th><th>Online</th><th>Replica</th></tr>${rows}</table><p class="small">Showing up to 200 nodes. No live heartbeat is claimed.</p>`:`<p class="small">Use Termux commands to establish a TEST inventory controller or join one through SSH. No pairing codes are displayed in the Panel.</p>`;
  return page(res,'Cluster node inventory (TEST)',overview+detail+`<p class="small">A recent heartbeat means only that a node authenticated within 3 minutes, not that it is online now. This is NOT a live cluster monitor or HA status. Enrolled nodes have no database/file replication, no failover rights and no verified Primary designation. Pairing is managed exclusively over pinned-key SSH.</p>`,session);
}
async function viewFiles(req,res,session,url){
  const site=url.searchParams.get('site')||'';const rel=url.searchParams.get('dir')||'';
  const root=await known(site);const entries=await fileListing(root,rel);
  let links='';for(const ent of entries){
    const name=ent.name;const child=rel?`${rel}/${name}`:name;
    if(ent.isDirectory())links+=`<li>📁 <a href="${navFiles(site,child)}">${htmlEscape(name)}/</a></li>`;
    else if(ent.isFile()){
      links+=`<li>📄 ${htmlEscape(name)} — <a href="/download?site=${enc(site)}&path=${enc(child)}">Download</a>`;
      if(SAFE_EXT.has(path.extname(name).toLowerCase()))links+=` · <a href="/edit?site=${enc(site)}&path=${enc(child)}">Edit text</a>`;
      links+='</li>';
    }else links+=`<li>${htmlEscape(name)} (unsupported entry)</li>`;
  }
  const script=`const file=document.getElementById('upload'), msg=document.getElementById('upload-result');document.getElementById('send').addEventListener('click',async()=>{if(!file.files.length)return;const f=file.files[0];if(f.size>8388608){msg.textContent='Maximum 8 MB';return;}msg.textContent='Uploading...';try{const r=await fetch('/api/upload?site=${enc(site)}&dir=${enc(rel)}&name='+encodeURIComponent(f.name),{method:'POST',headers:{'x-mhc-csrf':'${session.csrf}','Content-Type':'application/octet-stream'},body:f});const t=await r.text();if(!r.ok)throw Error(t);location.reload();}catch(e){msg.textContent=e.message;}});const zip=document.getElementById('zip'),zm=document.getElementById('zip-result');document.getElementById('send-zip').addEventListener('click',async()=>{if(!zip.files.length)return;const f=zip.files[0];if(f.size>20971520){zm.textContent='Maximum 20 MB';return;}if(!confirm('Deploy ZIP replaces the whole static site and saves previous release. Proceed?'))return;zm.textContent='Deploying...';try{const r=await fetch('/api/deploy?site=${enc(site)}',{method:'POST',headers:{'x-mhc-csrf':'${session.csrf}','Content-Type':'application/zip'},body:f});const t=await r.text();if(!r.ok)throw Error(t);location.reload();}catch(e){zm.textContent=e.message;}});`;
  page(res,`Files · ${site}`,`<p><a href="/sites">All sites</a> · <a href="${navFiles(site)}">Root</a> ${htmlEscape(rel)}</p><ul>${links}</ul><section><h3>Upload a static file (8 MB max)</h3><input type="file" id="upload"><button type="button" id="send">Upload</button><p id="upload-result" class="small"></p></section><section><h3>Create/edit text file</h3><p><a href="/edit?site=${enc(site)}&path=${enc(rel?rel+'/new.html':'new.html')}">New HTML file</a></p></section><section><h3>Deploy entire static ZIP (20 MB max)</h3><input type="file" id="zip" accept=".zip"><button type="button" id="send-zip">Deploy ZIP</button><p id="zip-result" class="small"></p></section><section><h3>Rollback static release</h3><form method="POST" action="/rollback"><input type="hidden" name="csrf" value="${session.csrf}"><input type="hidden" name="site" value="${htmlEscape(site)}"><label><input type="checkbox" name="sure" value="yes" required> Restore previous static release</label><button>Rollback</button></form></section><p class="small">Updates are serialized against managed backups. Previous text/binary versions are retained in private file-history. Static content is untrusted; review before public exposure.</p>`,session,200,script);
}
async function viewEditor(req,res,session,url){
  const site=url.searchParams.get('site')||'';const relative=url.searchParams.get('path')||'';
  const root=await known(site);const p=await inside(root,relative);
  const st=await exists(p);if(st&&(!st.isFile()||st.size>MAX_TEXT))reject(413,'Not a text file or file too large');
  if(st&&['.png','.jpg','.jpeg','.gif','.webp','.avif','.woff','.woff2','.ttf','.ico','.pdf'].includes(path.extname(p).toLowerCase()))reject(415,'Binary file: download instead');
  const value=st?await fs.readFile(p,'utf8'):'';
  page(res,`Edit · ${relative}`,`<p><a href="${navFiles(site,path.dirname(relative)==='.'?'':path.dirname(relative))}">Back to files</a></p><form method="POST" action="/save"><input type="hidden" name="csrf" value="${session.csrf}"><input type="hidden" name="site" value="${htmlEscape(site)}"><input type="hidden" name="path" value="${htmlEscape(relative)}"><textarea name="value" maxlength="262144">${htmlEscape(value)}</textarea><br><button>Save file</button></form><p class="small">Text only, 256 KiB maximum. The previous file is preserved outside web root.</p>`,session);
}
async function handler(req,res){
  try{
    if(![`127.0.0.1:${PORT}`,`localhost:${PORT}`].includes(req.headers.host))reject(403,'Unexpected Host header');
    if(!['GET','POST'].includes(req.method))reject(405,'Method not allowed');
    const url=new URL(req.url,'http://127.0.0.1:19090');
    if(req.method==='GET'&&url.pathname==='/login'){
      const next=loginDestination(url.searchParams.get('next'));
      if(getSession(req)){res.writeHead(303,{Location:next});return res.end();}
      return page(res,'Sign in',loginForm(next));
    }
    if(req.method==='POST'&&url.pathname==='/login'){
      const key=req.socket.remoteAddress||'loopback';const attempt=failed.get(key)||{n:0,until:0};
      if(attempt.until>Date.now())reject(429,'Too many failed attempts; retry later');
      const data=await form(req,1024);
      const next=loginDestination(data.get('next'));
      if(!sameToken(data.get('token')||'',await secret())){
        attempt.n+=1;if(attempt.n>=5){attempt.until=Date.now()+60000;attempt.n=0;}failed.set(key,attempt);
        return page(res,'Sign in',loginForm(next,'Invalid admin token'),null,401);
      }
      failed.delete(key);const sessionId=crypto.randomBytes(32).toString('hex');const csrf=crypto.randomBytes(32).toString('hex');
      sessions.clear();sessions.set(sessionId,{csrf,exp:Date.now()+30*60*1000});
      res.setHeader('Set-Cookie',`mhc_session=${sessionId}; HttpOnly; SameSite=Strict; Path=/`);
      res.writeHead(303,{Location:next});return res.end();
    }
    const session=requireSession(req);
    if(req.method==='POST'&&url.pathname==='/logout'){
      const data=await form(req);requireCsrf(req,data.get('csrf'),session);sessions.clear();
      res.setHeader('Set-Cookie','mhc_session=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/');res.writeHead(303,{Location:'/login'});return res.end();
    }
    if(req.method==='GET'&&url.pathname==='/')return await viewHome(req,res,session);
    if(req.method==='GET'&&url.pathname==='/sites')return await viewDashboard(req,res,session);
    if(req.method==='GET'&&url.pathname==='/modules')return await viewModules(req,res,session);
    if(req.method==='GET'&&url.pathname==='/monitor')return await viewMonitor(req,res,session);
    if(req.method==='GET'&&url.pathname==='/backups')return await viewBackups(req,res,session);
    if(req.method==='GET'&&url.pathname==='/api/system-observe')return send(res,200,JSON.stringify(await observeServer()), 'application/json; charset=utf-8');
    if(req.method==='GET'&&url.pathname==='/nodes')return await viewNodes(req,res,session);
    if(req.method==='GET'&&url.pathname==='/cluster')return await viewCluster(req,res,session);
    if(req.method==='GET'&&url.pathname==='/api/cluster-summary')return send(res,200,JSON.stringify(buildClusterSummary(HOME)), 'application/json; charset=utf-8');
    if(req.method==='GET'&&url.pathname==='/files')return await viewFiles(req,res,session,url);
    if(req.method==='GET'&&url.pathname==='/edit')return await viewEditor(req,res,session,url);
    if(req.method==='GET'&&url.pathname==='/download'){
      const site=url.searchParams.get('site')||'';const relative=url.searchParams.get('path')||'';
      const root=await known(site);const p=await inside(root,relative);const st=await fs.lstat(p);
      if(!st.isFile()||st.size>MAX_BINARY)reject(413,'Not a file or exceeds 8 MB');
      const handle=await fs.open(p,fsConstants.O_RDONLY|fsConstants.O_NOFOLLOW);
      try{
        const data=await handle.readFile();headers(res,'application/octet-stream');
        res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${enc(path.basename(p))}`);res.writeHead(200);return res.end(data);
      }finally{await handle.close();}
    }
    if(req.method==='POST'&&url.pathname==='/create'){
      const data=await form(req);requireCsrf(req,data.get('csrf'),session);
      const slug=data.get('site')||'';if(!SLUG.test(slug))reject(400,'Invalid slug');
      await withOpLock(()=>callSites('create-static',slug));res.writeHead(303,{Location:navFiles(slug)});return res.end();
    }
    if(req.method==='POST'&&url.pathname==='/save'){
      const data=await form(req,MAX_TEXT*4+4096);requireCsrf(req,data.get('csrf'),session);
      const site=data.get('site')||'',relative=data.get('path')||'';
      const root=await known(site);const text=Buffer.from(data.get('value')||'','utf8');if(text.length>MAX_TEXT)reject(413,'Text exceeds limit');
      await writeStatic(root,relative,text);res.writeHead(303,{Location:`/edit?site=${enc(site)}&path=${enc(relative)}`});return res.end();
    }
    if(req.method==='POST'&&url.pathname==='/api/upload'){
      const sessionCsrf=req.headers['x-mhc-csrf']||'';requireCsrf(req,sessionCsrf,session);
      if(req.headers['content-type']!=='application/octet-stream')reject(415,'Expected binary upload');
      const site=url.searchParams.get('site')||'',dir=url.searchParams.get('dir')||'',name=url.searchParams.get('name')||'';
      if(name.includes('/')||name.includes('\\'))reject(400,'Unsafe filename');
      const root=await known(site);const rel=dir?`${dir}/${name}`:name;
      const data=await body(req,MAX_BINARY);if(!data.length)reject(400,'Empty upload');
      await writeStatic(root,rel,data);return send(res,200,'Uploaded','text/plain; charset=utf-8');
    }
    if(req.method==='POST'&&url.pathname==='/api/deploy'){
      requireCsrf(req,req.headers['x-mhc-csrf']||'',session);
      if(req.headers['content-type']!=='application/zip')reject(415,'Expected ZIP');
      const site=url.searchParams.get('site')||'';await known(site);
      const bytes=await body(req,MAX_ZIP);if(bytes.length<30)reject(400,'Empty ZIP');
      const tempdir=path.join(BASE,'panel-uploads');await fs.mkdir(tempdir,{recursive:true,mode:0o700});
      const name=path.join(tempdir,crypto.randomBytes(16).toString('hex')+'.zip');
      try{await fs.writeFile(name,bytes,{flag:'wx',mode:0o600});await callSites('deploy-static',site,name);}finally{await fs.rm(name,{force:true});}
      return send(res,200,'Deployed. Previous release preserved.','text/plain; charset=utf-8');
    }
    if(req.method==='POST'&&url.pathname==='/rollback'){
      const data=await form(req);requireCsrf(req,data.get('csrf'),session);
      const site=data.get('site')||'';await known(site);
      if(data.get('sure')!=='yes')reject(400,'Confirmation required');
      await callSites('rollback-static',site,'--confirm=ROLLBACK_STATIC');
      res.writeHead(303,{Location:navFiles(site)});return res.end();
    }
    reject(404,'Not found');
  }catch(e){
    const status=e.status||500;
    if(status===500)console.error('Panel internal error:',e?.code||e?.message);
    // Avoid rendering any sensitive filesystem content in error responses.
    const message=status===500?'Internal error; see local log':e.message;
    if(req.url?.startsWith('/api/'))return send(res,status,message,'text/plain; charset=utf-8');
    if(status===401&&req.method==='GET'){
      const safe=loginDestination(new URL(req.url,'http://127.0.0.1').pathname);
      res.writeHead(303,{Location:`/login?next=${enc(safe)}`});return res.end();
    }
    return page(res,'Request failed',`<p class="error">${htmlEscape(message)}</p><p><a href="/">Home</a></p>`,getSession(req),status);
  }
}
if(process.argv.includes('--self-check')){
  await ensureToken();console.log('Panel source and token prerequisites OK (not live HTTP/Termux acceptance)');process.exit(0);
}
await ensureToken();
const server=http.createServer(handler);
server.requestTimeout=30000;server.headersTimeout=15000;server.maxHeadersCount=80;
server.listen(PORT,'127.0.0.1',()=>console.log(`MHC Full TEST Panel listening on 127.0.0.1:${PORT} (SSH forwarding only)`));
