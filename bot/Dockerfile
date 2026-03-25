FROM node:20-alpine

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npx tsc

# Create data directory for SQLite
RUN mkdir -p /data

# Clean up build dependencies
RUN apk del python3 make g++

EXPOSE 3000

ENV DATABASE_PATH=/data/chiefofstaff.db
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
