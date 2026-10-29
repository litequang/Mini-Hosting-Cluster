import assert from 'node:assert/strict';import {enqueueSiteJob,siteProgress} from '../bin/site-standby.mjs';
let starts=0,delays=0;const body={targetNodeId:'fixture',requestId:'fixed-request'};
const request=async(action,b)=>{if(action==='site-job')return {site:{job:{type:'verify',status:'RUNNING'}}};assert.strictEqual(b,body);if(++starts<3)throw Error('AUTHORITY_SITE_NODE_BUSY');return {queued:true};};
assert.deepEqual(await enqueueSiteJob('site-call',body,request,async()=>delays++),{queued:true});assert.equal(starts,3);assert.equal(delays,2);
for(const type of ['restore','backup','manual']){let n=0;await assert.rejects(enqueueSiteJob('site-start',body,async action=>{if(action==='site-job')return {site:{job:{type,status:'RUNNING'}}};n++;throw Error('AUTHORITY_SITE_NODE_BUSY');},async()=>{throw Error('must not wait/preempt');}),/NODE_BUSY/);assert.equal(n,1);}
let bounded=0;await assert.rejects(enqueueSiteJob('site-call',body,async action=>{if(action==='site-job')return {site:{job:{type:'verify',status:'RUNNING'}}};bounded++;throw Error('AUTHORITY_SITE_NODE_BUSY');},async()=>{}),/NODE_BUSY/);assert.equal(bounded,12);
for(const code of ['AUTHORITY_INVALID_ACTION','AUTHORITY_NOT_FOUND'])assert.deepEqual(await siteProgress({},async()=>{throw Error(code);}),{progressUnsupported:true});
for(const code of ['AUTHORITY_UNREACHABLE','AUTHORITY_SITE_JOB_MISMATCH','AUTHORITY_ROLE_DENIED'])await assert.rejects(siteProgress({},async()=>{throw Error(code);}),new RegExp(code));
console.log('PASS N1.3 enqueue retry: wait only for read-only verification, fixed request ID, bounded attempts, never preempt restore/backup/manual; optional progress tolerates older DO while data/auth failures remain terminal.');
