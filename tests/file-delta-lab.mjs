import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(process.argv[2]||'.');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-c1-test-'));
const home=path.join(tmp,'home'),lab=path.join(home,'mhc-file-lab');
const source=path.join(lab,'source'),replica=path.join(lab,'replica');
const cli=path.join(root,'bin/file-delta-lab.mjs');
function call(args,ok=true){
 const p=spawnSync(process.execPath,[cli,...args],{env:{...process.env,HOME:home},encoding:'utf8',timeout:25000});
 assert.equal(p.status,ok?0:1,`Unexpected code for ${args.join(' ')}: ${p.stderr}\n${p.stdout}`);
 return ok?JSON.parse(p.stdout):p.stderr;
}
function write(p,data){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,data);}
let checks=0;const check=(condition,msg)=>{assert(condition,msg);checks++;};
try{
 fs.mkdirSync(source,{recursive:true});fs.mkdirSync(replica,{recursive:true});
 write(path.join(source,'sheets','001.musicxml'),'old song');
 write(path.join(source,'uploads','one.png'),'old image');
 fs.cpSync(source,replica,{recursive:true,force:true});
 const baseline=call(['manifest','replica']);check(baseline.files===2,'baseline');
 check(!baseline.haEligible&&!baseline.liveReplication,'not HA');
 let status=call(['status']);check(status.mode==='LAB_FILE_DELTA_STAGING_ONLY','status');
 write(path.join(source,'sheets','001.musicxml'),'updated song');
 fs.rmSync(path.join(source,'uploads','one.png'));
 write(path.join(source,'uploads','two.png'),'new image');
 const file=path.basename(baseline.path);const out=call(['bundle',file]);
 check(out.changed===2&&out.removed===1,'delta diff');check(out.payloadBytes===Buffer.byteLength('updated songnew image'),'delta bytes');
 const id=out.id,box=path.join(lab,'outbox',id);
 check(!fs.existsSync(path.join(box,'payload','uploads','one.png')),'removed not transmitted');
 check(call(['verify',id]).status==='DELTA_CHECKSUM_VERIFIED','verify');
 let result=call(['stage',id]);check(result.status==='CANDIDATE_VERIFIED_OFFLINE','candidate');
 const candidate=path.join(lab,'candidates',id);
 check(fs.readFileSync(path.join(candidate,'sheets','001.musicxml'),'utf8')==='updated song','modified copied');
 check(fs.readFileSync(path.join(candidate,'uploads','two.png'),'utf8')==='new image','added copied');
 check(!fs.existsSync(path.join(candidate,'uploads','one.png')),'removed from candidate');
 check(fs.existsSync(path.join(replica,'uploads','one.png')),'replica remains unchanged');
 check(call(['stage',id],false).includes('Candidate already exists'),'no overwrite candidate');
 check(fs.statSync(path.join(box,'meta.json')).mode%512===0o600,'private manifest');
 check(!JSON.stringify(out).includes('001.musicxml'),'no paths in output');
 // Corruption of payload must be rejected even when source metadata stays intact.
 write(path.join(box,'payload','uploads','two.png'),'CORRUPTED');
 check(call(['verify',id],false).includes('Payload SHA-256 mismatch'),'payload tamper');
 write(path.join(box,'payload','uploads','two.png'),'new image');
 // A diverged destination may not be overlaid even if bundle is otherwise valid.
 write(path.join(replica,'sheets','001.musicxml'),'local divergence');
 const b2=call(['bundle',file]);
 check(call(['stage',b2.id],false).includes('baseline diverged'),'replica divergence');
 // Simulated peer transfer: a copied bundle received in inbox is checked before staging.
 write(path.join(replica,'sheets','001.musicxml'),'old song');
 const inbox=path.join(lab,'inbox',b2.id);fs.mkdirSync(path.dirname(inbox),{recursive:true});
 fs.cpSync(path.join(lab,'outbox',b2.id),inbox,{recursive:true});
 check(call(['verify',b2.id]).status==='DELTA_CHECKSUM_VERIFIED','inbox bundle verified');
 check(call(['stage',b2.id]).status==='CANDIDATE_VERIFIED_OFFLINE','inbox staged');
 // Secret path and symlinks are rejected. Production paths never accepted as arguments.
 write(path.join(source,'.env'),'PASSWORD=never-export');
 check(call(['bundle',file],false).includes('secret'),'deny secret names');
 fs.unlinkSync(path.join(source,'.env'));
 fs.symlinkSync('/etc/passwd',path.join(source,'uploads','escape'));
 check(call(['bundle',file],false).includes('Symlink'),'deny symlink');
 fs.unlinkSync(path.join(source,'uploads','escape'));
 // Manifest tamper: paths outside LAB and fake totals fail before copying.
 const bad='unsafe.json';
 const malformed={schema:1,scope:'MHC_ISOLATED_FILE_LAB_ONLY',files:{'../outside':{size:1,sha256:'a'.repeat(64)}},fileCount:1,totalBytes:1};
 write(path.join(lab,'reports',bad),JSON.stringify(malformed));
 check(call(['bundle',bad],false).includes('Unsafe')||call(['bundle',bad],false).includes('Invalid'),'manifest traversal');
 console.log(`PASS: v0.4C.1 ${checks} LAB file delta checks; added/modified/deleted, bundle checksum, immutable candidate, non-destructive replica, corruption, divergence, secret, symlink, traversal, no HA`);
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
