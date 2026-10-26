#!/usr/bin/env node
// Real SHA256/tar/gzip fixture, no Android/SQL/production service access.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import crypto from 'node:crypto';import http from 'node:http';import net from 'node:net';import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
const root=process.argv[2],temp=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-readiness-'));
const home=path.join(temp,'candidate'),source=crypto.randomUUID(),candidate=crypto.randomUUID(),cluster=crypto.randomUUID();
const snap='snapshot-20261024',base=path.join(home,'hosting-clones/mhc-full');
const lab=path.join(base,'labs',source,snap);
const staged=path.join(base,'staged',source,snap),incoming=path.join(base,'incoming',source,snap),cfg=path.join(home,'.config/mhc-full-installer');
const write=(f,data)=>{fs.mkdirSync(path.dirname(f),{recursive:true,mode:0o700});fs.writeFileSync(f,typeof data==='string'?data:JSON.stringify(data),{mode:0o600});};
const run=(args)=>spawnSync('node',[path.join(root,'bin/node-readiness.mjs'),...args],{env:{...process.env,HOME:home},encoding:'utf8',timeout:120000});
const standby=(args,env={})=>spawnSync('node',[path.join(root,'bin/node-standby.mjs'),...args],{env:{...process.env,HOME:home,...env},encoding:'utf8',timeout:120000});
function sh(cmd,args){const r=spawnSync(cmd,args,{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
function walkEvidence(dir){let out=[];function w(d,r){for(const name of fs.readdirSync(d).sort()){const f=path.join(d,name),rel=r?`${r}/${name}`:name,st=fs.lstatSync(f);if(st.isDirectory())w(f,rel);else out.push({path:rel,size:st.size,sha256:crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')});}}w(dir,'');return out;}
try{
 fs.mkdirSync(cfg,{recursive:true,mode:0o700});
 write(path.join(cfg,'installed'),'TEST 0.3.5 installed on clean Termux\n');
 write(path.join(cfg,'joined.json'),{mode:'inventory-only',controllerNodeId:source,nodeId:candidate,clusterId:cluster});
 write(path.join(cfg,'node-identity.json'),{nodeId:candidate});
 const work=path.join(temp,'archive-work');
 write(path.join(work,'websites/demo/index.html'),'<html>Restored static demo</html>');
 write(path.join(work,'.config/mhc-full-installer/static/demo.conf'),'TYPE=static\nSITE_SLUG=demo\n');
 write(path.join(work,'websites/blog/wp-config.php'),`<?php\n\$table_prefix = 'wp_';\n// SRC_CONFIG_SENTINEL_DO_NOT_COPY\n`);
 write(path.join(work,'websites/blog/index.php'),`<?php header('Content-Type: text/plain'); echo 'LAB_PHP_OK'; ?>`);
 write(path.join(work,'websites/blog/wp-load.php'),'<?php // dummy');
 write(path.join(work,'websites/blog/wp-admin/.keep'),'');
 write(path.join(work,'websites/blog/wp-includes/.keep'),'');
 write(path.join(work,'.config/mhc-full-installer/sites/blog.env'),`SITE_SLUG=blog\nSITE_ROOT=/data/data/com.termux/files/home/websites/blog\nDB_NAME=wp_blog\n`);
 write(path.join(work,'tpp/storage/sheets/a.musicxml'),'<score-partwise/>');
 fs.mkdirSync(staged,{recursive:true,mode:0o700});fs.mkdirSync(path.join(incoming,'databases'),{recursive:true,mode:0o700});
 for(const target of [incoming]){
   sh('tar',['-czf',path.join(target,'websites.tar.gz'),'-C',work,'websites']);
   sh('tar',['-czf',path.join(target,'site-config.tar.gz'),'-C',path.join(work,'.config'),'mhc-full-installer']);
   fs.writeFileSync(path.join(target,'databases/blog.sql.gz'),spawnSync('gzip',['-c'],{input:'CREATE TABLE demo(id int);\n'}).stdout);
   write(path.join(target,'INFO.txt'),'TEST lab backup');
   const rels=['INFO.txt','databases/blog.sql.gz','site-config.tar.gz','websites.tar.gz'];
   write(path.join(target,'SHA256SUMS'),rels.map(rel=>`${crypto.createHash('sha256').update(fs.readFileSync(path.join(target,rel))).digest('hex')}  ./${rel}`).join('\n')+'\n');
 }
 // Staged tree mirrors safe-tar-extracted snapshot; mimic restore.sh layout.
 sh('tar',['-xzf',path.join(incoming,'websites.tar.gz'),'-C',staged]);
 sh('tar',['-xzf',path.join(incoming,'site-config.tar.gz'),'-C',staged]);

 fs.mkdirSync(path.join(staged,'database-dumps'),{recursive:true});
 fs.copyFileSync(path.join(incoming,'databases/blog.sql.gz'),path.join(staged,'database-dumps/blog.sql.gz'));

 // source tar contains .config/mhc-full-installer as the correct extracted path;
 // rename above handles that directory.
 const verify=path.join(home,'.local/share/mhc-full-installer/bin');fs.mkdirSync(verify,{recursive:true});
 for(const x of ['backup-verify.sh','restore.sh','safe-tar-inspect.py']){
 const contents=fs.readFileSync(path.join(root,'bin',x),'utf8').replace(/^#![^\n]+/,x.endsWith('.sh')?'#!/usr/bin/env bash':'#!/usr/bin/env python3');
 write(path.join(verify,x),contents);fs.chmodSync(path.join(verify,x),0o700);
 }
 write(path.join(base,'receipts',`${source}-${snap}.json`),{schema:1,sourceNodeId:source,recipientNodeId:candidate,clusterId:cluster,snapshot:snap,sha256sum:crypto.createHash('sha256').update(fs.readFileSync(path.join(incoming,'SHA256SUMS'))).digest('hex')});
 // Migration from 0.3.4 stage: no prior attestation. Must compare with fresh extraction.
 let r=run(['readiness']);assert.notEqual(r.status,0,'Unattested staged content must be rejected');
 r=run(['reverify-stage']);assert.notEqual(r.status,0,'Reverification requires confirmation');
 r=run(['reverify-stage','--confirm=REVERIFY_OFFLINE_STAGE']);assert.equal(r.status,0,r.stderr);
 r=run(['readiness']);assert.equal(r.status,0,r.stderr);let j=JSON.parse(r.stdout);assert.equal(j.standbyReady,false);assert.equal(j.haEligible,false);assert.equal(j.sites.length,2);assert.equal(j.allDeclaredSitesHaveFiles,true);
 assert.equal(j.sites.find(s=>s.slug==='blog').sqlImported,false);assert.equal(j.sites.find(s=>s.slug==='demo').offlineFilesComplete,true);
 r=run(['prepare-lab']);assert.notEqual(r.status,0,'Explicit approval mandatory');
 r=run(['prepare-lab','--confirm=OFFLINE_RESTORE_LAB']);assert.equal(r.status,0,r.stderr);
 assert.equal(fs.existsSync(path.join(home,'websites')),false,'Never write to active websites');
 assert.equal(fs.existsSync(path.join(home,'apps/thophuongpro')),false,'No TPP activation');
 r=run(['lab-status']);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).labPrepared,true);
 r=run(['smoke-static','demo']);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).httpStatus,200);
 r=run(['smoke-static','blog']);assert.notEqual(r.status,0,'No PHP execution or WP preview');
 // SQL lab importer MUST require explicit confirmation, use generated new schema,
 // never import with root and never touch a live DB. Fake mariadb observes calls.
 r=run(['import-sql-lab','blog']);assert.notEqual(r.status,0);
 const fakeBin=path.join(temp,'fake-bin');fs.mkdirSync(fakeBin);
 const callLog=path.join(temp,'fake-mariadb.log');
 write(path.join(fakeBin,'mariadb'),`#!/usr/bin/env bash
printf '%s\n' "$*" >> '${callLog}'
if [[ "$1" == '--no-defaults' ]];then
  cat >> '${callLog}'
  exit 0
fi
if [[ "$*" == *'SHOW TABLES;'* ]];then printf 'wp_options\nwp_posts\n'; exit 0;fi
if [[ "$*" == *'SELECT 1;'* ]];then printf '1\n'; exit 0;fi
cat >> '${callLog}'
exit 0
`);fs.chmodSync(path.join(fakeBin,'mariadb'),0o700);
 const sql=spawnSync('node',[path.join(root,'bin/node-readiness.mjs'),'import-sql-lab','blog','--confirm=CREATE_NEW_LAB_DB'],{env:{...process.env,HOME:home,PATH:fakeBin+':'+process.env.PATH},encoding:'utf8',timeout:120000});
 assert.equal(sql.status,0,sql.stderr);
 assert.equal(JSON.parse(sql.stdout).tableCount,2);
 const calls=fs.readFileSync(callLog,'utf8');
 assert.match(calls,/CREATE DATABASE `mhc_restore_blog_[a-f0-9]{8}`/);
 assert.match(calls,/GRANT ALL PRIVILEGES ON `mhc_restore_blog_[a-f0-9]{8}`/);
 assert.ok(!calls.includes('thophuong_pro'));
 assert.ok(!calls.includes('DROP DATABASE'));
 r=run(['import-sql-lab','blog','--confirm=CREATE_NEW_LAB_DB']);assert.notEqual(r.status,0,'No double lab import');

 // TEST 0.3.6: evidence status does not imply HA readiness.
 r=standby(['standby-status']);assert.equal(r.status,0,r.stderr);const st=JSON.parse(r.stdout);assert.equal(st.haEligible,false);assert.equal(st.standbyReady,false);
 r=standby(['wp-plan','blog']);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).sqlLabImported,true);
 r=standby(['wp-prepare','blog']);assert.notEqual(r.status,0,'Explicit consent required');
 r=standby(['wp-prepare','blog','--confirm=PREPARE_DISPOSABLE_WP_LAB']);assert.equal(r.status,0,r.stderr);
 const previewPath=path.join(lab,'previews/blog');const config=fs.readFileSync(path.join(previewPath,'wp-config.php'),'utf8');
 assert.ok(!config.includes('SRC_CONFIG_SENTINEL_DO_NOT_COPY'),'Never copy restored wp-config.php');
 assert.match(config,/mhc_restore_blog_[a-f0-9]{8}/);assert.match(config,/\$table_prefix = "wp_"/);
 sh('php',['-l',path.join(previewPath,'wp-config.php')]);
 r=standby(['wp-prepare','blog','--confirm=PREPARE_DISPOSABLE_WP_LAB']);assert.notEqual(r.status,0,'No WP preview overwrite');
 r=standby(['wp-probe','blog'],{PATH:fakeBin+':'+process.env.PATH});assert.notEqual(r.status,0,'Executing PHP requires explicit permission');
 r=standby(['wp-probe','blog','--confirm=EXECUTE_RESTORED_PHP_ON_DISPOSABLE_LAB'],{PATH:fakeBin+':'+process.env.PATH});assert.equal(r.status,0,r.stderr);
 const wpSmoke=JSON.parse(r.stdout);assert.equal(wpSmoke.observedHttpStatus,200);assert.equal(wpSmoke.phpFpmVerified,false);assert.equal(wpSmoke.standbyReady,false);
 fs.appendFileSync(path.join(previewPath,'index.php'),'\n// CHANGED AFTER CONSENT\n');
 r=standby(['wp-probe','blog','--confirm=EXECUTE_RESTORED_PHP_ON_DISPOSABLE_LAB'],{PATH:fakeBin+':'+process.env.PATH});assert.notEqual(r.status,0,'Modified preview must fail closed');
 // Actual HTTP server: loopback-only and no file traversal, PHP, or secrets.
 const port=await new Promise((resolve,reject)=>{const listener=net.createServer();listener.once('error',reject);listener.listen(0,'127.0.0.1',()=>{const p=listener.address().port;listener.close(()=>resolve(p));});});
 let child=spawn('node',[path.join(root,'bin/node-standby.mjs'),'serve-static','demo',String(port),'--confirm=SERVE_LAB_STATIC_ONLY'],{env:{...process.env,HOME:home},stdio:['ignore','pipe','pipe']});
 try{
   let message='';child.stdout.on('data',b=>message+=b.toString());let ready=false;for(let i=0;i<60;i++){if(message.includes('STATIC_LAB_PREVIEW')){ready=true;break;}await new Promise(done=>setTimeout(done,50));}assert.ok(ready,'Lab HTTP preview did not start');
   const get=(url,method='GET')=>new Promise((resolve,reject)=>{const q=http.request({hostname:'127.0.0.1',port,path:url,method,timeout:3000},res=>{let content='';res.on('data',x=>content+=x);res.once('end',()=>resolve({code:res.statusCode,content,headers:res.headers}));});q.once('error',reject);q.end();});
   let resp=await get('/');assert.equal(resp.code,200);assert.match(resp.content,/Restored static demo/);assert.equal(resp.headers['x-mhc-lab'],'static-preview-not-standby');
   resp=await get('/.hidden');assert.equal(resp.code,403);resp=await get('/wp-config.php');assert.equal(resp.code,403);
   resp=await get('/%2e%2e/%2e%2e/etc/passwd');assert.ok([403,404].includes(resp.code));
   resp=await get('/', 'POST');assert.equal(resp.code,405);
 }finally{child.kill('SIGTERM');await new Promise(done=>{if(child.exitCode!==null)return done();child.once('close',done);setTimeout(()=>{child.kill('SIGKILL');done();},1000);});}


 r=run(['prepare-lab','--confirm=OFFLINE_RESTORE_LAB']);assert.notEqual(r.status,0,'Cannot overwrite existing lab');
 fs.appendFileSync(path.join(lab,'payload/websites/demo/index.html'),'TAMPER');
 r=run(['lab-status']);assert.notEqual(r.status,0,'Cannot claim lab ready after file tampering');
 fs.symlinkSync('/etc/passwd',path.join(staged,'websites/demo/passwd-link'));
 r=run(['readiness']);assert.notEqual(r.status,0,'Unsafe staged symlink prohibited');
 fs.unlinkSync(path.join(staged,'websites/demo/passwd-link'));
 write(path.join(home,'websites/active/index.html'),'do not touch');
 r=run(['readiness']);assert.notEqual(r.status,0,'Active candidate website requires manual recovery plan');
 console.log('PASS: 0.3.6 standby foundation; offline restore+SQL, read-only static HTTP preview, guarded WordPress PHP lab probe, no-HA safeguards');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
