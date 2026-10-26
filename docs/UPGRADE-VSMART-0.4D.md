# Vsmart LAB — upgrade source only to TEST 0.4.0D

Vsmart currently has a `demo` static website and live services. It is **NOT** an eligible `lab-accept` receiver/source and must NOT be used for SQL GTID tests, file apply or network outage testing. Only upgrade managed MHC scripts; keep Panel 9090, Nginx, MariaDB, `.env`, SSH, production/Cluster and tunnel unchanged.

## Transfer from Windows PowerShell

```powershell
scp -P 8022 "$env:USERPROFILE\Downloads\MHC-Full-Installer-TEST-0.4.0D.zip" "u0_a180@192.168.100.27:~/"
```

## In Vsmart Termux

```bash
mkdir -p ~/mhc-test-040d
unzip -q ~/MHC-Full-Installer-TEST-0.4.0D.zip -d ~/mhc-test-040d
cd ~/mhc-test-040d/MHC-Full-Installer
bash bin/self-test.sh
bash install.sh --upgrade
```

Type `TEST_SOURCE_ONLY_UPGRADE` only after the checks pass. This saves a prior managed-code rollback copy under `~/.local/share/mhc-full-installer/rollback/<stamp>/`. It does not install or initialize a second MariaDB, does not modify files in website `demo`, and does not restart runit.

```bash
~/mhc-full doctor
~/mhc-full serve probe-static demo local.test
```

To update the **original Panel 9090** (optional; snapshot existing Panel code and use its own rollback ID):

```bash
~/mhc-full hosting-panel plan
# ONLY when plan says PASS and has no STOP:
~/mhc-full hosting-panel apply
# Enter UPGRADE_ORIGINAL_PANEL_LAB, record ROLLBACK_ID
sv restart amh-panel
sv status amh-panel
```

The new v0.4D screen appears under Cluster when original Panel is upgraded. On Vsmart it is expected to show `NOT_OBSERVED`. Do not disable any safety guard to make it show PASS. No new Panel is created.

**STOP** on unsafe installer markers, existing HA or production context, errors during self-test or an unexpected attempt to restart MariaDB/Nginx/Tunnel. M51/X7b remain excluded.
