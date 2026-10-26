#!/usr/bin/env node
// MHC Full TEST 0.3.5: SSH-only inventory enrollment for isolated Termux lab phones.
// No replicas, no HTTP listener, no MariaDB mutation, no HA lease or primary rights.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync, execFileSync} from 'node:child_process';
import {buildClusterSummary} from './cluster-summary.mjs';
import {createMemberReport, sanitizeMemberReport} from './member-telemetry.mjs';
const HOME=process.env.HOME||os.homedir();
const DIR=path.join(HOME,'.config/mhc-full-installer');
const MARK=path.join(DIR,'installed');
const PROTOCOL='mhc-full-enroll-v1';
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LABEL=/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,48}$/;
const HOST=/^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/;
const USER=/^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$/;
const paths={identity:path.join(DIR,'node-identity.json'),cluster:path.join(DIR,'cluster.json'),members:path.join(DIR,'members.json'),invite:path.join(DIR,'pending-invite.json'),joined:path.join(DIR,'joined.json'),auth:path.join(DIR,'node-auth.json')};
const maxNodes=10000;
function observedAssignedRole(nodeId){
 try{const state=read(path.join(DIR,'manual-primary','selection.json'));
  if((state?.retiredPrimaries||[]).some(x=>x.nodeId===nodeId))return 'STANDBY_REJOIN_REQUIRES_RESTORE';
  return state?.declaredPrimary?.nodeId===nodeId?'PRIMARY_RECORDED_ONLY':'STANDBY';
 }catch{return 'ROLE_UNVERIFIED';}
}
function abort(message){throw Error(message);}
function privateDir(){fs.mkdirSync(DIR,{recursive:true,mode:0o700});if(fs.lstatSync(DIR).isSymbolicLink())abort('Config directory is symlink');fs.chmodSync(DIR,0o700);}
function read(file){
  try{const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077))abort(`Unsafe permissions or type for ${path.basename(file)}`);
    const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const b=fs.readFileSync(fd,'utf8');if(b.length>1024*1024)abort('Metadata too large');return JSON.parse(b);}finally{fs.closeSync(fd);}
  }catch(e){if(e.code==='ENOENT')return null;throw e;}
}
function save(file,obj){
  privateDir();const temp=path.join(DIR,`.tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`);
  const fd=fs.openSync(temp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
  try{fs.writeFileSync(fd,JSON.stringify(obj,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  try{fs.renameSync(temp,file);fs.chmodSync(file,0o600);}catch(e){try{fs.unlinkSync(temp);}catch{}throw e;}
}
function withLock(fn){
  const lock=path.join(DIR,'.enrollment-lock');
  try{fs.mkdirSync(lock,0o700);}catch(e){if(e.code==='EEXIST')abort('Enrollment operation locked. Inspect stale lock; no automatic unlocking.');throw e;}
  try{return fn();}finally{fs.rmdirSync(lock);}
}
function ensureTest(){
  const marker=fs.existsSync(MARK)?fs.readFileSync(MARK,'utf8').trim():'';
  if(!/^(?:TEST 0\.3(?:\.[0-9]|\.9\.[12]|\.10|\.11)?|TEST 0\.4\.0(A|B1|B2|B3|B4|C1|C2|C3|D)|TEST 0\.5\.0(A|B|B2|B3|B4|B5|C-LAB|C-INTEGRATION|C-PHYSICAL|C-FIELD|C-DRILL|C-FENCE-PROBE|C-WRITER-AUDIT|C-MANUAL-PRIMARY|C-AUTO-PRIMARY-LAB|C-ROUTE-RECOVERY|C-REMOTE-PANEL)) installed on clean Termux$/.test(marker))abort('Requires a completed MHC Full TEST install on isolated phone');
  if(fs.existsSync(path.join(DIR,'install-incomplete')))abort('Partial installer marker exists');
  if(['apps/thophuongpro/.env','.config/mini-hosting-cluster/ha.json','.config/mini-hosting-cluster/node.json'].some(p=>fs.existsSync(path.join(HOME,p))))abort('Production app or HA policy detected; enrollment refused');
  privateDir();
}
function hostname(){try{return execFileSync('getprop',['ro.product.model'],{timeout:1200,encoding:'utf8'}).trim()||os.hostname();}catch{return os.hostname();}}
function capacity(){
  let diskMiB=null;try{const out=execFileSync('df',['-Pk',HOME],{timeout:1500,encoding:'utf8'}).trim().split('\n').at(-1).trim().split(/\s+/);const kb=Number(out[3]);if(Number.isFinite(kb)&&kb>=0)diskMiB=Math.round(kb/1024);}catch{}
  return {deviceModel:hostname().slice(0,64),architecture:os.arch(),cpuCores:os.cpus().length,memoryMiB:Math.round(os.totalmem()/1048576),freeMemoryMiB:Math.round(os.freemem()/1048576),freeDiskMiB:diskMiB,measuredAt:new Date().toISOString(),battery:'unavailable',network:'unmeasured'};
}
function identity(){const x=read(paths.identity);if(!x||!ID.test(x.nodeId)||!LABEL.test(x.label))abort('Run node init first');return x;}
function init(label){ensureTest();if(read(paths.identity))abort('Identity exists; cannot silently replace nodeId');
  const suggested=(label||hostname().replace(/[^A-Za-z0-9 _.-]/g,' ').trim().slice(0,48)||'Android Node');
  if(!LABEL.test(suggested))abort('Invalid label');const x={schema:1,nodeId:crypto.randomUUID(),label:suggested,createdAt:new Date().toISOString(),kind:'inventory-only'};save(paths.identity,x);
  console.log(`Initialized local node ${x.label} (${x.nodeId}). No cluster membership or write authority.`);
}
function clusterInit(){ensureTest();const self=identity();if(read(paths.cluster)||read(paths.joined))abort('Cluster/member already configured');
  const c={schema:1,clusterId:crypto.randomUUID(),controllerNodeId:self.nodeId,createdAt:new Date().toISOString(),mode:'inventory-only'};
  save(paths.cluster,c);save(paths.members,{schema:1,nodes:[{nodeId:self.nodeId,label:self.label,enrolledAt:c.createdAt,verification:'local-controller',capability:capacity()}]});
  console.log(`Created TEST enrollment controller cluster ${c.clusterId}. Not an HA coordinator.`);
}
function controller(){const c=read(paths.cluster);if(!c||!ID.test(c.clusterId)||c.mode!=='inventory-only'||c.controllerNodeId!==identity().nodeId)abort('Not a local enrollment controller');return c;}
function invite(minutesText='10'){
  ensureTest();controller();const m=Number(minutesText);if(!Number.isInteger(m)||m<1||m>10)abort('Invite TTL must be 1-10 minutes');
  return withLock(()=>{const prev=read(paths.invite);if(prev&&prev.expiresAt>Date.now())abort('An unused invitation exists; revoke it first');
    const secret=crypto.randomBytes(24).toString('base64url');const x={schema:1,sha256:crypto.createHash('sha256').update(secret).digest('hex'),createdAt:Date.now(),expiresAt:Date.now()+m*60000};save(paths.invite,x);
    console.log('ONE-TIME invite (SECRET, do not share in chat or log):');console.log(secret);console.log(`Expires in ${m} minute(s); SSH with pinned host key is mandatory.`);
  });
}
function revokeInvite(){ensureTest();controller();return withLock(()=>{if(fs.existsSync(paths.invite))fs.unlinkSync(paths.invite);console.log('Invitation revoked.');});}
function sanitizeCap(raw){const out={};if(!raw||typeof raw!=='object'||Array.isArray(raw))abort('Invalid capabilities');
  for(const k of ['deviceModel','architecture','battery','network']){if(typeof raw[k]==='string')out[k]=raw[k].slice(0,64);}
  for(const k of ['cpuCores','memoryMiB','freeMemoryMiB','freeDiskMiB']){if(raw[k]===null&&k==='freeDiskMiB'){out[k]=null;continue;}
    if(Number.isInteger(raw[k])&&raw[k]>=0&&raw[k]<=100000000)out[k]=raw[k];}
  out.measuredAt=new Date().toISOString();return out;
}
function safeInput(raw){if(!raw||typeof raw!=='object'||Array.isArray(raw))abort('Invalid enrollment message');
  if(raw.protocol!==PROTOCOL||!ID.test(raw.nodeId||'')||!LABEL.test(raw.label||'')||typeof raw.token!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(raw.token)||typeof raw.nonce!=='string'||!/^[0-9a-f]{32}$/.test(raw.nonce))abort('Malformed enrollment message');
  return {nodeId:raw.nodeId,label:raw.label,token:raw.token,nonce:raw.nonce,capability:sanitizeCap(raw.capability)};
}
async function rpc(){
  const original=process.env.SSH_ORIGINAL_COMMAND||'';
  if(original==='~/mhc-full node accept')return accept();
  if(original==='~/mhc-full node heartbeat-accept')return heartbeatAccept();
  if(original==='~/mhc-full node role-accept')return roleAccept();
  if(original==='~/mhc-full clone rpc')return (await import('./node-clone.mjs')).runRpc();
  abort('SSH forced-command RPC rejects this operation');
}
async function accept(){ensureTest();const c=controller();
  let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>8192)abort('Enrollment request too large');}
  const req=safeInput(JSON.parse(input));
  return withLock(()=>{
    const inv=read(paths.invite);if(!inv||!Number.isFinite(inv.expiresAt)||inv.expiresAt<Date.now())abort('Invitation unavailable or expired');
    const digest=crypto.createHash('sha256').update(req.token).digest('hex');const a=Buffer.from(inv.sha256,'hex'),b=Buffer.from(digest,'hex');
    if(a.length!==32||!crypto.timingSafeEqual(a,b))abort('Invalid enrollment invitation');
    if(req.nodeId===c.controllerNodeId)abort('Cannot enroll controller as remote member');
    const members=read(paths.members);if(!Array.isArray(members?.nodes)||members.nodes.length>=maxNodes)abort('Invalid/full node registry');
    if(members.nodes.some(n=>n.nodeId===req.nodeId))abort('Node already enrolled; one-time code not reused');
    // Consume before updating registry: if interrupted, enrollment fails closed, requiring a fresh invite.
    fs.unlinkSync(paths.invite);
    const heartbeatToken=crypto.randomBytes(32).toString('base64url');
    members.nodes.push({nodeId:req.nodeId,label:req.label,enrolledAt:new Date().toISOString(),verification:'ssh-authenticated-pairing-only',capability:req.capability,heartbeatTokenHash:crypto.createHash('sha256').update(heartbeatToken).digest('hex'),heartbeatSeq:0,lastSeenAt:null});
    save(paths.members,members);
    const response={ok:true,protocol:PROTOCOL,nonce:req.nonce,clusterId:c.clusterId,controllerNodeId:c.controllerNodeId,enrolledNodeId:req.nodeId,enrolledAt:new Date().toISOString(),mode:'inventory-only',heartbeatToken};
    console.log(JSON.stringify(response));
  });
}
async function join(host,user,portText='8022'){
  ensureTest();const node=identity();if(read(paths.cluster)||read(paths.joined))abort('Already controller/joined; no implicit reparenting');
  if(!HOST.test(host||'')||!USER.test(user||''))abort('Invalid SSH host/user');
  const port=Number(portText);if(!Number.isInteger(port)||port<1||port>65535)abort('Invalid SSH port');
  let code='';for await(const part of process.stdin){code+=part;if(code.length>200)abort('Invite input too long');}
  code=code.trim();if(!/^[A-Za-z0-9_-]{32}$/.test(code))abort('Invalid invitation format');
  const nonce=crypto.randomBytes(16).toString('hex');const req={protocol:PROTOCOL,nonce,nodeId:node.nodeId,label:node.label,token:code,capability:capacity()};
  const args=['-T','-p',String(port),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=12','-o','ServerAliveInterval=5','-o','ServerAliveCountMax=2',`${user}@${host}`,'~/mhc-full node accept'];
  const result=spawnSync('ssh',args,{input:JSON.stringify(req)+'\n',encoding:'utf8',timeout:25000,maxBuffer:16384});
  if(result.error||result.status!==0)abort('SSH enrollment failed. Verify pinned host key, SSH key authorization and controller invitation (details kept local).');
  let reply;try{reply=JSON.parse(result.stdout.trim());}catch{abort('Controller did not return a valid protocol response');}
  if(reply.ok!==true||reply.protocol!==PROTOCOL||reply.nonce!==nonce||reply.enrolledNodeId!==node.nodeId||!ID.test(reply.clusterId||'')||!ID.test(reply.controllerNodeId||'')||reply.mode!=='inventory-only')abort('Enrollment acknowledgment mismatch');
  if(typeof reply.heartbeatToken!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(reply.heartbeatToken))abort('Enrollment heartbeat credential missing');
  return withLock(()=>{if(read(paths.joined)||read(paths.cluster))abort('Membership changed during join');
    save(paths.auth,{schema:1,nodeId:node.nodeId,token:reply.heartbeatToken,seq:0});
    save(paths.joined,{schema:1,clusterId:reply.clusterId,controllerNodeId:reply.controllerNodeId,nodeId:node.nodeId,controllerSSH:{host,user,port},joinedAt:new Date().toISOString(),state:'enrolled-unverified',mode:'inventory-only'});
    console.log(`Enrolled node ${node.nodeId} into TEST inventory cluster ${reply.clusterId}. No clone/replication or HA access granted.`);
  });
}
async function heartbeatAccept(){
  ensureTest();controller();let input='';for await(const part of process.stdin){input+=part;if(input.length>8192)abort('Heartbeat too large');}
  const r=JSON.parse(input);
  if(!r||r.protocol!==PROTOCOL||!ID.test(r.nodeId||'')||typeof r.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(r.token)||!Number.isSafeInteger(r.seq)||r.seq<1||r.seq>1000000000000||!/^[0-9a-f]{32}$/.test(r.nonce||''))abort('Malformed heartbeat');
  const cap=sanitizeCap(r.capability);
  // Reject an oversized, malformed or authority-forging report BEFORE updating sequence.
  const report=Object.hasOwn(r,'report')?sanitizeMemberReport(r.report):null;
  withLock(()=>{const members=read(paths.members);if(!Array.isArray(members?.nodes))abort('Registry unavailable');
    const node=members.nodes.find(n=>n.nodeId===r.nodeId);
    if(!node||typeof node.heartbeatTokenHash!=='string'||!/^([0-9a-f]{64})$/.test(node.heartbeatTokenHash))abort('Node not authorized for heartbeat');
    const expected=Buffer.from(node.heartbeatTokenHash,'hex'),got=Buffer.from(crypto.createHash('sha256').update(r.token).digest('hex'),'hex');
    if(!crypto.timingSafeEqual(expected,got))abort('Invalid heartbeat credential');
    if(r.seq <= (node.heartbeatSeq||0))abort('Duplicate or replayed heartbeat');
    node.heartbeatSeq=r.seq;node.lastSeenAt=new Date().toISOString();node.capability=cap;
    if(report){node.report=report;node.reportReceivedAt=node.lastSeenAt;node.reportSeq=r.seq;}
    save(paths.members,members);
    console.log(JSON.stringify({ok:true,protocol:PROTOCOL,nodeId:r.nodeId,nonce:r.nonce,mode:'inventory-only',observation:'authenticated-heartbeat',assignedRole:observedAssignedRole(r.nodeId)}));
  });
}
// Role inquiry uses the EXISTING enrolled-node SSH credential and forced-command entry.
// It never grants authority to a node; it reports the controller's current intent.
async function roleAccept(){
 if(fs.lstatSync(path.join(DIR,'authority.json'),{throwIfNoEntry:false}))abort('Shared authority configured: legacy role replies disabled');
 ensureTest();const cluster=controller();
 let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>2048)abort('Oversized role inquiry');}
 let req;try{req=JSON.parse(input);}catch{abort('Malformed role inquiry');}
 if(req?.protocol!==PROTOCOL||!ID.test(req.nodeId||'')||!/^[A-Za-z0-9_-]{43}$/.test(req.token||'')||!/^[0-9a-f]{32}$/.test(req.nonce||''))abort('Invalid role inquiry');
 const members=read(paths.members);const member=members?.nodes?.find(n=>n.nodeId===req.nodeId);
 if(!member||typeof member.heartbeatTokenHash!=='string'||!/^([0-9a-f]{64})$/.test(member.heartbeatTokenHash))abort('Unenrolled role inquiry');
 const expected=Buffer.from(member.heartbeatTokenHash,'hex'),got=crypto.createHash('sha256').update(req.token).digest();
 if(!crypto.timingSafeEqual(expected,got))abort('Invalid role inquiry authentication');
 const state=read(path.join(DIR,'manual-primary','selection.json'));
 // If a DNS move was started but not committed, never authorize writers from this inquiry.
 const routePending=read(path.join(DIR,'manual-primary','route-pending.json'));
 const role=routePending||state?.pending?'UNVERIFIED':observedAssignedRole(req.nodeId);
 console.log(JSON.stringify({ok:true,protocol:PROTOCOL,nodeId:req.nodeId,nonce:req.nonce,clusterId:cluster.clusterId,
  controllerNodeId:cluster.controllerNodeId,role,revision:state?.revision??null,writeLeaseGranted:false}));
}
async function heartbeat(){
  ensureTest();const joined=read(paths.joined),auth=read(paths.auth),id=identity();
  if(!joined||!auth||!ID.test(joined.clusterId||'')||auth.nodeId!==id.nodeId||!/^[A-Za-z0-9_-]{43}$/.test(auth.token||''))abort('Node not properly enrolled');
  const {host,user,port}=joined.controllerSSH||{};
  if(!HOST.test(host||'')||!USER.test(user||'')||!Number.isInteger(port)||port<1||port>65535)abort('Invalid pinned SSH destination');
  withLock(()=>{
    const seq=(auth.seq||0)+1;if(!Number.isSafeInteger(seq))abort('Heartbeat sequence exhausted');
    save(paths.auth,{...auth,seq});
    const nonce=crypto.randomBytes(16).toString('hex');
    const req={protocol:PROTOCOL,nodeId:id.nodeId,token:auth.token,seq,nonce,capability:capacity(),report:createMemberReport(buildClusterSummary(HOME))};
    const args=['-T','-p',String(port),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=12','-o','ServerAliveInterval=5','-o','ServerAliveCountMax=2',`${user}@${host}`,'~/mhc-full node heartbeat-accept'];
    const result=spawnSync('ssh',args,{input:JSON.stringify(req)+'\n',encoding:'utf8',timeout:25000,maxBuffer:8192});
    if(result.error||result.status!==0)abort('Heartbeat SSH failed; check local SSH/cluster settings');
    let reply;try{reply=JSON.parse(result.stdout.trim());}catch{abort('Malformed heartbeat response');}
    if(reply.ok!==true||reply.protocol!==PROTOCOL||reply.nodeId!==id.nodeId||reply.nonce!==nonce||reply.mode!=='inventory-only'||reply.observation!=='authenticated-heartbeat')abort('Heartbeat response mismatch');
    if(['PRIMARY_RECORDED_ONLY','STANDBY','STANDBY_REJOIN_REQUIRES_RESTORE','ROLE_UNVERIFIED'].includes(reply.assignedRole)){
      save(path.join(DIR,'role-observed.json'),{nodeId:id.nodeId,assignedRole:reply.assignedRole,at:new Date().toISOString(),source:'SSH_AUTHENTICATED_CONTROLLER_REPLY',writerActuallyStopped:false});
    }
    console.log('Authenticated inventory heartbeat accepted; recorded role is not a real writer lock.');
  });
}
function role(){const x=read(path.join(DIR,'role-observed.json'));console.log(JSON.stringify({role:x?.assignedRole||'UNVERIFIED',observedAt:x?.at||null,writerActuallyStopped:false,notice:'Controller intent only. No local Nginx, PHP, or MariaDB change.'},null,2));}
function status(){const id=read(paths.identity),c=read(paths.cluster),j=read(paths.joined),r=read(paths.members);
  console.log(JSON.stringify({protocol:PROTOCOL,identity:id||null,cluster:c||null,membership:j||null,controllerNodeCount:r?.nodes?.length??null,capability:capacity(),haLeaseVerified:false,replicaReady:false},null,2));
}
function list(){const c=controller(),r=read(paths.members);if(!Array.isArray(r?.nodes))abort('No node registry');
  console.log(JSON.stringify({clusterId:c.clusterId,mode:c.mode,nodes:r.nodes.map(n=>({nodeId:n.nodeId,label:n.label,enrolledAt:n.enrolledAt,verification:n.verification,capability:n.capability,lastSeenAt:n.lastSeenAt||null,observation:n.lastSeenAt&&(Date.now()-Date.parse(n.lastSeenAt)<180000)?'recent-authenticated-heartbeat':'not-recently-observed',replicaReady:false,haEligible:false}))},null,2));
}
function remove(nodeId,confirmation){ensureTest();const c=controller();if(!ID.test(nodeId||'')||nodeId===c.controllerNodeId)abort('Invalid nodeId or controller removal');if(confirmation!=='--confirm=REMOVE_FROM_INVENTORY')abort('Explicit confirmation required');
  withLock(()=>{const reg=read(paths.members);const before=reg.nodes.length;reg.nodes=reg.nodes.filter(n=>n.nodeId!==nodeId);if(before===reg.nodes.length)abort('Node not registered');save(paths.members,reg);console.log('Removed from LOCAL inventory ONLY. SSH authorization remains unchanged; revoke SSH key manually if necessary.');});
}
function help(){console.log(`MHC TEST 0.3.5 inventory enrollment (not HA):
  node init [LABEL]              Create this lab node identity
  node cluster-init               Initialize inventory controller on a test phone
  node invite [MINUTES]           Generate one-use invitation (1-10min)
  node revoke-invite              Invalidate outstanding invitation
  node join HOST SSH_USER [PORT]  Join via pinned SSH and invite on stdin
  node accept                     Coordinator's SSH RPC, not for direct use
  node heartbeat                  Send authenticated inventory heartbeat over SSH
  node heartbeat-accept           Coordinator's SSH RPC, not for direct use
  node role-accept                Authenticated controller role query (no lease)
  node rpc                        Optional restricted SSH forced-command entry
  node status                     Local read-only identity/capability
  node list                       Controller local node registry
  node role                       Show last authenticated assigned role (not fencing)
  node remove UUID --confirm=REMOVE_FROM_INVENTORY`);}
try{
  const [cmd,...args]=process.argv.slice(2);
  switch(cmd){case 'init':init(args.join(' '));break;case 'cluster-init':clusterInit();break;case 'invite':invite(args[0]);break;case 'revoke-invite':revokeInvite();break;case 'join':await join(...args);break;case 'accept':await accept();break;case 'heartbeat':await heartbeat();break;case 'heartbeat-accept':await heartbeatAccept();break;case 'role-accept':await roleAccept();break;case 'rpc':await rpc();break;case 'status':status();break;case 'role':role();break;case 'list':list();break;case 'remove':remove(...args);break;default:help();if(cmd&&cmd!=='help')process.exitCode=2;}
}catch(e){console.error(`ERROR: ${e.message}`);process.exitCode=1;}
