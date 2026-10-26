# TEST 0.5.0C-AUTO-PRIMARY-LAB

- Operator-controlled manual selection inside original 9090 Panel. No GTID replication requirement, backup/restore performed by operator, no automatic health proof.
- Auto-election observer: recent authenticated member heartbeat; freshest known snapshot label; free disk and RAM tiebreaker. Explicit warnings for unknown live data.
- Automatic standalone controller tick opt-in (recommendation-only default) with private configuration and disk mutex.
- Optional high-risk BEST_EFFORT_ROUTE mode is supported in code only with explicit risk acknowledgment, independent controller, old-node rejoin-guard declaration and predeclared Cloudflare Tunnel CNAMEs. `tick` performs Cloudflare GET/PATCH/GET to verify route, then records Primary. No default activation, no automatic installation or production permission.
- Old node quarantined in controller inventory after successful route switch; it does not physically stop remote MariaDB without a separately deployed guard.
- Independent controller required: if controller shares failed Primary the election cannot run. No fencing guarantee; split-brain/data loss risk.
