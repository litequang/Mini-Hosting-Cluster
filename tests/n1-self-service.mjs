import assert from 'node:assert/strict';import crypto from 'node:crypto';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import worker,{ClusterAuthority} from '../reference/cluster-authority/worker.mjs';import {authorityRequest} from '../bin/cluster-authority.mjs';
import {N1SelfService,n1JoinProof} from '../bin/n1-self-service.mjs';import {ControlNode} from '../bin/control-node.mjs';import {LAB_NODES} from '../reference/cluster-authority/p32-lab.mjs';
class Storage{data=new Map();tail=Promise.resolve();transaction(fn){const task=this.tail.then(async()=>{const map=new Map(structuredClone([...this.data])),out=await fn({get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v))});this.data=map;return out;});this.tail=task.catch(()=>{});return task;}}
const [a,b]=LAB_NODES,cluster=crypto.randomUUID(),id=crypto.randomUUID(),pair=crypto.generateKeyPairSync('ed25519'),publicKey=pair.publicKey.export({type:'spki',format:'pem'}),tunnelId=crypto.randomUUID(),tunnelToken='TUNNEL_FIXTURE_OWN_NODE_ONLY_0123456789';
const members=[a,b].map((nodeId,i)=>({nodeId,label:'Site '+i,agentKey:String(i+1).repeat(43),panelKey:String(i+3).repeat(43)})),siteKeys=Object.fromEntries([a,b].map(n=>[n,crypto.generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'})]));
const ta=crypto.randomUUID()+'.cfargotunnel.com',tb=crypto.randomUUID()+'.cfargotunnel.com',account='35b2468610cfa060d5d02865b7996a74',zone='f'.repeat(32),dnsPanel='e'.repeat(32),dnsSite='d'.repeat(32),config={accountId:account,hostname:'panel-lab.giaouoc.com',teamDomain:'fixture.cloudflareaccess.com',audience:'a'.repeat(64)};
const env={MHC_CLUSTER_ID:cluster,MHC_MEMBERS_JSON:JSON.stringify(members),MHC_P33_ENABLED:'MANUAL_MANAGED_SITE',MHC_P32_LAB_ENABLED:'READ_ONLY_ROUTING',MHC_P32_INITIAL_NODE_ID:a,MHC_P32_CF_TOKEN:'DNS_FIXTURE_SECRET_012345678901234567890',MHC_P32_PROOF_KEYS_JSON:JSON.stringify(siteKeys),MHC_P32_ROUTES_JSON:JSON.stringify([{kind:'site',zoneId:zone,recordId:dnsSite,hostname:'preview-lab.giaouoc.com',nodeTargets:{[a]:ta,[b]:tb}},{kind:'panel',zoneId:zone,recordId:dnsPanel,hostname:config.hostname,nodeTargets:{[a]:ta,[b]:tb}}]),MHC_N1_ENABLED:'LAB_SELF_SERVICE',MHC_N1_CONFIG_JSON:JSON.stringify(config)};
let time=Date.now(),cfCalls=0,createCalls=0,putCalls=0,patches=0,created=null,tunnelCfg={config:{ingress:[]}},connected=false,loseCreateReply=true,losePutReply=true,denyToken=false;
const storage=new Storage(),ctx={storage};let instance=new ClusterAuthority(ctx,env);env.MHC_AUTHORITY={idFromName:()=>cluster,get:()=>({fetch:r=>instance.fetch(r)})};
const agent=crypto.randomBytes(32).toString('base64url'),panel=crypto.randomBytes(32).toString('base64url');
let clientCalls=0;const transport=(u,o)=>{clientCalls++;return worker.fetch(new Request(u,o),env);};const call=(action,body={},role='agent',nodeId=id)=>authorityRequest({url:'https://fixture.test',clusterId:cluster,nodeId,token:nodeId===id?(role==='panel'?panel:agent):members.find(m=>m.nodeId===nodeId)[role+'Key']},action,body,transport);
const current=()=>storage.data.get('state'),manual=()=>storage.data.get('p33'),row=()=>storage.data.get('n1-node:'+id);
const fresh=()=>({sequence:1,receivedAt:time,metricsAt:time,telemetry:{services:{'amh-panel':'running','mhc-authority-agent':'running','mhc-panel-tunnel':'running'}}});
storage.data.set('state',{schema:1,revision:9,epoch:5,pending:null,heartbeats:{[a]:fresh(),[b]:fresh()},declaredPrimary:{nodeId:a,scope:'MHC_MANAGED_WORDPRESS_LAB'}});storage.data.set('p32',{revision:2,siteNodeId:a,panelNodeId:a,journal:{status:'VERIFIED'}});storage.data.set('p33',{revision:4,epoch:5,phase:'COMMITTED',operationId:crypto.randomUUID(),primaryNodeId:a,lease:null,journal:{status:'VERIFIED'}});
const fakeCF=async(url,o)=>{
 if(url.includes('/zones/')){assert.equal(o.headers.authorization,'Bearer '+env.MHC_P32_CF_TOKEN);const isPanel=url.endsWith(dnsPanel);if(o.method==='PATCH'){assert(isPanel,'onboarding never changes website DNS');patches++;return Response.json({success:true,result:{id:dnsPanel,type:'CNAME',name:config.hostname,proxied:true,content:tunnelId+'.cfargotunnel.com'}});}return Response.json({success:true,result:{id:isPanel?dnsPanel:dnsSite,type:'CNAME',name:isPanel?config.hostname:'preview-lab.giaouoc.com',proxied:true,content:isPanel&&patches?tunnelId+'.cfargotunnel.com':ta}});}
 cfCalls++;assert(url.startsWith('https://api.cloudflare.com/client/v4/accounts/'+account+'/cfd_tunnel'));assert.equal(o.redirect,'manual');assert.equal(o.headers.authorization,'Bearer '+env.MHC_N1_CF_TOKEN);assert(!url.includes('dns_records'));
 if(denyToken)return new Response('',{status:403});
 const u=new URL(url),suffix=u.pathname.split('/cfd_tunnel')[1];let result;
 if(o.method==='POST'){createCalls++;assert.equal(createCalls,1);const p=JSON.parse(o.body);created={id:tunnelId,name:p.name,config_src:p.config_src,status:'down',connections:[]};if(loseCreateReply){loseCreateReply=false;throw Error('network lost after creation');}result=created;}
 else if(!suffix){assert.equal(o.method,'GET');result=created?[created]:[];}
 else if(suffix==='/'+tunnelId){result={...created,status:connected?'healthy':'down',connections:connected?[{is_pending_reconnect:false}]:[]};}
 else if(suffix.endsWith('/configurations')){if(o.method==='GET'&&!putCalls)return new Response('',{status:404});if(o.method==='PUT'){putCalls++;tunnelCfg=JSON.parse(o.body);if(losePutReply){losePutReply=false;throw Error('lost configuration reply');}}result=tunnelCfg;}
 else if(suffix.endsWith('/token')){result=tunnelToken;}else throw Error('unexpected CF route');
 return Response.json({success:true,result});
};
const originalFetch=globalThis.fetch,originalNow=Date.now;globalThis.fetch=fakeCF;Date.now=()=>time;
const home=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-n1-self-')),dir=path.join(home,'.config/mhc-full-installer'),prefix=path.join(home,'termux-prefix');fs.mkdirSync(dir,{recursive:true,mode:0o700});
const write=(p,v)=>{fs.mkdirSync(path.dirname(p),{recursive:true,mode:0o700});fs.writeFileSync(p,typeof v==='string'?v:JSON.stringify(v),{mode:0o600});};
const advance=n=>{time+=n;for(const n of [a,b,id])current().heartbeats[n]=fresh();};let checks=0;
try{
 const initial=await call('status',{},'panel',a),invite=await call('invite',{requestId:crypto.randomUUID(),expectedRevision:initial.revision},'panel',a),secret=invite.receipt.joinSecret;
 write(path.join(dir,'node-proof-key.pem'),pair.privateKey.export({type:'pkcs8',format:'pem'}));write(path.join(dir,'node-proof-key.pub'),publicKey);
 const proof=n1JoinProof({dir,clusterId:cluster,nodeId:id,joinSecret:secret,fixture:process.platform==='win32'}),joinBody={nodeId:id,label:'Fresh Android',agentKey:agent,panelKey:panel,joinSecret:secret,control:proof};
 const join=async body=>{const r=await worker.fetch(new Request('https://fixture.test/v1/clusters/'+cluster+'/join',{method:'POST',headers:{'x-mhc-node':id,'x-mhc-nonce':crypto.randomUUID()},body:JSON.stringify(body)}),env);return {status:r.status,value:await r.json()};};
 assert.equal((await join({...joinBody,control:{...proof,signature:'A'.repeat(86)}})).status,409);assert.equal(current().dynamicMembers,undefined);checks++;
 const joined=await join(joinBody);assert.equal(joined.status,200);assert.equal(joined.value.writeLeaseGranted,false);assert.equal(current().dynamicMembers[0].controlPublicKey,publicKey);assert.equal(cfCalls,0);checks++;
 current().heartbeats[id]=fresh();const baseOwnership={epoch:current().epoch,primary:structuredClone(current().declaredPrimary),manual:structuredClone(manual())};
 await assert.rejects(call('n1-provision',{},'panel'),/ROLE_DENIED/);await assert.rejects(call('n1-control-proof',{targetNodeId:id}),/ROLE_DENIED/);await assert.rejects(call('n1-provision',{},'agent',a),/APPROVED_FRESH/);checks++;
 await assert.rejects(call('n1-provision'),/CF_TUNNEL_PERMISSION_REQUIRED/);assert.equal(row().phase,'APPROVED');assert.equal(cfCalls,0);checks++;
 env.MHC_N1_CF_TOKEN='API_FIXTURE_ACCOUNT_TUNNEL_ONLY_1234567890';
 await assert.rejects(call('n1-provision'),/CF_UNREACHABLE/);assert.equal(row().phase,'CREATE_REQUESTED');assert.equal(createCalls,1);checks++;
 await assert.rejects(call('n1-provision'),/IN_PROGRESS/);advance(46000);
 await assert.rejects(call('n1-provision'),/CF_UNREACHABLE/);assert.equal(row().phase,'CONFIGURE_REQUESTED');assert.equal(createCalls,1);assert.equal(putCalls,1);checks++;
 const provisioned=await call('n1-provision');assert.equal(provisioned.n1.phase,'WAITING_CONNECTOR');assert.equal(provisioned.n1.tunnelToken,tunnelToken);assert.equal(provisioned.p33.controlOnlyNodeIds.includes(id),false);assert.equal(putCalls,1);checks++;
 assert.equal(tunnelCfg.config.ingress.length,2);assert.equal(tunnelCfg.config.ingress[0].originRequest.access.required,true);assert.equal(tunnelCfg.config.ingress[1].service,'http_status:404');checks++;
 const expectedConfig=structuredClone(tunnelCfg);tunnelCfg.config.ingress[0].hostname='panel.giaouoc.com';await assert.rejects(call('n1-provision'),/EXISTING_TUNNEL_CONFIG_CHANGED/);assert.equal(putCalls,1,'never overwrite changed ingress');tunnelCfg=expectedConfig;checks++;
 const secretStatus=JSON.stringify(await call('status',{},'panel',a));assert(!secretStatus.includes(tunnelToken));assert(!secretStatus.includes(env.MHC_N1_CF_TOKEN));assert(!JSON.stringify([...storage.data.values()]).includes(tunnelToken));checks++;
 write(path.join(dir,'installed'),'TEST 0.5.0C-REMOTE-PANEL installed on clean Termux');write(path.join(dir,'node-identity.json'),{schema:1,nodeId:id,kind:'new-node-standby'});write(path.join(dir,'authority.json'),{schema:1,clusterId:cluster,nodeId:id});write(path.join(home,'.local/state/mhc-new-node-install/progress.json'),{schema:1,nodeId:id,phase:'INSTALLED'});fs.mkdirSync(path.join(home,'android-hosting-panel/data'),{recursive:true,mode:0o700});fs.mkdirSync(prefix,{recursive:true});
 let tunnelStarted=0,panelRestarted=0;
 const ownNode=new ControlNode({home,fixture:true,now:()=>time,service:()=>true,authority:()=>call('status')});
 const service=new N1SelfService({home,prefix,fixture:true,now:()=>time,status:async()=>({...await call('status'),trafficProtocol:0}),request:call,proof:nonce=>ownNode.proof(nonce),execute:(cmd,args)=>{
  if(args.includes('install')){tunnelStarted++;write(path.join(prefix,'var/service/mhc-panel-tunnel/run'),'#!/data/data/com.termux/files/usr/bin/sh\nexec 2>&1\nexec /data/data/com.termux/files/usr/bin/cloudflared tunnel --no-autoupdate run --token-file "$HOME/.config/mhc-full-installer/cloudflare-lab/tunnel-token"\n');}
  if(args[0]==='restart')panelRestarted++;return {status:0,stdout:''};
 }});
 const waiting=await service.tick();assert.equal(waiting.phase,'WAITING_CONNECTOR');assert.equal(tunnelStarted,1);assert.equal(panelRestarted,1);assert.equal(fs.readFileSync(path.join(dir,'cloudflare-lab/tunnel-token'),'utf8').trim(),tunnelToken);if(process.platform!=='win32')assert.equal(fs.statSync(path.join(dir,'cloudflare-lab/tunnel-token')).mode&0o777,0o600);checks++;
 connected=true;advance(46000);const registered=await service.tick();assert.equal(registered.phase,'CONTROL_REGISTERED');assert.equal(tunnelStarted,1);assert.equal(panelRestarted,1);assert.equal(row().phase,'CONTROL_REGISTERED');checks++;
 const status=await call('status',{},'panel',a);assert(status.p33.controlOnlyNodeIds.includes(id));assert(!status.p33.siteNodeIds.includes(id));assert.equal(status.nodes.find(n=>n.nodeId===id).n1.controlRegistered,true);checks++;
 // Protocol1: no periodic proof publication; management-only node responds on demand.
 let countBefore=clientCalls;for(let n=0;n<10;n++)await service.tick();assert.equal(clientCalls-countBefore,40);countBefore=clientCalls;
 const beforeCf=cfCalls;let requests=0,proofs=0;const savedRequest=service.request,savedProof=service.proof;service.request=(...args)=>{requests++;return savedRequest(...args);};service.proof=(...args)=>{proofs++;return savedProof(...args);};
 for(let n=0;n<10;n++)await service.tick({...status,trafficProtocol:1});assert.equal(requests,0);assert.equal(proofs,0);assert.equal(clientCalls-countBefore,0);assert.equal(cfCalls,beforeCf);service.request=savedRequest;service.proof=savedProof;checks++;
 storage.data.set('site-nodes',{[id]:{nextCheckAt:Date.now()+120000}});
 const waitingPoll=call('site-poll',{waitMs:60000},'agent');await new Promise(r=>setTimeout(r,5));
 const request={action:'control-ready',nodeId:id,nonce:crypto.randomBytes(32).toString('hex'),requestId:crypto.randomUUID(),epoch:manual().epoch,revision:manual().revision,operationId:manual().operationId};
 const started=Date.now();await call('site-call',{targetNodeId:id,requestId:request.requestId,request},'panel',a);
 const polled=await waitingPoll;assert.equal(polled.site.job.id,request.requestId);assert.equal(polled.site.job.type,'manual');assert(Date.now()-started<1000);
 const envelope=await ownNode.proof(request.nonce),outer={schema:1,scope:'MHC_SITE_STANDBY_LAB',siteId:'mhc-p33-wordpress-v1',clusterId:cluster,nodeId:id,jobId:request.requestId,checkedAt:Date.now(),request,envelope};
 await call('site-result',{jobId:request.requestId,envelope:{proof:outer,signature:crypto.sign(null,Buffer.from(JSON.stringify(outer)),pair.privateKey).toString('base64url')}});
 const relayed=(await call('site-job',{targetNodeId:id},'panel',a)).site;assert.equal(relayed.publicKey,publicKey);assert.equal(relayed.job.result.envelope.proof.writerGranted,false);assert.equal(relayed.readiness.states.SITE_READY,false);assert.equal(relayed.readiness.states.ELIGIBLE_PRIMARY,false);assert.equal(manual().lease,null);checks++;
 await assert.rejects(call('site-call',{targetNodeId:id,requestId:crypto.randomUUID(),request:{...request,action:'p33-activate'}},'panel',a),/CANDIDATE_NOT_APPROVED/);checks++;
 const cached=await call('n1-control-proof',{targetNodeId:id},'panel',a);assert.equal(cached.n1.envelope.proof.nodeId,id);assert.equal(cached.n1.envelope.proof.writerGranted,false);checks++;
 const bad=structuredClone(cached.n1.envelope);bad.proof.siteReady=true;await assert.rejects(call('n1-publish',{envelope:bad}),/MISMATCH/);checks++;
 const p33Body=()=>({requestId:crypto.randomUUID(),expectedRevision:current().revision,expectedP33Revision:manual().revision,operationId:manual().operationId});
 await assert.rejects(call('p33-begin',{...p33Body(),targetNodeId:id,acceptTargetData:true},'panel',a),/TARGET_NOT_READY/);checks++;
 assert.equal(current().epoch,baseOwnership.epoch);assert.deepEqual(current().declaredPrimary,baseOwnership.primary);assert.deepEqual(manual(),baseOwnership.manual);assert.equal(patches,0);checks++;
 instance=new ClusterAuthority(ctx,env);assert((await call('status',{},'panel',a)).p33.controlOnlyNodeIds.includes(id));assert.equal(createCalls,1);checks++;
 advance(16000);await assert.rejects(call('n1-control-proof',{targetNodeId:id},'panel',a),/N1_CONTROL_PROOF_PENDING/);
 const legacyJob=(await call('site-poll',{},'agent')).site.job;assert.equal(legacyJob.request.action,'control-ready');
 const legacyEnvelope=await ownNode.proof(legacyJob.request.nonce),legacyOuter={schema:1,scope:'MHC_SITE_STANDBY_LAB',siteId:'mhc-p33-wordpress-v1',clusterId:cluster,nodeId:id,jobId:legacyJob.id,checkedAt:Date.now(),request:legacyJob.request,envelope:legacyEnvelope};
 await call('site-result',{jobId:legacyJob.id,envelope:{proof:legacyOuter,signature:crypto.sign(null,Buffer.from(JSON.stringify(legacyOuter)),pair.privateKey).toString('base64url')}});
 const legacyReply=await call('n1-control-proof',{targetNodeId:id},'panel',a);assert.equal(legacyReply.n1.envelope.proof.nonce,legacyJob.request.nonce);assert.equal(legacyReply.n1.envelope.proof.writerGranted,false);checks++;
 const latestProof=(await call('n1-control-proof',{targetNodeId:id},'panel',a)).n1.envelope;
 await call('p33-control',{...p33Body(),targetNodeId:id,nonce:latestProof.proof.nonce,envelope:latestProof},'panel',a);assert.equal(patches,1);assert.equal(manual().journal.status,'AWAITING_PUBLIC');assert.equal(current().epoch,baseOwnership.epoch);assert.deepEqual(current().declaredPrimary,baseOwnership.primary);assert.equal(manual().lease,null);checks++;
 await assert.rejects(call('n1-control-proof',{targetNodeId:id},'panel',a),/STALE_OR_MISMATCH/);
 const publicEnvelope=await ownNode.proof(manual().journal.challenge,'PUBLIC_PANEL',{host:config.hostname,accessVerified:true});await call('p33-confirm',{...p33Body(),panelEnvelope:publicEnvelope},'panel',a);assert.equal(manual().journal.status,'VERIFIED');assert.equal(current().epoch,baseOwnership.epoch);assert.equal(manual().lease,null);checks++;
 advance(46000);denyToken=true;await assert.rejects(service.tick(),/CF_TUNNEL_PERMISSION_REQUIRED/);assert.match(JSON.parse(fs.readFileSync(service.stateFile)).errorCode,/PERMISSION_REQUIRED/);denyToken=false;checks++;
 const originalToken=fs.readFileSync(path.join(dir,'cloudflare-lab/tunnel-token'),'utf8');fs.writeFileSync(path.join(dir,'cloudflare-lab/tunnel-token'),'OTHER_PRIVATE_TOKEN_DO_NOT_REPLACE',{mode:0o600});advance(46000);await assert.rejects(service.tick(),/EXISTING_TUNNEL_TOKEN_DIFFERS/);assert.equal(fs.readFileSync(path.join(dir,'cloudflare-lab/tunnel-token'),'utf8'),'OTHER_PRIVATE_TOKEN_DO_NOT_REPLACE');fs.writeFileSync(path.join(dir,'cloudflare-lab/tunnel-token'),originalToken,{mode:0o600});checks++;
 write(path.join(home,'.config/mini-hosting-cluster/node.json'),'{}');await assert.rejects(service.tick(),/PRODUCTION_DENIED/);checks++;
 assert(!JSON.stringify([...storage.data.values()]).includes(env.MHC_N1_CF_TOKEN));assert(!JSON.stringify([...storage.data.values()]).includes(tunnelToken));assert.equal(createCalls,1);assert.equal(putCalls,1);
 console.log('PASS N1 self-service '+checks+' cases: real signatures/join approval/role isolation, no-secret status, CF create/config lost-reply resume, own token, service retry, durable dynamic Control, relay proof TTL, manual public confirmation, no writer/site/epoch mutation. Fixtures only.');
}finally{globalThis.fetch=originalFetch;Date.now=originalNow;fs.rmSync(home,{recursive:true,force:true});}
