# MHC Full Installer TEST 0.3.9.1 — Hotfix

Date: 2026-10-25. Based on TEST 0.3.9, no HA activation and no production deployment.

## Root causes from Vsmart Termux log

1. The Node SQL lab importer rejected Termux because `process.platform` was checked against `linux` only; Termux Node can return `android`. Now accepts only `linux` or `android` for this preexisting guard. **This is not proof of a real MariaDB restore.**
2. The vendored cluster installer attempted `sv-enable mhc-dashboard` while runit had not attached to the newly-created service; its nonzero exit aborted the parent installer before writing `~/mhc-full`, leaving `install-incomplete`. The vendored installer now emits a warning and defers dashboard activation rather than breaking installation. No HA agent is enabled as a result.
3. Several release-marker guards still excluded 0.3.9 (`node-enroll`, `node-clone`, `node-readiness`, heartbeat service). Now accept TEST 0.3.9 and 0.3.9.1 alongside earlier supported releases.

## Recovery on a disposable LAB only

- `bash install.sh --recover-lab-plan`: read-only checks of incomplete marker, LAB footprint, Vhost/Panel, local SQL connectivity, required service scripts and absence of production data/tunnels/HA.
- `bash install.sh --recover-lab`: requires interactive phrase `RECOVER_PARTIAL_LAB_SOURCE_ONLY`, reruns synthetic source tests and stages only the MHC Full scripts + launcher. The incomplete marker is removed at the final step; old baseline services, databases, Cloudflare routes, HA modes and role state remain untouched.
- Recovery refuses unknown/changed state, pre-existing active websites or markers, missing baseline, running web/tunnel, or an already present MHC Full launcher. No blind resume. Legacy `mhc-dashboard` runit supervision may need separate inspection; this path never enables it.

## Known limitations

- Fix verified with Linux source tests only. There is no proof of recovery performed on Vsmart until the user runs on-device checks.
- The legacy baseline still targets a Thờ Phượng Pro-shaped Nginx vhost (local only); it is **not** production WordPress hosting.
- HA, GTID, file replication, WordPress PHP-FPM and 24h backup reliability remain unvalidated. Do not run this on M51/X7b production.
