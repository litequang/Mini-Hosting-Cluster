import assert from 'node:assert/strict';import crypto from 'node:crypto';
import worker,{ClusterAuthority} from '../reference/cluster-authority/worker.mjs';
import {authorityRequest} from '../bin/cluster-authority.mjs';
import {SITE_ID,CHUNK_BYTES,siteAction,siteReadiness,siteEffectiveEnv,siteProfiles,siteCleanup} from '../reference/cluster-authority/site-standby.mjs';
import {p33Action} from '../reference/cluster-authority/p33-manual.mjs';
import {LAB_NODES} from '../reference/cluster-authority/p32-lab.mjs';
class Storage{data=new Map();tail=Promise.resolve();transaction(fn){const job=this.tail.then(async()=>{const m=new Map(structuredClone([...this.data])),value=await fn({get:async k=>structuredClone(m.get(k)),put:async(k,v)=>m.set(k,structuredClone(v)),delete:async k=>m.delete(k)});this.data=m;return value;});this.tail=job.catch(()=>{});return job;}}
const [a,b]=LAB_NODES,c=crypto.randomUUID(),d=crypto.randomUUID(),cluster=crypto.randomUUID(),zone='a'.repeat(32),pairs=Object.fromEntries([a,b,c,d].map(id=>[id,crypto.generateKeyPairSync('ed25519')])),key=id=>pairs[id].publicKey.export({type:'spki',format:'pem'}),tunnels=Object.fromEntries([a,b,c,d].map(id=>[id,crypto.randomUUID()]));
const members=[a,b,c,d].map((nodeId,i)=>({nodeId,label:'Node '+i,agentKey:String(i+1).repeat(43),panelKey:String(i+5).repeat(43)}));
const routes=['site','panel'].map((kind,i)=>({zoneId:zone,recordId:String(i+1).repeat(32),hostname:kind==='site'?'preview-lab.giaouoc.com':'panel-lab.giaouoc.com',kind,nodeTargets:Object.fromEntries([a,b].map(id=>[id,tunnels[id]+'.cfargotunnel.com']))}));
const env={MHC_CLUSTER_ID:cluster,MHC_MEMBERS_JSON:JSON.stringify(members),MHC_P33_ENABLED:'MANUAL_MANAGED_SITE',MHC_P32_LAB_ENABLED:'READ_ONLY_ROUTING',MHC_P32_INITIAL_NODE_ID:a,MHC_P32_CF_TOKEN:'FIXTURE_DNS_TOKEN_123456789012345678901234567890',MHC_P32_ROUTES_JSON:JSON.stringify(routes),MHC_P32_PROOF_KEYS_JSON:JSON.stringify({[a]:key(a),[b]:key(b)}),MHC_CONTROL_NODES_JSON:JSON.stringify(Object.fromEntries([c,d].map(id=>[id,{publicKey:key(id),tunnelId:tunnels[id]}]))),MHC_N1_ENABLED:'LAB_SELF_SERVICE',MHC_N1_CF_TOKEN:'FIXTURE_TUNNEL_TOKEN_12345678901234567890',MHC_N1_CONFIG_JSON:JSON.stringify({accountId:'35b2468610cfa060d5d02865b7996a74',hostname:'panel-lab.giaouoc.com',teamDomain:'fixture.cloudflareaccess.com',audience:'e'.repeat(64)})};
const storage=new Storage(),ctx={storage};let now=Date.now();const healthy=()=>({receivedAt:now,metricsAt:now,sequence:1,telemetry:{onboarding:{installPhase:'INSTALLED'},services:{'amh-panel':'running','mhc-authority-agent':'running','mhc-panel-tunnel':'running'}}});
storage.data.set('state',{schema:1,revision:39,epoch:8,pending:null,dynamicMembers:[],heartbeats:Object.fromEntries([a,b,c,d].map(id=>[id,healthy()]))});storage.data.set('p32',{revision:1,siteNodeId:a,panelNodeId:c,journal:{status:'VERIFIED'}});
storage.data.set('p33',{revision:24,epoch:8,phase:'COMMITTED',operationId:crypto.randomUUID(),targetNodeId:a,primaryNodeId:a,lease:null,journal:{kind:'panel',status:'VERIFIED',targetNodeId:c,controlProfileSha256:crypto.createHash('sha256').update(JSON.stringify({publicKey:key(c),tunnelId:tunnels[c]})).digest('hex')}});
for(const id of [c,d])storage.data.set('n1-node:'+id,{nodeId:id,publicKey:key(id),tunnelId:tunnels[id],phase:'CONTROL_REGISTERED',verifiedAt:now,legacy:false});
let object=new ClusterAuthority(ctx,env);env.MHC_AUTHORITY={idFromName:id=>id,get:()=>({fetch:req=>object.fetch(req)})};
const configs=new Map([c,d].map(id=>[tunnels[id],{config:{ingress:[{hostname:'panel-lab.giaouoc.com',service:'http://127.0.0.1:9090',originRequest:{access:{required:true,teamName:'fixture',audTag:['e'.repeat(64)]}}},{service:'http_status:404'}]}}]));let mutations=0;
const cf=async(url,o)=>{assert.equal(o.headers.authorization,'Bearer '+env.MHC_N1_CF_TOKEN);assert.equal(o.redirect,'manual');const id=url.split('/').at(-2);assert.ok(configs.has(id));if(o.method==='PUT'){mutations++;configs.set(id,JSON.parse(o.body));}else assert.equal(o.method,'GET');return Response.json({success:true,result:configs.get(id)});};
const transport=(url,o)=>worker.fetch(new Request(url,o),env),call=(action,body={},role='panel',id=a)=>authorityRequest({url:'https://fixture.test',clusterId:cluster,nodeId:id,token:members.find(n=>n.nodeId===id)[role+'Key']},action,body,transport);
const direct=(action,body={},role='panel',id=a)=>siteAction({ctx,env,action,body,nodeId:id,authorize:async()=>role,now,fetcher:cf});
const sign=(id,jobId,fields)=>{const proof={schema:1,scope:'MHC_SITE_STANDBY_LAB',siteId:SITE_ID,clusterId:cluster,nodeId:id,jobId,checkedAt:now,...structuredClone(fields)};return {proof,signature:crypto.sign(null,Buffer.from(JSON.stringify(proof)),pairs[id].privateKey).toString('base64url')};};
const prepared={ready:true,siteId:SITE_ID,dataset:{verified:true,manifestSha256:'f'.repeat(64),preparedAt:new Date(now).toISOString()},http:true,php:true,sql:true,files:true,writerGate:true,writeDenied:true,management:true,credentialsCopied:false};
const start=(id,type,extra={})=>call('site-start',{targetNodeId:id,type,requestId:crypto.randomUUID(),confirm:true,preserveExisting:true,...extra});
const poll=id=>call('site-poll',{},'agent',id);

