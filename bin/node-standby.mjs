#!/usr/bin/env node
// TEST 0.3.6 Running Standby Foundation -- disposable lab-only HTTP probes.
// No public ingress, writable standby, DB promotion, or HA actions.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifiedLabContext} from './node-readiness.mjs';

const SLUG=/^[a-z][a-z0-9-]{1,30}$/;
const HASH=/^[0-9a-f]{64}$/;
const PORT=/^[0-9]{4,5}$/;
const previewConfirm='--confirm=PREPARE_DISPOSABLE_WP_LAB';
const runConfirm='--confirm=EXECUTE_RESTORED_PHP_ON_DISPOSABLE_LAB';
function check(v,msg){if(!v)throw Error(msg);}
function isFile(f){try{const s=fs.lstatSync(f);return s.isFile()&&!s.isSymbolicLink()&&s.nlink===1;}catch{return false;}}
function privateDir(p){if(fs.existsSync(p)){const s=fs.lstatSync(p);check(s.isDirectory()&&!s.isSymbolicLink(),'Unsafe dir: '+p);}else fs.mkdirSync(p,{recursive:true,mode:0o700});fs.chmodSync(p,0o700);}
function metadata(f){check(isFile(f),'Metadata not present or unsafe');const st=fs.statSync(f);check((st.mode&0o077)===0&&st.size<1000000,'Metadata mode/size unsafe');return JSON.parse(fs.readFileSync(f,'utf8'));}
function atomJSON(f,obj){privateDir(path.dirname(f));const t=f+'.tmp-'+crypto.randomBytes(6).toString('hex');fs.writeFileSync(t,JSON.stringify(obj,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(t,f);}
function hash(f){const h=crypto.createHash('sha256'),fd=fs.openSync(f,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const b=Buffer.allocUnsafe(256*1024);let n;while((n=fs.readSync(fd,b,0,b.length,null))>0)h.update(b.subarray(0,n));}finally{fs.closeSync(fd);}return h.digest('hex');}
function contentDir(ctx,slug){const root=path.join(ctx.lab,'payload/websites',slug);check(fs.existsSync(root)&&fs.lstatSync(root).isDirectory()&&!fs.lstatSync(root).isSymbolicLink(),'Site files missing');return root;}
function verified(){return verifiedLabContext();}
function findSite(report,slug,kind){check(SLUG.test(slug||''),'Invalid site slug');const site=report.sites.find(x=>x.slug===slug&&x.kind===kind);check(site&&site.offlineFilesComplete,'Registered complete '+kind+' site required');return site;}
function checkNoRealServer(){const home=process.env.HOME||os.homedir();for(const rel of ['apps/thophuongpro/.env','websites','.config/mini-hosting-cluster/ha.json'])check(!fs.existsSync(path.join(home,rel)),'Active/production path detected: '+rel);}
function mime(f){const ext=path.extname(f).toLowerCase();return ({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'})[ext]||'application/octet-stream';}
function safeStaticFile(root,rawUrl){check(typeof rawUrl==='string'&&rawUrl.length<=2048&&!/%(?:2f|5c|00)/i.test(rawUrl),'Invalid URL');
  const url=new URL(rawUrl,'http://localhost');let key;try{key=decodeURIComponent(url.pathname);}catch{throw Error('Invalid encoding');}
  check(!key.includes('\\')&&!key.includes('\0'),'Invalid path');const segs=key.split('/').filter(Boolean);check(segs.every(x=>x!=='.'&&x!=='..'&&!x.startsWith('.')),'Private or parent path');
  let relative=segs.join('/');if(!relative||key.endsWith('/'))relative+=(relative?'/':'')+'index.html';
  check(!/\.(?:php|phar|phtml|sh|env|ini|key|sql|gz|zip|tar|bak|old|log|cnf)$/i.test(relative),'Active or secret file');
  const full=path.resolve(root,relative);check(full.startsWith(root+path.sep),'Escaping preview root');let cur=root;
  for(const x of relative.split('/')){cur=path.join(cur,x);if(!fs.existsSync(cur))return null;check(!fs.lstatSync(cur).isSymbolicLink(),'Symlink not allowed in static preview');}
  check(isFile(full),'Not a regular static file');check(fs.statSync(full).size<=8*1024*1024,'Static resource too large');return full;
}
async function serveStatic(slug,port,confirm){check(confirm==='--confirm=SERVE_LAB_STATIC_ONLY','Explicit static preview confirmation required');check(PORT.test(port||'')&&+port>=1024&&+port<=65535,'Valid nonprivileged port required');const {ctx,report}=verified();findSite(report,slug,'static');checkNoRealServer();const root=contentDir(ctx,slug);
  const server=http.createServer((req,res)=>{
    const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",'X-MHC-Lab':'static-preview-not-standby'};
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,headers);return res.end();}
    let file;try{file=safeStaticFile(root,req.url);}catch{res.writeHead(403,headers);return res.end();}
    if(!file){res.writeHead(404,headers);return res.end();}
    const bytes=fs.readFileSync(file);res.writeHead(200,{...headers,'Content-Type':mime(file),'Content-Length':bytes.length});res.end(req.method==='GET'?bytes:undefined);
  });
  await new Promise((ok,bad)=>{server.once('error',bad);server.listen(+port,'127.0.0.1',ok);});
  console.log(JSON.stringify({mode:'STATIC_LAB_PREVIEW',url:`http://127.0.0.1:${port}/`,slug,listen:'127.0.0.1',readOnlyHTTP:true,primary:false,haEligible:false,standbyReady:false,stop:'Ctrl+C'},null,2));
  const close=()=>server.close(()=>process.exit(0));process.once('SIGINT',close);process.once('SIGTERM',close);
}
function parseAuth(f){check(isFile(f),'Lab DB credential file missing');check((fs.statSync(f).mode&0o077)===0,'Unsafe DB auth permissions');const src=fs.readFileSync(f,'utf8');check(src.length<8192,'Credential file too large');const obj={};for(const line of src.split(/\r?\n/)){
  if(!line||line==='[client]')continue;const match=/^(user|password|host)=([^\r\n]*)$/.exec(line);check(match&&!Object.hasOwn(obj,match[1]),'Unsupported lab DB auth format');obj[match[1]]=match[2];
}check(/^mhclab_[a-f0-9]{8}$/.test(obj.user||'')&&/^[a-f0-9]{56}$/.test(obj.password||'')&&obj.host==='localhost','Invalid lab DB credentials');return obj;}
function wpDetails(slug){const {ctx,report}=verified();const site=findSite(report,slug,'wordpress');check(site.sqlDumpPresent,'WordPress SQL dump missing');checkNoRealServer();const imp=metadata(path.join(ctx.lab,'lab-databases',slug+'.json'));
  check(imp.slug===slug&&imp.status==='SQL_LAB_IMPORTED_NOT_WEB_READY'&&/^mhc_restore_[a-z0-9_]+_[a-f0-9]{8}$/.test(imp.database||'')&&imp.tableCount>0,'Verified isolated SQL import required');const cnf=path.join(ctx.lab,'lab-databases',slug+'-client.cnf');const auth=parseAuth(cnf);
  const root=contentDir(ctx,slug);check(isFile(path.join(root,'wp-load.php'))&&isFile(path.join(root,'wp-config.php')),'Incomplete WordPress files');const original=fs.readFileSync(path.join(root,'wp-config.php'),'utf8');check(original.length<1024*1024,'Unsupported WP config size');const prefix=/(?:^|\n)\s*\$table_prefix\s*=\s*['\"]([a-zA-Z0-9_]{1,40})['\"]\s*;/.exec(original)?.[1];check(prefix,'Unable to verify WP table prefix in restored wp-config.php; refuse automatic preview');return {ctx,site,imp,auth,cnf,root,prefix};
}
function wpPlan(slug){const {ctx,site,imp}=wpDetails(slug);const preview=path.join(ctx.lab,'previews',slug);console.log(JSON.stringify({slug,wordpressFilesPresent:site.offlineFilesComplete,sqlLabImported:true,sqlLabTables:imp.tableCount,previewPrepared:fs.existsSync(path.join(preview,'wp-config.php')),requirements:['Disposable Termux device exclusively for lab (PHP plugins can access its filesystem/network)','php CLI available and safe to execute restored plugin/theme code','Explicit permission for every HTTP execution','WP admin/media/permalinks/plugin tests on physical Android'],sqlProductionCredentialsUsed:false,publicExposure:false,standbyReady:false,haEligible:false},null,2));}
function wpConfig(db,auth,prefix){const q=x=>JSON.stringify(x);return `<?php\n// Generated ONLY for TEST 0.3.6 disposable localhost smoke; no copied DB secrets.\ndefine('DB_NAME', ${q(db)});\ndefine('DB_USER', ${q(auth.user)});\ndefine('DB_PASSWORD', ${q(auth.password)});\ndefine('DB_HOST', 'localhost');\ndefine('DB_CHARSET', 'utf8mb4');\ndefine('DB_COLLATE', '');\ndefine('WP_HOME', getenv('MHC_WP_PREVIEW_URL') ?: 'http://127.0.0.1');\ndefine('WP_SITEURL', getenv('MHC_WP_PREVIEW_URL') ?: 'http://127.0.0.1');\ndefine('DISALLOW_FILE_EDIT', true);\ndefine('AUTOMATIC_UPDATER_DISABLED', true);\ndefine('WP_AUTO_UPDATE_CORE', false);\ndefine('DISABLE_WP_CRON', true);\ndefine('WP_DEBUG', false);\n\$table_prefix = ${q(prefix)}; // Parsed, not executed, from staged WP config.\nif (!defined('ABSPATH')) define('ABSPATH', __DIR__ . '/');\nrequire_once ABSPATH . 'wp-settings.php';\n`;
}
function previewDigest(dir){
  const h=crypto.createHash('sha256');let count=0,total=0;
  function walk(current,rel){for(const name of fs.readdirSync(current).sort()){
    const item=path.join(current,name),next=rel?rel+'/'+name:name,st=fs.lstatSync(item);
    check(!st.isSymbolicLink(),'Preview symlink forbidden: '+next);
    if(st.isDirectory()){walk(item,next);continue;}
    check(st.isFile()&&st.nlink===1,'Non-regular preview file: '+next);
    count++;total+=st.size;check(count<=40001&&total<=3*1024**3+1024*1024,'Preview file limits exceeded');
    h.update(next+'\0'+st.size+'\0'+hash(item)+'\n');
  }}walk(dir,'');return {sha256:h.digest('hex'),count};
}
function wpPrepare(slug,confirm){check(confirm===previewConfirm,`Required ${previewConfirm}`);const {ctx,imp,auth,root,prefix}=wpDetails(slug);const preview=path.join(ctx.lab,'previews',slug);check(!fs.existsSync(preview)&&!fs.existsSync(preview+'.lock')&&!fs.existsSync(path.join(ctx.lab,'previews',slug+'.json')),'Preview exists/locked; will not overwrite');
  privateDir(path.dirname(preview));fs.mkdirSync(preview+'.lock',{mode:0o700});try{
    privateDir(preview);let count=0,total=0;function cp(src,dst){for(const name of fs.readdirSync(src).sort()){
      const a=path.join(src,name),b=path.join(dst,name),s=fs.lstatSync(a);check(!s.isSymbolicLink(),'Symlink forbidden in WP source');
      if(s.isDirectory()){privateDir(b);cp(a,b);}else{check(s.isFile()&&s.nlink===1,'Unsafe WP source file');if(path.relative(root,a)==='wp-config.php')continue;
        count++;total+=s.size;check(count<=40000&&total<=3*1024**3,'WordPress preview exceeds file limit');fs.copyFileSync(a,b,fs.constants.COPYFILE_EXCL);fs.chmodSync(b,0o600);check(hash(a)===hash(b),'Copy hash mismatch');}
    }}cp(root,preview);
    fs.writeFileSync(path.join(preview,'wp-config.php'),wpConfig(imp.database,auth,prefix),{mode:0o600,flag:'wx'});
    const digest=previewDigest(preview);atomJSON(path.join(ctx.lab,'previews',slug+'.json'),{schema:1,previewDigest:digest.sha256,slug,sourceSnapshot:ctx.receipt.snapshot,sourceFilesVerified:true,sqlLabDatabase:imp.database,filesCopied:count,sourceDbCredentialsCopied:false,wpTablePrefix:prefix,phpExecuted:false,createdAt:new Date().toISOString(),haEligible:false,standbyReady:false});
    console.log(JSON.stringify({slug,preview,filesCopied:count,wordpressPHPExecuted:false,database:imp.database,standbyReady:false,notice:'Preview is not an OS sandbox. Execute PHP only on a dedicated disposable Termux test device.'},null,2));
  }finally{fs.rmdirSync(preview+'.lock');}
}
async function findPort(){return new Promise((ok,bad)=>{const s=net.createServer();s.once('error',bad);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>ok(p));});});}
async function httpRead(port,timeout=1500){return new Promise((ok,bad)=>{const req=http.get({hostname:'127.0.0.1',port,path:'/',timeout},res=>{let len=0;const location=res.headers.location||'';res.on('data',c=>{len+=c.length;if(len>1024*1024)res.destroy();});res.once('end',()=>ok({status:res.statusCode,location,bytes:len}));});req.once('timeout',()=>req.destroy(Error('HTTP timeout')));req.once('error',bad);});}
async function wpProbe(slug,confirm){check(confirm===runConfirm,`Explicit ${runConfirm} required`);const d=wpDetails(slug),preview=path.join(d.ctx.lab,'previews',slug);check(isFile(path.join(preview,'wp-config.php')),'Prepare WordPress preview first');const receipt=metadata(path.join(d.ctx.lab,'previews',slug+'.json'));check(receipt.slug===slug&&receipt.sourceSnapshot===d.ctx.receipt.snapshot&&receipt.sqlLabDatabase===d.imp.database&&receipt.wpTablePrefix===d.prefix&&HASH.test(receipt.previewDigest),'Preview source mismatch');check(previewDigest(preview).sha256===receipt.previewDigest,'WordPress preview changed since approval; do not execute PHP');
  const php=spawnSync('php',['-v'],{encoding:'utf8',timeout:5000});check(php.status===0,'PHP CLI unavailable; no actual PHP smoke');const q=spawnSync('mariadb',[`--defaults-extra-file=${d.cnf}`,'--protocol=socket','--batch','--skip-column-names',d.imp.database,'-e','SELECT 1;'],{encoding:'utf8',timeout:7000});check(q.status===0&&q.stdout.trim()==='1','Lab DB is not reachable');
  const router=path.join(path.dirname(fileURLToPath(import.meta.url)),'lab-wp-router.php');check(isFile(router),'Bundled PHP preview router missing');const port=await findPort(),url=`http://127.0.0.1:${port}`;
  // WP plugin/theme code executes with the same Termux UID. This is NOT a sandbox.
  const child=spawn('php',['-S',`127.0.0.1:${port}`,'-t',preview,router],{env:{...process.env,MHC_WP_PREVIEW_URL:url},stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',b=>{stderr+=(b.toString()).slice(0,250);stderr=stderr.slice(-600);});
  try{
    let observation=null;
    for(let i=0;i<24;i++){check(child.exitCode===null,'PHP server exited: '+stderr);try{observation=await httpRead(port,800);break;}catch{await new Promise(r=>setTimeout(r,125));}}
    check(observation,'No PHP HTTP response');check(observation.status===200||observation.status===302,'WordPress returned non-ready HTTP '+observation.status+' '+stderr);
    if(observation.location){const target=new URL(observation.location,url);check(target.hostname==='127.0.0.1'&&+target.port===port,'Redirect outside local lab rejected');}
    console.log(JSON.stringify({slug,url,observedHttpStatus:observation.status,bodyBytes:observation.bytes,redirect:observation.location||null,phpExecuted:true,sqlLabDatabase:d.imp.database,phpFpmVerified:false,nginxVerified:false,adminMediaPermalinksVerified:false,externalNetworkIsolation:false,haEligible:false,standbyReady:false,status:'PHP_CLI_LAB_SMOKE_ONLY'},null,2));
  }finally{child.kill('SIGTERM');await new Promise(ok=>{if(child.exitCode!==null)return ok();child.once('close',ok);setTimeout(()=>{child.kill('SIGKILL');ok();},1000).unref();});}
}
function runtimeStatus(){const {ctx,report}=verified(),details=[];for(const site of report.sites){const p=path.join(ctx.lab,'previews',site.slug+'.json');let db='NOT_IMPORTED',preview='NOT_PREPARED';const d=path.join(ctx.lab,'lab-databases',site.slug+'.json');if(fs.existsSync(d))db=metadata(d).status;if(fs.existsSync(p))preview='CONFIG_PREPARED_NOT_LIVE';details.push({slug:site.slug,type:site.kind,filesOK:site.offlineFilesComplete,sqlLab:db,preview,observedRunning:false,eligibleForHA:false});}
  const tpp=path.join(ctx.lab,'payload/tpp');const tppDb=path.join(ctx.lab,'payload/database-dumps/thophuong_pro.sql.gz');console.log(JSON.stringify({version:'0.3.6',snapshot:ctx.receipt.snapshot,staticAndWordpress:details,thophuongPro:{filesPresent:fs.existsSync(tpp),dbDumpPresent:isFile(tppDb),runtimeConfigured:false,appHTTPVerified:false},httpPreview:'on-demand-only',mariadbGTIDVerified:false,incrementalFilesVerified:false,productionWriteFenceVerified:false,cloudflareRouteChanged:false,haEligible:false,standbyReady:false,readiness:'LAB_HTTP_PREVIEW_ONLY'},null,2));}
function usage(){console.log('TEST 0.3.6 standby lab (no actual HA):\n clone standby-status\n clone serve-static SLUG PORT --confirm=SERVE_LAB_STATIC_ONLY\n clone wp-plan SLUG\n clone wp-prepare SLUG --confirm=PREPARE_DISPOSABLE_WP_LAB\n clone wp-probe SLUG --confirm=EXECUTE_RESTORED_PHP_ON_DISPOSABLE_LAB');}
export async function run(args=process.argv.slice(2)){switch(args[0]){
  case 'standby-status':check(args.length===1,'No arguments expected');return runtimeStatus();
  case 'serve-static':check(args.length===4,'Requires slug, port and confirmation');return serveStatic(args[1],args[2],args[3]);
  case 'wp-plan':check(args.length===2,'Requires WP slug');return wpPlan(args[1]);
  case 'wp-prepare':check(args.length===3,'Requires WP slug and confirmation');return wpPrepare(args[1],args[2]);
  case 'wp-probe':check(args.length===3,'Requires WP slug and confirmation');return wpProbe(args[1],args[2]);
  default:return usage();
}}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url))run().catch(e=>{console.error('ERROR:',e.message);process.exitCode=1;});
