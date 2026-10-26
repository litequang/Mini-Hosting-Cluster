# MHC TEST 0.5.0B3 — Release notes

## Added
- `bin/write-path-gate-lab.mjs`, `~/mhc-full write-gate plan|status|init|canary-write` with strict LAB-only canary scope.
- Witness verification required twice per isolated canary write, checking same epoch and failing closed on errors.
- Max 64 KiB input; private LAB root; symlink, permissions, existing-site, production-footprint guards; no overwrites.
- Read-only authenticated `/api/mhc/write-paths` response in original Panel 9090, with 9 groups explicitly NOT enforced; Cluster UI coverage summary.
- `tests/write-path-gate-lab.mjs`, including simulated lease/network failures and positive canary commitment.
- Installer, Lab node marker and Panel version labels advanced to B3; previous TEST markers remain recognized.

## Explicitly unchanged
- Existing Website `demo`, MariaDB data, PHP-FPM, Nginx, rUnIt services, port 9090 admin password, Cloudflare, HA and production M51/X7b.
- Live application/database/filesystem writes are **not** gated. No automatic promote, switch, stop, restore, replication, direct SQL write, network or tunnel change.
- No witness deployment or actual Cloudflare transaction validation in this release.

## Validation
Linux source and clean extracted ZIP self-test. Mocked witness; Android runtime and Cloudflare deployment NOT performed.

## Upgrade TEST Vsmart source only
Copy the ZIP to Vsmart, extract, run `bash bin/self-test.sh`, then `bash install.sh --upgrade` and confirm `TEST_SOURCE_ONLY_UPGRADE` only if checks PASS. Keep the returned rollback directory. Optional original Panel UI update: `~/mhc-full hosting-panel plan`, then confirmed `apply`, save `ROLLBACK_ID`, `sv restart amh-panel` (only that service). Do NOT run canary mutations on Vsmart.
