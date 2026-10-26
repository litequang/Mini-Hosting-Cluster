#!/usr/bin/env node
// MHC TEST 0.3.5: offline-only clone restore lab and evidence-based readiness.
// NEVER changes active websites, MariaDB, HA, tunnels, or Cloudflare.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const HOME=process.env.HOME||os.homedir();
const CFG=path.join(HOME,'.config/mhc-full-installer');
const BASE=path.join(HOME,'hosting-clones/mhc-full');
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SNAP=/^snapshot-[0-9]{8}$/;
const SLUG=/^[a-z][a-z0-9-]{1,30}$/;
const MARK=/^(?:TEST 0\.3(?:\.[0-9]|\.9\.[12]|\.10|\.11)?|TEST 0\.4\.0(A|B1|B2|B3|B4|C1|C2|C3|D)|TEST 0\.5\.0(A|B|B2|B3|B4|B5|C-LAB|C-INTEGRATION|C-PHYSICAL|C-FIELD|C-DRILL|C-FENCE-PROBE|C-WRITER-AUDIT|C-MANUAL-PRIMARY|C-AUTO-PRIMARY-LAB|C-ROUTE-RECOVERY|C-REMOTE-PANEL)) installed on clean Termux$/;
const isFile=(x)=>{try{const s=fs.lstatSync(x);return s.isFile()&&!s.isSymbolicLink();}catch{return false;}};
function check(condition,msg){if(!condition)throw Error(msg);}
function fileHash(f){const h=crypto.createHash('sha256');const fd=fs.openSync(f,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const buf=Buffer.allocUnsafe(1024*1024);let n;while((n=fs.readSync(fd,buf,0,buf.length,null))>0)h.update(buf.subarray(0,n));}finally{fs.closeSync(fd);}return h.digest('hex');}
function loadPrivate(f){const s=fs.lstatSync(f);check(s.isFile()&&!s.isSymbolicLink()&&!(s.mode&0o077)&&s.size<1e6,`Unsafe metadata ${f}`);return JSON.parse(fs.readFileSync(f,'utf8'));}
function safeDir(p){if(fs.existsSync(p)){const s=fs.lstatSync(p);check(s.isDirectory()&&!s.isSymbolicLink(),`Unsafe directory ${p}`);}else fs.mkdirSync(p,{recursive:true,mode:0o700});fs.chmodSync(p,0o700);}
function writeJSON(p,data){safeDir(path.dirname(p));const tmp=`${p}.tmp-${crypto.randomBytes(8).toString('hex')}`;fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600,flag:'wx'});try{fs.renameSync(tmp,p);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
function baseContext(){
  check(isFile(path.join(CFG,'installed'))&&MARK.test(fs.readFileSync(path.join(CFG,'installed'),'utf8').trim()),'Completed disposable TEST installation required');
  for(const bad of ['apps/thophuongpro/.env','.config/mini-hosting-cluster/node.json','.config/mini-hosting-cluster/ha.json'])check(!fs.existsSync(path.join(HOME,bad)),`Production/HA indicator detected: ${bad}`);
  check(!fs.existsSync(path.join(CFG,'install-incomplete')),'Incomplete installation');
  const joined=loadPrivate(path.join(CFG,'joined.json'));
  const identity=loadPrivate(path.join(CFG,'node-identity.json'));
  check(joined.mode==='inventory-only'&&ID.test(joined.controllerNodeId)&&joined.nodeId===identity.nodeId,'Only enrolled inventory LAB candidates supported');
  check(!fs.existsSync(path.join(HOME,'websites')),'Active website directory exists; LAB restore refused');
  check(!fs.existsSync(path.join(CFG,'cluster.json')),'Controller may not restore itself as a candidate');
  const receipts=path.join(BASE,'receipts');check(fs.existsSync(receipts),'No verified clone receipt');
  const names=fs.readdirSync(receipts).filter(x=>x.startsWith(`${joined.controllerNodeId}-`)&&x.endsWith('.json'));
  check(names.length===1,'Exactly one verified snapshot receipt per source required in TEST');
  const receipt=loadPrivate(path.join(receipts,names[0]));
  check(receipt.schema===1&&receipt.sourceNodeId===joined.controllerNodeId&&receipt.recipientNodeId===joined.nodeId&&receipt.clusterId===joined.clusterId&&SNAP.test(receipt.snapshot)&&/^[0-9a-f]{64}$/.test(receipt.sha256sum),'Invalid clone receipt');
  const incoming=path.join(BASE,'incoming',joined.controllerNodeId,receipt.snapshot);
  const staged=path.join(BASE,'staged',joined.controllerNodeId,receipt.snapshot);
  for(const p of [BASE,path.join(BASE,'incoming'),path.join(BASE,'incoming',joined.controllerNodeId),incoming,path.join(BASE,'staged'),path.join(BASE,'staged',joined.controllerNodeId),staged]){
    check(fs.existsSync(p),'Clone fetch and stage required');check(fs.lstatSync(p).isDirectory()&&!fs.lstatSync(p).isSymbolicLink(),`Unsafe clone path: ${p}`);
  }
  check(isFile(path.join(incoming,'SHA256SUMS'))&&fileHash(path.join(incoming,'SHA256SUMS'))===receipt.sha256sum,'Clone digest differs from receipt');
  const verify=path.join(HOME,'.local/share/mhc-full-installer/bin/backup-verify.sh');
  const v=spawnSync('bash',[verify,'verify',incoming],{encoding:'utf8',timeout:180000});
  check(v.status===0,'Incoming clone archive verification failed: '+(v.stderr||'').slice(0,250));
  return {joined,receipt,incoming,staged,lab:path.join(BASE,'labs',joined.controllerNodeId,receipt.snapshot)};
}
// Never copy a symlink, device, socket, FIFO, hidden escalation, or a hardlinked file
// from user-modifiable staged data into the recovery lab. Paths remain under private HOME.
function tree(root,maxFiles=60000,maxBytes=24*1024**3){
  const results=[];let bytes=0;
  function walk(dir,rel){
    const names=fs.readdirSync(dir).sort();
    for(const name of names){
      check(name!=='.'&&name!=='..'&&name.indexOf('\0')<0,'Invalid entry');
      const relative=rel?`${rel}/${name}`:name;const full=path.join(dir,name);const st=fs.lstatSync(full);
      check(!st.isSymbolicLink(),'Symlink prohibited in staged data: '+relative);
      if(st.isDirectory()){walk(full,relative);continue;}
      check(st.isFile()&&st.nlink===1,'Non-regular/hardlinked recovery file: '+relative);
      bytes+=st.size;check(bytes<=maxBytes&&results.length<maxFiles,'Recovery file count/size limits exceeded');
      results.push({path:relative,size:st.size,sha256:fileHash(full)});
    }
  }
  walk(root,'');return results;
}
function parseKV(f){check(isFile(f),'Missing site registry: '+f);const body=fs.readFileSync(f,'utf8');check(body.length<16384,'Oversized site registry');const values={};for(const line of body.split(/\r?\n/)){
    if(!line.trim())continue;const match=/^([A-Z_]+)=([^\r\n]*)$/.exec(line);check(match,'Invalid site registry syntax');check(!(match[1] in values),'Duplicate registry value');values[match[1]]=match[2];
  }return values;
}
function inventories(staged){
  const sitesRoot=path.join(staged,'websites');const registry=path.join(staged,'mhc-full-installer');
  const sites=[];const registered=new Set();
  for(const [kind,sub,ext] of [['static','static','.conf'],['wordpress','sites','.env']]){
    const d=path.join(registry,sub);if(!fs.existsSync(d))continue;check(fs.lstatSync(d).isDirectory()&&!fs.lstatSync(d).isSymbolicLink(),'Unsafe registry directory');
    for(const name of fs.readdirSync(d).sort()){
      if(!name.endsWith(ext))continue;const slug=name.slice(0,-ext.length);check(SLUG.test(slug),'Unsafe site slug');
      check(!registered.has(slug),'Duplicate site slug');registered.add(slug);
      const data=parseKV(path.join(d,name));check(data.SITE_SLUG===slug,'Site slug mismatch');
      if(kind==='static')check(data.TYPE==='static','Invalid static type');
      if(kind==='wordpress'){
        check(data.SITE_ROOT===path.join(HOME,'websites',slug)||/\/websites\/[a-z][a-z0-9-]{1,30}$/.test(data.SITE_ROOT||''),'Invalid WP source root');
        check(/^wp_[a-z0-9_]{1,48}$/.test(data.DB_NAME||''),'Invalid WP DB name');
      }
      const root=path.join(sitesRoot,slug);
      const filesOK=fs.existsSync(root)&&fs.lstatSync(root).isDirectory()&&!fs.lstatSync(root).isSymbolicLink();
      const wpFiles=kind==='wordpress'&&['wp-config.php','wp-load.php','wp-includes','wp-admin'].every(x=>fs.existsSync(path.join(root,x)));
      const staticFiles=kind==='static'&&isFile(path.join(root,'index.html'));
      const dump=path.join(staged,'database-dumps',slug+'.sql.gz');
      const dumpPresent=kind==='wordpress'&&isFile(dump);
      const evidence=kind==='static'?[staticFiles?'static-index-present':'static-index-missing']:
        [wpFiles?'wordpress-files-present':'wordpress-files-incomplete',dumpPresent?'database-dump-present-not-imported':'database-dump-missing'];
      sites.push({slug,kind,filesPresent:filesOK,offlineFilesComplete:kind==='static'?staticFiles:wpFiles,sqlDumpPresent:dumpPresent,sqlImported:false,localHTTPVerified:false,evidence});
    }
  }
  if(fs.existsSync(sitesRoot))for(const name of fs.readdirSync(sitesRoot)){
    check(SLUG.test(name),'Unknown or unsafe site directory');check(registered.has(name),`Unregistered recovery site: ${name}`);
  }
  const tpp=fs.existsSync(path.join(staged,'tpp'));
  const sheetDirs=[path.join(staged,'tpp/storage/sheets'),path.join(staged,'tpp/external-sheets')];
  let sheetFiles=0;for(const d of sheetDirs)if(fs.existsSync(d))sheetFiles+=tree(d,60000,24*1024**3).length;
  return {sites,thophuongProFilesPresent:tpp,thophuongProSheetFileCount:sheetFiles,thophuongProDBDumpPresent:isFile(path.join(staged,'database-dumps/thophuong_pro.sql.gz'))};
}
function analyze(ctx){
  const files=tree(ctx.staged);
  const attest=loadPrivate(path.join(BASE,'stage-attestations',`${ctx.joined.controllerNodeId}-${ctx.receipt.snapshot}.json`));
  check(attest.schema===1&&attest.snapshot===ctx.receipt.snapshot&&attest.sourceNodeId===ctx.joined.controllerNodeId&&attest.recipientNodeId===ctx.joined.nodeId&&attest.sha256sum===ctx.receipt.sha256sum&&Array.isArray(attest.files),'Stage attestation invalid');
  check(files.length===attest.files.length,'Staged file count differs from signed-off extraction');
  for(let i=0;i<files.length;i++)check(files[i].path===attest.files[i].path&&files[i].size===attest.files[i].size&&files[i].sha256===attest.files[i].sha256,'Staged content differs from verified extraction');
  const inv=inventories(ctx.staged);
  check(files.length>0,'Empty stage');
  const hasDatabases=inv.sites.some(s=>s.kind==='wordpress')||inv.thophuongProDBDumpPresent;
  return {schema:1,version:'0.3.5',sourceNodeId:ctx.joined.controllerNodeId,nodeId:ctx.joined.nodeId,clusterId:ctx.joined.clusterId,snapshot:ctx.receipt.snapshot,verifiedSnapshotSha256:ctx.receipt.sha256sum,analyzedAt:new Date().toISOString(),fileCount:files.length,totalBytes:files.reduce((n,x)=>n+x.size,0),...inv,allDeclaredSitesHaveFiles:inv.sites.every(s=>s.offlineFilesComplete&&(s.kind!=='wordpress'||s.sqlDumpPresent)),databaseRestoreNeeded:hasDatabases,phpNginxLiveAccepted:false,storageApplicationConsistencyVerified:false,continuousReplication:false,dbCaughtUp:false,writeFenceVerified:false,haEligible:false,standbyReady:false,readiness:'OFFLINE_RESTORE_ONLY',requirements:['MariaDB actual lab import + table/content verification','WordPress PHP-FPM/Nginx HTTP/admin/media smoke if applicable','Thờ Phượng Pro app + Sheet relationship checks if applicable','Ongoing GTID and file catch-up','Origin/DB write fencing and role/lease checks']};
}
// Compatibility path: a stage produced by TEST 0.3.4 has no file seal. Re-extract
// from the still-verified incoming snapshot to a NEW temporary directory and compare
// every byte before attesting the original. Never bless the old stage on its own.
function reverifyStage(token){
  check(token==='--confirm=REVERIFY_OFFLINE_STAGE','Explicit --confirm=REVERIFY_OFFLINE_STAGE required');
  const ctx=baseContext(),att=path.join(BASE,'stage-attestations',`${ctx.joined.controllerNodeId}-${ctx.receipt.snapshot}.json`);
  check(!fs.existsSync(att),'Stage already attested; no replacement');
  check(!fs.existsSync(ctx.lab),'Restore lab already prepared; no stage migration');
  safeDir(path.dirname(att));const temp=path.join(BASE,'staged',ctx.joined.controllerNodeId,`.check-${crypto.randomBytes(10).toString('hex')}`);
  check(!fs.existsSync(temp),'Temporary stage already exists');
  const restore=path.join(HOME,'.local/share/mhc-full-installer/bin/restore.sh');
  try{
    const child=spawnSync('bash',[restore,'extract',ctx.incoming,temp,'--confirm=EXTRACT_ONLY'],{encoding:'utf8',timeout:180000});
    check(child.status===0,'Cannot safely re-extract verified incoming clone: '+(child.stderr||'').slice(0,300));
    const oldFiles=tree(ctx.staged),newFiles=tree(temp);
    check(oldFiles.length===newFiles.length,'Old stage differs from freshly extracted snapshot');
    for(let i=0;i<oldFiles.length;i++)check(oldFiles[i].path===newFiles[i].path&&oldFiles[i].size===newFiles[i].size&&oldFiles[i].sha256===newFiles[i].sha256,'Old stage modified; cannot attest: '+oldFiles[i].path);
    writeJSON(att,{schema:1,sourceNodeId:ctx.joined.controllerNodeId,recipientNodeId:ctx.joined.nodeId,snapshot:ctx.receipt.snapshot,sha256sum:ctx.receipt.sha256sum,files:oldFiles,sealedAt:new Date().toISOString(),method:'REEXTRACT_COMPARE'});
    console.log('PASS: offline stage matches a fresh extract from verified incoming archive; evidence sealed. No active paths or DB changed.');
  }finally{if(fs.existsSync(temp))fs.rmSync(temp,{recursive:true,force:true});}
}
function report(){const ctx=baseContext();const r=analyze(ctx);console.log(JSON.stringify(r,null,2));}
function lock(folder,fn){const l=folder+'.lock';fs.mkdirSync(path.dirname(l),{recursive:true,mode:0o700});fs.mkdirSync(l,{mode:0o700});try{return fn();}finally{fs.rmdirSync(l);}}
function prepare(token){check(token==='--confirm=OFFLINE_RESTORE_LAB','Explicit --confirm=OFFLINE_RESTORE_LAB required');const ctx=baseContext();const analysis=analyze(ctx);
  check(!fs.existsSync(ctx.lab)&&!fs.existsSync(ctx.lab+'.lock'),'Restore lab already exists or locked; refuse overwrite');
  check(!fs.existsSync(path.join(HOME,'hosting-backups/mhc-full/.backup-lock'))&&!fs.existsSync(path.join(HOME,'hosting-backups/mhc-full/.site-operation-lock')),'Backup/site operation in progress');
  safeDir(path.dirname(ctx.lab));return lock(ctx.lab,()=>{
    const sourceFiles=tree(ctx.staged);safeDir(ctx.lab);try{
      // Copy only to private clone lab, never into ~/websites, ~/.config, SQL server or PHP runtime.
      for(const entry of sourceFiles){const src=path.join(ctx.staged,entry.path),dst=path.join(ctx.lab,'payload',entry.path);
        safeDir(path.dirname(dst));fs.copyFileSync(src,dst,fs.constants.COPYFILE_EXCL);fs.chmodSync(dst,0o600);
        check(fileHash(dst)===entry.sha256,'Read-back SHA256 mismatch: '+entry.path);
      }
      writeJSON(path.join(ctx.lab,'manifest.json'),{schema:1,sourceSnapshot:ctx.receipt.snapshot,files:sourceFiles});
      writeJSON(path.join(ctx.lab,'readiness.json'),{...analysis,preparedAt:new Date().toISOString(),localHTTPVerified:false});
      console.log(`OFFLINE RESTORE LAB READY: ${ctx.lab}`);
      console.log(`Copied ${sourceFiles.length} files; no SQL import, WordPress execution, website activation, public ingress, or HA.`);
    }catch(e){console.error('Incomplete restore lab intentionally retained for inspection:',ctx.lab);throw e;}
  });
}
function inspectLab(ctx){check(fs.existsSync(ctx.lab)&&!fs.lstatSync(ctx.lab).isSymbolicLink(),'Restore lab missing');
  const manifest=loadPrivate(path.join(ctx.lab,'manifest.json'));
  check(manifest.schema===1&&manifest.sourceSnapshot===ctx.receipt.snapshot&&Array.isArray(manifest.files),'Invalid lab manifest');
  const actual=tree(path.join(ctx.lab,'payload'));
  check(actual.length===manifest.files.length,'Lab file count changed');
  for(let i=0;i<actual.length;i++)check(actual[i].path===manifest.files[i].path&&actual[i].sha256===manifest.files[i].sha256&&actual[i].size===manifest.files[i].size,'Restore lab files changed');
  const readiness=loadPrivate(path.join(ctx.lab,'readiness.json'));check(readiness.snapshot===ctx.receipt.snapshot,'Invalid readiness metadata');
  return readiness;
}
function status(){const ctx=baseContext();let readiness=null;if(fs.existsSync(ctx.lab))readiness=inspectLab(ctx);
  const imports=[];const importDir=path.join(ctx.lab,'lab-databases');if(readiness&&fs.existsSync(importDir))for(const name of fs.readdirSync(importDir)){
    if(!name.endsWith('.json'))continue;const result=loadPrivate(path.join(importDir,name));
    imports.push({slug:result.slug,database:result.database,status:result.status,tables:result.tableCount??null});
  }
  console.log(JSON.stringify({snapshot:ctx.receipt.snapshot,labPrepared:!!readiness,readiness:readiness?.readiness||'NOT_PREPARED',sites:readiness?.sites||[],isolatedSqlImports:imports,haEligible:false,standbyReady:false},null,2));}
async function smoke(slug){check(SLUG.test(slug||''),'Specify a valid static SLUG');const ctx=baseContext();const report=inspectLab(ctx);
  const s=report.sites.find(s=>s.slug===slug&&s.kind==='static');check(s&&s.offlineFilesComplete,'Only registered, complete static lab site may be probed');
  const siteRoot=path.join(ctx.lab,'payload','websites',slug);const rootIndex=path.join(siteRoot,'index.html');check(isFile(rootIndex),'Index missing');
  // No arbitrary file serving: one GET of static index; loopback ephemeral listener with no public ingress.
  const bytes=fs.readFileSync(rootIndex);check(bytes.length<=4*1024*1024,'Static index too large');
  const server=http.createServer((req,res)=>{if(req.url!=='/__mhc_readiness_probe__'||req.method!=='GET'){res.writeHead(404);return res.end();}
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  try{const address=server.address();const observed=await new Promise((resolve,reject)=>{http.get({hostname:'127.0.0.1',port:address.port,path:'/__mhc_readiness_probe__',timeout:4000},res=>{let n=0;res.on('data',d=>n+=d.length);res.on('end',()=>resolve({httpStatus:res.statusCode,bytes:n}));}).on('error',reject);});
    check(observed.httpStatus===200&&observed.bytes===bytes.length,'Static HTTP smoke failed');
    console.log(JSON.stringify({slug,httpStatus:200,bytes:observed.bytes,boundTo:'127.0.0.1',siteDeployed:false,kind:'ISOLATED_STATIC_SMOKE_ONLY',standbyReady:false},null,2));
  }finally{await new Promise(resolve=>server.close(resolve));}
}

// New LAB DATABASE, separate least-privilege SQL importer; no WordPress activation.
function proc(cmd,args,opts={}){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:30000,maxBuffer:200000,...opts});check(r.status===0,`${cmd} failed: ${(r.stderr||r.error?.message||'').slice(0,300)}`);return r.stdout;}
async function importSql(slug,confirm){
  check(SLUG.test(slug||''),'Invalid WordPress slug');
  check(confirm==='--confirm=CREATE_NEW_LAB_DB','Requires --confirm=CREATE_NEW_LAB_DB');
  const ctx=baseContext(),report=inspectLab(ctx);
  const site=report.sites.find(s=>s.slug===slug&&s.kind==='wordpress'&&s.offlineFilesComplete&&s.sqlDumpPresent);
  check(site,'Requires complete staged WordPress files and verified SQL dump');
  const target=path.join(ctx.lab,'lab-databases',`${slug}.json`);
  check(!fs.existsSync(target),'Import already attempted. No repeat/overwrite; inspect existing lab DB');
  const dump=path.join(ctx.lab,'payload/database-dumps',`${slug}.sql.gz`);
  check(isFile(dump),'SQL dump missing');
  proc('gzip',['-t','--',dump]);
  // Never import as root. Admin only creates a new database and a restricted lab account.
  check(process.platform==='linux'||process.platform==='android','Local Linux/Termux MariaDB required');
  const nonce=crypto.randomBytes(4).toString('hex');
  const database=`mhc_restore_${slug.replace(/-/g,'_')}_${nonce}`;
  const account=`mhclab_${nonce}`;const secret=crypto.randomBytes(28).toString('hex');
  check(/^[a-z0-9_]+$/.test(database)&&database.length<=64,'Unsafe generated schema');
  safeDir(path.dirname(target));
  const auth=path.join(ctx.lab,'lab-databases',`${slug}-client.cnf`);
  check(!fs.existsSync(auth),'Credentials file already exists');
  writeJSON(target,{schema:1,slug,database,status:'CREATING_INCOMPLETE',reason:'Manual cleanup if interrupted',startedAt:new Date().toISOString()});
  try{
    proc('mariadb',['--no-defaults','-u','root','--batch'],{input:`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`});
    proc('mariadb',['--no-defaults','-u','root','--batch'],{input:`CREATE USER '${account}'@'localhost' IDENTIFIED BY '${secret}'; GRANT ALL PRIVILEGES ON \`${database}\`.* TO '${account}'@'localhost';`});
    fs.writeFileSync(auth,`[client]\nuser=${account}\npassword=${secret}\nhost=localhost\n`,{mode:0o600,flag:'wx'});
    // Decompress as a stream to avoid reading large SQL dumps into memory.
    const gzip=spawn('gzip',['-dc','--',dump],{stdio:['ignore','pipe','pipe']});
    const mariadb=spawn('mariadb',[`--defaults-extra-file=${auth}`,'--protocol=socket','--local-infile=0','--binary-mode','--batch',database],{stdio:['pipe','ignore','pipe']});
    mariadb.stdin.on('error',()=>{}); // avoid unhandled EPIPE if SQL client rejects an unsafe statement
    gzip.stdout.pipe(mariadb.stdin);
    let errorOutput='';for(const proc of [gzip,mariadb])proc.stderr.on('data',chunk=>{errorOutput+=(chunk.toString()).slice(0,500);if(errorOutput.length>1500)errorOutput=errorOutput.slice(0,1500);});
    const done=(child)=>new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve(code));});
    const [gzStatus,dbStatus]=await Promise.all([done(gzip),done(mariadb)]);
    check(gzStatus===0&&dbStatus===0,'SQL import failed (partial lab database remains): '+errorOutput);
    const tables=proc('mariadb',[`--defaults-extra-file=${auth}`,'--protocol=socket','--batch','--skip-column-names',database,'-e','SHOW TABLES;']);
    const tableCount=tables.trim()?tables.trim().split(/\r?\n/).length:0;
    check(tableCount>0,'No tables imported (lab database remains; manual investigation required)');
    writeJSON(target,{schema:1,slug,database,status:'SQL_LAB_IMPORTED_NOT_WEB_READY',tableCount,completedAt:new Date().toISOString(),haEligible:false});
    console.log(JSON.stringify({slug,database,tableCount,status:'SQL_LAB_IMPORTED_NOT_WEB_READY',wordpressRuntimeVerified:false,standbyReady:false},null,2));
  }catch(err){
    writeJSON(target,{schema:1,slug,database,status:'PARTIAL_OR_UNVERIFIED',manualCleanup:true,error:String(err.message).slice(0,350),haEligible:false});
    throw err;
  }
}

