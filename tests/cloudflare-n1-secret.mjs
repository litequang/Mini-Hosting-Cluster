import assert from 'node:assert/strict';import {configureTunnelSecret,putTunnelSecret,ACCOUNT} from '../tools/configure-cloudflare-n1.mjs';
const token='N1_FIXTURE_TOKEN_NEVER_A_REAL_CREDENTIAL',oauth='OAUTH_FIXTURE_ONLY_NOT_THE_TUNNEL_TOKEN';let puts=0;
await assert.rejects(configureTunnelSecret('bad',{putSecret:()=>puts++}),/FORMAT/);
await assert.rejects(configureTunnelSecret(token,{fetcher:async()=>new Response('',{status:403}),putSecret:()=>puts++}),/PERMISSION_REQUIRED/);assert.equal(puts,0);
await assert.rejects(configureTunnelSecret(token,{fetcher:async()=>Response.json({success:false,result:[]}),putSecret:()=>puts++}),/CHECK_FAILED/);assert.equal(puts,0);
const out=await configureTunnelSecret(token,{fetcher:async(url,o)=>{assert(url.includes(ACCOUNT));assert.equal(o.headers.authorization,'Bearer '+token);assert.equal(o.redirect,'manual');return Response.json({success:true,result:[]});},putSecret:async v=>{assert.equal(v,token);puts++;}});assert.equal(puts,1);assert.equal(out.changesDns,false);assert(!JSON.stringify(out).includes(token));
let workerPuts=0;const correctSettings={bindings:[{name:'MHC_AUTHORITY',namespace_id:'c941ad9ddcaa4dfdbe474d429a37d8f8'}]};
await assert.rejects(putTunnelSecret(token,{getAuthorization:async()=>oauth,fetcher:async()=>Response.json({success:true,result:{bindings:[]}})}),/NAMESPACE_MISMATCH/);
await assert.rejects(putTunnelSecret(token,{getAuthorization:async()=>oauth,fetcher:async()=>new Response('',{status:403})}),/WRITE_PERMISSION_REQUIRED/);
await assert.rejects(putTunnelSecret(token,{getAuthorization:async()=>oauth,fetcher:async()=>new Response('',{status:302})}),/HTTP_302/);
await putTunnelSecret(token,{getAuthorization:async()=>oauth,fetcher:async(url,o)=>{
 assert(url.startsWith('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/workers/scripts/mhc-cluster-authority-lab/'));assert.equal(o.headers.authorization,'Bearer '+oauth);assert.notEqual(o.headers.authorization,'Bearer '+token);assert.equal(o.redirect,'manual');
 if(o.method==='GET'){assert(url.endsWith('/settings'));return Response.json({success:true,result:correctSettings});}
 assert.equal(o.method,'PUT');assert(url.endsWith('/secrets'));assert.deepEqual(JSON.parse(o.body),{name:'MHC_N1_CF_TOKEN',type:'secret_text',text:token});workerPuts++;return Response.json({success:true,result:{name:'MHC_N1_CF_TOKEN',type:'secret_text'}});
 }});assert.equal(workerPuts,1);
console.log('PASS N1 secret helper: hidden-input protocol, permission denial, exact account/Worker/namespace, separate OAuth grant, PUT only named secret, no redirects, redacted result. Fixtures only.');
