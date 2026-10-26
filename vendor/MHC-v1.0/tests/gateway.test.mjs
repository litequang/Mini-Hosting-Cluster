import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';
import path from 'node:path';import http from 'node:http';import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-gate-'));
const backend=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/plain'});res.end('APP_OK:'+req.headers.host)});
const start=server=>new Promise(r=>server.listen(0,'127.0.0.1',r));
const boot=()=>{try{return fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim()}catch{return 'unknown'}};
test('gateway denies untrusted requests and stale owner, proxies only with current lease',async()=>{
 await start(backend);const appPort=backend.address().port;
 const reservation=http.createServer();await start(reservation);const gatewayPort=reservation.address().port;await new Promise(r=>reservation.close(r));
 const cfg={nodeId:'m51',controlUrl:'https://arbiter.example',token:'not-real',edgeSecret:'edge-secret',armed:true,gatewayPort,appPort};
 fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify(cfg));
 const child=spawn(process.execPath,[new URL('../agent/gateway.mjs',import.meta.url).pathname],{env:{...process.env,MHC_HOME:dir},stdio:['ignore','pipe','pipe']});
 let logs='';child.stderr.on('data',x=>logs+=x);
 try{
  let up=false;for(let i=0;i<40;i++){if(child.exitCode!==null)throw Error('gate process exited: '+logs);try{await fetch(`http://127.0.0.1:${gatewayPort}/__mhc/healthz`);up=true;break}catch{await sleep(50)}}assert.ok(up,'gateway must start');
  const url=`http://127.0.0.1:${gatewayPort}/api/test`;
  let r=await fetch(url);assert.equal(r.status,503);
  const valid={role:'primary',owner:'m51',term:5,bootId:boot(),deadlineEpochMs:Date.now()+8000,deadlineUptimeSec:os.uptime()+8};
  fs.writeFileSync(path.join(dir,'lease.json'),JSON.stringify(valid));
  r=await fetch(url,{headers:{'x-mhc-edge-secret':'wrong'}});assert.equal(r.status,503);
  r=await fetch(url,{headers:{'x-mhc-edge-secret':'edge-secret','x-forwarded-host':'pro.thophuong.com'}});assert.equal(r.status,200);assert.equal(await r.text(),'APP_OK:pro.thophuong.com');
  fs.writeFileSync(path.join(dir,'lease.json'),JSON.stringify({...valid,deadlineUptimeSec:os.uptime()-1}));
  r=await fetch(url,{headers:{'x-mhc-edge-secret':'edge-secret'}});assert.equal(r.status,503);
 }finally{child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));await new Promise(r=>backend.close(r));fs.rmSync(dir,{recursive:true,force:true})}
});
