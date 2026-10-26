import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const root=process.argv[2];
const base=path.join(root,'vendor/mini-hosting-warm-standby-v1/mini-hosting-dr-v1/panel');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-legacy-test-'));
const target=path.join(tmp,'panel');
const prefix=path.join(tmp,'fakeprefix');
fs.mkdirSync(prefix,{recursive:true});
// Seed only isolated LAB metadata; no secrets should be returned by the new APIs.
fs.mkdirSync(path.join(tmp,'.config/mhc-full-installer/static'),{recursive:true});
fs.writeFileSync(path.join(tmp,'.config/mhc-full-installer/static/demo.conf'),'TYPE=static\nSITE_SLUG=demo\nADMIN_TOKEN=SHOULD_NEVER_BE_DISPLAYED');
fs.mkdirSync(path.join(tmp,'websites/demo'),{recursive:true});
fs.mkdirSync(path.join(tmp,'hosting-backups/mhc-full/snapshot-20261025'),{recursive:true});
fs.writeFileSync(path.join(tmp,'hosting-backups/mhc-full/snapshot-20261025/SHA256SUMS'),'SECRET_HASH_NOT_EXPOSED');
fs.writeFileSync(path.join(tmp,'hosting-backups/mhc-full/latest-success-path'),path.join(tmp,'hosting-backups/mhc-full/snapshot-20261025'));
fs.mkdirSync(path.join(tmp,'.config/mhc-lab-http-write-gate'),{recursive:true,mode:0o700});
fs.writeFileSync(path.join(tmp,'.config/mhc-lab-http-write-gate/http-token'),'SECRET_HTTP_GATE_TOKEN_DO_NOT_LEAK',{mode:0o600});
fs.mkdirSync(path.join(tmp,'.local/share/mhc-full-installer/observer'),{recursive:true});
fs.writeFileSync(path.join(tmp,'.local/share/mhc-full-installer/observer/latest.json'),JSON.stringify({
 schema:1,scope:'MHC_CONTENT_OBSERVER_ONLY',observedAt:new Date().toISOString(),roots:['static:demo'],fileCount:1,totalBytes:3,
 files:{'static:demo/SECRET_PATH_DO_NOT_SEND':{size:3,sha256:'VERY_SECRET_HASH_DO_NOT_SEND'}},
 gtid:{observed:true,binaryLogEnabled:true,gtidStrictMode:true,readOnly:false,serverId:14,replicationVerified:false}
}));

const fakeBin=path.join(prefix,'bin');fs.mkdirSync(fakeBin,{recursive:true});
fs.writeFileSync(path.join(fakeBin,'termux-battery-status'),'#!/bin/sh\necho \'{"percentage":68,"temperature":35.1,"status":"CHARGING","adminToken":"LEAK_VALUE"}\'\n',{mode:0o700});
fs.writeFileSync(path.join(fakeBin,'getprop'),'#!/bin/sh\necho "Vsmart LAB"\n',{mode:0o700});

