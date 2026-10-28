#!/usr/bin/env node
// A published bootstrap installs one immutable Git revision, with every file verified first.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export function buildFreshRelease(repo,commit,version,out){
 const git=(...a)=>execFileSync('git',['-c','safe.directory='+repo.replaceAll('\\','/'),'-C',repo,...a],{maxBuffer:16e6});
 commit=git('rev-parse',commit+'^{commit}').toString().trim();if(!/^MHC-N1-[A-Za-z0-9._-]{3,65}$/.test(version))throw Error('N1_VERSION_INVALID');
 if(fs.existsSync(out)&&fs.readdirSync(out).length)throw Error('N1_OUTPUT_NOT_EMPTY');fs.mkdirSync(out,{recursive:true});
 const list=git('ls-tree','-r','--name-only',commit,'bin','vendor','install.sh','scripts/bootstrap-new-android-node.sh').toString().trim().split('\n');
 const files=list.map(p=>{if(/(^|\/)\.env$|\.(pem|key|sql|dump|sqlite3?)$/.test(p))throw Error('N1_FORBIDDEN_SOURCE_PATH');const bytes=git('show',commit+':'+p);return {path:p,sha256:hash(bytes),mode:p.endsWith('.sh')||p.startsWith('bin/')&&!p.startsWith('bin/legacy-panel-src/')?0o700:0o600};});
 if(!files.some(f=>f.path==='bin/new-node-install.mjs'))throw Error('N1_INSTALLER_MISSING');
 const raw=JSON.stringify({format:'mhc-new-node-v1',version,commit,files},null,2)+'\n',sha=hash(raw);
 const body=git('show',commit+':scripts/bootstrap-new-android-node.sh').toString().replace(/^#![^\n]*\n/,'');
 const bootstrap='#!/data/data/com.termux/files/usr/bin/bash\nreadonly N1_RELEASE_SOURCE='+JSON.stringify(commit)+'\nreadonly N1_MANIFEST_SHA='+JSON.stringify(sha)+'\nreadonly N1_MANIFEST_BASE64='+JSON.stringify(Buffer.from(raw).toString('base64'))+'\n'+body;
 fs.writeFileSync(path.join(out,'manifest.json'),raw);fs.writeFileSync(path.join(out,'bootstrap.sh'),bootstrap,{mode:0o700});fs.writeFileSync(path.join(out,'bootstrap.sh.sha256'),hash(bootstrap)+'  bootstrap.sh\n');
 return {version,commit,fileCount:files.length,manifestSha256:sha,bootstrapSha256:hash(bootstrap)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{const [out,version,commit='HEAD']=process.argv.slice(2);if(!out||!version)throw Error('N1_BUILD_ARGUMENTS_REQUIRED');console.log(JSON.stringify(buildFreshRelease(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),commit,version,path.resolve(out))));}catch(e){console.error(e.message);process.exitCode=1;}}
