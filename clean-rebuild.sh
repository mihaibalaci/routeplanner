#!/bin/bash
# Clean Rebuild — wipe all build artifacts and caches, reinstall everything.
# Run this ON the server. Preserves .env and database.
# Usage: ./clean-rebuild.sh

set -e

APP_DIR="/opt/routeplanner"
SERVICE_NAME="routeplanner"

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

log_step() { echo -e "\n${GREEN}[$1]${NC} $2"; }
log_ok() { echo -e "  ${GREEN}✓${NC} $1"; }
log_warn() { echo -e "  ${YELLOW}⚠${NC}  $1"; }

if [ ! -d "${APP_DIR}" ]; then
  echo -e "${RED}✗ Installation not found at ${APP_DIR}${NC}"
  exit 1
fi

cd "${APP_DIR}"

echo "=== Route Planner Clean Rebuild ==="
echo "  Location: ${APP_DIR}"
echo ""
echo -e "${YELLOW}This will:${NC}"
echo "  - Stop the service"
echo "  - Remove node_modules (backend + frontend)"
echo "  - Remove dist/ and frontend/dist/"
echo "  - Clear npm cache"
echo "  - Reinstall dependencies"
echo "  - Rebuild everything"
echo "  - Restart the service"
echo ""
echo -e "${GREEN}Preserved:${NC} .env, database, git history, PostgreSQL data, Redis cache"
echo ""

# Step 1: Stop the service
log_step "1/8" "Stopping service..."
systemctl stop "${SERVICE_NAME}" 2>/dev/null || log_warn "Service was not running"
log_ok "Service stopped"

# Step 2: Backup .env just in case
log_step "2/8" "Backing up .env..."
if [ -f "${APP_DIR}/.env" ]; then
  cp "${APP_DIR}/.env" "${APP_DIR}/.env.backup-$(date +%Y%m%d-%H%M%S)"
  log_ok ".env backed up"
else
  log_warn ".env does not exist"
fi

# Step 3: Remove build artifacts and dependencies
log_step "3/8" "Removing build artifacts and node_modules..."
rm -rf "${APP_DIR}/node_modules"
rm -rf "${APP_DIR}/dist"
rm -rf "${APP_DIR}/frontend/node_modules"
rm -rf "${APP_DIR}/frontend/dist"
log_ok "Removed node_modules (backend)"
log_ok "Removed dist/ (backend)"
log_ok "Removed node_modules (frontend)"
log_ok "Removed frontend/dist/"

# Step 4: Pull latest code
log_step "4/8" "Pulling latest from GitHub..."
git fetch origin main
# Discard local changes that would block pull (except .env which is gitignored)
git reset --hard origin/main
log_ok "Updated to $(git rev-parse --short HEAD) ($(git log -1 --format=%s | head -c 60))"

# Step 5: Clear npm cache
log_step "5/8" "Clearing npm cache..."
npm cache clean --force 2>/dev/null || true
log_ok "npm cache cleared"

# Step 6: Install backend dependencies
log_step "6/8" "Installing backend dependencies..."
npm install --legacy-peer-deps --no-audit --no-fund 2>&1 | tail -3
log_ok "Backend dependencies installed"

# Step 7: Install frontend dependencies and build both
log_step "7/8" "Installing frontend dependencies..."
cd "${APP_DIR}/frontend"
npm install --legacy-peer-deps --no-audit --no-fund 2>&1 | tail -3
log_ok "Frontend dependencies installed"
cd "${APP_DIR}"

log_step "7/8" "Building backend..."
npx tsc
log_ok "Backend compiled to dist/"

log_step "7/8" "Building frontend..."
cd "${APP_DIR}/frontend"
npx vite build 2>&1 | tail -5
log_ok "Frontend built to frontend/dist/"
cd "${APP_DIR}"

# Run migrations (idempotent)
if [ -f "${APP_DIR}/.env" ]; then
  DATABASE_URL=$(grep '^DATABASE_URL=' "${APP_DIR}/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  if [ -n "${DATABASE_URL}" ]; then
    npx node-pg-migrate up --database-url="${DATABASE_URL}" 2>&1 | tail -3 || log_warn "Migrations may have already been applied"
  fi
fi

# Step 8: Start service
log_step "8/8" "Starting service..."
systemctl start "${SERVICE_NAME}"
sleep 2

if systemctl is-active --quiet "${SERVICE_NAME}"; then
  log_ok "Service is running"
else
  echo -e "${RED}✗ Service failed to start${NC}"
  echo ""
  echo "Recent logs:"
  journalctl -u "${SERVICE_NAME}" -n 30 --no-pager
  exit 1
fi

# Verify
echo ""
if curl -fsS "http://localhost:3000/health" > /dev/null 2>&1; then
  log_ok "Health endpoint responding"
else
  log_warn "Health endpoint not responding yet"
fi

echo ""
echo -e "${GREEN}=== Clean Rebuild Complete ===${NC}"
echo ""
echo "  Version:  $(git rev-parse --short HEAD) ($(git log -1 --format=%s | head -c 60))"
echo "  API:      http://$(hostname -I | awk '{print $1}'):3000"
echo "  Web UI:   http://$(hostname -I | awk '{print $1}'):3000/start"
echo "  Logs:     journalctl -u ${SERVICE_NAME} -f"
echo ""
