#!/data/data/com.termux/files/usr/bin/bash
# Build standby shadow DB + immutable app release; switch local symlink only after checks.
set -Eeuo pipefail
umask 077
ROOT="$HOME/standby-sync"
[[ -f "$ROOT/.standby-installed" && -f "$HOME/recovery-input/RECOVERED.txt" ]] || { echo 'Secondary only';exit 1; }
SNAP="${1:-}"
[[ -d "$SNAP" && "$SNAP" == "$ROOT/snapshots/"snapshot-* ]] || { echo 'Expected local verified snapshot dir';exit 1; }
NAME="$(basename "$SNAP")"
[[ "$NAME" =~ ^snapshot-[0-9]{8}-[0-9]{6}-[0-9]+$ ]] || exit 1
[[ -f "$SNAP/SHA256SUMS" ]] || exit 1
(cd "$SNAP" && sha256sum -c SHA256SUMS >/dev/null) || { echo 'Checksum mismatch';exit 1; }
APP="$HOME/apps/thophuongpro"
[[ -e "$APP/.env" && -e "$APP/package-lock.json" ]] || { echo 'Restore application on secondary first';exit 1; }
[[ ! -e "$SNAP/external-sheets.tar.gz" ]] || { echo 'External sheets need manual layout mapping; refusing automatic apply';exit 1; }
# Never touch active Tunnel, and never refresh database while app service is running.
for n in named-tunnel mini-web;do
 if sv status "$PREFIX/var/service/$n" 2>/dev/null | grep -q '^run:';then echo "STOP: $n currently running";exit 1;fi
done
# Archive members must not be absolute, traverse parents or create symbolic links.
check_archive(){
 local f="$1"
 if tar -tzf "$f" | grep -Eq '(^/|(^|/)\.\.(/|$))';then echo "Unsafe paths in $f"; exit 1;fi
 if tar -tvzf "$f" | grep -q '^l';then echo "Symbolic links in $f; manual validation required";exit 1;fi
}
check_archive "$SNAP/storage.tar.gz";check_archive "$SNAP/app-release.tar.gz"
CURRENT="$(node --env-file="$APP/.env" -e 'process.stdout.write(process.env.MYSQL_DATABASE||"")')"
if [[ "$CURRENT" == thophuong_standby_a ]];then TARGET_DB=thophuong_standby_b;else TARGET_DB=thophuong_standby_a;fi
[[ "$CURRENT" == thophuong_pro || "$CURRENT" == thophuong_standby_a || "$CURRENT" == thophuong_standby_b ]] || { echo "Unexpected active DB: $CURRENT";exit 1; }
RELEASE="$ROOT/releases/$NAME"
if [[ -d "$RELEASE" ]];then
  # A previous attempt may have stopped during extraction. Never erase active slot.
  if [[ -L "$APP" && "$(readlink -f "$APP")" == "$RELEASE" ]];then
    echo 'This snapshot is already the active local release.'; exit 0
  fi
  rm -rf -- "$RELEASE"
fi
mkdir -p "$RELEASE";chmod 700 "$RELEASE"
tar -xzf "$SNAP/app-release.tar.gz" -C "$RELEASE" --no-same-owner --no-same-permissions
tar -xzf "$SNAP/storage.tar.gz" -C "$RELEASE" --no-same-owner --no-same-permissions
[[ -f "$RELEASE/.env" && -d "$RELEASE/storage/sheets" && -f "$RELEASE/dist/server.cjs" && -f "$RELEASE/package-lock.json" ]] || { echo 'Release incomplete';exit 1; }
# Stage release references the atomic ~/apps/thophuongpro symlink after promotion.
node - "$RELEASE/.env" "$TARGET_DB" "$APP/storage/sheets" <<'NODE'
const fs=require('fs');const [p,db,sheets]=process.argv.slice(2);let s=fs.readFileSync(p,'utf8');
for(const [k,v] of [['MYSQL_DATABASE',db],['SHEET_STORAGE_ROOT',sheets]]){
 const re=new RegExp('^'+k+'=.*$','m');
 if(re.test(s))s=s.replace(re,k+'='+v);else s+='\n'+k+'='+v+'\n';
}
fs.writeFileSync(p,s,{mode:0o600});
NODE
chmod 600 "$RELEASE/.env"
# Reuse original npm packages for identical lockfiles; if changed, install stage deps.
BASE_DEPS="$ROOT/initial-app"
if [[ -f "$BASE_DEPS/package-lock.json" && -d "$BASE_DEPS/node_modules" ]] && cmp -s "$BASE_DEPS/package-lock.json" "$RELEASE/package-lock.json";then
 ln -s "$BASE_DEPS/node_modules" "$RELEASE/node_modules"
