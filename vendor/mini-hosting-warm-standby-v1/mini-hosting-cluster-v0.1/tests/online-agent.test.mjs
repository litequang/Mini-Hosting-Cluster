import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const agent=path.resolve(import.meta.dirname,'../src/online-agent.mjs');
test('cloud agent refuses to enroll without cluster identity and prints no token in status',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloud-agent-'));
 try{
 let r=spawnSync(process.execPath,[agent,'status'],{env:{...process.env,HOME:home},encoding:'utf8',timeout:3000});
 assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/"configured": false/);assert.doesNotMatch(r.stdout,/password|tokenValue/);
 r=spawnSync(process.execPath,[agent,'enroll','bad'],{env:{...process.env,HOME:home},encoding:'utf8',timeout:3000});
 assert.notEqual(r.status,0);assert.match(r.stderr,/identity missing/i);
 }finally{fs.rmSync(home,{recursive:true,force:true});}
});
