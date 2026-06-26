#!/bin/bash
set -Eeuo pipefail

export PORT="${DEPLOY_RUN_PORT:-5000}"

echo "Starting Next.js production server on port ${PORT}..."
./node_modules/.bin/next start -p "${PORT}"