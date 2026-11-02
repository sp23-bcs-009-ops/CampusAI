# Operations

Local: `docker compose up -d backend` on port 8000. Expo: `npx expo start --lan --port 8081` with LAN host so phones are not `127.0.0.1`.

Health: `GET /health`.

Do not deploy from this task. Rollback: git commit `7346f64` plus revert the engine files if uncommitted.

Backup of Firestore is a production operation and was not done.
