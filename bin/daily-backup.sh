#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail; umask 077
[[ "${1:-}" == run ]] || { echo 'Usage: mhc-full backup run'; exit 2; }
BASE="$HOME/hosting-backups/mhc-full"; CONF="$HOME/.config/mhc-full-installer/sites"
BIN="$HOME/.local/share/mhc-full-installer/bin"
fail(){ echo "ERROR: $*" >&2; exit 1; }
mkdir -p "$BASE"; chmod 700 "$BASE"
# Never pretend this staged snapshot path is safely selected by an active HA lease.
if [[ -e "$HOME/.config/mini-hosting-cluster/ha.json" ]]; then
  node -e 'try{let x=require(process.env.HOME+"/.config/mini-hosting-cluster/ha.json");if(x.armed)process.exit(12)}catch(e){process.exit(13)}' || fail 'HA armed or malformed; daily snapshot requires verified primary lease integration'
fi
DAY="$(date +%Y%m%d)"; FINAL="$BASE/snapshot-$DAY"
if [[ -e "$FINAL" ]]; then
  "$BIN/backup-verify.sh" verify "$FINAL" || fail "Existing today's snapshot is invalid; manual investigation required"
  echo "Verified existing daily snapshot: $FINAL"; exit 0
fi
LOCK="$BASE/.backup-lock"
OPLOCK="$BASE/.site-operation-lock"
mkdir "$LOCK" 2>/dev/null || fail "Backup lock exists at $LOCK; inspect before removal"
if ! mkdir "$OPLOCK" 2>/dev/null;then
  rmdir "$LOCK" 2>/dev/null || true
  fail 'Site deployment/backup operation lock exists; no concurrent snapshot'
