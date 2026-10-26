import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {HTML,CLIENT_JS,CSS} from '../src/ui.mjs';
test('Cloudflare viewer browser script is valid JS; CSP avoids inline scripts',()=>{
 assert.doesNotThrow(()=>new Script(CLIENT_JS));
 assert.match(HTML,/src="\/app\.js"/);
 assert.match(HTML,/href="\/style\.css"/);
 assert.match(HTML,/Mã ghép|mã ghép/i);
 assert.match(CSS,/\.node/);
});
