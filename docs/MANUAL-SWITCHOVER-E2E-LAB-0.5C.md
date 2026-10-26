# TEST 0.5.0C-INTEGRATION — v0.5C E2E HTTP handoff drill (SYNTHETIC ONLY)

## Why this exists
v0.5C-LAB had readiness reports and a separate gated HTTP/MariaDB LAB endpoint, but no executable, ordered end-to-end web traffic handoff. This release adds an **actual local HTTP** integration drill with two entirely synthetic applications and a local ingress process. They live in **one Node.js process on a single localhost**, not on different Android devices.

This is NOT a MariaDB primary switchover, witness lease handoff, independent fencing, two Android nodes, public route switch or zero-data-loss guarantee. Do not mark v0.5C production-ready based on its output.

## Safe commands

```
~/mhc-full switchover-e2e plan
~/mhc-full switchover-e2e status
```

On a **disposable Android LAB node with completed MHC TEST marker and NO registered sites or production/HA footprint**, run ONLY after understanding the scope:

```
~/mhc-full switchover-e2e run --confirm=RUN_SYNTHETIC_LOOPBACK_SWITCHOVER_ONLY
~/mhc-full switchover-e2e status
```

`run` is denied when it detects registered MHC websites, Thờ Phượng Pro `.env`, HA files, incomplete installation or an untrusted installer marker. On Vsmart with registered `demo`, use `plan`/`status` only; do not bypass this guard.

## Technical sequence

1. Open **three** ephemeral HTTP listeners bound to `127.0.0.1` (synthetic node A, synthetic node B, and a synthetic ingress). An ephemeral secret authorizes requests. No public/Cloudflare/Nginx ports are used.
2. Ingress writes fixture `a1` to synthetic A, verifying HTTP 201.
3. Freeze synthetic ingress; verify another ingress write gets HTTP 503.
4. Demonstrate that source A could STILL write directly before fencing: synthetic A receives `a2` and increments its in-memory event sequence.
5. Copy the mock event sequence to B, compute SHA-256 of fixture records, and require equality. This is NOT MariaDB GTID nor atomic DB/Sheet snapshot.
6. Fence A *within the mock process*; verify HTTP 423 on a direct write to A. If the fence fails, stop and freeze route.
7. Increment mock lease term, select B in **synthetic** ingress, verify HTTP 201 through B and HTTP 423 from A.
8. Simulate witness failure; verify further ingress write gets HTTP 503.
9. Save a private JSON report with SHA-256 hash-linked events and an explicit statement `canSwitchPrimary:false` / `haEligible:false`.

## Failure gates verified
- Old writer still accepts direct writes → abort before changing mock route.
- Mismatched event sequence/hash → abort.
- Witness unavailable at handoff → abort.
- Crash after old-writer fencing → route stays frozen; no attempt to auto-promote/fail back.
- Stale/forged journal or unsafe permissions/symlink → reject status.
- Parallel `run` on the same LAB home directory → refuse via private exclusive lock.

Private report: `~/mhc-switchover-e2e-lab/report.json` (directory 0700; file 0600). The SHA hash chain is a local accidental-change detector, **not a digital signature or trusted external attestation**. No secrets or individual fixture contents are returned by Panel 9090.

## Remaining mandatory evidence for actual v0.5C
- Two separate, disposable Android Termux nodes, distinct MariaDB `server_id` and consistent seed snapshot.
- Observed actual source/replica GTID, data A before disconnect and data B written while disconnected; verify catch-up with no divergence.
- File/Sheet incremental transfer and SHA-256 offline apply, with a reproducible restore drill and write-quiesce boundary.
- Deployed durable witness in a dedicated Cloudflare LAB account/namespace and externally verified fencing (not just app-level checks).
- No bypass writer paths through MariaDB superusers/Unix sockets, PHP cron, shell, uploads or direct HTTP. Prove independently that the old writer has stopped before enabling a new writer.
- An isolated HTTP test hostname and approved manual route rollback process, never an existing Thờ Phượng Pro domain.

**No real manual switchover executor is included.** This release tests protocol ordering with real localhost HTTP, not correctness of real distributed fencing or MariaDB failover.
