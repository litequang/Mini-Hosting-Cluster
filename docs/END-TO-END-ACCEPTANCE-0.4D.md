# v0.4D — Android LAB end-to-end acceptance gate

**This is a guarded, read-only evidence collector, not a network emulator, not a deployment tool and not a v0.5 promotion gate.** The source/replica must be two separate disposable Termux devices with isolated `mhc_lab_*` MariaDB instances and no registered websites, Cloudflare Tunnel, HA configuration or real production DB. Do not perform this scenario on M51/X7b or on the Vsmart serving `demo`.

## What was coded

`mhc-full lab-accept` now records (on the **receiver LAB only**) a strictly ordered, private local journal. It relies on existing B4 GTID read-only replica checks and C1/C2/C3 offline file proofs:

1. `baseline PRIVATE_PROOF_A` — require a real MariaDB `Slave_Pos`, receiver IO+SQL healthy, and source transaction A **applied and readable**.
2. `disconnected` — require MariaDB to report one replica channel with IO explicitly down. The operator disrupts the **dedicated LAB tunnel** outside MHC, never the phone's SSH management session.
3. While IO is down, use B4 `source-probe mhc_lab_... --confirm=WRITE_DEDICATED_GTID_LAB_PROBE` on the isolated **source LAB**. Deliver the fresh private proof B to the receiver over an authenticated SSH transfer (do not paste it into chat). MHC does not disrupt/reconnect the network.
4. Restore the isolated LAB replication tunnel externally. After replica catches up, run `recovered PRIVATE_PROOF_B --confirm=SECOND_SOURCE_PROBE_CREATED_DURING_OUTAGE`. The gate rejects the same proof as baseline and requires second source GTID progression, readback and running IO+SQL.
5. After completing the separate C1/C2/C3 workflow on the same disposable receiver, run `files DELTA_ID` to independently rehash every file of the C3 offline version and compare it with the exact C1 next manifest, C2 verified checkpoint receipt and C3 private report. This requires C3 to have been produced at a **matching quiesced GTID checkpoint**, so organize the file workflow around the appropriate checkpoint. It does not reapply anything or touch serving files.
6. `report` returns a **sanitized summary** without row values, passwords, SQL dumps, filenames, GTIDs or remote hostnames. It marks stale (>48h), incomplete, or altered evidence. Even full completion is labelled `LAB_EVIDENCE_COMPLETE_HUMAN_REVIEW_REQUIRED`.

Commands on the **receiver** (paths are illustrative; replace with actual private proof files under HOME):

```bash
~/mhc-full lab-accept baseline "$HOME/private/proof-A.json"
# Manually interrupt ONLY the isolated LAB replica transport, observe MariaDB IO down
~/mhc-full lab-accept disconnected
# Create proof B on the separate source LAB while disconnected; securely transfer it
# Manually reconnect LAB; confirm IO+SQL running and row B on replica
~/mhc-full lab-accept recovered "$HOME/private/proof-B.json" --confirm=SECOND_SOURCE_PROBE_CREATED_DURING_OUTAGE
# After C3 offline version has been created and verified
~/mhc-full lab-accept files delta-<actual-id>
~/mhc-full lab-accept report
```

### Limits and STOP conditions

- **No automatic outage** is introduced. No SSH/replication service is stopped by `lab-accept`. Use a separate LAB transport, never cut the only remote-management connection.
- The source proof timing during the outage is **operator-attested**, not independently timestamp-verified across both Android clocks. The journal itself is editable by the device account and is not a hardware attestation or cloud-signed evidence.
- The C3 offline file version and source/replica GTID checks are **separate observations**, not an atomic database+filesystem snapshot; no complete DB parity, read/write fencing, verified replication durability, canonical WordPress restore or HA cutover is proved.
- Private journal is stored in `~/.local/share/mhc-full-installer/d-acceptance/receiver.json` (0600). Do **not** upload raw proof files or journal into chat. Journal cannot be overwritten/restarted automatically. If interrupted, inspect before planning a new disposable LAB.
- Any missing/checksum-altered file, wrong proof, down SQL thread, IO status unknown, no GTID progression, managed website, `ha.json`, cluster identity, or partial install triggers rejection.
- Completion is **not** authorization for Primary/auto failover. v0.5 continues to require independent recovery, writer ingress gate + lease fencing, routing checks and partition testing on Android LAB.

## LAB acceptance checklist

- [ ] Both devices are physically separate isolated Termux LABs, individually backed up, no web users or privileged writers
- [ ] B4: two distinct source writes and replica-applied GTIDs with an observed IO outage between them
- [ ] C2: truncated transfer resumes, final receipt tied to expected delta/host key
- [ ] C3: checkpoint equals the exact received delta and offline file version, changes/deletions reflect manifest
- [ ] Two-node network partition, slow transfer, checksum corruption and reconnection tested and documented independently
- [ ] Full SQL+Sheet/Sheet+ restore tested into isolated DB/files, not merely row and manifest proof
- [ ] Android Doze/background process and separate WAN failure tested
- [ ] Administrator reviews actual read-only reports and operational logs before v0.5 design work

All boxes **require real device results**. A passing Linux self-test cannot mark them complete.
