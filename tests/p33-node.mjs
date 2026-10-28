import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {ManagedNode,validManagedLease,readOnlyGrants,P33_SCOPE} from '../bin/p33-node.mjs';
const id='4ed4c025-62ae-4c2a-8d68-65dd76ecf550',other='4a9672d1-bb62-4286-946a-a78b73e57b24',cluster='2c1ea7c0-1d1f-4802-8336-0925a529c431',now=Date.now(),operation=crypto.randomUUID();
const authority={clusterId:cluster,p33:{enabled:true,scope:P33_SCOPE,epoch:6,revision:3,operationId:operation,targetNodeId:id,phase:'ACTIVATING',challenge:crypto.randomBytes(32).toString('hex'),lease:{nodeId:id,epoch:6,scope:P33_SCOPE,operationId:operation,expiresAt:now+90000}}};
assert.equal(validManagedLease(authority,id,now),true);
for(const s of [{}, {...authority,p33:{...authority.p33,enabled:false}},{...authority,p33:{...authority.p33,phase:'FENCING'}},{...authority,p33:{...authority.p33,lease:{...authority.p33.lease,expiresAt:now}}},{...authority,p33:{...authority.p33,lease:{...authority.p33.lease,expiresAt:now+93000}}},{...authority,p33:{...authority.p33,lease:{...authority.p33.lease,epoch:5}}},{...authority,p33:{...authority.p33,lease:{...authority.p33.lease,nodeId:other}}}])assert.equal(validManagedLease(s,id,now),false);
assert(readOnlyGrants(['GRANT USAGE ON *.* TO `mhc_p33_web`@`localhost`','GRANT SELECT ON `mhc_p33_lab`.* TO `mhc_p33_web`@`localhost`']));
assert(!readOnlyGrants(['GRANT ALL PRIVILEGES ON `mhc_p33_lab`.* TO `mhc_p33_web`@`localhost`']));assert(!readOnlyGrants(['GRANT SELECT ON `mhc_p33_lab`.* TO x WITH GRANT OPTION']));
const home=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-p33-node-')),keyDir=path.join(home,'.config/mhc-full-installer/p31');fs.mkdirSync(keyDir,{recursive:true,mode:0o700});const keys=crypto.generateKeyPairSync('ed25519');fs.writeFileSync(path.join(keyDir,'proof-key.pem'),keys.privateKey.export({format:'pem',type:'pkcs8'}),{mode:0o600});
let serving=true,failed=false;const writes=[];
class NodeFixture extends ManagedNode{
 config(){return {nodeId:id,clusterId:cluster};}
 dataset(){return {verified:true,datasetId:'mhc-p33-wordpress-v1'};}
 management(){return {panel:true,agent:true};}
 database(fenced,test){writes.push({fenced,test});return fenced?{writeDenied:true,connections:0}:{writeReadDelete:test};}
 async httpProbe(){return serving;}
 revoke(){writes.push('revoke');serving=false;}
}
const node=new NodeFixture({home,fixture:true,now:()=>now,authority:async()=>{if(failed)throw Error('unreachable');return structuredClone(authority);}});
fs.mkdirSync(path.dirname(node.file),{recursive:true,mode:0o700});fs.writeFileSync(node.file,JSON.stringify({desired:'ACTIVE',generation:crypto.randomUUID(),epoch:6,operationId:operation}),{mode:0o600});
try{
 const active=await node.proof(authority.p33.challenge,'ACTIVE');assert.equal(active.proof.database.writeReadDelete,true);assert(crypto.verify(null,Buffer.from(JSON.stringify(active.proof)),keys.publicKey,Buffer.from(active.signature,'base64url')));
 await assert.rejects(node.proof(authority.p33.challenge,'PUBLIC_PANEL',{host:'panel-lab.giaouoc.com',accessVerified:false}),/PUBLIC_ACCESS/);
 const signed=await node.proof(authority.p33.challenge,'PUBLIC_PANEL',{host:'panel-lab.giaouoc.com',accessVerified:true});assert.equal(signed.proof.accessVerified,true);
 failed=true;await assert.rejects(node.proof(authority.p33.challenge,'ACTIVE'),/unreachable/);failed=false;
 authority.p33.lease.expiresAt=now;await assert.rejects(node.proof(authority.p33.challenge,'ACTIVE'),/NO_ACTIVE_LEASE/);authority.p33.lease.expiresAt=now+90000;
 const request={action:'p33-fence',nodeId:id,nonce:authority.p33.challenge,requestId:crypto.randomUUID(),epoch:6,revision:3,operationId:operation};
 await assert.rejects(node.accept({...request,action:'shell'}),/REQUEST_INVALID/);await assert.rejects(node.accept({...request,epoch:5}),/OPERATION_CHANGED/);
 const fence=await node.accept(request);assert.equal(node.state().desired,'STANDBY');assert.equal(fence.proof.kind,'FENCED');assert.equal(fence.proof.httpStopped,true);assert.equal(fence.proof.database.connections,0);assert(writes.includes('revoke'));
 const sqlCalls=[];const sqlNode=new ManagedNode({home,fixture:true,command:(cmd,args)=>{sqlCalls.push(args.at(-1));return {status:0,stdout:args.at(-1).startsWith('SELECT ID FROM')?'314\n315\n':''};}});sqlNode.revoke();assert.deepEqual(sqlCalls.slice(1),["SELECT ID FROM information_schema.PROCESSLIST WHERE USER='mhc_p33_web'",'KILL CONNECTION 314','KILL CONNECTION 315']);assert(sqlCalls[0].includes('mhc_p33_lab.*'));
 fs.mkdirSync(path.join(home,'apps/thophuongpro'),{recursive:true});fs.writeFileSync(path.join(home,'apps/thophuongpro/.env'),'fixture-only');await assert.rejects(new ManagedNode({home,fixture:true}).proof('a'.repeat(64)),/P31_PRODUCTION_DENIED/);
 console.log('PASS P33 node: lease scope/epoch/expiry/skew, SQL privilege boundaries, real signed activation/fence/public-origin proof, authority failure, stale/unknown action denial, targeted connection drain and production guard (fixtures).');
}finally{fs.rmSync(home,{recursive:true,force:true});}
