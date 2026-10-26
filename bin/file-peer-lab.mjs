// MHC TEST 0.4.0C3 — authenticated, resumable, isolated LAB delta transport.
// SSH host-key pinning + receiver identity required; never apply to served data or HA.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const HOME=process.env.HOME||os.homedir();
const LAB=path.join(HOME,'mhc-file-lab');
const TRANSPORT=path.join(LAB,'transport');
const ID=/^delta-[0-9]{13}-[0-9a-f]{10}$/;
const PEERID=/^[a-f0-9]{32}$/;
const USER=/^[a-z_][a-z0-9_.-]{0,31}$/i;
const HOST=/^(?=.{1,253}$)[a-zA-Z0-9][a-zA-Z0-9.-]*$/;
const INFO={scope:'MHC_ISOLATED_FILE_LAB_ONLY',liveReplication:false,gtidCoupled:false,standbyReady:false,haEligible:false};
const err=(s)=>{throw Error(s)};
const idOk=(id)=>{if(!ID.test(id||''))err('Invalid LAB delta ID');return id;};
async function stat(p){return fsp.lstat(p).catch(e=>{if(e.code==='ENOENT')return null;throw e;});}
async function labPath(p,{missing=false,type='directory'}={}){
 const absolute=path.resolve(p),base=path.resolve(LAB);
 if(absolute!==base&&!absolute.startsWith(base+path.sep))err('Only isolated mhc-file-lab paths supported');
 let at=base;const b=await stat(base);
 if(!b||!b.isDirectory()||b.isSymbolicLink())err('LAB root missing or unsafe');
 const parts=path.relative(base,absolute).split(path.sep).filter(Boolean);
 for(let i=0;i<parts.length;i++){
  const n=parts[i];if(n==='.'||n==='..'||n.includes('\\')||n.startsWith('.')||/[\x00-\x1f]/.test(n))err('Unsafe LAB path');
  at=path.join(at,n);const s=await stat(at);
  if(!s){if(missing&&i===parts.length-1)return;err('LAB component missing');}
  if(s.isSymbolicLink()||(!s.isDirectory()&&!s.isFile()))err('LAB path contains symlink/special file');
  if(i!==parts.length-1&&!s.isDirectory())err('Unsafe LAB parent');
  if(i===parts.length-1&&type==='directory'&&!s.isDirectory())err('Expected LAB directory');
 }
}
async function directory(p){await labPath(path.dirname(p));await fsp.mkdir(p,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});await labPath(p);}
async function isolated(){
 const forbidden=['apps/thophuongpro/.env','.config/mini-hosting-cluster/ha.json','.config/mini-hosting-cluster/node.json'];
 if(forbidden.some(p=>fs.existsSync(path.join(HOME,p))))err('Production / HA signals: LAB transport denied');
 await labPath(LAB);
}
async function readJSON(file,max=12*1024*1024){await labPath(file,{type:'file'});const s=await stat(file);if(!s.isFile()||s.size>max)err('Unsafe metadata');return JSON.parse(await fsp.readFile(file,'utf8'));}
async function writeNew(file,obj){await labPath(path.dirname(file));const h=await fsp.open(file,'wx',0o600);try{await h.writeFile(JSON.stringify(obj,null,2)+'\n');await h.sync();}finally{await h.close();}}
async function writeAtomic(file,obj){await labPath(path.dirname(file));const tmp=file+'.tmp-'+crypto.randomBytes(5).toString('hex');await writeNew(tmp,obj);await fsp.rename(tmp,file);}
function execute(bin,args,{timeout=90000}={}){
 const result=spawnSync(bin,args,{encoding:'utf8',timeout,maxBuffer:1<<20,env:{...process.env}});
 if(result.error||result.status!==0)err(`${bin==='rsync'?'RSYNC':'REMOTE'} failed/interrupted; incomplete transfer remains quarantined. ${(result.error?.code||'').slice(0,32)}`);
 return (result.stdout||'').trim();
}
const sshArgs=(p)=>['-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','-o','NumberOfPasswordPrompts=0','-p',String(p.port)];
function ssh(p,cmd){const txt=execute('ssh',[...sshArgs(p),`${p.user}@${p.host}`,`"$HOME/mhc-full" file-sync ${cmd}`],{timeout:30000});try{return JSON.parse(txt)}catch{err('Remote returned invalid LAB protocol response')}}
function validConfig(p){if(!p||!USER.test(p.user||'')||!HOST.test(p.host||'')||!Number.isInteger(p.port)||p.port<1||p.port>65535||!PEERID.test(p.peerId||''))err('Invalid pinned peer configuration');return p;}
async function selfId(){const x=await readJSON(path.join(TRANSPORT,'receiver.json'));if(x.schema!==1||!PEERID.test(x.receiverId||''))err('Invalid receiver LAB identity');return x.receiverId;}
async function init(){await isolated();await labPath(path.join(LAB,'replica'));await directory(TRANSPORT);
 const file=path.join(TRANSPORT,'receiver.json');if(await stat(file))return {...INFO,status:'RECEIVER_ALREADY_INITIALIZED',receiverId:await selfId()};
 const receiverId=crypto.randomBytes(16).toString('hex');await writeNew(file,{schema:1,receiverId,createdAt:new Date().toISOString()});
 return {...INFO,status:'RECEIVER_INITIALIZED',receiverId,notice:'Use this non-secret identity to pin receiver alongside the verified SSH host key.'};}
