// Management proof only: no dataset, SQL grant, writer, service mutation or DNS action.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {sharedStatus} from './cluster-authority.mjs';
const fail=c=>{throw Error(c);},uuid=/^[a-f0-9-]{36}$/;
export function controlConfigured(home=process.env.HOME||os.homedir()){return ['control-node.json','control-self-service.json'].some(f=>fs.existsSync(path.join(home,'.config/mhc-full-installer',f)));}
export function controlConfig(home=process.env.HOME||os.homedir(),fixture=false){
 if(!fixture&&(!['android','linux'].includes(process.platform)||process.env.PREFIX!=='/data/data/com.termux/files/usr'))fail('CONTROL_TERMUX_REQUIRED');
 const dir=path.join(home,'.config/mhc-full-installer');
 for(const f of ['apps/thophuongpro/.env','.config/mini-hosting-cluster/node.json','.config/mini-hosting-cluster/ha.json'])if(fs.existsSync(path.join(home,f)))fail('CONTROL_PRODUCTION_DENIED');
 const read=file=>{let at=path.resolve(home);for(const part of path.relative(home,file).split(path.sep)){at=path.join(at,part);if(fs.lstatSync(at,{throwIfNoEntry:false})?.isSymbolicLink())fail('CONTROL_CONFIG_UNSAFE');}const s=fs.lstatSync(file);if(!s.isFile()||s.size>65536||!fixture&&(s.mode&0o077))fail('CONTROL_CONFIG_UNSAFE');return JSON.parse(fs.readFileSync(file,'utf8'));};
 const c=read(path.join(dir,fs.existsSync(path.join(dir,'control-node.json'))?'control-node.json':'control-self-service.json')),own=read(path.join(dir,'node-identity.json'));
 if(c.transport==='authority'){
  if(c.schema!==1||c.enabled!==true||c.nodeId!==own.nodeId||own.kind!=='new-node-standby'||!uuid.test(c.nodeId)||!uuid.test(c.clusterId)||c.keyFlavor!=='N1'||typeof c.publicKey!=='string'||c.publicKey.length>500||crypto.createPublicKey(c.publicKey).asymmetricKeyType!=='ed25519')fail('CONTROL_CONFIG_INVALID');
  if(fs.readFileSync(path.join(dir,'installed'),'utf8').trim()!=='TEST 0.5.0C-REMOTE-PANEL installed on clean Termux')fail('CONTROL_MARKER_INVALID');return c;
 }
 if(c.schema!==1||c.enabled!==true||c.nodeId!==own.nodeId||!uuid.test(c.nodeId)||!uuid.test(c.clusterId)||!['N1','P31'].includes(c.keyFlavor)||!Array.isArray(c.peers)||c.peers.length<2||c.peers.length>20||new Set(c.peers.map(p=>p.nodeId)).size!==c.peers.length)fail('CONTROL_CONFIG_INVALID');
 if(fs.readFileSync(path.join(dir,'installed'),'utf8').trim()!=='TEST 0.5.0C-REMOTE-PANEL installed on clean Termux')fail('CONTROL_MARKER_INVALID');
 for(const p of c.peers){if(!uuid.test(p.nodeId)||!['site','control-only'].includes(p.kind)||typeof p.publicKey!=='string'||p.publicKey.length>500||crypto.createPublicKey(p.publicKey).asymmetricKeyType!=='ed25519'||!/^[a-z0-9_]{1,32}$/.test(p.user)||!/^([a-z0-9][a-z0-9.-]{0,250}|[a-f0-9:]{2,100})$/.test(p.host)||p.host.startsWith('-')||!Number.isInteger(p.port)||p.port<1||p.port>65535)fail('CONTROL_PEER_NOT_APPROVED');}
 if(!c.peers.some(p=>p.nodeId===c.nodeId))fail('CONTROL_SELF_NOT_APPROVED');return c;
}
export class ControlNode{
 constructor(o={}){this.home=o.home||process.env.HOME||os.homedir();this.fixture=o.fixture===true;this.now=o.now||Date.now;this.authority=o.authority||(()=>sharedStatus('agent'));this.service=o.service||(name=>{const r=spawnSync('sv',['status',path.join(process.env.PREFIX||'/data/data/com.termux/files/usr','var/service',name)],{encoding:'utf8',timeout:2500});return r.status===0&&/^run:/.test(r.stdout||'');});}
 async proof(nonce,kind='READY',context={}){
  const c=controlConfig(this.home,this.fixture);if(c.keyFlavor!=='N1'||!['READY','PUBLIC_PANEL'].includes(kind)||!/^[a-f0-9]{64}$/.test(nonce||''))fail('CONTROL_PROOF_REQUEST_INVALID');
  const s=await this.authority(),r=s.p33;if(s.clusterId!==c.clusterId||!s.nodes?.some(n=>n.nodeId===c.nodeId&&n.heartbeatRecent&&n.telemetryRecent)||r?.enabled!==true||![...(r.controlOnlyNodeIds||[]),...(r.siteNodeIds||[])].includes(c.nodeId))fail('CONTROL_AUTHORITY_NOT_APPROVED');
  const management={panel:this.service('amh-panel'),agent:this.service('mhc-authority-agent'),tunnel:this.service('mhc-panel-tunnel')};if(!Object.values(management).every(Boolean))fail('CONTROL_MANAGEMENT_NOT_READY');
  if(kind==='PUBLIC_PANEL'&&(context.host!=='panel-lab.giaouoc.com'||context.accessVerified!==true))fail('CONTROL_PUBLIC_ACCESS_REQUIRED');
  const checkedAt=this.now(),p={schema:1,scope:'MHC_CONTROL_ONLY',nodeId:c.nodeId,clusterId:c.clusterId,epoch:r.epoch,revision:r.revision,operationId:r.operationId,nonce,kind,checkedAt,expiresAt:checkedAt+15000,management,writerGranted:false,siteReady:false,...(kind==='PUBLIC_PANEL'?{host:context.host,accessVerified:true}:{})};
  const key=path.join(this.home,'.config/mhc-full-installer/node-proof-key.pem'),st=fs.lstatSync(key);if(!st.isFile()||st.isSymbolicLink()||!this.fixture&&(st.mode&0o077))fail('CONTROL_SIGNING_KEY_UNSAFE');
  const publicKey=crypto.createPublicKey(fs.readFileSync(key)).export({type:'spki',format:'pem'});if((c.transport==='authority'?c.publicKey:c.peers.find(n=>n.nodeId===c.nodeId).publicKey)!==publicKey)fail('CONTROL_SELF_KEY_MISMATCH');
  const latest=await this.authority();if(latest.p33?.revision!==r.revision||latest.p33?.operationId!==r.operationId||latest.epoch!==s.epoch)fail('CONTROL_AUTHORITY_CHANGED_DURING_PROOF');
  return {proof:p,signature:crypto.sign(null,Buffer.from(JSON.stringify(p)),fs.readFileSync(key)).toString('base64url')};
 }
}
async function main(){if(process.argv[2]!=='accept'||process.argv.length!==3||process.env.SSH_ORIGINAL_COMMAND&&process.env.SSH_ORIGINAL_COMMAND!=='mhc-control')fail('CONTROL_SSH_COMMAND_DENIED');let raw='';for await(const b of process.stdin){raw+=b;if(raw.length>4096)fail('CONTROL_REQUEST_TOO_LARGE');}const r=JSON.parse(raw),n=new ControlNode(),c=controlConfig(n.home);if(r.action!=='control-ready'||r.nodeId!==c.nodeId)fail('CONTROL_ACTION_DENIED');return n.proof(r.nonce);}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(v=>console.log(JSON.stringify(v))).catch(e=>{console.error(/^CONTROL_[A-Z0-9_]+$/.test(e.message)?e.message:'CONTROL_OPERATION_FAILED');process.exitCode=1;});
