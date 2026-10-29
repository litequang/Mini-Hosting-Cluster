import assert from 'node:assert/strict';
import {waitForPeerClock} from '../bin/p33-control.mjs';
const proof=checkedAt=>({checkedAt,expiresAt:checkedAt+15000});
for(const ahead of [0,1999,2000,2329,3999,4000]){
 let time=10000,waited=0;const p=proof(time+ahead),expiresAt=p.expiresAt;
 await waitForPeerClock(p,()=>time,async ms=>{assert.ok(ms>0&&ms<=2000);waited+=ms;time+=ms;});
 assert.equal(waited,Math.max(0,ahead-2000));assert.ok(time>=p.checkedAt-2000);assert.equal(p.expiresAt,expiresAt,'TTL is never changed');
}
await assert.rejects(waitForPeerClock(proof(14001),()=>10000,async()=>assert.fail('must not wait')),/P33_PEER_CLOCK_SKEW/);
await assert.rejects(waitForPeerClock(proof(10000),()=>25001,async()=>assert.fail('expired proof')),/P33_PEER_PROOF_INVALID/);
for(const p of [{checkedAt:'10000',expiresAt:25000},{checkedAt:10000,expiresAt:25001},{checkedAt:NaN,expiresAt:25000}])await assert.rejects(waitForPeerClock(p),/PROOF_INVALID/);
for(const jump of [-1,20000]){let time=10000;await assert.rejects(waitForPeerClock(proof(12329),()=>time,async()=>{time+=jump;}),/PROOF_INVALID/);}
console.log('PASS P33 peer clock: signed-proof receiver waits at most2s, strict future2s/TTL15s unchanged, large skew/expiry/malformed/time-jump fail closed.');
