# TEST 0.5.0C-INTEGRATION — Upgrade Vsmart (source-only)

**Vsmart**: TEST LAB machine `192.168.100.27` SSH port 8022, user `u0_a180`. **Never run full `--install`** on this existing Termux host. M51 and X7b production must remain untouched.

Download ZIP on Windows to Downloads; in PowerShell:

```
scp -P 8022 "$env:USERPROFILE\Downloads\MHC-Full-Installer-TEST-0.5.0C-INTEGRATION.zip" "u0_a180@192.168.100.27:~/"
```

In Vsmart Termux (do not remove or tamper with safety markers):

```
mkdir -p ~/mhc-test-05c-integration
unzip -q ~/MHC-Full-Installer-TEST-0.5.0C-INTEGRATION.zip -d ~/mhc-test-05c-integration
cd ~/mhc-test-05c-integration/MHC-Full-Installer
bash bin/self-test.sh
bash install.sh --upgrade
```

If preflight reports STOP, **do not proceed**. Confirm only with exact text `TEST_SOURCE_ONLY_UPGRADE` if checks pass. Existing MHC code is backed up in `~/.local/share/mhc-full-installer/rollback/<id>/`; website `demo`, MariaDB, PHP/Nginx runtime and existing Panel sessions are not restarted by source upgrade.

Post-update read-only checks:

```
~/mhc-full doctor
~/mhc-full serve probe-static demo local.test
~/mhc-full switchover-e2e plan
~/mhc-full switchover-e2e status
~/mhc-full switchover-readiness plan
```

**Do NOT run `switchover-e2e run` on Vsmart with `demo` registered.** Run is for disposable LAB without registered sites; the code enforces this. No MariaDB/Cloudflare/router changes are performed by this release.

Original Panel 9090 integration is separate and optional: `~/mhc-full hosting-panel plan`, inspect the report; only on PASS run `hosting-panel apply`, save `ROLLBACK_ID`, then `sv restart amh-panel`. To undo use the documented `hosting-panel rollback ROLLBACK_ID` confirmation mechanism. This never replaces 9090 with 19090.
