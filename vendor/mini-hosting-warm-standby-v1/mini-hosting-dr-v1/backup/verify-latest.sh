#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
BACKUP_ROOT="${TPP_BACKUP_ROOT:-$HOME/hosting-backups/thophuongpro}"
[[ -f "$BACKUP_ROOT/latest-success-path" ]] || { echo 'No completed backup yet'; exit 1; }
SNAPSHOT="$(cat "$BACKUP_ROOT/latest-success-path")"
[[ "$SNAPSHOT" == "$BACKUP_ROOT"/snapshot-* && -d "$SNAPSHOT" ]] || { echo 'Latest snapshot missing'; exit 1; }
(cd "$SNAPSHOT" && sha256sum -c SHA256SUMS)
for file in "$SNAPSHOT"/*.tar.gz; do tar -tzf "$file" >/dev/null; done
gzip -t "$SNAPSHOT/database.sql.gz"
cat "$SNAPSHOT/INFO.txt"
echo "VERIFIED: $SNAPSHOT"
