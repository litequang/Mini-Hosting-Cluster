import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root=process.argv[2]||process.cwd();
const {generateIdentity,createSignedEnvelope,verifyEnvelope,compareEvidence,scanFixture,verifyFiles}=await import(pathToFileURL(path.join(root,'bin/physical-lab-attest.mjs')));
let n=0;const ok=(x,message)=>{assert.ok(x,message);n++},deny=async(fn,msg)=>{await assert.rejects(fn,msg);n++};
const a=generateIdentity(),b=generateIdentity(),challenge=crypto.randomBytes(24).toString('hex');
const bootA=crypto.randomBytes(32).toString('hex'),bootB=crypto.randomBytes(32).toString('hex'),tree=crypto.randomBytes(32).toString('hex');
const base={schema:1,scope:'MHC_PHYSICAL_EVIDENCE_LAB_ONLY_NO_HA',nodeId:a.identity.nodeId,role:'source',challenge,measuredAt:new Date().toISOString(),bootFingerprint:bootA,
 file:{observed:true,fileCount:2,totalBytes:25,treeSha256:tree},maria:{observed:true,serverId:1001,readOnly:false,binaryLogEnabled:true,gtidBinlogPos:'0-1001-55',gtidSlavePos:null,channelCount:0,ioRunning:false,sqlRunning:false,usingGtid:'NONE_OR_UNKNOWN'},
 guard:{isolatedLab:true},authority:{canSwitchPrimary:false,actualFencingVerified:false,haEligible:false}};
