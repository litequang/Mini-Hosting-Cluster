#!/usr/bin/env node
// MHC TEST 0.3.9 — non-destructive, local-only Android/Termux acceptance evidence.
// No config/DB/site mutations, downloads, remote SSH, Cloudflare access or HA actions.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

const HOME = process.env.HOME || os.homedir();
const PREFIX = process.env.PREFIX || '';
const CFG = path.join(HOME, '.config/mhc-full-installer');
const HOSTING = path.join(HOME, '.local/share/mhc-full-installer/hosting');
const SNAP = path.join(HOME, 'hosting-backups/mhc-full');
const APPROVED_STATES = new Set(['PASS', 'WARN', 'BLOCKED', 'SKIP']);
const SLUG = /^[a-z][a-z0-9-]{1,30}$/;
const HOST = /^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/;
const items = [];
function entry(key, state, detail) {
  if (!APPROVED_STATES.has(state)) throw Error('Invalid status');
  // Descriptions are hardcoded or fixed vocabulary. Never copy process stderr/stdout into reports.
  items.push({key, state, detail});
}
function file(p) { try { return fs.lstatSync(p).isFile(); } catch { return false; } }
function dir(p) { try { return fs.lstatSync(p).isDirectory(); } catch { return false; } }
function safeFile(p) { try { const s = fs.lstatSync(p); return s.isFile() && !s.isSymbolicLink(); } catch { return false; } }
function cmd(bin, argv = [], ms = 3500) {
  const r = spawnSync(bin, argv, {encoding: 'utf8', timeout: ms, maxBuffer: 256 * 1024,
    env: {...process.env, LC_ALL: 'C'}, stdio: ['ignore', 'pipe', 'pipe']});
  return {ok: r.status === 0 && !r.error, out: r.stdout || ''}; // never emit stderr
}
function hasCommand(name) { return cmd('sh', ['-c', `command -v ${name} >/dev/null 2>&1`], 2200).ok; }
function listCount(p, suffix) {
  if (!dir(p)) return 0;
  try { return fs.readdirSync(p, {withFileTypes: true}).filter(x => x.isFile() && (!suffix || x.name.endsWith(suffix))).length; } catch { return 0; }
}
function basic() {
  const isTermux = PREFIX === '/data/data/com.termux/files/usr' && process.platform === 'android';
  // Node on Android generally reports platform=android; some Termux builds may report linux.
  const termuxPath = PREFIX === '/data/data/com.termux/files/usr';
  entry('termux-prefix', termuxPath ? 'PASS':'BLOCKED', termuxPath ? 'Standard Termux prefix found':'Not the standard Termux prefix; only Linux simulation possible');
  entry('cpu-architecture', process.arch === 'arm64' ? 'PASS':'BLOCKED', process.arch === 'arm64' ? 'ARM64 device':'Not ARM64; Android runtime acceptance cannot pass');
  entry('source-install-marker', safeFile(path.join(CFG, 'installed')) ? 'PASS':'WARN', safeFile(path.join(CFG, 'installed')) ? 'MHC TEST installation marker found':'Installer completion has not been established');
  entry('partial-install', fs.existsSync(path.join(CFG, 'install-incomplete')) ? 'BLOCKED':'PASS', fs.existsSync(path.join(CFG, 'install-incomplete')) ? 'Incomplete install marker: manual inspection required':'No incomplete install marker');
  const prodHints = ['apps/thophuongpro/.env', '.config/mini-hosting-cluster/ha.json', '.config/mini-hosting-cluster/node.json'];
  const prod = prodHints.some(p => fs.existsSync(path.join(HOME,p)));
  entry('live-cluster-safety', prod ? 'BLOCKED':'PASS', prod ? 'Existing production/HA footprint: do not run LAB installer or PHP probes':'No known production/HA footprint (not a proof of an empty device)');
  const programs = ['node', 'nginx', 'php', 'php-fpm', 'mariadb', 'mariadb-dump', 'ssh', 'rsync', 'curl', 'python3', 'sv'];
  for (const bin of programs) entry(`binary-${bin}`, hasCommand(bin) ? 'PASS':'WARN', hasCommand(bin) ? 'Binary discoverable':'Binary missing or not in PATH');
  try {
    const b = fs.statfsSync(HOME); const bytes = Number(b.bavail) * Number(b.bsize);
    entry('free-disk', bytes >= 3 * 1024 ** 3 ? 'PASS':'WARN', bytes >= 3 * 1024 ** 3 ? '>=3 GiB available':'<3 GiB available; large restores may fail');
  } catch { entry('free-disk','SKIP','Disk free space could not be read'); }
  if (hasCommand('php')) {
    const ph = cmd('php', ['-m']);
    if (!ph.ok) entry('wordpress-php-modules','WARN','PHP extension inventory failed');
    else {
      const modules = new Set(ph.out.toLowerCase().split(/\r?\n/).map(x => x.trim()));
      const missing = ['mysqli','curl','mbstring','dom','zip','gd'].filter(x=>!modules.has(x));
      entry('wordpress-php-modules', missing.length ? 'WARN':'PASS', missing.length ? `Missing WordPress prerequisite modules: ${missing.join(', ')}` : 'WordPress prerequisite extensions found');
    }
  } else entry('wordpress-php-modules','SKIP','PHP not installed');
  const nginx = path.join(HOSTING,'nginx/nginx.conf');
  const fpm = path.join(HOSTING,'php/php-fpm.conf');
  if (safeFile(nginx) && hasCommand('nginx')) entry('nginx-config', cmd('nginx',['-t','-p',path.dirname(nginx)+'/','-c',nginx],4500).ok ? 'PASS':'WARN','Managed Nginx syntax check (configuration only, not HTTP acceptance)');
  else entry('nginx-config','SKIP','Managed Nginx configuration or executable absent');
  if (safeFile(fpm) && hasCommand('php-fpm')) entry('php-fpm-config',cmd('php-fpm',['-t','-y',fpm],4500).ok ? 'PASS':'WARN','Managed PHP-FPM syntax check (configuration only, not execution acceptance)');
  else entry('php-fpm-config','SKIP','Managed PHP-FPM configuration or executable absent');
  if (hasCommand('mariadb')) entry('mariadb-readonly-select',cmd('mariadb',['--no-defaults','-u','root','-N','-s','-e','SELECT 1;'],3500).ok ? 'PASS':'WARN','Read-only SELECT 1 over local MariaDB socket; no application DB verified');
  else entry('mariadb-readonly-select','SKIP','MariaDB client missing');
  for (const service of ['mhc-full-wp-php','mhc-full-wp-nginx','mhc-full-panel','mhc-full-heartbeat']) {
    const r = hasCommand('sv') ? cmd('sv',['status',service],2000):{ok:false,out:''};
    entry(`service-${service}`, r.ok && r.out.startsWith('run:') ? 'PASS':'WARN', r.ok && r.out.startsWith('run:') ? 'Managed runit service observed running':'Managed service not observed running; may be intentionally disabled');
  }
  const wp = listCount(path.join(CFG,'sites'),'.env');
  const stat = listCount(path.join(CFG,'static'),'.conf');
  entry('site-registry','PASS',`Local registry: ${wp} WordPress record(s), ${stat} static record(s); metadata only`);
  const latest = path.join(SNAP,'latest-success-path');
  if (!safeFile(latest)) entry('backup-integrity','SKIP','No successful backup marker');
  else {
    let goodPath = false;
    try {
      const target = fs.realpathSync(fs.readFileSync(latest,'utf8').trim());
      const root = fs.realpathSync(SNAP);
      goodPath = path.dirname(target) === root && /^snapshot-[0-9]{8}$/.test(path.basename(target)) && dir(target);
    } catch { /* no backup */ }
    if (!goodPath) entry('backup-integrity','WARN','Backup pointer invalid or outside managed snapshot directory');
    else {
      const verify = path.join(HOME,'.local/share/mhc-full-installer/bin/backup-verify.sh');
      if (!safeFile(verify)) entry('backup-integrity','SKIP','Backup verification script absent');
      else entry('backup-integrity',cmd('bash',[verify,'verify'],16000).ok ? 'PASS':'WARN','Latest backup checksum/archives checked; this is NOT a successful restore');
    }
  }
  // Do not claim HA readiness based on observational status.
  entry('ha-promotion', 'BLOCKED','No authoritative GTID, durable write fencing, lease and route evidence; HA promotion not evaluated');
}
function httpProbe(slug, hostname) {
  return new Promise(resolve => {
    const port = Number(process.env.MHC_ACCEPT_HTTP_PORT || 18080);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return resolve({ok:false});
    const req = http.get({hostname:'127.0.0.1',port,path:'/',headers:{Host:hostname},timeout:3500}, res => {
      // discard body; no credential/content emitted in output
      res.on('data',()=>{});
      res.on('end',()=>resolve({ok:true,status:res.statusCode}));
      res.on('error',()=>resolve({ok:false}));
      res.resume();
    });
    req.on('error',()=>resolve({ok:false}));
    req.on('timeout',()=>req.destroy());
  });
}
async function siteTest(slug, hostname) {
  if (!SLUG.test(slug) || !HOST.test(hostname) || hostname.includes('..')) throw Error('Invalid site slug or host');
  if (['localhost','127.0.0.1'].includes(hostname.toLowerCase()) === false && hostname.includes(':')) throw Error('Invalid HTTP Host');
  const confDir = path.join(HOSTING,'nginx/sites');
  const confPath = path.join(confDir, `${slug}.conf`);
  const staticCfg = path.join(CFG,'static', `${slug}.conf`);
  const wpCfg = path.join(CFG,'sites', `${slug}.env`);
  const type = safeFile(staticCfg) ? 'static': safeFile(wpCfg) ? 'wordpress': null;
  if (!type || !safeFile(confPath)) {
    entry('site-registered','BLOCKED','Site is not registered/configured with the managed local vhost');
    return;
  }
  const vhost = fs.readFileSync(confPath,'utf8');
  if (!vhost.split(/\r?\n/).some(line=>line.trim()===`server_name ${hostname};`) || !vhost.includes('listen 127.0.0.1:18080;')) {
    entry('site-vhost','BLOCKED','Host mismatch or vhost is not bound to managed loopback address'); return;
  }
  entry('site-vhost','PASS',`Managed loopback vhost present for registered ${type} site`);
  const resp = await httpProbe(slug,hostname);
  if (!resp.ok) entry('site-http','WARN','No loopback HTTP response; verify service and Nginx routing');
  else if (resp.status >= 200 && resp.status < 400) entry('site-http','PASS',`Loopback HTTP responded ${resp.status}; NOT evidence of WordPress correctness or HA readiness`);
  else entry('site-http','WARN',`Loopback HTTP status ${resp.status}; inspect local server logs`);
}
function makeReport() {
  const counts = Object.fromEntries(['PASS','WARN','BLOCKED','SKIP'].map(x=>[x,items.filter(y=>y.state===x).length]));
  return {schema:'mhc.acceptance.v1', release:'TEST 0.5.0C-WRITER-AUDIT', generatedAt:new Date().toISOString(), scope:'LAB-local-observations-only',
    notVerified:['Android device acceptance (unless executed on device)','WordPress admin/media/permalinks','restore on actual MariaDB','GTID replication','file replication','Cloudflare write fencing','HA failover'],
    counts, checks:items};
}
async function main() {
  const [mode,...args] = process.argv.slice(2);
  if (!['check','report','site'].includes(mode)) {
    console.error('Usage: mhc-full accept check [--json] | report | site STATIC_OR_WP_SLUG HOST [--json]');process.exitCode=2;return;
  }
  if (mode === 'site') {
    if (args.length < 2 || args.length > 3 || (args[2] && args[2] !== '--json')) throw Error('Usage: accept site SLUG HOST [--json]');
    await siteTest(args[0],args[1]);
  } else {
    if (mode === 'check' && args.length > 1) throw Error('Only --json accepted');
    if (mode === 'check' && args.length && args[0] !== '--json') throw Error('Unknown option');
    if (mode === 'report' && args.length) throw Error('report takes no arguments');
    basic();
  }
  const report = makeReport();
  if (mode === 'report') {
    const folder=path.join(CFG,'acceptance-reports');
    fs.mkdirSync(folder,{recursive:true,mode:0o700});
    if (fs.lstatSync(folder).isSymbolicLink()) throw Error('Unsafe report folder');
    fs.chmodSync(folder,0o700);
    const name=`accept-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomBytes(3).toString('hex')}.json`;
    const dest=path.join(folder,name);
    fs.writeFileSync(dest, JSON.stringify(report,null,2)+'\n', {flag:'wx',mode:0o600});
    console.log(`Sanitized, device-local acceptance report saved: ${dest}`);
    console.log('It contains no source configuration, tokens, DB content, stdout or stderr. Review before sharing.');
  } else if (args.includes('--json')) console.log(JSON.stringify(report,null,2));
  else {
    console.log(`MHC TEST 0.5.0C-WRITER-AUDIT LAB acceptance — ${mode}`);
    for (const x of items) console.log(`${x.state.padEnd(7)} ${x.key.padEnd(31)} ${x.detail}`);
    console.log('COUNTS',JSON.stringify(report.counts));
    console.log('No FAILOVER/Primary permission is inferred from these observations.');
  }
}
main().catch(e=>{console.error('Acceptance input invalid or unexpected runtime error:', e?.message?.startsWith('Usage:') || e?.message?.startsWith('Invalid ') ? e.message : 'inspect local environment');process.exitCode=2;});
