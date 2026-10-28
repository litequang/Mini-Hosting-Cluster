import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {FreshInstaller,STAGES,verifyRelease} from '../bin/new-node-install.mjs';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),root=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-n1-'));
let checks=0;const source=path.join(root,'source');fs.mkdirSync(source);
const names=['bin/new-node-install.mjs','bin/mhc-full-wrapper','bin/node-boot-entry.sh','bin/cluster-authority.mjs','bin/legacy-panel-src/src/server.mjs','bin/legacy-panel-src/src/mhc-integration.mjs','bin/legacy-panel-src/public/app.js','bin/node-monitor.mjs','bin/daily-backup.sh','bin/node-doctor.sh','vendor/mini-hosting-warm-standby-v1/mini-hosting-dr-v1/panel/src/config.mjs'];
const files=names.map(p=>{const b='// fixture '+p+'\n';fs.mkdirSync(path.dirname(path.join(source,p)),{recursive:true});fs.writeFileSync(path.join(source,p),b);return {path:p,sha256:hash(b),mode:0o700};});
const m={format:'mhc-new-node-v1',version:'MHC-N1-FIXTURE',commit:'a'.repeat(40),files},raw=JSON.stringify(m),manifest=path.join(root,'release.json');fs.writeFileSync(manifest,raw);
let packages=0;class Fixture extends FreshInstaller{
 hardware(){return {model:'fixture',architecture:'arm64',freeDiskMiB:9000,memoryMiB:8000,androidPermissionsVerified:false};}
 packages(){packages++;}
 panel_admin(){fs.mkdirSync(path.join(this.panel,'data'),{recursive:true});fs.writeFileSync(path.join(this.panel,'data/admin.json'),'fixture only',{mode:0o600});fs.writeFileSync(path.join(this.config,'panel-login-once'),'fixture password',{mode:0o600});}
 services(){}
 verify(){this.report.localChecks={panelHttp:200,sqlSelect1:true,fixture:true};}
}
function fixture(name,options={}){const home=path.join(root,name),prefix=path.join(root,name+'-prefix');fs.mkdirSync(home,{recursive:true});fs.mkdirSync(prefix,{recursive:true});return new Fixture({home,prefix,source,fixture:true,execute:(cmd,args)=>{if(cmd==='ssh-keygen'){const file=args.at(-1);fs.writeFileSync(file,'fixture ssh private key',{mode:0o600});fs.writeFileSync(file+'.pub','fixture ssh public key',{mode:0o600});return {status:0};}throw Error('Unexpected fixture command');},...options});}
try{
 assert.equal(verifyRelease(source,raw,hash(raw)).commit,m.commit);checks++;
 assert.throws(()=>verifyRelease(source,raw,'0'.repeat(64)),/CHECKSUM_FAILED/);checks++;
 const bad=JSON.stringify({...m,files:[{...files[0],path:'bin/../../escape'},...files.slice(1)]});assert.throws(()=>verifyRelease(source,bad,hash(bad)),/PATH_INVALID/);checks++;
 const existing=fixture('existing');fs.mkdirSync(existing.config,{recursive:true});assert.throws(()=>existing.preflight(),/EXISTING_INSTALLATION_REFUSED/);assert.equal(exists(existing.file),false);checks++;
 const production=fixture('production');fs.mkdirSync(path.join(production.home,'apps/thophuongpro'),{recursive:true});fs.writeFileSync(path.join(production.home,'apps/thophuongpro/.env'),'fixture');assert.throws(()=>production.preflight(),/PRODUCTION_OR_LEGACY_CLUSTER/);checks++;
 const db=fixture('database');fs.mkdirSync(path.join(db.prefix,'var/lib/mysql/customer'),{recursive:true});assert.throws(()=>db.preflight(),/EXISTING_DATABASE_REFUSED/);checks++;
 const interrupted=fixture('resume',{pause:(stage,when)=>{if(stage==='identity'&&when==='after')throw Error('N1_INJECTED_POWER_LOSS');}});
 await assert.rejects(interrupted.run(manifest,hash(raw)),/INJECTED_POWER_LOSS/);assert.equal(interrupted.status().phase,'INTERRUPTED');assert.equal(packages,1);checks++;
 const saved=fs.readFileSync(path.join(interrupted.config,'node-identity.json')),key=fs.readFileSync(path.join(interrupted.config,'node-proof-key.pem'));
 const resumed=fixture('resume');const result=await resumed.run(manifest,hash(raw));assert.equal(result.phase,'INSTALLED');assert.deepEqual(result.completed,STAGES);assert.equal(packages,1);assert.deepEqual(fs.readFileSync(path.join(resumed.config,'node-identity.json')),saved);assert.deepEqual(fs.readFileSync(path.join(resumed.config,'node-proof-key.pem')),key);assert.equal(result.eligiblePrimary,false);assert.equal(result.joined,false);checks++;
 await resumed.run(manifest,hash(raw));assert.equal(packages,1);checks++;
 fs.appendFileSync(path.join(resumed.managed,'bin/cluster-authority.mjs'),'tampered');await assert.rejects(resumed.run(manifest,hash(raw)),/COMPLETED_OUTPUT_CHANGED/);checks++;
 const wrong=JSON.stringify({...m,commit:'b'.repeat(40)}),wrongFile=path.join(root,'wrong.json');fs.writeFileSync(wrongFile,wrong);await assert.rejects(resumed.run(wrongFile,hash(wrong)),/ORIGINAL_RELEASE/);checks++;
 const broken=fixture('checksum');fs.appendFileSync(path.join(source,files[0].path),'tampered');await assert.rejects(broken.run(manifest,hash(raw)),/SOURCE_CHECKSUM/);assert.equal(exists(broken.file),false);checks++;
 console.log('PASS N1 installer '+checks+' fixture cases: acquisition hashes/path, fresh/production/DB guards, interrupted identity resume, stable credentials, idempotence, changed completed output/release refusal, no enrollment or writer.');
 console.log('SCOPE: mocked package/services/Panel; physical Android install, SSH migration and reboot NOT RUN by this runner.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
function exists(p){return fs.existsSync(p);}
