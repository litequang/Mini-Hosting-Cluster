#!/usr/bin/env node
// Configure the explicit P3.1 LAB peer channel; no DNS, writer, identity or password migration.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {LAB_NODES,supportedRuntime} from './source-upgrade.mjs';
const fail=c=>{throw Error(c);},home=os.homedir(),prefix=process.env.PREFIX||'',cfg=path.join(home,'.config/mhc-full-installer/p31');
export async function waitForSupervisor(service,{ready=()=>fs.existsSync(path.join(service,'supervise/ok')),pause=()=>new Promise(r=>setTimeout(r,250)),attempts=60}={}){for(let n=0;n<attempts;n++){if(ready())return;await pause();}fail('P31_RUNIT_SUPERVISOR_NOT_READY');}
function safe(p){let at=home;const rel=path.relative(home,p);if(rel.startsWith('..')||path.isAbsolute(rel))fail('P31_SETUP_PATH_INVALID');for(const part of rel.split(path.sep)){at=path.join(at,part);if(fs.lstatSync(at,{throwIfNoEntry:false})?.isSymbolicLink())fail('P31_SETUP_SYMLINK_DENIED');}return p;}
function gate(){if(!supportedRuntime(process.platform,prefix))fail('P31_TERMUX_ONLY');for(const p of ['apps/thophuongpro/.env','.config/mini-hosting-cluster/ha.json','.config/mini-hosting-cluster/node.json'])if(fs.existsSync(path.join(home,p)))fail('P31_PRODUCTION_DENIED');const root=path.join(home,'.config/mhc-full-installer');safe(root);if(fs.readFileSync(path.join(root,'installed'),'utf8').trim()!=='TEST 0.5.0C-REMOTE-PANEL installed on clean Termux')fail('P31_MARKER_INVALID');const id=JSON.parse(fs.readFileSync(path.join(root,'node-identity.json'))).nodeId;if(!LAB_NODES.includes(id))fail('P31_NODE_NOT_LAB');return id;}
const privateWrite=(p,v)=>{safe(p);fs.writeFileSync(p,v,{flag:'wx',mode:0o600});};
function existingOrCreate(p,bytes){safe(p);if(fs.existsSync(p)){if(fs.readFileSync(p,'utf8')!==bytes)fail('P31_EXISTING_CONFIGURATION_DIFFERS');}else privateWrite(p,bytes);}
function command(cmd,args){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:15000,maxBuffer:32768,env:{...process.env,SVDIR:path.join(prefix,'var/service')}});if(r.status!==0||r.error)fail('P31_SETUP_COMMAND_FAILED');return r.stdout;}
function prepare(){const nodeId=gate();safe(cfg);fs.mkdirSync(cfg,{recursive:true,mode:0o700});fs.chmodSync(cfg,0o700);
 const proof=path.join(cfg,'proof-key.pem'),pub=path.join(cfg,'proof-public.pem');
 if(!fs.existsSync(proof)){const pair=crypto.generateKeyPairSync('ed25519');privateWrite(proof,pair.privateKey.export({type:'pkcs8',format:'pem'}));privateWrite(pub,pair.publicKey.export({type:'spki',format:'pem'}));}
 safe(proof);safe(pub);const publicKey=crypto.createPublicKey(fs.readFileSync(proof)).export({type:'spki',format:'pem'});if(fs.readFileSync(pub,'utf8')!==publicKey)fail('P31_PUBLIC_KEY_MISMATCH');
 const ssh=path.join(cfg,'ssh-key');safe(ssh);safe(ssh+'.pub');if(!fs.existsSync(ssh))command('ssh-keygen',['-q','-t','ed25519','-N','','-C','mhc-p31-lab-'+nodeId,'-f',ssh]);fs.chmodSync(ssh,0o600);
 const sshPublicKey=fs.readFileSync(ssh+'.pub','utf8').trim();if(!/^ssh-ed25519 [A-Za-z0-9+/=]+ mhc-p31-lab-[a-f0-9-]{36}$/.test(sshPublicKey))fail('P31_SSH_PUBLIC_KEY_INVALID');
 const clusterId=JSON.parse(fs.readFileSync(path.join(home,'.config/mhc-full-installer/authority.json'))).clusterId;
 return {nodeId,clusterId,publicKey,sshPublicKey};
}
async function configure(){const own=prepare();let raw='';for await(const b of process.stdin){raw+=b;if(raw.length>20000)fail('P31_SETUP_INPUT_TOO_LARGE');}const v=JSON.parse(raw),peers=v.peers;
 if(!Array.isArray(peers)||peers.length!==2||new Set(peers.map(p=>p.nodeId)).size!==2||peers.some(p=>!LAB_NODES.includes(p.nodeId)||!/^[a-z0-9_]{1,32}$/.test(p.user)||!/^192\.168\.1\.\d{1,3}$/.test(p.host)||p.port!==8022||crypto.createPublicKey(p.publicKey).asymmetricKeyType!=='ed25519'||!/^ssh-ed25519 [A-Za-z0-9+/=]+ mhc-p31-lab-[a-f0-9-]{36}$/.test(p.sshPublicKey||'')))fail('P31_SETUP_PEERS_INVALID');
 const self=peers.find(p=>p.nodeId===own.nodeId);if(self.publicKey!==own.publicKey||self.sshPublicKey!==own.sshPublicKey)fail('P31_SETUP_SELF_KEY_MISMATCH');
 if(typeof v.knownHosts!=='string'||v.knownHosts.length>10000||v.knownHosts.split('\n').filter(Boolean).some(l=>!/^\S+ (ssh-ed25519|ecdsa-sha2-nistp256|ssh-rsa) [A-Za-z0-9+/=]+$/.test(l)))fail('P31_PINNED_HOST_KEYS_REQUIRED');
 existingOrCreate(path.join(cfg,'known_hosts'),v.knownHosts);
 for(const p of peers)if(!command('ssh-keygen',['-F',`[${p.host}]:${p.port}`,'-f',path.join(cfg,'known_hosts')]).trim())fail('P31_PINNED_PEER_HOST_MISSING');
 const value={schema:1,enabled:true,nodeId:own.nodeId,clusterId:own.clusterId,datasetId:'mhc-p31-synthetic-v1',peers};existingOrCreate(path.join(cfg,'config.json'),JSON.stringify(value)+'\n');
 const sshDir=safe(path.join(home,'.ssh'));fs.mkdirSync(sshDir,{recursive:true,mode:0o700});const auth=safe(path.join(sshDir,'authorized_keys'));let lines=fs.existsSync(auth)?fs.readFileSync(auth,'utf8'):'';
 const state=safe(path.join(home,'.local/state/mhc-p31-node'));fs.mkdirSync(state,{recursive:true,mode:0o700});const backup=path.join(state,'authorized_keys.before-p31');if(!fs.existsSync(backup))privateWrite(backup,lines);
 for(const p of peers.filter(p=>p.nodeId!==own.nodeId)){const forced=`restrict,command="${prefix}/bin/node ${home}/.local/share/mhc-full-installer/bin/p31-node.mjs accept" ${p.sshPublicKey}`;const key=p.sshPublicKey.split(' ')[1];const found=lines.split('\n').find(l=>l.includes(key));if(found&&found!==forced)fail('P31_EXISTING_SSH_KEY_OPTIONS_DIFFER');if(!found)lines=lines.trimEnd()+'\n'+forced+'\n';}
 const next=auth+'.p31-'+crypto.randomUUID();privateWrite(next,lines);fs.renameSync(next,auth);fs.chmodSync(auth,0o600);
 const service=path.join(prefix,'var/service/mhc-lab-p31'),run=`#!/data/data/com.termux/files/usr/bin/sh\nexport HOME=${home}\nexec ${prefix}/bin/node ${home}/.local/share/mhc-full-installer/bin/p31-node.mjs watch\n`;
 if(fs.lstatSync(service,{throwIfNoEntry:false})?.isSymbolicLink())fail('P31_SETUP_SERVICE_UNSAFE');
 if(!fs.existsSync(service)){fs.mkdirSync(service,{mode:0o700});fs.writeFileSync(path.join(service,'down'),'');fs.writeFileSync(path.join(service,'run'),run,{mode:0o700,flag:'wx'});}else if(fs.readFileSync(path.join(service,'run'),'utf8')!==run)fail('P31_EXISTING_SERVICE_DIFFERS');
 await waitForSupervisor(service);command('sv-enable',['mhc-lab-p31']);command('sv',['-w','10','up',service]);return {configured:true,nodeId:own.nodeId,scope:'READ_ONLY_LAB_REHEARSAL',writerGranted:false};
}
async function main(){if(process.argv[2]==='prepare')return prepare();if(process.argv[2]==='configure')return configure();fail('Usage: p31-configure prepare|configure (public peer configuration on stdin)');}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(v=>console.log(JSON.stringify(v))).catch(e=>{console.error(/^P31_[A-Z_]+$/.test(e.message)?e.message:'P31_SETUP_FAILED');process.exitCode=1;});
