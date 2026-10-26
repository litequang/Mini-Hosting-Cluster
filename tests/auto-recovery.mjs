import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const HOME=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-recovery-'));process.env.HOME=HOME;
const mod=await import('../bin/auto-primary.mjs');
const ctrl='11111111-1111-4111-8111-111111111111',a='22222222-2222-4222-8222-222222222222',b='33333333-3333-4333-8333-333333333333',cluster='99999999-9999-4999-8999-999999999999';
const dir=path.join(HOME,'.config/mhc-full-installer');const prim=path.join(dir,'manual-primary');fs.mkdirSync(prim,{recursive:true,mode:0o700});
const put=(folder,name,v)=>fs.writeFileSync(path.join(folder,name),JSON.stringify(v),{mode:0o600});
put(dir,'node-identity.json',{nodeId:ctrl});put(dir,'cluster.json',{clusterId:cluster,controllerNodeId:ctrl,mode:'inventory-only'});
const now=new Date().toISOString(),old=new Date(Date.now()-600000).toISOString();
put(dir,'members.json',{nodes:[{nodeId:ctrl,lastSeenAt:now,verification:'local-controller'},
 {nodeId:a,lastSeenAt:old,verification:'ssh-authenticated-pairing-only'},
 {nodeId:b,lastSeenAt:now,verification:'ssh-authenticated-pairing-only',reportReceivedAt:now,report:{backup:{snapshot:'snapshot-20261026'}},capability:{memoryMiB:4096,freeDiskMiB:9000}}]});
put(prim,'selection.json',{schema:1,declaredPrimary:{nodeId:a},pending:null,revision:0});
const tunnelA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.cfargotunnel.com';const tunnelB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.cfargotunnel.com';
const tokenDir=path.join(HOME,'secret');fs.mkdirSync(tokenDir,{mode:0o700});const token=path.join(tokenDir,'cloudflare-token');fs.writeFileSync(token,'z'.repeat(40),{mode:0o600});
put(prim,'auto-config.json',{schema:1,enabled:true,mode:'BEST_EFFORT_ROUTE',timeoutMs:180000,iAcceptSplitBrainRisk:true,independentControllerDeclared:true,oldNodeRejoinGuardDeclared:true,cloudflare:{zoneId:'c'.repeat(32),recordId:'d'.repeat(32),hostname:'lab.example.org',nodeTargets:{[a]:tunnelA,[b]:tunnelB},tokenFile:token}});
let actual=tunnelA,failedOnce=false,patches=0,checks=0;
const spy=async(_url,req)=>{
 if(req.method==='PATCH'){patches++;actual=JSON.parse(req.body).content;return {ok:true,status:200,text:async()=>JSON.stringify({success:true,result:{}})};}
 if(req.method==='GET'&&actual===tunnelB&&!failedOnce){failedOnce=true;throw Error('NETWORK_LOST_AFTER_DNS_PATCH');}
 return {ok:true,status:200,text:async()=>JSON.stringify({success:true,result:{name:'lab.example.org',type:'CNAME',content:actual,proxied:true}})};
};
const originalFetch=globalThis.fetch;globalThis.fetch=spy;
try{
 await assert.rejects(mod.main(['tick']),/NETWORK_LOST_AFTER_DNS_PATCH/);checks++;
 assert.equal(patches,1);checks++;
 assert.equal(JSON.parse(fs.readFileSync(path.join(prim,'route-pending.json'))).to,b);checks++;
 assert.equal(JSON.parse(fs.readFileSync(path.join(prim,'selection.json'))).declaredPrimary.nodeId,a);checks++;
 const done=await mod.main(['tick']);assert.equal(done.action,'ROUTE_SWITCHED_BEST_EFFORT');checks++;
 assert.equal(patches,1);checks++;
 assert.equal(JSON.parse(fs.readFileSync(path.join(prim,'selection.json'))).declaredPrimary.nodeId,b);checks++;
 assert.equal(fs.existsSync(path.join(prim,'route-pending.json')),false);checks++;
 const status=await mod.main(['status']);assert.ok(status.quarantined.some(x=>x.nodeId===a));checks++;
 const role=await mod.main(['role',a]);assert.equal(role.role,'STANDBY');assert.equal(role.quarantined,true);checks++;
 await assert.rejects(mod.main(['rejoin',b,'--confirm=QUARANTINE_OLD_PRIMARY']),/Cannot quarantine currently recorded Primary/);checks++;
 assert.equal((await mod.main(['status'])).chosenCandidate,null);checks++;
}finally{globalThis.fetch=originalFetch;fs.rmSync(HOME,{recursive:true,force:true});}
console.log(`PASS: ${checks} auto-route recovery assertions`);
