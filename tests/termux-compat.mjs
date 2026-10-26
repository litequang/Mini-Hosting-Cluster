#!/usr/bin/env node
// Regression: real Termux Node builds can report process.platform=android.
// All installer version gates MUST recognize the currently shipping marker.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=process.argv[2];
const nodeReadiness=fs.readFileSync(path.join(root,'bin/node-readiness.mjs'),'utf8');
assert.match(nodeReadiness,/process\.platform==='linux'\|\|process\.platform==='android'/,'SQL lab restore must admit Android as well as Linux');
for(const name of ['node-readiness.mjs','node-clone.mjs','node-enroll.mjs']){
 const text=fs.readFileSync(path.join(root,'bin',name),'utf8');
 assert.ok(text.includes('\\.11')&&text.includes('\\.4'),'Old and 0.4 marker must be recognized: '+name);
}
// Regression: v0.5B2/v0.5B3 completion marker must be accepted by all LAB node entrypoints.
for(const name of ['node-readiness.mjs','node-clone.mjs','node-enroll.mjs','node-enroll.sh']){
 const v=fs.readFileSync(path.join(root,'bin',name),'utf8');
 assert.ok(v.includes('B2|B3|B4|B5|C-LAB|C-INTEGRATION|C-PHYSICAL|C-FIELD|C-DRILL|C-FENCE-PROBE|C-WRITER-AUDIT|C-MANUAL-PRIMARY')&&v.includes('TEST 0'), 'TEST 0.5B2-C-LAB markers accepted: '+name);
}
assert.ok(fs.readFileSync(path.join(root,'install.sh'),'utf8').includes('C-FIELD|C-DRILL|C-FENCE-PROBE|C-WRITER-AUDIT|C-MANUAL-PRIMARY|C-AUTO-PRIMARY-LAB'), 'Source-only upgrade accepts FIELD, DRILL and FENCE-PROBE');
const enroll=fs.readFileSync(path.join(root,'bin/node-enroll.sh'),'utf8');
assert.ok(enroll.includes('11')&&enroll.includes('A|B1'),'Heartbeat start must recognize old/current marker');
const installer=fs.readFileSync(path.join(root,'install.sh'),'utf8');
assert.match(installer,/--recover-lab/,'Partial LAB install recovery mode must be available');
const vendor=fs.readFileSync(path.join(root,'vendor/mini-hosting-warm-standby-v1/mini-hosting-cluster-v0.1/bin/install.sh'),'utf8');
assert.match(vendor,/sv-enable mhc-dashboard \|\|/,'Delayed runit dashboard enrollment must not abort the install');
console.log('PASS: Android MariaDB platform gate, TEST marker compatibility, runit startup failure handling');
