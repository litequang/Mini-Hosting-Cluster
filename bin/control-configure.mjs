// Explicit operator configuration of public peer pins. No service, SQL, DNS or lease changes.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {sharedStatus} from './cluster-authority.mjs';import {controlConfig} from './control-node.mjs';
const home=process.env.HOME||os.homedir(),dir=path.join(home,'.config/mhc-full-installer'),prefix=process.env.PREFIX||'',fail=c=>{throw Error(c);};
function safe(file){const rel=path.relative(home,file);if(rel.startsWith('..')||path.isAbsolute(rel))fail('CONTROL_SETUP_PATH_INVALID');let at=home;for(const p of rel.split(path.sep)){at=path.join(at,p);if(fs.lstatSync(at,{throwIfNoEntry:false})?.isSymbolicLink())fail('CONTROL_SETUP_SYMLINK_DENIED');}return file;}
function gate(){if(!['android','linux'].includes(process.platform)||prefix!=='/data/data/com.termux/files/usr')fail('CONTROL_TERMUX_REQUIRED');for(const f of ['apps/thophuongpro/.env','.config/mini-hosting-cluster/node.json','.config/mini-hosting-cluster/ha.json'])if(fs.existsSync(path.join(home,f)))fail('CONTROL_PRODUCTION_DENIED');if(fs.readFileSync(safe(path.join(dir,'installed')),'utf8').trim()!=='TEST 0.5.0C-REMOTE-PANEL installed on clean Termux')fail('CONTROL_MARKER_INVALID');}
export function prepare(){gate();const id=JSON.parse(fs.readFileSync(safe(path.join(dir,'node-identity.json')))),authority=JSON.parse(fs.readFileSync(safe(path.join(dir,'authority.json')))),keyFlavor=fs.existsSync(path.join(dir,'node-proof-key.pub'))?'N1':'P31';
 const publicKey=fs.readFileSync(safe(path.join(dir,keyFlavor==='N1'?'node-proof-key.pub':'p31/proof-public.pem')),'utf8'),sshPublicKey=fs.readFileSync(safe(keyFlavor==='N1'?path.join(home,'.ssh/id_ed25519_mhc_node.pub'):path.join(dir,'p31/ssh-key.pub')),'utf8').trim();
 if(authority.nodeId!==id.nodeId||crypto.createPublicKey(publicKey).asymmetricKeyType!=='ed25519'||!/^ssh-ed25519 [A-Za-z0-9+/=]+(?: [^\r\n]*)?$/.test(sshPublicKey))fail('CONTROL_LOCAL_IDENTITY_INVALID');
 const hostPublicKey=fs.readFileSync(path.join(prefix,'etc/ssh/ssh_host_ed25519_key.pub'),'utf8').trim().split(/\s+/).slice(0,2).join(' ');if(!/^ssh-ed25519 [A-Za-z0-9+/=]+$/.test(hostPublicKey))fail('CONTROL_HOST_KEY_INVALID');
 return {nodeId:id.nodeId,clusterId:authority.clusterId,keyFlavor,publicKey,sshPublicKey,hostPublicKey,controlRevision:fs.existsSync(path.join(dir,'control-node.json'))?controlConfig(home).revision||0:0};
}
function atomic(file,bytes,mode=0o600){safe(file);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const tmp=file+'.control-'+crypto.randomUUID();fs.writeFileSync(tmp,bytes,{flag:'wx',mode});fs.renameSync(tmp,file);fs.chmodSync(file,mode);}
async function configure(raw,pinnedNodeId){
 const own=prepare();if(own.nodeId!==pinnedNodeId)fail('CONTROL_UNEXPECTED_NODE');const v=JSON.parse(raw),peers=v.peers;
 if(!Array.isArray(peers)||peers.length<2||peers.length>20||new Set(peers.map(p=>p.nodeId)).size!==peers.length)fail('CONTROL_PEERS_INVALID');
 const state=await sharedStatus('agent');if(state.clusterId!==own.clusterId||peers.some(p=>!state.nodes.some(n=>n.nodeId===p.nodeId&&n.heartbeatRecent&&n.telemetryRecent)))fail('CONTROL_FRESH_MEMBERSHIP_REQUIRED');
 const self=peers.find(p=>p.nodeId===own.nodeId);if(!self||self.publicKey!==own.publicKey||self.sshPublicKey!==own.sshPublicKey)fail('CONTROL_SELF_KEY_MISMATCH');
 if(peers.some(p=>!/^ssh-ed25519 [A-Za-z0-9+/=]+(?: [^\r\n]*)?$/.test(p.sshPublicKey||'')))fail('CONTROL_SSH_PUBLIC_KEY_INVALID');
 if(typeof v.knownHosts!=='string'||v.knownHosts.length>16000||v.knownHosts.split('\n').filter(Boolean).some(l=>!/^\S+ ssh-ed25519 [A-Za-z0-9+/=]+$/.test(l)))fail('CONTROL_PINNED_HOST_KEYS_REQUIRED');
 const cfg=safe(path.join(dir,'control-node.json')),hosts=safe(path.join(dir,'control-known-hosts')),auth=safe(path.join(home,'.ssh/authorized_keys')),lock=safe(path.join(dir,'control-setup.lock'));
 const old=fs.existsSync(cfg)?controlConfig(home):null;
 if((old?.revision||0)!==(v.expectedRevision||0))fail('CONTROL_SETUP_REVISION_CONFLICT');
 for(const p of peers){const previous=old?.peers.find(n=>n.nodeId===p.nodeId);if(previous&&previous.publicKey!==p.publicKey)fail('CONTROL_EXISTING_PROOF_PIN_CHANGED');}
 const value={schema:1,enabled:true,revision:(old?.revision||0)+1,nodeId:own.nodeId,clusterId:own.clusterId,keyFlavor:own.keyFlavor,peers:peers.map(({nodeId,kind,publicKey,user,host,port})=>({nodeId,kind,publicKey,user,host,port}))};
 // Validate all peer fields with the same parser used by the actual client, before accepting SSH keys.
 for(const p of value.peers)if(!/^[a-f0-9-]{36}$/.test(p.nodeId)||!['site','control-only'].includes(p.kind)||crypto.createPublicKey(p.publicKey).asymmetricKeyType!=='ed25519'||!/^[a-z0-9_]{1,32}$/.test(p.user)||!/^([a-z0-9][a-z0-9.-]{0,250}|[a-f0-9:]{2,100})$/.test(p.host)||!Number.isInteger(p.port)||p.port<1||p.port>65535)fail('CONTROL_PEER_NOT_APPROVED');
 let lines=fs.existsSync(auth)?fs.readFileSync(auth,'utf8'):'';
 const receiver=self.kind==='control-only'?'control-node.mjs':'p31-node.mjs';
 for(const p of peers.filter(p=>p.nodeId!==own.nodeId)){const forced='restrict,command="'+prefix+'/bin/node '+home+'/.local/share/mhc-full-installer/bin/'+receiver+' accept" '+p.sshPublicKey,key=p.sshPublicKey.split(' ')[1],found=lines.split('\n').find(l=>l.split(/\s+/).includes(key));if(found&&found!==forced)fail('CONTROL_EXISTING_SSH_OPTIONS_DIFFER');if(!found)lines=lines.trimEnd()+'\n'+forced+'\n';}
 const targets=[cfg,hosts,auth],before=targets.map(p=>{const s=fs.lstatSync(p,{throwIfNoEntry:false});if(s&&!s.isFile())fail('CONTROL_SETUP_TARGET_UNSAFE');return s?{bytes:fs.readFileSync(p),mode:s.mode&0o777}:null;});
 fs.mkdirSync(lock,{mode:0o700});const backup=safe(path.join(home,'.local/state/mhc-control-setup/tx-'+Date.now()+'-'+crypto.randomBytes(3).toString('hex')));fs.mkdirSync(backup,{recursive:true,mode:0o700});before.forEach((b,i)=>{if(b)fs.writeFileSync(path.join(backup,'before-'+i),b.bytes,{mode:0o600});});
 try{
  atomic(hosts,v.knownHosts);for(const p of peers)if(!execFileSync('ssh-keygen',['-F','['+p.host+']:'+p.port,'-f',hosts],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:3000}).trim())fail('CONTROL_PINNED_HOST_MISSING');
  atomic(cfg,JSON.stringify(value)+'\n');controlConfig(home);atomic(auth,lines);
  const latest=await sharedStatus('agent');if(latest.clusterId!==state.clusterId||latest.revision!==state.revision||latest.epoch!==state.epoch)fail('CONTROL_AUTHORITY_CHANGED_DURING_SETUP');
  fs.writeFileSync(path.join(backup,'metadata.json'),JSON.stringify({nodeId:own.nodeId,revision:value.revision,configured:true,siteWriterChanged:false}),{mode:0o600});
  return {configured:true,nodeId:own.nodeId,revision:value.revision,peerCount:peers.length,scope:'PUBLIC_PEER_PINS_ONLY',writerGranted:false,dnsChanged:false};
 }catch(e){targets.forEach((p,i)=>{if(before[i])atomic(p,before[i].bytes,before[i].mode);else if(fs.existsSync(p))fs.unlinkSync(p);});throw e;}finally{fs.rmdirSync(lock);}
}
async function main(){const args=process.argv.slice(2);if(args.length===1&&args[0]==='prepare')return prepare();if(args[0]!=='configure'||args[1]!=='--confirm=CONFIGURE_LAB_CONTROL'||args[2]!=='--node-id'||args.length!==4)fail('CONTROL_SETUP_CONFIRMATION_REQUIRED');let raw='';for await(const b of process.stdin){raw+=b;if(raw.length>65536)fail('CONTROL_SETUP_INPUT_TOO_LARGE');}return configure(raw,args[3]);}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(v=>console.log(JSON.stringify(v))).catch(e=>{console.error(/^CONTROL_[A-Z0-9_]+$/.test(e.message)?e.message:'CONTROL_SETUP_FAILED');process.exitCode=1;});
