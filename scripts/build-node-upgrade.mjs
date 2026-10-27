#!/usr/bin/env node
// Build a complete, immutable source package from committed Git blobs, never device data.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {digest,PANEL_FILES} from '../bin/source-upgrade.mjs';
export function buildPackage(repo,commit,version,out){
 const git=(...args)=>execFileSync('git',['-c',`safe.directory=${repo.replaceAll('\\','/')}`,'-C',repo,...args],{maxBuffer:10e6});
 commit=git('rev-parse',commit+'^{commit}').toString().trim();if(!/^MHC-LAB-[A-Za-z0-9._-]{3,70}$/.test(version))throw Error('INVALID_RELEASE_VERSION');
 if(fs.existsSync(out)&&fs.readdirSync(out).length)throw Error('OUTPUT_NOT_EMPTY');fs.mkdirSync(path.join(out,'payload'),{recursive:true,mode:0o700});
 const files=[];
 function add(source,area,target,mode){const bytes=git('show',`${commit}:${source}`),ext=path.extname(source)||'.sh',payload='payload/'+files.length+ext;fs.writeFileSync(path.join(out,payload),bytes,{mode:0o600});files.push({area,path:target,source:payload,sha256:digest(bytes),mode});}
 const managed=git('ls-tree','-r','--name-only',commit,'bin').toString().trim().split('\n').filter(p=>p!=='bin/mhc-full-wrapper');
 for(const p of managed)add(p,'managed',p,p.startsWith('bin/legacy-panel-src/')?0o600:0o700);
 add('bin/mhc-full-wrapper','home','mhc-full',0o700);
 for(const p of PANEL_FILES)add('bin/legacy-panel-src/'+p,'panel',p,0o600);
 add('bin/node-boot-entry.sh','boot','10-mhc-start',0o700);
 const engine=git('show',commit+':bin/source-upgrade.mjs');fs.writeFileSync(path.join(out,'upgrader.mjs'),engine,{mode:0o700});
 const manifest={format:'mhc-source-upgrade-v1',version,commit,engineSha256:digest(engine),files};const raw=JSON.stringify(manifest,null,2)+'\n';fs.writeFileSync(path.join(out,'manifest.json'),raw,{mode:0o600});
 fs.writeFileSync(path.join(out,'update.sh'),git('show',commit+':scripts/update-existing-android-node.sh'),{mode:0o700});
 return {version,commit,fileCount:files.length,manifestSha256:digest(raw)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [out,version,commit='HEAD']=process.argv.slice(2);if(!out||!version)throw Error('Usage: node scripts/build-node-upgrade.mjs OUTPUT MHC-LAB-VERSION [COMMIT]');console.log(JSON.stringify(buildPackage(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),commit,version,path.resolve(out)),null,2));}catch(e){console.error(e.message);process.exitCode=1;}
}