else
 # Install separately: symlinking to a previous rolling slot would break when
 # old slots are pruned on later syncs.
 (cd "$RELEASE" && npm ci --omit=dev --no-audit --no-fund)
fi
# MariaDB stage is NOT the DB in use. Import may fail without affecting last ready DB.
mariadb --no-defaults -u root -e 'SELECT 1' >/dev/null
# Prevent restored SQL EVENT jobs from running on the offline standby.
mariadb --no-defaults -u root -e 'SET GLOBAL event_scheduler=OFF'
mariadb --no-defaults -u root -e 'SET GLOBAL max_allowed_packet=134217728'
mariadb --no-defaults -u root -e "DROP DATABASE IF EXISTS \`$TARGET_DB\`; CREATE DATABASE \`$TARGET_DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
if ! (set -o pipefail; gzip -dc "$SNAP/database.sql.gz" | mariadb --no-defaults --max-allowed-packet=128M -u root "$TARGET_DB");then
 echo 'Stage SQL import failed; active standby still points to previous release';exit 1
fi
EXPECTED="$(sed -n 's/^Database tables at backup: *//p' "$SNAP/INFO.txt" | tr -d '[:space:]')"
ACTUAL="$(mariadb --no-defaults -u root -N -s -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$TARGET_DB'" | tr -d '[:space:]')"
[[ "$EXPECTED" =~ ^[0-9]+$ && "$EXPECTED" == "$ACTUAL" ]] || { echo "DB verification failed ($ACTUAL vs $EXPECTED)";exit 1; }
# Grant only app user from release .env; never print credentials.
SQLFILE="$(mktemp "$ROOT/.app-sql.XXXXXXXX")"
trap 'rm -f "$SQLFILE"' EXIT
node --env-file="$RELEASE/.env" - "$SQLFILE" "$TARGET_DB" <<'NODE'
const fs=require('fs');const [f,db]=process.argv.slice(2);const u=process.env.MYSQL_USER,p=process.env.MYSQL_PASSWORD;
if(!/^[a-zA-Z_][a-zA-Z0-9_]{1,50}$/.test(u||'')||!p||!/^thophuong_standby_[ab]$/.test(db))throw Error('Invalid DB account');
const q=x=>"'"+x.replace(/\\/g,'\\\\').replace(/'/g,"''")+"'";
fs.writeFileSync(f,[`CREATE USER IF NOT EXISTS ${q(u)}@'127.0.0.1' IDENTIFIED BY ${q(p)};`,`ALTER USER ${q(u)}@'127.0.0.1' IDENTIFIED BY ${q(p)};`,`GRANT ALL PRIVILEGES ON \`${db}\`.* TO ${q(u)}@'127.0.0.1';`,`CREATE USER IF NOT EXISTS ${q(u)}@'localhost' IDENTIFIED BY ${q(p)};`,`ALTER USER ${q(u)}@'localhost' IDENTIFIED BY ${q(p)};`,`GRANT ALL PRIVILEGES ON \`${db}\`.* TO ${q(u)}@'localhost';`].join('\n')+'\n',{mode:0o600});
NODE
mariadb --no-defaults -u root < "$SQLFILE"
rm -f "$SQLFILE"
# Converted only on this secondary. Original app directory is preserved as rollback.
if [[ ! -L "$APP" ]];then
 [[ -d "$APP" ]] || { echo 'Unexpected app path';exit 1; }
 [[ ! -e "$ROOT/initial-app" ]] || { echo 'Already migrated but app path no longer symlink';exit 1; }
 mv -- "$APP" "$ROOT/initial-app"
fi
TMP_LINK="$HOME/apps/.thophuongpro-next.$$"
ln -s "$RELEASE" "$TMP_LINK"
mv -Tf -- "$TMP_LINK" "$APP"
printf '%s\n' "$TARGET_DB" > "$ROOT/current-db"
echo "SWITCHED LOCAL STANDBY: $NAME, database=$TARGET_DB, tables=$ACTUAL (mini-web remains OFF)"
# Keep 2 release directories (active and previous) and initial-app rollback.
mapfile -t RELEASES < <(find "$ROOT/releases" -mindepth 1 -maxdepth 1 -type d -name 'snapshot-*' | sort)
if (( ${#RELEASES[@]} > 2 ));then
 for ((i=0;i<${#RELEASES[@]}-2;i++));do
  [[ "${RELEASES[i]}" != "$RELEASE" && "${RELEASES[i]}" != "$(readlink -f "$APP")" ]] && rm -rf -- "${RELEASES[i]}"
 done
fi
