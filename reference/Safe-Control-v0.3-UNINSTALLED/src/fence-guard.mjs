#!/usr/bin/env node
// Separate guardian: enforce local serving lease even if cloud control process stops.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';
const root=path.join(os.homedir(),'.config/mini-hosting-cluster'),file=path.join(root,'lease.json');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function sh(name,args){return execFileSync(name,args,{encoding:'utf8',timeout:4000,stdio:['ignore','pipe','pipe']});}
function service(name){try{return sh('sv',['status',name]).startsWith('run:');}catch{return false;}}
function boot(){try{return fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();}catch{return null;}}
function valid(){try{const l=JSON.parse(fs.readFileSync(file,'utf8')),up=os.uptime()*1000;return l.bootId&&l.bootId===boot()&&Number.isFinite(l.validUptimeMs)&&up>=l.writtenUptimeMs&&up<l.validUptimeMs&&l.term>0;}catch{return false;}}
function armed(){try{return JSON.parse(fs.readFileSync(path.join(root,'control.json'),'utf8')).armed===true;}catch{return false;}}
async function guard(){let lastReport=0;for(;;){if(armed()&&!valid()){
  try{if(service('named-tunnel'))sh('sv',['down','named-tunnel']);if(service('mini-web'))sh('sv',['down','mini-web']);
   sh('mariadb',['--no-defaults','-u','root','-e','SET GLOBAL read_only=ON']);}
  catch(e){if(Date.now()-lastReport>10000){console.error('CRITICAL guard fencing failure:',e.message);lastReport=Date.now();}}
 }await pause(1000);}}
 guard();
