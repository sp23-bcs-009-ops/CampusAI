#!/bin/bash

set -e

FRONTEND_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$FRONTEND_DIR/.env"

# Detect the active LAN IP
LAN_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{
    for (i=1; i<=NF; i++) {
        if ($i == "src") {
            print $(i+1)
            exit
        }
    }
}')

if [ -z "$LAN_IP" ]; then
    echo "ERROR: Could not detect LAN IP."
    exit 1
fi

BACKEND_URL="http://${LAN_IP}:8000"

echo "======================================"
echo " CampusAI"
echo "======================================"
echo "Detected LAN IP : $LAN_IP"
echo "Backend URL     : $BACKEND_URL"
echo "======================================"

# Update existing variable or add it if missing
if grep -q '^EXPO_PUBLIC_AI_SERVER_URL=' "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^EXPO_PUBLIC_AI_SERVER_URL=.*|EXPO_PUBLIC_AI_SERVER_URL=$BACKEND_URL|" "$ENV_FILE"
else
    echo "EXPO_PUBLIC_AI_SERVER_URL=$BACKEND_URL" >> "$ENV_FILE"
fi

echo ""
echo "Updated .env:"
grep '^EXPO_PUBLIC_AI_SERVER_URL=' "$ENV_FILE"
echo ""

cd "$FRONTEND_DIR"

echo "Starting Expo..."
npx expo start --lan
