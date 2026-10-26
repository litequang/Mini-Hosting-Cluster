#!/data/data/com.termux/files/usr/bin/bash
# Interactive token input on the node. Never pass the token in argv or stdout.
set -Eeuo pipefail
umask 077
cfg="$HOME/.config/mhc-full-installer"
[[ "${PREFIX:-}" == /data/data/com.termux/files/usr ]] || { echo 'STOP: Termux LAB required'; exit 1; }
[[ -f "$cfg/installed" && ! -L "$cfg" && ! -e "$cfg/install-incomplete" ]] || exit 1
[[ "$(cat "$cfg/installed")" == 'TEST 0.5.0C-REMOTE-PANEL installed on clean Termux' ]] || exit 1
for file in "$HOME/apps/thophuongpro/.env" "$HOME/.config/mini-hosting-cluster/ha.json" "$HOME/.config/mini-hosting-cluster/node.json"; do
 [[ ! -e "$file" ]] || { echo 'STOP: production footprint'; exit 1; }
done
[[ -t 0 ]] || { echo 'STOP: use an interactive SSH terminal'; exit 1; }
dir="$cfg/cloudflare-lab"
[[ ! -L "$dir" ]] || exit 1
mkdir -p -m 700 "$dir"
[[ "$(stat -c %a "$dir")" == 700 ]] || { echo 'STOP: private directory permissions required'; exit 1; }
file="$dir/tunnel-token"
[[ ! -e "$file" && ! -L "$file" ]] || { echo 'Token file already exists; kept unchanged.'; exit 1; }
read -r -s -p 'Paste ONLY the Tunnel token (hidden), then Enter: ' mhc_token
printf '\n'
trap 'unset mhc_token' EXIT
[[ ${#mhc_token} -ge 100 && ${#mhc_token} -le 4096 && "$mhc_token" =~ ^[A-Za-z0-9_+/=-]+$ ]] || { echo 'STOP: invalid token format; paste the token, not the installation command.'; exit 1; }
(set -C; printf '%s\n' "$mhc_token" > "$file")
unset mhc_token
echo 'Saved private Tunnel token. No service started; tell Codex the token is ready.'
