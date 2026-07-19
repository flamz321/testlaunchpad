// Load .env before anything else so all modules see the env vars.
// This is a no-op when env vars are already set (e.g. via PM2 / system env).
import "dotenv/config";

import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initDiscordBot } from "./discord";
import { seedDex } from "./seed";
import path from "path";
import fs from "fs";

const app = express();
const httpServer = createServer(app);

// Trust the first proxy (Replit / VPS reverse-proxy) so express-rate-limit
// can read the real client IP from X-Forwarded-For without validation errors.
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

// API read rate limit — 300 req / 15 min per IP (generous for SPA multi-query page loads)
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests — please try again later" },
    skip: (req) => req.method !== "GET",
  })
);

// Write API rate limit — 120 req / 15 min per IP (POST/PATCH/DELETE only)
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many API requests — please slow down" },
    skip: (req) => req.method === "GET",
  })
);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Serve uploaded logos (logos stored in uploads/logos/ dir)
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const logosDir = path.join(uploadsDir, "logos");
if (!fs.existsSync(logosDir)) fs.mkdirSync(logosDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir));

// public-root/ — admin-managed files served at "/" with highest priority.
// Files uploaded here (ads.txt, robots.txt, icons, etc.) override anything
// in dist/public, and are served in both dev and production.
const publicRootDir = path.join(process.cwd(), "public-root");
if (!fs.existsSync(publicRootDir)) fs.mkdirSync(publicRootDir, { recursive: true });
app.use(express.static(publicRootDir, { index: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);
  await seedDex();
  if (process.env.DISABLE_BOTS !== "true") {
    initDiscordBot();
  } else {
    console.log("[discord] Bot disabled via DISABLE_BOTS flag");
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;

    // Log the real error server-side for debugging
    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    // Never expose internal error details to callers
    const safeMessage =
      status < 500 ? (err.message || "Bad request") : "Internal server error";

    return res.status(status).json({ message: safeMessage });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
