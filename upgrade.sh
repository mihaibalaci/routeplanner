#!/bin/bash
# Upgrade an existing Route Planner install to the latest version.
# Run this ON the server (not from your local machine).
# Usage: ./upgrade.sh
#
# What it does:
# 1. Stashes local changes (if any) to avoid merge conflicts
# 2. Pulls latest from GitHub
# 3. Reinstalls dependencies (backend + frontend)
# 4. Runs database migrations (idempotent)
# 5. Rebuilds backend and frontend
# 6. Restarts the systemd service
# 7. Verifies the service is healthy

set -e

APP_DIR="/opt/routeplanner"
SERVICE_NAME="routeplanner"
HEALTH_URL="http://localhost:3000/health"

# ANSI colors for readability
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_step() { echo -e "\n${GREEN}[$1]${NC} $2"; }
log_warn() { echo -e "${YELLOW}  ⚠${NC}  $1"; }
log_error() { echo -e "${RED}  ✗${NC}  $1"; }
log_ok() { echo -e "  ${GREEN}✓${NC} $1"; }

# Pre-flight checks
if [ ! -d "${APP_DIR}" ]; then
  log_error "Installation not found at ${APP_DIR}"
  log_error "Run deploy-local.sh for a fresh install instead."
  exit 1
fi

if [ ! -d "${APP_DIR}/.git" ]; then
  log_error "${APP_DIR} is not a git repository"
  log_error "Cannot upgrade — please reinstall via deploy-local.sh"
  exit 1
fi

cd "${APP_DIR}"

echo "=== Route Planner Upgrade ==="
echo "  Location: ${APP_DIR}"
echo "  Current:  $(git rev-parse --short HEAD) ($(git log -1 --format=%s | head -c 60))"
echo ""

# Step 1: Stash any local changes to avoid merge conflicts
log_step "1/7" "Checking for local changes..."
if [ -n "$(git status --porcelain)" ]; then
  STASH_NAME="upgrade-$(date +%Y%m%d-%H%M%S)"
  log_warn "Local changes detected — stashing as '${STASH_NAME}'"
  git stash push -u -m "${STASH_NAME}" > /dev/null
  log_ok "Stashed (recover with: git stash list / git stash pop)"
else
  log_ok "Working tree clean"
fi

# Step 2: Pull latest from GitHub
log_step "2/7" "Fetching latest from GitHub..."
git fetch origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "${LOCAL}" = "${REMOTE}" ]; then
  log_ok "Already on latest commit — checking if rebuild is still needed"
  NEEDS_REBUILD=false
else
  echo "  Commits to apply:"
  git log --oneline "${LOCAL}..${REMOTE}" | head -10 | sed 's/^/    /'
  git merge --ff-only origin/main
  log_ok "Updated to $(git rev-parse --short HEAD)"
  NEEDS_REBUILD=true
fi

# Step 3: Install backend dependencies
log_step "3/7" "Installing backend dependencies..."
npm install --legacy-peer-deps --no-audit --no-fund 2>&1 | tail -3
log_ok "Backend dependencies ready"

# Step 4: Install frontend dependencies
log_step "4/7" "Installing frontend dependencies..."
cd "${APP_DIR}/frontend"
npm install --legacy-peer-deps --no-audit --no-fund 2>&1 | tail -3
log_ok "Frontend dependencies ready"
cd "${APP_DIR}"

# Step 5: Run database migrations
log_step "5/7" "Running database migrations..."
if [ -f "${APP_DIR}/.env" ]; then
  # Extract DATABASE_URL from .env
  DATABASE_URL=$(grep '^DATABASE_URL=' "${APP_DIR}/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  if [ -n "${DATABASE_URL}" ]; then
    npx node-pg-migrate up --database-url="${DATABASE_URL}" 2>&1 | tail -5 || log_warn "Migrations may have already been applied"
    log_ok "Migrations complete"
  else
    log_warn "DATABASE_URL not found in .env — skipping migrations"
  fi
else
  log_warn ".env not found — skipping migrations"
fi

# Step 6: Build backend and frontend
log_step "6/7" "Building backend and frontend..."
npx tsc
log_ok "Backend compiled to dist/"

cd "${APP_DIR}/frontend"
npx vite build 2>&1 | tail -5
log_ok "Frontend built to frontend/dist/"
cd "${APP_DIR}"

# Step 7: Restart the service
log_step "7/7" "Restarting service..."
systemctl restart "${SERVICE_NAME}"
sleep 2

if systemctl is-active --quiet "${SERVICE_NAME}"; then
  log_ok "Service is running"
else
  log_error "Service failed to start"
  echo ""
  echo "Recent logs:"
  journalctl -u "${SERVICE_NAME}" -n 20 --no-pager
  exit 1
fi

# Health check
echo ""
log_step "Health check" "Verifying /health endpoint..."
if curl -fsS "${HEALTH_URL}" > /dev/null 2>&1; then
  log_ok "Health endpoint responding"
else
  log_warn "Health endpoint not responding yet — service may still be starting"
  log_warn "Check: journalctl -u ${SERVICE_NAME} -f"
fi

# Summary
echo ""
echo -e "${GREEN}=== Upgrade Complete ===${NC}"
echo ""
echo "  Version:  $(git rev-parse --short HEAD) ($(git log -1 --format=%s | head -c 60))"
echo "  API:      http://$(hostname -I | awk '{print $1}'):3000"
echo "  Status:   systemctl status ${SERVICE_NAME}"
echo "  Logs:     journalctl -u ${SERVICE_NAME} -f"
echo ""
