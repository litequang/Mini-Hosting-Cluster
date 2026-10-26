// Read-only observer regression with temporary LAB HOME and mocked Termux battery/SSH-free runit.
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=process.argv[2]||'.';
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'mhc-observe-'));
const bindir=path.join(tmp,'bin');const home=path.join(tmp,'home');
try{
 await fs.mkdir(bindir,{recursive:true});await fs.mkdir(path.join(home,'.config/mhc-full-installer'),{recursive:true});
 const file=path.join(bindir,'termux-battery-status');
 await fs.writeFile(file,'#!/bin/sh\nprintf \'%s\\n\' \'{"percentage":72,"temperature":34.2,"status":"CHARGING","adminToken":"NEVER_LEAK_BATTERY_SECRET"}\'\n',{mode:0o700});
 await fs.writeFile(path.join(bindir,'getprop'),'#!/bin/sh\necho "Vsmart LAB"\n',{mode:0o700});
 await fs.writeFile(path.join(bindir,'sv'),'#!/bin/sh\necho "run: $2: (pid 123) 12s"\n',{mode:0o700});
 await fs.writeFile(path.join(home,'.config/mhc-full-installer/panel-admin-token'),'NEVER_LEAK_PANEL_TOKEN', {mode:0o600});
 const run=spawnSync(process.execPath,['--input-type=module','-e',`import {observeServer} from ${JSON.stringify('file://'+path.resolve(root,'bin/server-observe.mjs'))};console.log(JSON.stringify(await observeServer()));`],{encoding:'utf8',env:{...process.env,HOME:home,PATH:bindir+':'+process.env.PATH},timeout:15000});
 assert.equal(run.status,0,run.stderr);
 const data=JSON.parse(run.stdout);
 assert.equal(data.device.model,'Vsmart LAB');
 assert.equal(data.battery.percentage,72);
 assert.equal(data.battery.temperatureC,34.2);
 assert.equal(data.services.find(x=>x.name==='mhc-full-panel').state,'running');
 assert.equal(data.backup.integrityVerifiedNow,false);
 assert.equal(data.ha.eligible,false);
 assert.equal(data.ha.gtidVerified,false);
 assert.ok(data.modules.phpExtensions&&typeof data.modules.phpExtensions==='object');
 assert.ok(!run.stdout.includes('NEVER_LEAK_BATTERY_SECRET'));
 assert.ok(!run.stdout.includes('NEVER_LEAK_PANEL_TOKEN'));
 console.log('PASS: local module/device observer uses allowlisted fields, sanitized battery, service state, no secrets or HA claims');
}finally{await fs.rm(tmp,{force:true,recursive:true});}
