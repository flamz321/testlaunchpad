/**
 * PM2 Ecosystem Config — Feather App
 *
 * First-time setup on VPS:
 *   npm run build
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup   (follow the printed command to survive reboots)
 *
 * After a git pull + rebuild:
 *   pm2 reload feather-app   (zero-downtime reload)
 *
 * Useful commands:
 *   pm2 logs feather-app --lines 100
 *   pm2 monit
 *   pm2 restart feather-app --update-env
 */

module.exports = {
  apps: [
    {
      // ── Identity ───────────────────────────────────────────────────────
      name: "feather-app",

      // ── Run the compiled production bundle, NOT tsx / dev server ───────
      // Always build first: npm run build
      script: "dist/index.cjs",
      interpreter: "node",

      // ── Working directory ─────────────────────────────────────────────
      cwd: "/home/featherapp/htdocs",

      // ── Environment ───────────────────────────────────────────────────
      // env_file tells PM2 to load .env directly (PM2 v5+).
      // The dotenv/config import in server/index.ts also loads .env as a
      // fallback, so secrets are available regardless.
      env_file: ".env",
      env: {
        NODE_ENV: "production",
        PORT: "5010",
      },

      // ── Memory safety net ─────────────────────────────────────────────
      // Restart automatically if the process exceeds 500 MB.
      // Bots disabled = typical idle RSS ~120–180 MB.
      // Bots enabled  = typical idle RSS ~250–350 MB.
      max_memory_restart: "500M",

      // ── Stability ─────────────────────────────────────────────────────
      watch: false,
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,

      // ── Logging ───────────────────────────────────────────────────────
      error_file: "logs/pm2-error.log",
      out_file:   "logs/pm2-out.log",
      merge_logs: true,
      time: true,

      // ── Single process (no clustering needed yet) ──────────────────────
      instances: 1,
      exec_mode: "fork",
    },
  ],
};
