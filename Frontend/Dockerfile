FROM node:20-bullseye-slim

WORKDIR /app

ENV EXPO_NO_TELEMETRY=1
ENV npm_config_fetch_retries=5
ENV npm_config_fetch_retry_factor=2
ENV npm_config_fetch_retry_mintimeout=20000
ENV npm_config_fetch_retry_maxtimeout=120000

COPY package.json ./
COPY package-lock.json ./

RUN set -e; \
	for i in 1 2 3; do \
		npm ci --legacy-peer-deps --no-audit --no-fund && break; \
		if [ "$i" -eq 3 ]; then exit 1; fi; \
		echo "npm ci failed (attempt $i), retrying..."; \
	done; \
	npm cache clean --force

COPY . .

EXPOSE 19000 19001 19002 8081 19006

CMD ["npx", "expo", "start", "--lan", "--clear"]