fi
TMP=""; STOPPED_NGINX=0; STOPPED_PHP=0
resume(){
  if (( STOPPED_PHP ));then sv up mhc-full-wp-php || echo 'WARNING: PHP-FPM failed to restart' >&2;fi
  if (( STOPPED_NGINX ));then sv up mhc-full-wp-nginx || echo 'WARNING: WP Nginx failed to restart' >&2;fi
}
cleanup(){
  resume
  [[ -z "$TMP" ]] || { [[ ! -e "$TMP" ]] || rm -rf -- "$TMP"; }
  rmdir "$OPLOCK" 2>/dev/null || true
  rmdir "$LOCK" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
shopt -s nullglob
configs=("$CONF"/*.env)
static_configs=("$HOME/.config/mhc-full-installer/static/"*.conf)
TPP_FLAG="${MHC_FULL_INCLUDE_TPP:-0}"
[[ "$TPP_FLAG" == 0 || "$TPP_FLAG" == 1 ]] || fail 'MHC_FULL_INCLUDE_TPP must be 0 or 1'
(( ${#configs[@]} > 0 || ${#static_configs[@]} > 0 )) || [[ "$TPP_FLAG" == 1 ]] || fail 'No registered sites; refusing an empty success snapshot'
# No other WP write path must bypass these managed services during backup.
for service in mhc-full-wp-nginx mhc-full-wp-php; do
  if command -v sv >/dev/null && sv status "$service" 2>/dev/null | grep -q '^run:'; then
    sv down "$service" || fail "Cannot quiesce $service"
    case "$service" in mhc-full-wp-nginx) STOPPED_NGINX=1;; mhc-full-wp-php) STOPPED_PHP=1;;esac
  fi
done
# Optional TPP only if its application ingress is already quiesced manually. No
# staging script may stop a production app automatically or claim cloud fencing.
if [[ "$TPP_FLAG" == 1 ]]; then
  APP="$HOME/apps/thophuongpro"
  [[ -f "$APP/.env" && -d "$APP/dist" && -d "$APP/storage" ]] || fail 'TPP app incomplete'
  if command -v sv >/dev/null && sv status mini-web 2>/dev/null | grep -q '^run:';then
    fail 'TPP mini-web is running: maintenance/fencing required before TPP backup'
  fi
  TPP_DB="$(node --env-file="$APP/.env" -e 'process.stdout.write(process.env.MYSQL_DATABASE||"")')" || fail 'Cannot read TPP DB'
  [[ "$TPP_DB" == thophuong_pro ]] || fail 'TPP DB must be canonical thophuong_pro'
fi
TMP="$(mktemp -d "$BASE/.pending-$DAY-XXXXXXXX")"; chmod 700 "$TMP"; mkdir -m 700 "$TMP/databases"
count=0
for config in "${configs[@]}";do
  [[ -f "$config" && ! -L "$config" ]] || fail 'Invalid site registry file'
  slug="$(sed -n 's/^SITE_SLUG=//p' "$config")"
  root="$(sed -n 's/^SITE_ROOT=//p' "$config")"
  db="$(sed -n 's/^DB_NAME=//p' "$config")"
  [[ "$slug" =~ ^[a-z][a-z0-9-]{1,30}$ && "$db" =~ ^wp_[a-z0-9_]{1,48}$ ]] || fail 'Invalid registered site values'
  [[ "$config" == "$CONF/$slug.env" && "$root" == "$HOME/websites/$slug" && -f "$root/wp-config.php" ]] || fail "Invalid/missing registered WordPress files for $slug"
  echo "Dumping managed WordPress DB: $db"
  mariadb-dump --no-defaults -u root --single-transaction --quick --routines --triggers --events --hex-blob --max-allowed-packet=128M "$db" | gzip -1 > "$TMP/databases/$slug.sql.gz"
  [[ -s "$TMP/databases/$slug.sql.gz" ]] || fail "Empty MariaDB dump for $slug"
  count=$((count+1))
done
static_count=0
for config in "${static_configs[@]}"; do
  [[ -f "$config" && ! -L "$config" ]] || fail 'Invalid static site registry'
  slug="$(sed -n 's/^SITE_SLUG=//p' "$config")"
  [[ "$slug" =~ ^[a-z][a-z0-9-]{1,30}$ && "$config" == "$HOME/.config/mhc-full-installer/static/$slug.conf" ]] || fail 'Invalid static site metadata'
  [[ -f "$HOME/websites/$slug/index.html" && ! -L "$HOME/websites/$slug" ]] || fail "Static site files missing: $slug"
  static_count=$((static_count+1))
done
if (( count > 0 || static_count > 0 ));then
  tar -czf "$TMP/websites.tar.gz" -C "$HOME" websites
  # Clone-safe configuration archive: never transfer MHC node identities, remote-control
  # credentials or Panel admin credentials into another node's restore set.
  tar -czf "$TMP/site-config.tar.gz" -C "$HOME/.config" \
    --exclude='mhc-full-installer/node-identity.json' \
    --exclude='mhc-full-installer/node-auth.json' \
    --exclude='mhc-full-installer/joined.json' \
    --exclude='mhc-full-installer/cluster.json' \
    --exclude='mhc-full-installer/members.json' \
    --exclude='mhc-full-installer/pending-invite.json' \
    --exclude='mhc-full-installer/clone-offers.json' \
    --exclude='mhc-full-installer/panel-admin-token' \
    --exclude='mhc-full-installer/peer.conf' \
    --exclude='mhc-full-installer/.clone-operation-lock' \
    --exclude='mhc-full-installer/.enrollment-lock' \
    --exclude='mhc-full-installer/installed' \
    --exclude='mhc-full-installer/install-incomplete' \
    mhc-full-installer
fi
if [[ "$TPP_FLAG" == 1 ]];then
  mariadb-dump --no-defaults -u root --single-transaction --quick --routines --triggers --events --hex-blob --max-allowed-packet=128M thophuong_pro | gzip -1 > "$TMP/databases/thophuong_pro.sql.gz"
  [[ -s "$TMP/databases/thophuong_pro.sql.gz" ]] || fail 'Empty TPP DB dump'
  tar -czf "$TMP/tpp-storage.tar.gz" -C "$APP" storage
  [[ -f "$APP/package-lock.json" ]] || fail 'TPP package-lock.json missing'
  tar -czf "$TMP/tpp-release.tar.gz" -C "$APP" .env dist package.json package-lock.json
  sheet="$(node --env-file="$APP/.env" -e 'process.stdout.write(process.env.SHEET_STORAGE_ROOT||"")')"
  [[ -n "$sheet" && -d "$sheet" ]] || fail 'TPP SHEET_STORAGE_ROOT missing'
  case "$sheet/" in
    "$APP/storage/"*) :;;
    *) tar -czf "$TMP/tpp-external-sheets.tar.gz" -C "$(dirname "$sheet")" "$(basename "$sheet")";;
  esac
fi
cat > "$TMP/INFO.txt" <<EOF
MHC-FULL TEST 0.3.9
Created: $(date -Iseconds)
Managed WordPress sites: $count
Managed static sites: $static_count
Tho Phuong Pro explicitly included: $TPP_FLAG
Snapshot contract: managed WordPress HTTP/PHP-FPM temporarily quiesced; InnoDB dump is transactionally consistent PER DB.
CAVEAT: external DB writers, cron and apps bypassing the managed ingress are NOT fenced. SQL and all files are not one atomic point-in-time snapshot.
Site/DB secrets inside archives: YES; node identity/Panel tokens excluded. Encrypt at rest/off-device; do not publish or upload into chat.
EOF
( cd "$TMP" && find . -type f ! -name SHA256SUMS -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum > SHA256SUMS && sha256sum -c SHA256SUMS >/dev/null )
for f in "$TMP"/*.tar.gz "$TMP"/databases/*.gz; do [[ -f "$f" ]] || continue; gzip -t -- "$f"; [[ "$f" != *.tar.gz ]] || tar -tzf "$f" >/dev/null; done
mv -- "$TMP" "$FINAL"; TMP=""
printf '%s\n' "$FINAL" > "$BASE/latest-success-path"
mapfile -t all < <(find "$BASE" -mindepth 1 -maxdepth 1 -type d -name 'snapshot-*' | LC_ALL=C sort)
if (( ${#all[@]} > 7 ));then
  for (( i=0;i<${#all[@]}-7;i++ ));do [[ "${all[$i]}" == "$BASE"/snapshot-* ]] && rm -rf -- "${all[$i]}";done
fi
echo "SUCCESS: snapshot $FINAL (WP=$count, static=$static_count, TPP=$TPP_FLAG)"
