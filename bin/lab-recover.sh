#!/usr/bin/env bash
# TEST 0.5.0C-WRITER-AUDIT: complete only MHC Full source installation after known, clean
# Android LAB bootstrap was interrupted in runit enrollment. Never rerun DR.
set -Eeuo pipefail
umask 077
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MARK="$HOME/.config/mhc-full-installer"
DEST="$HOME/.local/share/mhc-full-installer"
fail(){ printf 'STOP: %s\n' "$*" >&2; exit 1; }
check(){
  [[ "${PREFIX:-}" == /data/data/com.termux/files/usr ]] || fail 'Standard Termux required, not a Linux test container'
  [[ "$(uname -m)" == aarch64 ]] || fail 'Only aarch64 disposable Termux LAB supported'
  [[ -f "$MARK/install-incomplete" && ! -L "$MARK/install-incomplete" ]] || fail 'No recognized incomplete-install marker'
  grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[^[:space:]]+ clean install attempted$' "$MARK/install-incomplete" || fail 'Unexpected incomplete marker; inspect manually'
  [[ ! -e "$MARK/installed" && ! -e "$HOME/mhc-full" && ! -e "$DEST/bin" ]] || fail 'Completed/partly finished MHC Full code detected; manual audit required'
  for bad in "$HOME/apps/thophuongpro/.env" "$HOME/apps/thophuongpro/dist/server.cjs" \
    "$HOME/.config/mini-hosting-cluster/node.json" "$HOME/.config/mini-hosting-cluster/ha.json" \
    "$HOME/.cloudflared/thophuong.token" "$HOME/websites"; do
    [[ ! -e "$bad" ]] || fail "Existing application, credential, cluster or website marker: $bad"
  done
  [[ -f "$HOME/android-hosting-panel/src/server.mjs" && -f "$HOME/.nginx/nginx.conf" ]] || fail 'LAB bootstrap panel/Nginx files missing'
  [[ -f "$HOME/.local/share/mini-hosting-cluster/src/cli.mjs" && -x "$HOME/mhc" ]] || fail 'Partial cluster agent sources absent; do not assume bootstrap was completed'
  for svc in nginx mysqld amh-panel mini-web named-tunnel; do
    [[ -f "$PREFIX/var/service/$svc/run" && ! -L "$PREFIX/var/service/$svc/run" ]] || fail "Required bootstrap service missing or unsafe: $svc"
  done
  if command -v sv >/dev/null && sv status named-tunnel 2>/dev/null | grep -q '^run:';then fail 'Named tunnel currently active';fi
  if command -v sv >/dev/null && sv status mini-web 2>/dev/null | grep -q '^run:';then fail 'Production-shaped mini-web currently active';fi
  for cmd in nginx mariadb curl node python3;do command -v "$cmd" >/dev/null || fail "Binary missing: $cmd";done
  nginx -t -c "$HOME/.nginx/nginx.conf" >/dev/null 2>&1 || fail 'Current Nginx config invalid (not modified)'
  [[ "$(mariadb --no-defaults -u root -N -s -e 'SELECT 1;' 2>/dev/null)" == 1 ]] || fail 'MariaDB local read-only SELECT 1 failed'
  curl -fsS -o /dev/null --connect-timeout 2 --max-time 6 http://127.0.0.1:9090/ || fail 'Baseline Panel localhost 9090 not responding'
}
case "${1:-}" in
  --plan)
    printf 'MHC TEST 0.5.0C-WRITER-AUDIT PARTIAL LAB RECOVERY — READ-ONLY PLAN\n'
    check
    printf 'PASS: isolated LAB partial marker, platform, sources, service files, local Panel, SQL SELECT 1 and Nginx syntax.\n'
    printf 'Recovery will run self-tests then install MHC Full CLI sources and completion marker ONLY.\n'
    printf 'Does NOT rerun baseline DR installer, alter databases/vhosts/HA/Cloudflare or start services.\n'
    printf 'Legacy mhc-dashboard supervision may remain pending; inspect sv status separately.\n'
    ;;
  --complete)
    check
    printf 'LAB RECOVERY PRECHECK PASS. No application restore or HA activation.\n'
    read -r -p 'Type RECOVER_PARTIAL_LAB_SOURCE_ONLY to proceed: ' OK
    [[ "$OK" == RECOVER_PARTIAL_LAB_SOURCE_ONLY ]] || { echo 'Cancelled; no changes made'; exit 0; }
    bash "$ROOT/bin/self-test.sh" || fail 'Self-test failed; original partial marker retained'
    check
    mkdir -p "$DEST"
    chmod 700 "$DEST"
    staging="$(mktemp -d "$DEST/.recovery-XXXXXXXX")"
    trap 'rm -rf -- "$staging"' EXIT
    mkdir -m 700 "$staging/bin"
    cp "$ROOT/bin/"*.sh "$ROOT/bin/"*.py "$ROOT/bin/"*.php "$ROOT/bin/"*.mjs "$staging/bin/"
    chmod 700 "$staging/bin/"*
    bash -n "$ROOT/bin/mhc-full-wrapper" || fail 'Invalid launcher'
    cp "$ROOT/bin/mhc-full-wrapper" "$staging/mhc-full"
    chmod 700 "$staging/mhc-full"
    [[ ! -e "$DEST/bin" && ! -e "$HOME/mhc-full" ]] || fail 'Unexpected concurrent installation; stop'
    mv -- "$staging/bin" "$DEST/bin" || fail 'Failed to install MHC source'
    mv -- "$staging/mhc-full" "$HOME/mhc-full" || fail 'Launcher copy incomplete; retain marker'
    printf '%s\n' 'TEST 0.5.0C-WRITER-AUDIT installed on clean Termux' > "$MARK/installed.tmp-$$"
    chmod 600 "$MARK/installed.tmp-$$"
    mv -- "$MARK/installed.tmp-$$" "$MARK/installed"
    rm -f -- "$MARK/install-incomplete"
    printf 'MHC Full source recovery COMPLETE (LAB ONLY). Legacy cluster runit supervision NOT certified.\n'
    printf 'Next: ~/mhc-full doctor; ~/mhc-full accept check; sv status mhc-dashboard mhc-ha named-tunnel\n'
    ;;
  *) printf 'Usage: bash install.sh --recover-lab-plan | --recover-lab\n' >&2;exit 2;;
esac
