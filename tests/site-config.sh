#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)";TMP="$(mktemp -d)";trap 'rm -rf "$TMP"' EXIT
export HOME="$TMP/home";mkdir -p "$HOME/websites/demo" "$HOME/.config/mhc-full-installer/sites"
touch "$HOME/websites/demo/wp-config.php" "$HOME/.config/mhc-full-installer/sites/demo.env"
bash "$ROOT/bin/site-serve.sh" configure demo localhost
F="$HOME/.local/share/mhc-full-installer/hosting/nginx"
grep -q '127.0.0.1:18080' "$F/nginx.conf"
grep -Fq 'fastcgi_pass 127.0.0.1:19000' "$F/sites/demo.conf"
if bash "$ROOT/bin/site-serve.sh" configure demo 'bad;example.com' 2>/dev/null;then echo 'FAIL: invalid host accepted';exit 1;fi
if bash "$ROOT/bin/site-serve.sh" configure '../../oops' localhost 2>/dev/null;then echo 'FAIL: invalid slug accepted';exit 1;fi
printf 'PASS: loopback vhost and host/slug guards\n'
