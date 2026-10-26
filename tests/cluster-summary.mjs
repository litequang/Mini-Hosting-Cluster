// TEST 0.3.7: isolated local-only Cluster overview, no production network.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {buildClusterSummary} from '../bin/cluster-summary.mjs';
const HOME=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-cluster-summary-'));
let n=0;const ok=(v,msg)=>{assert.ok(v,msg);n++;};
const now=Date.parse('2026-10-24T12:00:00.000Z');
const dir=path.join(HOME,'.config/mhc-full-installer');fs.mkdirSync(dir,{recursive:true,mode:0o700});
const put=(name,content)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(content),{mode:0o600});
const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002',c='10000000-0000-4000-8000-000000000003';
try{
 let report=buildClusterSummary(HOME,now);ok(report.mode==='STANDALONE_OR_UNVERIFIED','uninitialized node status');ok(report.capabilities.haEligible===false,'no HA eligibility');
 put('node-identity.json',{nodeId:a,label:'Lab Controller',extraSecret:'NEVER-SHOW'});
 put('cluster.json',{clusterId:b,controllerNodeId:a,mode:'inventory-only'});
 put('members.json',{schema:1,nodes:[
  {nodeId:a,label:'Local',capability:{deviceModel:'Android',memoryMiB:3000},lastSeenAt:new Date(now-500).toISOString()},
  {nodeId:c,label:'<script>evil()</script>',capability:{deviceModel:'X7b',memoryMiB:4500},heartbeatTokenHash:'SECRET_TOKEN_HASH',lastSeenAt:new Date(now-190000).toISOString()}]});
 put('clone-offers.json',{offers:{[c]:{snapshot:'snapshot-20261024',expiresAt:now+3600000,secret:'UNSAFE_OFFER_SECRET'}}});
 report=buildClusterSummary(HOME,now);
 ok(report.mode==='INVENTORY_CONTROLLER','is controller');ok(report.inventory.total===2,'all nodes');
 ok(report.inventory.items[0].heartbeat==='RECENT_AUTHENTICATED','recent HB observation');
 ok(report.inventory.items[1].heartbeat==='STALE','stale HB observation');
 ok(report.inventory.items[1].cloneOffer==='APPROVED_NOT_CLONED','clone offer not readiness');
 ok(!JSON.stringify(report).includes('SECRET_TOKEN_HASH')&&!JSON.stringify(report).includes('UNSAFE_OFFER_SECRET'),'no secret leaks');
 ok(!JSON.stringify(report).includes('NEVER-SHOW'),'identity allowlist');
 ok(report.inventory.items.every(x=>x.replicated===false),'no invented replica');
 ok(report.capabilities.cloudflareRoutingVerified===false,'no cloud routing claims');
 put('clone-offers.json',{offers:{[c]:{expiresAt:now-1}}});report=buildClusterSummary(HOME,now);ok(report.inventory.items[1].cloneOffer==='EXPIRED','expired offer');
 const backups=path.join(HOME,'hosting-backups/mhc-full'),snap=path.join(backups,'snapshot-20261024');
 fs.mkdirSync(snap,{recursive:true,mode:0o700});fs.writeFileSync(path.join(snap,'SHA256SUMS'),'example',{mode:0o600});
 fs.writeFileSync(path.join(backups,'latest-success-path'),snap+'\n',{mode:0o600});
 report=buildClusterSummary(HOME,now);ok(report.backup.status==='RECORDED_NOT_REVERIFIED','recorded pointer not verified');
 fs.writeFileSync(path.join(backups,'latest-success-path'),'/etc/passwd\n',{mode:0o600});
 report=buildClusterSummary(HOME,now);ok(report.backup.status==='NOT_VERIFIED','invalid pointer safely rejected');
 fs.writeFileSync(path.join(backups,'latest-success-path'),snap+'\n');fs.chmodSync(path.join(backups,'latest-success-path'),0o644);
 report=buildClusterSummary(HOME,now);ok(report.backup.status==='NOT_VERIFIED','weak permissions rejected');
 fs.writeFileSync(path.join(backups,'latest-success-path'),snap+'\n');fs.chmodSync(path.join(backups,'latest-success-path'),0o600);
 fs.chmodSync(path.join(dir,'members.json'),0o644);
 report=buildClusterSummary(HOME,now);ok(report.inventory.total===0&&report.warnings.length>0,'unsafe member data withheld');
 fs.chmodSync(path.join(dir,'members.json'),0o600);
 fs.rmSync(path.join(dir,'cluster.json'));put('joined.json',{nodeId:a,controllerNodeId:b,clusterId:b,mode:'inventory-only',heartbeatToken:'HIDDEN'});
 const receipts=path.join(HOME,'hosting-clones/mhc-full/receipts');fs.mkdirSync(receipts,{recursive:true,mode:0o700});
 fs.writeFileSync(path.join(receipts,`${b}-snapshot-20261024.json`),JSON.stringify({sourceNodeId:b,recipientNodeId:a,snapshot:'snapshot-20261024',receivedAt:'2026-10-24T11:00:00Z',privateToken:'HIDDEN-RECEIPT'}),{mode:0o600});
 report=buildClusterSummary(HOME,now);ok(report.mode==='ENROLLED_MEMBER'&&report.clone.state==='RECEIPT_RECORDED_NOT_REVERIFIED','candidate receipt metadata');
 ok(!JSON.stringify(report).includes('HIDDEN'),'candidate secret not leaked');
 const at=path.join(HOME,'hosting-clones/mhc-full/stage-attestations');fs.mkdirSync(at,{recursive:true,mode:0o700});
 fs.writeFileSync(path.join(at,`${b}-snapshot-20261024.json`),JSON.stringify({sourceNodeId:b,snapshot:'snapshot-20261024',files:[],private:'NOPE'}),{mode:0o600});
 report=buildClusterSummary(HOME,now);ok(report.clone.state==='STAGE_RECORDED_NOT_REVERIFIED','stage claims only metadata');
 const lab=path.join(HOME,'hosting-clones/mhc-full/labs',b,'snapshot-20261024');fs.mkdirSync(lab,{recursive:true,mode:0o700});
 fs.writeFileSync(path.join(lab,'readiness.json'),JSON.stringify({snapshot:'snapshot-20261024',sites:[{slug:'demo',databasePassword:'NOPE2'}]}),{mode:0o600});
 report=buildClusterSummary(HOME,now);ok(report.clone.state==='LAB_PREPARED_NOT_LIVE','lab reported accurately');ok(!JSON.stringify(report).includes('NOPE2'),'no restore secrets');
 fs.mkdirSync(path.join(HOME,'apps/thophuongpro'),{recursive:true});fs.writeFileSync(path.join(HOME,'apps/thophuongpro/.env'),'NOPE3');
 report=buildClusterSummary(HOME,now);ok(report.warnings.some(x=>x.includes('production/HA')),'production warning');ok(!JSON.stringify(report).includes('NOPE3'),'no prod secret output');
 console.log(`PASS: TEST 0.3.8 cluster summary — ${n} assertions (no HA claims, freshness, snapshot pointer, secrets, permission failure, lab receipt)`);
}finally{fs.rmSync(HOME,{recursive:true,force:true});}
