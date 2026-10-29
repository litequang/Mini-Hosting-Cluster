import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {applyStandbySnapshot,atomicPrivate,assertSyncStandby} from '../bin/site-sync.mjs';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-p40-'));let passed=0;
async function scenario(kind){
 const dir=path.join(tmp,kind),base=dir+'/lab',work=dir+'/jobs',source=crypto.randomUUID(),target=crypto.randomUUID(),id=crypto.randomUUID(),runId=crypto.randomUUID(),snapshotId=crypto.randomUUID(),now=Date.now(),operationId=crypto.randomUUID();
 fs.mkdirSync(base+'/site/wp-content/themes/p33lab',{recursive:true});fs.mkdirSync(work,{recursive:true});fs.writeFileSync(base+'/site/wp-config.php','OWN_TARGET_SECRET');fs.writeFileSync(base+'/site/wp-content/themes/p33lab/index.php','old theme');fs.writeFileSync(base+'/db-client.cnf','OWN_TARGET_SQL');
 atomicPrivate(base+'/dataset.json',{files:[{path:'site/wp-config.php',sha256:hash('OWN_TARGET_SECRET')},{path:'site/wp-content/themes/p33lab/index.php',sha256:hash('old theme')}],tag:'old'});
 const job={id,snapshotId,type:'sync-apply',sync:{runId,sourceNodeId:source,targetNodeId:target,epoch:9,operationId}},bytes=Buffer.from('snapshot'),snapshot={id:snapshotId,siteId:'mhc-p33-wordpress-v1',nodeId:source,credentialsIncluded:false,bytes:bytes.length,chunks:1,sha256:hash(bytes),manifestSha256:'a'.repeat(64),sourceEpoch:9,sourceSnapshotAt:now,build:'b'.repeat(64),schema:'c'.repeat(64)};
 let db='old',newVerifyFailed=false,guardCalls=0;
 const state={p33:{enabled:true,phase:'COMMITTED',epoch:9,operationId,primaryNodeId:source,lease:{nodeId:source,expiresAt:now+90000}},siteSync:{run:{id:runId,status:'APPLYING'}}};
 const c={node:{base,childrenFile:dir+'/children.json',state:()=>({desired:'STANDBY'}),httpProbe:async()=>false,database:()=>({writeDenied:true}),dataset:()=>({verified:true})},id:{nodeId:target},work};
 const portable=value=>({schema:1,siteId:snapshot.siteId,credentialsIncluded:false,snapshotAt:now,build:snapshot.build,tableSchema:snapshot.schema,value});
 const o={read,standby:async()=>{guardCalls++;return state;},request:async()=>({site:{data:bytes.toString('base64'),sha256:kind==='checksum'?'0'.repeat(64):hash(bytes),size:bytes.length}}),
  archive:(mode,site,file,content)=>{assert.equal(mode,'unpack');fs.mkdirSync(site+'/wp-content/themes/p33lab',{recursive:true});fs.writeFileSync(site+'/wp-content/themes/p33lab/index.php','new theme');atomicPrivate(content,portable('new'));return {manifestSha256:snapshot.manifestSha256};},
  php:(_,mode,content)=>{if(mode==='export-local')atomicPrivate(content,portable(db));else if(mode==='apply'){if(kind==='sql-failure'&&read(content).value==='new')throw Error('SITE_SQL_TRANSACTION_FAILED');db=read(content).value;}else if(mode==='check')assert.equal(db,read(content).value);else throw Error('unexpected PHP');},
  verify:async()=>{assert.equal(fs.existsSync(base+'/sync-maintenance.json'),false);if(kind==='verify-failure'&&db==='new'&&!newVerifyFailed){newVerifyFailed=true;throw Error('SITE_HTTP_PHP_CONTENT_FAILED');}return {ready:true,dataset:{verified:true}};}};
 if(kind==='active')state.p33.lease={nodeId:target,expiresAt:now+90000};
 let result=await applyStandbySnapshot(c,job,snapshot,o);
 if(['checksum','active','sql-failure','verify-failure'].includes(kind)){
  assert(result.errorCode);assert.equal(result.rollbackVerified,true);assert.equal(db,'old');assert.equal(fs.readFileSync(base+'/site/wp-content/themes/p33lab/index.php','utf8'),'old theme');assert.equal(read(base+'/dataset.json').tag,'old');
 }else{
  assert.equal(result.applied.verified,true);assert.equal(result.applied.sourceSnapshotAt,now);assert.equal(db,'new');assert.equal(fs.readFileSync(base+'/site/wp-content/themes/p33lab/index.php','utf8'),'new theme');
  const second=await applyStandbySnapshot(c,job,snapshot,o);assert.deepEqual(second.applied,result.applied,'resume VERIFIED is idempotent');
  if(kind==='crash-resume'){
   const d=work+'/'+id,j=read(d+'/apply.json');j.stage='APPLYING';atomicPrivate(d+'/apply.json',j);atomicPrivate(base+'/sync-maintenance.json',{jobId:id});
   result=await applyStandbySnapshot(c,job,snapshot,o);assert.equal(result.rollbackVerified,true);assert.equal(db,'old');assert.equal(fs.readFileSync(base+'/site/wp-content/themes/p33lab/index.php','utf8'),'old theme');
  }
 }
 assert.equal(fs.readFileSync(base+'/site/wp-config.php','utf8'),'OWN_TARGET_SECRET');assert.equal(fs.readFileSync(base+'/db-client.cnf','utf8'),'OWN_TARGET_SQL');assert(guardCalls>0);passed++;
}
try{for(const kind of ['success','checksum','active','sql-failure','verify-failure','crash-resume'])await scenario(kind);console.log('PASS P4.0 target journal: '+passed+' fixtures; checksum/pre-mutation refusal/transaction failure/HTTP rollback/crash resume/idempotent verification/own credentials retained. PHP and Android are separate tests.');}finally{fs.rmSync(tmp,{recursive:true,force:true});}
