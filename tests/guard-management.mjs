import assert from 'node:assert/strict';
import {guardedServices,stopServices} from '../bin/node-role-guard.mjs';
assert.deepEqual(guardedServices(['named-tunnel','nginx','mariadb']),['nginx','mariadb']);
for(const name of ['amh-panel','mhc-full-heartbeat','mhc-node-role-guard','../nginx'])assert.throws(()=>guardedServices([name]));
const calls=[];
assert.throws(()=>stopServices(['nginx','named-tunnel','mariadb'],(cmd,args)=>{
 calls.push([cmd,...args]);return {status:args[1]==='nginx'?1:0};
}),/nginx/);
assert.deepEqual(calls,[['sv','down','nginx'],['sv','down','mariadb']]);
assert.throws(()=>stopServices(['nginx','mariadb'],()=>{throw Error('spawn failed');}),/nginx, mariadb/);
console.log('PASS: management tunnel preserved; all writer stops attempted; failures reported');
