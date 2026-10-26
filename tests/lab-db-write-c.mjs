import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import http from 'node:http';
const root=process.argv[2]||process.cwd(),home=fs.mkdtempSync(path.join(os.tmpdir(),'mhc05c-lab-'));
process.env.HOME=home;
const db=await import(pathToFileURL(path.join(root,'bin/lab-app-database-gate.mjs')));
const web=await import(pathToFileURL(path.join(root,'bin/lab-http-write-gate.mjs')));
const readiness=await import(pathToFileURL(path.join(root,'bin/switchover-readiness.mjs')));
let n=0;const ok=(condition,msg)=>{assert.ok(condition,msg);n++};
const refuse=async(fn,msg)=>{await assert.rejects(fn,msg);n++};
const fixture={id:'f'.repeat(32),value:'Test tiếng Việt'};
ok(db.plan().hostingProtected===false,'Not hosting protected');
ok(db.parseBody(Buffer.from(JSON.stringify(fixture))).id===fixture.id,'Valid fixture');
for(const input of [Buffer.from('broken'),Buffer.from('{}'),Buffer.from(JSON.stringify({...fixture,extra:true})),Buffer.from(JSON.stringify({...fixture,value:'x\nDROP TABLE'})),Buffer.from(JSON.stringify({...fixture,id:'abcd'}))])await refuse(async()=>db.parseBody(input),'reject invalid JSON/schema');
const sql=db.sqlForRecord(fixture);ok(sql.startsWith('INSERT INTO mhc_lab_app.write_events '),'Fixed schema');ok(!sql.includes(fixture.value),'Value is hexencoded');ok(!sql.includes('DROP'),'No SQL appended');
const r=readiness.evaluateReadiness();ok(r.blockers.length>=8&&!r.canSwitchPrimary&&!r.canArmHA,'Always fail-closed on absence');
const all=readiness.evaluateReadiness({gtidLabAccepted:true,fileLabAccepted:true,backupRestoreVerified:true,liveWitnessVerified:true,oldWriterIndependentlyFenced:true,allRealWritePathsGated:true,routeIsolated:true,physicalTwoNodeValidated:true});
ok(all.preconditionsSatisfied&&!all.canSwitchPrimary,'Operator claims never authorize promotion');
ok(!readiness.evaluateReadiness({productionFootprint:true}).preconditionsSatisfied,'Prod stopped');
// Build a strictly isolated HOME with a fake witness configuration and stub HTTP fetch.
fs.mkdirSync(path.join(home,'mhc-writegate-lab'),{mode:0o700});for(const d of ['canaries','static-preview','upload-fixtures','job-receipts'])fs.mkdirSync(path.join(home,'mhc-writegate-lab',d),{mode:0o700});
const wd=path.join(home,'.config/mhc-witness-lab');fs.mkdirSync(path.join(home,'.config'),{mode:0o700});fs.mkdirSync(wd,{mode:0o700});
// Config needs the real validated schema; borrow fixture pattern from previous tests.
fs.writeFileSync(path.join(wd,'client.json'),JSON.stringify({clusterId:'app-lab-c',nodeId:'node-a',url:'https://lab.example.test/'}),{mode:0o600});
fs.writeFileSync(path.join(wd,'node-token'),'z'.repeat(48)+'\n',{mode:0o600});
let allow=true,online=true,epoch=8,calls=0;
const witness=async(url)=>{
 calls++;if(!online)throw Error('network down');
 const nonce=new URL(url).searchParams.get('nonce');
 return {ok:allow,status:allow?200:403,text:async()=>JSON.stringify({scope:'MHC_LAB_WITNESS_ONLY_NO_HA',productionReady:false,haEligible:false,
  action:'verify',nonce,phase:allow?'LEASED':'FROZEN',epoch,serverNowMs:1000,expiresAtMs:8000,callerOwnsLease:allow,allowedForLabGate:allow})};
};
let inserted=[];
const fakeDb=async sql=>{inserted.push(sql)};
const input=Buffer.from(JSON.stringify(fixture));
const received=await db.writeLabDb(input,{check:witness,execute:fakeDb});
ok(received.inserted&&!received.productionProtected&&!received.atomicWitnessAndSql,'Dedicated DB LAB insert stub');
ok(calls===2&&inserted.length===1,'Two witness checks before exactly one SQL submit');
allow=false;await refuse(()=>db.writeLabDb(input,{check:witness,execute:fakeDb}),'Denied witness');ok(inserted.length===1,'No SQL when denied');allow=true;
online=false;await refuse(()=>db.writeLabDb(input,{check:witness,execute:fakeDb}),'Offline witness');ok(inserted.length===1,'No SQL when offline');online=true;
const flip=async url=>{const r=await witness(url);epoch++;return r};
await refuse(()=>db.writeLabDb(input,{check:flip,execute:fakeDb}),'Epoch flip');ok(inserted.length===1,'No SQL on epoch flip');epoch=8;
const prod=path.join(home,'.config/mhc-full-installer/static');fs.mkdirSync(prod,{recursive:true});
await refuse(()=>db.writeLabDb(input,{check:witness,execute:fakeDb}),'Registered site denies write');
fs.rmSync(prod,{recursive:true});
// Real option file must be 0600, socket must be owned and under dedicated directory.
fs.mkdirSync(path.join(home,'mhc-db-lab/run'),{recursive:true,mode:0o700});
const dbhome=path.join(home,'mhc-db-lab');fs.chmodSync(dbhome,0o700);
const options=path.join(dbhome,'client.cnf');
const socket=path.join(dbhome,'run/mariadb.sock');
fs.writeFileSync(options,`[client]\nuser=mhc_lab_writer\npassword=${'p'.repeat(36)}\nsocket=${socket}\nprotocol=socket\n`,{mode:0o600});
await refuse(async()=>db.checkDbLabConfig(),'No dedicated socket denies');
const net=await import('node:net');const sockServer=net.createServer(x=>x.destroy());
await new Promise((resolve,reject)=>{sockServer.once('error',reject);sockServer.listen(socket,resolve)});
try{
 ok(db.checkDbLabConfig().configured,'Private fixed client and Unix LAB socket');
 fs.chmodSync(options,0o644);await refuse(async()=>db.checkDbLabConfig(),'Insecure credentials rejected');fs.chmodSync(options,0o600);
 fs.appendFileSync(options,'host=production.example.com\n');await refuse(async()=>db.checkDbLabConfig(),'Network DB host disallowed');
}finally{await new Promise(resolve=>sockServer.close(resolve))}
const tokenDir=path.join(home,'.config/mhc-lab-http-write-gate');fs.mkdirSync(tokenDir,{mode:0o700});const token=crypto.randomBytes(32).toString('hex');fs.writeFileSync(path.join(tokenDir,'http-token'),token+'\n',{mode:0o600});
const server=web.createLabHttpServer({check:async()=>({}),executeSql:async()=>{throw Error('must not run')}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
async function request(body,authorization,contentType='application/json'){
 return await new Promise((resolve,reject)=>{const buf=Buffer.from(body);const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:'/v1/lab/mariadb-event',method:'POST',headers:{'content-type':contentType,'content-length':buf.length,...(authorization?{authorization}:{} )}},res=>{let data='';res.on('data',b=>data+=b);res.on('end',()=>resolve({code:res.statusCode,body:data}))});req.on('error',reject);req.end(buf)});
}
try{
 const b=JSON.stringify(fixture);ok((await request(b)).code===401,'HTTP missing token');ok((await request(b,'Bearer '+token,'application/octet-stream')).code===400,'DB enforces JSON content-type');
 const rr=await request(b,'Bearer '+token);ok(rr.code===503&&!rr.body.includes('password'),'Witness absent denies DB write and redacts errors');
}finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(home,{recursive:true,force:true})}
console.log('PASS: '+n+' dedicated MariaDB LAB + switchover readiness assertions (no real MariaDB contacted)');
