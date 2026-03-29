FROM node:20-alpine

WORKDIR /app

# Install build dependencies for better-sqlite3 native module
RUN apk add --no-cache python3 make g++

# Install web dependencies
COPY package*.json ./
RUN npm ci

# Copy web source
COPY tsconfig.json ./
COPY src/ ./src/
COPY public/ ./public/
COPY vite.config.ts ./

# Copy bot DB schema files (web server imports these via ../../../../bot/src/db/schema)
# Recreate the relative path the imports expect
RUN mkdir -p /bot/src/db
COPY bot-deps/ /bot/src/db/

# Link node_modules so bot schema files can resolve drizzle-orm
RUN ln -s /app/node_modules /bot/node_modules

# Build Vite frontend
RUN npx vite build

# Copy public assets (favicon) into built output
RUN cp -r public/* dist/client/ 2>/dev/null || true

# Clean up build deps
RUN apk del python3 make g++ 2>/dev/null || true

# Create data directory for SQLite
RUN mkdir -p /data

EXPOSE 3001

ENV DATABASE_PATH=/data/chiefofstaff.db
ENV WEB_PORT=3001
ENV NODE_ENV=production

CMD ["npx", "tsx", "src/server/index.ts"]