async function peerInfo(){await isolated();return {...INFO,status:'LAB_RECEIVER',receiverId:await selfId()};}
async function config(user,host,portStr,id){await isolated();const p=validConfig({user,host,port:Number(portStr),peerId:id});await directory(TRANSPORT);
 // Verified SSH known_hosts check enforced by StrictHostKeyChecking=yes (no accept-new bypass).
 const who=ssh(p,'peer-info');if(who.status!=='LAB_RECEIVER'||who.receiverId!==p.peerId||who.scope!==INFO.scope)err('Pinned receiver identity mismatch');
 const file=path.join(TRANSPORT,'peer.json');if(await stat(file))err('Existing peer config; do not silently replace LAB trust');
 await writeNew(file,{schema:1,...p});return {...INFO,status:'PEER_PINNED',receiverId:p.peerId,notice:'SSH known_hosts and LAB receiver ID checked; source/receiver secrets were not transferred.'};}
async function peer(){await isolated();return validConfig(await readJSON(path.join(TRANSPORT,'peer.json')));}
async function verifyC1(id,which='verify'){idOk(id);const script=path.join(path.dirname(fileURLToPath(import.meta.url)),'file-delta-lab.mjs');
 const output=execute(process.execPath,[script,which,id],{timeout:120000});let x;try{x=JSON.parse(output)}catch{err('Invalid delta verification response')};if(x.status!=='DELTA_CHECKSUM_VERIFIED'||x.id!==id)err('Delta was not independently verified');return x;}
