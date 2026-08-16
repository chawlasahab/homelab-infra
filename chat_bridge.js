const http = require('http');
const https = require('https');
const crypto = require('crypto');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const PORT = process.env.CHAT_PORT || 3005;
const SESSION_TIMEOUT = 30 * 60 * 1000;

const sessions = {};
const pendingReplies = {};

function genId() { return crypto.randomBytes(8).toString('hex'); }

function sendTelegram(text) {
  const data = JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' });
  const opts = {
    hostname: 'api.telegram.org', path: `/bot${BOT_TOKEN}/sendMessage`,
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
  };
  return new Promise((resolve, reject) => {
    const req = https.request(opts, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); });
    req.on('error', reject); req.write(data); req.end();
  });
}

let telegramOffset = null;
async function pollTelegram() {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?timeout=5${telegramOffset ? '&offset=' + telegramOffset : ''}`;
  try {
    const resp = await new Promise((resolve, reject) => {
      https.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }).on('error', reject);
    });
    const data = JSON.parse(resp);
    if (data.ok && data.result) {
      for (const update of data.result) {
        telegramOffset = update.update_id + 1;
        const msg = update.message;
        if (!msg || !msg.text || String(msg.chat.id) !== CHAT_ID) continue;
        const text = msg.text.trim();

        if (text.startsWith('/r ')) {
          const parts = text.substring(3).split(' ');
          const sid = parts.shift();
          const reply = parts.join(' ');
          // match by prefix
          const fullSid = Object.keys(sessions).find(k => k.startsWith(sid));
          if (fullSid && reply) {
            if (!pendingReplies[fullSid]) pendingReplies[fullSid] = [];
            pendingReplies[fullSid].push(reply);
            sessions[fullSid].lastActive = Date.now();
            sendTelegram(`✅ Sent to visitor [${sid}]`);
          } else {
            sendTelegram('❌ Session not found. Use: /r <id> <message>');
          }
        } else if (text === '/active') {
          const now = Date.now();
          const active = Object.entries(sessions)
            .filter(([_, s]) => now - s.lastActive < SESSION_TIMEOUT)
            .map(([id, s]) => `• <code>${id.slice(0,6)}</code> ${s.geo || '?'} (${Math.round((now - s.lastActive)/60000)}m ago)`)
            .join('\n');
          sendTelegram(active ? `👥 <b>Active:</b>\n${active}` : 'No active chats.');
        }
      }
    }
  } catch(e) {}
  setTimeout(pollTelegram, 2000);
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'POST' && req.url === '/send') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { sessionId, message, name } = JSON.parse(body);
        if (!message || message.length > 500) { res.writeHead(400); res.end(JSON.stringify({ok:false})); return; }
        const clean = s => (s||'').replace(/[<>&]/g,'').trim();
        const sid = sessionId || genId();
        const city = req.headers['cf-ipcity'] || '';
        const country = req.headers['cf-ipcountry'] || '';

        if (!sessions[sid]) {
          const geo = [city, country].filter(Boolean).join(', ');
          sessions[sid] = { lastActive: Date.now(), geo, name: clean(name) || 'Visitor' };
          sendTelegram(`💬 <b>New chat</b>\nFrom: <b>${sessions[sid].name}</b> (${geo||'?'})\nSession: <code>${sid.slice(0,6)}</code>\n\n"${clean(message)}"\n\nReply: <code>/r ${sid.slice(0,6)} your message</code>`);
        } else {
          sessions[sid].lastActive = Date.now();
          sendTelegram(`💬 [${sid.slice(0,6)}] ${sessions[sid].name}: "${clean(message)}"`);
        }
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ ok: true, sessionId: sid }));
      } catch(e) { res.writeHead(500); res.end(JSON.stringify({ok:false})); }
    });

  } else if (req.method === 'POST' && req.url === '/poll') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { sessionId } = JSON.parse(body);
        const replies = pendingReplies[sessionId] || [];
        delete pendingReplies[sessionId];
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ ok: true, replies }));
      } catch(e) { res.writeHead(200); res.end(JSON.stringify({ok:true, replies:[]})); }
    });
  } else { res.writeHead(404); res.end(); }
});

setInterval(() => {
  const now = Date.now();
  for (const sid in sessions) if (now - sessions[sid].lastActive > SESSION_TIMEOUT) { delete sessions[sid]; delete pendingReplies[sid]; }
}, 600000);

server.listen(PORT, () => { console.log(`chat bridge on :${PORT}`); pollTelegram(); });