// P4.0 uses the same authenticated Worker/DO fixture and pinned Ed25519 receipts.
const originalR=structuredClone(storage.data.get('p33')),originalS=structuredClone(storage.data.get('state'));
let r=storage.data.get('p33');r.lease={nodeId:a,epoch:r.epoch,operationId:r.operationId,expiresAt:now+90000,scope:'MHC_MANAGED_WORDPRESS_LAB'};storage.data.set('p33',r);
storage.data.set('site-nodes',{[a]:{evidence:{...prepared,syncProtocol:1,activeWriter:true,writeDenied:false,checkedAt:now}},[b]:{evidence:{...prepared,syncProtocol:1,checkedAt:now}}});
const config=(extra={})=>({action:'configure',requestId:crypto.randomUUID(),expectedRevision:storage.data.get('site-sync')?.revision||0,confirm:true,sourceNodeId:a,targetNodeId:b,enabled:false,schedule:{kind:'interval',minutes:60},...extra});
const sync=(body,role='panel')=>call('site-sync',body,role,a);
await assert.rejects(sync(config(),'agent'),/ROLE_DENIED/);
await assert.rejects(sync(config({confirm:false})),/CONFIRMATION/);
await assert.rejects(sync(config({schedule:{kind:'daily',at:'24:00'}})),/SCHEDULE_INVALID/);
await assert.rejects(sync(config({schedule:{kind:'interval',minutes:0}})),/SCHEDULE_INVALID/);
await assert.rejects(sync(config({targetNodeId:d})),/PAIR_INVALID/);
await assert.rejects(sync(config({enabled:true})),/VERIFIED_MANUAL_RUN_REQUIRED/);
let reply=await sync(config());assert.equal(reply.site.sync.schedule.minutes,60);assert.equal(reply.site.sync.enabled,false);
await assert.rejects(sync(config({expectedRevision:0})),/REVISION_CONFLICT/);
const beforeLease=structuredClone(storage.data.get('p33')),beforeState=structuredClone(storage.data.get('state'));
const begin=async()=>{const body={action:'run',requestId:crypto.randomUUID(),expectedRevision:storage.data.get('site-sync').revision,confirm:true};const x=await sync(body);assert.equal((await sync(body)).site.sync.run.id,x.site.sync.run.id);return x.site.sync.run;};
let run=await begin();assert.equal((await call('status')).nodes.find(n=>n.nodeId===b).standby.states.ELIGIBLE_PRIMARY,false);
await assert.rejects(start(b,'verify'),/SYNC_BUSY/);
await assert.rejects(p33Action({ctx,env,action:'p33-begin',body:{requestId:crypto.randomUUID(),expectedRevision:beforeState.revision,expectedP33Revision:beforeLease.revision,targetNodeId:b,acceptTargetData:true},nodeId:a,authorize:async()=> 'panel',now}),/SITE_PREPARATION_BUSY/);
assert.equal((await poll(b)).site.job,null);assert.equal((await poll(a)).site.job.type,'sync-backup');
const bytes=Buffer.from('fixture archive'),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
async function uploaded(run){
 await call('site-upload',{jobId:run.sourceJobId,index:0,data:bytes.toString('base64'),sha256},'agent',a);
 const backup={id:run.sourceJobId,siteId:SITE_ID,bytes:bytes.length,chunks:1,sha256,manifestSha256:'f'.repeat(64),credentialsIncluded:false,sourceSnapshotAt:Date.now(),sourceEpoch:run.epoch,build:'b'.repeat(64),schema:'d'.repeat(64)};
 const wrong=structuredClone(backup);wrong.sourceSnapshotAt=now-3600000;
 await assert.rejects(call('site-result',{jobId:run.sourceJobId,envelope:sign(a,run.sourceJobId,{backup:wrong})},'agent',a),/PROVENANCE_INVALID/);
 await call('site-result',{jobId:run.sourceJobId,envelope:sign(a,run.sourceJobId,{backup})},'agent',a);return backup;
}
let snap=await uploaded(run);assert.equal(storage.data.get('site-sync').run.status,'APPLYING');assert.equal((await poll(b)).site.job.type,'sync-apply');
assert.equal((await call('site-download',{jobId:run.targetJobId,index:0},'agent',b)).site.sha256,sha256);
await call('site-result',{jobId:run.targetJobId,envelope:sign(b,run.targetJobId,{errorCode:'SITE_SYNC_ROLLBACK_REQUIRED',rollbackVerified:false})},'agent',b);
assert.equal(storage.data.get('site-sync').run.status,'BLOCKED');assert.equal((await poll(b)).site.job,null);
await assert.rejects(begin(),/SYNC_BUSY/);
await sync({action:'resume',requestId:crypto.randomUUID(),expectedRevision:1,confirm:true});
await call('site-result',{jobId:run.targetJobId,envelope:sign(b,run.targetJobId,{errorCode:'SITE_SYNC_INTERRUPTED_ROLLED_BACK',rollbackVerified:true})},'agent',b);
assert.equal(storage.data.get('site-sync').run.status,'FAILED');assert.equal(storage.data.get('site-sync').lastApplied,undefined);
// A fresh signed health check follows verified rollback. No stale failed proof can claim readiness.
const rows=storage.data.get('site-nodes');rows[b].evidence={...prepared,syncProtocol:1,checkedAt:now};storage.data.set('site-nodes',rows);
run=await begin();snap=await uploaded(run);await poll(b);
const applied={snapshotId:run.sourceJobId,siteId:SITE_ID,sourceNodeId:a,targetNodeId:b,sourceSnapshotAt:snap.sourceSnapshotAt,restoreAt:Date.now(),sha256,manifestSha256:snap.manifestSha256,build:snap.build,schema:snap.schema,verified:true};
await assert.rejects(call('site-result',{jobId:run.targetJobId,envelope:sign(b,run.targetJobId,{evidence:{...prepared,syncProtocol:1},applied:{...applied,sourceSnapshotAt:now-100000}})},'agent',b),/APPLIED_PROOF_INVALID/);
await call('site-result',{jobId:run.targetJobId,envelope:sign(b,run.targetJobId,{evidence:{...prepared,syncProtocol:1},applied})},'agent',b);
assert.equal(storage.data.get('site-sync').run.status,'VERIFIED');assert.deepEqual(storage.data.get('site-sync').lastApplied,applied);
assert.deepEqual(storage.data.get('p33'),beforeLease);assert.deepEqual(storage.data.get('state'),beforeState);
reply=await sync(config({enabled:true,schedule:{kind:'daily',at:'02:00'}}));assert.equal(reply.site.sync.schedule.timeZone,'Asia/Ho_Chi_Minh');assert.ok(reply.site.sync.nextAt>Date.now());
const {syncNextAt,syncSchedule}=await import('../reference/cluster-authority/site-sync.mjs');
assert.equal(syncNextAt(syncSchedule({kind:'daily',at:'02:00'}),Date.parse('2026-10-29T18:59:00Z')),Date.parse('2026-10-29T19:00:00Z'));
assert.equal(syncNextAt(syncSchedule({kind:'daily',at:'02:00'}),Date.parse('2026-10-29T19:00:00Z')),Date.parse('2026-10-30T19:00:00Z'));
assert.equal(syncNextAt(syncSchedule({kind:'interval',minutes:60}),0),3600000);
const {siteSyncMaintenance}=await import('../reference/cluster-authority/site-standby.mjs');
const v=storage.data.get('site-sync');v.nextAt=now;storage.data.set('site-sync',v);
await siteSyncMaintenance(ctx,env,now);assert.equal(storage.data.get('site-sync').run.status,'CREATING');const sameRun=storage.data.get('site-sync').run.id;await siteSyncMaintenance(ctx,env,now);assert.equal(storage.data.get('site-sync').run.id,sameRun,'cron never overlaps');
run=storage.data.get('site-sync').run;await call('site-result',{jobId:run.sourceJobId,envelope:sign(a,run.sourceJobId,{errorCode:'SITE_SYNC_PRIMARY_LEASE_REQUIRED'})},'agent',a);
assert.deepEqual(storage.data.get('site-sync').lastApplied,applied,'failed next run retains last applied provenance');
r=storage.data.get('p33');r.lease=null;storage.data.set('p33',r);await assert.rejects(begin(),/PRIMARY_LEASE_REQUIRED/);
const pending=storage.data.get('site-sync');pending.nextAt=now;storage.data.set('site-sync',pending);await siteSyncMaintenance(ctx,env,now);assert.equal(storage.data.get('site-sync').lastError,'SITE_SYNC_PRIMARY_LEASE_REQUIRED');assert.equal(storage.data.get('site-sync').nextAt,now+60000);
console.log('PASS P4.0 Authority: authenticated settings/CAS/interval/daily UTC+7/manual-before-enable/backup→apply reservation/checksum/provenance/signed receipt/blocked rollback/resume/failure retention/cron no overlap/expired lease refusal/no route-lease mutation (fixtures).');

