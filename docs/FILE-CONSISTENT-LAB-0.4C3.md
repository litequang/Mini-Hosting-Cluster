# v0.4C.3 — GTID + file checkpoint, OFFLINE versioned LAB apply

> STRICTLY LAB. This is **operator-attested quiescence evidence**, not a guaranteed atomic database/filesystem snapshot, not canonical replication and never standby/HA readiness. It does not apply changes to served files or MariaDB.

## Preconditions

- Two **dedicated disposable** Android Termux TEST devices, neither M51/X7b production nor Vsmart if Vsmart hosts `demo` or any other registered site. Fully separate MariaDB LAB instances with no production databases.
- TEST 0.4.0C3 on both, C1 baseline/delta and C2 pinned SSH peer configured. Confirm receiver's previous `replica/` is the exact baseline of source's delta. Do not circumvent symlink/traversal guards.
- SOURCE LAB: manually stop *every* application, cron job, root/privileged DB writer, upload, file sync and other source writer; enable MariaDB read-only as appropriate for isolated disposable instance. `read_only=ON` is **not** comprehensive fencing of privileged writers. No network/HA/Cloudflare switch occurs.
- RECEIVER LAB: properly seeded, dedicated read-only MariaDB replica whose `gtid_slave_pos` equals the desired source checkpoint; stop receiver SQL apply thread *manually via a reviewed LAB-specific runbook* before final staging, so GTID stays unchanged while producing an offline version. Do not stop production replication or modify production DB. The C3 program never stops threads or executes MariaDB write SQL.

## Sequence

1. Receiver: prepare `replica/` and `file-sync manifest replica`, securely deliver baseline manifest to source, as in `docs/FILE-PEER-LAB-0.4C2.md`.
2. Source: after all application/DB/filesystem writes are quiesced, build `file-sync bundle BASELINE.json`, identify the returned `delta-ID`. **Before `peer-send`**, create C3 checkpoint:

```bash
~/mhc-full file-sync checkpoint-create delta-ID --confirm=QUIESCED_LAB_ONLY
~/mhc-full file-sync verify-outbox delta-ID
~/mhc-full file-sync peer-send delta-ID
```

3. Receiver: C2 must have finalized and verified exactly that transfer, and written a receipt containing `checkpointSha256`:

```bash
~/mhc-full file-sync verify delta-ID
~/mhc-full file-sync stage delta-ID
~/mhc-full file-sync apply-plan delta-ID
```

4. **Only on disposable LAB** with an approved read-only/GTID state and a PASS plan, manually run:

```bash
~/mhc-full file-sync apply-offline delta-ID --confirm=OFFLINE_LAB_APPLY
~/mhc-full file-sync consistent-status
```

5. Resulting **offline** candidate version is at `~/mhc-file-lab/applied/delta-ID/`. The original `~/mhc-file-lab/replica/` is untouched, and files deleted in the new version are only absent from this *new offline copy*. Private report `~/mhc-file-lab/reports/delta-ID-c3-offline.json` is not a live deployment ticket.

### STOP conditions

- Missing/mismatched C2 receiver receipt/checkpoint SHA, missing C3 checkpoint, changed package, candidate or baseline; symlink/unsafe path, production/HA/cluster footprint or registered site.
- MariaDB no longer read-only, empty/invalid GTID, source GTID changed across scan, exact replica `gtid_slave_pos` does not match checkpoint, receiver GTID advances while copying.
- Existing `applied/<delta-id>`: no overwrite. If an unexpected partial failure occurred after directory publish and before journal, **inspect manually**; never remove a safety marker to force a retry.

## Proof limits and roadmap

C3 proves only that a specific private candidate file tree matches a checkpoint manifest **and** a local MariaDB observer reported the same GTID at the check times. It does not prove that cross-resource writes were suspended at all times, that the DB contains the correct application's state, that the data can serve production, or that no node can write simultaneously. Prior to v0.5 manual switchover still required: real GTID and file replication validation on two Android LAB devices, coordinated write ingress/fencing, live catch-up replay and network partition tests.

Panel 9090 → Cluster shows **offline version count only**, no file names, GTID positions, secrets or Primary controls.
