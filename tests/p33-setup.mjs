import fs from 'node:fs';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const text=fs.readFileSync(new URL('../scripts/p33-prepare-lab.sh',import.meta.url),'utf8'),line=text.split('\n').find(l=>l.includes('P33_PUBLIC_PRIVILEGES_UNSAFE'));
assert(line);const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
for(const [grants,allowed] of [['',true],['GRANT USAGE ON *.* TO PUBLIC',true],['GRANT USAGE ON *.* TO `PUBLIC`',true],['GRANT ALL PRIVILEGES ON test.* TO PUBLIC',false],['GRANT INSERT ON mhc_p33_lab.* TO PUBLIC',false],['GRANT SELECT ON other.* TO PUBLIC',false]]){
 const r=spawnSync(bash,['-c','public_grants=$1\n'+line,'p33-setup-test',grants],{encoding:'utf8',timeout:5000});assert.equal(r.status===0,allowed,'PUBLIC privilege preflight mismatch');if(!allowed)assert.match(r.stdout,/P33_PUBLIC_PRIVILEGES_UNSAFE/);
}
assert(text.includes('P33_SCHEMA_EXISTS'));assert(text.includes('P33_USER_EXISTS'));assert(text.includes('P33_DATA_EXISTS_OR_ARCHIVE_MISSING_INSPECT_BEFORE_RETRY'));
console.log('PASS P33 setup: empty/USAGE-only PUBLIC accepted, PUBLIC writes/unexpected grants refused; existing dataset/schema/user guarded (fixture parser).');
