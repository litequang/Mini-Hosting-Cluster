// End-to-end TEST 0.3.8 SSH heartbeat with strict allowlisted member observations.
// No Android hardware, network, live database, or HA changes.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {buildClusterSummary} from '../bin/cluster-summary.mjs';
const ROOT=path.resolve(process.argv[2]||'.');
const JS=path.join(ROOT,'bin/node-enroll.mjs');
const TMP=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-member-report-'));
const CTRL=path.join(TMP,'ctrl'),NODE=path.join(TMP,'member'),BIN=path.join(TMP,'bin');
const file=(h,n)=>path.join(h,'.config/mhc-full-installer',n);
let checks=0;
function ok(cond,msg){assert.ok(cond,msg);checks++;}
function write(p,o){fs.mkdirSync(path.dirname(p),{recursive:true,mode:0o700});fs.writeFileSync(p,typeof o==='string'?o:JSON.stringify(o),{mode:0o600});}
function run(home,...args){let opts={};if(typeof args.at(-1)==='object')opts=args.pop();return spawnSync('node',[JS,...args],{
  env:{...process.env,HOME:home,PATH:`${BIN}:${process.env.PATH}`,MHC_CONTROLLER_HOME:CTRL,MHC_ENROLL_JS:JS},
  input:opts.input??'',encoding:'utf8',timeout:10000,maxBuffer:1024*1024});}