fs.cpSync(base,target,{recursive:true});
for(const f of ['src/server.mjs','src/system.mjs','src/mhc-integration.mjs','src/mhc-remote-access.mjs','public/index.html','public/app.js']){
 fs.copyFileSync(path.join(root,'bin/legacy-panel-src',f),path.join(target,f));
}
fs.mkdirSync(path.join(tmp,'.local/share/mhc-full-installer/bin'),{recursive:true});
fs.copyFileSync(path.join(root,'bin/replication-observer.mjs'),path.join(tmp,'.local/share/mhc-full-installer/bin/replication-observer.mjs'));
fs.copyFileSync(path.join(root,'bin/fencing-lease-lab.mjs'),path.join(tmp,'.local/share/mhc-full-installer/bin/fencing-lease-lab.mjs'));
fs.copyFileSync(path.join(root,'bin/gtid-lab.mjs'),path.join(tmp,'.local/share/mhc-full-installer/bin/gtid-lab.mjs'));
fs.copyFileSync(path.join(root,'bin/gtid-seed.mjs'),path.join(tmp,'.local/share/mhc-full-installer/bin/gtid-seed.mjs'));
fs.copyFileSync(path.join(root,'bin/manual-switchover-lab.mjs'),path.join(tmp,'.local/share/mhc-full-installer/bin/manual-switchover-lab.mjs'));
fs.copyFileSync(path.join(root,'bin/manual-switchover-e2e-lab.mjs'),path.join(tmp,'.local/share/mhc-full-installer/bin/manual-switchover-e2e-lab.mjs'));
fs.copyFileSync(path.join(root,'bin/file-delta-lab.mjs'),path.join(tmp,'.local/share/mhc-full-installer/bin/file-delta-lab.mjs'));
fs.copyFileSync(path.join(root,'bin/file-peer-lab.mjs'),path.join(tmp,'.local/share/mhc-full-installer/bin/file-peer-lab.mjs'));
fs.mkdirSync(path.join(tmp,'mhc-file-lab/reports'),{recursive:true});
fs.writeFileSync(path.join(tmp,'mhc-file-lab/reports/private-file-name.json'),'SHOULD_NOT_LEAK_DELTA_PATH');
fs.mkdirSync(path.join(tmp,'mhc-file-lab/transport/journals'),{recursive:true});
fs.writeFileSync(path.join(tmp,'mhc-file-lab/transport/journals/delta-1761340000000-aaaaaaaaaa.json'),JSON.stringify({schema:1,id:'delta-1761340000000-aaaaaaaaaa',status:'REMOTE_CHECKSUM_VERIFIED',host:'SECRET_PEER_HOST_DO_NOT_SEND'}));

