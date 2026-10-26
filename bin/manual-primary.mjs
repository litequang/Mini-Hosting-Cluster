#!/usr/bin/env node
// MHC v0.5C manual Primary SELECTION, NOT automatic failover or a fencing authority.
// Manual backup/restore and Cloudflare rerouting are outside this module.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HOME=process.env.HOME||os.homedir();
const CONFIG=path.join(HOME,'.config/mhc-full-installer');
const BASE=path.join(CONFIG,'manual-primary');
const STATE=path.join(BASE,'selection.json');
const AUDIT=path.join(BASE,'events.jsonl');
const VALID_ACTIONS=new Set(['status','plan','begin','complete','abort']);
const cut=(s,n=70)=>typeof s==='string'?s.replace(/[\x00-\x1f\x7f]/g,'').slice(0,n):'';
function requireId(x){if(!ID.test(x||''))throw Error('Invalid registered node ID');return x.toLowerCase();}
function fail(msg){throw Error(msg);}
function safeFile(file,optional=false){
 try{const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||st.size>1024*1024)fail('Unsafe metadata file: '+path.basename(file));return JSON.parse(fs.readFileSync(file,'utf8'));}
 catch(e){if(optional&&e.code==='ENOENT')return null;throw e;}
}
function dirGuard(directory){
 if(fs.existsSync(directory)){const st=fs.lstatSync(directory);if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0)fail('Unsafe manual-primary directory');}
 else fs.mkdirSync(directory,{recursive:true,mode:0o700});
}
function inventory(home=HOME){
 if(fs.lstatSync(path.join(home,'.config/mhc-full-installer/authority.json'),{throwIfNoEntry:false}))fail('Shared authority configured: local Primary selection disabled; use Panel 9090');
 const p=path.join(home,'.config/mhc-full-installer');
 const self=safeFile(path.join(p,'node-identity.json'));
 const cfg=safeFile(path.join(p,'cluster.json'));
 const members=safeFile(path.join(p,'members.json'));
 if(!ID.test(self?.nodeId||'')||!ID.test(cfg?.clusterId||'')||cfg.controllerNodeId!==self.nodeId||cfg.mode!=='inventory-only')fail('Manual selection requires an enrolled local cluster controller');
 if(!Array.isArray(members?.nodes)||members.nodes.length>200)fail('Controller membership registry invalid');
 const unique=new Set();const nodes=members.nodes.map(n=>{
  const id=requireId(n?.nodeId);if(unique.has(id))fail('Duplicate node in registry');unique.add(id);
  return {nodeId:id,label:cut(n.label)||'Unknown node',isController:id===self.nodeId.toLowerCase(),
   heartbeatRecent:id===self.nodeId.toLowerCase()||Number.isFinite(Date.parse(n.lastSeenAt))&&(Date.now()-Date.parse(n.lastSeenAt)<180000),
   heartbeatVerified:id===self.nodeId.toLowerCase()||n.verification==='local-controller'||n.verification==='ssh-authenticated-pairing-only'};
 });
 if(!unique.has(self.nodeId.toLowerCase()))fail('Controller missing in registry');
 return {clusterId:cfg.clusterId,nodes};
}
function loadState(){dirGuard(BASE);const data=safeFile(STATE,true);if(!data)return {schema:1,declaredPrimary:null,pending:null,revision:0};
 if(data.schema!==1||!Number.isSafeInteger(data.revision)||data.revision<0||typeof data!=='object')fail('Invalid manual selection record');
 if(data.pending&&(!ID.test(data.pending.targetNodeId||'')||!ID.test(data.pending.operationId||'')))fail('Invalid pending selection');
 return data;
}
function saveState(next,expected){
 dirGuard(BASE);
 const old=safeFile(STATE,true);
 const current=old?.revision||0;
 if(current!==expected)fail('Manual selection was modified; reload');
 const staging=path.join(BASE,'.selection.'+crypto.randomUUID());
 fs.writeFileSync(staging,JSON.stringify(next,null,2)+'\n',{mode:0o600,flag:'wx'});
 try{fs.renameSync(staging,STATE);}catch(e){fs.rmSync(staging,{force:true});throw e;}
}
function appendAudit(event){
 dirGuard(BASE);
 if(fs.existsSync(AUDIT)){const st=fs.lstatSync(AUDIT);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0)fail('Unsafe audit journal');}
 // Only sanitized IDs and state changes. No credentials, hostnames, DB details or private paths.
 fs.appendFileSync(AUDIT,JSON.stringify({at:new Date().toISOString(),...event})+'\n',{encoding:'utf8',mode:0o600,flag:'a'});
}
function requireTarget(inv,id){const node=inv.nodes.find(n=>n.nodeId===requireId(id));if(!node)fail('Target is not an enrolled cluster member');return node;}
function ensureNoProd(){
 const signal=['apps/thophuongpro/.env','.config/mini-hosting-cluster/ha.json','.config/mini-hosting-cluster/node.json'];
 if(signal.some(p=>fs.existsSync(path.join(HOME,p))))fail('Production/HA footprint: do not manage live Primary from this TEST module');
}
const publicState=(inv,st)=>({mode:'MANUAL_OPERATOR_SELECTION',clusterId:inv.clusterId,
  nodes:inv.nodes,declaredPrimary:st.declaredPrimary?{
    nodeId:st.declaredPrimary.nodeId,label:inv.nodes.find(x=>x.nodeId===st.declaredPrimary.nodeId)?.label||'Unknown',
    recordedAt:st.declaredPrimary.recordedAt,authority:'OPERATOR_RECORDED_ONLY',liveTrafficVerified:false}:null,
  pending:st.pending?{operationId:st.pending.operationId,targetNodeId:st.pending.targetNodeId,
    label:inv.nodes.find(x=>x.nodeId===st.pending.targetNodeId)?.label||'Unknown',createdAt:st.pending.createdAt,expiresAt:st.pending.expiresAt,
    status:'WAITING_FOR_OPERATOR_BACKUP_RESTORE_STOP_AND_ROUTE'}:null,
  automaticReplicationRequired:false,automaticFailover:false,livePrimaryVerified:false,
  routingChangedAutomatically:false,writeFencingVerified:false,
  notice:'This records administrator-confirmed Primary selection; it does NOT stop an old writer, restore data, control Cloudflare routes, verify remote health or authorize HA.'});
