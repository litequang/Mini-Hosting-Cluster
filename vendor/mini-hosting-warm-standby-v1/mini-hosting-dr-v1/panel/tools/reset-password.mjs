import {makePassword,setPassword} from '../src/security.mjs';
import {ensureDirs} from '../src/config.mjs';
ensureDirs();const password=makePassword();setPassword(password);
console.log('New admin password (save immediately): '+password);
console.log('Existing sessions end when panel service restarts. Run: sv restart amh-panel');
