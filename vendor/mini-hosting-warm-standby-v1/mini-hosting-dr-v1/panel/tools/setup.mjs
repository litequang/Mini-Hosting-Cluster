import {makePassword,setPassword,configured} from '../src/security.mjs';
import {ensureDirs} from '../src/config.mjs';
ensureDirs();if(configured()){console.error('Admin password already exists. Use npm run reset-password if needed.');process.exit(1);}
const password=makePassword();setPassword(password);
console.log('\n========================================\nANDROID MINI HOSTING - ADMIN CREDENTIALS\n========================================');
console.log('User: admin');console.log('Password: '+password);console.log('Store password NOW. This screen is shown only once.');console.log('Never publish port 9090 to the public Internet.');
