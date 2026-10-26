# TEST 0.5.0B4 — Isolated LAB write-path adapters

## What is delivered

This is an **offline testing mechanism**, not application/database fencing. It extends B3's canary-only file guard to three more purpose-built fixture categories:

| Adapter | CLI command | LAB subfolder | Per-write limit | Effect |
|---|---|---|---:|---|
| Canary | `canary-write` | `canaries` | 64 KiB | Random private `.bin` fixture |
| Static preview | `preview-write` | `static-preview` | 64 KiB | Random private `.html` fixture; NOT hosted |
| Upload fixture | `upload-fixture` | `upload-fixtures` | 256 KiB | Random private `.bin` fixture; NOT user uploads |
| Job receipt | `job-receipt` | `job-receipts` | 8 KiB | Random private `.json` fixture; NO cron/job executed |

All four are stored **only** under `$HOME/mhc-writegate-lab` on a separate clean LAB host, with private directory permissions and randomly generated names. A local audit journal logs category, epoch, timestamp, payload size and SHA-256, never the payload. Each adapter has a limit of 24 published artifacts; the code does not provide delete, replace, open routing, SQL, remote transfer or source-selected destination paths.

## Exact flow

1. Verify clean LAB: reject any known production/HA marker or registered MHC website.
2. Verify directory permissions, expected fixture filenames, no symlinks/hardlinks, file count and size limit.
3. Read private node credential; ask configured HTTPS witness to verify current lease and epoch (fail closed).
4. Write fsynced exclusive temporary file with restrictive mode under the private adapter directory.
5. Re-verify lease against witness; reject if epoch has changed.
6. Re-check LAB conditions and directory, then `rename` the temporary file under a new random, private filename.
7. Append diagnostic-only local audit journal. Error after publish must be treated as **manual review**, not as a successful fenced transaction.

There is no `await` between final check and publish, but it is **not an atomic fencing primitive**, nor a guarantee that the lease remains valid until durable commit. These fixtures share the same OS user/host and are not authoritative write isolation.

## Example (clean disposable LAB ONLY)

```
~/mhc-full write-gate plan
~/mhc-full witness plan
~/mhc-full write-gate init --confirm=ISOLATED_CANARY_WRITE_ONLY
printf '<h1>LAB preview only</h1>\n' | ~/mhc-full write-gate preview-write --confirm=ISOLATED_LAB_WRITE_ONLY
printf 'FAKE upload fixture\n' | ~/mhc-full write-gate upload-fixture --confirm=ISOLATED_LAB_WRITE_ONLY
printf '{"job":"lab","result":"ok"}\n' | ~/mhc-full write-gate job-receipt --confirm=ISOLATED_LAB_WRITE_ONLY
~/mhc-full write-gate status
```

Precondition: a separately configured Cloudflare LAB witness under private `~/.config/mhc-witness-lab/client.json` and `node-token` is required for writes. `plan` is read-only. Do not run `init` on Vsmart containing `demo`, M51, X7b, WordPress or TPP servers.

## Remaining uncovered production write paths (9 groups)

1. Nginx/public ingress and HTTP mutation
2. WordPress/PHP application execution
3. MariaDB SQL sessions and admin users
4. Real Sheet/Sheet+, WordPress and site uploads
5. Hosting Panel mutations and file editor
6. Live cron, jobs and background processes
7. SSH/local shell writers
8. Backup restore/replica apply
9. Cloudflare routing and tunnels

**No production write path is guarded by this release.** Neither v0.5 Manual Switchover nor v0.6 Auto Failover can be enabled. Witness is not deployed automatically, not verified against real Cloudflare or Android, and there is no independent hardware/process fence. Do not interpret `LAB_*_WRITTEN` as HA readiness.

## Validation

`node tests/write-path-gate-lab.mjs "$PWD"` (B3 regression) and `node tests/write-adapters-b4.mjs "$PWD"` (B4). The B4 tests use a fake witness and a temporary HOME; they assert fail-closed on a lost witness, lease refusal, changed term/epoch, wrong confirmation, unsafe directory, symlinks, quota, oversized input, production markers and prohibited action names.

## Rollback

`bash install.sh --upgrade` on the existing TEST Vsmart only copies managed code after passing preflight/tests and retains the previous bin/launcher/marker under `.local/share/mhc-full-installer/rollback/`. It does not automatically update the original Panel 9090; run `~/mhc-full hosting-panel plan` then `apply` only after verification, save `ROLLBACK_ID`, and separately `sv restart amh-panel` if required. Never run `install.sh --install` on an installed phone.
