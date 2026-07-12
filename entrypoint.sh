#!/bin/sh
set -e

echo "Running initial build..."
bun run build

echo "Starting cron scheduler (every hour)..."
while true; do
  sleep 3600
  echo "$(date) - Rebuilding site..."
  bun run build 2>&1
  echo "$(date) - Build complete."
done
