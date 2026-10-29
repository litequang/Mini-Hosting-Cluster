import assert from 'node:assert/strict';import crypto from 'node:crypto';
import worker,{ClusterAuthority} from '../reference/cluster-authority/worker.mjs';
import {authorityRequest} from '../bin/cluster-authority.mjs';
import {SITE_ID,CHUNK_BYTES,siteAction,siteReadiness,siteEffectiveEnv,siteProfiles} from '../reference/cluster-authority/site-standby.mjs';
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
const originalFetch=globalThis.fetch;globalThis.fetch=cf;
try{
 const status=await call('status');assert.equal(status.siteRelayEnabled,true);const nr=status.nodes.find(n=>n.nodeId===c).standby;assert.equal(nr.states.MANAGEMENT_READY,true);assert.equal(nr.states.ROUTE_READY,true);assert.equal(nr.states.SITE_READY,false);assert.equal(nr.states.ELIGIBLE_PRIMARY,false);
 await assert.rejects(call('site-start',{targetNodeId:c,type:'restore',requestId:crypto.randomUUID()},'agent',c),/ROLE_DENIED/);
 await assert.rejects(call('site-poll',{},'panel',c),/ROLE_DENIED/);
 await assert.rejects(start(crypto.randomUUID(),'verify'),/TARGET_NOT_APPROVED/);
 await assert.rejects(call('site-start',{targetNodeId:c,type:'backup',requestId:crypto.randomUUID()}),/EXPLICIT_CONFIRMATION/);
 await assert.rejects(start(c,'restore',{snapshotId:crypto.randomUUID()}),/VERIFIED_BACKUP/);
 const initialP33=structuredClone(storage.data.get('p33')),initialState=structuredClone(storage.data.get('state'));
 const job=(await start(b,'backup')).site.job;assert.equal(job.status,'QUEUED');await poll(b);
 await assert.rejects(start(b,'verify'),/NODE_BUSY/);
 const bytes=crypto.randomBytes(CHUNK_BYTES+17),chunks=[bytes.subarray(0,CHUNK_BYTES),bytes.subarray(CHUNK_BYTES)];
 const upload=(index,extra={})=>call('site-upload',{jobId:job.id,index,data:chunks[index].toString('base64'),sha256:crypto.createHash('sha256').update(chunks[index]).digest('hex'),...extra},'agent',b);
 await assert.rejects(upload(0,{sha256:'0'.repeat(64)}),/CHECKSUM/);
 await assert.rejects(call('site-upload',{jobId:job.id,index:0,data:chunks[0].toString('base64'),sha256:'0'.repeat(64)},'agent',c),/JOB_MISMATCH/);
 await upload(0);await upload(0);const backup={id:job.id,siteId:SITE_ID,bytes:bytes.length,chunks:2,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),manifestSha256:'a'.repeat(64),credentialsIncluded:false};
 await assert.rejects(call('site-result',{jobId:job.id,envelope:sign(b,job.id,{backup})},'agent',b),/BACKUP_INCOMPLETE/);
 await upload(1);const result=await call('site-result',{jobId:job.id,envelope:sign(b,job.id,{backup})},'agent',b);assert.equal(result.site.job.status,'DONE');
 await call('site-result',{jobId:job.id,envelope:sign(b,job.id,{backup})},'agent',b); // lost response is idempotent
 object=new ClusterAuthority(ctx,env); // DO recreation, payload and jobs retained
 const restore=(await start(c,'restore',{snapshotId:job.id})).site.job;const polled=await poll(c);assert.equal(polled.site.snapshot.sha256,backup.sha256);
 await assert.rejects(call('site-download',{jobId:restore.id,index:0},'agent',d),/JOB_MISMATCH/);
 assert.deepEqual(Buffer.from((await call('site-download',{jobId:restore.id,index:0},'agent',c)).site.data,'base64'),chunks[0]);
 const tampered=sign(c,restore.id,{evidence:prepared});tampered.proof.evidence.php=false;await assert.rejects(call('site-result',{jobId:restore.id,envelope:tampered},'agent',c),/SIGNATURE/);
 await assert.rejects(call('site-result',{jobId:restore.id,envelope:sign(c,restore.id,{evidence:{...prepared,writerGate:false}})},'agent',c),/EVIDENCE_INCOMPLETE/);
 await call('site-result',{jobId:restore.id,envelope:sign(c,restore.id,{evidence:prepared})},'agent',c);
 assert.equal(mutations,1,'adds only its own LAB ingress');assert.equal(configs.get(tunnels[c]).config.ingress.length,3);
 const after=await call('status'),ready=after.nodes.find(n=>n.nodeId===c).standby;assert.equal(ready.states.SITE_READY,true);assert.equal(ready.states.ELIGIBLE_PRIMARY,true);assert.ok(after.p33.siteNodeIds.includes(c));assert.ok(!after.p33.controlOnlyNodeIds.includes(c));assert.ok(after.p33.controlOnlyNodeIds.includes(d));
 assert.deepEqual(storage.data.get('p33'),initialP33);assert.deepEqual(storage.data.get('state'),initialState,'preparation never changes lease, epoch or ownership');
 assert.equal(storage.data.get('n1-node:'+c).siteEnabled,true);
 // Readiness expires, and offline never counts as eligible.
 const effective=await storage.transaction(tx=>siteEffectiveEnv(env,tx)),rows=storage.data.get('site-nodes');assert.equal(siteReadiness(effective,initialState,c,rows[c],storage.data.get('n1-node:'+c),now+180001).states.ELIGIBLE_PRIMARY,false);
 // Missing fourth node cannot grant itself writer just because it enrolled / has Control.
 const missing=(await start(d,'verify')).site.job;await poll(d);await call('site-result',{jobId:missing.id,envelope:sign(d,missing.id,{errorCode:'SITE_WEBSITE_DATABASE_MISSING'})},'agent',d);assert.equal((await call('status')).nodes.find(n=>n.nodeId===d).standby.states.ELIGIBLE_PRIMARY,false);
 const req=()=>({requestId:crypto.randomUUID(),expectedRevision:storage.data.get('state').revision,expectedP33Revision:storage.data.get('p33').revision,targetNodeId:d,acceptTargetData:true});
 await assert.rejects(p33Action({ctx,env,action:'p33-begin',body:req(),nodeId:a,authorize:async()=> 'panel',now}),/TARGET_NOT_READY/);
 // Dynamic third site uses the existing manual pipeline; fourth stays management-only.
 await p33Action({ctx,env,action:'p33-begin',body:{...req(),targetNodeId:c},nodeId:a,authorize:async()=> 'panel',now});assert.deepEqual(storage.data.get('p33').participants,[a,b,c].sort());
 const r=storage.data.get('p33');await assert.rejects(p33Action({ctx,env,action:'p33-fenced',body:{requestId:crypto.randomUUID(),expectedRevision:storage.data.get('state').revision,expectedP33Revision:r.revision,operationId:r.operationId,envelopes:[]},nodeId:a,authorize:async()=> 'panel',now}),/ALL_NODES_FENCE/);
 const envelopes=[a,b,c].map(id=>{const proof={schema:3,scope:'MHC_MANAGED_WORDPRESS_LAB',nodeId:id,clusterId:cluster,epoch:r.epoch,operationId:r.operationId,nonce:r.challenge,revision:r.revision,checkedAt:now,expiresAt:now+15000,kind:'FENCED',dataset:{verified:true},management:{panel:true,agent:true},database:{writeDenied:true,connections:0},httpStopped:true,childrenStopped:true};return {proof,signature:crypto.sign(null,Buffer.from(JSON.stringify(proof)),pairs[id].privateKey).toString('base64url')};});
 await p33Action({ctx,env,action:'p33-fenced',body:{requestId:crypto.randomUUID(),expectedRevision:storage.data.get('state').revision,expectedP33Revision:r.revision,operationId:r.operationId,envelopes},nodeId:a,authorize:async()=> 'panel',now});assert.equal(storage.data.get('p33').lease.nodeId,c);
 // Oversized body is rejected before storage; no credentials or payload appear in status.
 await assert.rejects(call('site-upload',{data:'A'.repeat(280000)},'agent',b),/BODY_TOO_LARGE/);assert.ok(!JSON.stringify(await call('status')).includes(chunks[0].toString('base64').slice(0,80)));
 console.log('PASS N1.3 relay: roles/pinned signatures/confirmation/checksums/resume/idempotence/DO restart/private chunks/four-node readiness/expiry/missing-site denial/dynamic three-site all-fence/manual lease; no SSH, no DNS during preparation (fixtures).');
}finally{globalThis.fetch=originalFetch;}
