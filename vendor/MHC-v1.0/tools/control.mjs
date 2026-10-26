#!/usr/bin/env node
// Run on trusted PC only. Never copy ADMIN token onto both phones.
const [verb,arg1,arg2]=process.argv.slice(2);
if(!process.env.MHC_CONTROL_URL || !process.env.MHC_ADMIN_TOKEN){console.error('Set MHC_CONTROL_URL and MHC_ADMIN_TOKEN');process.exit(2)}
const commands={status:['GET','/__mhc/api/status'],mode:['POST','/__mhc/api/admin','mode',{mode:arg1}],
 strategy:['POST','/__mhc/api/admin','strategy',{strategy:arg1}],
 prefer:['POST','/__mhc/api/admin','prefer',{nodeId:arg1}],
 bootstrap:['POST','/__mhc/api/admin','bootstrap',{nodeId:arg1}],
 handoff:['POST','/__mhc/api/admin','handoff',{nodeId:arg1,confirm:arg2}],
 approve:['POST','/__mhc/api/admin','approve-once',{nodeId:arg1,confirm:arg2}],
 rejoin:['POST','/__mhc/api/admin','confirm-rejoin',{nodeId:arg1,confirm:arg2}],
 risky:['POST','/__mhc/api/admin','allow-risky-auto',{enabled:arg1==='on',confirm:arg2}],
 failback:['POST','/__mhc/api/admin','auto-failback',{enabled:arg1==='on'}]};
if(!commands[verb]){console.error('Usage: control.mjs status|mode auto/manual|strategy preferred/score|prefer ID|bootstrap ID|handoff ID DATA_VERIFIED|approve ID DATA_VERIFIED|rejoin ID DATA_REJOIN_VERIFIED|risky on/off I_ACCEPT_POSSIBLE_DATA_LOSS|failback on/off');process.exit(2)}
const [method,endpoint,action,params]=commands[verb];
const r=await fetch(new URL(endpoint,process.env.MHC_CONTROL_URL),{method,
 headers:{'content-type':'application/json','authorization':'Bearer '+process.env.MHC_ADMIN_TOKEN},
 body:method==='POST'?JSON.stringify({action,params}):undefined,signal:AbortSignal.timeout(10000)});
console.log(JSON.stringify(await r.json(),null,2));if(!r.ok)process.exitCode=1;
