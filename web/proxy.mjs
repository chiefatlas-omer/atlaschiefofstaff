// Thin reverse proxy — forwards all requests to the bot's web server
// running on the same Fly.io private network
import http from 'http';
import dns from 'dns';

// Fly.io internal DNS only resolves over IPv6 — force Node to prefer IPv6
dns.setDefaultResultOrder('verbatim');

const TARGET_HOST = 'atlaschief-bot.internal';
const TARGET_PORT = 3001;
const PORT = parseInt(process.env.WEB_PORT || '3001');

const server = http.createServer((clientReq, clientRes) => {
  const options = {
    hostname: TARGET_HOST,
    port: TARGET_PORT,
    path: clientReq.url,
    method: clientReq.method,
    headers: { ...clientReq.headers, host: TARGET_HOST },
    family: 6, // Force IPv6 for Fly.io internal network
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
  console.log(`Atlas Command Center proxy listening on port ${PORT} → http://${TARGET_HOST}:${TARGET_PORT} (IPv6)`);
});
