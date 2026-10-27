// Real Ed25519 + HTTP/DO/DNS fixtures. No real Cloudflare mutation or phone cutover.
import assert from 'node:assert/strict';import crypto from 'node:crypto';
import worker,{ClusterAuthority} from '../reference/cluster-authority/worker.mjs';
import {p32Config,p32Action,LAB_NODES} from '../reference/cluster-authority/p32-lab.mjs';
import {authorityRequest} from '../bin/cluster-authority.mjs';
class Storage{
 data=new Map();tail=Promise.resolve();fail=false;
 transaction(fn){const job=this.tail.then(async()=>{const m=new Map(structuredClone([...this.data]));const r=await fn({get:async k=>structuredClone(m.get(k)),put:async(k,v)=>{if(this.fail)throw Error('storage unavailable');m.set(k,structuredClone(v));}});this.data=m;return r;});this.tail=job.catch(()=>{});return job;}
}
const [a,b]=LAB_NODES,cluster='2c1ea7c0-1d1f-4802-8336-0925a529c431',zone='a'.repeat(32),site='b'.repeat(32),panel='c'.repeat(32);
const ta='d8b3fbc5-1a5e-4d6a-958c-21ebc8c6dabb.cfargotunnel.com',tb='dc1650f8-911c-4e82-af3b-d9f61e50b2ee.cfargotunnel.com';
const pairs=Object.fromEntries(LAB_NODES.map(id=>[id,crypto.generateKeyPairSync('ed25519')]));
const entries=LAB_NODES.map((nodeId,i)=>({nodeId,label:i?'XZ3':'Vsmart',agentKey:String(i+1).repeat(43),panelKey:String(i+3).repeat(43)}));
const routes=[{zoneId:zone,recordId:site,hostname:'preview-lab.giaouoc.com',kind:'site',nodeTargets:{[a]:ta,[b]:tb}},{zoneId:zone,recordId:panel,hostname:'panel-lab.giaouoc.com',kind:'panel',nodeTargets:{[a]:ta,[b]:tb}}];
const env={MHC_CLUSTER_ID:cluster,MHC_MEMBERS_JSON:JSON.stringify(entries),MHC_P32_LAB_ENABLED:'READ_ONLY_ROUTING',MHC_P32_INITIAL_NODE_ID:a,MHC_P32_CF_TOKEN:'FAKE_LAB_TOKEN_FOR_FIXTURE_ONLY_123456',MHC_P32_ROUTES_JSON:JSON.stringify(routes),MHC_P32_PROOF_KEYS_JSON:JSON.stringify(Object.fromEntries(LAB_NODES.map(id=>[id,pairs[id].publicKey.export({type:'spki',format:'pem'})])))};
const storage=new Storage(),ctx={storage};let object=new ClusterAuthority(ctx,env),time=Date.now(),failPanel=false,patches=[];
const state=()=>storage.data.get('state'),lab=()=>storage.data.get('p32');
const healthy=()=>({receivedAt:time,metricsAt:time,sequence:1,telemetry:{services:{'amh-panel':'running','mhc-panel-tunnel':'running',nginx:'running'}}});
storage.data.set('state',{schema:1,revision:7,epoch:2,declaredPrimary:null,pending:{operationId:crypto.randomUUID(),targetNodeId:a,epoch:2,status:'PREPARED_NO_WRITER_GRANT'},heartbeats:{[a]:healthy(),[b]:healthy()}});
env.MHC_AUTHORITY={idFromName:id=>id,get:id=>{assert.equal(id,cluster);return {fetch:req=>object.fetch(req)};}};
const records=new Map(routes.map(r=>[r.recordId,{id:r.recordId,name:r.hostname,type:'CNAME',proxied:true,content:ta}]));
const fakeCF=async(url,opts)=>{assert(url.startsWith('https://api.cloudflare.com/client/v4/zones/'+zone+'/dns_records/'));assert.equal(opts.headers.authorization,'Bearer '+env.MHC_P32_CF_TOKEN);const id=url.split('/').at(-1),r=records.get(id);if(opts.method==='PATCH'){if(id===panel&&failPanel)throw Error('network loss');patches.push(id);Object.assign(r,JSON.parse(opts.body));}return Response.json({success:true,result:r});};
const transport=(url,init)=>worker.fetch(new Request(url,init),env);
const call=(action,body={},role='panel')=>authorityRequest({url:'https://authority.fixture',nodeId:a,clusterId:cluster,token:entries[0][role+'Key']},action,body,transport);
function sign(id,{nonce=crypto.randomBytes(32).toString('hex'),website=true,origin=false,overrides={}}={}){
 const s=state(),proof={schema:1,nodeId:id,clusterId:cluster,epoch:s.epoch,revision:s.revision,operationId:s.pending?.operationId||null,nonce,checkedAt:time,expiresAt:time+15000,version:'MHC-LAB-P32-FIXTURE',commit:'d'.repeat(40),scope:'ISOLATED_P31_DATASET_ONLY',role:'STANDBY_READ_ONLY',writerGranted:false,fencingVerified:false,nodeWritersFenced:false,previewReady:true,websiteServing:website,management:{'amh-panel':true,'mhc-authority-agent':true,sshd:true},database:{select:true,writeDenied:true},dataset:{manifestSha256:'e'.repeat(64)},http:website?{status:200,httpMutationDenied:true,staticVerified:true,mediaVerified:true,bodySha256:'f'.repeat(64)}:null,...(origin?{origin:{host:'panel-lab.giaouoc.com',accessVerified:true,...(website?{preview:{hostname:'preview-lab.giaouoc.com',nodeId:id,status:200,bodySha256:'f'.repeat(64)}}:{})}}:{}),...overrides};
 return {proof,signature:crypto.sign(null,Buffer.from(JSON.stringify(proof)),pairs[id].privateKey).toString('base64url')};
}
const body=(id,kind='both',more={})=>({requestId:crypto.randomUUID(),expectedRevision:state().revision,expectedRouteRevision:lab()?.revision||0,targetNodeId:id,kind,envelope:sign(id),...more});
const confirmation=(id,more={})=>body(id,lab().journal.kind,{envelope:sign(id,{nonce:lab().journal.challenge,origin:true,...more})});
const originalFetch=globalThis.fetch,originalNow=Date.now;globalThis.fetch=fakeCF;Date.now=()=>time;
try{
 assert.throws(()=>p32Config({...env,MHC_P32_LAB_ENABLED:'NO'}),/P32_NOT_ENABLED/);
 const bad=structuredClone(routes);bad[1].hostname='panel.giaouoc.com';assert.throws(()=>p32Config({...env,MHC_P32_ROUTES_JSON:JSON.stringify(bad)}),/EXACT_LAB/);
 const shared=structuredClone(routes);shared[0].nodeTargets[b]=ta;assert.throws(()=>p32Config({...env,MHC_P32_ROUTES_JSON:JSON.stringify(shared)}),/SEPARATE_TUNNELS/);
 const mismapped=structuredClone(routes);mismapped[0].nodeTargets[a]=tb;mismapped[0].nodeTargets[b]=ta;assert.throws(()=>p32Config({...env,MHC_P32_ROUTES_JSON:JSON.stringify(mismapped)}),/INCONSISTENT_NODE_TUNNEL_MAP/);
 const duplicateKeys=JSON.parse(env.MHC_P32_PROOF_KEYS_JSON);duplicateKeys[b]=duplicateKeys[a];assert.throws(()=>p32Config({...env,MHC_P32_PROOF_KEYS_JSON:JSON.stringify(duplicateKeys)}),/DISTINCT_NODE_KEYS/);
 await assert.rejects(call('p32-status',{},'agent'),/ROLE_DENIED/);
 await assert.rejects(call('route',body(a)),/P3_NOT_ENABLED/,'new LAB mode does not enable legacy route');
 const initial=body(a);await call('p32-route',initial);assert.equal(patches.length,0,'initial target is GET-verified, never patched');
 assert.equal(lab().journal.status,'DNS_AWAITING_HTTP');assert.equal(state().revision,7);assert.equal(state().epoch,2);
 await assert.rejects(call('abort',{requestId:crypto.randomUUID(),expectedRevision:7,operationId:state().pending.operationId}),/P32_ROUTE_PENDING/);
 await assert.rejects(call('p32-confirm',confirmation(a,{overrides:{origin:{host:'127.0.0.1:9090',accessVerified:false}}})),/PUBLIC_ACCESS_ORIGIN/);
 const tampered=confirmation(a);tampered.envelope.proof.version='tamper';await assert.rejects(call('p32-confirm',tampered),/SIGNATURE_INVALID/);
 await assert.rejects(call('p32-confirm',confirmation(a,{overrides:{checkedAt:time-16000,expiresAt:time-1000}})),/STALE_OR_MISMATCH/);
 const mismatch=confirmation(a);mismatch.envelope=sign(a,{nonce:lab().journal.challenge,origin:true,overrides:{origin:{host:'panel-lab.giaouoc.com',accessVerified:true,preview:{hostname:'preview-lab.giaouoc.com',nodeId:b,status:200,bodySha256:'f'.repeat(64)}}}});await assert.rejects(call('p32-confirm',mismatch),/PREVIEW_IDENTITY_MISMATCH/);
 await call('p32-confirm',confirmation(a));assert.equal(lab().journal.status,'VERIFIED');
 await call('abort',{requestId:crypto.randomUUID(),expectedRevision:7,operationId:state().pending.operationId});
 await call('begin',{requestId:crypto.randomUUID(),expectedRevision:8,targetNodeId:b});
 failPanel=true;const attempt=body(b);await assert.rejects(call('p32-route',attempt),/CLOUDFLARE_NETWORK_FAILED/);
 assert.equal(lab().journal.status,'DNS_REQUESTED');assert.equal(records.get(site).content,tb);assert.equal(records.get(panel).content,ta);
 assert.deepEqual(patches,[site],'site changed before Panel, failure journal durable');
 object=new ClusterAuthority(ctx,env);assert.equal((await call('p32-status')).p32.journal.status,'DNS_REQUESTED','DO process recreated, same journal');
 await call('p32-route',attempt);assert.deepEqual(patches,[site],'idempotent replay does not retry network');
 const conflict={...attempt,kind:'panel'};await assert.rejects(call('p32-route',conflict),/IDEMPOTENCY_CONFLICT/);
 await assert.rejects(call('p32-resume',body(b)),/COOLDOWN_OR_STATE/);
 time+=60001;state().heartbeats[a]=healthy();state().heartbeats[b]=healthy();failPanel=false;
 await call('p32-resume',body(b));assert.deepEqual(patches,[site,panel],'resume skips already applied site PATCH');
 assert.equal(state().declaredPrimary,null);assert.equal(state().revision,9,'DNS journal does not change candidate revision/epoch');
 await assert.rejects(call('p32-confirm',confirmation(a)),/STALE_OR_MISMATCH/,'wrong serving node cannot confirm');
 await call('p32-confirm',confirmation(b));
 const beforeRollback=state().revision;
 await call('p32-rollback',body(a,'both',{envelope:sign(a,{website:false})}));
 assert.equal(lab().journal.status,'ROLLBACK_DNS_AWAITING_HTTP');assert.equal(records.get(site).content,ta);assert.equal(records.get(panel).content,ta);
 await assert.rejects(call('p32-confirm',confirmation(a,{website:false})),/PREVIEW_NOT_SERVING/,'DNS rollback is not HTTP rollback');
 await call('abort',{requestId:crypto.randomUUID(),expectedRevision:state().revision,operationId:state().pending.operationId});
 await call('begin',{requestId:crypto.randomUUID(),expectedRevision:state().revision,targetNodeId:a});
 await call('p32-confirm',confirmation(a));assert.equal(lab().journal.status,'ROLLBACK_VERIFIED');assert.equal(state().revision,beforeRollback+2);
 const concurrent=[body(b,'panel'),body(b,'panel')];const races=await Promise.allSettled(concurrent.map(x=>call('p32-route',x)));assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.equal(races.filter(r=>r.status==='rejected').length,1);
 await call('p32-confirm',confirmation(b,{website:false}));
 // Unknown DNS targets cause a read-only failure before touching any record.
 records.get(panel).content='manual-other.cfargotunnel.com';const previousPatches=patches.length;
 await assert.rejects(call('p32-route',body(a,'panel')),/ROUTE_CONFLICT_MANUAL_REVIEW/);assert.equal(patches.length,previousPatches);
 // Recovery fixture starts with a known verified route; it changes Panel only.
 lab().journal=null;lab().panelNodeId=a;lab().siteNodeId=a;records.get(panel).content=ta;records.get(site).content=ta;
 state().heartbeats[a]={...healthy(),receivedAt:time-360000};state().heartbeats[b]=healthy();env.MHC_P32_PANEL_RECOVERY_ENABLED='LAB_PANEL_ONLY';
 const revisionBefore=state().revision,epochBefore=state().epoch,pendingBefore=structuredClone(state().pending);
 await p32Action({ctx,env,action:'p32-recover',internal:true,now:time,fetcher:fakeCF});assert.equal(records.get(panel).content,tb);assert.equal(records.get(site).content,ta);
 assert.equal(lab().journal.httpVerified,false);assert.equal(state().revision,revisionBefore);assert.equal(state().epoch,epochBefore);assert.deepEqual(state().pending,pendingBefore);assert.equal(state().declaredPrimary,null);
 await call('p32-confirm',confirmation(b,{website:false}));state().heartbeats[a]=healthy();
 const n=patches.length;await p32Action({ctx,env,action:'p32-recover',internal:true,now:time,fetcher:fakeCF});assert.equal(patches.length,n,'old node rejoin does not failback');
 const before=structuredClone(lab());storage.fail=true;await assert.rejects(call('p32-route',body(a,'panel')),/AUTHORITY_STORAGE_UNAVAILABLE/);storage.fail=false;assert.deepEqual(lab(),before,'storage failure creates no intent/DNS mutation');
 const status=await call('status');assert.equal(status.writeLeaseGranted,false);assert.equal(status.automaticFailover,false);assert.equal(status.p32.writerLeaseGranted,false);
 const text=JSON.stringify(status);assert(!text.includes(env.MHC_P32_CF_TOKEN));assert(!text.includes('PRIVATE KEY'));assert(!text.includes(entries[0].panelKey));
 console.log('PASS: P3.2 real Ed25519, exact LAB allowlist, separate Tunnels, auth, CAS, replay, DNS fault/retry, HTTP confirmation, conditional rollback, recovery/no-failback and no writer/Primary (fixtures only).');
}finally{globalThis.fetch=originalFetch;Date.now=originalNow;}