async function checkSafeTree(root){await labPath(root);let items=0;
 const walk=async p=>{for(const e of await fsp.readdir(p,{withFileTypes:true})){
  if(++items>22000)err('Unexpectedly large pending LAB transfer');
  if(e.name.startsWith('.')||e.name.includes('\\')||/[\x00-\x1f]/.test(e.name))err('Unsafe pending item');
  const file=path.join(p,e.name);const s=await stat(file);if(s.isSymbolicLink()||(!s.isDirectory()&&!s.isFile()))err('Unsafe pending symlink/special item');if(s.isDirectory())await walk(file);
 }};await walk(root);
}
async function ensureReceipt(id,check){
 await directory(TRANSPORT);await directory(path.join(TRANSPORT,'receipts'));
 const file=path.join(TRANSPORT,'receipts',id+'.json');
 // Bind an optional C3 checkpoint to the receiver's C2 verified transfer receipt.
 // Legacy C2 deltas omit checkpoint.json and continue to work as C2-only bundles.
 const checkpoint=path.join(LAB,'inbox',id,'checkpoint.json');let checkpointSha256=null;
 if(await stat(checkpoint)){
  await labPath(checkpoint,{type:'file'});const s=await stat(checkpoint);
  if(!s.isFile()||s.size>4096)err('Oversized or invalid LAB checkpoint');
  checkpointSha256=crypto.createHash('sha256').update(await fsp.readFile(checkpoint)).digest('hex');
 }
 if(await stat(file)){
  const existing=await readJSON(file);
  if(existing.id!==id||existing.status!=='CHECKSUM_VERIFIED_NOT_APPLIED'||(existing.checkpointSha256??null)!==checkpointSha256)err('Conflicting receiver receipt or checkpoint changed after verification');
  return;
 }
 await writeNew(file,{schema:1,id,receivedAt:new Date().toISOString(),changed:check.changed,removed:check.removed,checkpointSha256,status:'CHECKSUM_VERIFIED_NOT_APPLIED'});
}
async function prepare(id,expectedBytesStr){await isolated();idOk(id);await selfId();
 if(!/^(0|[1-9][0-9]{0,11})$/.test(expectedBytesStr||''))err('Invalid delta payload size');
 const expectedBytes=Number(expectedBytesStr);
 if(!Number.isSafeInteger(expectedBytes)||expectedBytes>8*1024**3)err('Payload exceeds LAB transport limit');
 const inbox=path.join(LAB,'inbox');await directory(inbox);
 const done=path.join(inbox,id),pending=path.join(inbox,'pending-'+id);
 if(await stat(done)){const check=await verifyC1(id);await ensureReceipt(id,check);return {...INFO,status:'ALREADY_VERIFIED',id};}
 if(!(await stat(pending)))await directory(pending);
 await checkSafeTree(pending);
 let disk;try{disk=await fsp.statfs(inbox);}catch{err('Cannot verify receiver free space')}
 if(Number(disk.bavail)*Number(disk.bsize)<expectedBytes+64*1024*1024)err('Insufficient receiver free space for LAB transfer');
 return {...INFO,status:'READY_FOR_RESUME',id};}
async function finalize(id){await isolated();idOk(id);await selfId();const inbox=path.join(LAB,'inbox');await labPath(inbox);
 const done=path.join(inbox,id),pending=path.join(inbox,'pending-'+id);
 if(await stat(done)){const check=await verifyC1(id);await ensureReceipt(id,check);return {...INFO,status:'ALREADY_VERIFIED',id};}
 await labPath(pending);await checkSafeTree(pending);
 // Staged rename is atomic; on checksum failure put it back for safe retry.
 await fsp.rename(pending,done);
 let check;try{check=await verifyC1(id)}catch(e){await fsp.rename(done,pending);throw e;}
 await ensureReceipt(id,check);
 return {...INFO,status:'RECEIVED_VERIFIED_NOT_APPLIED',id,changed:check.changed,removed:check.removed};}
