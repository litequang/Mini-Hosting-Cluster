#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf -- "$TMP"' EXIT
mkdir -p "$TMP/home/.local/share/mhc-full-installer/bin" "$TMP/fakebin"
cat > "$TMP/home/.local/share/mhc-full-installer/bin/system.sh" <<'SH'
#!/usr/bin/env bash
test "$SVDIR" = "$EXPECTED_SVDIR"
SH
cat > "$TMP/fakebin/sv" <<'SH'
#!/usr/bin/env bash
test "$SVDIR" = "$EXPECTED_SVDIR" || exit 1
echo "run: $2"
SH
chmod 700 "$TMP/home/.local/share/mhc-full-installer/bin/system.sh" "$TMP/fakebin/sv"
env -u SVDIR HOME="$TMP/home" PREFIX="$TMP/prefix" EXPECTED_SVDIR="$TMP/prefix/var/service" bash "$ROOT/bin/mhc-full-wrapper" system status
SVDIR="$TMP/custom" EXPECTED_SVDIR="$TMP/custom" HOME="$TMP/home" bash "$ROOT/bin/mhc-full-wrapper" system status
env -u SVDIR HOME="$TMP/home" PREFIX="$TMP/prefix" EXPECTED_SVDIR="$TMP/prefix/var/service" PATH="$TMP/fakebin:$PATH" bash "$ROOT/bin/site-serve.sh" status | grep -q 'run: mhc-full-wp-nginx'
echo 'PASS: SSH service lookup defaults correctly and preserves explicit SVDIR'
