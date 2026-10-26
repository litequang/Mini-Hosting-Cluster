#!/usr/bin/env bash
# Pure local fake-site backup/restore drill: no Termux, no MySQL, no internet.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)";trap 'rm -rf "$TMP"' EXIT
export HOME="$TMP/home";mkdir -p "$HOME" "$TMP/mocks" "$HOME/.local/share/mhc-full-installer/bin"
export PATH="$TMP/mocks:$PATH"
cat > "$TMP/mocks/mariadb-dump" <<'MOCK'
#!/usr/bin/env bash
[[ "${!#}" == wp_demo ]] || exit 13
printf '%s\n' '-- fake verified MariaDB dump' 'CREATE TABLE example (id int);'
MOCK
cat > "$TMP/mocks/sv" <<'MOCK'
#!/usr/bin/env bash
if [[ "${1:-}" == status ]];then echo 'down: test'; else echo 'mock sv up/down';fi
MOCK
chmod +x "$TMP/mocks/"*
cp "$ROOT/bin/backup-verify.sh" "$ROOT/bin/daily-backup.sh" "$ROOT/bin/restore.sh" "$ROOT/bin/peer-copy.sh" "$ROOT/bin/safe-tar-inspect.py" "$HOME/.local/share/mhc-full-installer/bin/"
for f in "$HOME/.local/share/mhc-full-installer/bin/"*.sh; do sed -i '1c#!/usr/bin/env bash' "$f"; done
mkdir -p "$HOME/.config/mhc-full-installer/sites" "$HOME/websites/demo/wp-content/uploads"
printf 'test' > "$HOME/websites/demo/wp-config.php"
printf 'file' > "$HOME/websites/demo/wp-content/uploads/hello.jpg"
cat > "$HOME/.config/mhc-full-installer/sites/demo.env" <<EOF
SITE_SLUG=demo
SITE_ROOT=$HOME/websites/demo
DB_NAME=wp_demo
DB_USER=u_demo
EOF
# A static website must also be present in the same daily snapshot.
mkdir -p "$HOME/.config/mhc-full-installer/static" "$HOME/websites/landing"
printf 'STATIC RELEASE' > "$HOME/websites/landing/index.html"
printf 'TYPE=static\nSITE_SLUG=landing\n' > "$HOME/.config/mhc-full-installer/static/landing.conf"
bash "$ROOT/bin/daily-backup.sh" run
SNAP="$(cat "$HOME/hosting-backups/mhc-full/latest-success-path")"
bash "$ROOT/bin/backup-verify.sh" verify "$SNAP"
bash "$ROOT/bin/restore.sh" plan "$SNAP" > "$TMP/restore-plan.txt"
bash "$ROOT/bin/restore.sh" extract "$SNAP" "$TMP/extracted" --confirm=EXTRACT_ONLY
[[ -f "$TMP/extracted/websites/demo/wp-config.php" && -f "$TMP/extracted/database-dumps/demo.sql.gz" && -f "$TMP/extracted/websites/landing/index.html" ]] || exit 21
[[ "$(cat "$TMP/extracted/websites/demo/wp-content/uploads/hello.jpg")" == file ]] || exit 22
mkdir -p "$HOME/.config/mhc-full-installer"
touch "$HOME/.config/mhc-full-installer/installed"  # mocked disposable install marker
cat > "$TMP/mocks/mariadb" <<'MOCK'
#!/usr/bin/env bash
if [[ "$*" == *'CREATE DATABASE'* ]];then
  printf '%s\n' "$*" > "$HOME/.mock-db-created"
else
  cat > "$HOME/.mock-sql-imported"
fi
MOCK
chmod +x "$TMP/mocks/mariadb"
if bash "$ROOT/bin/restore.sh" sql-lab "$SNAP" demo thophuong_pro --confirm=EMPTY_LAB_ONLY >/dev/null 2>&1;then echo 'FAIL: production DB target accepted';exit 27;fi
bash "$ROOT/bin/restore.sh" sql-lab "$SNAP" demo mhc_restore_demo --confirm=EMPTY_LAB_ONLY
[[ -f "$HOME/.mock-sql-imported" ]] || exit 28
# Simulate remote SSH shell + rsync in an isolated fake receiver (no network).
export MHC_FAKE_REMOTE="$TMP/receiver";mkdir -p "$MHC_FAKE_REMOTE"
cat > "$TMP/mocks/ssh" <<'MOCK'
#!/usr/bin/env bash
command="${!#}"
cd "$MHC_FAKE_REMOTE"
exec /bin/sh -c "$command"
MOCK
cat > "$TMP/mocks/rsync" <<'MOCK'
#!/usr/bin/env bash
args=("$@"); n=${#args[@]}
source="${args[$((n-2))]}"; target="${args[$((n-1))]}"
relative="${target#*:}"
mkdir -p "$MHC_FAKE_REMOTE/$relative"
cp -a "$source/." "$MHC_FAKE_REMOTE/$relative/"
MOCK
chmod +x "$TMP/mocks/ssh" "$TMP/mocks/rsync"
bash "$ROOT/bin/peer-copy.sh" configure lab testhost 8022
bash "$ROOT/bin/peer-copy.sh" push
bash "$ROOT/bin/peer-copy.sh" push > /dev/null  # remote retry is idempotent
[[ "$(find "$MHC_FAKE_REMOTE" -type d -name snapshot-\* | wc -l)" -eq 1 ]] || exit 26
# Repeat same day idempotent; check tamper detected and retained existing snapshot.
bash "$ROOT/bin/daily-backup.sh" run
echo tamper >> "$SNAP/websites.tar.gz"
if bash "$ROOT/bin/backup-verify.sh" verify "$SNAP" >/dev/null 2>&1;then echo 'FAIL: tamper not detected';exit 23;fi
if bash "$ROOT/bin/daily-backup.sh" run >/dev/null 2>&1;then echo 'FAIL: existing corrupt snapshot treated as success';exit 24;fi
# Reject unsafe unregistered configuration.
sed -i 's/^DB_NAME=.*/DB_NAME=wp_demo;DROP/' "$HOME/.config/mhc-full-installer/sites/demo.env"
rm -rf "$SNAP"
if bash "$ROOT/bin/daily-backup.sh" run > /dev/null 2>&1;then echo 'FAIL: invalid site config accepted';exit 25;fi
printf 'PASS: backup, verify, peer transfer/remote validation, extract, repeat, tamper, and injection guard\n'
