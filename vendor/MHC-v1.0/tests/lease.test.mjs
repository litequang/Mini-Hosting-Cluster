import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import os from 'node:os';import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-lease-'));process.env.MHC_HOME=dir;
const {writeJson,closeLease,leasePath,currentlyLeased,machineBoot}=await import('../agent/common.mjs');
const c={nodeId:'m51'};
test('lease defaults to fail closed',()=>{
 assert.equal(currentlyLeased(c),false);closeLease();assert.equal(currentlyLeased(c),false);
});
test('lease is bound to node, term, both clocks, and same Android boot',()=>{
 const grant={role:'primary',owner:'m51',term:3,bootId:machineBoot(),deadlineEpochMs:Date.now()+10000,deadlineUptimeSec:os.uptime()+10};
 writeJson(leasePath,grant);assert.equal(currentlyLeased(c),true);assert.equal(currentlyLeased({nodeId:'x7b'}),false);
 writeJson(leasePath,{...grant,deadlineUptimeSec:os.uptime()-1});assert.equal(currentlyLeased(c),false);
 writeJson(leasePath,{...grant,bootId:'fake-old-boot'});assert.equal(currentlyLeased(c),false);
 writeJson(leasePath,{...grant,deadlineEpochMs:Date.now()-1});assert.equal(currentlyLeased(c),false);
});
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
