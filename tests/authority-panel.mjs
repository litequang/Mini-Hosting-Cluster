import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const root=path.resolve(process.argv[2]||'.');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-shared-panel-'));
const previous=process.env.HOME;process.env.HOME=home;
try{
 const cfg=path.join(home,'.config/mhc-full-installer');fs.mkdirSync(cfg,{recursive:true,mode:0o700});
 const bin=path.join(home,'.local/share/mhc-full-installer/bin');fs.mkdirSync(bin,{recursive:true});
 fs.writeFileSync(path.join(cfg,'authority.json'),'invalid config',{mode:0o600});
 fs.copyFileSync(path.join(root,'bin/authority-usage.mjs'),path.join(bin,'authority-usage.mjs'));
 // Client fixture ensures bridge dispatch never executes legacy CLI or leaks its errors.
 fs.writeFileSync(path.join(bin,'cluster-authority.mjs'),`export let reads=0;export async function sharedStatus(){reads++;return {mode:'SHARED_AUTHORITY_PREPARE_ONLY',revision:4,epoch:2,nodes:[],pending:null,canComplete:false};} export async function sharedAction(b){if(b.action==='complete')throw Error('AUTHORITY_ACTION_INVALID');return {action:b.action,revision:5};}`);
 const bridge=await import(pathToFileURL(path.join(root,'bin/legacy-panel-src/src/mhc-integration.mjs')).href+'?test=shared');
 await Promise.all([bridge.mhcCluster(),bridge.mhcPrimarySelection(),bridge.mhcCluster()]);const fixture=await import(pathToFileURL(path.join(bin,'cluster-authority.mjs')).href);assert.equal(fixture.reads,1);assert.equal((await bridge.mhcCluster()).revision,4);
 assert.equal((await bridge.mhcPrimarySelection()).revision,4);
 assert.deepEqual(await bridge.mhcPrimaryAction({action:'begin'}),{action:'begin',revision:5});
 await assert.rejects(bridge.mhcPrimaryAction({action:'complete'}),/AUTHORITY_ACTION_INVALID/);
 assert.equal((await bridge.mhcAutomaticElection()).enabled,false);
 fs.mkdirSync(path.join(cfg,'p31'),{mode:0o700});fs.writeFileSync(path.join(cfg,'p31/config.json'),'{}',{mode:0o600});
 fs.writeFileSync(path.join(bin,'p31-control.mjs'),`export async function p31Readiness(){return {enabled:true,canPromote:false,nodes:[]};}export async function p31Request(id,action){if(action==='promote')throw Error('P31_UNPROVEN_WRITER_FENCING');return {nodeId:id,action,writerGranted:false};}`);
 assert.equal((await bridge.mhcPrimarySelection()).p31.canPromote,false);
 assert.equal((await bridge.mhcP31Readiness()).canPromote,false);
 assert.deepEqual(await bridge.mhcPrimaryAction({action:'p31-prepare',id:'fixture'}),{nodeId:'fixture',action:'prepare',writerGranted:false});
 for(const action of ['route','route-resume','complete'])await assert.rejects(bridge.mhcPrimaryAction({action}),/P31_CLOUDFLARE_AND_WRITER_CUTOVER_DISABLED/);
 await assert.rejects(bridge.mhcPrimaryAction({action:'p31-promote',id:'fixture'}),/UNPROVEN_WRITER_FENCING/);
 for(const [file,args] of [['manual-primary.mjs',['status']],['auto-primary.mjs',['tick']],['node-enroll.mjs',['role-accept']]]){
  const r=spawnSync(process.execPath,[path.join(root,'bin',file),...args],{env:{...process.env,HOME:home},encoding:'utf8',timeout:5000});
  assert.notEqual(r.status,0);assert.match(r.stderr,/Shared authority configured/);
 }
 // Missing module/config error -> explicit unavailable result, no local fallback.
 const other=fs.mkdtempSync(path.join(home,'other-'));process.env.HOME=other;
 fs.mkdirSync(path.join(other,'.config/mhc-full-installer'),{recursive:true});
 fs.writeFileSync(path.join(other,'.config/mhc-full-installer/authority.json'),'{}');
 const unavailable=await import(pathToFileURL(path.join(root,'bin/legacy-panel-src/src/mhc-integration.mjs')).href+'?test=missing');
 assert.equal((await unavailable.mhcCluster()).mode,'AUTHORITY_UNAVAILABLE');
 assert.equal((await unavailable.mhcPrimarySelection()).canComplete,false);
 console.log('PASS: Panel shared dispatch, unavailable state, disabled legacy role/auto paths (bridge fixture)');
}finally{if(previous===undefined)delete process.env.HOME;else process.env.HOME=previous;fs.rmSync(home,{recursive:true,force:true});}
