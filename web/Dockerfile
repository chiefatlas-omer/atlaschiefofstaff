FROM node:20-alpine

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy the entire monorepo (web needs bot/src/db/schema imports)
COPY . /monorepo
WORKDIR /monorepo

# Install bot dependencies (for schema imports)
WORKDIR /monorepo/bot
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Install web dependencies
WORKDIR /monorepo/web
RUN npm ci

# Build Vite frontend (static assets)
RUN npx vite build

# Clean up build deps
RUN apk del python3 make g++ 2>/dev/null || true

# Create data directory
RUN mkdir -p /data

EXPOSE 3001

ENV DATABASE_PATH=/data/chiefofstaff.db
ENV WEB_PORT=3001
ENV NODE_ENV=production

# Run the server with tsx (handles TypeScript + cross-project imports)
CMD ["npx", "tsx", "src/server/index.ts"]
