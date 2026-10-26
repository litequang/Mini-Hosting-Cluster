import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root=process.argv[2]||process.cwd();
const {collectField,verifyField,validateFieldConfig,fixedSshArgs,plan,loadConfig}=await import(pathToFileURL(path.join(root,'bin/field-lab-coordinator.mjs')));
const {generateIdentity,createSignedEnvelope,preflightIdentity}=await import(pathToFileURL(path.join(root,'bin/physical-lab-attest.mjs')));
let n=0;
const ok=(val,desc)=>{assert.ok(val,desc);n++};
const throws=(fn,desc)=>{assert.throws(fn,undefined,desc);n++};
const rejects=async(fn,desc)=>{await assert.rejects(fn,undefined,desc);n++};
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-field-test-'));fs.chmodSync(temp,0o700);
try{
 const key=path.join(temp,'id_ed25519'),kh=path.join(temp,'known_hosts'),configFile=path.join(temp,'config.json');
 fs.writeFileSync(key,'TEST SSH PRIVATE KEY FIXTURE ONLY',{mode:0o600});
 fs.writeFileSync(kh,'192.168.100.61 ssh-ed25519 AAAATestPin\n',{mode:0o600});
 const a=generateIdentity(),b=generateIdentity();const bootA=crypto.randomBytes(32).toString('hex'),bootB=crypto.randomBytes(32).toString('hex'),tree=crypto.randomBytes(32).toString('hex');
 const challenge=crypto.randomBytes(24).toString('hex');
 const c={schema:1,scope:'MHC_PHYSICAL_EVIDENCE_LAB_ONLY_NO_HA',outputRoot:temp,
  ssh:{privateKey:key,knownHosts:kh},nodes:[
   {role:'source',host:'192.168.100.61',port:8022,user:'u0_a180',pinnedIdentityFingerprint:a.identity.fingerprint},
   {role:'replica',host:'192.168.100.62',port:8022,user:'u0_a181',pinnedIdentityFingerprint:b.identity.fingerprint}]};
 fs.writeFileSync(configFile,JSON.stringify(c),{mode:0o600});
 ok(validateFieldConfig(c).source.host==='192.168.100.61','Safe config allowed');
 ok(loadConfig(configFile).nodes.length===2,'Private config loading');
 ok(plan().canSwitchPrimary===false&&!plan().liveWrites,'Planning is non-mutating, no authority');
 const args=fixedSshArgs(c,c.nodes[0],'cd && ./mhc-full physical-accept preflight');
 ok(args.includes('StrictHostKeyChecking=yes')&&args.includes('BatchMode=yes')&&args.includes('ClearAllForwardings=yes'),'SSH hardening options');
 ok(args.includes('IdentitiesOnly=yes')&&args.includes('PermitLocalCommand=no'),'SSH no ambient keys/local command');
 ok(args[args.length-1]==='cd && ./mhc-full physical-accept preflight','Only fixed remote command');
 throws(()=>fixedSshArgs(c,c.nodes[0],'rm -rf ~'),'Disallows arbitrary remote command');
 for(const [field,change] of [
  ['production M51',d=>d.nodes[0].host='192.168.1.43'],
  ['production X7b',d=>d.nodes[0].host='192.168.1.35'],
  ['active Vsmart',d=>d.nodes[0].host='192.168.100.27'],
  ['public address',d=>d.nodes[0].host='8.8.8.8'],
  ['local address',d=>d.nodes[0].host='127.0.0.1'],
  ['IP option injection',d=>d.nodes[0].host='-oProxyCommand=evil'],
  ['SSH name injection',d=>d.nodes[0].user='root'],
  ['user shell injection',d=>d.nodes[0].user='u0_a1;echo pwn'],
  ['wrong SSH port',d=>d.nodes[0].port=22],
  ['duplicate IP',d=>d.nodes[0].host=d.nodes[1].host],
  ['duplicate key',d=>d.nodes[0].pinnedIdentityFingerprint=d.nodes[1].pinnedIdentityFingerprint],
  ['wrong scope',d=>d.scope='PRODUCTION'],
  ['only 1 node',d=>d.nodes.pop()],
  ['swapped role',d=>d.nodes[1].role='source'],
  ['relative key',d=>d.ssh.privateKey='id_ed25519']]){
  const clone=structuredClone(c);change(clone);throws(()=>validateFieldConfig(clone),`Reject ${field}`);
 }
 const payload=(role)=>({schema:1,scope:c.scope,nodeId:(role==='source'?a:b).identity.nodeId,role,challenge,
  measuredAt:new Date().toISOString(),bootFingerprint:role==='source'?bootA:bootB,
  file:{observed:true,fileCount:1,totalBytes:4,treeSha256:tree},
  maria:role==='source'?{observed:true,serverId:100,readOnly:false,gtidBinlogPos:'0-100-90',channelCount:0,ioRunning:false,sqlRunning:false}:
   {observed:true,serverId:200,readOnly:true,gtidSlavePos:'0-100-90',channelCount:1,ioRunning:true,sqlRunning:true,usingGtid:'SLAVE_POS'},
  guard:{isolatedLab:true},authority:{canSwitchPrimary:false,actualFencingVerified:false,haEligible:false}});
 const byRole={source:a,replica:b};
 const evidence={source:createSignedEnvelope(payload('source'),a.privateKeyPem),replica:createSignedEnvelope(payload('replica'),b.privateKeyPem)};
 let calls=[];
 const fake=async(args,{role,stage})=>{
  calls.push({args,role,stage});
  if(stage==='preflight')return JSON.stringify({status:'ISOLATED_LAB_PREFLIGHT_PASS',scope:c.scope,identity:byRole[role].identity,
   captureAvailable:true,canSwitchPrimary:false,canArmHA:false,canModifyRouting:false});
  if(stage==='capture')return JSON.stringify({status:'SIGNED_OBSERVATION_RECORDED',role,nodeId:byRole[role].identity.nodeId,canSwitchPrimary:false});
  return JSON.stringify(evidence[role]);
 };
 const {runDir,summary}=await collectField(c,fake,{challenge});
 ok(summary.result.observationGatePassed,'Two independently signed observations pass');
 ok(summary.result.canSwitchPrimary===false&&summary.assertions.oldPrimaryFenced===false,'No promotion/fencing claims');
 ok(summary.assertions.livePhysicalSeparationProven===false,'SSH endpoints do not prove hardware separation');
 ok(calls.length===6,'Two preflights, two captures, two signed report reads');
 ok(calls[0].stage==='preflight'&&calls[1].stage==='preflight'&&calls[2].stage==='capture','Identity pin preflight before captures');
 ok(calls.every(c=>c.args.at(-1).startsWith('cd && ')),'Static remote commands only');
 ok(fs.statSync(runDir).mode&0o077?false:true,'Private run directory');
 ok(['source-evidence.json','replica-evidence.json','result.json'].every(f=>(fs.statSync(path.join(runDir,f)).mode&0o077)===0),'Private receipts');
 ok(verifyField(c,runDir).result.observationGatePassed,'Offline signed evidence re-verification');
 const original=fs.readFileSync(path.join(runDir,'replica-evidence.json'),'utf8');
 fs.writeFileSync(path.join(runDir,'replica-evidence.json'),original.replace('0-100-90','0-100-91'));
 throws(()=>verifyField(c,runDir),'Tampering receipt invalidates signed result');
 fs.writeFileSync(path.join(runDir,'replica-evidence.json'),original);
 const fakeMismatch=async(args,meta)=>{
  if(meta.stage==='read'&&meta.role==='replica')return JSON.stringify(createSignedEnvelope({...payload('replica'),maria:{...payload('replica').maria,gtidSlavePos:'0-100-91'}},b.privateKeyPem));
  return fake(args,meta);
 };
 const mismatch=await collectField(c,fakeMismatch,{challenge});
 ok(!mismatch.summary.result.observationGatePassed&&mismatch.summary.result.blockers.includes('GTID_POSITIONS_NOT_EQUAL'),'GTID divergence is reported, not promoted');
 const fakeBadPin=async(args,meta)=>{
  if(meta.stage==='preflight'&&meta.role==='replica')return JSON.stringify({status:'ISOLATED_LAB_PREFLIGHT_PASS',scope:c.scope,identity:a.identity,captureAvailable:true,canSwitchPrimary:false,canArmHA:false,canModifyRouting:false});
  return fake(args,meta);
 };
 let preflights=0;const rejecting=async(args,meta)=>{if(meta.stage==='preflight')preflights++;return fakeBadPin(args,meta)};
 await rejects(()=>collectField(c,rejecting,{challenge}),'Wrong pinned key refuses collection');
 ok(preflights===2,'Both preflights checked before remote capture');
 const badReport=async(args,meta)=>{
  if(meta.stage==='read'&&meta.role==='replica')return '{}';
  return fake(args,meta);
 };
 await rejects(()=>collectField(c,badReport,{challenge}),'Missing report fail closed');
 const out=fs.readdirSync(temp).filter(f=>f.startsWith('field-'));
 ok(out.length===2,'Failed captures remove partial run directories');
 const huge=async(args,meta)=>meta.stage==='read'?'x'.repeat(45000):fake(args,meta);
 await rejects(()=>collectField(c,huge,{challenge}),'Oversized read fails closed');
 ok(fs.readdirSync(temp).filter(f=>f.startsWith('field-')).length===2,'Oversized failed capture cleaned');
 // A compromised operator config cannot silently replace its already pinned identities.
 const changed=structuredClone(c);changed.nodes[1].pinnedIdentityFingerprint='a'.repeat(64);
 throws(()=>verifyField(changed,runDir),'Re-verification blocks config key substitution');
 fs.chmodSync(key,0o644);throws(()=>validateFieldConfig(c),'Insecure ssh key file refused');
 fs.chmodSync(key,0o600);
 fs.symlinkSync(key,path.join(temp,'key-link'));
 const symlinkConfig=structuredClone(c);symlinkConfig.ssh.privateKey=path.join(temp,'key-link');
 throws(()=>validateFieldConfig(symlinkConfig),'Symlinked SSH key refused');
}finally{fs.rmSync(temp,{recursive:true,force:true})}
console.log(`PASS: ${n} FIELD LAB SSH coordination and signed-receipt security assertions (mock SSH only; no real Android tested)`);
