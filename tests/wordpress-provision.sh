#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)";trap 'rm -rf -- "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/home"
for name in php php-fpm curl unzip nginx;do printf '#!/usr/bin/env bash\nexit 0\n' > "$TMP/bin/$name";done
cat > "$TMP/bin/wp" <<'SH'
#!/usr/bin/env bash
echo "$1 $2" >> "$TEST_LOG"
[[ "$1 $2" != 'core download' ]]
SH
cat > "$TMP/bin/mariadb" <<'SH'
#!/usr/bin/env bash
if [[ "$*" == *'SELECT 1'* ]];then exit 0;fi
echo DATABASE_MUTATION >> "$TEST_LOG"
cat >/dev/null
SH
chmod 700 "$TMP/bin/"*
export TEST_LOG="$TMP/actions"
if HOME="$TMP/home" PATH="$TMP/bin:$PATH" bash "$ROOT/bin/wordpress.sh" install lab > "$TMP/output" 2>&1;then echo 'FAIL: download failure accepted';exit 1;fi
grep -qx 'core download' "$TEST_LOG"
if grep -q DATABASE_MUTATION "$TEST_LOG";then echo 'FAIL: DB changed before download succeeded';exit 1;fi
echo 'PASS: failed WordPress download creates no database/user'
