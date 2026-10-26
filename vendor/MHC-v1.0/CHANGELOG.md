# MHC v1.0 source release (2026-10-24)

- Built stand-alone Cloudflare Durable Object arbiter with persisted lease terms, fencing delay, manual/auto policy and preferred node.
- Built Node Termux agent with DB liveness and replica GTID probes, local watchdog lease, runit service protection, standby-sync pause and fail-closed behavior.
- Built HTTP/upgrade gated origin port 3070 and optional Cloudflare routing Worker.
- Built token-protected mobile admin page, PC controller, non-destructive Termux staging installer, explicit Nginx candidate/cutover, GTID diagnostics.
- Added regression tests; full Android / Cloudflare integration remains unverified.
- Did NOT rewrite or access MHC v0.2 source or the live phone filesystem; no user Cloudflare secrets accessed.
