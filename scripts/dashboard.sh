#!/usr/bin/env bash
# ─── Footy IQ — one-command launcher ────────────────────────────────
# Starts the database, backend, and frontend, then prints the URL.
# Usage:   bash scripts/dashboard.sh
# Stop:    bash scripts/dashboard.sh stop
#
# CEO Command Center → http://localhost:5173/admin
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Admin password is read by the backend directly from backend/.env
# (ADMIN_PASSWORD=...). This file is committed to git — never hardcode a
# real password here. If ADMIN_PASSWORD isn't set, /admin login is disabled.

if [ "$1" = "stop" ]; then
  echo "Stopping Footy IQ…"
  pkill -f "node server.js" 2>/dev/null || true
  pkill -f "vite" 2>/dev/null || true
  (docker compose down 2>/dev/null || docker-compose down 2>/dev/null) || true
  echo "Stopped."
  exit 0
fi

echo "▸ Starting database (Docker Postgres)…"
if ! docker info >/dev/null 2>&1; then
  echo "  Docker isn't running. Opening Docker Desktop — give it ~30s, then re-run this."
  open -a Docker 2>/dev/null || true
  exit 1
fi
docker compose up -d postgres 2>/dev/null || docker-compose up -d postgres
echo "  waiting for Postgres…"
for i in $(seq 1 20); do
  docker exec football-analytics-postgres-1 pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 2
done

echo "▸ Starting backend (port 3001)…"
pkill -f "node server.js" 2>/dev/null || true
( cd backend && nohup node server.js > /tmp/fiq_backend.log 2>&1 & )
sleep 6

echo "▸ Starting frontend (port 5173)…"
pkill -f "vite" 2>/dev/null || true
( cd frontend && nohup npx vite --host > /tmp/fiq_frontend.log 2>&1 & )
sleep 4

echo ""
echo "════════════════════════════════════════════════════"
echo "  Footy IQ is running."
echo "  Public site:     http://localhost:5173"
echo "  CEO dashboard:   http://localhost:5173/admin"
echo "  Admin password:  (set ADMIN_PASSWORD in backend/.env)"
echo ""
echo "  Stop everything: bash scripts/dashboard.sh stop"
echo "════════════════════════════════════════════════════"
