#!/bin/sh
# Start both bot and web server sharing the same SQLite DB at /data/chiefofstaff.db
# Bot: Slack socket mode + Zoom webhooks on port 3000
# Web: Atlas Command Center on port 3001

echo "Starting Atlas Chief of Staff (bot + web)..."

# Start bot
cd /app/bot && node dist/index.js &
BOT_PID=$!
echo "Bot started (PID: $BOT_PID) on port 3000"

# Start web server
cd /app/web && npx tsx src/server/index.ts &
WEB_PID=$!
echo "Web started (PID: $WEB_PID) on port 3001"

# Wait for either to exit
wait -n $BOT_PID $WEB_PID
EXIT_CODE=$?

echo "Process exited with code $EXIT_CODE, shutting down..."
kill $BOT_PID $WEB_PID 2>/dev/null
exit $EXIT_CODE
