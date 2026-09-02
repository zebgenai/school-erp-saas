# SSL / HTTPS Setup Guide — Clever Campus ERP

## Option A: Let's Encrypt with Certbot (recommended)

### Prerequisites
- Domain names pointing to your server (e.g. `app.yourdomain.com`, `api.yourdomain.com`)
- Nginx installed
- Ports 80 and 443 open

### Steps

```bash
# Install certbot
sudo apt update && sudo apt install -y certbot python3-certbot-nginx

# Obtain certificates (nginx plugin auto-configures)
sudo certbot --nginx -d app.yourdomain.com -d api.yourdomain.com

# Verify auto-renewal
sudo certbot renew --dry-run
```

Certbot adds a cron job at `/etc/cron.d/certbot` for automatic renewal.

### Apply Clever Campus nginx config

```bash
sudo cp deploy/nginx/clever-campus.conf /etc/nginx/sites-available/clever-campus
sudo ln -sf /etc/nginx/sites-available/clever-campus /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## Option B: Docker + Caddy (automatic HTTPS)

Caddy obtains and renews certificates automatically.

```caddyfile
app.yourdomain.com {
    reverse_proxy localhost:8080
}

api.yourdomain.com {
    reverse_proxy localhost:3000
}
```

---

## Option C: Cloud provider load balancer

- **AWS:** ACM certificate on ALB → target groups for frontend (8080) and backend (3000)
- **DigitalOcean:** Managed load balancer + Let's Encrypt
- **Cloudflare:** Full (strict) SSL with origin certificates

---

## Post-SSL checklist

- [ ] Update `CORS_ORIGINS` to `https://app.yourdomain.com`
- [ ] Update frontend `VITE_API_URL` to `https://api.yourdomain.com/api`
- [ ] Set `NODE_ENV=production`
- [ ] Verify `GET https://api.yourdomain.com/api/health/ready` returns 200
- [ ] Test file uploads over HTTPS
- [ ] Test PDF downloads over HTTPS
- [ ] Enable HSTS in nginx (optional, after confirming HTTPS works):

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

---

## Environment variables after SSL

```env
# backend/.env
CORS_ORIGINS=https://app.yourdomain.com
NODE_ENV=production

# frontend build arg
VITE_API_URL=https://api.yourdomain.com/api
```
