# Nâng cấp MHC Vsmart LAB — TEST 0.4.0C3

C3 is a **source-only** upgrade; do not call `checkpoint-create`/`apply-offline` on Vsmart with registered `demo` site. No restart of MariaDB, Nginx, SSH or Cloudflare is required.

## Windows PowerShell

```powershell
scp -P 8022 "$env:USERPROFILE\Downloads\MHC-Full-Installer-TEST-0.4.0C3.zip" "u0_a180@192.168.100.27:~/"
```

## Termux on Vsmart

```bash
mkdir -p ~/mhc-test-040c3
unzip -q ~/MHC-Full-Installer-TEST-0.4.0C3.zip -d ~/mhc-test-040c3
cd ~/mhc-test-040c3/MHC-Full-Installer
bash bin/self-test.sh
bash install.sh --upgrade
```

Confirm with `TEST_SOURCE_ONLY_UPGRADE` only after tests pass. `install.sh --plan` is for **clean-install eligibility**, not the source-only upgrade and may legitimately show STOP flags on a configured TEST phone.

```bash
~/mhc-full doctor
~/mhc-full file-sync consistent-status
~/mhc-full serve probe-static demo local.test
```

`consistent-status` may show `NOT_CONFIGURED` or refuse because a LAB site is registered; this is **expected**, not a reason to bypass the guard.

## Optional original Panel 9090 update

```bash
~/mhc-full hosting-panel plan
```

Only if PASS / no STOP, run `~/mhc-full hosting-panel apply`, confirm `UPGRADE_ORIGINAL_PANEL_LAB`, SAVE the returned `ROLLBACK_ID`, then `sv restart amh-panel` and check `sv status amh-panel`. Existing Panel credentials and hosting data are preserved by the LAB source-only upgrade. To roll back UI, use `~/mhc-full hosting-panel rollback ROLLBACK_ID` per Panel tool help. Never apply TEST on M51/X7b production.
