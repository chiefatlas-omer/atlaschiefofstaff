FROM node:20-alpine

WORKDIR /app

# Simple reverse proxy — forwards all requests to atlaschief-bot.internal:3001
COPY proxy.mjs ./

EXPOSE 3001

ENV WEB_PORT=3001

CMD ["node", "proxy.mjs"]
