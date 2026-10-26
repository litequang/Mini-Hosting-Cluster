// MHC v0.4A observer read-only / integrity regressions (Linux fake HOME; no MariaDB modifications).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
const root=path.resolve(process.argv[2]||'.');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-repl-test-'));
const home=path.join(folder,'home'),bin=path.join(folder,'bin');
const cli=path.join(root,'bin/replication-observer.mjs');
function run(mode,expect=0){
 const x=spawnSync(process.execPath,[cli,mode],{env:{...process.env,HOME:home,PATH:bin+':'+process.env.PATH},encoding:'utf8',timeout:20000});
 assert.equal(x.status,expect,`command ${mode} failed ${x.stderr}`);
 return expect===0?JSON.parse(x.stdout):x.stderr;
}
try{
 fs.mkdirSync(bin,{recursive:true});fs.mkdirSync(path.join(home,'.config/mhc-full-installer/static'),{recursive:true});
 fs.mkdirSync(path.join(home,'websites/demo'),{recursive:true});
 fs.writeFileSync(path.join(home,'.config/mhc-full-installer/static/demo.conf'),'DB_PASSWORD=CONFIDENTIAL-MUST-NOT-READ\n');
 fs.writeFileSync(path.join(home,'websites/demo/index.html'),'before');
 fs.writeFileSync(path.join(home,'websites/demo/.env'),'SECRET=NO_SCAN');
 fs.writeFileSync(path.join(bin,'mariadb'),`#!/bin/sh\nprintf '123\\t1\\t0\\t1\\t0-123-21\\t0-123-20\\n'\n`,{mode:0o700});
 let a=run('gtid');assert.equal(a.serverId,123);assert.equal(a.binaryLogEnabled,true);
 assert.equal(a.replicationVerified,false);assert(!JSON.stringify(a).includes('CONFIDENTIAL'));
 a=run('status');assert.equal(a.mode,'NOT_SCANNED');
 a=run('scan');assert.equal(a.baseline,true);assert.equal(a.files,1);assert.equal(a.gtid.gtidBinlogPos,'0-123-21');
 a=run('status');assert.equal(a.mode,'LOCAL_OBSERVATION_ONLY');assert.equal(a.files,1);
 assert.equal(a.haEligible,false);assert.equal(a.fileReplicationVerified,false);
 assert(!JSON.stringify(a).includes('index.html'));assert(!JSON.stringify(a).includes('NO_SCAN'));
 let report=JSON.parse(fs.readFileSync(path.join(home,'.local/share/mhc-full-installer/observer/latest.json'),'utf8'));
 assert.deepEqual(Object.keys(report.files),['static:demo/index.html']);
 assert.equal(fs.statSync(path.join(home,'.local/share/mhc-full-installer/observer/latest.json')).mode&0o777,0o600);
 fs.writeFileSync(path.join(home,'websites/demo/index.html'),'after');
 fs.writeFileSync(path.join(home,'websites/demo/new.txt'),'new file');
 a=run('scan');assert.equal(a.modified,1);assert.equal(a.added,1);assert.equal(a.removed,0);
 fs.rmSync(path.join(home,'websites/demo/index.html'));
 a=run('scan');assert.equal(a.removed,1);assert.equal(a.added,0);
 fs.symlinkSync(path.join(folder,'elsewhere'),path.join(home,'websites/demo/link'));
 let err=run('scan',1);assert.match(err,/Symlink/);
 const current=run('status');assert.equal(current.files,1,'Failed scan must not overwrite committed manifest');
 fs.rmSync(path.join(home,'websites/demo/link'));
 fs.rmSync(path.join(home,'websites/demo'),{recursive:true});fs.symlinkSync(bin,path.join(home,'websites/demo'));
 err=run('scan',1);assert.match(err,/Unsafe directory|Symlink/);
 assert.equal(run('status').files,1);
 console.log('PASS: v0.4A GTID read-only probe, baseline/add/modify/remove SHA manifests, secret exclusion, atomic fail-closed symlink handling, no HA/replication claims');
}finally{fs.rmSync(folder,{recursive:true,force:true});}
