// Integration tests of actual local Node HTTP routes with disposable HOME only.
import {spawn,execFileSync} from 'node:child_process';
import http from 'node:http';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
const source=path.resolve(process.argv[2]||'.');
const HOME=await fs.mkdtemp(path.join(os.tmpdir(),'mhc-panel-test-'));
const dataPath=path.join(HOME,'.local/share/mhc-full-installer/bin');
await fs.mkdir(dataPath,{recursive:true});
for(const f of ['sites.sh','safe-zip-extract.py','local-panel.mjs'])await fs.copyFile(path.join(source,'bin',f),path.join(dataPath,f));
await fs.mkdir(path.join(HOME,'.config/mhc-full-installer/sites'),{recursive:true});
await fs.writeFile(path.join(HOME,'.config/mhc-full-installer/sites/secret.env'),'SITE_SLUG=secret\nDB_PASSWORD=KEEP_PRIVATE\n');
const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});}),base=`http://127.0.0.1:${port}`;
const proc=spawn('node',[path.join(source,'bin/local-panel.mjs')],{env:{...process.env,HOME,MHC_PANEL_TEST:'1',MHC_PANEL_TEST_PORT:String(port)},stdio:['ignore','pipe','pipe']});
let out='',err='';proc.stdout.on('data',d=>out+=d);proc.stderr.on('data',d=>err+=d);
async function fetchLocal(url,opts={}){return fetch(base+url,{...opts,headers:{host:`127.0.0.1:${port}`,...opts.headers}})}
function form(params){return new URLSearchParams(params).toString();}
let checks=0;
function ok(cond,msg){assert.ok(cond,msg);checks++;}
try{
  let ready=false;
  for(let i=0;i<90;i++){
    if(proc.exitCode!==null)throw Error(`panel died: ${err}`);
    try{const res=await fetchLocal('/login');if(res.status===200){ready=true;break;}}catch{}
    await sleep(70);
  }
  ok(ready,'panel listens');
  const token=(await fs.readFile(path.join(HOME,'.config/mhc-full-installer/panel-admin-token'),'utf8')).trim();
  const stat=await fs.stat(path.join(HOME,'.config/mhc-full-installer/panel-admin-token'));
  ok((stat.mode&0o077)===0,'token private');
  let res=await fetchLocal('/',{redirect:'manual'});
  ok(res.status===303&&res.headers.get('location')==='/login?next=%2F','unauthenticated home redirects to login');
  res=await fetchLocal('/cluster',{redirect:'manual'});
  ok(res.status===303&&res.headers.get('location')==='/login?next=%2Fcluster','unauthenticated cluster redirects to login');
  res=await fetchLocal('/login?next=%2Fcluster');const loginHtml=await res.text();
  ok(res.status===200&&loginHtml.includes('Admin token')&&loginHtml.includes('name="next" value="/cluster"'),'login form and return target visible');
  ok(loginHtml.includes('Sign in')&&loginHtml.includes('TEST 0.5.0C-WRITER-AUDIT'),'login navigation and correct UI version');
  for(const malicious of ['https://evil.example','//evil.example','/\\evil.example','/cluster%0d%0aLocation:evil']){
    res=await fetchLocal('/login?next='+encodeURIComponent(malicious));
    const html=await res.text();ok(html.includes('name="next" value="/"'),'external or malformed redirect target refused');
  }
  const fakeHostStatus=await new Promise((resolve,reject)=>{const q=http.get(base+'/login',{headers:{Host:`evil.example:${port}`}},r=>{r.resume();resolve(r.statusCode)});q.on('error',reject)});ok(fakeHostStatus===403,'unrecognized Host blocked');
  res=await fetchLocal('/download?site=secret&path=secret.env',{redirect:'manual'});ok(res.status===303&&res.headers.get('location')?.startsWith('/login?'),'unauth downloads redirect only; no file content');
  res=await fetchLocal('/api/cluster-summary',{redirect:'manual'});ok(res.status===401,'unauth API still gets 401');
  res=await fetchLocal('/create',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({site:'demo'})});ok(res.status===401,'unauth POST stays 401');
  res=await fetchLocal('/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({token:'wrong',next:'/cluster'})});const deniedHtml=await res.text();ok(res.status===401&&deniedHtml.includes('Invalid admin token')&&deniedHtml.includes('name="next" value="/cluster"'),'bad token returns usable login form');
  res=await fetchLocal('/login',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({token,next:'/cluster'})});
  ok(res.status===303&&res.headers.get('location')==='/cluster','correct token login returns to cluster');
  const cookie=res.headers.get('set-cookie').split(';')[0];
  ok(cookie.startsWith('mhc_session='),'session cookie');
  const authed=(url,opts={})=>fetchLocal(url,{...opts,headers:{cookie,...opts.headers}});
  res=await authed('/');const dashboard=await res.text();ok(res.status===200,'auth dashboard');
  ok(dashboard.includes('Tổng quan Server')&&dashboard.includes('MHC Server')&&dashboard.includes('PHP'),'unified dashboard renders server and PHP');
  ok(dashboard.includes('class=\"sidebar\"')&&dashboard.includes('data-observe=\"cpu\"'),'responsive navigation and CPU observation');
  res=await authed('/modules');const modulesHtml=await res.text();
  ok(res.status===200&&modulesHtml.includes('Modules &amp; Services')&&modulesHtml.includes('PHP-FPM')&&modulesHtml.includes('MariaDB'),'module inventory renders actual named services');
  res=await authed('/monitor');const monitorHtml=await res.text();
  ok(res.status===200&&monitorHtml.includes('Monitor thiết bị')&&monitorHtml.includes('cpu-history'),'local monitor graph');
  res=await authed('/backups');const backupHtml=await res.text();
  ok(res.status===200&&backupHtml.includes('Backup &amp; Restore')&&backupHtml.includes('SHA256 chưa kiểm tra'),'backup view does not claim integrity');
  res=await authed('/api/system-observe');const obs=await res.json();
  ok(res.status===200&&obs.schema===1&&obs.modules&&Array.isArray(obs.services),'authenticated sanitized runtime JSON');
  ok(obs.ha.eligible===false&&obs.ha.gtidVerified===false,'observer must never grant HA');
  ok(!JSON.stringify(obs).includes('ULTRA_PRIVATE')&&!JSON.stringify(obs).includes(token),'observer never exposes secrets');
  res=await fetchLocal('/api/system-observe',{redirect:'manual'});ok(res.status===401,'unauthenticated runtime observations denied');

  res=await authed('/nodes');const nodePage=await res.text();ok(res.status===200&&nodePage.includes('Cluster node inventory'),'node inventory page requires auth');
  res=await fetchLocal('/nodes',{redirect:'manual'});ok(res.status===303,'unauthenticated inventory redirected');
  res=await fetchLocal('/cluster',{redirect:'manual'});ok(res.status===303,'unauthenticated cluster page redirected');
  res=await fetchLocal('/api/cluster-summary');ok(res.status===401,'unauthenticated summary denied');
  res=await authed('/cluster');const clusterPage=await res.text();ok(res.status===200&&clusterPage.includes('Cluster overview (LAB / read-only)'),'cluster dashboard loads');
  res=await authed('/api/cluster-summary');const clusterJson=await res.json();ok(res.status===200&&clusterJson.capabilities.haEligible===false,'cluster JSON no HA');

  // Node inventory renders metadata safely but must never reveal private enrollment verifier material.
  const config=path.join(HOME,'.config/mhc-full-installer');
  await fs.writeFile(path.join(config,'node-identity.json'),JSON.stringify({label:'Lab Node',nodeId:'10000000-0000-4000-8000-000000000001'}),{mode:0o600});
  await fs.writeFile(path.join(config,'cluster.json'),JSON.stringify({clusterId:'10000000-0000-4000-8000-000000000002',controllerNodeId:'10000000-0000-4000-8000-000000000001',mode:'inventory-only'}),{mode:0o600});
  await fs.writeFile(path.join(config,'members.json'),JSON.stringify({nodes:[{nodeId:'10000000-0000-4000-8000-000000000003',label:'<script>alert(1)</script>',capability:{deviceModel:'Lab Device',memoryMiB:4000},lastSeenAt:new Date().toISOString(),heartbeatTokenHash:'TEST-PRIVATE-HASH'}]}),{mode:0o600});
  res=await authed('/nodes');const inventoryHtml=await res.text();
  ok(inventoryHtml.includes('&lt;script&gt;')&&!inventoryHtml.includes('<script>alert(1)</script>'),'node label HTML escaped');
  ok(!inventoryHtml.includes('TEST-PRIVATE-HASH'),'node heartbeat verifier never shown in UI');
  res=await authed('/cluster');const clusterEscaped=await res.text();ok(clusterEscaped.includes('&lt;script&gt;')&&!clusterEscaped.includes('<script>alert(1)</script>'),'new Cluster UI escapes node names');
  ok(!clusterEscaped.includes('TEST-PRIVATE-HASH'),'new Cluster UI excludes private heartbeat hash');

  const metadata=JSON.parse(await fs.readFile(path.join(config,'members.json'),'utf8'));
  metadata.nodes[0].reportReceivedAt=new Date().toISOString();
  metadata.nodes[0].report={schema:1,clone:{state:'LAB_PREPARED_NOT_LIVE',snapshot:'snapshot-20261024',stageRecorded:true,labRecorded:true,restoredSiteCount:1,sqlLabRecordedCount:1,wpPreviewPreparedCount:1},backup:{status:'NOT_VERIFIED',snapshot:null},readiness:'OBSERVED_LAB_METADATA_ONLY'};
  metadata.nodes[0].report.privateKey='HIDDEN_RPC_SECRET';
  await fs.writeFile(path.join(config,'members.json'),JSON.stringify(metadata),{mode:0o600});
  res=await authed('/cluster');let reportHtml=await res.text();
  ok(!reportHtml.includes('HIDDEN_RPC_SECRET'),'malformed/secret-bearing remote report withheld');
  ok(reportHtml.includes('NO_RECENT_REPORT'),'invalid member report cannot appear verified');
  delete metadata.nodes[0].report.privateKey;
  await fs.writeFile(path.join(config,'members.json'),JSON.stringify(metadata),{mode:0o600});
  res=await authed('/cluster');reportHtml=await res.text();
  ok(reportHtml.includes('RECENT_AUTHENTICATED_REPORT')&&reportHtml.includes('LAB_PREPARED_NOT_LIVE'),'fresh authenticated remote metadata displayed');
  ok(reportHtml.includes('NOT REPLICA READY'),'remote lab metadata cannot produce replica ready');
  res=await authed('/api/cluster-summary');const remoteApi=await res.json();
  ok(remoteApi.inventory.items[0].memberReport.evidence.readiness==='OBSERVED_LAB_METADATA_ONLY','JSON endpoint has no live readiness claims');

  ok(inventoryHtml.includes('Recent authenticated heartbeat')&&inventoryHtml.includes('Not replica-ready'),'heartbeat distinguish from replica');

  const sessionCookie=cookie.split('=')[1];
  ok(!dashboard.includes(token),'token never rendered');
  const csrf=dashboard.match(/name="csrf" value="([a-f0-9]{64})"/)?.[1];ok(Boolean(csrf),'csrf provided');
  res=await authed('/create',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({site:'demo'})});ok(res.status===403,'csrf needed');
  res=await authed('/create',{method:'POST',headers:{origin:'http://evil.example','content-type':'application/x-www-form-urlencoded'},body:form({site:'demo',csrf})});ok(res.status===403,'evil origin blocked');
  res=await authed('/create',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({site:'demo',csrf})});ok(res.status===303,'created static site');
  ok((await fs.readFile(path.join(HOME,'websites/demo/index.html'),'utf8')).includes('MHC static'),'site created');
  res=await authed('/files?site=demo');const listing=await res.text();ok(res.status===200&&listing.includes('index.html'),'file list works');
  res=await authed('/edit?site=demo&path=../../secret.env');ok(res.status===400,'traversal blocked');
  res=await authed('/edit?site=demo&path=.env');ok(res.status===400,'dotfiles blocked');
  res=await authed('/edit?site=demo&path=evil.php');ok(res.status===400,'PHP blocked');
  res=await authed('/save',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({site:'demo',path:'index.html',csrf,value:'<h1>Version A</h1>'})});ok(res.status===303,'edit saved');
  ok((await fs.readFile(path.join(HOME,'websites/demo/index.html'),'utf8')).includes('Version A'),'file changed');
  const history=await fs.readdir(path.join(HOME,'.local/share/mhc-full-installer/file-history/demo'));ok(history.length===1,'previous content privately preserved');
  res=await authed('/api/upload?site=demo&name=style.css',{method:'POST',headers:{'content-type':'application/octet-stream','x-mhc-csrf':csrf},body:Buffer.from('body{color:red}')});ok(res.status===200,'binary upload');
  res=await authed('/download?site=demo&path=style.css');ok(res.status===200&&await res.text()==='body{color:red}','download');
  res=await authed('/api/upload?site=demo&name=evil.php',{method:'POST',headers:{'content-type':'application/octet-stream','x-mhc-csrf':csrf},body:'<?php ?>'});ok(res.status===400,'bad upload extension');
  await fs.symlink(path.join(HOME,'.config'),path.join(HOME,'websites/demo/external'));
  res=await authed('/files?site=demo&dir=external');ok(res.status===403,'symlink directory blocked');
  res=await authed('/download?site=demo&path=external/sites/secret.env');ok(res.status>=400,'secret read blocked');
  await fs.mkdir(path.join(HOME,'hosting-backups/mhc-full/.backup-lock'),{recursive:true});
  res=await authed('/save',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({site:'demo',path:'index.html',csrf,value:'Not allowed'})});ok(res.status===409,'backup lock blocks changes');
  await fs.rmdir(path.join(HOME,'hosting-backups/mhc-full/.backup-lock'));
  // Reject dangerous ZIP payload and allow valid full-site release.
  const py=`import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1],'w') as z:\n z.writestr('../outside.txt','bad')\n z.writestr('index.html','bad')\nwith zipfile.ZipFile(sys.argv[2],'w') as z:\n z.writestr('index.html','Full release B')\n`;
  const evil=path.join(HOME,'evil.zip'),good=path.join(HOME,'good.zip');
  execFileSync('python3',['-c',py,evil,good]);
  res=await authed('/api/deploy?site=demo',{method:'POST',headers:{'content-type':'application/zip','x-mhc-csrf':csrf},body:await fs.readFile(evil)});ok(res.status===422,'traversal ZIP rejected');
  res=await authed('/api/deploy?site=demo',{method:'POST',headers:{'content-type':'application/zip','x-mhc-csrf':csrf},body:await fs.readFile(good)});ok(res.status===200,'valid ZIP deployed');
  ok((await fs.readFile(path.join(HOME,'websites/demo/index.html'),'utf8'))==='Full release B','deploy activated');
  res=await authed('/rollback',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({csrf,site:'demo',sure:'yes'})});ok(res.status===303,'rollback from panel');
  ok((await fs.readFile(path.join(HOME,'websites/demo/index.html'),'utf8')).includes('Version A'),'rollback restored prior release');
  res=await authed('/download?site=secret&path=secret.env');ok(res.status===404,'WordPress/private registry never a managed static site');
  res=await authed('/logout',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({csrf})});ok(res.status===303,'logout');
  res=await authed('/',{redirect:'manual'});ok(res.status===303&&res.headers.get('location')?.startsWith('/login'),'old cookie invalidated and redirected to login');
  console.log(`PASS: TEST 0.4.0C1 panel HTTP integration — ${checks} assertions (auth, host, CSRF, paths, symlinks, file editor/upload, ZIP, rollback, backup lock)`);
}finally{
  proc.kill('SIGTERM');await sleep(100);if(proc.exitCode===null)proc.kill('SIGKILL');
  await fs.rm(HOME,{recursive:true,force:true});
}
