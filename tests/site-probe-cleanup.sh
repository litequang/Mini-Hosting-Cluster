#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)";trap 'rm -rf -- "$TMP"' EXIT
mkdir -p "$TMP/home/websites/lab" "$TMP/home/.local/share/mhc-full-installer/hosting/nginx/sites" "$TMP/bin"
printf '    server_name lab.test;\n' > "$TMP/home/.local/share/mhc-full-installer/hosting/nginx/sites/lab.conf"
cat > "$TMP/bin/curl" <<'SH'
#!/usr/bin/env bash
last="${@: -1}"
file="${last##*/}"
token="${file#mhc-probe-}"
printf '%s' "${token%.php}"
SH
chmod 700 "$TMP/bin/curl"
HOME="$TMP/home" PATH="$TMP/bin:$PATH" bash "$ROOT/bin/site-serve.sh" probe lab lab.test
if find "$TMP/home/websites/lab" -type f | grep -q .;then echo 'FAIL: temporary PHP probe left behind';exit 1;fi
echo 'PASS: PHP probe exits successfully and removes its temporary file'
