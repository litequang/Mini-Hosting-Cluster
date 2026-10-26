#!/usr/bin/env node
// TEST 0.3.4: private home directories + fake SSH transport. No production systems.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const ROOT=process.argv[2];
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-clone-test-'));
const c=path.join(temp,'controller'),p=path.join(temp,'candidate'),mock=path.join(temp,'mock');
for(const home of [c,p]){fs.mkdirSync(home,{recursive:true});const cfg=path.join(home,'.config/mhc-full-installer');fs.mkdirSync(cfg,{recursive:true,mode:0o700});write(path.join(cfg,'installed'),'TEST 0.3.4 installed on clean Termux\n');fs.mkdirSync(path.join(home,'.local/share/mhc-full-installer/bin'),{recursive:true});for(const x of ['backup-verify.sh','restore.sh','safe-tar-inspect.py']){const dest=path.join(home,'.local/share/mhc-full-installer/bin',x);fs.copyFileSync(path.join(ROOT,'bin',x),dest);if(x.endsWith('.sh'))fs.writeFileSync(dest,fs.readFileSync(dest,'utf8').replace(/^#![^\n]+/, '#!/usr/bin/env bash'));fs.chmodSync(dest,0o700);}}
fs.mkdirSync(mock);const a=crypto.randomUUID(),b=crypto.randomUUID(),cl=crypto.randomUUID(),token=crypto.randomBytes(32).toString('base64url');
function write(file,raw){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof raw==='string'?raw:JSON.stringify(raw),{mode:0o600});}
function cf(home,name,obj){write(path.join(home,'.config/mhc-full-installer',name),obj);}
cf(c,'node-identity.json',{nodeId:a,label:'Clone Controller'});cf(c,'cluster.json',{clusterId:cl,controllerNodeId:a,mode:'inventory-only'});
cf(c,'members.json',{nodes:[{nodeId:a,label:'Source'},{nodeId:b,label:'Target',heartbeatTokenHash:crypto.createHash('sha256').update(token).digest('hex')}]});
cf(p,'node-identity.json',{nodeId:b,label:'Clone Receiver'});cf(p,'joined.json',{clusterId:cl,controllerNodeId:a,nodeId:b,mode:'inventory-only',controllerSSH:{host:'lab-source',user:'lab',port:8022}});cf(p,'node-auth.json',{nodeId:b,token,seq:0});
// Build a real SHA256-verified daily snapshot with static/WP/Sheet files and a fake SQL dump.
const work=path.join(temp,'archive-work');fs.mkdirSync(path.join(work,'websites/demo'),{recursive:true});write(path.join(work,'websites/demo/index.html'),'HELLO DEMO');fs.mkdirSync(path.join(work,'.config/mhc-full-installer/static'),{recursive:true});write(path.join(work,'.config/mhc-full-installer/static/demo.conf'),'SITE_SLUG=demo');
const sn=path.join(c,'hosting-backups/mhc-full/snapshot-20261024');fs.mkdirSync(path.join(sn,'databases'),{recursive:true});write(path.join(sn,'INFO.txt'),'LAB synthetic snapshot; no secrets exported');
function run(command,args,env={}){const result=spawnSync(command,args,{encoding:'utf8',env:{...process.env,...env}});return result;}
assert.equal(run('tar',['-czf',path.join(sn,'websites.tar.gz'),'-C',work,'websites']).status,0);
assert.equal(run('tar',['-czf',path.join(sn,'site-config.tar.gz'),'-C',path.join(work,'.config'),'mhc-full-installer']).status,0);
const gz=spawnSync('gzip',['-c'],{input:'CREATE TABLE demo (id int);\n'});fs.writeFileSync(path.join(sn,'databases/demo.sql.gz'),gz.stdout);assert.equal(gz.status,0);
const sheets=path.join(work,'sheets');fs.mkdirSync(sheets);write(path.join(sheets,'song.xml'),'<score-partwise/>');assert.equal(run('tar',['-czf',path.join(sn,'tpp-external-sheets.tar.gz'),'-C',work,'sheets']).status,0);
const lines=[];for(const rel of ['INFO.txt','databases/demo.sql.gz','site-config.tar.gz','tpp-external-sheets.tar.gz','websites.tar.gz']){const b=fs.readFileSync(path.join(sn,rel));lines.push(`${crypto.createHash('sha256').update(b).digest('hex')}  ./${rel}`);}write(path.join(sn,'SHA256SUMS'),lines.join('\n')+'\n');write(path.join(c,'hosting-backups/mhc-full/latest-success-path'),sn+'\n');
const fake=path.join(mock,'ssh');write(fake,`#!/usr/bin/env bash\n# Offline transport substitutes pinned-SSH. Controller code still authenticates each RPC.\nexport HOME='${c}'\nexport SSH_ORIGINAL_COMMAND='~/mhc-full clone rpc'\nexec node '${ROOT}/bin/node-enroll.mjs' rpc\n`);fs.chmodSync(fake,0o700);
const env=(home)=>({...process.env,HOME:home,PATH:mock+':'+process.env.PATH});
const script=path.join(ROOT,'bin/node-clone.mjs');
const invoke=(home,...args)=>spawnSync('node',[script,...args],{encoding:'utf8',env:env(home),timeout:60000});
try{
 let r=invoke(p,'fetch');assert.notEqual(r.status,0,'Cannot fetch before controller approves a clone');
 r=invoke(c,'offer',b,'latest','--confirm=LAB_CLONE_ONLY');assert.equal(r.status,0,r.stderr);
 r=invoke(c,'revoke',b);assert.equal(r.status,0,r.stderr);
 r=invoke(p,'fetch');assert.notEqual(r.status,0,'Revoked offer cannot be used');
 r=invoke(c,'offer',b,'latest','--confirm=LAB_CLONE_ONLY');assert.equal(r.status,0,r.stderr);
 r=invoke(p,'fetch');assert.equal(r.status,0,r.stderr);
 const dest=path.join(p,'hosting-clones/mhc-full/incoming',a,'snapshot-20261024');
 assert.equal(fs.existsSync(path.join(dest,'databases/demo.sql.gz')),true);
 assert.equal(fs.existsSync(path.join(dest,'tpp-external-sheets.tar.gz')),true);
 assert.equal(fs.existsSync(path.join(p,'websites')),false,'No active websites replaced');
 r=invoke(p,'fetch');assert.notEqual(r.status,0,'Existing completed clone must not overwrite');
 r=invoke(p,'stage');assert.equal(r.status,0,r.stderr);
 const seal=path.join(p,'hosting-clones/mhc-full/stage-attestations',`${a}-snapshot-20261024.json`);assert.equal(fs.existsSync(seal),true,'Stage must record hashed source evidence');assert.ok(JSON.parse(fs.readFileSync(seal,'utf8')).files.length>=3);
 const staged=path.join(p,'hosting-clones/mhc-full/staged',a,'snapshot-20261024');
 assert.equal(fs.readFileSync(path.join(staged,'websites/demo/index.html'),'utf8'),'HELLO DEMO');
 assert.equal(fs.readFileSync(path.join(staged,'tpp/external-sheets/sheets/song.xml'),'utf8'),'<score-partwise/>');
 assert.equal(fs.existsSync(path.join(staged,'database-dumps/demo.sql.gz')),true);
 assert.equal(fs.existsSync(path.join(p,'.config/mhc-full-installer/clone-offers.json')),false,'Offer state not installed on candidate');
 assert.notEqual(invoke(p,'stage').status,0,'No overwrite of staged files');
 write(path.join(p,'websites/index.html'),'preexisting');assert.notEqual(invoke(p,'fetch').status,0,'Existing active website blocks clone');
 // Old snapshot exposing controller identity MUST NOT be offered.
 const legacy=path.join(temp,'legacy');fs.mkdirSync(path.join(legacy,'mhc-full-installer'),{recursive:true});write(path.join(legacy,'mhc-full-installer/node-auth.json'),'EXPOSED');
 assert.equal(run('tar',['-czf',path.join(sn,'site-config.tar.gz'),'-C',legacy,'mhc-full-installer']).status,0);
 const b2=fs.readFileSync(path.join(sn,'site-config.tar.gz'));const updated=lines.map(x=>x.endsWith('site-config.tar.gz')?`${crypto.createHash('sha256').update(b2).digest('hex')}  ./site-config.tar.gz`:x);write(path.join(sn,'SHA256SUMS'),updated.join('\n')+'\n');
 assert.notEqual(invoke(c,'offer',b,'latest','--confirm=LAB_CLONE_ONLY').status,0,'Identity-containing snapshot must be rejected');
 console.log('PASS: v0.3C 2-node offline SSH clone, approval/revocation, SHA256, Sheets/SQL, staged restore, no overwrite/identity leakage');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
