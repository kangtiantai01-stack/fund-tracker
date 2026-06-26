#!/bin/bash
set -Eeuo pipefail

# 定位到项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "${SCRIPT_DIR}/.."

echo "Installing dependencies..."
pnpm install --no-frozen-lockfile 2>&1

echo "Building the Next.js project..."
pnpm exec next build
echo "Build completed successfully!"