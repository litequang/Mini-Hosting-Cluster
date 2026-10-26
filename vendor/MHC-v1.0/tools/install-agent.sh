#!/data/data/com.termux/files/usr/bin/bash
# Install in SHADOW MODE only. Never touches current ~/mhc or production services.
set -Eeuo pipefail
[[ "${PREFIX:-}" == '/data/data/com.termux/files/usr' ]] || { echo 'Run on Termux';exit 1; }
ROOT="$HOME/mhc-v1";SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ ! -f "$ROOT/config.json" ]] || { echo "Config already exists at $ROOT/config.json; upgrade agent files manually; refuse overwrite";exit 1; }
SV="$PREFIX/var/service"
for name in mhc-v1-agent mhc-v1-gateway;do
 if [[ -e "$SV/$name" || -L "$SV/$name" ]];then echo "Service $name already exists; refusing overwrite";exit 1;fi
done
mkdir -p "$ROOT/agent" "$ROOT/logs";chmod 700 "$ROOT" "$ROOT/logs"
cp "$SRC/agent/"*.mjs "$ROOT/agent/"
NODE_ID="${MHC_NODE_ID:-}"
CONTROL="${MHC_CONTROL_URL:-}"
TOKEN="${MHC_NODE_TOKEN:-}"
EDGE="${MHC_EDGE_SECRET:-}"
if [[ -z "$NODE_ID" ]];then read -r -p 'Existing MHC Node ID (UUID or alias): ' NODE_ID;fi
if [[ -z "$CONTROL" ]];then read -r -p 'Coordinator URL (https://...workers.dev): ' CONTROL;fi
if [[ -z "$TOKEN" ]];then read -r -s -p 'Node token (input hidden): ' TOKEN;echo;fi
if [[ -z "$EDGE" ]];then read -r -s -p 'Shared edge secret (input hidden): ' EDGE;echo;fi
export MHC_NODE_ID="$NODE_ID" MHC_CONTROL_URL="$CONTROL" MHC_NODE_TOKEN="$TOKEN" MHC_EDGE_SECRET="$EDGE"
[[ "$NODE_ID" =~ ^[a-zA-Z0-9_-]{2,64}$ && "$CONTROL" == https://* && -n "$TOKEN" && -n "$EDGE" ]] || { echo 'Set MHC_NODE_ID, MHC_CONTROL_URL (https://...), MHC_NODE_TOKEN, MHC_EDGE_SECRET in environment first';exit 1; }
node - "$ROOT/config.json" <<'NODE'
const fs=require('fs');const c={nodeId:process.env.MHC_NODE_ID,controlUrl:process.env.MHC_CONTROL_URL,
 token:process.env.MHC_NODE_TOKEN,edgeSecret:process.env.MHC_EDGE_SECRET,
 armed:false,replicationMode:'snapshot',protectDatabase:true,
 siteService:'mini-web',gatewayPort:3070,appPort:3000};
fs.writeFileSync(process.argv[2],JSON.stringify(c,null,2)+'\n',{mode:0o600});
NODE
cat > "$ROOT/start-agent.sh" <<'SH'
#!/data/data/com.termux/files/usr/bin/bash
exec node "$HOME/mhc-v1/agent/daemon.mjs"
SH
cat > "$ROOT/start-gateway.sh" <<'SH'
#!/data/data/com.termux/files/usr/bin/bash
exec node "$HOME/mhc-v1/agent/gateway.mjs"
SH
chmod 700 "$ROOT/"*.sh
for name in mhc-v1-agent mhc-v1-gateway;do
 mkdir -p "$SV/$name/log" "$PREFIX/var/log/sv/$name"
  printf '#!/data/data/com.termux/files/usr/bin/bash\nexec svlogd -tt "%s"\n' "$PREFIX/var/log/sv/$name" > "$SV/$name/log/run"
 if [[ "$name" == mhc-v1-agent ]];then entry=start-agent;else entry=start-gateway;fi
 printf '#!/data/data/com.termux/files/usr/bin/bash\nexec "%s/%s.sh"\n' "$ROOT" "$entry" > "$SV/$name/run"
 chmod 755 "$SV/$name/run" "$SV/$name/log/run"
 touch "$SV/$name/down"
done
echo "INSTALLED IN SHADOW MODE (armed=false). Existing Mini Hosting NOT modified."
echo "Run: sv-enable mhc-v1-agent mhc-v1-gateway; sv up mhc-v1-agent; sv up mhc-v1-gateway"
echo "Before ARM: dedicated origin tunnels, Worker route, and Nginx gateway cutover must be ready."