function executeUnlocked(args){
 // Tests may call via explicit HOME in a separate process; mutation root is intentionally process HOME.
 const [cmd,target,...rest]=args;
 if(!VALID_ACTIONS.has(cmd))fail('Usage: primary-select status|plan NODE_ID|begin NODE_ID --confirm=PREPARE_MANUAL_PRIMARY|complete OP_ID --confirm=... --backup-restored --old-writes-stopped --target-tested --routing-switched|abort OP_ID --confirm=ABORT_MANUAL_PRIMARY');
 const inv=inventory();const st=loadState();
 if(cmd==='status')return publicState(inv,st);
 if(cmd==='plan'){
  const dest=requireTarget(inv,target);return {mode:'PLAN_ONLY',target:dest,alreadyDeclaredPrimary:st.declaredPrimary?.nodeId===dest.nodeId,
   pending:st.pending!==null,readyToSelect:!st.pending&&dest.heartbeatRecent&&dest.heartbeatVerified,
   requirements:['Backup latest data on old node, stop all old writers','Restore on chosen node and verify site/database','Switch public route outside MHC','Record the selection only after route + health checks'],
   notice:'No remote action or routing change is performed.'};
 }
 ensureNoProd();
 if(cmd==='begin'){
  const dest=requireTarget(inv,target);
  if(rest.length!==1||rest[0]!=='--confirm=PREPARE_MANUAL_PRIMARY')fail('Explicit begin confirmation required');
  if(st.pending)fail('Another primary selection is pending; abort it first');
  if(st.declaredPrimary?.nodeId===dest.nodeId)fail('Target is already the recorded Primary');
  // Heartbeats are metadata, not a health check. Block stale nodes here.
  if(!dest.heartbeatRecent||!dest.heartbeatVerified)fail('Target heartbeat/authentication is not recent; re-enroll/recheck the node');
  const now=Date.now();const op={operationId:crypto.randomUUID(),targetNodeId:dest.nodeId,
   previousNodeId:st.declaredPrimary?.nodeId||null,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+60*60*1000).toISOString()};
  saveState({...st,pending:op,revision:st.revision+1},st.revision);
  appendAudit({action:'BEGIN',operationId:op.operationId,targetNodeId:op.targetNodeId});
  return publicState(inv,{...st,pending:op});
 }
 if(!st.pending||st.pending.operationId!==requireId(target))fail('No matching pending selection');
 if(cmd==='abort'){
  if(rest.length!==1||rest[0]!=='--confirm=ABORT_MANUAL_PRIMARY')fail('Explicit abort confirmation required');
  saveState({...st,pending:null,revision:st.revision+1},st.revision);appendAudit({action:'ABORT',operationId:target});
  return {ok:true,state:'ABORTED_LOCAL_RECORD_ONLY',notice:'Any external Cloudflare or writer changes must be reversed MANUALLY after checking which node received writes.'};
 }
 if(Date.now()>Date.parse(st.pending.expiresAt))fail('Selection expired; abort and start again');
 const required=['--confirm=RECORD_OPERATOR_SELECTED_PRIMARY','--backup-restored','--old-writes-stopped','--target-tested','--routing-switched'];
 if(rest.length!==required.length||required.some(x=>!rest.includes(x)))fail('Missing explicit operator confirmations');
 const dest=requireTarget(inv,st.pending.targetNodeId);
 if(!dest.heartbeatRecent||!dest.heartbeatVerified)fail('Target node is no longer recently authenticated');
 const cleanRetired=(st.retiredPrimaries||[]).filter(x=>x.nodeId!==dest.nodeId);
 const retired=st.pending.previousNodeId&&st.pending.previousNodeId!==dest.nodeId?[...cleanRetired.filter(x=>x.nodeId!==st.pending.previousNodeId),{nodeId:st.pending.previousNodeId,status:'STANDBY_REJOIN_REQUIRES_RESTORE',recordedAt:new Date().toISOString()}]:cleanRetired;
 const newState={...st,revision:st.revision+1,pending:null,retiredPrimaries:retired.slice(-150),declaredPrimary:{nodeId:dest.nodeId,recordedAt:new Date().toISOString(),
   previousNodeId:st.pending.previousNodeId,authority:'OPERATOR_RECORDED_ONLY',routingVerified:false,fencingVerified:false}};
 saveState(newState,st.revision);appendAudit({action:'RECORD_SELECTED_PRIMARY',operationId:target,targetNodeId:dest.nodeId});
 return {ok:true,declaredPrimary:dest.nodeId,mode:'OPERATOR_RECORDED_ONLY',liveTrafficVerified:false,
   notice:'Primary selection recorded. This did not switch cloud routing, stop writers, validate restored database, or grant a write lease.'};
}
// Fail-closed exclusive local lock against concurrent CLI and Panel mutations.
export function execute(args){
 const action=args[0];
 if(action==='status'||action==='plan')return executeUnlocked(args);
 dirGuard(BASE);
 const lock=path.join(BASE,'operation.lock');
 let fd;
 try{fd=fs.openSync(lock,'wx',0o600);}catch(e){if(e.code==='EEXIST')fail('Another manual selection operation may be active; inspect lock and state manually');throw e;}
 try{return executeUnlocked(args);}finally{fs.closeSync(fd);fs.rmSync(lock,{force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(execute(process.argv.slice(2)),null,2));}catch(e){console.error('STOP: '+e.message);process.exitCode=1;}
}
