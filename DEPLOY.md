# Feather App — Hostinger VPS + CloudPanel Deploy Guide

Deploy **Feather App** (Robinhood Chain only) on a Hostinger VPS with CloudPanel **without interfering with other sites**. Use a dedicated CloudPanel site user, directory, database, PM2 process name, and Node port.

---

## 1. Create an isolated CloudPanel site

1. Log into **CloudPanel**.
2. **Sites → Add Site** (Node.js / Reverse Proxy style, or Static + reverse proxy — you will proxy to PM2).
3. Recommended:
   - **Domain**: `feather.app` or a subdomain (e.g. `app.yourdomain.com`)
   - **Site User**: `featherapp` (CloudPanel creates `/home/featherapp/`)
4. Do **not** reuse another project’s site user, document root, or PM2 app name.

**Isolation checklist**

| Resource | Feather App | Other sites |
|---|---|---|
| CloudPanel site user | `featherapp` | their own users |
| App directory | `/home/featherapp/htdocs` | separate paths |
| PostgreSQL DB / user | dedicated (e.g. `feather_app`) | separate DBs |
| PM2 process name | `feather-app` | different names |
| Node listen port | e.g. `5010` | different ports |
| Nginx vhost | CloudPanel site for this domain only | untouched |

---

## 2. Node.js version

On the VPS (as root or via CloudPanel Node manager), install a current LTS Node (20+ recommended):

```bash
# Example with n / nvm / CloudPanel Node version selector
node -v   # should be >= 20
npm -v
```

Ensure the **featherapp** site user can run that Node version (CloudPanel “Node.js Version” for the site).

---

## 3. PostgreSQL database

In CloudPanel → **Databases → Add Database**:

- Database name: `feather_app`
- Database user: `feather_app`
- Strong password (save it)

Connection string shape:

```text
postgresql://feather_app:YOUR_DB_PASSWORD@127.0.0.1:5432/feather_app
```

---

## 4. Clone the repo

SSH as the site user (or root, then `chown`):

```bash
sudo -u featherapp -i
cd /home/featherapp
# If CloudPanel already created htdocs, use it:
cd /home/featherapp/htdocs

# First-time clone (if htdocs is empty / placeholder):
# Option A — clone into htdocs
git clone https://github.com/FeatherAppFun/FeatherApp.git .
# Option B — clone then point CloudPanel root at the repo folder
# git clone https://github.com/FeatherAppFun/FeatherApp.git feather.app
# cd feather.app
```

Use a deploy key or HTTPS credentials with read access to the private/public GitHub repo.

Working directory used by PM2 (`ecosystem.config.cjs`):

```text
/home/featherapp/htdocs
```

If you cloned into a subdirectory (e.g. `/home/featherapp/htdocs/feather.app`), either move contents up into `htdocs` or update `cwd` in `ecosystem.config.cjs` to match.

---

## 5. Environment file (`.env`)

Create `/home/featherapp/htdocs/.env` (never commit this file):

```bash
# ── Core ──────────────────────────────────────────────────────────
NODE_ENV=production
PORT=5010

# Public site URL (no trailing slash)
APP_URL=https://feather.app

# ── Admin / bot wallets (Robinhood Chain EVM) ─────────────────────
ADMIN_WALLET=0x752C3b6CB472D426AD0438f202A46dFa7D58aF34
BOT_WALLET_ADDRESS=0x752C3b6CB472D426AD0438f202A46dFa7D58aF34

# ── Database ──────────────────────────────────────────────────────
DATABASE_URL=postgresql://feather_app:YOUR_DB_PASSWORD@127.0.0.1:5432/feather_app

# ── Auth ──────────────────────────────────────────────────────────
JWT_SECRET=generate-a-long-random-string-here
SESSION_SECRET=generate-another-long-random-string-here

# ── Robinhood Chain RPC ───────────────────────────────────────────
RPC_URL=https://rpc.mainnet.chain.robinhood.com
# Optional Alchemy (used by intel helpers when set):
# ALCHEMY_API_KEY=your_alchemy_key

# ── $FEATHER token (ERC-20 on Robinhood Chain) ────────────────────
FEATHER_TOKEN_ADDRESS=0xYourFeatherTokenAddress
VITE_FEATHER_TOKEN_ADDRESS=0xYourFeatherTokenAddress
# USDC_ADDRESS=0x...
# VITE_USDC_ADDRESS=0x...

# ── Bots (optional — set DISABLE_BOTS=true to skip) ───────────────
# DISABLE_BOTS=true
TELEGRAM_BOT_TOKEN=
TELEGRAM_OWNER_ID=
VITE_TELEGRAM_BOT_USERNAME=FeatherAppBot
DISCORD_BOT_TOKEN=
DISCORD_OWNER_ID=
VITE_DISCORD_INVITE_URL=

# ── IPFS (Pinata) — required for token launch metadata + image uploads ─
PINATA_JWT=your_pinata_jwt_here

# ── Uniswap Trading API (on-site /swap quotes + execution) ────────────
# From https://developers.uniswap.org/ — keep server-side only
UNISWAP_API_KEY=your_uniswap_api_key_here

# ── Bags / Feather partner fees (Robinhood Chain EVM launches) ─────────
# NOT the Solana Bags API partner key — no BAGS_API_KEY required for RH.
# Set your EVM wallet + share (bps) so factory.create encodes you as partner.
# Example: 2500 = 25% of trading fees to the partner wallet.
FEATHER_PARTNER_WALLET=0xYourPartnerWalletOnRobinhoodChain
FEATHER_PARTNER_BPS=2500
# Aliases also accepted: BAGS_PARTNER_WALLET / BAGS_PARTNER_BPS

# $FEATHER CA can also be set/overridden in Admin → SEO & Analytics
# (site_settings.featherTokenAddress). Env is the fallback.

# Token launches are signed by the user's wallet against the on-chain
# Robinhood launchpad factory (no Bags API key required).
```

