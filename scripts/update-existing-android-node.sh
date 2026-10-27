#!/data/data/com.termux/files/usr/bin/bash
# Unified offline package entry. Build once, transfer the same package to each LAB.
set -Eeuo pipefail
root="$(cd "$(dirname "$0")" && pwd)"
[[ -f "$root/manifest.json" && -f "$root/upgrader.mjs" ]] || { echo 'Build a committed source package with scripts/build-node-upgrade.mjs first.' >&2;exit 2; }
node -e 'const fs=require("node:fs"),c=require("node:crypto"),p=require("node:path"),r=process.argv[1],m=JSON.parse(fs.readFileSync(p.join(r,"manifest.json")));if(c.createHash("sha256").update(fs.readFileSync(p.join(r,"upgrader.mjs"))).digest("hex")!==m.engineSha256)process.exit(1)' "$root" || { echo 'STOP: upgrader hash mismatch' >&2;exit 2; }
exec node "$root/upgrader.mjs" "$@" --package "$root"
