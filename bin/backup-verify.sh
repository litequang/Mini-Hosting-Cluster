#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
[[ "${1:-}" == verify ]] || { echo 'Usage: mhc-full backup verify [snapshot-dir]'; exit 2; }
base="$HOME/hosting-backups/mhc-full"
if [[ -n "${2:-}" ]];then dir="$(realpath -e -- "$2")";else
  [[ -f "$base/latest-success-path" ]] || { echo 'No successful snapshot marker' >&2; exit 1; }
  dir="$(realpath -e -- "$(cat "$base/latest-success-path")")"
fi
[[ -d "$dir" && ! -L "$dir" && -f "$dir/SHA256SUMS" && ! -L "$dir/SHA256SUMS" && -f "$dir/INFO.txt" ]] || { echo 'Snapshot missing or malformed' >&2; exit 1; }
# Reject paths outside a private snapshot tree before evaluating checksum entries.
[[ "$(basename "$dir")" =~ ^snapshot-[0-9]{8}$ ]] || { echo 'Not a daily snapshot' >&2; exit 1; }
while IFS= read -r line;do
  [[ "$line" =~ ^[a-fA-F0-9]{64}[[:space:]][*[:space:]]\./[a-zA-Z0-9_./-]+$ ]] || { echo 'Unsafe checksum entry' >&2; exit 1; }
  rel="${line:66}"; rel="${rel#\*}"
  [[ "$rel" != *'/../'* && "$rel" != ../* && "$rel" != *'/./'* && "$rel" != */.. ]] || { echo 'Checksum path traversal' >&2; exit 1; }
done < "$dir/SHA256SUMS"
(cd "$dir" && sha256sum -c SHA256SUMS >/dev/null)
for f in "$dir"/*.tar.gz "$dir"/databases/*.sql.gz;do
  [[ -f "$f" ]] || continue
  gzip -t -- "$f"
  [[ "$f" != *.tar.gz ]] || tar -tzf "$f" > /dev/null
done
echo "Verified integrity (NOT restore success or authenticity): $dir"