function checkRun(r,msg){ok(r.status===0,`${msg}: ${(r.stderr||'').slice(0,500)}`);}
try{
  fs.mkdirSync(BIN,{recursive:true});
  for(const h of [CTRL,NODE])write(file(h,'installed'),'TEST 0.3.8 installed on clean Termux\n');
  const ssh=path.join(BIN,'ssh');
  write(ssh,`#!/bin/sh\ncase "$*" in *heartbeat-accept*) a=heartbeat-accept;; *accept*) a=accept;; *) exit 4;; esac\nexec env HOME="$MHC_CONTROLLER_HOME" node "$MHC_ENROLL_JS" "$a"\n`);fs.chmodSync(ssh,0o700);
  checkRun(run(CTRL,'init','Lab Controller'),'controller init');
  checkRun(run(CTRL,'cluster-init'),'cluster create');
  checkRun(run(NODE,'init','Lab New Phone'),'member init');
  const invite=run(CTRL,'invite','5');checkRun(invite,'invite create');
  const code=invite.stdout.match(/^[a-zA-Z0-9_-]{32}$/m)?.[0];ok(!!code,'invite token generated');
  checkRun(run(NODE,'join','192.168.1.10','u0_a001','8022',{input:code+'\n'}),'member SSH join');
  const ctrlId=JSON.parse(fs.readFileSync(file(CTRL,'node-identity.json'))).nodeId;
  const memberId=JSON.parse(fs.readFileSync(file(NODE,'node-identity.json'))).nodeId;
  const snapshot='snapshot-20261024';
  const dir=path.join(NODE,'hosting-clones/mhc-full');
  write(path.join(dir,'receipts',`${ctrlId}-${snapshot}.json`),{sourceNodeId:ctrlId,recipientNodeId:memberId,snapshot,receivedAt:'2026-10-24T12:00:00Z',authToken:'DO_NOT_SEND_SECRET'});
  write(path.join(dir,'stage-attestations',`${ctrlId}-${snapshot}.json`),{sourceNodeId:ctrlId,snapshot,files:[],sqlPassword:'DO_NOT_SEND_SQL'});
  const lab=path.join(dir,'labs',ctrlId,snapshot);
  write(path.join(lab,'readiness.json'),{snapshot,sites:[{slug:'demo',secret:'DO_NOT_SEND_LAB'}]});
  write(path.join(lab,'lab-databases/demo.json'),{slug:'demo',status:'IMPORTED_LAB_ONLY',password:'DO_NOT_SEND_DB'});
  write(path.join(lab,'previews/demo.json'),{slug:'demo',sourceSnapshot:snapshot,sourceDbCredentialsCopied:false,originalSecrets:'DO_NOT_SEND_PREVIEW'});
  const b=path.join(NODE,'hosting-backups/mhc-full');fs.mkdirSync(path.join(b,snapshot),{recursive:true,mode:0o700});write(path.join(b,snapshot,'SHA256SUMS'),'abc\n');
  write(path.join(b,'latest-success-path'),path.join(b,snapshot)+'\n');
  const now=Date.now();
  const local=buildClusterSummary(NODE,now);
  ok(local.clone.state==='LAB_PREPARED_NOT_LIVE','local lab evidence observed');
  ok(local.clone.sqlLabRecordedCount===1&&local.clone.wpPreviewPreparedCount===1,'lab evidence counts are private-metadata-only');
  checkRun(run(NODE,'heartbeat'),'report embedded in existing pinned SSH heartbeat');
  let reg=JSON.parse(fs.readFileSync(file(CTRL,'members.json'))),entry=reg.nodes.find(n=>n.nodeId===memberId);
  ok(entry?.report?.clone?.state==='LAB_PREPARED_NOT_LIVE','controller stores authenticated member report');
  ok(entry.report.clone.sqlLabRecordedCount===1&&entry.report.clone.wpPreviewPreparedCount===1,'controller stores safe lab counters');
  ok(entry.report.backup.snapshot===snapshot&&entry.report.backup.status==='RECORDED_NOT_REVERIFIED','backup pointer recorded not reverified');
  ok(entry.report.readiness==='OBSERVED_LAB_METADATA_ONLY','readiness stays non-authoritative');
  let view=buildClusterSummary(CTRL,Date.now());let node=view.inventory.items.find(n=>n.nodeId===memberId);
  ok(node?.memberReport.state==='RECENT_AUTHENTICATED_REPORT','controller summary reports fresh authenticated observation');
  ok(node?.memberReport.evidence?.clone.labRecorded===true,'remote lab metadata shown read-only');
  ok(!node.replicaReady&&!node.haEligible&&!node.primaryVerified,'telemetry never grants HA/Primary');
  ok(!JSON.stringify(view).includes('DO_NOT_SEND_'),'no raw secrets or dump credentials in Panel view');
  ok(view.alerts.total===0,'fresh reports do not produce stale alerts (controller excluded)');
  let stale=buildClusterSummary(CTRL,Date.now()+400000);
  let old=stale.inventory.items.find(n=>n.nodeId===memberId);
  ok(old.memberReport.state!=='RECENT_AUTHENTICATED_REPORT'&&old.memberReport.evidence===null,'stale report evidence suppressed');
  ok(stale.alerts.items.some(a=>a.nodeId===memberId&&a.code==='MEMBER_REPORT_NOT_RECENT'),'stale alert generated');
  ok(stale.alerts.items.some(a=>a.nodeId===memberId&&a.code==='HEARTBEAT_NOT_RECENT'),'stale heartbeat alert generated');
  const auth=JSON.parse(fs.readFileSync(file(NODE,'node-auth.json')));
  const good=entry.report,seq=entry.heartbeatSeq;
  const request=(report,s)=>({protocol:'mhc-full-enroll-v1',nodeId:memberId,token:auth.token,seq:s,nonce:'a'.repeat(32),capability:{deviceModel:'Test'},report});
  const forged={...good,haEligible:true};
  let r=run(CTRL,'heartbeat-accept',{input:JSON.stringify(request(forged,seq+1))+'\n'});
  ok(r.status!==0,'reject extra HA authority field');
  r=run(CTRL,'heartbeat-accept',{input:JSON.stringify(request({...good,clone:{...good.clone,dbPassword:'secret'}},seq+1))+'\n'});
  ok(r.status!==0,'reject DB secret field within clone');
  r=run(CTRL,'heartbeat-accept',{input:JSON.stringify(request({...good,clone:{...good.clone,state:'HA_READY'}},seq+1))+'\n'});
  ok(r.status!==0,'reject forged ready state');
  r=run(CTRL,'heartbeat-accept',{input:JSON.stringify(request(good,seq))+'\n'});
  ok(r.status!==0,'reject replayed heartbeat');
  reg=JSON.parse(fs.readFileSync(file(CTRL,'members.json')));entry=reg.nodes.find(n=>n.nodeId===memberId);
  ok(entry.heartbeatSeq===seq,'invalid payloads never consume valid sequence');
  r=run(CTRL,'heartbeat-accept',{input:JSON.stringify(request(good,seq+1))+'\n'});
  checkRun(r,'valid report accepted after rejects');
  // Test crafted a manual direct RPC; advance only the TEST member's local counter to match.
  write(file(NODE,'node-auth.json'),{...auth,seq:seq+1});
  r=run(NODE,'heartbeat');checkRun(r,'subsequent member heartbeat works');
  checkRun(run(CTRL,'remove',memberId,'--confirm=REMOVE_FROM_INVENTORY'),'remove node');
  r=run(NODE,'heartbeat');ok(r.status!==0,'removed node can no longer submit telemetry');
  console.log(`PASS: TEST 0.3.8 member telemetry — ${checks} assertions (SSH-authenticated report, fresh/stale alerts, strict schema, replay, revocation, secret redaction, no HA claims)`);
}finally{fs.rmSync(TMP,{recursive:true,force:true});}
