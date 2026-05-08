#!/bin/bash
# Deploy Route Planner — run this ON the server (172.16.10.29)
# Usage: ./deploy-local.sh
# Clones from GitHub and sets up everything locally.

set -e

APP_DIR="/opt/routeplanner"
REPO_URL="https://github.com/mihaibalaci/routeplanner.git"

echo "=== Route Planner Server Deployment ==="
echo "Installing to: ${APP_DIR}"
echo ""

# Step 1: Install system dependencies
echo "[1/7] Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq git nodejs npm postgresql redis-server curl > /dev/null 2>&1

# Check Node.js version (need 18+)
NODE_VERSION=$(node --version 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
if [ "${NODE_VERSION}" -lt 18 ] 2>/dev/null; then
  echo "  Node.js ${NODE_VERSION} too old, installing 18..."
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null 2>&1
fi
echo "  Node.js $(node --version), npm $(npm --version)"

# Step 2: Start PostgreSQL and Redis
echo "[2/7] Starting PostgreSQL and Redis..."
systemctl enable postgresql > /dev/null 2>&1
systemctl start postgresql
systemctl enable redis-server > /dev/null 2>&1
systemctl start redis-server

# Step 3: Set up database
echo "[3/7] Configuring PostgreSQL database..."
su - postgres -c "psql -c \"CREATE USER routeplanner WITH PASSWORD 'routeplanner123';\"" 2>/dev/null || true
su - postgres -c "psql -c \"CREATE DATABASE routeplanner OWNER routeplanner;\"" 2>/dev/null || true
su - postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE routeplanner TO routeplanner;\"" 2>/dev/null || true
echo "  Database 'routeplanner' ready"

# Step 4: Clone or update repository
echo "[4/7] Cloning repository from GitHub..."
if [ -d "${APP_DIR}/.git" ]; then
  echo "  Repository exists, pulling latest..."
  cd ${APP_DIR}
  git pull origin main
else
  rm -rf ${APP_DIR}
  git clone ${REPO_URL} ${APP_DIR}
  cd ${APP_DIR}
fi
echo "  Source code ready at ${APP_DIR}"

# Step 5: Install dependencies and build
echo "[5/7] Installing dependencies and building..."
cd ${APP_DIR}
npm install
echo "  Backend dependencies installed"

npx tsc
echo "  Backend compiled"

cd ${APP_DIR}/frontend
npm install
npx vite build
echo "  Frontend built"

cd ${APP_DIR}

# Step 6: Create .env file (if not exists)
echo "[6/7] Configuring environment..."
if [ ! -f "${APP_DIR}/.env" ]; then
  JWT_SECRET=$(openssl rand -base64 32)
  cat > ${APP_DIR}/.env << EOF
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://routeplanner:routeplanner123@localhost:5432/routeplanner
REDIS_URL=redis://localhost:6379
JWT_SECRET=${JWT_SECRET}
GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY_HERE
EOF
  echo "  Created .env with generated JWT_SECRET"
else
  echo "  .env already exists, keeping current config"
fi

# Run database migrations
echo "  Running database migrations..."
npx node-pg-migrate up --database-url="postgresql://routeplanner:routeplanner123@localhost:5432/routeplanner" 2>&1 || echo "  (migrations may already be applied)"

# Step 7: Create and start systemd service
echo "[7/7] Setting up systemd service..."
cat > /etc/systemd/system/routeplanner.service << 'EOF'
[Unit]
Description=Route Planner API
After=network.target postgresql.service redis-server.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/routeplanner
ExecStart=/usr/bin/node /opt/routeplanner/dist/index.js
Restart=on-failure
RestartSec=5
EnvironmentFile=/opt/routeplanner/.env

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable routeplanner
systemctl restart routeplanner

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "  API:          http://$(hostname -I | awk '{print $1}'):3000"
echo "  Health check: http://$(hostname -I | awk '{print $1}'):3000/health"
echo "  Status:       systemctl status routeplanner"
echo "  Logs:         journalctl -u routeplanner -f"
echo ""
echo "  NOTE: Set GOOGLE_MAPS_API_KEY in ${APP_DIR}/.env then restart:"
echo "        systemctl restart routeplanner"
