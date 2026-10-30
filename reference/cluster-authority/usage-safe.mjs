const allowed=new Set('status heartbeat history invite join begin abort route route-resume complete p32-status p32-route p32-resume p32-confirm p32-rollback p33-begin p33-fenced p33-active p33-route p33-confirm p33-renew p33-control p33-cancel p33-refence n1-provision n1-publish n1-control-proof site-start site-poll site-result site-upload site-download site-call site-job site-progress site-sync'.split(' '));
const kinds=new Set(['success','quota','rateLimit','auth','timeout','network','server','rejected']),day=now=>new Date(now).toISOString().slice(0,10);
export function safeUsage(value){
 if(value?.schema!==1||!/^\d{4}-\d\d-\d\d$/.test(value.day||'')||!Number.isSafeInteger(value.attempts)||value.attempts<0||value.attempts>1e9)return null;
 const clean=(obj,keys)=>Object.fromEntries(Object.entries(obj||{}).filter(([k,v])=>keys.has(k)&&Number.isSafeInteger(v)&&v>=0&&v<=value.attempts));
 return {schema:1,day:value.day,attempts:value.attempts,byAction:clean(value.byAction,allowed),outcomes:clean(value.outcomes,kinds),updatedAt:Number.isSafeInteger(value.updatedAt)?value.updatedAt:null,incomplete:value.incomplete===true};
}
