#!/usr/bin/env bash
# Zero-downtime deploy with a pre-flight gate and automatic rollback (spec R7).
#
#   deploy/deploy.sh [git-ref]            # production (default ref: origin/main)
#   deploy/deploy.sh --staging [git-ref]  # staging
#
# Layout:  /srv/lputv/repo.git (bare mirror)  /srv/lputv/releases/<sha>  /srv/lputv/current -> releases/<sha>
set -euo pipefail

STAGE=production; APP=lputv; ROOT=${DEPLOY_ROOT:-/srv/lputv}; PORT=${DEPLOY_PORT:-3001}; ENV_FILE=${DEPLOY_ENV_FILE:-/etc/lputv/production.env}
if [[ "${1:-}" == "--staging" ]]; then
    shift; STAGE=staging; APP=lputv-staging; ROOT=${DEPLOY_ROOT:-/srv/lputv-staging}; PORT=${DEPLOY_PORT:-3101}; ENV_FILE=${DEPLOY_ENV_FILE:-/etc/lputv/staging.env}
fi
REF="${1:-origin/main}"
GATE_PORT=${DEPLOY_GATE_PORT:-3199}
REPO=${DEPLOY_REPO:-/srv/lputv/repo.git}
log() { printf '[deploy %s] %s\n' "$STAGE" "$*"; }

git --git-dir="$REPO" fetch --quiet --prune origin '+refs/heads/*:refs/remotes/origin/*'
SHA=$(git --git-dir="$REPO" rev-parse --short=12 "$REF")
REL="$ROOT/releases/$SHA"
PREV=$(readlink -f "$ROOT/current" 2>/dev/null || true)
log "deploying $REF ($SHA); current: ${PREV:-none}"

# 1. Build the release in its own directory.
if [[ ! -d "$REL" ]]; then
    mkdir -p "$REL"
    git --git-dir="$REPO" archive "$SHA" backend deploy | tar -x -C "$REL"
fi
cd "$REL/backend"
npm ci --no-audit --no-fund --loglevel=error
node scripts/check-syntax.mjs

# 2. Gate: boot the new build on a spare port against a copy of the live database.
GATE_DIR=$(mktemp -d)
LIVE_DB=$(grep -E '^DB_PATH=' "$ENV_FILE" | cut -d= -f2-)
node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.argv[1],{readOnly:true});d.prepare('VACUUM INTO ?').run(process.argv[2]);d.close()" "$LIVE_DB" "$GATE_DIR/gate.sqlite"
ENV_FILE="$ENV_FILE" DB_PATH="$GATE_DIR/gate.sqlite" BACKUP_DIR="$GATE_DIR" PORT=$GATE_PORT RELEASE="$SHA" node server.js > "$GATE_DIR/gate.log" 2>&1 &
GATE_PID=$!
cleanup_gate() { kill "$GATE_PID" 2>/dev/null || true; wait "$GATE_PID" 2>/dev/null || true; rm -rf "$GATE_DIR"; }
for _ in $(seq 1 50); do curl -fs "http://127.0.0.1:$GATE_PORT/health" >/dev/null && break; sleep 0.2; done
if ! node "$REL/deploy/smoke.mjs" "http://127.0.0.1:$GATE_PORT"; then
    log "GATE FAILED; nothing changed. Gate log:"; tail -40 "$GATE_DIR/gate.log" || true
    cleanup_gate; exit 1
fi
cleanup_gate
log "gate passed"

# 3. Swap and reload (pm2 reload is graceful: old process drains, new one boots).
ln -sfn "$REL" "$ROOT/current"
export RELEASE="$SHA"
pm2 reload "$APP" --update-env >/dev/null
sleep 3

# 4. Verify live; roll back automatically on failure.
if ! node "$REL/deploy/smoke.mjs" "http://127.0.0.1:$PORT"; then
    log "LIVE CHECK FAILED; rolling back to ${PREV:-nothing}"
    if [[ -n "$PREV" ]]; then ln -sfn "$PREV" "$ROOT/current"; pm2 reload "$APP" --update-env >/dev/null; fi
    exit 1
fi

# 5. Keep the last 5 releases.
ls -1dt "$ROOT"/releases/*/ | tail -n +6 | xargs -r rm -rf
log "live on $SHA"
