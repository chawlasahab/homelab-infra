const http = require('http');
const https = require('https');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const PORT = process.env.NOTIFY_PORT || 3003;
const SITE_NAME = process.env.SITE_NAME || 'my site';
const COOLDOWN = parseInt(process.env.NOTIFY_COOLDOWN || '1800000'); // 30 min

const seen = {};

function sendTelegram(text) {
  const data = JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' });
  const opts = {
    hostname: 'api.telegram.org',
    path: `/bot${BOT_TOKEN}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
  };
  return new Promise((resolve, reject) => {
    const req = https.request(opts, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'POST' && req.url === '/visit') {
    const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const now = Date.now();

    if (seen[ip] && now - seen[ip] < COOLDOWN) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, notify: false }));
      return;
    }
    seen[ip] = now;

    const clean = s => (s || '').replace(/[<>&]/g, '').trim();
    const loc = [req.headers['cf-ipcity'], req.headers['cf-ipregion'], req.headers['cf-ipcountry']]
      .filter(Boolean).map(clean);

    await sendTelegram(`👀 <b>Visitor on ${SITE_NAME}</b>\n📍 ${loc.join(', ') || 'Unknown'}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, notify: true }));
  } else { res.writeHead(404); res.end(); }
});

setInterval(() => {
  const now = Date.now();
  for (const ip in seen) if (now - seen[ip] > COOLDOWN) delete seen[ip];
}, 3600000);

server.listen(PORT, () => console.log(`visitor notify on :${PORT} for ${SITE_NAME}`));