const timeoutState=storage.data.get('site-sync');timeoutState.run={...run,status:'CREATING',createdAt:now-900001};storage.data.set('site-sync',timeoutState);await siteSyncMaintenance(ctx,env,now);assert.equal(storage.data.get('site-sync').run.status,'FAILED');assert.equal(storage.data.get('site-nodes')[b].job.rollbackVerified,true);assert.deepEqual(storage.data.get('site-sync').lastApplied,applied);console.log('PASS P4.0 source timeout releases untouched target; applied target timeout stays reserved until proof/resume.');

const {upgradeAuthoritySnapshot}=await import('../bin/source-upgrade.mjs');const reserved=storage.data.get('site-sync');reserved.run={...run,status:'APPLYING',createdAt:now-900001,snapshotId:applied.snapshotId};storage.data.set('site-sync',reserved);await siteSyncMaintenance(ctx,env,now);assert.equal(storage.data.get('site-sync').run.status,'BLOCKED');assert.throws(()=>upgradeAuthoritySnapshot({mode:'SHARED_AUTHORITY_PREPARE_ONLY',nodes:[{nodeId:b}],siteSync:storage.data.get('site-sync')},b),/SITE_SYNC_BLOCKS_UPGRADE/);await siteCleanup(ctx,now+86460000);assert.ok(storage.data.get('site-snapshots').some(s=>s.id===applied.snapshotId),'reserved applied snapshot survives expiry for journal recovery');console.log('PASS P4.0 target timeout keeps reservation, updater blocks and reserved snapshot survives cleanup.');
