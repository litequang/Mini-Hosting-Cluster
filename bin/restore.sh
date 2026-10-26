#!/data/data/com.termux/files/usr/bin/bash
# Verified file-level RESTORE DRILL only; no DB import, app update, or website activation.
set -Eeuo pipefail;umask 077
fail(){ echo "ERROR: $*" >&2;exit 1; }
[[ $# -ge 2 ]] || fail 'Usage: mhc-full restore plan SNAPSHOT | extract SNAPSHOT EMPTY_DIR --confirm=EXTRACT_ONLY | sql-lab SNAPSHOT SLUG mhc_restore_NAME --confirm=EMPTY_LAB_ONLY'
cmd="$1";snap="$(realpath -e -- "$2")";bin="$HOME/.local/share/mhc-full-installer/bin"
"$bin/backup-verify.sh" verify "$snap"
case "$cmd" in
 plan)
  echo "Source: $snap"
  cat "$snap/INFO.txt"
  echo 'Database dumps:'; find "$snap/databases" -type f -name '*.sql.gz' -print 2>/dev/null || true
  echo 'Restore plan ONLY: file extraction into an EMPTY, offline directory. DB import/manual recreation of users and secrets is not automated.'
  ;;
 sql-lab)
  # Import ONLY into a new, explicitly named throwaway DB on an installed TEST device.
  [[ $# == 5 && "$5" == '--confirm=EMPTY_LAB_ONLY' ]] || fail 'Usage: restore sql-lab SNAPSHOT SOURCE_SLUG mhc_restore_NAME --confirm=EMPTY_LAB_ONLY'
  [[ -f "$HOME/.config/mhc-full-installer/installed" ]] || fail 'Clean TEST installer marker required (not a production restore tool)'
  slug="$3";target="$4"
  [[ "$slug" =~ ^[a-z][a-z0-9-]{1,30}$ || "$slug" == thophuong_pro ]] || fail 'Invalid source slug'
  [[ "$target" =~ ^mhc_restore_[a-z0-9_]{3,28}$ ]] || fail 'Target MUST begin mhc_restore_'
  sql="$snap/databases/$slug.sql.gz";[[ -f "$sql" ]] || fail 'Source SQL dump missing'
  command -v mariadb >/dev/null || fail 'Missing MariaDB client'
  # MariaDB CREATE DATABASE without IF NOT EXISTS refuses to overwrite a real DB.
  # Only allow explicit independent disposable DB names; no GRANT/user/secret copying.
  mariadb --no-defaults -u root -e "CREATE DATABASE \`$target\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" || fail 'DB exists or MariaDB root unavailable; nothing imported'
  if ! gzip -cd -- "$sql" | mariadb --no-defaults -u root "$target";then
    fail "Partial lab import may exist in $target. Manual investigation required; no automatic DROP."
  fi
  echo "SQL imported into EMPTY TEST DB $target only. DB users, site configs, and file paths NOT restored."
  ;;
 extract)
  [[ $# == 4 && "$4" == '--confirm=EXTRACT_ONLY' ]] || fail 'Explicit --confirm=EXTRACT_ONLY required'
  dest="$3"; [[ ! -e "$dest" && ! -L "$dest" ]] || fail 'Destination exists; refuse overwrite'
  # Checksums protect accidental corruption but do not authenticate a snapshot.
  # Do not follow archive-owned symlinks/hardlinks or path escapes during extraction.
  command -v python3 >/dev/null || fail 'Python 3 required for safe restore inspection'
  archives=()
  for f in "$snap"/*.tar.gz; do [[ -f "$f" ]] && archives+=("$f"); done
  if (( ${#archives[@]} > 0 ));then
    python3 "$bin/safe-tar-inspect.py" "${archives[@]}" || fail 'Unsafe tar content; extraction refused'
  fi
  mkdir -m 700 -- "$dest"
  [[ -f "$snap/websites.tar.gz" ]] && tar --no-same-owner --no-same-permissions -xzf "$snap/websites.tar.gz" -C "$dest"
  [[ -f "$snap/site-config.tar.gz" ]] && tar --no-same-owner --no-same-permissions -xzf "$snap/site-config.tar.gz" -C "$dest"
  [[ -f "$snap/tpp-storage.tar.gz" ]] && mkdir -p "$dest/tpp" && tar --no-same-owner --no-same-permissions -xzf "$snap/tpp-storage.tar.gz" -C "$dest/tpp"
  [[ -f "$snap/tpp-release.tar.gz" ]] && mkdir -p "$dest/tpp" && tar --no-same-owner --no-same-permissions -xzf "$snap/tpp-release.tar.gz" -C "$dest/tpp"
  [[ -f "$snap/tpp-external-sheets.tar.gz" ]] && mkdir -p "$dest/tpp/external-sheets" && tar --no-same-owner --no-same-permissions -xzf "$snap/tpp-external-sheets.tar.gz" -C "$dest/tpp/external-sheets"
  mkdir -p "$dest/database-dumps"
  for f in "$snap/databases/"*.sql.gz;do [[ -f "$f" ]] && cp -p -- "$f" "$dest/database-dumps/";done
  echo "Files extracted OFFLINE: $dest. Never import DB into production without a separate approved restore plan."
  ;;
 *) fail 'Usage: restore plan|extract';;
esac
