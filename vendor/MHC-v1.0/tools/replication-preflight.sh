#!/data/data/com.termux/files/usr/bin/bash
# Read-only diagnostics; does NOT enable binlogs, change MariaDB or create credentials.
set -Eeuo pipefail
[[ "${PREFIX:-}" == '/data/data/com.termux/files/usr' ]] || { echo 'Termux only';exit 1; }
echo '=== DATABASE REPLICATION READINESS (READ-ONLY) ==='
mariadb --no-defaults -u root -N -B -e "SHOW GLOBAL VARIABLES WHERE Variable_name IN ('version','server_id','log_bin','log_slave_updates','gtid_strict_mode','read_only','binlog_format');" || exit 1
echo '=== MASTER STATUS ==='
mariadb --no-defaults -u root -e 'SHOW MASTER STATUS;' || true
echo '=== REPLICA STATUS ==='
mariadb --no-defaults -u root -e 'SHOW SLAVE STATUS\G' 2>&1 || true
echo '=== GTID POSITIONS ==='
mariadb --no-defaults -u root -N -B -e "SELECT @@global.gtid_binlog_pos, @@global.gtid_slave_pos, @@global.gtid_current_pos;" 2>&1 || true
cat <<'HELP'
Nothing was changed. REQUIREMENTS before enabling auto failover:
- unique server_id, log_bin, consistent GTID configuration, MariaDB version compatibility;
- monitored replication SQL/IO healthy, no divergence, file assets continuously synced;
- accept asynchronous replication's non-zero/unknown RPO or deploy a genuine synchronous HA stack.
Never point a snapshot-only secondary at a live master without a proper GTID/reseed plan.
HELP
