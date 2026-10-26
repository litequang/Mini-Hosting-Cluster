// Signed active localhost HTTP canary probes; two-device assertions are MOCKED.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.argv[2]||process.cwd();
const {liveCanaryProbe,signProbe,verifyFenceEvidence}=await import(pathToFileURL(path.join(root,'bin/lab-fence-probe.mjs')));
const {generateIdentity}=await import(pathToFileURL(path.join(root,'bin/physical-lab-attest.mjs')));
let n=0;
const ok=(v,label)=>{assert.ok(v,label);n++};
const deny=async(fn,label)=>{await assert.rejects(async()=>await fn(),label);n++};
const source=generateIdentity(),replica=generateIdentity();
const identities={source:source.identity,replica:replica.identity},pins={source:source.identity.fingerprint,replica:replica.identity.fingerprint};
const challenge=crypto.randomBytes(24).toString('hex'),token=crypto.randomBytes(32).toString('hex');
const bootA=crypto.randomBytes(32).toString('hex'),bootB=crypto.randomBytes(32).toString('hex');
let mode='denied',calls=0;
const server=http.createServer(async(req,res)=>{
 calls++;
 ok(req.socket.remoteAddress==='127.0.0.1','Loopback connection');
 ok(req.url==='/v1/lab/canary'&&req.method==='POST','Fixed LAB HTTP route');
 ok(req.headers.authorization==='Bearer '+token,'Bearer token checked');
 let bytes=Buffer.alloc(0);for await (const chunk of req)bytes=Buffer.concat([bytes,chunk]);
 ok(bytes.toString().includes(challenge),'Challenge was sent in body');
 if(mode==='allowed'){
  res.writeHead(201,{'Content-Type':'application/json'});
  res.end(JSON.stringify({scope:'ISOLATED_LOOPBACK_HTTP_WRITE_GATE_LAB_ONLY',status:'ISOLATED_LAB_ARTIFACT_PUBLISHED',productionProtected:false,haEligible:false,
   kind:'canary',epoch:4,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}));
 }else if(mode==='forged'){
  res.writeHead(201,{'Content-Type':'application/json'});res.end(JSON.stringify({scope:'invalid',status:'ISOLATED_LAB_ARTIFACT_PUBLISHED'}));
 }else if(mode==='wrong-denial'){
  res.writeHead(401,{'Content-Type':'application/json'});res.end('{}');
 }else{
  res.writeHead(503,{'Content-Type':'application/json'});
  res.end(JSON.stringify({scope:'ISOLATED_LOOPBACK_HTTP_WRITE_GATE_LAB_ONLY',status:'WITNESS_OR_LAB_WRITE_DENIED',productionProtected:false,haEligible:false}));
 }
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
const attempt=async(phase)=>liveCanaryProbe({phase,challenge,token,port});
let old,newer,outage;
try{
 old=await attempt('old-denied');ok(old.observed==='denied'&&old.matchesExpected,'Old writer denied by responsive LAB gate');
 mode='allowed';newer=await attempt('new-allowed');ok(newer.observed==='allowed'&&newer.matchesExpected,'New LAB writer accepted');
 mode='denied';outage=await attempt('witness-denied');ok(outage.observed==='denied'&&outage.matchesExpected,'Witness loss denies LAB canary');
 ok(calls===3,'Three live localhost HTTP posts observed');
 mode='allowed';const unsafe=await attempt('old-denied');ok(unsafe.observed==='allowed'&&!unsafe.matchesExpected,'Unexpected old acceptance not classified as fencing');
 mode='forged';await deny(()=>attempt('old-denied'),'Wrong HTTP scope must not pass');
 mode='wrong-denial';await deny(()=>attempt('old-denied'),'401 is not proof of fencing');
 await deny(()=>liveCanaryProbe({phase:'old-denied',challenge,token:'bad',port}),'Invalid token preflight refused');
 await deny(()=>liveCanaryProbe({phase:'fake',challenge,token,port}),'Invalid phase refused');
 await deny(()=>liveCanaryProbe({phase:'old-denied',challenge:'abc',token,port}),'Invalid challenge refused');
}finally{await new Promise(r=>server.close(r))}
const at=Date.now();
const sign=(role,phase,result,time,boot=role==='source'?bootA:bootB)=>signProbe({identity:identities[role],privateKeyPem:role==='source'?source.privateKeyPem:replica.privateKeyPem,
 role,phase,challenge,result,at:new Date(time).toISOString(),bootFingerprint:boot});
const a=sign('source','old-denied',old,at-3000),b=sign('replica','new-allowed',newer,at-2000),c=sign('replica','witness-denied',outage,at-1000);
const run=(x=[a,b,c],ids=identities,ps=pins,ch=challenge,now=at)=>verifyFenceEvidence(x,ids,ps,ch,now);
const good=run();ok(good.signedLabCanarySequenceObserved,'Three signed canary observations accepted');
ok(good.blockerCount===0&&good.coverage.oldLabCanaryDenied&&good.coverage.newLabCanaryAccepted&&good.coverage.witnessOutageLabCanaryDenied,'Three active phases accepted');
ok(!good.limitations.canSwitchPrimary&&!good.limitations.canArmHA&&!good.limitations.allHostingWritesProtected&&!good.limitations.mariaDbWritesProtected,'No production authority inferred');
const mustBlock=(label,items,term)=>{const r=run(items);ok(!r.signedLabCanarySequenceObserved&&r.blockers.some(x=>x.includes(term)),label)};
const mutate=(env,edit)=>{const x=structuredClone(env);edit(x);return x};
mustBlock('Falsified deny status not trusted',[mutate(a,x=>{x.payload.httpStatus=503+1}),b,c],'INVALID_SIGNATURE');
mustBlock('Forged epoch reply not trusted',[a,mutate(b,x=>{x.payload.gateStatus='BOGUS'}),c],'INVALID_SIGNATURE');
mustBlock('Tampered nonce not trusted',[a,mutate(b,x=>{x.payload.attemptNonce='0'.repeat(32)}),c],'INVALID_SIGNATURE');
mustBlock('Forged scope denied',[a,b,mutate(c,x=>{x.payload.scope='WRONG'} )],'INVALID_SIGNATURE');
mustBlock('Old writer accepted is blocker',[sign('source','old-denied',{...old,observed:'allowed',httpStatus:201,gateStatus:'ISOLATED_LAB_ARTIFACT_PUBLISHED',matchesExpected:false},at-3000),b,c],'GATE_BEHAVIOR_UNEXPECTED');
mustBlock('Source report used for new writer rejected',[a,sign('source','old-denied',old,at-2000),c],'INVALID_SIGNATURE');
mustBlock('Out of order signed reports rejected',[a,sign('replica','new-allowed',newer,at),c],'INVALID_PROBE_ORDER');
mustBlock('Boot change rejected',[a,b,sign('replica','witness-denied',outage,at-1000,bootA)],'REPLICA_BOOT_CHANGED');
mustBlock('Same boot both physical nodes rejected',[sign('source','old-denied',old,at-3000,bootB),b,c],'SAME_BOOT');
mustBlock('Replayed nonce rejected',[a,b,sign('replica','witness-denied',{...outage,attemptNonce:newer.attemptNonce},at-1000)],'REPLAYED_PROBE_NONCE');
ok(run([a,b,c],identities,{source:'0'.repeat(64),replica:pins.replica}).blockers.includes('UNTRUSTED_SOURCE_KEY'),'Out-of-band pinned source key enforced');
ok(!run([a,b,c],identities,pins,crypto.randomBytes(24).toString('hex')).signedLabCanarySequenceObserved,'Challenge replay refused');
ok(run([a,b,c],identities,pins,challenge,at+13*60000).blockers.some(x=>x.startsWith('STALE_OR_FUTURE')),'Stale evidence refused');
ok(run([a,b,c],identities,pins,challenge,at-2*60000).blockers.some(x=>x.startsWith('STALE_OR_FUTURE')),'Future evidence refused');
await deny(()=>signProbe({identity:source.identity,privateKeyPem:source.privateKeyPem,role:'replica',phase:'old-denied',challenge,result:old,bootFingerprint:bootA}),'Incorrect phase role refused');
console.log(`PASS: ${n} active loopback fence probes / signed evidence assertions (mock LAB only; no Android/Cloudflare)`);
