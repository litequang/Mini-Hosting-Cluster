# MHC TEST 0.4.0D — Changelog

Built from TEST 0.4.0C3, preserving the All-in-One installer and original Panel 9090.

**New:** `mhc-full lab-accept baseline|disconnected|recovered|files|report` for isolated replica LAB. Read-only acceptance journal requires two distinct B4 GTID source probes and explicit observed IO disconnection; reconnected replica must read the second probe and advance GTID. It independently rehashes C3 offline file version against C1 manifest, C2 receipt/checkpoint and C3 private report, detecting later tampering. Includes guarded phase ordering, production/registered-site refusal, 0600 journal, stale reporting and sanitized summary. Original Panel 9090 adds an informational E2E acceptance tile under Cluster (no control actions). Tests include 23 new assertions.

**Security:** No SQL writes by the acceptance gate; no shell network disruption, SSH credentials, auto-promotion, file live apply, GTID auto attach, Cloudflare changes or production restoration. Operator attests when source proof B was created; report is not independent cross-device provenance or atomic DB+file proof.

**Unfinished:** Actual two-Android LAB replication acceptance, complete database parity, crash-safe live apply, cross-resource atomic snapshot, writer fencing, route authorization, manual/auto HA and failback. M51/X7b remain unchanged.
