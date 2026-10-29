// Opt-in native test, ONLY an existing disposable mhc_p4_probe_<8hex> fixture.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {sqlFenceCli,sqlFenceStatements} from '../bin/p4-fence.mjs';
if(process.env.PREFIX!=='/data/data/com.termux/files/usr')throw Error('P4_NATIVE_TERMUX_FIXTURE_REQUIRED');
const dir=path.resolve(process.argv[2]||''),read=name=>{
 const file=path.join(dir,name),st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.mode&0o077)throw Error('P4_NATIVE_PRIVATE_FIXTURE_REQUIRED');
 return JSON.parse(fs.readFileSync(file));
};
const fixture=read('fixture-private.json'),gate=read('guard-private.json');
if(!/^mhc_p4_probe_[a-f0-9]{8}$/.test(fixture.schema)||!/^p4probe_[a-f0-9]{8}$/.test(fixture.user))throw Error('P4_SYNTHETIC_FIXTURE_ONLY');
const entry=sqlFenceStatements(fixture.schema,['gate_probe'],gate.lockName,fixture.user)[0];
const run=input=>spawnSync('mariadb',['--no-defaults','-u','root','--batch','--skip-column-names'],{input,encoding:'utf8',timeout:10000});
const raw=run(entry.sql.replace('CREATE DEFINER','CREATE OR REPLACE DEFINER')+'\n');
assert.notEqual(raw.status,0);assert.match(raw.stderr,/ERROR 1064/);
const correct=run(sqlFenceCli(entry.sql).replace('CREATE DEFINER','CREATE OR REPLACE DEFINER')+'\n');
assert.equal(correct.status,0,'delimited CREATE must reach the server as one statement');
const query=run("SELECT SHA2(LOWER(REGEXP_REPLACE(ACTION_STATEMENT,'[[:space:]]','')),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='"+fixture.schema+"' AND TRIGGER_NAME='"+entry.name+"';\n");
assert.equal(query.status,0);assert.equal(query.stdout.trim(),crypto.createHash('sha256').update(entry.body.replace(/\s+/g,'').toLowerCase()).digest('hex'));
console.log('PASS native P4 CLI: raw DDL SQL1064 reproduced; source delimiter helper creates the exact trigger hash; disposable schema only, managed database untouched.');
