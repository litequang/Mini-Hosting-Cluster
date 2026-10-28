// Isolated fault injection: no real services, identities, credentials or Cloudflare calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {SourceUpgrade,upgradeAuthoritySnapshot,digest,LAB_NODES,PANEL_FILES,LEGACY_BOOT_SHA,supportedRuntime} from '../bin/source-upgrade.mjs';
assert.equal(supportedRuntime('android','/data/data/com.termux/files/usr'),true);
assert.equal(supportedRuntime('linux','/data/data/com.termux/files/usr'),true);
assert.equal(supportedRuntime('win32','/data/data/com.termux/files/usr'),false);
assert.equal(supportedRuntime('android','/tmp/fake-prefix'),false);
const roots=[];const write=(p,b)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,b);};
const legacy=`#!/data/data/com.termux/files/usr/bin/sh
# mhc-node-boot-managed (management services only)
termux-wake-lock >/dev/null 2>&1 || true
. /data/data/com.termux/files/usr/etc/profile.d/start-services.sh
exec /data/data/com.termux/files/usr/bin/bash "$HOME/.local/share/mhc-full-installer/bin/node-boot.sh" --once
`;
assert.equal(digest(legacy),LEGACY_BOOT_SHA);
function fixture(options={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-upgrader-test-'));roots.push(root);const home=path.join(root,'home'),prefix=path.join(root,'prefix'),pkg=path.join(root,'package');
 const cfg=path.join(home,'.config/mhc-full-installer');
 write(path.join(cfg,'installed'),'TEST 0.5.0C-REMOTE-PANEL installed on clean Termux');write(path.join(cfg,'node-identity.json'),JSON.stringify({nodeId:LAB_NODES[1]}));
 write(path.join(cfg,'authority.json'),'PRIVATE_FIXTURE_AUTHORITY');write(path.join(home,'android-hosting-panel/data/admin.json'),'PRIVATE_FIXTURE_ADMIN');
 write(path.join(home,'websites/demo/index.html'),'KEEP_SITE');write(path.join(home,'hosting-backups/mhc-full/snapshot-fixture/metadata'),'KEEP_SNAPSHOT');
 for(const n of ['amh-panel','mhc-authority-agent','sshd','mhc-panel-tunnel'])write(path.join(prefix,'var/service',n,'run'),'KEEP_SERVICE');
 write(path.join(home,'.termux/boot/10-start-hosting'),legacy);
 const files=[];function add(area,p,mode=0o600){let bytes=p.endsWith('.sh')||p==='mhc-full'?'#!/bin/sh\n# NEW_BUILD\ntrue\n':p.endsWith('.mjs')||p.endsWith('.js')?'// NEW_BUILD\nexport const fixture = 1;\n':'NEW_BUILD';
  const source='payload/'+files.length+(path.extname(p)||'.sh');write(path.join(pkg,source),bytes);files.push({area,path:p,source,sha256:digest(bytes),mode});}
 for(const p of ['bin/cluster-authority.mjs','bin/node-monitor.mjs','bin/source-upgrade.mjs','bin/node-boot.sh','bin/node-doctor.sh','bin/legacy-panel.sh'])add('managed',p,0o700);
 for(const p of PANEL_FILES){add('managed','bin/legacy-panel-src/'+p);add('panel',p);}
 add('home','mhc-full',0o700);add('boot','10-mhc-start',0o700);
 const engine='// fixture engine\n';write(path.join(pkg,'upgrader.mjs'),engine);
 const manifest={format:'mhc-source-upgrade-v1',version:'MHC-LAB-test.1',commit:'a'.repeat(40),engineSha256:digest(engine),files};write(path.join(pkg,'manifest.json'),JSON.stringify(manifest));
 let pid=100,failAgent=options.failAgent===true,failPanel=options.failPanel===true,failHealth=options.failHealth===true;const states={};const calls=[];
 const dest=e=>e.area==='managed'?path.join(home,'.local/share/mhc-full-installer',e.path):e.area==='panel'?path.join(home,'android-hosting-panel',e.path):e.area==='home'?path.join(home,e.path):path.join(home,'.termux/boot',e.path);
 for(const e of files.filter(e=>e.area!=='boot'))write(dest(e),'OLD_BUILD:'+e.path.replace(/^bin\/legacy-panel-src\//,''));
 const statesPath=n=>n==='amh-panel'?path.join(home,'android-hosting-panel/src/server.mjs'):path.join(home,'.local/share/mhc-full-installer/bin/cluster-authority.mjs');
 const services={status:n=>({...states[n]}),set:(n,up)=>{calls.push([n,up]);if(up&&n==='mhc-authority-agent'&&failAgent&&fs.readFileSync(statesPath(n),'utf8').includes('NEW_BUILD')){failAgent=false;throw Error('INJECT_AGENT_START_FAILED');}if(up&&n==='amh-panel'&&failPanel&&fs.readFileSync(statesPath(n),'utf8').includes('NEW_BUILD')){failPanel=false;throw Error('INJECT_PANEL_START_FAILED');}states[n]={running:up,pid:up?++pid:null,loaded:up?digest(fs.readFileSync(statesPath(n))):null};}};
 for(const n of ['amh-panel','mhc-authority-agent'])services.set(n,true);calls.length=0;
 const health=async(before,expected)=>{if(failHealth&&fs.readFileSync(statesPath('amh-panel'),'utf8').includes('NEW_BUILD')){failHealth=false;throw Error('INJECT_PANEL_HEALTH_FAILED');}
  for(const n of ['amh-panel','mhc-authority-agent']){assert(states[n].running);assert.notEqual(states[n].pid,before.services[n].pid);assert.equal(states[n].loaded,digest(fs.readFileSync(statesPath(n))),'process loaded current restored/applied source');}
  assert.equal(digest(fs.readFileSync(path.join(home,'android-hosting-panel/public/app.js'))),expected);return {fixture:true};};
 const u=new SourceUpgrade({home,prefix,fixture:true,services,health,syntax:(p)=>{if(fs.readFileSync(p,'utf8').includes('BAD_SYNTAX'))throw Error('SOURCE_SYNTAX_FAILED');},...options});
 const protectedFiles=['.config/mhc-full-installer/node-identity.json','.config/mhc-full-installer/authority.json','android-hosting-panel/data/admin.json','websites/demo/index.html','hosting-backups/mhc-full/snapshot-fixture/metadata'];
 const before=new Map([...files.filter(e=>e.area!=='boot').map(e=>dest(e)),path.join(home,'.termux/boot/10-start-hosting'),...protectedFiles.map(f=>path.join(home,f))].map(p=>[p,fs.readFileSync(p)]));
 return {root,home,prefix,pkg,manifest,u,services,states,calls,statesPath,before,protectedFiles,dest,save:()=>write(path.join(pkg,'manifest.json'),JSON.stringify(manifest)),unchanged:()=>{for(const [p,b]of before)assert.deepEqual(fs.readFileSync(p),b,p);assert(!fs.existsSync(path.join(home,'.termux/boot/10-mhc-start')));},protect:()=>{for(const f of protectedFiles){const p=path.join(home,f);assert.deepEqual(fs.readFileSync(p),before.get(p));}}};
}
let scenarios=0;
try{
 for(const kind of ['download','missing','hash','syntax','manifest','engine']){
  const x=fixture();if(kind==='download')x.u.acquire=async()=>{throw Error('INJECT_DOWNLOAD_FAILED');};
  if(kind==='missing')fs.unlinkSync(path.join(x.pkg,x.manifest.files[0].source));
  if(kind==='hash')write(path.join(x.pkg,x.manifest.files[0].source),'corrupt');
  if(kind==='syntax'){const e=x.manifest.files[0];write(path.join(x.pkg,e.source),'BAD_SYNTAX');e.sha256=digest('BAD_SYNTAX');x.save();}
  if(kind==='manifest'){x.manifest.files[0].path='../../.ssh/authorized_keys';x.save();}
  if(kind==='engine')write(path.join(x.pkg,'upgrader.mjs'),'wrong engine');
  await assert.rejects(x.u.apply(x.pkg));x.unchanged();assert.equal(x.calls.length,0,'pre-stage fault cannot stop real processes');scenarios++;
 }
 for(const opts of [{failHealth:true},{failAgent:true},{failPanel:true},{hook:(phase)=>{if(phase==='file-written')throw Error('INJECT_PARTIAL_WRITE');}}]){
  const x=fixture(opts);await assert.rejects(x.u.apply(x.pkg),/APPLY_FAILED_ROLLED_BACK/);x.unchanged();x.protect();assert(x.states['amh-panel'].running&&x.states['mhc-authority-agent'].running);scenarios++;
 }
 const x=fixture(),plan=await x.u.plan(x.pkg);assert.equal(plan.fileCount,x.manifest.files.length);assert.equal(x.calls.length,0);x.unchanged();
 const applied=await x.u.apply(x.pkg);assert.equal(applied.status,'APPLIED');x.protect();assert(!fs.existsSync(path.join(x.home,'.termux/boot/10-start-hosting')));
 for(const e of x.manifest.files)assert.equal(digest(fs.readFileSync(x.dest(e))),e.sha256);
 const count=x.calls.length;assert.equal((await x.u.apply(x.pkg)).status,'ALREADY_CURRENT');assert.equal(x.calls.length,count,'idempotent apply does not restart');
 assert.equal((await x.u.verify(x.pkg)).status,'VERIFIED');await x.u.rollback(applied.transaction);x.unchanged();x.protect();for(const p of PANEL_FILES)assert.deepEqual(fs.readFileSync(path.join(x.home,'android-hosting-panel',p)),fs.readFileSync(path.join(x.home,'.local/share/mhc-full-installer/bin/legacy-panel-src',p)));assert.equal((await x.u.rollback(applied.transaction)).status,'ALREADY_ROLLED_BACK');scenarios+=4;
 const wrongManifest=fixture();await assert.rejects(wrongManifest.u.apply(wrongManifest.pkg,'0'.repeat(64)),/MANIFEST_HASH_MISMATCH/);wrongManifest.unchanged();scenarios++;
 const blocked=fixture();write(path.join(blocked.home,'apps/thophuongpro/.env'),'FAKE_PRODUCTION');await assert.rejects(blocked.u.plan(blocked.pkg),/PRODUCTION/);scenarios++;
 const writer=fixture();write(path.join(writer.home,'.local/state/mhc-p33-node/state.json'),JSON.stringify({desired:'ACTIVE'}));await assert.rejects(writer.u.apply(writer.pkg),/P33_QUIESCE_MANAGED_WRITER_BEFORE_SOURCE_UPGRADE/);writer.unchanged();assert.equal(writer.calls.length,0);scenarios++;
 const unhealthy=fixture();unhealthy.states['mhc-authority-agent'].running=false;await assert.rejects(unhealthy.u.apply(unhealthy.pkg),/MANAGEMENT_NOT_HEALTHY/);unhealthy.unchanged();assert.equal(unhealthy.calls.length,0);scenarios++;
 const identity=fixture();write(path.join(identity.home,'.config/mhc-full-installer/node-identity.json'),JSON.stringify({nodeId:'00000000-0000-4000-8000-000000000001'}));await assert.rejects(identity.u.plan(identity.pkg),/NODE_NOT_APPROVED/);scenarios++;
 const n1=fixture(),id='00000000-0000-4000-8000-000000000003';
 write(path.join(n1.home,'.config/mhc-full-installer/node-identity.json'),JSON.stringify({nodeId:id,kind:'new-node-standby'}));n1.u.approvedNodeId=id;
 write(path.join(n1.home,'.local/state/mhc-new-node-install/progress.json'),JSON.stringify({nodeId:id,phase:'INSTALLED',version:'MHC-N1-fixture',commit:'a'.repeat(40),manifestSha256:'b'.repeat(64),completed:['packages','runtime','identity','panel-admin','services','verify']}));
 n1.u.shared=()=>({telemetryRecent:true});assert((await n1.u.plan(n1.pkg)).changes.length>0);n1.u.shared=()=>{throw Error('AUTHORITY_STATUS_FAILED');};await assert.rejects(n1.u.plan(n1.pkg),/AUTHORITY_STATUS_FAILED/);assert.equal(n1.calls.length,0);scenarios++;
 const shared={mode:'SHARED_AUTHORITY_PREPARE_ONLY',clusterId:'fixture',revision:36,epoch:8,pending:null,nodes:[{nodeId:id,role:'STANDBY_NO_WRITER_GRANT',telemetryRecent:true}],writeLeaseGranted:true,p33:{enabled:true,scope:'MHC_MANAGED_WORDPRESS_LAB',phase:'COMMITTED',journal:{status:'VERIFIED'},primaryNodeId:LAB_NODES[0],writerLeaseGranted:true,lease:{nodeId:LAB_NODES[0],scope:'MHC_MANAGED_WORDPRESS_LAB',epoch:8,expiresAt:Date.now()+90000}}};
 assert.equal(upgradeAuthoritySnapshot(shared,id,true).epoch,8);scenarios++;
 assert.throws(()=>upgradeAuthoritySnapshot(shared,LAB_NODES[0]),/NODE_MISSING/);
 const own=structuredClone(shared);own.nodes[0].role='PRIMARY_MANAGED_SCOPE';assert.throws(()=>upgradeAuthoritySnapshot(own,id),/QUIESCE/);scenarios++;
 for(const phase of ['FENCING','ACTIVE','AWAITING_PUBLIC']){assert.throws(()=>upgradeAuthoritySnapshot({...shared,p33:{...shared.p33,phase}},id),/TRANSITION/);}scenarios++;
 assert.throws(()=>upgradeAuthoritySnapshot({...shared,p33:{...shared.p33,lease:{...shared.p33.lease,epoch:7}}},id,true),/SAFETY/);scenarios++;
 assert.throws(()=>upgradeAuthoritySnapshot(shared,id),/SAFETY/);scenarios++;
 const unknown=fixture();write(path.join(unknown.home,'.termux/boot/10-start-hosting'),'custom boot');await assert.rejects(unknown.u.plan(unknown.pkg),/UNKNOWN_LEGACY_BOOT/);scenarios++;
 if(process.platform!=='win32'){const symlink=fixture();fs.unlinkSync(symlink.dest(symlink.manifest.files[0]));fs.symlinkSync(path.join(symlink.home,'.config/mhc-full-installer/authority.json'),symlink.dest(symlink.manifest.files[0]));await assert.rejects(symlink.u.plan(symlink.pkg),/SYMLINK/);scenarios++;}
 // Real child processes retain the source hash from startup. Apply and rollback must reload both.
 const live=fixture(),children=new Set(),runtime={};
 const serviceAdapter={status:n=>({running:!!runtime[n]&&runtime[n].child.exitCode===null&&!runtime[n].child.killed,pid:runtime[n]?.child.pid}),set:(n,up)=>{
  if(runtime[n]){runtime[n].child.kill();runtime[n]=null;}if(!up)return;
  const child=spawn(process.execPath,['-e','const f=require("node:fs"),c=require("node:crypto");console.log(c.createHash("sha256").update(f.readFileSync(process.argv[1])).digest("hex"));setInterval(()=>{},1000)',live.statesPath(n)],{stdio:['ignore','pipe','pipe']});
  children.add(child);const state={child,loaded:''};runtime[n]=state;child.stdout.on('data',b=>state.loaded+=b);child.on('exit',()=>children.delete(child));
 }};
 live.u.services=serviceAdapter;live.u.health=async(before)=>{for(let i=0;i<100;i++){if(['amh-panel','mhc-authority-agent'].every(n=>runtime[n]?.loaded.trim()===digest(fs.readFileSync(live.statesPath(n)))))break;await new Promise(r=>setTimeout(r,20));}for(const n of ['amh-panel','mhc-authority-agent']){assert.equal(runtime[n].loaded.trim(),digest(fs.readFileSync(live.statesPath(n))));assert.notEqual(runtime[n].child.pid,before.services[n].pid);}return {realChildFixture:true};};
 try{for(const n of ['amh-panel','mhc-authority-agent'])serviceAdapter.set(n,true);await new Promise(r=>setTimeout(r,100));const done=await live.u.apply(live.pkg);await live.u.rollback(done.transaction);live.unchanged();scenarios++;}
 finally{for(const c of children)c.kill();await Promise.all([...children].map(c=>c.exitCode!==null?null:new Promise(r=>c.once('exit',r))));}
 console.log(`PASS: unified source upgrade ${scenarios} fault/success/security scenarios; pre-stage download/hash/missing/syntax faults leave runtime untouched; Panel+Agent reload on apply/rollback; live/managed and protected data preserved.`);
}finally{for(const r of roots)fs.rmSync(r,{recursive:true,force:true});}
