# homelab-infra

Zero-trust self-hosted infrastructure for serving production websites from a home lab. No inbound ports, no public IP exposed, no attack surface.

## stack

```
internet --> cloudflare (CDN + WAF + DDoS) --> cloudflare tunnel (outbound only) --> local nginx --> sites
                                                                                  --> node services
admin access: tailscale mesh VPN (separate from public traffic)
```

## what's here

| file | purpose |
|------|---------|
| `msg_relay.js` | receives chatbot messages from visitors, forwards to telegram with geo data from cloudflare headers |
| `visitor_notify.js` | pings telegram when a new visitor hits the site (rate-limited per IP) |
| `backup.sh` | daily cron that commits configs + db dumps to a private git repo |
| `nginx.example.conf` | reverse proxy config with API endpoints and CF header forwarding |
| `cloudflared.example.yml` | tunnel ingress routing for multiple hostnames |

## design decisions

**why cloudflare tunnel instead of exposing ports:**
- zero inbound firewall rules needed
- server IP never exposed (can't be DDoS'd directly)
- outbound-only connection means nothing can reach the machine uninvited
- free SSL, free caching, free bot protection

**why tailscale for admin:**
- SSH only accessible on the tailscale network, not the public internet
- no port 22 exposed anywhere
- peer-to-peer encrypted, no central relay for most connections

**why nginx locally:**
- virtual host routing (multiple sites on one machine)
- path-based proxying to node services
- cloudflare headers (geo, real IP) forwarded to backends
- static file serving with gzip + security headers

**message relay design:**
- visitor types in chatbot → frontend POSTs to `/msg` endpoint
- nginx proxies to node service on localhost
- node sanitises input (strips HTML, caps length, rate-limits per IP)
- forwards to telegram bot API with geo info from CF headers
- bot token never exposed to client — only lives server-side

**visitor notifications:**
- page load fires a `fetch('/beacon', {method:'POST'})` 
- same IP only notifies once per 30 min (avoids refresh spam)
- geo data comes from cloudflare headers, not client-side (can't be faked)

## setup

```bash
cp .env.example .env
# fill in your telegram bot token + chat id

# message relay
node msg_relay.js &

# visitor notifier (run one per site, different ports)
SITE_NAME="mysite.com" NOTIFY_PORT=3003 node visitor_notify.js &
SITE_NAME="othersite.com" NOTIFY_PORT=3004 node visitor_notify.js &

# backup cron
crontab -e
# 0 3 * * * /path/to/backup.sh
```

configure nginx and cloudflared using the example files as templates.

## what you still need

- a cloudflare account (free tier is enough)
- a domain pointed at cloudflare nameservers
- tailscale account (free for personal use)
- a machine that stays on (doesn't need to be powerful — a pi works)

## license

MIT
