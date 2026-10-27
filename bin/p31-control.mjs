// Existing authenticated Panel -> allowlisted, forced-command SSH -> signed proof.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import {execFile} from 'node:child_process';
import {CandidateNode,verifyProof} from './p31-node.mjs';import {sharedStatus} from './cluster-authority.mjs';
const home=()=>process.env.HOME||os.homedir(),cfg=()=>path.join(home(),'.config/mhc-full-installer/p31');
export function p31Enabled(){return fs.existsSync(path.join(cfg(),'config.json'));}
export function peerFailure(stderr){const code=String(stderr||'').trim();return Error(/^P31_[A-Z_]{1,90}$/.test(code)?code:'P31_PEER_UNAVAILABLE');}
function config(){const n=new CandidateNode(),c=n.config();if(!Array.isArray(c.peers)||c.peers.length<2||c.peers.length>20||new Set(c.peers.map(p=>p.nodeId)).size!==c.peers.length)throw Error('P31_PEERS_INVALID');return c;}
function peer(c,id){const p=c.peers.find(p=>p.nodeId===id);if(!p||!(/^[a-z0-9_]{1,32}$/.test(p.user))||!(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(p.host))||p.port!==8022||typeof p.publicKey!=='string'||p.publicKey.length>500)throw Error('P31_PEER_NOT_APPROVED');return p;}
function remote(p,request){return new Promise((resolve,reject)=>{
 const proc=execFile('ssh',['-F','/dev/null','-T','-p',String(p.port),'-i',path.join(cfg(),'ssh-key'),'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UpdateHostKeys=no','-o','UserKnownHostsFile='+path.join(cfg(),'known_hosts'),'-o','ConnectTimeout=4',p.user+'@'+p.host,'mhc-p31'],{timeout:25000,maxBuffer:32768,encoding:'utf8'},(err,out,stderr)=>{if(err)return reject(peerFailure(stderr));try{resolve(JSON.parse(out));}catch{reject(Error('P31_PEER_REPLY_INVALID'));}});
 proc.stdin.end(JSON.stringify(request)+'\n');
});}
export async function p31Request(nodeId,action,body={},options={}){
 const c=config(),p=peer(c,nodeId),s=await sharedStatus(),nonce=crypto.randomBytes(32).toString('hex');
 if(!['probe','prepare','standby','promote'].includes(action))throw Error('P31_ACTION_INVALID');
 // Do not even send a writer command: no Worker lease/fencing contract exists in P3.1.
 if(action==='promote')throw Error('P31_UNPROVEN_WRITER_FENCING');
 const r={action,nodeId,nonce,requestId:body.requestId||crypto.randomUUID(),epoch:s.epoch,revision:s.revision,operationId:s.pending?.operationId||null};
 if(action!=='probe'&&(body.expectedRevision!==s.revision||body.epoch!==s.epoch||body.operationId!==(s.pending?.operationId||null)))throw Error('P31_AUTHORITY_REVISION_EPOCH_CHANGED');
 const envelope=nodeId===c.nodeId?await new CandidateNode().accept(r):await remote(p,r);
 const proof=verifyProof(envelope,{publicKey:p.publicKey,nonce,nodeId,clusterId:c.clusterId,epoch:s.epoch,revision:s.revision,operationId:s.pending?.operationId||null});
 const fresh=await sharedStatus();if(fresh.epoch!==s.epoch||fresh.revision!==s.revision||(fresh.pending?.operationId||null)!==(s.pending?.operationId||null))throw Error('P31_AUTHORITY_CHANGED_AFTER_PROOF');
 return proof;
}
export async function p31Readiness(){
 if(!p31Enabled())return {enabled:false,canPromote:false};const c=config();
 const nodes=await Promise.all(c.peers.map(async p=>{try{return {...await p31Request(p.nodeId,'probe'),verified:true};}catch(e){return {nodeId:p.nodeId,verified:false,previewReady:false,websiteServing:false,writerGranted:false,fencingVerified:false,problem:/^P31_[A-Z_]+$/.test(e.message)?e.message:'P31_AUTHORITY_UNAVAILABLE'};}}));
 return {enabled:true,mode:'P31_READ_ONLY_REHEARSAL',canPromote:false,canChangeRoute:false,blocker:'P31_PRIVILEGED_AND_SAME_UID_WRITERS_NOT_FENCED',nodes};
}