const s=fs.readFileSync(path.join(target,'src/server.mjs'),'utf8');
const h=fs.readFileSync(path.join(target,'public/index.html'),'utf8');
const a=fs.readFileSync(path.join(target,'public/app.js'),'utf8');
for(const term of ['api/mhc/modules','api/mhc/cluster','api/mhc/monitor','api/mhc/sites','api/mhc/backups','api/mhc/replication','api/mhc/switchover','api/mhc/fencing','api/mhc/witness','api/mhc/write-paths','api/mhc/writer-audit','mhcModules','mhcCluster'])assert(s.includes(term));
for(const label of ['Tổng quan','Websites','File Manager','Databases','Modules PHP / Server','Monitor','Cluster','Backups'])assert(h.includes(label));
assert(!h.includes('GALAXY M51'));assert(a.includes('v0.4B.1'));assert(a.includes('v0.4B.2'));assert(a.includes('v0.4C.2'));assert(a.includes('v0.4C.3')); 
assert(a.includes('sw.loopback?.status'));assert(a.includes('mhcModulesPage'));assert(a.includes('mhcClusterPage'));assert(a.includes('mhcMonitorPage'));assert(a.includes('Replication Observer'));assert(a.includes('MHC LAB — Backup'));
const available=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const {setPassword}=await import(pathToFileURL(path.join(target,'src/security.mjs')).href);
const originalHome=process.env.HOME;process.env.HOME=tmp;
setPassword('test-sandbox-strong-password');
process.env.HOME=originalHome;
let stderr='';let proc;
try{
 proc=spawn(process.execPath,['src/server.mjs'],{cwd:target,env:{...process.env,HOME:tmp,PREFIX:prefix,AMH_PORT:String(available)},stdio:['ignore','pipe','pipe']});
 proc.stderr.on('data',b=>stderr+=String(b));
 let status=null;
 for(let attempt=0;attempt<50;attempt++){
  try{status=await fetch(`http://127.0.0.1:${available}/api/session`);break;}catch{await new Promise(r=>setTimeout(r,100));}
 }
 assert(status?.ok,stderr||'Panel failed to start');
 for(const name of ['remote-access','modules','cluster','monitor','sites','backups','replication','switchover','fencing','witness','write-paths','writer-audit']){const no=await fetch(`http://127.0.0.1:${available}/api/mhc/${name}`);assert.equal(no.status,401);}
 const login=await fetch(`http://127.0.0.1:${available}/api/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',password:'test-sandbox-strong-password'})});
 assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 for(const endpoint of ['remote-access','modules','cluster','monitor','sites','backups','replication','switchover','fencing','witness','write-paths','writer-audit']){
  const res=await fetch(`http://127.0.0.1:${available}/api/mhc/${endpoint}`,{headers:{cookie}});
  assert.equal(res.status,200);
  const data=await res.json();assert(!JSON.stringify(data).includes('test-sandbox-strong-password'));
  assert(!JSON.stringify(data).includes('nodeToken'));
  assert(!JSON.stringify(data).includes('SHOULD_NEVER_BE_DISPLAYED'));
  assert(!JSON.stringify(data).includes('SECRET_HASH_NOT_EXPOSED'));
  assert(!JSON.stringify(data).includes('LEAK_VALUE'));
  assert(!JSON.stringify(data).includes('SECRET_PATH_DO_NOT_SEND'));
  assert(!JSON.stringify(data).includes('VERY_SECRET_HASH_DO_NOT_SEND'));
  assert(!JSON.stringify(data).includes('SHOULD_NOT_LEAK_DELTA_PATH'));
  assert(!JSON.stringify(data).includes('private-file-name.json'));
  if(endpoint==='remote-access'){assert.equal(data.configured,false);assert.equal(data.accessJwtRequired,true);}
  if(endpoint==='monitor'){assert.equal(data.battery.percentage,68);assert.equal(data.battery.temperatureC,35.1);assert.equal(data.device,'Vsmart LAB');}
  if(endpoint==='sites'){assert.equal(data.sites[0]?.slug,'demo');assert.equal(data.sites[0]?.httpVerifiedNow,false);}
  if(endpoint==='replication'){assert.equal(data.replicationVerified,false);assert.equal(data.haEligible,false);assert(!('filesList' in data));assert.equal(data.lab?.dataConvergenceVerified,false);assert.equal(data.seed?.integrityCurrentlyVerified,false);assert.equal(data.fileDelta?.liveReplication,false);assert.equal(data.filePeer?.verified,1);assert.equal(data.filePeer?.liveReplication,false);assert.equal(data.fileConsistent?.haEligible,false);assert.equal(data.fileConsistent?.liveApply,false);assert(!JSON.stringify(data).includes('SECRET_PEER_HOST_DO_NOT_SEND'));
  assert(!JSON.stringify(data).includes('SECRET_HTTP_GATE_TOKEN_DO_NOT_LEAK'));}
  if(endpoint==='write-paths'){assert.equal(data.productionProtected,false);assert.equal(data.haEligible,false);assert.equal(data.unguardedProductionPaths,9);assert.equal(data.guardedLabFixtureTypes,4);assert.equal(data.guardedLabEntryPaths,6);assert.equal(data.isolatedHttpGateConfigured,true);assert.equal(data.httpGatewayRunningVerifiedNow,false);assert.equal(data.guardedLabCanaryPaths,1);assert(!('credentials' in data));}
  if(endpoint==='writer-audit'){assert.equal(data.unverifiedFencingPaths,12);assert.equal(data.canSwitchPrimary,false);assert.equal(data.haEligible,false);assert(!('paths' in data));}
  if(endpoint==='witness'){assert.equal(data.haEligible,false);assert.equal(data.realWriteGateInstalled,false);assert(!('token' in data));assert(!('url' in data));}
  if(endpoint==='fencing'){assert.equal(data.authoritativeLease,false);assert.equal(data.canPromote,false);assert.equal(data.haEligible,false);assert(!('owner' in data));}
  if(endpoint==='switchover'){assert.equal(data.loopback?.syntheticOnly,true);assert.equal(data.loopback?.realFencingVerified,false);assert.equal(data.canSwitchPrimary,false);assert.equal(data.haEligible,false);assert.equal(data.authoritative,false);}
  if(endpoint==='backups'){assert.equal(data.snapshots[0]?.date,'20261025');assert.equal(data.snapshots[0]?.integrityVerifiedNow,false);}

 }
 const foreignHost=host=>new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:available,path:'/',headers:{host}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});
 assert.equal(await foreignHost('panel.thophuong.com'),403);
 assert.equal(await foreignHost('admin.thophuong.com'),403);
 const page=await fetch(`http://127.0.0.1:${available}/`);
 assert.equal(page.status,200);assert((await page.text()).includes('Modules PHP / Server'));
 console.log('PASS: original Panel 9090 secured modules/monitor/sites/backups/cluster; sanitization and no HA claims');
}finally{if(proc){proc.kill('SIGTERM');}fs.rmSync(tmp,{recursive:true,force:true});}
