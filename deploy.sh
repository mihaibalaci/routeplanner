#!/bin/bash
# Deploy Route Planner to a Debian LXC container
# Usage: ./deploy.sh <host> <user>
# Example: ./deploy.sh 172.16.10.29 root

set -e

HOST="${1:-172.16.10.29}"
USER="${2:-root}"
REMOTE="${USER}@${HOST}"
APP_DIR="/opt/routeplanner"

echo "=== Route Planner Deployment ==="
echo "Target: ${REMOTE}:${APP_DIR}"
echo ""

# Step 1: Install dependencies on remote
echo "[1/6] Installing system dependencies on remote..."
ssh ${REMOTE} "apt-get update && apt-get install -y nodejs npm postgresql redis-server curl"

# Ensure Node.js 18+ is available
ssh ${REMOTE} "node --version || (curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && apt-get install -y nodejs)"

# Step 2: Set up PostgreSQL
echo "[2/6] Configuring PostgreSQL..."
ssh ${REMOTE} "systemctl enable postgresql && systemctl start postgresql"
ssh ${REMOTE} "su - postgres -c \"psql -c \\\"CREATE USER routeplanner WITH PASSWORD 'routeplanner123';\\\" 2>/dev/null || true\""
ssh ${REMOTE} "su - postgres -c \"psql -c \\\"CREATE DATABASE routeplanner OWNER routeplanner;\\\" 2>/dev/null || true\""

# Step 3: Set up Redis
echo "[3/6] Configuring Redis..."
ssh ${REMOTE} "systemctl enable redis-server && systemctl start redis-server"

# Step 4: Copy application files
echo "[4/6] Copying application files..."
ssh ${REMOTE} "mkdir -p ${APP_DIR}"

# Sync backend (exclude node_modules, dist, frontend node_modules)
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude 'frontend/node_modules' \
  --exclude 'frontend/dist' \
  --exclude '.git' \
  ./ ${REMOTE}:${APP_DIR}/

# Step 5: Install dependencies and build on remote
echo "[5/6] Installing dependencies and building..."
ssh ${REMOTE} "cd ${APP_DIR} && npm install --production=false"
ssh ${REMOTE} "cd ${APP_DIR} && npx tsc"
ssh ${REMOTE} "cd ${APP_DIR}/frontend && npm install && npx vite build"

# Step 6: Create environment file
echo "[6/6] Creating environment configuration..."
ssh ${REMOTE} "cat > ${APP_DIR}/.env << 'EOF'
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://routeplanner:routeplanner123@localhost:5432/routeplanner
REDIS_URL=redis://localhost:6379
JWT_SECRET=$(openssl rand -base64 32)
GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY_HERE
EOF"

# Run database migrations
echo "Running database migrations..."
ssh ${REMOTE} "cd ${APP_DIR} && npx node-pg-migrate up --database-url='postgresql://routeplanner:routeplanner123@localhost:5432/routeplanner'"

# Create systemd service
echo "Creating systemd service..."
ssh ${REMOTE} "cat > /etc/systemd/system/routeplanner.service << 'EOF'
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
Environment=NODE_ENV=production
EnvironmentFile=/opt/routeplanner/.env

[Install]
WantedBy=multi-user.target
EOF"

# Start the service
ssh ${REMOTE} "systemctl daemon-reload && systemctl enable routeplanner && systemctl restart routeplanner"

echo ""
echo "=== Deployment Complete ==="
echo "API running at: http://${HOST}:3000"
echo "Health check:   http://${HOST}:3000/health"
echo ""
echo "NOTE: Set your GOOGLE_MAPS_API_KEY in ${APP_DIR}/.env on the server"
echo "Then restart: ssh ${REMOTE} 'systemctl restart routeplanner'"