async function peerSend(id){await isolated();idOk(id);await labPath(path.join(LAB,'outbox',id));await verifyC1(id,'verify-outbox');
 const p=await peer();const info=ssh(p,'peer-info');if(info.receiverId!==p.peerId||info.scope!==INFO.scope)err('Peer identity changed');
 await directory(TRANSPORT);await directory(path.join(TRANSPORT,'journals'));
 const journal=path.join(TRANSPORT,'journals',id+'.json');
 const update=async(status)=>writeAtomic(journal,{schema:1,id,status,observedAt:new Date().toISOString(),receiverId:p.peerId});
 await update('CHECKSUM_VERIFIED_LOCAL');
 try{
  const meta=await readJSON(path.join(LAB,'outbox',id,'meta.json'));
  const expectedBytes=meta.changed.reduce((sum,name)=>sum+(meta.next.files[name]?.size||0),0);
  if(!Number.isSafeInteger(expectedBytes)||expectedBytes>8*1024**3)err('Oversized LAB payload');
  const prep=ssh(p,`peer-prepare ${id} ${expectedBytes}`);
  if(prep.id!==id||!['READY_FOR_RESUME','ALREADY_VERIFIED'].includes(prep.status))err('Invalid remote prepare');
  if(prep.status==='ALREADY_VERIFIED'){await update('REMOTE_CHECKSUM_VERIFIED');return {...INFO,status:'REMOTE_ALREADY_VERIFIED',id};}
  await update('TRANSFER_IN_PROGRESS');
  const sshShell=`ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 -o NumberOfPasswordPrompts=0 -p ${p.port}`;
  execute('rsync',['-rt','--partial','--append-verify','--timeout=45','--no-links','--no-devices','--no-specials','-e',sshShell,
   `${path.join(LAB,'outbox',id)}/`,`${p.user}@${p.host}:mhc-file-lab/inbox/pending-${id}/`],{timeout:180000});
  await update('TRANSFER_SENT_VERIFY_PENDING');
  const receipt=ssh(p,`peer-finalize ${id}`);
  if(!['RECEIVED_VERIFIED_NOT_APPLIED','ALREADY_VERIFIED'].includes(receipt.status)||receipt.id!==id)err('Receiver verification failed');
  await update('REMOTE_CHECKSUM_VERIFIED');
  return {...INFO,status:'REMOTE_CHECKSUM_VERIFIED_NOT_APPLIED',id,changed:receipt.changed??null,removed:receipt.removed??null};
 }catch(e){await update('INTERRUPTED_RETRYABLE');throw e;}
}
async function status(){
 if(!fs.existsSync(LAB))return {...INFO,status:'NOT_CONFIGURED',verified:0,retryable:0,active:0,received:0};
 await isolated();const journals=path.join(TRANSPORT,'journals'),receipts=path.join(TRANSPORT,'receipts');let verified=0,retryable=0,active=0,received=0;
 if(await stat(journals)){await labPath(journals);for(const n of await fsp.readdir(journals)){
  if(!ID.test(n.slice(0,-5))||!n.endsWith('.json'))continue;
  try{const d=await readJSON(path.join(journals,n));if(d.id!==n.slice(0,-5))continue;
    if(d.status==='REMOTE_CHECKSUM_VERIFIED')verified++;else if(d.status==='INTERRUPTED_RETRYABLE')retryable++;else active++;
  }catch{}
 }}
 if(await stat(receipts)){await labPath(receipts);for(const n of await fsp.readdir(receipts))if(n.endsWith('.json')&&ID.test(n.slice(0,-5)))received++;}
 return {...INFO,status:'LAB_PEER_TRANSPORT_ONLY',verified,retryable,active,received,notice:'Metadata from LAB journals; not live poll or GTID/file replication attestation.'};
}
async function main(){const [cmd,...args]=process.argv.slice(2);let result;
 switch(cmd){
 case 'peer-init':if(args.length)err('No arguments');result=await init();break;
 case 'peer-info':if(args.length)err('No arguments');result=await peerInfo();break;
 case 'peer-config':if(args.length!==4)err('Usage peer-config USER HOST PORT RECEIVER_ID');result=await config(...args);break;
 case 'peer-prepare':if(args.length!==2)err('Expected delta ID and payload bytes');result=await prepare(...args);break;
 case 'peer-finalize':if(args.length!==1)err('Expected delta ID');result=await finalize(args[0]);break;
 case 'peer-send':if(args.length!==1)err('Expected delta ID');result=await peerSend(args[0]);break;
 case 'peer-status':if(args.length)err('No arguments');result=await status();break;
 default:err('Usage: file-sync peer-init|peer-info|peer-config USER HOST PORT RECEIVER_ID|peer-send DELTA_ID|peer-prepare DELTA_ID|peer-finalize DELTA_ID|peer-status');
 }
 console.log(JSON.stringify(result,null,2));
}
if(fileURLToPath(import.meta.url)===path.resolve(process.argv[1]||''))main().catch(e=>{console.error('FILE_PEER_LAB_ERROR:',e.message);process.exitCode=1});
