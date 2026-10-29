import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {ControlNode} from '../bin/control-node.mjs';import {controlNodes,controlAdapter,verifyControlProof} from '../reference/cluster-authority/control-nodes.mjs';
const home=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-control-node-')),dir=path.join(home,'.config/mhc-full-installer');fs.mkdirSync(dir,{recursive:true,mode:0o700});
const id=crypto.randomUUID(),other=crypto.randomUUID(),cluster=crypto.randomUUID(),pair=crypto.generateKeyPairSync('ed25519'),remote=crypto.generateKeyPairSync('ed25519'),pem=pair.publicKey.export({type:'spki',format:'pem'}),tunnel=crypto.randomUUID();
const write=(n,v)=>fs.writeFileSync(path.join(dir,n),typeof v==='string'?v:JSON.stringify(v),{mode:0o600});
write('installed','TEST 0.5.0C-REMOTE-PANEL installed on clean Termux');write('node-identity.json',{nodeId:id});write('node-proof-key.pem',pair.privateKey.export({type:'pkcs8',format:'pem'}));write('control-node.json',{schema:1,enabled:true,nodeId:id,clusterId:cluster,keyFlavor:'N1',peers:[{nodeId:id,kind:'control-only',publicKey:pem,user:'u0_a001',host:'192.168.1.2',port:8022},{nodeId:other,kind:'site',publicKey:remote.publicKey.export({type:'spki',format:'pem'}),user:'u0_a002',host:'192.168.1.3',port:8022}]});
const state={clusterId:cluster,epoch:8,nodes:[{nodeId:id,heartbeatRecent:true,telemetryRecent:true}],p33:{enabled:true,epoch:8,revision:21,operationId:crypto.randomUUID(),controlOnlyNodeIds:[id]}};
const node=new ControlNode({home,fixture:true,service:()=>true,authority:async()=>structuredClone(state)}),nonce='a'.repeat(64),entry={publicKey:pem,tunnelId:tunnel};let checks=0;
try{
 const envelope=await node.proof(nonce);assert.equal(envelope.proof.writerGranted,false);assert.equal(envelope.proof.siteReady,false);await verifyControlProof(envelope,entry,state,state.p33,{nodeId:id,nonce,kind:'READY'});checks++;
 await assert.rejects(node.proof(nonce,'ACTIVE'),/REQUEST_INVALID/);checks++;
 await assert.rejects(node.proof(nonce,'PUBLIC_PANEL',{host:'panel-lab.giaouoc.com',accessVerified:false}),/PUBLIC_ACCESS/);checks++;
 const publicEnvelope=await node.proof(nonce,'PUBLIC_PANEL',{host:'panel-lab.giaouoc.com',accessVerified:true});await verifyControlProof(publicEnvelope,entry,state,state.p33,{nodeId:id,nonce,kind:'PUBLIC_PANEL'});checks++;
 state.p33.controlOnlyNodeIds=[];state.p33.siteNodeIds=[id];await verifyControlProof(await node.proof(nonce),entry,state,state.p33,{nodeId:id,nonce,kind:'READY'});state.p33.siteNodeIds=[];state.p33.controlOnlyNodeIds=[id];checks++;
 await assert.rejects(new ControlNode({home,fixture:true,service:()=>false,authority:async()=>state}).proof(nonce),/MANAGEMENT_NOT_READY/);checks++;
 await assert.rejects(new ControlNode({home,fixture:true,service:()=>true,authority:async()=>{throw Error('AUTHORITY_UNREACHABLE');}}).proof(nonce),/UNREACHABLE/);checks++;
 let reads=0;await assert.rejects(new ControlNode({home,fixture:true,service:()=>true,authority:async()=>{const s=structuredClone(state);s.p33.revision+=reads++;return s;}}).proof(nonce),/CHANGED_DURING/);checks++;
 const forged=structuredClone(envelope);forged.proof.siteReady=true;await assert.rejects(verifyControlProof(forged,entry,state,state.p33,{nodeId:id,nonce,kind:'READY'}),/MISMATCH/);checks++;
 await assert.rejects(verifyControlProof(envelope,entry,state,state.p33,{nodeId:id,nonce,kind:'READY',now:envelope.proof.expiresAt+1}),/STALE/);checks++;
 const registry=controlNodes({MHC_CONTROL_NODES_JSON:JSON.stringify({[id]:entry})});assert.equal(Object.keys(registry).length,1);checks++;
 assert.throws(()=>controlNodes({MHC_CONTROL_NODES_JSON:JSON.stringify({[id]:entry,[other]:entry})}),/DUPLICATE/);checks++;
 assert.throws(()=>controlNodes({MHC_CONTROL_NODES_JSON:JSON.stringify({[id]:entry})},{[id]:pem}),/INVALID/);checks++;
 const base={adapter:{fixture:true},routes:[{kind:'site',nodeTargets:{[other]:'site.cfargotunnel.com'}},{kind:'panel',nodeTargets:{[other]:'legacy.cfargotunnel.com'}}]},adapted=JSON.parse(controlAdapter(base,registry).MHC_P3_ROUTES_JSON);assert(!adapted[0].nodeTargets[id]);assert.equal(adapted[1].nodeTargets[id],tunnel+'.cfargotunnel.com');checks++;
 console.log('PASS management-only Control '+checks+' cases: Ed25519/TTL/authority/context/service guards; approved registry maps Panel only, never site/writer. Fixture only.');
}finally{fs.rmSync(home,{recursive:true,force:true});}
