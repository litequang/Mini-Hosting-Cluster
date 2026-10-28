import assert from 'node:assert/strict';import {configureTunnelSecret,ACCOUNT} from '../tools/configure-cloudflare-n1.mjs';
const token='N1_FIXTURE_TOKEN_NEVER_A_REAL_CREDENTIAL';let puts=0;
await assert.rejects(configureTunnelSecret('bad',{putSecret:()=>puts++}),/FORMAT/);
await assert.rejects(configureTunnelSecret(token,{fetcher:async()=>new Response('',{status:403}),putSecret:()=>puts++}),/PERMISSION_REQUIRED/);assert.equal(puts,0);
await assert.rejects(configureTunnelSecret(token,{fetcher:async()=>Response.json({success:false,result:[]}),putSecret:()=>puts++}),/CHECK_FAILED/);assert.equal(puts,0);
const out=await configureTunnelSecret(token,{fetcher:async(url,o)=>{assert(url.includes(ACCOUNT));assert.equal(o.headers.authorization,'Bearer '+token);assert.equal(o.redirect,'manual');return Response.json({success:true,result:[]});},putSecret:async v=>{assert.equal(v,token);puts++;}});assert.equal(puts,1);assert.equal(out.changesDns,false);assert(!JSON.stringify(out).includes(token));console.log('PASS N1 secret helper: input rejection/permission denial/exact account/redacted success');
