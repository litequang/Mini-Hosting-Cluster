#!/usr/bin/env node
// Run on POSIX/Termux. Produces a private Wrangler bulk-secret file, never secret stdout.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function readPrivate(file){
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)||st.size>8192)throw Error('UNSAFE_ENROLLMENT_FILE');
 return JSON.parse(fs.readFileSync(file,'utf8'));
}
export function prepareSecrets(out,clusterId,files){
 if(process.platform==='win32')throw Error('USE_TERMUX_OR_POSIX_PRIVATE_DIRECTORY');
 if(!UUID.test(clusterId)||!files.length||files.length>200)throw Error('CLUSTER_ID_AND_MEMBERS_REQUIRED');
 out=path.resolve(out);const parent=path.dirname(out),st=fs.lstatSync(parent);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077))throw Error('PRIVATE_OUTPUT_DIRECTORY_REQUIRED');
 const real=fs.realpathSync(parent),source=fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'));
 if(real===source||real.startsWith(source+path.sep))throw Error('OUTPUT_MUST_BE_OUTSIDE_SOURCE');
 for(let p=real;;p=path.dirname(p)){
  if(fs.existsSync(path.join(p,'.git')))throw Error('OUTPUT_MUST_BE_OUTSIDE_GIT');
  if(p===path.dirname(p))break;
 }
 const ids=new Set(),keys=new Set();
 const members=files.map(file=>{
  const v=readPrivate(file);
  if(v.schema!==1||!UUID.test(v.nodeId)||ids.has(v.nodeId)||typeof v.label!=='string'||!v.label.length||v.label.length>80)throw Error('MEMBER_INVALID_OR_DUPLICATE');
  ids.add(v.nodeId);
  for(const k of [v.agentKey,v.panelKey]){if(!/^[A-Za-z0-9_-]{43,128}$/.test(k)||keys.has(k))throw Error('MEMBER_KEY_INVALID_OR_DUPLICATE');keys.add(k);}
  return {nodeId:v.nodeId,label:v.label,agentKey:v.agentKey,panelKey:v.panelKey};
 });
 const fd=fs.openSync(out,'wx',0o600);
 try{fs.writeFileSync(fd,JSON.stringify({MHC_CLUSTER_ID:clusterId,MHC_MEMBERS_JSON:JSON.stringify(members)})+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 return {clusterId,nodeCount:members.length,privateSecretsFile:out};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [out,id,...files]=process.argv.slice(2);if(!out)throw Error('Usage: prepare-secrets.mjs PRIVATE_OUTPUT CLUSTER_UUID PRIVATE_ENROLLMENT...');console.log(JSON.stringify(prepareSecrets(out,id,files)));}
 catch(e){console.error(e.code||e.message);process.exitCode=1;}
}
