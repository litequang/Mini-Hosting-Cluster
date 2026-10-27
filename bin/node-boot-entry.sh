#!/data/data/com.termux/files/usr/bin/sh
# mhc-node-boot-canonical-v1: one supervisor entry; no standalone sshd invocation.
exec /data/data/com.termux/files/usr/bin/bash "$HOME/.local/share/mhc-full-installer/bin/node-boot.sh" --once
