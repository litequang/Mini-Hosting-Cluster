#!/usr/bin/env node
// Run locally in Termux; intentional cutover only.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {configPath,loadConfig,closeLease,svc} from '../agent/common.mjs';
const cmd=process.argv[2],phrase=process.argv[3];
if(!['arm','disarm'].includes(cmd))throw Error('Usage: node tools/set-armed.mjs arm CUTOVER_CONFIRMED | disarm');
const c=loadConfig();
if(cmd==='arm'){
 if(phrase!=='CUTOVER_CONFIRMED')throw Error('Arming requires CUTOVER_CONFIRMED');
 const p=path.join(os.homedir(),'.nginx/nginx.conf');
 if(!fs.readFileSync(p,'utf8').includes('proxy_pass http://127.0.0.1:3070;'))throw Error('Nginx MUST route to MHC gate first');
}
const updated={...c,armed:cmd==='arm'};
fs.writeFileSync(configPath,JSON.stringify(updated,null,2)+'\n',{mode:0o600});
closeLease();
if(cmd==='disarm'){svc('down','mhc-v1-agent');svc('down',c.siteService||'mini-web');}
if(cmd==='arm')svc('up','mhc-v1-agent');
console.log(cmd==='arm'?'ARMED: mhc-v1-agent resumed; verify primary lease at coordinator':'DISARMED: agent and website stopped; existing gateway continues to reject writes.');
