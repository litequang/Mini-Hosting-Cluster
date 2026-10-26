import assert from 'node:assert/strict';
import {p3SwitchDns,p3Config} from '../reference/cluster-authority/p3-route.mjs';
// Fixture data only, no Cloudflare network access, no production hostnames.
const a='d97965f8-b2e9-4a8a-97d6-acb40504bdf1';
const z='4b2e350b-e6cb-4bc7-badb-85d9386f3a7e';
const old='d8b3fbc5-1a5e-4d6a-958c-21ebc8c6dabb.cfargotunnel.com';
const next='dc1650f8-911c-4e82-af3b-d9f61e50b2ee.cfargotunnel.com';
const routes=[{zoneId:'a'.repeat(32),recordId:'b'.repeat(32),hostname:'site.lab.example.com',kind:'site',nodeTargets:{[a]:old,[z]:next}},
 {zoneId:'a'.repeat(32),recordId:'c'.repeat(32),hostname:'panel.lab.example.com',kind:'panel',nodeTargets:{[a]:old,[z]:next}}];
const env={MHC_P3_LAB_ENABLED:'OPERATOR_ASSISTED_DNS_ONLY',MHC_P3_INITIAL_PRIMARY_NODE_ID:a,
 MHC_P3_CF_TOKEN:'FAKE_TEST_TOKEN_DO_NOT_PUBLISH_123456',MHC_P3_ROUTES_JSON:JSON.stringify(routes)};
const records=new Map(routes.map(x=>[x.recordId,{id:x.recordId,name:x.hostname,type:'CNAME',proxied:true,content:old}]));
let requests=[];
const fetcher=async (url,opts)=>{
 const id=url.split('/').at(-1),item=records.get(id);requests.push({method:opts.method,id});
 if(!item)return new Response(JSON.stringify({success:false}),{status:404});
 if(opts.method==='PATCH')Object.assign(item,JSON.parse(opts.body));
 return new Response(JSON.stringify({success:true,result:{...item}}),{status:200});
};
assert.equal(p3Config(env).length,2);
await assert.rejects(p3SwitchDns({...env,MHC_P3_LAB_ENABLED:'NO'},{fromNodeId:a,targetNodeId:z},fetcher),/P3_NOT_ENABLED/);
await assert.rejects(p3SwitchDns({...env,MHC_P3_CF_TOKEN:''},{fromNodeId:a,targetNodeId:z},fetcher),/P3_CLOUDFLARE_TOKEN_MISSING/);
const result=await p3SwitchDns(env,{fromNodeId:a,targetNodeId:z},fetcher);
assert.deepEqual(result.records.map(x=>x.kind),['site','panel']);
assert.equal(result.dnsOnlyVerified,true);
assert.equal(result.writerFenced,false);
assert.equal(result.applicationVerified,false);
assert.equal(requests.filter(x=>x.method==='PATCH').length,2);
await p3SwitchDns(env,{fromNodeId:a,targetNodeId:z},fetcher);
assert.equal(requests.filter(x=>x.method==='PATCH').length,2,'Replay must not PATCH already correct DNS');
records.get('c'.repeat(32)).content='other.cfargotunnel.com';
await assert.rejects(p3SwitchDns(env,{fromNodeId:a,targetNodeId:z},fetcher),/P3_ROUTE_CONFLICT_MANUAL_REVIEW/);
assert.equal(requests.filter(x=>x.method==='PATCH').length,2,'Conflict must not write DNS');
console.log('PASS: P3 DNS route fail-closed, site-before-panel, verified CNAME, retry safe, config gate and conflict refusal');
