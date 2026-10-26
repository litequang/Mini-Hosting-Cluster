# MHC Full Installer TEST 0.3.9 — Android Acceptance Toolkit

**Foundation:** TEST 0.3.8. **Delivery type:** complete All-in-One ZIP for a NEW disposable Termux aarch64 phone, or code-only upgrade on a previously installed disposable TEST 0.3.x LAB device. **Not production.**

## New

1. `mhc-full accept check` — local operational inspection with explicit PASS/WARN/BLOCKED/SKIP per observation: Termux architecture/prefix, install marker, production/HA footprints, commands, free disk, PHP modules, managed Nginx and PHP-FPM configuration syntax, MariaDB local socket `SELECT 1`, managed runit services, registered websites, latest snapshot checksum verification and HA unsupported flag.
2. `mhc-full accept check --json` — machine-readable results from strictly enumerated observation keys, not environment dumps.
3. `mhc-full accept site SLUG HOST` — registered-vhost-only HTTP smoke request to `127.0.0.1:18080`; no public URL or arbitrary host fetch and no execution/provisioning of PHP. HTTP success is not WordPress end-to-end acceptance.
4. `mhc-full accept report` — mode `0600` dated JSON under `~/.config/mhc-full-installer/acceptance-reports`, with environment/identity secrets omitted, no command outputs, raw DB results or webpage bodies. Review manually before sharing.
5. Android on-device acceptance checklist and two-LAB-node runbook with separate evidence categories and criteria for withholding sign-off.
6. Installer version/upgrade recognition and generated backup INFO version updated to TEST 0.3.9. All prior static/WordPress hosting, Panel, inventory, clone, restore lab, telemetry components carried forward.
7. Automated tests for synthetic environment, refused production/HA footprint, redacted JSON+permissions, loopback-only HTTP, site registry constraints, Host mismatch and symlink record guard.

## Explicit limits

- Real Android acceptance **NOT EXECUTED** in the build environment. No physical Termux phone, PHP-FPM, MariaDB or Cloudflare credentials accessed.
- `accept` cannot certify app health, GTID convergence, filesystem replication, write fencing, Cloudflare routing, successful disaster recovery or real Standby readiness.
- `accept check` is diagnostic, not a pass/fail release gate. Its process exit code 0 means diagnostics completed, **not** that every check passed. Inspect individual statuses.
- Configuration syntax tests may open their own standard managed Nginx/PHP log files; no database write or service start/stop is performed.
- Existing backup caveat unchanged: SQL and file archives are **not guaranteed atomic**, and snapshots contain private site/DB data.
- SSH enrollment and snapshot clone are still LAB-only and cannot be used to promote any Primary. Panel remains local and read-only for HA status.
- Never install/upgrade this on live M51 or X7b. Never run other vendored HA services to try to satisfy `ha-promotion` check.

## Safety preserved

No DB migrations, Tunnel/DNS modifications, ARM/fencing operation, site deployments or runtime restarts in the new acceptance scripts. Installer `--upgrade` remains restricted to known LAB marker, excludes live TPP/HA configuration, and backs up managed scripts only.