const target={...base,nodeId:b.identity.nodeId,role:'replica',bootFingerprint:bootB,maria:{...base.maria,serverId:2001,readOnly:true,gtidSlavePos:'0-1001-55',gtidBinlogPos:null,channelCount:1,ioRunning:true,sqlRunning:true,usingGtid:'SLAVE_POS'}};
const sign=(payload,id)=>createSignedEnvelope(payload,id.privateKeyPem);
const s=sign(base,a),r=sign(target,b);
const initial=compareEvidence(s,r,a.identity,b.identity,challenge);ok(initial.observationGatePassed,'Happy-path signed observation');
ok(initial.verifiedSignatures,'Both signatures verified');ok(initial.distinctSigningKeys&&initial.distinctBootInstances,'Distinct identities and boot snapshots');
ok(initial.gtidPositionsMatched&&initial.fileFixtureMatched,'Observed GTID and SHA match');
ok(!initial.canSwitchPrimary&&!initial.canArmHA&&!initial.canModifyRouting,'Never confers authority');
ok(!initial.actualTwoTransactionRecoveryProven&&!initial.independentFencingProven&&!initial.atomicDbFileSnapshotProven,'Explicitly unproven claims');
ok(verifyEnvelope(s,a.identity,challenge).ok,'Valid source signature');
for(const [label,mutate,expected] of [
 ['tampered digest',p=>{p.file.treeSha256='f'.repeat(64)},'SOURCE_BAD_SIGNATURE'],
 ['falsified GTID',p=>{p.maria.gtidBinlogPos='0-1001-56'},'SOURCE_BAD_SIGNATURE'],
 ['falsified readiness',p=>{p.authority.canSwitchPrimary=true},'SOURCE_BAD_SIGNATURE'],
 ['modified role',p=>{p.role='replica'},'SOURCE_BAD_SIGNATURE'],
 ['modified node',p=>{p.nodeId=b.identity.nodeId},'SOURCE_BAD_SIGNATURE']]){
 const forged=structuredClone(s);mutate(forged.payload);
 ok(compareEvidence(forged,r,a.identity,b.identity,challenge).blockers.includes(expected),label);
}
const wrongChallenge=crypto.randomBytes(24).toString('hex');ok(compareEvidence(s,r,a.identity,b.identity,wrongChallenge).blockers.some(x=>x.includes('CHALLENGE_MISMATCH')),'Challenge mismatch rejected');
ok(compareEvidence(s,r,a.identity,b.identity,challenge,Date.now()+16*60_000).blockers.some(x=>x.includes('STALE_OR_FUTURE')),'Stale challenge evidence denied');
ok(compareEvidence(s,r,a.identity,b.identity,challenge,Date.now()-16*60_000).blockers.some(x=>x.includes('STALE_OR_FUTURE')),'Future evidence denied');
const wrongKey=generateIdentity();ok(compareEvidence(s,r,wrongKey.identity,b.identity,challenge).blockers.includes('SOURCE_BAD_SIGNATURE'),'Unpinned replacement key denied');
const badPin={...a.identity,fingerprint:'0'.repeat(64)};ok(compareEvidence(s,r,badPin,b.identity,challenge).blockers.includes('SOURCE_PINNED_KEY_FINGERPRINT_MISMATCH'),'Corrupt pin denied');
const sameNode=sign({...target,nodeId:a.identity.nodeId,bootFingerprint:bootA},a);
ok(compareEvidence(s,sameNode,a.identity,a.identity,challenge).blockers.includes('SAME_SIGNING_IDENTITY'),'Same key refused');
const sameBoot=sign({...target,bootFingerprint:bootA},b);ok(compareEvidence(s,sameBoot,a.identity,b.identity,challenge).blockers.includes('SAME_BOOT_INSTANCE'),'Same boot refused');
const noBoot=sign({...target,bootFingerprint:null},b);ok(compareEvidence(s,noBoot,a.identity,b.identity,challenge).blockers.includes('DISTINCT_HOST_BOOT_NOT_OBSERVABLE'),'Missing boot discriminator refused');
const staleWitness=sign({...target,maria:{...target.maria,ioRunning:false}},b);ok(compareEvidence(s,staleWitness,a.identity,b.identity,challenge).blockers.includes('REPLICA_THREADS_NOT_OBSERVED_HEALTHY'),'IO down refused');
const wrongGtid=sign({...target,maria:{...target.maria,gtidSlavePos:'0-1001-56'}},b);ok(compareEvidence(s,wrongGtid,a.identity,b.identity,challenge).blockers.includes('GTID_POSITIONS_NOT_EQUAL'),'GTID mismatch refused');
const wrongFiles=sign({...target,file:{...target.file,treeSha256:'a'.repeat(64)}},b);ok(compareEvidence(s,wrongFiles,a.identity,b.identity,challenge).blockers.includes('FILE_FIXTURE_NOT_EQUAL'),'File mismatch refused');
const badRole=sign({...target,role:'source'},b);ok(compareEvidence(s,badRole,a.identity,b.identity,challenge).blockers.includes('ROLE_ORDER_INVALID'),'Wrong role refused');
const equalId=sign({...target,maria:{...target.maria,serverId:1001}},b);ok(compareEvidence(s,equalId,a.identity,b.identity,challenge).blockers.includes('SAME_MARIADB_SERVER_ID'),'Shared MariaDB ID refused');
const notReadOnly=sign({...target,maria:{...target.maria,readOnly:false}},b);ok(compareEvidence(s,notReadOnly,a.identity,b.identity,challenge).blockers.includes('REPLICA_NOT_OBSERVED_READ_ONLY'),'Read/write replica refused');
const notIsolated=sign({...target,guard:{isolatedLab:false}},b);ok(compareEvidence(s,notIsolated,a.identity,b.identity,challenge).blockers.includes('REPLICA_LAB_GUARD_NOT_ATTESTED'),'No safe LAB declaration refused');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-phys-'));fs.chmodSync(temp,0o700);
try{
 const share=path.join(temp,'share');fs.mkdirSync(share,{mode:0o700});fs.mkdirSync(path.join(share,'sub'),{mode:0o700});
 fs.writeFileSync(path.join(share,'sub','hello.txt'),'Hello MHC',{mode:0o600});fs.writeFileSync(path.join(share,'data.json'),'{}',{mode:0o600});
 const first=await scanFixture(share);ok(first.fileCount===2&&first.totalBytes===11,'Real fixture scan counts bytes');
 const repeated=await scanFixture(share);ok(first.treeSha256===repeated.treeSha256,'Stable content digest');
 fs.writeFileSync(path.join(share,'data.json'),'modified',{mode:0o600});ok((await scanFixture(share)).treeSha256!==first.treeSha256,'Changed content detected');
 fs.symlinkSync(path.join(share,'data.json'),path.join(share,'evil'));
 await deny(()=>scanFixture(share),'Symlink not followed');fs.unlinkSync(path.join(share,'evil'));
 fs.writeFileSync(path.join(share,'oversize'),Buffer.alloc(32*1024*1024+1),{mode:0o600});await deny(()=>scanFixture(share),'Oversized fixture rejected');fs.unlinkSync(path.join(share,'oversize'));
 const file=(name,val)=>{const p=path.join(temp,name);fs.writeFileSync(p,JSON.stringify(val),{mode:0o600});return p};
 const sFile=file('source.json',s),rFile=file('replica.json',r),aKey=file('source-key.json',a.identity),bKey=file('replica-key.json',b.identity);
 ok(verifyFiles(sFile,rFile,aKey,bKey,challenge,a.identity.fingerprint,b.identity.fingerprint).observationGatePassed,'Cross-file offline verification');
 await deny(async()=>verifyFiles(sFile,rFile,aKey,bKey,challenge,'0'.repeat(64),b.identity.fingerprint),'Out of band pin mismatch');
 fs.writeFileSync(rFile,'{}',{mode:0o600});ok(!verifyFiles(sFile,rFile,aKey,bKey,challenge,a.identity.fingerprint,b.identity.fingerprint).observationGatePassed,'Truncated report denied');
 fs.symlinkSync(sFile,path.join(temp,'symlink.json'));await deny(async()=>verifyFiles(path.join(temp,'symlink.json'),rFile,aKey,bKey,challenge,a.identity.fingerprint,b.identity.fingerprint),'Evidence symlink refused');
 const malicious={...s,signature:'not-valid'};ok(!verifyEnvelope(malicious,a.identity,challenge).ok,'Invalid signature not trusted');
}finally{fs.rmSync(temp,{recursive:true,force:true})}
console.log(`PASS: ${n} signed two-node GTID/file LAB evidence assertions; no live Android, witness or production authority`);
