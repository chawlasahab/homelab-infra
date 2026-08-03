const http = require('http');
const https = require('https');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const PORT = process.env.RELAY_PORT || 3002;
const ENDPOINT = process.env.RELAY_ENDPOINT || '/msg';

const rateLimit = {};

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

  if (req.method === 'POST' && req.url === ENDPOINT) {
    const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const country = req.headers['cf-ipcountry'] || '';
    const city = req.headers['cf-ipcity'] || '';
    const region = req.headers['cf-ipregion'] || '';

    const now = Date.now();
    if (rateLimit[ip] && now - rateLimit[ip] < 60000) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'rate limited' }));
      return;
    }

    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { name, message } = JSON.parse(body);
        if (!message || message.length > 500) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'invalid' }));
          return;
        }
        const clean = s => (s || '').replace(/[<>&]/g, '').trim().slice(0, 100);
        const cleanMsg = message.replace(/[<>&]/g, '').trim();
        const loc = [city, region, country].filter(Boolean).map(clean);
        const locStr = loc.length ? `\n📍 ${loc.join(', ')}` : '';
        const text = `💬 <b>Message</b>\n\nFrom: <b>${clean(name) || 'Anonymous'}</b>${locStr}\n\n"${cleanMsg}"`;
        await sendTelegram(text);
        rateLimit[ip] = now;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false }));
      }
    });
  } else { res.writeHead(404); res.end(); }
});

server.listen(PORT, () => console.log(`relay on :${PORT}${ENDPOINT}`));
