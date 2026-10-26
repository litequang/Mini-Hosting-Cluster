#!/usr/bin/env node
// MHC TEST 0.5.0C-WRITER-AUDIT — SSH collection of signed, read-only two-node LAB evidence.
// No SSH writes to running services, no fencing/HA actions, no promotion or routing changes.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import crypto from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifyFiles} from './physical-lab-attest.mjs';

const SCOPE='MHC_PHYSICAL_EVIDENCE_LAB_ONLY_NO_HA';
const HASH=/^[0-9a-f]{64}$/;
const CHALLENGE=/^[0-9a-f]{48}$/;
const BAD_KNOWN_IPS=new Set(['192.168.1.43','192.168.1.35','192.168.100.27']); // known active hosting phones
const bad=(message)=>{throw new Error(message)};
function safeFile(p, max=16384, privateFile=true){
 if(typeof p!=='string'||!path.isAbsolute(p)||p.includes('\0'))bad('Absolute, safe file path required');
 const st=fs.lstatSync(p);
 if(!st.isFile()||st.isSymbolicLink()||st.size<1||st.size>max)bad('Missing, symlinked or oversized configuration/key file');
 if(process.platform!=='win32'&&(st.mode&(privateFile?0o077:0o022))!==0)bad('Insecure configuration/key file permissions');
 return p;
}
function safeDirectory(p){
 if(typeof p!=='string'||!path.isAbsolute(p))bad('Absolute output directory required');
 const s=fs.lstatSync(p);
 if(!s.isDirectory()||s.isSymbolicLink()||(process.platform!=='win32'&&(s.mode&0o077)!==0))bad('Private output directory (0700) required');
 return p;
}
function privateIpv4(ip){
 if(net.isIP(ip)!==4||BAD_KNOWN_IPS.has(ip))return false;
 const a=ip.split('.').map(Number);
 return a[0]===10||(a[0]===172&&a[1]>=16&&a[1]<=31)||(a[0]===192&&a[1]===168);
}
export function validateFieldConfig(c){
 if(!c||c.schema!==1||c.scope!==SCOPE||!Array.isArray(c.nodes)||c.nodes.length!==2)bad('Invalid FIELD LAB configuration/scope');
 if(!c.ssh||typeof c.ssh!=='object')bad('SSH configuration missing');
 safeFile(c.ssh.privateKey,20000,true);
 safeFile(c.ssh.knownHosts,1000000,false);
 safeDirectory(c.outputRoot);
 const nodes={};
 for(const n of c.nodes){
  if(!n||!['source','replica'].includes(n.role)||nodes[n.role])bad('Exactly one source and one replica required');
  if(!privateIpv4(n.host)||n.port!==8022||!/^u0_a[0-9]{2,4}$/.test(n.user||''))bad('Only distinct RFC1918 disposable Termux hosts, SSH port 8022, allowed');
  if(!HASH.test(n.pinnedIdentityFingerprint||''))bad('Manually pinned public Ed25519 fingerprint required');
  nodes[n.role]=n;
 }
 if(!nodes.source||!nodes.replica||nodes.source.host===nodes.replica.host||nodes.source.pinnedIdentityFingerprint===nodes.replica.pinnedIdentityFingerprint)
  bad('Two distinct LAB hosts and separately pinned identities required');
 return nodes;
}
const PREFLIGHT='cd && ./mhc-full physical-accept preflight';
function captureCommand(role,challenge){
 if(!['source','replica'].includes(role)||!CHALLENGE.test(challenge))bad('Bad capture role/challenge');
 return `cd && ./mhc-full physical-accept capture ${role} ${challenge}`;
}
function commandAllowed(s){return s===PREFLIGHT||/^cd && \.\/mhc-full physical-accept capture (source|replica) [a-f0-9]{48}$/.test(s)||/^cd && cat mhc-physical-lab\/(source|replica)-[a-f0-9]{16}\.json$/.test(s);}
export function fixedSshArgs(cfg,node,cmd){
 if(!commandAllowed(cmd))bad('Command is not fixed LAB evidence allowlist');
 return ['-F','none','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','IdentitiesOnly=yes',
  '-o','ClearAllForwardings=yes','-o','PermitLocalCommand=no','-o','ConnectTimeout=8','-o','ConnectionAttempts=1',
  '-o',`UserKnownHostsFile=${cfg.ssh.knownHosts}`,'-i',cfg.ssh.privateKey,'-p','8022',`${node.user}@${node.host}`,cmd];
}
export async function runSsh(args,{timeoutMs=90000,maxOutput=40000}={}){
 return await new Promise((resolve,reject)=>{
  const child=spawn('ssh',args,{shell:false,stdio:['ignore','pipe','pipe'],env:{...process.env,SSH_ASKPASS_REQUIRE:'never'}});
  let stdout='',stderr='',settled=false;
  const fail=e=>{if(!settled){settled=true;reject(e)}};
  const timer=setTimeout(()=>{child.kill('SIGKILL');fail(Error('SSH timeout'))},timeoutMs);
  child.stdout.on('data',chunk=>{stdout+=chunk.toString('utf8');if(stdout.length>maxOutput){child.kill('SIGKILL');fail(Error('SSH output too large'))}});
  child.stderr.on('data',chunk=>{stderr+=chunk.toString('utf8');if(stderr.length>4000){child.kill('SIGKILL');fail(Error('SSH stderr too large'))}});
  child.on('error',e=>{clearTimeout(timer);fail(Error('SSH could not run: '+e.code))});
  child.on('close',code=>{clearTimeout(timer);if(code===0&&!settled){settled=true;resolve(stdout)}else if(!settled)fail(Error(`SSH command failed (${code}); verify pinned host keys, LAB setup and connection`))});
 });
}
function jsonLimited(data,max=40000){if(typeof data!=='string'||Buffer.byteLength(data)>max)bad('Oversized remote response');try{return JSON.parse(data)}catch{bad('Non-JSON remote response')}}
function idFingerprint(id){try{return crypto.createHash('sha256').update(crypto.createPublicKey(id.publicKeyPem).export({format:'der',type:'spki'})).digest('hex')}catch{return null}}
function vetPreflight(report,node){
 if(!report||report.status!=='ISOLATED_LAB_PREFLIGHT_PASS'||report.scope!==SCOPE||report.captureAvailable!==true||
  report.canSwitchPrimary!==false||report.canArmHA!==false||report.canModifyRouting!==false||
  report.identity?.scope!==SCOPE||report.identity.fingerprint!==node.pinnedIdentityFingerprint||idFingerprint(report.identity)!==node.pinnedIdentityFingerprint)
  bad('Remote LAB preflight or out-of-band identity PIN failed');
 return report.identity;
}
async function saveExclusive(p,data){await fsp.writeFile(p,data,{flag:'wx',mode:0o600});}
export async function collectField(cfg,transport=runSsh,{challenge=crypto.randomBytes(24).toString('hex')}={}){
 const nodes=validateFieldConfig(cfg);
 if(!CHALLENGE.test(challenge))bad('Invalid challenge');
 // Fail fast on both preflights before creating any remote reports.
 const identities={};
 for(const role of ['source','replica']){
  const node=nodes[role];const r=await transport(fixedSshArgs(cfg,node,PREFLIGHT),{role,stage:'preflight'});
  identities[role]=vetPreflight(jsonLimited(r),node);
 }
 if(identities.source.nodeId===identities.replica.nodeId)bad('Same signed node identity on both devices');
 const runDir=path.join(cfg.outputRoot,`field-${new Date().toISOString().replace(/[:.]/g,'-')}-${challenge.slice(0,12)}`);
 await fsp.mkdir(runDir,{mode:0o700});
 try{
  for(const role of ['source','replica']){
   const node=nodes[role];
   const capture=jsonLimited(await transport(fixedSshArgs(cfg,node,captureCommand(role,challenge)),{role,stage:'capture'}));
   if(capture.status!=='SIGNED_OBSERVATION_RECORDED'||capture.role!==role||capture.nodeId!==identities[role].nodeId||capture.canSwitchPrimary!==false)
    bad('Remote capture refused or reports wrong node');
   const evidence=jsonLimited(await transport(fixedSshArgs(cfg,node,`cd && cat mhc-physical-lab/${role}-${challenge.slice(0,16)}.json`),{role,stage:'read'}));
   if(evidence.payload?.role!==role||evidence.payload?.challenge!==challenge)bad('Remote evidence challenge/role mismatch');
   await saveExclusive(path.join(runDir,`${role}-identity.json`),JSON.stringify(identities[role],null,2)+'\n');
   await saveExclusive(path.join(runDir,`${role}-evidence.json`),JSON.stringify(evidence,null,2)+'\n');
  }
  const result=verifyFiles(path.join(runDir,'source-evidence.json'),path.join(runDir,'replica-evidence.json'),
   path.join(runDir,'source-identity.json'),path.join(runDir,'replica-identity.json'),challenge,
   nodes.source.pinnedIdentityFingerprint,nodes.replica.pinnedIdentityFingerprint);
  const summary={schema:1,scope:SCOPE,challenge,mode:'TWO_DISTINCT_SSH_ENDPOINTS_SIGNED_OBSERVATION',result,
   assertions:{sshHostKeysPinned:true,publicFingerprintsPinned:true,livePhysicalSeparationProven:false,
    oldPrimaryFenced:false,gtidTransactionRecoveryProven:false,canSwitchPrimary:false,canArmHA:false},
   createdAt:new Date().toISOString()};
  await saveExclusive(path.join(runDir,'result.json'),JSON.stringify(summary,null,2)+'\n');
  return {runDir,summary};
 }catch(e){await fsp.rm(runDir,{recursive:true,force:true});throw e}
}
export function verifyField(cfg,runDir){
 const nodes=validateFieldConfig(cfg);
 safeDirectory(runDir);
 const s=JSON.parse(fs.readFileSync(safeFile(path.join(runDir,'result.json'),30000),'utf8'));
 if(s.scope!==SCOPE||!CHALLENGE.test(s.challenge||''))bad('Untrusted field run metadata');
 const result=verifyFiles(path.join(runDir,'source-evidence.json'),path.join(runDir,'replica-evidence.json'),
  path.join(runDir,'source-identity.json'),path.join(runDir,'replica-identity.json'),s.challenge,
  nodes.source.pinnedIdentityFingerprint,nodes.replica.pinnedIdentityFingerprint);
 // A missing/edited summary cannot pass merely because its file name looks legitimate.
 if(JSON.stringify(result)!==JSON.stringify(s.result))bad('Signed evidence comparison no longer matches saved summary');
 return {mode:'RECHECK_SAVED_SIGNED_LAB_EVIDENCE',result,canSwitchPrimary:false,canArmHA:false};
}
export function loadConfig(file){return JSON.parse(fs.readFileSync(safeFile(file,30000,true),'utf8'))}
export function plan(){return {release:'TEST 0.5.0C-WRITER-AUDIT',purpose:'Collect two independently pinned SSH-host LAB observations',
  supported:['plan','collect CONFIG_JSON','verify CONFIG_JSON RESULT_DIRECTORY'],
  onlyPrivateIpv4:true,sshPort:8022,sshStrictKnownHosts:true,sshBatchMode:true,liveWrites:false,
  remoteActions:['preflight (read-only)','capture (signed LAB evidence file only)','read signed evidence (read-only)'],
  noProductionDatabaseOrWebsiteMutation:true,noRoutingChanges:true,canSwitchPrimary:false,canArmHA:false,
  note:'Two SSH connections and valid signed evidence are not proof of independent physical fencing or full data consistency.'};}
async function main(){const [cmd,...args]=process.argv.slice(2);
 if(cmd==='plan'&&args.length===0)return console.log(JSON.stringify(plan(),null,2));
 if(cmd==='collect'&&args.length===1){const {runDir,summary}=await collectField(loadConfig(args[0]));console.log(JSON.stringify({runDir,...summary},null,2));if(!summary.result.observationGatePassed)process.exitCode=1;return;}
 if(cmd==='verify'&&args.length===2){const r=verifyField(loadConfig(args[0]),args[1]);console.log(JSON.stringify(r,null,2));if(!r.result.observationGatePassed)process.exitCode=1;return;}
 bad('Usage: node field-lab-coordinator.mjs plan|collect CONFIG_JSON|verify CONFIG_JSON RUN_DIR');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('FIELD_LAB_ERROR:',e.message);process.exitCode=1});
