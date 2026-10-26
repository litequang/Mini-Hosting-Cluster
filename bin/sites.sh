#!/data/data/com.termux/files/usr/bin/bash
# Manage only MHC local static websites. Does not edit external services or public routing.
set -Eeuo pipefail; umask 077
BASE="$HOME/.local/share/mhc-full-installer"; ROOT="$HOME/websites"
CFG="$HOME/.config/mhc-full-installer"; STATIC="$CFG/static"; RELEASE="$BASE/static-releases"
BIN="$BASE/bin"; VALID='^[a-z][a-z0-9-]{1,30}$'
fail(){ echo "ERROR: $*" >&2;exit 1; }
valid_slug(){ [[ "$1" =~ $VALID ]] || fail 'Invalid site slug'; }
known(){
  valid_slug "$1"
  [[ -f "$STATIC/$1.conf" && ! -L "$STATIC/$1.conf" ]] || fail 'Not a managed static site'
  [[ -d "$ROOT/$1" && ! -L "$ROOT/$1" && -f "$ROOT/$1/index.html" ]] || fail 'Static website root missing/invalid'
}
create(){
  local slug="${1:-}";valid_slug "$slug"
  [[ ! -e "$ROOT/$slug" && ! -L "$ROOT/$slug" && ! -e "$CFG/sites/$slug.env" && ! -e "$STATIC/$slug.conf" ]] || fail 'Site or registry already exists'
  mkdir -p "$ROOT" "$STATIC";chmod 700 "$STATIC"
  mkdir -m 700 "$ROOT/$slug"
  printf '<!doctype html><html><meta charset="utf-8"><title>MHC Local Test</title><body><h1>MHC static site ready</h1></body></html>\n' > "$ROOT/$slug/index.html"
  chmod 600 "$ROOT/$slug/index.html"
  printf 'TYPE=static\nSITE_SLUG=%s\n' "$slug" > "$STATIC/$slug.conf"; chmod 600 "$STATIC/$slug.conf"
  echo "Created local-only static site $slug. Configure a virtual host with: ~/mhc-full serve configure-static $slug site.test"
}
list(){
  local conf slug kind
  printf 'SLUG\tTYPE\tFILES READY\n'
  shopt -s nullglob
  for conf in "$CFG/sites/"*.env "$STATIC/"*.conf;do
    slug="$(basename "$conf")";slug="${slug%.*}"
    [[ "$slug" =~ $VALID ]] || continue
    kind='wordpress';[[ "$conf" == "$STATIC/"* ]] && kind='static'
    if [[ -d "$ROOT/$slug" && ! -L "$ROOT/$slug" ]];then
      printf '%s\t%s\tyes\n' "$slug" "$kind"
    else printf '%s\t%s\tMISSING\n' "$slug" "$kind";fi
  done
}
deploy(){
  [[ $# == 2 ]] || fail 'Usage: sites deploy-static SLUG ARCHIVE.zip'
  local slug="$1" archive="$2" stage old backup op_lock
  known "$slug"
  [[ -f "$archive" && ! -L "$archive" ]] || fail 'ZIP must be regular non-symlink file'
  [[ "$archive" == *.zip || "$archive" == *.ZIP ]] || fail 'ZIP file required'
  [[ "$(wc -c < "$archive")" -le 104857600 ]] || fail 'ZIP exceeds 100 MB limit'
  command -v python3 >/dev/null || fail 'Python 3 missing; clean installer installs it'
  mkdir -p "$RELEASE";chmod 700 "$RELEASE"
  stage="$(mktemp -d "$ROOT/.mhc-stage-$slug.XXXXXXXX")"
  SITE_STAGE="$stage"
  op_lock="$HOME/hosting-backups/mhc-full/.site-operation-lock"
  old="$ROOT/$slug";backup="$RELEASE/$slug-$(date +%Y%m%d%H%M%S)-$$"
  trap '[[ -z "${SITE_STAGE:-}" ]] || rm -rf -- "$SITE_STAGE"; [[ -z "${SITE_LOCK:-}" ]] || rmdir "$SITE_LOCK" 2>/dev/null || true' EXIT
  python3 "$BIN/safe-zip-extract.py" "$archive" "$stage" || fail 'Unsafe or invalid ZIP; old site unchanged'
  [[ -f "$stage/index.html" ]] || fail 'Site ZIP missing index.html'
  # Refuse an in-progress website backup; never swap files during snapshot creation.
  mkdir -p "$HOME/hosting-backups/mhc-full"
  mkdir "$op_lock" 2>/dev/null || fail 'A site operation or backup already holds exclusive lock'
  SITE_LOCK="$op_lock"
  [[ ! -d "$HOME/hosting-backups/mhc-full/.backup-lock" ]] || fail 'Backup in progress; no deploy' 
  mv -- "$old" "$backup" || fail 'Cannot stage old release'
  if ! mv -- "$stage" "$old";then
    mv -- "$backup" "$old" || echo "CRITICAL: manual rollback from $backup required" >&2
    fail 'Activation failed; attempted restoration of old site'
  fi
  stage=''
  SITE_STAGE=''
  printf '%s\n' "$backup" > "$STATIC/$slug.last-release";chmod 600 "$STATIC/$slug.last-release"
  echo "Static site deployed: $slug. Previous files kept privately at: $backup"
  echo 'No external ingress or Cloudflare routing changed. Run serve check/reload if vhost already exists.'
}
rollback(){
  [[ $# == 2 && "$2" == '--confirm=ROLLBACK_STATIC' ]] || fail 'Usage: sites rollback-static SLUG --confirm=ROLLBACK_STATIC'
  local slug="$1" prev temp op_lock
  known "$slug"
  [[ -f "$STATIC/$slug.last-release" ]] || fail 'No previous release recorded'
  prev="$(cat "$STATIC/$slug.last-release")"
  [[ "$prev" == "$RELEASE/$slug-"* && -d "$prev" && ! -L "$prev" && -f "$prev/index.html" ]] || fail 'Invalid previous release'
  op_lock="$HOME/hosting-backups/mhc-full/.site-operation-lock"
  mkdir -p "$HOME/hosting-backups/mhc-full"
  mkdir "$op_lock" 2>/dev/null || fail 'Site operation/backup lock exists'
  SITE_LOCK="$op_lock"
  trap '[[ -z "${SITE_LOCK:-}" ]] || rmdir "$SITE_LOCK" 2>/dev/null || true' EXIT
  [[ ! -d "$HOME/hosting-backups/mhc-full/.backup-lock" ]] || fail 'Backup in progress' 
  temp="$RELEASE/$slug-rollback-$(date +%Y%m%d%H%M%S)-$$"
  mv -- "$ROOT/$slug" "$temp" || fail 'Cannot move current site'
  if ! mv -- "$prev" "$ROOT/$slug";then
    mv -- "$temp" "$ROOT/$slug" || echo 'CRITICAL: manually restore current site' >&2
    fail 'Rollback failed'
  fi
  printf '%s\n' "$temp" > "$STATIC/$slug.last-release"
  echo "Rollback completed for $slug. Prior current site preserved at $temp"
}
case "${1:-}" in
 create-static)shift;[[ $# == 1 ]] || fail 'Usage: sites create-static SLUG';create "$@";;
 list)list;;
 deploy-static)shift;deploy "$@";;
 rollback-static)shift;rollback "$@";;
 *) echo 'Usage: sites list|create-static SLUG|deploy-static SLUG ZIP|rollback-static SLUG --confirm=ROLLBACK_STATIC';exit 2;;
esac
