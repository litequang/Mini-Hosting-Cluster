import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const cli=path.resolve(import.meta.dirname,'../src/cli.mjs');
function call(home,...args){let r=spawnSync(process.execPath,[cli,...args],{env:{...process.env,HOME:home},encoding:'utf8',timeout:2000});return r;}
test('init primary and reject destructive re-init',()=>{
 const h=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-'));
 try {fs.mkdirSync(path.join(h,'apps/thophuongpro'),{recursive:true});fs.writeFileSync(path.join(h,'apps/thophuongpro/.env'),'MYSQL_DATABASE=thophuong_pro\n');
 let r=call(h,'init-primary','M51','--confirm=PRIMARY');assert.equal(r.status,0,r.stderr);
 const c=JSON.parse(fs.readFileSync(path.join(h,'.config/mini-hosting-cluster/node.json')));
 assert.equal(c.role,'primary');assert.match(c.clusterId,/^[0-9a-f-]{36}$/);
 r=call(h,'init-primary','M51','--confirm=PRIMARY');assert.notEqual(r.status,0);
 r=call(h,'register',c.clusterId,crypto.randomUUID(),'X7b','192.168.1.35','u0_a210','8022');assert.equal(r.status,0,r.stderr);
 r=call(h,'roster-json');const x=JSON.parse(r.stdout);assert.equal(x.nodes.length,1);assert.equal(x.nodes[0].label,'X7b');
 r=call(h,'register',crypto.randomUUID(),crypto.randomUUID(),'Evil','192.168.1.80','hacker','8022');assert.notEqual(r.status,0);
 r=call(h,'status-json');const st=JSON.parse(r.stdout);assert.equal(st.declaredRole,'primary');assert.equal(st.nodes.length,1);
 const item=x.nodes[0];r=call(h,'heartbeat',c.clusterId,item.nodeId,Buffer.from(JSON.stringify({nodeId:item.nodeId,clusterId:c.clusterId,role:'standby',services:{mysqld:'run',tunnel:'down'},storage:{availableMiB:5300},snapshotApplied:'snapshot-20261024-030351-840'})).toString('base64'));
 assert.equal(r.status,0,r.stderr);r=call(h,'roster-json');const z=JSON.parse(r.stdout);assert.equal(z.nodes[0].online,true);assert.equal(z.nodes[0].health.services.tunnel,'down');
 }finally{fs.rmSync(h,{recursive:true,force:true});}
});
test('node cannot initialize primary without explicit confirmation',()=>{
 const h=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-'));
 try{fs.mkdirSync(path.join(h,'apps/thophuongpro'),{recursive:true});fs.writeFileSync(path.join(h,'apps/thophuongpro/.env'),'');
  let r=call(h,'init-primary','M51');assert.notEqual(r.status,0);assert.equal(fs.existsSync(path.join(h,'.config/mini-hosting-cluster/node.json')),false);
 }finally{fs.rmSync(h,{recursive:true,force:true});}
});
