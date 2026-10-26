#!/usr/bin/env node
// Real SHA256/tar/gzip fixture, no Android/SQL/production service access.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const root=process.argv[2],temp=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-readiness-'));
const home=path.join(temp,'candidate'),source=crypto.randomUUID(),candidate=crypto.randomUUID(),cluster=crypto.randomUUID();
const snap='snapshot-20261024',base=path.join(home,'hosting-clones/mhc-full');
const staged=path.join(base,'staged',source,snap),incoming=path.join(base,'incoming',source,snap),cfg=path.join(home,'.config/mhc-full-installer');
const write=(f,data)=>{fs.mkdirSync(path.dirname(f),{recursive:true,mode:0o700});fs.writeFileSync(f,typeof data==='string'?data:JSON.stringify(data),{mode:0o600});};
const run=(args)=>spawnSync('node',[path.join(root,'bin/node-readiness.mjs'),...args],{env:{...process.env,HOME:home},encoding:'utf8',timeout:120000});
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
 write(path.join(work,'websites/blog/wp-config.php'),'<?php // lab data only');
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

 r=run(['prepare-lab','--confirm=OFFLINE_RESTORE_LAB']);assert.notEqual(r.status,0,'Cannot overwrite existing lab');
 const lab=path.join(base,'labs',source,snap);
 fs.appendFileSync(path.join(lab,'payload/websites/demo/index.html'),'TAMPER');
 r=run(['lab-status']);assert.notEqual(r.status,0,'Cannot claim lab ready after file tampering');
 fs.symlinkSync('/etc/passwd',path.join(staged,'websites/demo/passwd-link'));
 r=run(['readiness']);assert.notEqual(r.status,0,'Unsafe staged symlink prohibited');
 fs.unlinkSync(path.join(staged,'websites/demo/passwd-link'));
 write(path.join(home,'websites/active/index.html'),'do not touch');
 r=run(['readiness']);assert.notEqual(r.status,0,'Active candidate website requires manual recovery plan');
 console.log('PASS: 0.3.5 offline readiness+WordPress/SQL evidence, private lab copy, SHA tamper, static HTTP smoke, active-site/symlink/no-overwrite safeguards');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
