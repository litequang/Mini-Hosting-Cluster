#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawnSync} from 'node:child_process';

const root = process.argv[2] || path.resolve(import.meta.dirname,'..');
const src = path.join(root,'bin/android-acceptance.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'mhc-accept-'));
const home = path.join(tmp,'home');
const cfg = path.join(home,'.config/mhc-full-installer');
const conf = path.join(home,'.local/share/mhc-full-installer/hosting/nginx/sites');
fs.mkdirSync(cfg,{recursive:true});
fs.mkdirSync(conf,{recursive:true});
const PREFIX='/data/data/com.termux/files/usr';
const env={...process.env,HOME:home,PREFIX};
function run(args, extra={}) {
  const r=spawnSync(process.execPath,[src,...args],{encoding:'utf8',env:{...env,...extra},timeout:30000});
  return {status:r.status,stdout:r.stdout,stderr:r.stderr};
}
try {
  const invalid=run(['site','../../secret','localhost','--json']);
  assert.notEqual(invalid.status,0);
  const uninstalled=run(['check','--json']);
  assert.equal(uninstalled.status,0,uninstalled.stderr);
  const data=JSON.parse(uninstalled.stdout);
  assert.equal(data.schema,'mhc.acceptance.v1');
  assert.equal(data.checks.find(x=>x.key==='source-install-marker').state,'WARN');
  assert.equal(data.checks.find(x=>x.key==='ha-promotion').state,'BLOCKED');
  assert.equal(data.checks.find(x=>x.key==='termux-prefix').state,'PASS');
  assert.ok(!uninstalled.stdout.includes('PASSWORD='));

  fs.writeFileSync(path.join(cfg,'installed'),'TEST 0.3.9 installed on clean Termux\n');
  fs.writeFileSync(path.join(cfg,'panel-admin-token'),'ULTRA_PRIVATE_PANEL_TOKEN_NEVER_EXPOSE');
  const prod=path.join(home,'.config/mini-hosting-cluster');
  fs.mkdirSync(prod,{recursive:true});
  fs.writeFileSync(path.join(prod,'ha.json'),'SECRET_ADMIN_KEY_DO_NOT_LEAK');
  const report=run(['report']);
  assert.equal(report.status,0,report.stderr);
  const outDir=path.join(cfg,'acceptance-reports');
  const all=fs.readdirSync(outDir);assert.equal(all.length,1);
  const outFile=path.join(outDir,all[0]);
  assert.equal(fs.statSync(outFile).mode & 0o777,0o600);
  assert.equal(fs.statSync(outDir).mode & 0o777,0o700);
  const body=fs.readFileSync(outFile,'utf8');
  assert.ok(!body.includes('ULTRA_PRIVATE_PANEL_TOKEN_NEVER_EXPOSE'));
  assert.ok(!body.includes('SECRET_ADMIN_KEY_DO_NOT_LEAK'));
  const safe=JSON.parse(body);
  assert.equal(safe.checks.find(x=>x.key==='live-cluster-safety').state,'BLOCKED');
  assert.equal(safe.checks.find(x=>x.key==='ha-promotion').state,'BLOCKED');

  // Exercise Host-scoped loopback HTTP without downloading or executing PHP.
  const staticDir=path.join(cfg,'static');fs.mkdirSync(staticDir,{recursive:true});
  fs.writeFileSync(path.join(staticDir,'demo.conf'),'SITE_SLUG=demo\n');
  fs.writeFileSync(path.join(conf,'demo.conf'),'server {\n listen 127.0.0.1:18080;\n server_name mysite.test;\n}\n');
  const server=http.createServer((req,res)=>{
    assert.equal(req.headers.host,'mysite.test');
    res.writeHead(200,{'Content-Type':'text/plain'});
    res.end('NEVER_ECHO_SITE_BODY_WITH_SECRETS');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    // Child process spawnSync would block the parent server's event loop. Spawn asynchronously.
    const {spawn}=await import('node:child_process');
    const response=await new Promise(resolve=>{
      const child=spawn(process.execPath,[src,'site','demo','mysite.test','--json'],{env:{...env,MHC_ACCEPT_HTTP_PORT:String(server.address().port)}});
      let stdout='',stderr='';
      child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
      child.on('close',status=>resolve({status,stdout,stderr}));
    });
    assert.equal(response.status,0,response.stderr);
    const site=JSON.parse(response.stdout);
    assert.equal(site.checks.find(x=>x.key==='site-http').state,'PASS');
    assert.ok(!response.stdout.includes('NEVER_ECHO_SITE_BODY_WITH_SECRETS'));
  } finally {server.close();}
  fs.writeFileSync(path.join(conf,'demo.conf'),'server_name wrong.host;\n listen 127.0.0.1:18080;\n');
  const mismatch=JSON.parse(run(['site','demo','mysite.test','--json']).stdout);
  assert.equal(mismatch.checks.find(x=>x.key==='site-vhost').state,'BLOCKED');
  // Symlinked site records may never be accepted as registered sites.
  fs.unlinkSync(path.join(staticDir,'demo.conf'));
  fs.symlinkSync(path.join(cfg,'installed'),path.join(staticDir,'demo.conf'));
  const symlink=JSON.parse(run(['site','demo','mysite.test','--json']).stdout);
  assert.equal(symlink.checks.find(x=>x.key==='site-registered').state,'BLOCKED');

  console.log('PASS: TEST 0.3.9 acceptance checks: read-only environment, fail-closed safety, redacted report, mode 0600, loopback site, Host mismatch, symlink and invalid slug');
} finally {fs.rmSync(tmp,{recursive:true,force:true});}
