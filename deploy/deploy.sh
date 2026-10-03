#!/usr/bin/env bash
# Production deploy, rollback, status, and one read-only query.
# GitHub Actions runs this via .github/workflows/deploy.yml.
set -euo pipefail

host=${SPLOOT_HOST:-sploot-pilot.exe.xyz}
ssh_user=${SPLOOT_SSH_USER:-exedev}
url=${SPLOOT_URL:-https://sploot.mistystep.io}
target="${ssh_user}@${host}"

ssh_cmd=(ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=20 -o ServerAliveInterval=30 -o ServerAliveCountMax=180)
scp_cmd=(scp -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=20)
if [[ -n ${SPLOOT_SSH_IDENTITY:-} ]]; then
  ssh_cmd+=(-i "$SPLOOT_SSH_IDENTITY" -o IdentitiesOnly=yes)
  scp_cmd+=(-i "$SPLOOT_SSH_IDENTITY" -o IdentitiesOnly=yes)
fi
if [[ -n ${SPLOOT_KNOWN_HOSTS_FILE:-} ]]; then
  ssh_cmd+=(-o "UserKnownHostsFile=${SPLOOT_KNOWN_HOSTS_FILE}")
  scp_cmd+=(-o "UserKnownHostsFile=${SPLOOT_KNOWN_HOSTS_FILE}")
fi

usage() {
  printf 'usage: %s deploy|rollback|status|query [SELECT ...]\n' "${0##*/}" >&2
  exit 2
}

reject_sql() {
  printf '%s\n' "$1" >&2
  exit 2
}

# One statement that starts with SELECT. A single trailing semicolon is allowed.
normalize_select() {
  local query=$1 folded
  query=${query//$'\r'/}
  query=${query#"${query%%[![:space:]]*}"}
  query=${query%"${query##*[![:space:]]}"}
  [[ -n "$query" ]] || reject_sql "query must start with SELECT"
  if [[ "$query" == *";" ]]; then
    query=${query%;}
    query=${query%"${query##*[![:space:]]}"}
  fi
  [[ "$query" != *";"* ]] || reject_sql "query must be one SELECT"
  folded=${query,,}
  [[ "$folded" =~ ^select([^[:alnum:]_]|$) ]] || reject_sql "query must start with SELECT"
  printf '%s' "$query"
}

remote() {
  "${ssh_cmd[@]}" "$target" "$@"
}

remote_script() {
  local status=0
  "${scp_cmd[@]}" "${BASH_SOURCE[0]}" "${target}:/tmp/sploot-deploy.sh" || return 1
  if ! remote chmod 700 /tmp/sploot-deploy.sh; then
    remote rm -f /tmp/sploot-deploy.sh || true
    return 1
  fi
  remote sudo -n bash /tmp/sploot-deploy.sh --on-host "$@" || status=$?
  remote rm -f /tmp/sploot-deploy.sh || true
  return "$status"
}

release_check() {
  local expect=$1
  local deadline=$((SECONDS + 180))
  local version='' health='' assets='' root_line='' commit='' status=''
  while (( SECONDS < deadline )); do
    version=$(curl -fsS --max-time 15 "$url/api/version" || true)
    health=$(curl -fsS --max-time 15 "$url/api/health" || true)
    assets=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$url/api/assets" || true)
    root_line=$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 15 "$url/" || true)
    commit=$(printf '%s' "$version" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("commit",""))' 2>/dev/null || true)
    status=$(printf '%s' "$health" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status",""))' 2>/dev/null || true)
    if [[ "$commit" == "$expect" && "$status" == "ok" && "$assets" == "401" && "$root_line" == "303 "*"/sign-in"* ]]; then
      printf 'release check ok commit=%s assets=%s root=%s\n' "$expect" "$assets" "$root_line"
      return 0
    fi
    sleep 5
  done
  printf 'RELEASE CHECK FAILED expected=%s\nversion=%s\nhealth=%s\nassets=%s root=%s\n' \
    "$expect" "$version" "$health" "$assets" "$root_line" >&2
  return 1
}

restore_previous() {
  local line path commit
  line=$(remote_script previous) || return 1
  read -r path commit <<<"$line" || { printf 'no previous release\n' >&2; return 1; }
  [[ -n "$path" && -n "$commit" ]] || { printf 'no previous release\n' >&2; return 1; }
  remote_script switch "$path" "$commit" || return 1
  release_check "$commit"
}

deploy_cmd() {
  local root sha
  root=$(git rev-parse --show-toplevel)
  if ! git -C "$root" diff --quiet || ! git -C "$root" diff --cached --quiet; then
    printf 'deploy refused: worktree has uncommitted changes\n' >&2
    exit 1
  fi
  sha=$(git -C "$root" rev-parse HEAD)
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]]
  (cd "$root" && pnpm --filter server build)
  [[ -s "$root/apps/server/build/sploot" && -s "$root/apps/server/build/library-backup" ]]
  "${scp_cmd[@]}" "$root/apps/server/build/sploot" "${target}:/tmp/sploot-${sha}"
  "${scp_cmd[@]}" "$root/apps/server/build/library-backup" "${target}:/tmp/library-backup-${sha}"
  printf 'installing %s\n' "$sha"
  if ! remote_script activate "$sha"; then
    printf 'DEPLOY FAILED before the release check\n' >&2
    exit 1
  fi
  if ! release_check "$sha"; then
    printf 'DEPLOY FAILED for %s; restoring previous release\n' "$sha" >&2
    if ! restore_previous; then
      printf 'ROLLBACK FAILED\n' >&2
      exit 1
    fi
    printf 'ROLLBACK RESTORED the previous release; deploy failed\n' >&2
    exit 1
  fi
  printf 'deployed %s\n' "$sha"
}

rollback_cmd() {
  if ! restore_previous; then
    printf 'ROLLBACK FAILED\n' >&2
    exit 1
  fi
  printf 'rollback ok\n'
}

status_cmd() {
  remote_script status
  curl -fsS --max-time 15 "$url/api/version"
  printf '\n'
}

query_cmd() {
  local query b64
  [[ -n ${sql:-} ]] || reject_sql "query must start with SELECT"
  query=$(normalize_select "$sql")
  b64=$(printf '%s' "$query" | base64 | tr -d '\n')
  remote_script query "$b64"
}

# --- runs on the VM as root ---

set_commit() {
  local commit=$1 tmp old_umask
  old_umask=$(umask)
  umask 077
  tmp=$(mktemp /etc/sploot/production.env.XXXXXX)
  if ! awk -v commit="$commit" '
    BEGIN { found = 0 }
    /^SPLOOT_DEPLOYMENT_COMMIT=/ { print "SPLOOT_DEPLOYMENT_COMMIT=" commit; found = 1; next }
    { print }
    END { if (!found) print "SPLOOT_DEPLOYMENT_COMMIT=" commit }
  ' /etc/sploot/production.env >"$tmp"; then
    rm -f "$tmp"
    umask "$old_umask"
    return 1
  fi
  if ! chmod --reference=/etc/sploot/production.env "$tmp" \
    || ! chown --reference=/etc/sploot/production.env "$tmp" \
    || ! mv -f "$tmp" /etc/sploot/production.env; then
    rm -f "$tmp"
    umask "$old_umask"
    return 1
  fi
  umask "$old_umask"
}

restart_sploot() {
  local attempt=0
  systemctl restart sploot.service || true
  while ((attempt < 15)); do
    if systemctl is-active --quiet sploot.service; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
  journalctl -u sploot.service -n 40 --no-pager >&2 || true
  return 1
}

host_switch() {
  local path=$1 commit=$2
  [[ "$path" =~ ^/opt/sploot/releases/[0-9a-fA-F]+$ ]] || return 1
  [[ "$commit" =~ ^[0-9a-fA-F]+$ ]] || return 1
  [[ -x "$path/sploot" && -x "$path/library-backup" ]] || return 1
  set_commit "$commit" || return 1
  ln -sfn "$path" /opt/sploot/current || return 1
  restart_sploot || return 1
}

backup_is_fresh() {
  python3 - "$1" <<'PY'
import json, sys
from datetime import datetime
start = float(sys.argv[1])
with open("/var/lib/sploot/recovery-status.json", encoding="utf-8") as handle:
    status = json.load(handle)
if status.get("status") != "ok":
    raise SystemExit(1)
completed = datetime.fromisoformat(status["completedAt"]).timestamp()
if completed + 1 < start:
    raise SystemExit(1)
print(status["completedAt"])
PY
}

backup_failure_phase() {
  if [[ -f /var/lib/sploot/recovery-status.json.failure ]]; then
    python3 -c 'import json; s=json.load(open("/var/lib/sploot/recovery-status.json.failure")); print("backup failure phase=" + str(s.get("phase", "")))' >&2 || true
  fi
}

host_backup() {
  local avail start deadline now completed
  avail=$(df -B1 --output=avail /var/lib/sploot | awk 'NR==2 { print $1 }')
  if [[ ! "$avail" =~ ^[0-9]+$ ]] || ((avail < 1073741824)); then
    printf 'need 1 GiB free on /var/lib/sploot, have %s bytes\n' "$avail" >&2
    exit 1
  fi
  start=$(date +%s)
  deadline=$((start + 2700))
  while systemctl is-active --quiet sploot-backup.service; do
    now=$(date +%s)
    if ((now > deadline)); then
      printf 'timed out waiting for the in-progress backup\n' >&2
      exit 1
    fi
    sleep 5
  done
  if completed=$(backup_is_fresh "$start"); then
    printf 'backup ok completedAt=%s\n' "$completed"
    return 0
  fi
  start=$(date +%s)
  if ! systemctl start sploot-backup.service; then
    printf 'sploot-backup.service failed\n' >&2
    backup_failure_phase
    exit 1
  fi
  if ! completed=$(backup_is_fresh "$start"); then
    printf 'backup did not record a new ok receipt\n' >&2
    backup_failure_phase
    exit 1
  fi
  printf 'backup ok completedAt=%s\n' "$completed"
}

host_activate() {
  local sha=$1 dest prev prev_commit
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || exit 1
  dest="/opt/sploot/releases/$sha"
  mkdir -p "$dest"
  if ! install -m 0755 "/tmp/sploot-$sha" "$dest/sploot" \
    || ! install -m 0755 "/tmp/library-backup-$sha" "$dest/library-backup"; then
    rm -f "/tmp/sploot-$sha" "/tmp/library-backup-$sha"
    exit 1
  fi
  rm -f "/tmp/sploot-$sha" "/tmp/library-backup-$sha"
  host_backup
  prev=$(readlink -f /opt/sploot/current)
  prev_commit=$(awk -F= '$1=="SPLOOT_DEPLOYMENT_COMMIT" { print $2; exit }' /etc/sploot/production.env)
  prev_commit=${prev_commit//$'\r'/}
  [[ "$prev" =~ ^/opt/sploot/releases/[0-9a-fA-F]+$ ]]
  [[ "$prev_commit" =~ ^[0-9a-fA-F]+$ ]]
  ln -sfn "$prev" /opt/sploot/previous
  printf '%s\n' "$prev_commit" > /opt/sploot/previous.commit
  chmod 644 /opt/sploot/previous.commit
  if ! host_switch "$dest" "$sha"; then
    if [[ "$(readlink -f /opt/sploot/current)" == "$dest" ]]; then
      printf 'DEPLOY FAILED during restart; restoring %s\n' "$prev" >&2
      host_switch "$prev" "$prev_commit" || printf 'ROLLBACK FAILED\n' >&2
    else
      printf 'DEPLOY FAILED before switching current\n' >&2
    fi
    exit 1
  fi
}

host_previous() {
  local path commit
  path=$(readlink -f /opt/sploot/previous)
  commit=$(tr -d '[:space:]' < /opt/sploot/previous.commit)
  [[ "$path" =~ ^/opt/sploot/releases/[0-9a-fA-F]+$ ]]
  [[ "$commit" =~ ^[0-9a-fA-F]+$ ]]
  printf '%s %s\n' "$path" "$commit"
}

host_status() {
  local current previous=none
  current=$(readlink -f /opt/sploot/current)
  if [[ -L /opt/sploot/previous ]]; then
    previous=$(readlink -f /opt/sploot/previous)
  fi
  printf 'current=%s\nprevious=%s\n' "$current" "$previous"
}

host_query() {
  local query data=/var/lib/sploot/production line db
  query=$(printf '%s' "$1" | base64 -d)
  query=$(normalize_select "$query")
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      SPLOOT_DATA_DIR=*) data=${line#SPLOOT_DATA_DIR=} ;;
    esac
  done < /etc/sploot/production.env
  data=${data%\"}
  data=${data#\"}
  data=${data%/}
  db="${data}/library.sqlite"
  [[ -f "$db" ]] || { printf 'library database missing\n' >&2; exit 1; }
  command -v sqlite3 >/dev/null || { printf 'sqlite3 is not installed\n' >&2; exit 1; }
  # Run as the library owner so a read-only open cannot leave a root-owned WAL index.
  runuser -u sploot -- sqlite3 -readonly -cmd '.timeout 5000' -batch "$db" "$query"
}

on_host() {
  local cmd=${1:-}
  shift
  case "$cmd" in
    activate) host_activate "$1" ;;
    switch) host_switch "$1" "$2" ;;
    previous) host_previous ;;
    status) host_status ;;
    query) host_query "$1" ;;
    *) printf 'unknown host command\n' >&2; exit 2 ;;
  esac
}

if [[ "${1:-}" == "--on-host" ]]; then
  shift
  on_host "$@"
  exit 0
fi

action=${1:-}
sql=${2-}
case "$action" in
  deploy) deploy_cmd ;;
  rollback) rollback_cmd ;;
  status) status_cmd ;;
  query) query_cmd ;;
  *) usage ;;
esac
