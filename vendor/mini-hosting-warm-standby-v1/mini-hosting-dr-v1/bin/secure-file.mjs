#!/usr/bin/env node
// AES-256-GCM authenticated streaming encryption for backups and configuration.
// Output is only promoted after the authentication tag has been verified.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {pipeline} from 'node:stream/promises';
const [mode,input,output]=process.argv.slice(2);
const magic=Buffer.from('AMHDR01\0','binary');
function stop(x){console.error('ERROR:',x);process.exit(1);}
if(!['encrypt','decrypt'].includes(mode)||!input||!output)stop('Usage: secure-file.mjs encrypt|decrypt INPUT OUTPUT');
const password=process.env.DR_PASSWORD;
if(!password||password.length<16)stop('Recovery passphrase must be at least 16 characters.');
if(fs.existsSync(output))stop('Output exists; refusing to overwrite: '+output);
const st=fs.statSync(input);
if(!st.isFile())stop('Input must be a regular file');
const params={N:1<<15,r:8,p:1,maxmem:96*1024*1024};
const outputDir=path.dirname(output);
const tmp=path.join(outputDir,'.'+path.basename(output)+'.incomplete-'+process.pid);
let promoted=false;
try{
 if(mode==='encrypt'){
  const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12);
  const key=crypto.scryptSync(password,salt,32,params),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  fs.writeFileSync(tmp,Buffer.concat([magic,salt,iv]),{mode:0o600,flag:'wx'});
  await pipeline(fs.createReadStream(input),cipher,fs.createWriteStream(tmp,{flags:'a',mode:0o600}));
  fs.appendFileSync(tmp,cipher.getAuthTag());
 }else{
  if(st.size<52)stop('Truncated recovery bundle');
  const fd=fs.openSync(input,'r'),header=Buffer.alloc(36),tag=Buffer.alloc(16);
  try{fs.readSync(fd,header,0,36,0);fs.readSync(fd,tag,0,16,st.size-16);}finally{fs.closeSync(fd);}
  if(!header.subarray(0,8).equals(magic))stop('Invalid recovery bundle format');
  const key=crypto.scryptSync(password,header.subarray(8,24),32,params);
  const dec=crypto.createDecipheriv('aes-256-gcm',key,header.subarray(24,36));dec.setAuthTag(tag);
  // The temporary plaintext is never promoted if authentication fails.
  await pipeline(fs.createReadStream(input,{start:36,end:st.size-17}),dec,fs.createWriteStream(tmp,{flags:'wx',mode:0o600}));
 }
 fs.renameSync(tmp,output);promoted=true;
 console.log('OK:',mode,output);
}catch(e){console.error('ERROR: Encryption/decryption failed: '+e.message);process.exitCode=1}
finally{if(!promoted)try{fs.unlinkSync(tmp)}catch{}}
