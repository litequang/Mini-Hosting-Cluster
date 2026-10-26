# MHC TEST 0.5.0C-MANUAL-PRIMARY

## Scope
Manual Primary Selection on original Panel 9090 and CLI. No continuous replication required. Persistent two-step handoff record; admin manually performs backup/restore, stops old writer, tests target and updates Cloudflare routing. CSRF-protected Panel API; controller-enrolled targets; explicit confirmations, 1-hour operation TTL, manual abort, sanitized journal. Marked OPERATOR_RECORDED_ONLY. No remote service control, automatic DNS update, HA, hard fencing or live routing verification.

Installer marker corrected, accepts WRITER-AUDIT and new marker; source-only upgrade and rollback retained.
