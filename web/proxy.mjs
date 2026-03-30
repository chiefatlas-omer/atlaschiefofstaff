// Thin reverse proxy — forwards all requests to the bot's web server
// running on the same Fly.io private network
import http from 'http';

const TARGET = 'http://atlaschief-bot.internal:3001';
const PORT = parseInt(process.env.WEB_PORT || '3001');

const server = http.createServer((clientReq, clientRes) => {
  const url = new URL(TARGET + clientReq.url);

  const options = {
    hostname: url.hostname,
    port: url.port || 3001,
    path: clientReq.url,
    method: clientReq.method,
    headers: { ...clientReq.headers, host: url.hostname },
  };

  const proxy = http.request(options, (proxyRes) => {
    clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(clientRes, { end: true });
  });

  proxy.on('error', (err) => {
    console.error('Proxy error:', err.message);
    clientRes.writeHead(502);
    clientRes.end('Bad Gateway — bot web server unreachable');
  });

  clientReq.pipe(proxy, { end: true });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Atlas Command Center proxy listening on port ${PORT} → ${TARGET}`);
});
