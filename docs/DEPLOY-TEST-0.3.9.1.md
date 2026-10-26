# MHC TEST 0.3.9.1 — Vsmart LAB safe recovery

**Never use this recovery workflow on M51/X7b, phones with actual production websites, or a node configured for HA.** A successful preflight is not a backup or production authorization.

## Diagnosis

Known Vsmart state in log: clean-install marker exists (`~/.config/mhc-full-installer/install-incomplete`), `~/mhc-full` is missing, old bootstrap printed "BOOTSTRAP COMPLETE" and Panel returned localhost HTTP 200, then `sv-enable mhc-dashboard` failed. An independent `self-test` failed at `node-readiness` due to Termux platform mismatch. Do not rename/delete the marker or re-run `--install`.

## From Windows PowerShell

```powershell
scp -P 8022 "$env:USERPROFILE\Downloads\MHC-Full-Installer-TEST-0.3.9.1.zip" "u0_a180@192.168.100.27:~/"
ssh -p 8022 u0_a180@192.168.100.27
```

## On Vsmart Termux (not PowerShell)

```bash
mkdir -p ~/mhc-test-0391
unzip ~/MHC-Full-Installer-TEST-0.3.9.1.zip -d ~/mhc-test-0391
cd ~/mhc-test-0391/MHC-Full-Installer
node -p 'process.platform'   # commonly android
bash install.sh --recover-lab-plan
```

If the plan explicitly passes, and ONLY when this is a disposable test phone with no user website data:

```bash
bash install.sh --recover-lab
# At the prompt, type RECOVER_PARTIAL_LAB_SOURCE_ONLY
~/mhc-full doctor
~/mhc-full accept check
~/mhc-full cluster status
sv status mhc-dashboard mhc-ha named-tunnel 2>&1
```

The recovery command **does not** restart services or bootstrap underlying Termux packages; it just installs missing MHC Full CLI scripts, launcher and installed marker after checks. It does not make any node eligible for HA. `mhc-dashboard` may still be unsupervised; report its status before changing it. `mhc-ha` absent/down is not an error for this LAB.

If `--recover-lab-plan` stops, **do not** bypass its conditions, delete a marker, restore database or run the old DR installer. Share only the non-secret error line and redacted read-only service status.

## Fresh disposable phone

```bash
pkg update -y
pkg install -y nodejs unzip python
unzip MHC-Full-Installer-TEST-0.3.9.1.zip
cd MHC-Full-Installer
bash install.sh --plan
bash bin/self-test.sh
bash install.sh --install
```

Source-only upgrade from an already COMPLETED LAB TEST 0.3.x remains `bash install.sh --upgrade` after backup and preflight; it is **not** a way to recover a partial install.
