// Candidate-select regression: source-level wiring plus authority fail-closed integration.
// This script deliberately never grants a writer lease or switches Cloudflare routes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]||'.');
const ui=fs.readFileSync(path.join(root,'bin/legacy-panel-src/public/app.js'),'utf8');
const worker=fs.readFileSync(path.join(root,'reference/cluster-authority/worker.mjs'),'utf8');
const client=fs.readFileSync(path.join(root,'bin/cluster-authority.mjs'),'utf8');
for(const expected of [
 'Chọn node dự kiến làm Primary',
 'Chọn node — bắt đầu chuẩn bị',
 "const live=await req('/api/mhc/primary-selection')",
 "expectedRevision:live.revision",
 "n.heartbeatRecent===true",
 "state.primarySelection=shared?d:null",
 'primary-abort',
 'PREPARED_NO_WRITER_GRANT'
])assert(ui.includes(expected),'Missing UI candidate selection safeguard: '+expected);
for(const name of ["'begin'","'abort'","TARGET_HEARTBEAT_STALE","TRANSITION_PENDING","REVISION_CONFLICT","writeLeaseGranted:false","declaredPrimary:s.declaredPrimary||null","fencingVerified:false,writerLeaseGranted:false"])
 assert(worker.includes(name),'Missing shared-authority preflight: '+name);
for(const name of ["'begin'","'abort'","AUTHORITY_UNREACHABLE","writeLeaseGranted!==false"])
 assert(client.includes(name),'Missing fail-closed client behavior: '+name);
assert(!ui.includes("toast('Đã chuyển Primary thật"),'UI falsely advertises Primary cutover');
console.log('PASS: M3 manual candidate UI source checks, common-state CAS and heartbeat preflight, no live Primary grant.');
console.log('SCOPE: structural checks only. Cloudflare Internet/browser and two physical Android nodes NOT RUN.');