After pulling schema changes (bonding curve chart ticks), run:

```bash
set -o allexport && source .env && set +o allexport
npx drizzle-kit push
```

Generate secrets:

```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # SESSION_SECRET
```

**Port note:** If another app already uses `5000`, keep Feather on **`5010`** (or any free port). Nginx will proxy `443 → 5010`.

---

## 6. Install, build, migrate, start

```bash
cd /home/featherapp/htdocs
npm ci
npm run build
npm run db:push
```

Start with PM2 (uses `ecosystem.config.cjs`):

```bash
# Ensure PORT in .env matches what Nginx will proxy to
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # run the printed command as root so PM2 survives reboot
```

Verify:

```bash
pm2 status
pm2 logs feather-app --lines 80
curl -sS http://127.0.0.1:5010/ | head
```

Useful PM2 commands:

```bash
pm2 reload feather-app          # zero-downtime reload after rebuild
pm2 restart feather-app --update-env
pm2 monit
```

---

## 7. Nginx reverse proxy (CloudPanel)

In CloudPanel for the Feather site:

1. Point the site’s reverse proxy / Vhost to the Node app:
   - **Upstream**: `http://127.0.0.1:5010` (or your chosen `PORT`)
2. Typical location block (CloudPanel may generate this; adjust port if needed):

```nginx
location / {
    proxy_pass http://127.0.0.1:5010;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
}
```

3. Reload Nginx via CloudPanel or:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Do **not** edit other sites’ vhosts.

---

## 8. SSL via CloudPanel

1. CloudPanel → your Feather site → **SSL/TLS**
2. Issue **Let’s Encrypt** certificate for the domain / www
3. Force HTTPS if desired

CloudPanel manages cert renewals for that site only.

---

## 9. Updating from GitHub

```bash
cd /home/featherapp/htdocs
git pull origin main          # or your deploy branch
npm ci
npm run build
# Load env then push schema (safe if no breaking changes)
set -o allexport && source .env && set +o allexport
npm run db:push || true
pm2 reload feather-app
```

Optional: configure GitHub Actions / a deploy webhook hitting `POST /api/deploy` with header `x-deploy-token: $DEPLOY_WEBHOOK_SECRET`. The server deploy script expects the app at `/home/featherapp/htdocs` and PM2 name `feather-app`.

---

## 10. Isolation / conflict avoidance

- **Separate CloudPanel site user** (`featherapp`) so file permissions and cron don’t collide.
- **Separate PostgreSQL database** — never share another app’s DB.
- **Unique PM2 name** `feather-app` — `pm2 restart` won’t touch other apps.
- **Unique PORT** (e.g. `5010`) — Nginx proxies only this vhost to that port.
- **Own `.env`** in this directory only.
- **Own domain / SSL** — other Hostinger sites keep their certificates and roots.
- If an older Trenchy/Solana project exists on the same VPS, leave its user, path, PM2 name, and port alone; Feather is a parallel install.

---

## 11. Quick smoke test

1. Open `https://feather.app` (or your subdomain) — homepage loads.
2. Connect an EVM wallet on Robinhood Chain.
3. Admin menu appears only for `ADMIN_WALLET` (`0x752C3b6CB472D426AD0438f202A46dFa7D58aF34`).
4. Explorer links should go to `https://robinhoodchain.blockscout.com/...` (not Solscan).
5. `pm2 logs feather-app` shows no crash loops.

---

## Reference paths

| Item | Value |
|---|---|
| App cwd | `/home/featherapp/htdocs` |
| PM2 name | `feather-app` |
| Default prod port | `5010` (change if free; must match Nginx) |
| Admin wallet | `0x752C3b6CB472D426AD0438f202A46dFa7D58aF34` |
| Chain | Robinhood Chain (EVM, Chain ID 4663) |
| Explorer | https://robinhoodchain.blockscout.com |