export function verifiedLabContext(){const ctx=baseContext();const report=inspectLab(ctx);const fresh=analyze(ctx);check(fresh.verifiedSnapshotSha256===report.verifiedSnapshotSha256,'Lab source receipt mismatch');return {ctx,report,fresh};}

function usage(){console.log('TEST 0.3.5 Clone Restore Lab (no production mutation):\n  clone readiness\n  clone prepare-lab --confirm=OFFLINE_RESTORE_LAB\n  clone lab-status\n  clone smoke-static SLUG\n  clone reverify-stage --confirm=REVERIFY_OFFLINE_STAGE\n  clone import-sql-lab WORDPRESS_SLUG --confirm=CREATE_NEW_LAB_DB');}
export async function run(args=process.argv.slice(2)){
  switch(args[0]){
    case 'readiness':check(args.length===1,'No arguments expected');return report();
    case 'reverify-stage':check(args.length===2,'Explicit confirmation required');return reverifyStage(args[1]);
    case 'prepare-lab':check(args.length===2,'Confirmation required');return prepare(args[1]);
    case 'lab-status':check(args.length===1,'No arguments expected');return status();
    case 'smoke-static':check(args.length===2,'Valid static site required');return smoke(args[1]);
    case 'import-sql-lab':check(args.length===3,'WordPress slug and confirmation required');return importSql(args[1],args[2]);
    default:usage();process.exitCode=2;
  }
}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url))run().catch(e=>{console.error('ERROR:',e.message);process.exitCode=1;});
