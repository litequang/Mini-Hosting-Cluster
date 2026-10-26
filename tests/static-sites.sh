#!/usr/bin/env bash
set -Eeuo pipefail
SOURCE="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)";trap 'rm -rf -- "$TMP"' EXIT
export HOME="$TMP/home";mkdir -p "$HOME/.local/share/mhc-full-installer/bin"
cp "$SOURCE/bin/safe-zip-extract.py" "$SOURCE/bin/safe-tar-inspect.py" "$HOME/.local/share/mhc-full-installer/bin/"
bash "$SOURCE/bin/sites.sh" create-static demo
bash "$SOURCE/bin/site-serve.sh" configure-static demo local.test
VHOST="$HOME/.local/share/mhc-full-installer/hosting/nginx/sites/demo.conf"
grep -q 'listen 127.0.0.1:18080' "$VHOST"
grep -q 'try_files' "$VHOST"
grep -q 'deny all' "$VHOST"
if bash "$SOURCE/bin/site-serve.sh" configure-static demo 'bad;test' 2>/dev/null;then echo 'FAIL: invalid hostname accepted';exit 1;fi
python3 - "$TMP" <<'PY'
from pathlib import Path
import sys,zipfile
p=Path(sys.argv[1])
with zipfile.ZipFile(p/'valid.zip','w') as f:
    f.writestr('index.html','NEW BUILD')
    f.writestr('styles/site.css','h1 { display:block }')
with zipfile.ZipFile(p/'evil.zip','w') as f:
    f.writestr('../escape.txt','malicious')
    f.writestr('index.html','malicious')
with zipfile.ZipFile(p/'no-index.zip','w') as f:
    f.writestr('subfolder/index.html','missing root index')
with zipfile.ZipFile(p/'exec.zip','w') as f:
    f.writestr('index.html','safe')
    f.writestr('run.php','<?php echo 1; ?>')
PY
if bash "$SOURCE/bin/sites.sh" deploy-static demo "$TMP/evil.zip" 2>/dev/null;then echo 'FAIL: traversal ZIP accepted';exit 1;fi
if bash "$SOURCE/bin/sites.sh" deploy-static demo "$TMP/no-index.zip" 2>/dev/null;then echo 'FAIL: missing index accepted';exit 1;fi
grep -q 'MHC static site ready' "$HOME/websites/demo/index.html"
mkdir -p "$HOME/hosting-backups/mhc-full/.site-operation-lock"
if bash "$SOURCE/bin/sites.sh" deploy-static demo "$TMP/valid.zip" 2>/dev/null;then echo 'FAIL: concurrent deployment lock bypassed';exit 1;fi
[[ -d "$HOME/hosting-backups/mhc-full/.site-operation-lock" ]] || { echo 'FAIL: took away another process lock';exit 1; }
rmdir "$HOME/hosting-backups/mhc-full/.site-operation-lock"
bash "$SOURCE/bin/sites.sh" deploy-static demo "$TMP/valid.zip"
grep -q 'NEW BUILD' "$HOME/websites/demo/index.html"
bash "$SOURCE/bin/sites.sh" rollback-static demo --confirm=ROLLBACK_STATIC
grep -q 'MHC static site ready' "$HOME/websites/demo/index.html"
# Site type registry and source tree are included even when WP database count is zero.
# Refuse an executable PHP file in static deployments, which could be downloaded as source.
if bash "$SOURCE/bin/sites.sh" deploy-static demo "$TMP/exec.zip" 2>/dev/null;then echo 'FAIL: server-side PHP source allowed in static archive';exit 1;fi
printf 'PASS: static sites, safe ZIP, host guards, releases/rollback\n'
# Reject malicious tar metadata before offline extraction.
python3 - "$TMP" <<'PYTAR'
import sys, tarfile, io
from pathlib import Path
root = Path(sys.argv[1])
with tarfile.open(root/'unsafe.tar.gz', 'w:gz') as f:
    info = tarfile.TarInfo('../notallowed')
    data = b'bad'
    info.size = len(data)
    f.addfile(info, io.BytesIO(data))
with tarfile.open(root/'link.tar.gz', 'w:gz') as f:
    info = tarfile.TarInfo('symlink')
    info.type = tarfile.SYMTYPE
    info.linkname = '/etc/passwd'
    f.addfile(info)
PYTAR
if python3 "$SOURCE/bin/safe-tar-inspect.py" "$TMP/unsafe.tar.gz" >/dev/null 2>&1;then echo 'FAIL: tar traversal accepted';exit 1;fi
if python3 "$SOURCE/bin/safe-tar-inspect.py" "$TMP/link.tar.gz" >/dev/null 2>&1;then echo 'FAIL: tar symlink accepted';exit 1;fi
cp "$SOURCE/bin/daily-backup.sh" "$SOURCE/bin/backup-verify.sh" "$HOME/.local/share/mhc-full-installer/bin/"
bash "$SOURCE/bin/daily-backup.sh" run
SNAP="$(cat "$HOME/hosting-backups/mhc-full/latest-success-path")"
bash "$SOURCE/bin/backup-verify.sh" verify "$SNAP"
tar -tzf "$SNAP/websites.tar.gz" | grep -q '^websites/demo/index.html$'
[[ ! -e "$SNAP/databases/demo.sql.gz" ]] || { echo 'FAIL: unexpected DB dump for static-only backup';exit 1; }
printf 'PASS: tar traversal, symlink, concurrent lock, static-only backup guards\n' 
