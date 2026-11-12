#!/usr/bin/env bash
set -e
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

docker build -t campusai-backend "$ROOT_DIR/backend"
docker run --rm -d --name campusai-backend-launcher \
  --env-file "$ROOT_DIR/backend/.env" \
  -p 8000:8000 \
  -v "$ROOT_DIR/backend/ocr_data:/data" \
  campusai-backend
trap 'docker stop campusai-backend-launcher >/dev/null' EXIT INT TERM

if [ ! -d Frontend/node_modules ]; then
  (cd Frontend && npm install --legacy-peer-deps --no-audit --no-fund)
fi

cd "$ROOT_DIR/Frontend"
npx expo start --web --port 19006
