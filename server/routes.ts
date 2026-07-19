import express, { type Express, type Request, type Response, type NextFunction } from "express";
import type { Server } from "http";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { spawn } from "child_process";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { initTelegramBot } from "./telegram";
import { getMarketStats, generateSignal } from "./marketdata";
import {
  fetchDexScreenerData, searchDexScreener,
  getTokenPriceUsd, getRequiredPayment, verifyPayment,
  verifyEvmSignature,
  BOT_WALLET, BOOST_TIERS, AD_PACKAGES, LISTING_FEE_USD,
  USDC_MINT, FEATHER_MINT, TRENCHY_MINT,
} from "./dex";
import {
  prepareLaunchMetadata,
  assertValidFeeRecipients,
  bagsPublicClient,
  type FeeRecipientEntry,
} from "./bagsfm";
import {
  getFeatherFactoryTokens,
  getFeatherFactoryTokenDetail,
  invalidateFactoryTokenCache,
  FEATHER_LAUNCHPAD_ID,
} from "./factoryTokens";
import { bagsLensAbi, bagsFeeShareAbi, encodeClaimFeesCalldata } from "@shared/bags";
import { DEXSCREENER_CHAIN_ID, isEvmAddress, normalizeWallet, isTxHash, ROBINHOOD_LAUNCHPAD, EXPLORER_TX_URL, FEATHER_TOKEN_ADDRESS } from "@shared/chain";
import { generateRandomUsername, isValidUsername, looksLikeWalletAddress } from "@shared/profileUsername";
import type { Address } from "viem";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { generateSecret as totpGenerateSecret, generateSync as totpGenerateSync, verifySync as totpVerifySync } from "otplib";
import QRCode from "qrcode";
import { getWalletProfile, scanToken, getIntelStats } from "./helius";
import {
  checkApproval as uniswapCheckApproval,
  extractQuoteAmounts,
  getQuote as uniswapGetQuote,
  getSwapTransaction,
  isUniswapTradeConfigured,
  NATIVE_ETH,
} from "./uniswapTrade";

const ADMIN_WALLET = normalizeWallet(
  process.env.ADMIN_WALLET || "0x752C3b6CB472D426AD0438f202A46dFa7D58aF34"
);
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { wallet: string; role: string };
    if (payload.role !== "admin" || payload.wallet.toLowerCase() !== ADMIN_WALLET.toLowerCase()) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ── IPFS / Pinata helpers ─────────────────────────────────────────────────────

export function ipfsUrl(cid: string | null | undefined): string {
  if (!cid) return "";
  if (cid.startsWith("Qm") || cid.startsWith("bafy") || cid.startsWith("baf")) {
    return `https://gateway.pinata.cloud/ipfs/${cid}`;
  }
  if (cid.endsWith(".json")) return `/uploads/metadata/${cid}`;
  return `/uploads/claim/${cid}`;
}

async function pinFileToIPFS(buffer: Buffer, filename: string, mimeType: string): Promise<{ cid: string; url: string }> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "bin";
    const fname = `${crypto.randomBytes(16).toString("hex")}.${ext}`;
    const dir = path.join(process.cwd(), "uploads", "claim");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, fname), buffer);
    return { cid: fname, url: `/uploads/claim/${fname}` };
  }
  const { default: FormData } = await import("form-data");
  const form = new FormData();
  form.append("file", buffer, { filename, contentType: mimeType });
  form.append("pinataMetadata", JSON.stringify({ name: filename }));
  form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));
  const formBuffer = form.getBuffer();
  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, ...form.getHeaders() },
    body: formBuffer,
  });
  if (!response.ok) throw new Error(`Pinata error: ${await response.text()}`);
  const json: any = await response.json();
  const cid = json.IpfsHash as string;
  return { cid, url: `https://gateway.pinata.cloud/ipfs/${cid}` };
}

async function pinJsonToIPFS(metadata: object, name: string): Promise<{ cid: string; url: string }> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    const fname = `${crypto.randomBytes(16).toString("hex")}.json`;
    const dir = path.join(process.cwd(), "uploads", "metadata");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, fname), JSON.stringify(metadata, null, 2));
    return { cid: fname, url: `/uploads/metadata/${fname}` };
  }
  const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ pinataContent: metadata, pinataMetadata: { name } }),
  });
  if (!response.ok) throw new Error(`Pinata JSON error: ${await response.text()}`);
  const json: any = await response.json();
  const cid = json.IpfsHash as string;
  return { cid, url: `https://gateway.pinata.cloud/ipfs/${cid}` };
}

// ── Input sanitization ────────────────────────────────────────────────────────
function sanitizeText(s: unknown, maxLen = 500): string {
  if (typeof s !== "string") return "";
  return s.replace(/<[^>]*>/g, "").replace(/[<>]/g, "").replace(/javascript:/gi, "").trim().slice(0, maxLen);
}
function sanitizeUrl(s: unknown, maxLen = 300): string {
  if (typeof s !== "string") return "";
  const t = s.trim().slice(0, maxLen);
  if (!t) return "";
  if (/^https?:\/\//i.test(t) || t.startsWith("@")) return t;
  if (t.startsWith("http")) return ""; // malformed
  return t; // relative paths/handles allowed
}
function validateOnlySafeUrl(s: unknown): string {
  const u = sanitizeUrl(s);
  if (u && !/^https?:\/\//i.test(u) && !u.startsWith("@")) return "";
  return u;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Only start bots on VPS (production). Set DISABLE_BOTS=true in Replit to prevent conflicts.
  if (process.env.DISABLE_BOTS !== "true") {
    initTelegramBot(app);
  } else {
    console.log("[telegram] Bot disabled via DISABLE_BOTS flag");
  }

  // Returns all recent launches (displayed on the website dashboard)
  app.get(api.launches.list.path, async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      const launches = await storage.getLaunches();
      res.json(launches);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Returns a single launch by id
  app.get(api.launches.get.path, async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      const launch = await storage.getLaunch(Number(req.params.id));
      if (!launch) {
        return res.status(404).json({ message: "Launch not found" });
      }
      res.json(launch);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Bags.fm token cache (server-side, refreshed every 90s) ───────────────
  let _bagsTokenCache: { data: any[]; ts: number } | null = null;

  async function fetchRobinhoodTokensViaDex(): Promise<any[]> {
    if (_bagsTokenCache && Date.now() - _bagsTokenCache.ts < 180_000) {
      return _bagsTokenCache.data;
    }
    try {
      const mintMap = new Map<string, any>();
      const searchTerms = [
        "eth","feather","robinhood","meme","ai","pepe","dog","cat","inu","moon",
        "a","b","c","d","e","f","g","h","i","j","k","l","m",
        "n","o","p","q","r","s","t","u","v","w","x","y","z",
      ];
      const SEARCH_BATCH = 15;
      for (let i = 0; i < searchTerms.length; i += SEARCH_BATCH) {
        const chunk = searchTerms.slice(i, i + SEARCH_BATCH);
        const results = await Promise.allSettled(
          chunk.map((q) =>
            fetch(
              `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`,
              { headers: { "User-Agent": "FeatherApp/1.0" }, signal: AbortSignal.timeout(7000) }
            ).then((r) => (r.ok ? r.json() : { pairs: [] }))
          )
        );
        for (const res of results) {
          if (res.status !== "fulfilled") continue;
          for (const p of res.value.pairs ?? []) {
            if (p.chainId !== "robinhood" || !p.baseToken?.address) continue;
            const dexId = String(p.dexId ?? "").toLowerCase();
            // Prefer Uniswap; still include other robinhood DEXes
            const mint = p.baseToken.address;
            const existing = mintMap.get(mint);
            if (!existing || (p.volume?.h24 ?? 0) > (existing.volume?.h24 ?? 0)) {
              mintMap.set(mint, p);
            }
            void dexId;
          }
        }
      }

      const pairs = Array.from(mintMap.values());
      const tokens = pairs.map((p) => ({
        id: `rh-${p.baseToken.address}`,
        name: p.baseToken.name ?? "Unknown",
        symbol: p.baseToken.symbol ?? "???",
        imageUrl: p.info?.imageUrl ?? null,
        mintAddress: p.baseToken.address,
        marketCap: p.marketCap ?? null,
        priceUsd: p.priceUsd ? Number(p.priceUsd) : null,
        change24h: p.priceChange?.h24 ?? null,
        volume24h: p.volume?.h24 ?? null,
        description: null as string | null,
        createdAt: p.pairCreatedAt ? new Date(p.pairCreatedAt) : null,
        source: "uniswap" as const,
        bagsUrl: `https://dexscreener.com/robinhood/${p.baseToken.address}`,
        pumpUrl: null,
        creatorWallet: null as string | null,
        bondingProgress: null as number | null,
      }));

      console.log(`[fetchRobinhoodTokens] Final token count: ${tokens.length}`);
      _bagsTokenCache = { data: tokens, ts: Date.now() };
      return tokens;
    } catch (err: any) {
      console.error("[fetchRobinhoodTokensViaDex]", err.message);
      return _bagsTokenCache?.data ?? [];
    }
  }

  function resolveLaunchMediaUrl(url: string | null | undefined): string | null {
    if (!url || typeof url !== "string") return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("ipfs://")) {
      return `https://gateway.pinata.cloud/ipfs/${trimmed.slice(7)}`;
    }
    return trimmed;
  }

  // ── Home / Launchpad feed — Feather launches + factory + DexScreener ────
  app.get("/api/home/feed", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "public, max-age=30");
      const tab = String(req.query.tab ?? "new");
      const page = Math.max(1, Number(req.query.page ?? 1));
      const pageSize = Math.min(Math.max(1, Number(req.query.pageSize ?? 24)), 60);

      const [dbLaunches, dexTokens] = await Promise.all([
        storage.getAllSuccessfulLaunches().catch(() => []),
        fetchRobinhoodTokensViaDex(),
      ]);

      const factory = await getFeatherFactoryTokens(
        80,
        dbLaunches.map((l) => ({
          mintAddress: l.mintAddress,
          coinName: l.coinName,
          ticker: l.ticker,
          imageUrl: l.imageUrl,
          createdAt: l.createdAt,
        }))
      ).catch(() => ({ tokens: [], addressSet: new Set<string>() }));

      const factoryByMint = new Map(
        factory.tokens.map((t) => [normalizeWallet(t.tokenAddress), t])
      );
      const dexMap = new Map(
        dexTokens
          .filter((t: any) => t.mintAddress)
          .map((t: any) => [normalizeWallet(t.mintAddress), t])
      );

      const featherTokens = dbLaunches
        .filter((l) => l.mintAddress)
        .map((l) => {
          const key = normalizeWallet(l.mintAddress!);
          const live = dexMap.get(key);
          const ft = factoryByMint.get(key);
          return {
            id: `feather-${l.id}`,
            name: l.coinName || ft?.name || live?.name || "Unknown",
            symbol: l.ticker || ft?.symbol || live?.symbol || "???",
            imageUrl:
              resolveLaunchMediaUrl(l.imageUrl) ||
              resolveLaunchMediaUrl(ft?.icon) ||
              resolveLaunchMediaUrl(live?.imageUrl) ||
              null,
            mintAddress: l.mintAddress,
            marketCap: live?.marketCap ?? ft?.marketCap ?? null,
            priceUsd: live?.priceUsd ?? ft?.priceUsd ?? null,
            change24h: live?.change24h ?? null,
            volume24h: live?.volume24h ?? null,
            description: l.description ?? null,
            createdAt: l.createdAt ?? (ft?.createdAt ? new Date(ft.createdAt) : null),
            source: "feather" as const,
            bagsUrl: l.bagsUrl ?? `/dex/${l.mintAddress}`,
            pumpUrl: l.pumpUrl ?? null,
            creatorWallet: null as string | null,
            bondingProgress: ft && !ft.migrated ? ft.bondingProgressPct : null,
            website: l.website ?? null,
            twitter: l.twitter ?? null,
            launchpad: FEATHER_LAUNCHPAD_ID,
            migrated: ft?.migrated ?? false,
          };
        });

      const featherMints = new Set(
        featherTokens.map((t) => normalizeWallet(t.mintAddress!))
      );

      // On-chain factory tokens not yet in DB (still show name/image from lens + metadata)
      const orphanFactory = factory.tokens
        .filter((ft) => !featherMints.has(normalizeWallet(ft.tokenAddress)))
        .map((ft) => {
          const live = dexMap.get(normalizeWallet(ft.tokenAddress));
          return {
            id: `factory-${ft.tokenAddress}`,
            name: ft.name || live?.name || "Unknown",
            symbol: ft.symbol || live?.symbol || "???",
            imageUrl:
              resolveLaunchMediaUrl(ft.icon) ||
              resolveLaunchMediaUrl(live?.imageUrl) ||
              null,
            mintAddress: ft.tokenAddress,
            marketCap: live?.marketCap ?? ft.marketCap ?? null,
            priceUsd: live?.priceUsd ?? ft.priceUsd ?? null,
            change24h: live?.change24h ?? null,
            volume24h: live?.volume24h ?? null,
            description: null as string | null,
            createdAt: ft.createdAt ? new Date(ft.createdAt) : null,
            source: "feather" as const,
            bagsUrl: `/dex/${ft.tokenAddress}`,
            pumpUrl: null as string | null,
            creatorWallet: null as string | null,
            bondingProgress: ft.migrated ? null : ft.bondingProgressPct,
            website: null as string | null,
            twitter: null as string | null,
            launchpad: FEATHER_LAUNCHPAD_ID,
            migrated: ft.migrated,
          };
        });

      const knownFeather = new Set([
        ...Array.from(featherMints),
        ...orphanFactory.map((t) => normalizeWallet(t.mintAddress!)),
      ]);

      const externalDex = dexTokens
        .filter((t: any) => t.mintAddress && !knownFeather.has(normalizeWallet(t.mintAddress)))
        .map((t: any) => ({
          ...t,
          imageUrl: resolveLaunchMediaUrl(t.imageUrl),
          source: "uniswap" as const,
          launchpad: "uniswap",
          bondingProgress: t.bondingProgress ?? null,
          migrated: false,
        }));

      let combined = [...featherTokens, ...orphanFactory, ...externalDex];

      switch (tab) {
        case "trending":
          combined.sort((a, b) => (b.volume24h ?? -1) - (a.volume24h ?? -1));
          break;
        case "top":
          combined.sort((a, b) => (b.marketCap ?? -1) - (a.marketCap ?? -1));
          break;
        case "graduating":
          combined = combined.filter(
            (t) => t.bondingProgress != null && t.bondingProgress > 0 && !(t as any).migrated
          );
          combined.sort(
            (a, b) => (b.bondingProgress ?? -1) - (a.bondingProgress ?? -1)
          );
          break;
        case "new":
        default:
          combined.sort((a, b) => {
            const aFeather = a.source === "feather" ? 1 : 0;
            const bFeather = b.source === "feather" ? 1 : 0;
            if (aFeather !== bFeather) return bFeather - aFeather;
            return (
              new Date(b.createdAt ?? 0).getTime() -
              new Date(a.createdAt ?? 0).getTime()
            );
          });
          break;
      }

      const total = combined.length;
      const start = (page - 1) * pageSize;
      const paginated = combined.slice(start, start + pageSize);
      res.json({
        tokens: paginated,
        total,
        page,
        pageSize,
        hasMore: start + pageSize < total,
      });
    } catch (err: any) {
      console.error("[/api/home/feed]", err.message);
      res.status(500).json({ tokens: [], total: 0, page: 1, pageSize: 24, hasMore: false });
    }
  });

  // Returns bot stats for the dashboard
  app.get(api.stats.get.path, async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      const stats = await storage.getStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Market config (token gating removed — open to all) ────────────────────
  app.get("/api/market/config", async (_req, res) => {
    res.json({ minTrenchyToMarket: 0 });
  });

  // ── Token gating disabled platform-wide ──────────────────────────────────
  app.get("/api/settings/token-gating", (_req, res) => {
    res.json({ tokenGatingEnabled: false });
  });

  // ── Bags.fm daily history (last 30 days) — from our DB ────────────────────
  app.get("/api/market/bags-history", async (req, res) => {
    try {
      const days = Math.min(Number(req.query.days) || 30, 60);
      const allLaunches = await storage.getAllSuccessfulLaunches();
      const bagsLaunches = allLaunches.filter(l => l.launchpad === "bags.fm" || l.launchpad === "bags");

      // Build a map of date -> count for last N days
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      const byDate: Record<string, number> = {};

      // Pre-fill all days with 0 so the chart shows the full range
      for (let d = 0; d < days; d++) {
        const ts = Date.now() - d * 24 * 60 * 60 * 1000;
        const key = new Date(ts).toISOString().slice(0, 10);
        byDate[key] = 0;
      }

      bagsLaunches.forEach(l => {
        const t = new Date(l.createdAt).getTime();
        if (t < cutoff) return;
        const key = new Date(l.createdAt).toISOString().slice(0, 10);
        byDate[key] = (byDate[key] ?? 0) + 1;
      });

      // Sort ascending by date
      const history = Object.entries(byDate)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      res.json(history);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch Bags.fm history" });
    }
  });

  // ── Bags.fm stats (from our launch DB) — token-gated section ──────────────
  app.get("/api/market/bags-stats", async (req, res) => {
    try {
      const allLaunches = await storage.getAllSuccessfulLaunches();
      const bagsLaunches = allLaunches.filter(l => l.launchpad === "bags.fm" || l.launchpad === "bags");
      const now = Date.now();
      const h24 = now - 24 * 60 * 60 * 1000;
      const h48 = now - 48 * 60 * 60 * 1000;
      const last24 = bagsLaunches.filter(l => new Date(l.createdAt).getTime() > h24);
      const prev24 = bagsLaunches.filter(l => {
        const t = new Date(l.createdAt).getTime();
        return t > h48 && t <= h24;
      });
      const trend = prev24.length > 0
        ? Math.round(((last24.length - prev24.length) / prev24.length) * 100)
        : null;
      res.json({
        total: bagsLaunches.length,
        last24h: last24.length,
        prev24h: prev24.length,
        trendPct: trend,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch Bags.fm stats" });
    }
  });

  // ── Market stats — public (summary only) ───────────────────────────────────
  app.get("/api/market/stats", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      const stats = await getMarketStats();
      // Public: only aggregate numbers, no per-token detail
      res.json({
        totalLaunches: stats.totalLaunches,
        estimatedDailyLaunches: stats.estimatedDailyLaunches,
        actualWindowMinutes: stats.actualWindowMinutes,
        graduatedCount: stats.graduatedCount,
        hits100k: stats.hits100k,
        hits1m: stats.hits1m,
        hits10m: stats.hits10m,
        solPriceUsd: stats.solPriceUsd,
        windowHours: stats.windowHours,
        source: stats.source,
        fetchedAt: stats.fetchedAt,
      });
    } catch (err: any) {
      console.error("[routes] /api/market/stats error:", err.message);
      res.status(500).json({ message: "Failed to fetch market stats" });
    }
  });

  // ── Market chart — token-gated ──────────────────────────────────────────────
  app.get("/api/market/chart", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      const days = Math.min(Number(req.query.days) || 14, 30);
      const snapshots = await storage.getMarketSnapshots(days);
      res.json(snapshots);
    } catch (err: any) {
      console.error("[routes] /api/market/chart error:", err.message);
      res.status(500).json({ message: "Failed to fetch market chart data" });
    }
  });

  // ── Market signal — token-gated ─────────────────────────────────────────────
  app.get("/api/market/signal", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      const stats = await getMarketStats();
      const signal = generateSignal(stats);
      res.json(signal);
    } catch (err: any) {
      console.error("[routes] /api/market/signal error:", err.message);
      res.status(500).json({ message: "Failed to generate signal" });
    }
  });

  // ── Wallet $FEATHER balance check (legacy path alias) ─────────────────────────
  app.get("/api/wallet/:address/trenchy-balance", async (req, res) => {
    try {
      const { address } = req.params;
      if (!isEvmAddress(address)) {
        return res.status(400).json({ message: "Invalid EVM wallet address" });
      }
      const { getFeatherBalance } = await import("./tokengate");
      const { resolveFeatherTokenAddress } = await import("./featherToken");
      const [balance, mint] = await Promise.all([
        getFeatherBalance(address),
        resolveFeatherTokenAddress(),
      ]);
      res.json({ balance, address, mint });
    } catch (err: any) {
      console.error("[routes] trenchy-balance error:", err.message);
      res.status(500).json({ message: "Failed to check balance" });
    }
  });

  app.get("/api/wallet/:address/feather-balance", async (req, res) => {
    try {
      const { address } = req.params;
      if (!isEvmAddress(address)) {
        return res.status(400).json({ message: "Invalid EVM wallet address" });
      }
      const { getFeatherBalance } = await import("./tokengate");
      const { resolveFeatherTokenAddress } = await import("./featherToken");
      const [balance, mint] = await Promise.all([
        getFeatherBalance(address),
        resolveFeatherTokenAddress(),
      ]);
      res.json({ balance, address, mint });
    } catch (err: any) {
      console.error("[routes] feather-balance error:", err.message);
      res.status(500).json({ message: "Failed to check balance" });
    }
  });

  // ── DEX: Payment info (prices + how much to send) ──────────────────────────
  app.get("/api/dex/payment-info", async (req, res) => {
    try {
      const usdAmount = Number(req.query.usd) || LISTING_FEE_USD;
      const [eth, usdc, feather] = await Promise.all([
        getRequiredPayment("eth", usdAmount),
        getRequiredPayment("usdc", usdAmount),
        getRequiredPayment("feather", usdAmount),
      ]);
      const ethPayload = eth ? { amountRaw: eth.amountRaw.toString(), display: eth.amountDisplay } : null;
      const usdcPayload = usdc ? { amountRaw: usdc.amountRaw.toString(), display: usdc.amountDisplay } : null;
      const featherPayload = feather ? { amountRaw: feather.amountRaw.toString(), display: feather.amountDisplay } : null;
      res.json({
        usdAmount,
        botWallet: BOT_WALLET,
        usdcMint: USDC_MINT,
        featherMint: FEATHER_MINT,
        trenchyMint: FEATHER_MINT, // legacy alias
        eth: ethPayload,
        usdc: usdcPayload,
        feather: featherPayload,
        // legacy aliases (sol→eth, trenchy→feather)
        sol: ethPayload,
        trenchy: featherPayload,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── DEX: Boost tier info ────────────────────────────────────────────────────
  app.get("/api/dex/boost-info", async (req, res) => {
    const tiers = await Promise.all(
      Object.entries(BOOST_TIERS).map(async ([tier, info]) => {
        const [eth, usdc, feather] = await Promise.all([
          getRequiredPayment("eth", info.usd),
          getRequiredPayment("usdc", info.usd),
          getRequiredPayment("feather", info.usd),
        ]);
        const ethPayload = eth ? { amountRaw: eth.amountRaw.toString(), display: eth.amountDisplay } : null;
        const usdcPayload = usdc ? { amountRaw: usdc.amountRaw.toString(), display: usdc.amountDisplay } : null;
        const featherPayload = feather ? { amountRaw: feather.amountRaw.toString(), display: feather.amountDisplay } : null;
        return {
          tier: Number(tier),
          label: info.label,
          usd: info.usd,
          durationHours: info.durationHours,
          eth: ethPayload,
          usdc: usdcPayload,
          feather: featherPayload,
          sol: ethPayload,
          trenchy: featherPayload,
        };
      })
    );
    res.json({ botWallet: BOT_WALLET, tiers });
  });

  // ── DEX: Ad package info ────────────────────────────────────────────────────
  app.get("/api/dex/ad-info", async (req, res) => {
    const packages = await Promise.all(
      Object.entries(AD_PACKAGES).map(async ([key, info]) => {
        const [eth, usdc, feather] = await Promise.all([
          getRequiredPayment("eth", info.usd),
          getRequiredPayment("usdc", info.usd),
          getRequiredPayment("feather", info.usd),
        ]);
        const ethPayload = eth ? { amountRaw: eth.amountRaw.toString(), display: eth.amountDisplay } : null;
        const usdcPayload = usdc ? { amountRaw: usdc.amountRaw.toString(), display: usdc.amountDisplay } : null;
        const featherPayload = feather ? { amountRaw: feather.amountRaw.toString(), display: feather.amountDisplay } : null;
        return {
          key,
          label: info.label,
          usd: info.usd,
          durationHours: info.durationHours,
          eth: ethPayload,
          usdc: usdcPayload,
          feather: featherPayload,
          sol: ethPayload,
          trenchy: featherPayload,
        };
      })
    );
    res.json({ botWallet: BOT_WALLET, packages });
  });

  // ── DEX: List active listings ───────────────────────────────────────────────
  app.get("/api/dex/listings", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const offset = Number(req.query.offset) || 0;
      const listings = await storage.getDexListings({ limit, offset });
      res.json(listings);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── DEX: Get single listing ─────────────────────────────────────────────────
  app.get("/api/dex/listings/:mintAddress", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      const listing = await storage.getDexListing(req.params.mintAddress);
      if (!listing) return res.status(404).json({ message: "Listing not found" });
      const boosts = await storage.getBoostsForListing(listing.id);
      res.json({ ...listing, activeBoosts: boosts });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── DEX: Submit a new listing ───────────────────────────────────────────────
  app.post("/api/dex/listings", async (req, res) => {
    try {
      const raw = req.body;

      // Sanitize all inputs server-side
      const mintAddress       = sanitizeText(raw.mintAddress, 100).replace(/\s/g, "");
      const name              = sanitizeText(raw.name, 80);
      const ticker            = sanitizeText(raw.ticker, 20).toUpperCase();
      const description       = sanitizeText(raw.description, 500);
      const logoUrl           = validateOnlySafeUrl(raw.logoUrl) || (typeof raw.logoUrl === "string" && raw.logoUrl.startsWith("/uploads/") ? raw.logoUrl : "");
      const website           = validateOnlySafeUrl(raw.website);
      const twitter           = sanitizeText(raw.twitter, 100);
      const telegram          = validateOnlySafeUrl(raw.telegram);
      const discord           = validateOnlySafeUrl(raw.discord);
      const tags              = sanitizeText(raw.tags, 200);
      const submitterWallet   = sanitizeText(raw.submitterWallet, 100).replace(/\s/g, "");
      const paymentTxSignature = sanitizeText(raw.paymentTxSignature, 200).replace(/\s/g, "");
      const paymentCurrency   = sanitizeText(raw.paymentCurrency, 20).toLowerCase();

      if (!mintAddress || !name || !ticker || !submitterWallet || !paymentTxSignature || !paymentCurrency) {
        return res.status(400).json({ message: "Missing required fields." });
      }
      if (!["eth", "usdc", "feather", "sol", "trenchy"].includes(paymentCurrency)) {
        return res.status(400).json({ message: "Invalid payment currency. Use eth, usdc, or feather." });
      }

      // Prevent duplicate mint addresses
      const existing = await storage.getDexListing(mintAddress);
      if (existing) return res.status(409).json({ message: "This token is already listed." });

      // Prevent signature reuse
      if (await storage.isSignatureUsed(paymentTxSignature)) {
        return res.status(409).json({ message: "This transaction signature has already been used." });
      }

      // Get required payment amount
      const required = await getRequiredPayment(paymentCurrency as any, LISTING_FEE_USD);
      if (!required) return res.status(503).json({ message: "Could not fetch current token price. Try again." });

      // Verify on-chain payment
      const result = await verifyPayment(paymentTxSignature, paymentCurrency as any, required.amountRaw);
      if (!result.ok) return res.status(402).json({ message: result.error });

      // Mark signature as used
      await storage.markSignatureUsed(paymentTxSignature);

      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days
      const listing = await storage.createDexListing({
        mintAddress, name, ticker,
        description: description || null,
        logoUrl: logoUrl || null,
        website: website || null,
        twitter: twitter || null,
        telegram: telegram || null,
        discord: discord || null,
        tags: tags || null,
        submitterWallet,
        status: "active",
        paymentTxSignature,
        paymentCurrency,
        paymentAmountRaw: result.amountRaw!.toString(),
        expiresAt,
      });

      res.json(listing);
    } catch (err: any) {
      console.error("[dex] listing submission error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // ── DEX: Market data proxy (DexScreener) ────────────────────────────────────
  app.get("/api/dex/market/:mintAddress", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "max-age=30");
      const data = await fetchDexScreenerData(req.params.mintAddress);
      if (!data) return res.status(503).json({ message: "Market data unavailable" });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Factory token detail (on-chain launchpad) — for /dex/:address before DexScreener indexes
  app.get("/api/factory-token/:address", async (req, res) => {
    try {
      const address = String(req.params.address || "");
      if (!isEvmAddress(address)) return res.status(400).json({ message: "Invalid address" });
      res.setHeader("Cache-Control", "max-age=20");

      let dbLaunch: {
        mintAddress: string | null;
        coinName: string;
        ticker: string;
        imageUrl: string | null;
        createdAt: Date | null;
      } | null = null;
      try {
        const launches = await storage.getAllSuccessfulLaunches();
        const found = launches.find(
          (l) => l.mintAddress && normalizeWallet(l.mintAddress) === normalizeWallet(address)
        );
        if (found) {
          dbLaunch = {
            mintAddress: found.mintAddress,
            coinName: found.coinName,
            ticker: found.ticker,
            imageUrl: found.imageUrl,
            createdAt: found.createdAt,
          };
        }
      } catch {
        /* ignore */
      }

      const token = await getFeatherFactoryTokenDetail(address, dbLaunch);
      if (!token) return res.status(404).json({ message: "Not a Feather App launchpad token", exists: false });

      // Sample bonding-curve price for live chart (throttled in storage)
      if (!token.migrated && (token.priceUsd != null || token.priceEth != null)) {
        try {
          await storage.recordBondingPriceTick({
            tokenAddress: address,
            priceUsd: token.priceUsd ?? null,
            priceEth: token.priceEth ?? null,
            bondingProgressPct: token.bondingProgressPct ?? null,
          });
        } catch {
          /* non-fatal */
        }
      }

      res.json({ exists: true, ...token });
    } catch (err: any) {
      console.error("[factory-token]", err);
      res.status(500).json({ message: err.message ?? "Failed to load factory token" });
    }
  });

  // Bonding-curve price history for pre-migration charts
  app.get("/api/factory-token/:address/chart", async (req, res) => {
    try {
      const address = String(req.params.address || "");
      if (!isEvmAddress(address)) return res.status(400).json({ message: "Invalid address" });
      const ticks = await storage.getBondingPriceTicks(address, 180);
      res.setHeader("Cache-Control", "max-age=15");
      res.json({
        tokenAddress: address,
        points: ticks.map((t) => ({
          t: t.recordedAt ? new Date(t.recordedAt).getTime() : Date.now(),
          priceUsd: t.priceUsd,
          priceEth: t.priceEth,
          bondingProgressPct: t.bondingProgressPct,
        })),
      });
    } catch (err: any) {
      console.error("[factory-token/chart]", err);
      res.status(500).json({ message: err.message ?? "Failed to load chart" });
    }
  });

  // ── DEX: Search DexScreener ──────────────────────────────────────────────────
  app.get("/api/dex/search", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      if (!q) return res.json({ pairs: [] });
      res.setHeader("Cache-Control", "max-age=30");
      const data = await searchDexScreener(q);
      res.json(data ?? { pairs: [] });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── DEX: Buy a boost ────────────────────────────────────────────────────────
  app.post("/api/dex/boost", async (req, res) => {
    try {
      const { mintAddress, boostTier, paymentTxSignature, paymentCurrency } = req.body;
      if (!mintAddress || !boostTier || !paymentTxSignature || !paymentCurrency) {
        return res.status(400).json({ message: "Missing required fields." });
      }
      const tier = BOOST_TIERS[Number(boostTier)];
      if (!tier) return res.status(400).json({ message: "Invalid boost tier." });

      const listing = await storage.getDexListing(mintAddress);
      if (!listing || listing.status !== "active") {
        return res.status(404).json({ message: "Active listing not found for this token." });
      }
      if (await storage.isSignatureUsed(paymentTxSignature)) {
        return res.status(409).json({ message: "Transaction signature already used." });
      }

      const required = await getRequiredPayment(paymentCurrency as any, tier.usd);
      if (!required) return res.status(503).json({ message: "Could not fetch token price." });

      const result = await verifyPayment(paymentTxSignature, paymentCurrency as any, required.amountRaw);
      if (!result.ok) return res.status(402).json({ message: result.error });

      await storage.markSignatureUsed(paymentTxSignature);

      const expiresAt = new Date(Date.now() + tier.durationHours * 60 * 60 * 1000);
      const boost = await storage.createDexBoost({
        listingId: listing.id,
        boostTier: Number(boostTier),
        paymentTxSignature,
        paymentCurrency,
        paymentAmountRaw: result.amountRaw!.toString(),
        expiresAt,
      });

      res.json(boost);
    } catch (err: any) {
      console.error("[dex] boost error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // ── DEX: Active banner ads ──────────────────────────────────────────────────
  app.get("/api/dex/ads", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "max-age=60");
      const ads = await storage.getActiveDexAds();
      res.json(ads);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── DEX: Submit an ad ──────────────────────────────────────────────────────
  app.post("/api/dex/ads", async (req, res) => {
    try {
      const { imageUrl, linkUrl, label, submitterWallet, paymentTxSignature, paymentCurrency, packageKey } = req.body;
      if (!imageUrl || !linkUrl || !submitterWallet || !paymentTxSignature || !paymentCurrency || !packageKey) {
        return res.status(400).json({ message: "Missing required fields." });
      }
      const pkg = AD_PACKAGES[packageKey];
      if (!pkg) return res.status(400).json({ message: "Invalid ad package." });

      if (await storage.isSignatureUsed(paymentTxSignature)) {
        return res.status(409).json({ message: "Transaction signature already used." });
      }

      const required = await getRequiredPayment(paymentCurrency as any, pkg.usd);
      if (!required) return res.status(503).json({ message: "Could not fetch token price." });

      const result = await verifyPayment(paymentTxSignature, paymentCurrency as any, required.amountRaw);
      if (!result.ok) return res.status(402).json({ message: result.error });

      await storage.markSignatureUsed(paymentTxSignature);

      const expiresAt = new Date(Date.now() + pkg.durationHours * 60 * 60 * 1000);
      const ad = await storage.createDexAd({
        imageUrl, linkUrl,
        label: label || undefined,
        submitterWallet,
        paymentTxSignature,
        paymentCurrency,
        paymentAmountRaw: result.amountRaw!.toString(),
        expiresAt,
      });

      res.json(ad);
    } catch (err: any) {
      console.error("[dex] ad submission error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // ── DEX: Batch market data ──────────────────────────────────────────────────
  app.get("/api/dex/market-batch", async (req, res) => {
    try {
      const addresses = String(req.query.addresses || "")
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean)
        .slice(0, 30);
      if (!addresses.length) return res.json({});
      res.setHeader("Cache-Control", "max-age=30");
      const joined = addresses.join(",");
      const data = await fetchDexScreenerData(joined);
      if (!data?.pairs) return res.json({});
      const map: Record<string, any> = {};
      for (const pair of data.pairs) {
        const addr = pair.baseToken?.address;
        if (!addr) continue;
        if (!map[addr] || (pair.liquidity?.usd ?? 0) > (map[addr].liquidity?.usd ?? 0)) {
          map[addr] = pair;
        }
      }
      res.json(map);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── DEX: Active boosts ─────────────────────────────────────────────────────
  app.get("/api/dex/boosts-active", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "max-age=60");
      const boosts = await storage.getActiveDexBoosts();
      res.json(boosts);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── DEX: Track ad impression ────────────────────────────────────────────────
  app.post("/api/dex/ads/:id/impression", async (req, res) => {
    try {
      await storage.incrementAdImpressions(Number(req.params.id));
      res.json({ ok: true });
    } catch {
      res.json({ ok: false });
    }
  });

  // ── DEX: Logo upload ────────────────────────────────────────────────────────
  app.post("/api/dex/upload-logo", express.json({ limit: "3mb" }), async (req, res) => {
    try {
      const { imageBase64 } = req.body;
      if (!imageBase64 || typeof imageBase64 !== "string") {
        return res.status(400).json({ message: "Missing imageBase64 field." });
      }
      const match = imageBase64.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/);
      if (!match) {
        return res.status(400).json({ message: "Invalid image data. Only JPEG, PNG, GIF, and WebP are supported." });
      }
      const [, mimeType, b64Data] = match;
      const ext = mimeType.split("/")[1].replace("jpeg", "jpg");
      const buf = Buffer.from(b64Data, "base64");
      if (buf.length > 2_000_000) {
        return res.status(413).json({ message: "Image too large. Max 2MB." });
      }
      const filename = `${crypto.randomBytes(16).toString("hex")}.${ext}`;
      const logosDir = path.join(process.cwd(), "uploads", "logos");
      if (!fs.existsSync(logosDir)) fs.mkdirSync(logosDir, { recursive: true });
      fs.writeFileSync(path.join(logosDir, filename), buf);
      res.json({ url: `/uploads/logos/${filename}` });
    } catch (err: any) {
      console.error("[dex] logo upload error:", err);
      res.status(500).json({ message: "Upload failed." });
    }
  });

  // ── /api/chain-tokens — DexScreener proxy for Robinhood Chain only ───────────
  const chainTokenCache = new Map<string, { data: unknown; ts: number }>();
  const CACHE_TTL = 30_000;

  // Broad queries to capture high-volume tokens on Robinhood Chain DEXes (Uniswap v2/v3/v4).
  const DEFAULT_QUERIES = [
    "WETH",
    "ETH",
    "USDC",
    "uniswap",
    "HOOD",
    "robinhood",
  ];

  async function fetchDexPairs(q: string): Promise<any[]> {
    const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { "User-Agent": "FeatherApp/1.0" } });
    if (!res.ok) return [];
    const json: any = await res.json();
    return (json.pairs ?? []).filter((p: any) => p.chainId === DEXSCREENER_CHAIN_ID);
  }

  function cleanPair(p: any) {
    return {
      pairAddress: p.pairAddress,
      dexId: (p.dexId ?? "").toLowerCase(),
      tokenAddress: p.baseToken?.address ?? "",
      symbol: p.baseToken?.symbol ?? "",
      name: p.baseToken?.name ?? "",
      icon: p.info?.imageUrl ?? null,
      priceUsd: p.priceUsd ? Number(p.priceUsd) : null,
      priceChangeM5: p.priceChange?.m5 ?? null,
      priceChangeH1: p.priceChange?.h1 ?? null,
      priceChangeH6: p.priceChange?.h6 ?? null,
      priceChangeH24: p.priceChange?.h24 ?? null,
      volumeM5: p.volume?.m5 ?? null,
      volumeH1: p.volume?.h1 ?? null,
      volumeH6: p.volume?.h6 ?? null,
      volumeH24: p.volume?.h24 ?? null,
      buysH24: p.txns?.h24?.buys ?? 0,
      sellsH24: p.txns?.h24?.sells ?? 0,
      txnsH24: (p.txns?.h24?.buys ?? 0) + (p.txns?.h24?.sells ?? 0),
      liquidity: p.liquidity?.usd ?? null,
      fdv: p.fdv ?? null,
      marketCap: p.marketCap ?? null,
      createdAt: p.pairCreatedAt ?? null,
    };
  }

  async function buildChainTokenResponse(q: string) {
    const cacheKey = q || "__default__";
    const cached = chainTokenCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return cached.data;
    }

    let rawPairs: any[] = [];
    if (q) {
      rawPairs = await fetchDexPairs(q);
    } else {
      const results = await Promise.allSettled(DEFAULT_QUERIES.map(fetchDexPairs));
      const seenPairs = new Set<string>();
      for (const r of results) {
        if (r.status === "fulfilled") {
          for (const p of r.value) {
            if (p.pairAddress && !seenPairs.has(p.pairAddress)) {
              seenPairs.add(p.pairAddress);
              rawPairs.push(p);
            }
          }
        }
      }
    }

    const tokenMap = new Map<string, { bestPair: any; allDexIds: Set<string>; pairsCount: number }>();
    for (const p of rawPairs) {
      const addr = p.baseToken?.address;
      if (!addr) continue;
      const vol = p.volume?.h24 ?? 0;
      const dexId = (p.dexId ?? "").toLowerCase();
      const existing = tokenMap.get(addr);
      if (!existing) {
        tokenMap.set(addr, { bestPair: p, allDexIds: new Set([dexId]), pairsCount: 1 });
      } else {
        existing.allDexIds.add(dexId);
        existing.pairsCount++;
        if (vol > (existing.bestPair.volume?.h24 ?? 0)) {
          existing.bestPair = p;
        }
      }
    }

    const deduped = Array.from(tokenMap.values())
      .sort((a, b) => (b.bestPair.volume?.h24 ?? 0) - (a.bestPair.volume?.h24 ?? 0))
      .slice(0, 100);

    const now = new Date();
    const [allStatuses, dbLaunches] = await Promise.all([
      storage.getAllTokenStatuses(),
      storage.getAllSuccessfulLaunches().catch(() => []),
    ]);
    const factory = await getFeatherFactoryTokens(80, dbLaunches).catch(() => ({
      tokens: [],
      addressSet: new Set<string>(),
    }));
    const statusMap = new Map(allStatuses.map((s) => [s.tokenAddress, s]));
    // Also index statuses by lowercase for EVM casing
    const statusByLower = new Map(
      allStatuses.map((s) => [normalizeWallet(s.tokenAddress), s])
    );

    const data = deduped.map(({ bestPair, allDexIds, pairsCount }) => {
      const clean = cleanPair(bestPair);
      const status =
        statusMap.get(clean.tokenAddress) ??
        statusByLower.get(normalizeWallet(clean.tokenAddress));
      const boostActive = status?.boostTier && status.boostTier > 0
        && status.boostExpiresAt && status.boostExpiresAt > now;
      const isFeatherLaunch = factory.addressSet.has(normalizeWallet(clean.tokenAddress));
      const launchpad = isFeatherLaunch
        ? FEATHER_LAUNCHPAD_ID
        : (bestPair.dexId ?? "").toLowerCase().includes("uniswap")
          ? "uniswap"
          : (bestPair.dexId ?? "dex");
      return {
        ...clean,
        allDexIds: Array.from(allDexIds),
        pairsCount,
        isPaid: status?.isPaid ?? false,
        boostTier: boostActive ? (status!.boostTier) : 0,
        launchpad,
        chainId: DEXSCREENER_CHAIN_ID,
      };
    });

    // Merge factory tokens DexScreener hasn't indexed yet (or that fell outside top-100 volume)
    const seenAddrs = new Set(data.map((t) => normalizeWallet(t.tokenAddress)));
    const qLower = q.toLowerCase();
    for (const ft of factory.tokens) {
      const key = normalizeWallet(ft.tokenAddress);
      if (seenAddrs.has(key)) continue;
      if (qLower) {
        const hay = `${ft.name} ${ft.symbol} ${ft.tokenAddress}`.toLowerCase();
        if (!hay.includes(qLower)) continue;
      }
      const status = statusByLower.get(key);
      const boostActive = status?.boostTier && status.boostTier > 0
        && status.boostExpiresAt && status.boostExpiresAt > now;
      data.push({
        ...ft,
        isPaid: status?.isPaid ?? false,
        boostTier: boostActive ? (status!.boostTier) : 0,
      });
      seenAddrs.add(key);
    }

    // Feather launches first among equal volume, then volume desc
    data.sort((a, b) => {
      const aFeather = a.launchpad === FEATHER_LAUNCHPAD_ID ? 1 : 0;
      const bFeather = b.launchpad === FEATHER_LAUNCHPAD_ID ? 1 : 0;
      if (aFeather !== bFeather && (a.volumeH24 ?? 0) === 0 && (b.volumeH24 ?? 0) === 0) {
        return bFeather - aFeather;
      }
      return (b.volumeH24 ?? 0) - (a.volumeH24 ?? 0);
    });

    chainTokenCache.set(cacheKey, { data, ts: Date.now() });
    return data;
  }

  app.get("/api/chain-tokens", async (req, res) => {
    try {
      const q = (req.query.q as string | undefined)?.trim() ?? "";
      res.json(await buildChainTokenResponse(q));
    } catch (err) {
      console.error("[chain-tokens]", err);
      res.status(500).json({ message: "Failed to fetch token data" });
    }
  });

  // Legacy alias kept for older clients — same Robinhood Chain data as /api/chain-tokens
  app.get("/api/solana-tokens", async (req, res) => {
    try {
      const q = (req.query.q as string | undefined)?.trim() ?? "";
      res.json(await buildChainTokenResponse(q));
    } catch (err) {
      console.error("[chain-tokens alias]", err);
      res.status(500).json({ message: "Failed to fetch token data" });
    }
  });

  // ── Robinhood Chain-wide stats (aggregated from cached pair data) ────────────
  async function buildChainStats() {
    const allPairs: any[] = [];
    const seen = new Set<string>();
    for (const entry of Array.from(chainTokenCache.values())) {
      if (Array.isArray(entry.data)) {
        for (const t of entry.data as any[]) {
          if (!seen.has(t.pairAddress)) {
            seen.add(t.pairAddress);
            allPairs.push(t);
          }
        }
      }
    }
    // Warm cache if empty
    if (allPairs.length === 0) {
      await buildChainTokenResponse("");
      for (const entry of Array.from(chainTokenCache.values())) {
        if (Array.isArray(entry.data)) {
          for (const t of entry.data as any[]) {
            if (!seen.has(t.pairAddress)) {
              seen.add(t.pairAddress);
              allPairs.push(t);
            }
          }
        }
      }
    }
    const volume24h = allPairs.reduce((s, t) => s + (t.volumeH24 ?? 0), 0);
    const txns24h = allPairs.reduce((s, t) => s + (t.txnsH24 ?? 0), 0);
    return { volume24h, txns24h, pairsCount: allPairs.length, chainId: DEXSCREENER_CHAIN_ID };
  }

  app.get("/api/chain-stats", async (_req, res) => {
    try {
      res.json(await buildChainStats());
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/solana-chain-stats", async (_req, res) => {
    try {
      res.json(await buildChainStats());
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Uniswap Trading API proxy (API key stays server-side) ─────────────────────

  app.get("/api/swap/status", (_req, res) => {
    const configured = isUniswapTradeConfigured();
    const raw =
      process.env.UNISWAP_API_KEY?.trim() ||
      process.env.UNISWAP_TRADING_API_KEY?.trim() ||
      "";
    res.json({
      configured,
      chainId: 4663,
      nativeToken: NATIVE_ETH,
      // Helps diagnose placeholder / missing keys without exposing the secret
      hint: configured
        ? "ok"
        : !raw
          ? "missing_key"
          : "placeholder_or_invalid_key",
    });
  });

  app.post("/api/swap/quote", express.json({ limit: "32kb" }), async (req, res) => {
    try {
      if (!isUniswapTradeConfigured()) {
        return res.status(503).json({
          error: "Uniswap Trading API is not configured. Set UNISWAP_API_KEY in .env",
        });
      }
      const {
        swapper,
        tokenIn,
        tokenOut,
        amount,
        type,
        slippageTolerance,
      } = req.body || {};

      const result = await uniswapGetQuote({
        swapper: String(swapper || ""),
        tokenIn: String(tokenIn || ""),
        tokenOut: String(tokenOut || ""),
        amount: String(amount || ""),
        type: type === "EXACT_OUTPUT" ? "EXACT_OUTPUT" : "EXACT_INPUT",
        slippageTolerance:
          typeof slippageTolerance === "number" ? slippageTolerance : Number(slippageTolerance) || 1,
      });

      if (!result.ok) {
        const status = result.status === 404 ? 422 : result.status >= 400 ? result.status : 502;
        const error =
          /no quotes? available/i.test(result.error)
            ? "No Uniswap route found for this pair/amount on Robinhood Chain. Try a larger amount, or open Uniswap."
            : result.error;
        return res.status(status).json({
          error,
          detail: result.data,
        });
      }

      const amounts = extractQuoteAmounts(result.data);
      if (!amounts.amountOut) {
        return res.status(422).json({
          error: "Quote returned without an output amount",
          detail: result.data,
        });
      }
      res.json({
        quoteResponse: result.data,
        amountIn: amounts.amountIn,
        amountOut: amounts.amountOut,
        routing: amounts.routing,
        gasFeeUSD: amounts.gasFeeUSD,
        permitData: result.data?.permitData ?? null,
      });
    } catch (err: any) {
      console.error("[swap/quote]", err);
      res.status(400).json({ error: err.message || "Quote failed" });
    }
  });

  app.post("/api/swap/check-approval", express.json({ limit: "16kb" }), async (req, res) => {
    try {
      if (!isUniswapTradeConfigured()) {
        return res.status(503).json({ error: "Uniswap Trading API is not configured" });
      }
      const { walletAddress, token, amount } = req.body || {};
      const result = await uniswapCheckApproval({
        walletAddress: String(walletAddress || ""),
        token: String(token || ""),
        amount: String(amount || ""),
      });
      if (!result.ok) {
        return res.status(result.status >= 400 ? result.status : 502).json({
          error: result.error,
          detail: result.data,
        });
      }
      res.json(result.data);
    } catch (err: any) {
      console.error("[swap/check-approval]", err);
      res.status(400).json({ error: err.message || "Approval check failed" });
    }
  });

  app.post("/api/swap/execute", express.json({ limit: "256kb" }), async (req, res) => {
    try {
      if (!isUniswapTradeConfigured()) {
        return res.status(503).json({ error: "Uniswap Trading API is not configured" });
      }
      const { quoteResponse, signature } = req.body || {};
      if (!quoteResponse || typeof quoteResponse !== "object") {
        return res.status(400).json({ error: "quoteResponse is required" });
      }
      const result = await getSwapTransaction(
        quoteResponse,
        typeof signature === "string" ? signature : null
      );
      if (!result.ok) {
        return res.status(result.status >= 400 ? result.status : 502).json({
          error: result.error,
          detail: result.data,
        });
      }

      const swap = result.data?.swap;
      if (!swap?.data || swap.data === "0x") {
        return res.status(409).json({
          error: "Swap calldata empty — quote may have expired. Request a fresh quote.",
          detail: result.data,
        });
      }

      res.json({
        swap,
        routing: quoteResponse.routing ?? null,
      });
    } catch (err: any) {
      console.error("[swap/execute]", err);
      res.status(400).json({ error: err.message || "Swap build failed" });
    }
  });

  // ── Token status routes ───────────────────────────────────────────────────────

  app.get("/api/status/:address", async (req, res) => {
    const { address } = req.params;
    const status = await storage.getTokenStatus(address);
    const now = new Date();
    const boostActive = status?.boostTier && status.boostTier > 0
      && status.boostExpiresAt && status.boostExpiresAt > now;
    res.json({
      isPaid: status?.isPaid ?? false,
      paidAt: status?.paidAt ?? null,
      paidBy: status?.paidBy ?? null,
      claimedByWallet: status?.claimedByWallet ?? null,
      boostTier: boostActive ? status!.boostTier : 0,
      boostExpiresAt: boostActive ? status!.boostExpiresAt : null,
      tokenName: status?.tokenName ?? null,
      tokenSymbol: status?.tokenSymbol ?? null,
      description: status?.description ?? null,
      logoIpfsCid: status?.logoIpfsCid ?? null,
      bannerIpfsCid: status?.bannerIpfsCid ?? null,
      metadataIpfsCid: status?.metadataIpfsCid ?? null,
      logoUrl: status?.logoIpfsCid ? ipfsUrl(status.logoIpfsCid) : null,
      bannerUrl: status?.bannerIpfsCid ? ipfsUrl(status.bannerIpfsCid) : null,
      twitter: status?.twitter ?? null,
      discord: status?.discord ?? null,
      website: status?.website ?? null,
      github: status?.github ?? null,
    });
  });

  // ── IPFS upload (image → Pinata or local) ───────────────────────────────────
  const ipfsUploadSchema = z.object({
    imageBase64: z.string().min(100),
    type: z.enum(["logo", "banner", "profile", "post", "img"]).optional().default("img"),
  });

  const ipfsRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { message: "Too many uploads — please wait a minute" },
  });

  app.post("/api/ipfs/upload", ipfsRateLimit, express.json({ limit: "8mb" }), async (req, res) => {
    try {
      const parsed = ipfsUploadSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
      const { imageBase64, type } = parsed.data;
      const match = imageBase64.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/);
      if (!match) {
        return res.status(400).json({ message: "Invalid image. Only JPEG, PNG, GIF, WebP accepted." });
      }
      const [, mimeType, b64Data] = match;
      const buf = Buffer.from(b64Data, "base64");
      if (buf.length > 5_242_880) {
        return res.status(413).json({ message: "Image too large. Max 5MB." });
      }
      const ext = mimeType.split("/")[1].replace("jpeg", "jpg");
      const filename = `${type}-${crypto.randomBytes(8).toString("hex")}.${ext}`;
      const result = await pinFileToIPFS(buf, filename, mimeType);
      res.json(result);
    } catch (err: any) {
      console.error("[ipfs/upload]", err);
      res.status(500).json({ message: err.message });
    }
  });

  // ── Claim Token (full flow with on-chain verification + IPFS metadata) ───────
  app.post("/api/claim", express.json({ limit: "1mb" }), async (req, res) => {
    try {
      const raw = req.body;
      const tokenAddress     = sanitizeText(raw.tokenAddress, 100).replace(/\s/g, "");
      const paymentTxSig     = sanitizeText(raw.paymentTxSignature, 200).replace(/\s/g, "");
      const paymentCurrency  = sanitizeText(raw.paymentCurrency, 20).toLowerCase();
      const walletAddress    = sanitizeText(raw.walletAddress, 100).replace(/\s/g, "");
      const tokenName        = sanitizeText(raw.tokenName, 80);
      const tokenSymbol      = sanitizeText(raw.tokenSymbol, 20).toUpperCase();
      const description      = sanitizeText(raw.description, 1000);
      const logoCid          = sanitizeText(raw.logoCid, 200);
      const bannerCid        = sanitizeText(raw.bannerCid, 200);
      const twitter          = sanitizeText(raw.twitter, 200);
      const discord          = sanitizeText(raw.discord, 200);
      const website          = validateOnlySafeUrl(raw.website) || "";
      const github           = validateOnlySafeUrl(raw.github) || sanitizeText(raw.github, 200);

      if (!tokenAddress || !paymentTxSig || !walletAddress || !paymentCurrency) {
        return res.status(400).json({ message: "tokenAddress, paymentTxSignature, walletAddress, and paymentCurrency are required." });
      }
      if (!["eth", "usdc", "feather", "sol", "trenchy"].includes(paymentCurrency)) {
        return res.status(400).json({ message: "Invalid currency. Use eth, usdc, or feather." });
      }

      // Prevent double-claiming
      const existing = await storage.getTokenStatus(tokenAddress);
      if (existing?.isPaid) {
        return res.status(409).json({ message: "This token has already been claimed." });
      }

      // Prevent signature reuse
      if (await storage.isSignatureUsed(paymentTxSig)) {
        return res.status(409).json({ message: "Transaction signature already used." });
      }

      // Verify on-chain payment (sol→eth, trenchy→feather normalized in getRequiredPayment/verifyPayment)
      const required = await getRequiredPayment(paymentCurrency as any, LISTING_FEE_USD);
      if (!required) return res.status(503).json({ message: "Could not fetch token price. Try again." });

      const verify = await verifyPayment(paymentTxSig, paymentCurrency as any, required.amountRaw);
      if (!verify.ok) return res.status(402).json({ message: verify.error });

      await storage.markSignatureUsed(paymentTxSig);

      // Build + pin metadata JSON to IPFS
      const logoUrl = logoCid ? ipfsUrl(logoCid) : null;
      const bannerUrl = bannerCid ? ipfsUrl(bannerCid) : null;
      const metadata = {
        name: tokenName || undefined,
        symbol: tokenSymbol || undefined,
        description: description || undefined,
        image: logoUrl || undefined,
        banner: bannerUrl || undefined,
        external_url: website || undefined,
        properties: {
          tokenAddress,
          claimedByWallet: walletAddress,
          claimedAt: new Date().toISOString(),
          socials: {
            twitter: twitter || undefined,
            discord: discord || undefined,
            website: website || undefined,
            github: github || undefined,
          },
        },
      };
      let metadataCid = "";
      try {
        const metaResult = await pinJsonToIPFS(metadata, `${tokenAddress}-metadata.json`);
        metadataCid = metaResult.cid;
      } catch (e: any) {
        console.error("[claim] metadata pin failed:", e.message);
      }

      const row = await storage.upsertTokenStatus(tokenAddress, {
        isPaid: true,
        paidAt: new Date(),
        paidBy: walletAddress,
        paymentTxSignature: paymentTxSig,
        claimedByWallet: walletAddress,
        tokenName: tokenName || null,
        tokenSymbol: tokenSymbol || null,
        description: description || null,
        logoIpfsCid: logoCid || null,
        bannerIpfsCid: bannerCid || null,
        metadataIpfsCid: metadataCid || null,
        twitter: twitter || null,
        discord: discord || null,
        website: website || null,
        github: github || null,
      });

      chainTokenCache.clear();
      res.json({
        ...row,
        logoUrl: logoCid ? ipfsUrl(logoCid) : null,
        bannerUrl: bannerCid ? ipfsUrl(bannerCid) : null,
        metadataUrl: metadataCid ? ipfsUrl(metadataCid) : null,
        amountPaid: required.amountDisplay,
      });
    } catch (err: any) {
      console.error("[/api/claim]", err);
      res.status(500).json({ message: err.message });
    }
  });

  // ── Dashboard: get all tokens claimed by a wallet ───────────────────────────
  app.get("/api/dashboard/:wallet", async (req, res) => {
    try {
      const wallet = req.params.wallet?.replace(/\s/g, "");
      if (!wallet || wallet.length < 32) {
        return res.status(400).json({ message: "Invalid wallet address." });
      }
      const tokens = await storage.getTokensByWallet(wallet);
      res.json(tokens.map((t) => ({
        ...t,
        logoUrl: t.logoIpfsCid ? ipfsUrl(t.logoIpfsCid) : null,
        bannerUrl: t.bannerIpfsCid ? ipfsUrl(t.bannerIpfsCid) : null,
      })));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Update token metadata (owner only) ──────────────────────────────────────
  app.put("/api/token/:address/update", express.json({ limit: "1mb" }), async (req, res) => {
    try {
      const tokenAddress = req.params.address?.replace(/\s/g, "");
      const raw = req.body;
      const walletAddress = sanitizeText(raw.walletAddress, 100).replace(/\s/g, "");

      if (!tokenAddress || !walletAddress) {
        return res.status(400).json({ message: "Missing tokenAddress or walletAddress." });
      }

      const existing = await storage.getTokenStatus(tokenAddress);
      if (!existing?.isPaid) {
        return res.status(404).json({ message: "Token not claimed." });
      }
      if (existing.claimedByWallet !== walletAddress) {
        return res.status(403).json({ message: "Not the token owner." });
      }

      const tokenName   = sanitizeText(raw.tokenName, 80);
      const description = sanitizeText(raw.description, 1000);
      const logoCid     = sanitizeText(raw.logoCid, 200);
      const bannerCid   = sanitizeText(raw.bannerCid, 200);
      const twitter     = sanitizeText(raw.twitter, 200);
      const discord     = sanitizeText(raw.discord, 200);
      const website     = validateOnlySafeUrl(raw.website) || "";
      const github      = validateOnlySafeUrl(raw.github) || sanitizeText(raw.github, 200);

      // Re-pin updated metadata
      const logoUrl = logoCid ? ipfsUrl(logoCid) : null;
      const bannerUrl = bannerCid ? ipfsUrl(bannerCid) : null;
      const metadata = {
        name: tokenName || existing.tokenName || undefined,
        symbol: existing.tokenSymbol || undefined,
        description: description || undefined,
        image: logoUrl || undefined,
        banner: bannerUrl || undefined,
        external_url: website || undefined,
        properties: {
          tokenAddress,
          claimedByWallet: walletAddress,
          updatedAt: new Date().toISOString(),
          socials: { twitter: twitter || undefined, discord: discord || undefined, website: website || undefined, github: github || undefined },
        },
      };
      let metadataCid = existing.metadataIpfsCid ?? "";
      try {
        const metaResult = await pinJsonToIPFS(metadata, `${tokenAddress}-metadata-${Date.now()}.json`);
        metadataCid = metaResult.cid;
      } catch (e: any) {
        console.error("[update] metadata pin failed:", e.message);
      }

      const row = await storage.upsertTokenStatus(tokenAddress, {
        tokenName: tokenName || existing.tokenName || null,
        description: description || null,
        logoIpfsCid: logoCid || existing.logoIpfsCid || null,
        bannerIpfsCid: bannerCid || existing.bannerIpfsCid || null,
        metadataIpfsCid: metadataCid || null,
        twitter: twitter || null,
        discord: discord || null,
        website: website || null,
        github: github || null,
      });

      res.json({
        ...row,
        logoUrl: row.logoIpfsCid ? ipfsUrl(row.logoIpfsCid) : null,
        bannerUrl: row.bannerIpfsCid ? ipfsUrl(row.bannerIpfsCid) : null,
      });
    } catch (err: any) {
      console.error("[/api/token/update]", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/boost", async (req, res) => {
    try {
      const { tokenAddress, boostTier, boostExpiresAt } = req.body;
      if (!tokenAddress || !boostTier || !boostExpiresAt) {
        return res.status(400).json({ message: "tokenAddress, boostTier, boostExpiresAt are required" });
      }
      if (![1, 2, 3].includes(Number(boostTier))) {
        return res.status(400).json({ message: "boostTier must be 1, 2, or 3" });
      }
      const row = await storage.upsertTokenStatus(tokenAddress, {
        boostTier: Number(boostTier),
        boostExpiresAt: new Date(boostExpiresAt),
      });
      chainTokenCache.clear();
      res.json(row);
    } catch (err: any) {
      console.error("[/api/boost]", err);
      res.status(500).json({ message: err.message });
    }
  });

  // ── Public site settings (prices) ───────────────────────────────────────────
  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getSiteSettings();
      // Merge with hardcoded defaults so frontend always has values
      const defaults: Record<string, string> = {
        claimFeeUsd: "50",
        boost1PriceUsd: "10", boost1DurationHours: "24",
        boost2PriceUsd: "25", boost2DurationHours: "72",
        boost3PriceUsd: "100", boost3DurationHours: "168",
        adBannerPriceUsd: "20", adBannerDurationDays: "7",
        adSidebarPriceUsd: "50", adSidebarDurationDays: "14",
        adFeaturedPriceUsd: "100", adFeaturedDurationDays: "30",
        // SEO / analytics
        seoTitle: "Feather App - The Premier Platform for Robinhood Chain",
        seoDescription: "Feather App brings profiles, feeds, and discovery to Robinhood Chain so you can share setups, track launches, and build reputation next to the markets you trade.",
        seoKeywords: "Feather App, Robinhood Chain, crypto, token launch, DEX, Uniswap",
        ogImageUrl: "https://featherapp.fun/og_image.jpg",
        gaMeasurementId: "G-9XDT0FZ05B",
        // Uniswap interface fee (widget)
        swapFeeRecipient: ADMIN_WALLET,
        swapFeeBps: "25",
        // $FEATHER contract (admin-overridable; env is fallback)
        featherTokenAddress: FEATHER_TOKEN_ADDRESS || "0x0000000000000000000000000000000000000000",
      };
      // Prefer DB override when set; else keep env default from merge order
      res.json({ ...defaults, ...settings });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Admin auth — EVM personal_sign → JWT ────────────────────────────────────
  app.post("/api/admin/auth", async (req, res) => {
    try {
      const { wallet, signature, message } = req.body;
      if (!wallet || !signature || !message) {
        return res.status(400).json({ error: "wallet, signature, message required" });
      }
      if (!isEvmAddress(wallet) || wallet.toLowerCase() !== ADMIN_WALLET.toLowerCase()) {
        return res.status(403).json({ error: "Not an admin wallet" });
      }
      const valid = await verifyEvmSignature(wallet, message, signature);
      if (!valid) {
        return res.status(401).json({ error: "Invalid signature" });
      }
      const token = jwt.sign({ wallet, role: "admin" }, JWT_SECRET, { expiresIn: "24h" });
      res.json({ token });
    } catch (err: any) {
      console.error("[/api/admin/auth]", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Admin: site settings CRUD ────────────────────────────────────────────────
  app.get("/api/admin/settings", requireAdmin, async (req, res) => {
    try {
      const settings = await storage.getSiteSettings();
      res.json(settings);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/settings", requireAdmin, async (req, res) => {
    try {
      const updates = req.body as Record<string, string>;
      for (const [key, value] of Object.entries(updates)) {
        if (key === "featherTokenAddress") {
          const v = String(value).trim();
          if (v && !isEvmAddress(v)) {
            return res.status(400).json({ error: "featherTokenAddress must be a valid 0x address" });
          }
        }
        await storage.setSiteSetting(key, String(value));
      }
      if ("featherTokenAddress" in updates) {
        const { invalidateFeatherTokenCache } = await import("./featherToken");
        invalidateFeatherTokenCache();
      }
      const settings = await storage.getSiteSettings();
      res.json(settings);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Admin: token claims ──────────────────────────────────────────────────────
  app.get("/api/admin/token-claims", requireAdmin, async (req, res) => {
    try {
      const claims = await storage.getAllPaidTokenStatuses();
      res.json(claims);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/token-claims/:address", requireAdmin, async (req, res) => {
    try {
      const { address } = req.params;
      const data = req.body;
      // Admin can set isPaid=true to bypass payment (manually claim)
      if (data.isPaid && !data.paidAt) data.paidAt = new Date();
      const row = await storage.upsertTokenStatus(address, data);
      chainTokenCache.clear();
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/token-claims/:address", requireAdmin, async (req, res) => {
    try {
      const { address } = req.params;
      const { reason, note } = req.body;
      const row = await storage.upsertTokenStatus(address, {
        isPaid: false,
        isRemoved: true,
        removalReason: reason || "other",
        removalNote: note || null,
        removedAt: new Date(),
        removedBy: ADMIN_WALLET,
      });
      chainTokenCache.clear();
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Admin: ads management ────────────────────────────────────────────────────
  app.get("/api/admin/ads", requireAdmin, async (req, res) => {
    try {
      const ads = await storage.getAllDexAds();
      res.json(ads);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/ads/:id", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const data = req.body;
      const row = await storage.updateDexAd(id, data);
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/ads/:id", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteDexAd(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── User: ads by wallet ──────────────────────────────────────────────────────
  app.get("/api/ads/wallet/:wallet", async (req, res) => {
    try {
      const ads = await storage.getDexAdsByWallet(req.params.wallet);
      res.json(ads);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // User can update their own ad (imageUrl, linkUrl, label only)
  app.patch("/api/ads/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { wallet, imageUrl, linkUrl, label } = req.body;
      if (!wallet) return res.status(400).json({ error: "wallet required" });
      const ads = await storage.getAllDexAds();
      const ad = ads.find((a) => a.id === id);
      if (!ad) return res.status(404).json({ error: "Ad not found" });
      if (ad.submitterWallet !== wallet) return res.status(403).json({ error: "Not your ad" });
      const row = await storage.updateDexAd(id, { imageUrl, linkUrl, label });
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Social layer ──────────────────────────────────────────────────────────────

  const SOCIAL_JWT_SECRET = JWT_SECRET + "_social";

  // Simple in-memory rate limiter: key → [timestamps]
  const _rateLimits = new Map<string, number[]>();
  function socialRateLimit(key: string, maxPerWindow = 10, windowMs = 60_000): boolean {
    const now = Date.now();
    const hits = (_rateLimits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (hits.length >= maxPerWindow) return false;
    hits.push(now);
    _rateLimits.set(key, hits);
    return true;
  }

  // Day-keyed rate limit for agents (resets at UTC midnight)
  function agentDailyLimit(wallet: string, action: string, maxPerDay: number): boolean {
    const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return socialRateLimit(`agent-day:${wallet}:${action}:${day}`, maxPerDay, 24 * 60 * 60 * 1000);
  }

  function requireSocialAuth(req: Request, res: Response, next: NextFunction) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "Social auth required" });
    try {
      const payload = jwt.verify(auth.slice(7), SOCIAL_JWT_SECRET) as { wallet: string; role: string; isAgent?: boolean };
      if (payload.role !== "social") return res.status(403).json({ error: "Invalid token" });
      (req as any).socialWallet = normalizeWallet(payload.wallet);
      (req as any).socialIsAgent = payload.isAgent === true;
      next();
    } catch {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  }

  function sanitize(str: string): string {
    return str.replace(/<[^>]*>/g, "").replace(/[^\w\s\-_.,!?@#$%&*()'":/\u00C0-\u024F\u4e00-\u9fa5]/g, "").trim();
  }

  async function checkContent(text: string): Promise<string | null> {
    const mod = await storage.getModerationSettings();
    const lower = text.toLowerCase();
    for (const word of mod.blacklistedWords) {
      if (lower.includes(word.toLowerCase())) return `Content contains a blocked term: "${word}"`;
    }
    for (const domain of mod.blacklistedDomains) {
      if (lower.includes(domain.toLowerCase())) return `Content links to a blocked domain: "${domain}"`;
    }
    return null;
  }

  // POST /api/social/auth — EVM personal_sign → social JWT
  app.post("/api/social/auth", express.json(), async (req, res) => {
    try {
      const { wallet, signature, message } = req.body ?? {};
      if (!wallet || !signature || !message) return res.status(400).json({ error: "wallet, signature, message required" });
      if (!isEvmAddress(wallet)) return res.status(400).json({ error: "Invalid EVM wallet address" });
      const ok = await verifyEvmSignature(wallet, message, signature);
      if (!ok) return res.status(401).json({ error: "Signature verification failed" });
      const normalized = normalizeWallet(wallet);
      const token = jwt.sign({ wallet: normalized, role: "social" }, SOCIAL_JWT_SECRET, { expiresIn: "7d" });
      res.json({ token });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── AI Agent Registration & Auth ─────────────────────────────────────────────

  // POST /api/agent/register — wallet sig → creates agent profile + issues API key
  // Same $FEATHER gating as human accounts. No admin approval required.
  app.post("/api/agent/register", express.json(), async (req, res) => {
    try {
      const { wallet, signature, message, agentLabel, username, bio, websiteLink } = req.body ?? {};
      if (!wallet || !signature || !message) return res.status(400).json({ error: "wallet, signature, message required" });
      if (!isEvmAddress(wallet)) return res.status(400).json({ error: "Invalid EVM wallet address" });
      const ok = await verifyEvmSignature(wallet, message, signature);
      if (!ok) return res.status(401).json({ error: "Signature verification failed" });

      // Prevent duplicate registrations
      const existing = await storage.getSocialProfile(wallet);
      if (existing) return res.status(409).json({ error: "A profile already exists for this wallet" });

      // Validate agentLabel
      const cleanLabel = agentLabel ? sanitize(agentLabel).slice(0, 50) : null;
      const cleanBio = bio ? sanitize(bio).slice(0, 160) : undefined;

      // Username validation (optional)
      let cleanUsername: string | undefined;
      if (username && typeof username === "string" && username.trim().length > 0) {
        cleanUsername = username.slice(0, 15).trim().toLowerCase();
        if (!/^[a-z0-9_]+$/.test(cleanUsername)) return res.status(400).json({ error: "Username must be alphanumeric/underscore only" });
        if (await storage.isUsernameBlocked(cleanUsername)) return res.status(400).json({ error: "Username is reserved" });
        if (await storage.isUsernameTaken(cleanUsername)) return res.status(409).json({ error: "Username already taken" });
        // Username gating removed — any wallet can claim a username
      }

      // Create profile with isAgent: true
      const profile = await storage.createSocialProfile({
        walletAddress: normalizeWallet(wallet),
        username: cleanUsername,
        bio: cleanBio,
        websiteLink: websiteLink ?? undefined,
        isAgent: true,
        agentLabel: cleanLabel ?? undefined,
      });

      // Auto-follow admin so the agent sees Feather posts
      try {
        const adminProfile = await storage.getSocialProfile(ADMIN_WALLET);
        if (adminProfile) {
          await storage.followUser(profile.walletAddress, adminProfile.walletAddress);
        } else {
          console.warn("[agent/register] Admin profile not found — skip auto-follow");
        }
      } catch (err) {
        console.error("[agent/register] Auto-follow admin failed:", err);
      }

      // Issue API key
      const { key } = await storage.createAgentApiKey(normalizeWallet(wallet), cleanLabel ?? "default");

      // Also issue a JWT for immediate use
      const token = jwt.sign({ wallet: normalizeWallet(wallet), role: "social", isAgent: true }, SOCIAL_JWT_SECRET, { expiresIn: "7d" });

      const { totpSecret: _, ...safe } = profile;
      res.json({ profile: safe, apiKey: key, token });
    } catch (err: any) {
      console.error("[agent/register]", err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/agent/auth — exchange API key for JWT (no wallet sig needed)
  app.post("/api/agent/auth", express.json(), async (req, res) => {
    try {
      const { apiKey } = req.body ?? {};
      if (!apiKey || typeof apiKey !== "string") return res.status(400).json({ error: "apiKey required" });
      const keyRecord = await storage.verifyAgentApiKey(apiKey);
      if (!keyRecord) return res.status(401).json({ error: "Invalid or revoked API key" });
      const profile = await storage.getSocialProfile(keyRecord.agentWallet);
      if (!profile?.isAgent) return res.status(403).json({ error: "Not an agent account" });
      const token = jwt.sign({ wallet: keyRecord.agentWallet, role: "social", isAgent: true }, SOCIAL_JWT_SECRET, { expiresIn: "7d" });
      res.json({ token, wallet: keyRecord.agentWallet });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/agent/keys — list own active API keys (requires social JWT with isAgent)
  app.get("/api/agent/keys", requireSocialAuth, async (req, res) => {
    const wallet = (req as any).socialWallet as string;
    const isAgent = (req as any).socialIsAgent as boolean;
    if (!isAgent) return res.status(403).json({ error: "Agent account required" });
    const keys = await storage.getAgentApiKeys(wallet);
    res.json(keys.map((k) => ({ ...k, keyHash: undefined }))); // never expose hash
  });

  // POST /api/agent/keys — generate a new API key (requires social JWT with isAgent)
  app.post("/api/agent/keys", requireSocialAuth, express.json(), async (req, res) => {
    const wallet = (req as any).socialWallet as string;
    const isAgent = (req as any).socialIsAgent as boolean;
    if (!isAgent) return res.status(403).json({ error: "Agent account required" });
    if (!socialRateLimit(`agent-keygen:${wallet}`, 5)) return res.status(429).json({ error: "Too many key generation requests" });
    const label = req.body?.label ? sanitize(req.body.label).slice(0, 50) : undefined;
    const { key, record } = await storage.createAgentApiKey(wallet, label);
    res.json({ apiKey: key, id: record.id, label: record.label, createdAt: record.createdAt });
  });

  // DELETE /api/agent/keys/:id — revoke own key
  app.delete("/api/agent/keys/:id", requireSocialAuth, async (req, res) => {
    const wallet = (req as any).socialWallet as string;
    const isAgent = (req as any).socialIsAgent as boolean;
    if (!isAgent) return res.status(403).json({ error: "Agent account required" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid key id" });
    // Verify ownership
    const keys = await storage.getAgentApiKeys(wallet);
    if (!keys.find((k) => k.id === id)) return res.status(404).json({ error: "Key not found" });
    await storage.revokeAgentApiKey(id);
    res.json({ ok: true });
  });

  // GET /api/admin/agents — list all agent profiles + their key counts
  app.get("/api/admin/agents", requireAdmin, async (req, res) => {
    const agents = await storage.getAllAgentProfiles();
    res.json(agents.map((a) => ({ ...a, totpSecret: undefined })));
  });

  // DELETE /api/admin/agents/keys/:id — admin force-revoke any key
  app.delete("/api/admin/agents/keys/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid key id" });
    await storage.revokeAgentApiKey(id);
    res.json({ ok: true });
  });

  // ── /api/social/me — get current user's profile
  app.get("/api/social/me", requireSocialAuth, async (req, res) => {
    const wallet = (req as any).socialWallet as string;
    let profile = await storage.getSocialProfile(wallet);
    if (!profile) return res.status(404).json({ error: "No profile" });
    // Backfill a username for legacy profiles that signed up without one
    if (!profile.username) {
      for (let i = 0; i < 12; i++) {
        const candidate = generateRandomUsername();
        if (await storage.isUsernameBlocked(candidate)) continue;
        if (await storage.isUsernameTaken(candidate)) continue;
        profile = await storage.updateSocialProfile(wallet, { username: candidate } as any);
        break;
      }
    }
    await storage.touchLastActive(wallet);
    const [followers, following] = await Promise.all([storage.getFollowerCount(wallet), storage.getFollowingCount(wallet)]);
    res.json({ ...profile, totpSecret: undefined, followerCount: followers, followingCount: following });
  });

  // GET /api/social/gating-settings — token gating removed, open to all
  app.get("/api/social/gating-settings", (_req, res) => {
    res.json({ minTrenchyToPost: 0, minTrenchyToUsername: 0 });
  });

  // GET /api/social/check-username/:username — check availability
  app.get("/api/social/check-username/:username", async (req, res) => {
    const { username } = req.params;
    if (!username || username.length > 15 || !/^[a-zA-Z0-9_]+$/.test(username)) return res.json({ available: false, reason: "Username must be 1–15 alphanumeric/underscore chars" });
    const [taken, blocked] = await Promise.all([storage.isUsernameTaken(username), storage.isUsernameBlocked(username)]);
    if (blocked) return res.json({ available: false, reason: "This username is reserved" });
    res.json({ available: !taken });
  });

  // GET /api/social/profile/:walletOrUsername — public profile (supports wallet address OR username)
  app.get("/api/social/profile/:walletOrUsername", async (req, res) => {
    const param = String(req.params.walletOrUsername || "").trim();
    let profile;
    if (looksLikeWalletAddress(param) || isEvmAddress(param)) {
      profile = await storage.getSocialProfile(param);
    } else if (/^[a-zA-Z0-9_]{1,15}$/.test(param)) {
      profile = await storage.getSocialProfileByUsername(param);
      // Fallback: rare case someone stored a short non-address identifier as wallet
      if (!profile) profile = await storage.getSocialProfile(param);
    } else {
      profile = await storage.getSocialProfile(param);
    }
    if (!profile) return res.status(404).json({ error: "Profile not found" });
    const [followers, following] = await Promise.all([storage.getFollowerCount(profile.walletAddress), storage.getFollowingCount(profile.walletAddress)]);
    const { totpSecret: _, ...safe } = profile;
    res.json({
      ...safe,
      followerCount: followers,
      followingCount: following,
      canonicalPath: profile.username ? `/u/${profile.username}` : `/u/${profile.walletAddress}`,
    });
  });

  // POST /api/social/profile — create profile (auto-assigns username if none provided)
  app.post("/api/social/profile", requireSocialAuth, express.json(), async (req, res) => {
    const wallet = (req as any).socialWallet as string;
    if (!socialRateLimit(`create-profile:${wallet}`, 3)) return res.status(429).json({ error: "Too many requests" });
    const existing = await storage.getSocialProfile(wallet);
    if (existing) return res.status(409).json({ error: "Profile already exists" });
    const { username, profileImageIpfsCid, bio, twitterLink, githubLink, instagramLink, websiteLink } = req.body ?? {};
    let cleanUsername: string | undefined;
    if (username && typeof username === "string" && username.trim().length > 0) {
      cleanUsername = username.slice(0, 15).trim().toLowerCase();
      if (!isValidUsername(cleanUsername)) return res.status(400).json({ error: "Username must be alphanumeric/underscore only" });
      if (await storage.isUsernameBlocked(cleanUsername)) return res.status(400).json({ error: "This username is reserved and cannot be registered" });
      if (await storage.isUsernameTaken(cleanUsername)) return res.status(409).json({ error: "Username already taken" });
    } else {
      for (let i = 0; i < 16; i++) {
        const candidate = generateRandomUsername();
        if (await storage.isUsernameBlocked(candidate)) continue;
        if (await storage.isUsernameTaken(candidate)) continue;
        cleanUsername = candidate;
        break;
      }
      if (!cleanUsername) {
        cleanUsername = `user_${normalizeWallet(wallet).slice(2, 8)}`;
      }
    }
    const cleanBio = bio ? sanitize(bio).slice(0, 160) : undefined;
    const profile = await storage.createSocialProfile({ walletAddress: wallet, username: cleanUsername, profileImageIpfsCid, bio: cleanBio, twitterLink, githubLink, instagramLink, websiteLink });
    // Auto-follow the admin profile so every new member sees Feather posts
    if (normalizeWallet(wallet) !== ADMIN_WALLET) {
      try {
        const adminProfile = await storage.getSocialProfile(ADMIN_WALLET);
        if (adminProfile) {
          await storage.followUser(profile.walletAddress, adminProfile.walletAddress);
        } else {
          console.warn("[social/profile] Admin profile not found for", ADMIN_WALLET, "— skip auto-follow");
        }
      } catch (err) {
        console.error("[social/profile] Auto-follow admin failed:", err);
      }
    }
    const { totpSecret: _, ...safe } = profile;
    res.json(safe);
  });

  // POST /api/admin/backfill-admin-follows — make all existing users follow admin (admin only)
  app.post("/api/admin/backfill-admin-follows", requireAdmin, async (req, res) => {
    const adminProfile = await storage.getSocialProfile(ADMIN_WALLET);
    if (!adminProfile) return res.status(404).json({ error: "Admin profile not found — create it first" });
    const wallets = await storage.getAllProfileWallets();
    let count = 0;
    for (const w of wallets) {
      if (normalizeWallet(w) === normalizeWallet(adminProfile.walletAddress)) continue;
      const already = await storage.isFollowing(w, adminProfile.walletAddress);
      if (!already) {
        try {
          await storage.followUser(w, adminProfile.walletAddress);
          count++;
        } catch (err) {
          console.error("[backfill-admin-follows] Failed for", w, err);
        }
      }
    }
    res.json({ backfilled: count });
  });

  // PATCH /api/social/profile — update profile (username change requires TRENCHY balance)
  app.patch("/api/social/profile", requireSocialAuth, express.json(), async (req, res) => {
    const wallet = (req as any).socialWallet as string;
    if (!socialRateLimit(`update-profile:${wallet}`, 10)) return res.status(429).json({ error: "Too many requests" });
    const { username, profileImageIpfsCid, bio, twitterLink, githubLink, instagramLink, websiteLink } = req.body ?? {};
    const patchData: Record<string, unknown> = {};
    if (profileImageIpfsCid !== undefined) patchData.profileImageIpfsCid = profileImageIpfsCid;
    if (bio !== undefined) patchData.bio = sanitize(bio).slice(0, 160);
    if (twitterLink !== undefined) patchData.twitterLink = twitterLink;
    if (githubLink !== undefined) patchData.githubLink = githubLink;
    if (instagramLink !== undefined) patchData.instagramLink = instagramLink;
    if (websiteLink !== undefined) patchData.websiteLink = websiteLink;
    if (username !== undefined && typeof username === "string") {
      if (username.trim().length === 0) {
        return res.status(400).json({ error: "Username cannot be empty — pick another available name instead" });
      }
      const cleanUsername = username.slice(0, 15).trim().toLowerCase();
      if (!isValidUsername(cleanUsername)) return res.status(400).json({ error: "Username must be alphanumeric/underscore only" });
      if (await storage.isUsernameBlocked(cleanUsername)) return res.status(400).json({ error: "Username is reserved" });
      const existingProfile = await storage.getSocialProfile(wallet);
      if (existingProfile?.username !== cleanUsername) {
        if (await storage.isUsernameTaken(cleanUsername)) return res.status(409).json({ error: "Username already taken" });
      }
      patchData.username = cleanUsername;
    }
    const updated = await storage.updateSocialProfile(wallet, patchData as any);
    const { totpSecret: _, ...safe } = updated;
    res.json(safe);
  });

  // POST /api/social/follow/:wallet
  app.post("/api/social/follow/:wallet", requireSocialAuth, async (req, res) => {
    const follower = (req as any).socialWallet as string;
    const isAgent = (req as any).socialIsAgent as boolean;
    const { wallet } = req.params;
    if (normalizeWallet(follower) === normalizeWallet(wallet)) return res.status(400).json({ error: "Can't follow yourself" });
    if (isAgent) {
      if (!agentDailyLimit(follower, "follow", 50)) return res.status(429).json({ error: "Agent daily follow limit reached (50/day)" });
    } else {
      if (!socialRateLimit(`follow:${follower}`, 20)) return res.status(429).json({ error: "Too many requests" });
    }
    const target = await storage.getSocialProfile(wallet);
    if (!target) return res.status(404).json({ error: "User not found" });
    await storage.followUser(follower, target.walletAddress);
    res.json({ success: true });
  });

  // DELETE /api/social/follow/:wallet
  app.delete("/api/social/follow/:wallet", requireSocialAuth, async (req, res) => {
    const follower = (req as any).socialWallet as string;
    await storage.unfollowUser(follower, req.params.wallet);
    res.json({ success: true });
  });

  // GET /api/social/newest-profiles — 5 most recently created profiles
  app.get("/api/social/newest-profiles", async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 5, 20);
    const profiles = await storage.getNewestProfiles(limit);
    res.json(profiles.map(({ totpSecret: _, ...p }) => p));
  });

  // GET /api/social/followers/:wallet
  app.get("/api/social/followers/:wallet", async (req, res) => {
    const followers = await storage.getFollowers(req.params.wallet);
    res.json(followers.map(({ totpSecret: _, ...p }) => p));
  });

  // GET /api/social/following/:wallet
  app.get("/api/social/following/:wallet", async (req, res) => {
    const following = await storage.getFollowing(req.params.wallet);
    res.json(following.map(({ totpSecret: _, ...p }) => p));
  });

  // GET /api/social/is-following/:wallet — check if current user follows target
  app.get("/api/social/is-following/:wallet", requireSocialAuth, async (req, res) => {
    const viewer = (req as any).socialWallet as string;
    const following = await storage.isFollowing(viewer, req.params.wallet);
    res.json({ following });
  });

  // GET /api/social/feed — global feed (no auth needed; ?viewer=wallet for like status, ?hashtag=tag to filter)
  app.get("/api/social/feed", async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 30), 50);
    const offset = Number(req.query.offset ?? 0);
    const viewer = typeof req.query.viewer === "string" ? req.query.viewer : undefined;
    const hashtag = typeof req.query.hashtag === "string" ? req.query.hashtag.toLowerCase().replace(/^#/, "") : undefined;
    const feed = hashtag
      ? await storage.getFeedByHashtag(hashtag, limit, offset, viewer)
      : await storage.getGlobalFeed(limit, offset, viewer);
    res.json(feed.map(({ profile, ...item }) => ({ ...item, profile: profile ? { ...profile, totpSecret: undefined } : null })));
  });

  // GET /api/social/feed/home — home feed (following + own posts)
  app.get("/api/social/feed/home", requireSocialAuth, async (req, res) => {
    const wallet = (req as any).socialWallet as string;
    const limit = Math.min(Number(req.query.limit ?? 30), 50);
    const offset = Number(req.query.offset ?? 0);
    const feed = await storage.getHomeFeed(wallet, limit, offset);
    res.json(feed.map(({ profile, ...item }) => ({ ...item, profile: profile ? { ...profile, totpSecret: undefined } : null })));
  });

  // GET /api/social/feed/user/:wallet — user's own posts
  app.get("/api/social/feed/user/:wallet", async (req, res) => {
    const feed = await storage.getUserFeed(req.params.wallet);
    res.json(feed.map(({ profile, ...item }) => ({ ...item, profile: profile ? { ...profile, totpSecret: undefined } : null })));
  });

  // POST /api/social/feed — create post
  app.post("/api/social/feed", requireSocialAuth, express.json({ limit: "2mb" }), async (req, res) => {
    const wallet = (req as any).socialWallet as string;
    const isAgent = (req as any).socialIsAgent as boolean;
    if (isAgent) {
      if (!agentDailyLimit(wallet, "post", 20)) return res.status(429).json({ error: "Agent daily post limit reached (20/day)" });
    } else {
      if (!socialRateLimit(`post:${wallet}`, 5)) return res.status(429).json({ error: "Slow down — max 5 posts per minute" });
    }
    const { content, imageIpfsCid, type, parentId } = req.body ?? {};
    if (!content || typeof content !== "string") return res.status(400).json({ error: "content required" });
    const clean = sanitize(content).slice(0, 500);
    if (!clean) return res.status(400).json({ error: "Post content is empty after sanitization" });
    const violation = await checkContent(clean);
    if (violation) return res.status(400).json({ error: violation });
    const validTypes = ["launch", "bounty", "general"];
    const postType = validTypes.includes(type) ? type : "general";
    // If parentId given, verify parent exists
    const pid = parentId ? Number(parentId) : undefined;
    if (pid) {
      const parent = await storage.getFeedItem(pid);
      if (!parent) return res.status(404).json({ error: "Parent post not found" });
    }
    const mod = await storage.getModerationSettings();
    const item = await storage.createFeedItem({ userWallet: wallet, content: clean, imageIpfsCid, type: postType, parentId: pid });
    await storage.saveHashtags(item.id, clean, mod.blacklistedWords ?? []);
    // Award points (fire-and-forget — never block the response)
    if (pid) {
      // It's a reply — award reply_made to poster; reply_received to parent owner
      storage.awardPoints(wallet, "reply_made", "feed_item", item.id).catch(() => {});
      const parent = await storage.getFeedItem(pid).catch(() => null);
      if (parent && parent.userWallet !== wallet) {
        storage.awardPoints(parent.userWallet, "reply_received", "feed_item", item.id).catch(() => {});
      }
    }
    res.json(item);
  });

  // POST /api/social/feed/:id/like — toggle like on a post or reply
  app.post("/api/social/feed/:id/like", requireSocialAuth, async (req, res) => {
    const wallet = (req as any).socialWallet as string;
    const feedItemId = Number(req.params.id);
    if (isNaN(feedItemId)) return res.status(400).json({ error: "Invalid id" });
    if (!socialRateLimit(`like:${wallet}`, 60)) return res.status(429).json({ error: "Too many likes" });
    const post = await storage.getFeedItem(feedItemId);
    if (!post) return res.status(404).json({ error: "Post not found" });
    const result = await storage.toggleFeedLike(wallet, feedItemId);
    // Award like_received to post owner when liked (not on unlike, not self-like)
    if (result.liked && post.userWallet !== wallet) {
      storage.awardPoints(post.userWallet, "like_received", "feed_item", feedItemId).catch(() => {});
    }
    res.json(result);
  });

  // GET /api/social/trending-hashtags — trending topics from last 24h
  app.get("/api/social/trending-hashtags", async (req, res) => {
    const hours = Math.min(Number(req.query.hours ?? 24), 168);
    const limit = Math.min(Number(req.query.limit ?? 10), 20);
    const mod = await storage.getModerationSettings();
    const trending = await storage.getTrendingHashtags(hours, limit, mod.blacklistedWords ?? []);
    res.json(trending);
  });

  // GET /api/social/feed/:id/replies — get replies to a post
  app.get("/api/social/feed/:id/replies", async (req, res) => {
    try {
      const parentId = Number(req.params.id);
      if (isNaN(parentId)) return res.status(400).json({ error: "Invalid id" });
      const viewer = typeof req.query.viewer === "string" ? req.query.viewer : undefined;
      const replies = await storage.getReplies(parentId, viewer);
      res.json(replies.map(({ profile, ...r }) => ({ ...r, profile: profile ? { ...profile, totpSecret: undefined } : null })));
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch replies" });
    }
  });

  // DELETE /api/social/feed/:id
  app.delete("/api/social/feed/:id", requireSocialAuth, async (req, res) => {
    const wallet = (req as any).socialWallet as string;
    const deleted = await storage.deleteFeedItem(Number(req.params.id), wallet);
    if (!deleted) return res.status(404).json({ error: "Post not found or not yours" });
    res.json({ success: true });
  });

  // GET /api/social/comments/:feedItemId
  app.get("/api/social/comments/:feedItemId", async (req, res) => {
    const comments = await storage.getComments(Number(req.params.feedItemId));
    res.json(comments.map(({ profile, ...c }) => ({ ...c, profile: profile ? { ...profile, totpSecret: undefined } : null })));
  });

  // POST /api/social/comments
  app.post("/api/social/comments", requireSocialAuth, express.json(), async (req, res) => {
    const wallet = (req as any).socialWallet as string;
    const isAgent = (req as any).socialIsAgent as boolean;
    if (isAgent) {
      if (!agentDailyLimit(wallet, "comment", 50)) return res.status(429).json({ error: "Agent daily comment limit reached (50/day)" });
    } else {
      if (!socialRateLimit(`comment:${wallet}`, 10)) return res.status(429).json({ error: "Too many requests" });
    }
    const { feedItemId, tokenContractAddress, content } = req.body ?? {};
    if (!content) return res.status(400).json({ error: "content required" });
    const clean = sanitize(content).slice(0, 280);
    if (!clean) return res.status(400).json({ error: "Empty after sanitization" });
    const violation = await checkContent(clean);
    if (violation) return res.status(400).json({ error: violation });
    const fid = feedItemId ? Number(feedItemId) : undefined;
    const comment = await storage.createComment({ feedItemId: fid, tokenContractAddress, userWallet: wallet, content: clean });
    // Award points: comment_made to commenter + comment_received to post owner
    if (fid) {
      storage.awardPoints(wallet, "comment_made", "feed_comment", comment.id).catch(() => {});
      const post = await storage.getFeedItem(fid).catch(() => null);
      if (post && post.userWallet !== wallet) {
        storage.awardPoints(post.userWallet, "comment_received", "feed_comment", comment.id).catch(() => {});
      }
    }
    res.json(comment);
  });

  // DELETE /api/social/comments/:id
  app.delete("/api/social/comments/:id", requireSocialAuth, async (req, res) => {
    const wallet = (req as any).socialWallet as string;
    const deleted = await storage.deleteComment(Number(req.params.id), wallet);
    if (!deleted) return res.status(404).json({ error: "Comment not found or not yours" });
    res.json({ success: true });
  });

  // POST /api/social/report
  app.post("/api/social/report", requireSocialAuth, express.json(), async (req, res) => {
    const wallet = (req as any).socialWallet as string;
    if (!socialRateLimit(`report:${wallet}`, 5)) return res.status(429).json({ error: "Too many requests" });
    const { reportedId, reportedType, reason } = req.body ?? {};
    if (!reportedId || !reportedType || !reason) return res.status(400).json({ error: "reportedId, reportedType, reason required" });
    await storage.createReport({ reporterWallet: wallet, reportedId: Number(reportedId), reportedType, reason: sanitize(reason).slice(0, 300) });
    res.json({ success: true });
  });

  // ── Points System ──────────────────────────────────────────────────────────

  // GET /api/points/me — current user's points summary
  app.get("/api/points/me", requireSocialAuth, async (req, res) => {
    try {
      const wallet = (req as any).socialWallet as string;
      const summary = await storage.getUserPointsSummary(wallet);
      res.json(summary);
    } catch (err) {
      console.error("[GET /api/points/me]", err);
      res.status(500).json({ error: "Failed to fetch points" });
    }
  });

  // GET /api/points/referral-code — get or generate the user's referral code
  app.get("/api/points/referral-code", requireSocialAuth, async (req, res) => {
    try {
      const wallet = (req as any).socialWallet as string;
      const code = await storage.getOrCreateReferralCode(wallet);
      res.json({ code, link: `${process.env.APP_URL || "https://feather.app"}/community?ref=${code}` });
    } catch (err) {
      console.error("[GET /api/points/referral-code]", err);
      res.status(500).json({ error: "Failed to generate referral code" });
    }
  });

  // GET /api/points/referrals — list of users this wallet has referred
  app.get("/api/points/referrals", requireSocialAuth, async (req, res) => {
    try {
      const wallet = (req as any).socialWallet as string;
      const list = await storage.getUserReferrals(wallet);
      res.json(list);
    } catch (err) {
      console.error("[GET /api/points/referrals]", err);
      res.status(500).json({ error: "Failed to fetch referrals" });
    }
  });

  // POST /api/points/claim-referral — attribute a referral when a new user signs up
  // Called by the frontend after profile creation with a ?ref= code from localStorage
  app.post("/api/points/claim-referral", requireSocialAuth, express.json(), async (req, res) => {
    try {
      const wallet = (req as any).socialWallet as string;
      const { code } = z.object({ code: z.string().min(6).max(32) }).parse(req.body);
      const result = await storage.claimReferral(code, wallet);
      res.json(result);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Invalid referral code" });
      console.error("[POST /api/points/claim-referral]", err);
      res.status(500).json({ error: "Failed to claim referral" });
    }
  });

  // GET /api/points/config — public read of current points config (for Dashboard)
  app.get("/api/points/config", async (_req, res) => {
    try {
      const cfg = await storage.getPointsConfig();
      res.json(cfg);
    } catch (err) {
      console.error("[GET /api/points/config]", err);
      res.status(500).json({ error: "Failed to fetch points config" });
    }
  });

  // ── Admin: Points Management ──────────────────────────────────────────────

  // GET /api/admin/points — all users ranked by total points
  app.get("/api/admin/points", requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const offset = Number(req.query.offset ?? 0);
      const rows = await storage.getAdminPointsOverview(limit, offset);
      res.json(rows);
    } catch (err) {
      console.error("[GET /api/admin/points]", err);
      res.status(500).json({ error: "Failed to fetch points" });
    }
  });

  // GET /api/admin/points/:wallet/events — events for a specific user
  app.get("/api/admin/points/:wallet/events", requireAdmin, async (req, res) => {
    try {
      const events = await storage.getUserPointEvents(req.params.wallet, 50);
      res.json(events);
    } catch (err) {
      console.error("[GET /api/admin/points/:wallet/events]", err);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  // DELETE /api/admin/points/:id — void a point event
  app.delete("/api/admin/points/:id", requireAdmin, async (req, res) => {
    try {
      const adminWallet = (req as any).adminWallet as string ?? ADMIN_WALLET;
      await storage.voidPointEvent(Number(req.params.id), adminWallet);
      res.json({ success: true });
    } catch (err) {
      console.error("[DELETE /api/admin/points/:id]", err);
      res.status(500).json({ error: "Failed to void event" });
    }
  });

  // PATCH /api/admin/points/:id/restore — un-void a point event
  app.patch("/api/admin/points/:id/restore", requireAdmin, async (req, res) => {
    try {
      await storage.unvoidPointEvent(Number(req.params.id));
      res.json({ success: true });
    } catch (err) {
      console.error("[PATCH /api/admin/points/:id/restore]", err);
      res.status(500).json({ error: "Failed to restore event" });
    }
  });

  // PATCH /api/admin/points/config — update point values, daily cap, min trenchy
  app.patch("/api/admin/points/config", requireAdmin, express.json(), async (req, res) => {
    try {
      const schema = z.object({
        pointsLikeReceived:    z.number().int().min(0).optional(),
        pointsCommentMade:     z.number().int().min(0).optional(),
        pointsCommentReceived: z.number().int().min(0).optional(),
        pointsReplyMade:       z.number().int().min(0).optional(),
        pointsReplyReceived:   z.number().int().min(0).optional(),
        pointsReferral:        z.number().int().min(0).optional(),
        pointsDailyCap:        z.number().int().min(1).optional(),
        pointsMinTrenchy:      z.number().min(0).optional(),
      });
      const data = schema.parse(req.body);
      await storage.updateModerationSettings(data);
      const updated = await storage.getPointsConfig();
      res.json(updated);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Invalid config values", details: err.errors });
      console.error("[PATCH /api/admin/points/config]", err);
      res.status(500).json({ error: "Failed to update points config" });
    }
  });

  // ── SOL Payout routes ─────────────────────────────────────────────────────

  // GET /api/payouts/me — user's payout history
  app.get("/api/payouts/me", requireSocialAuth, async (req, res) => {
    try {
      const wallet = (req as any).socialWallet as string;
      const rows = await storage.getUserPayouts(wallet);
      res.json(rows);
    } catch (err) {
      console.error("[GET /api/payouts/me]", err);
      res.status(500).json({ error: "Failed to load payouts" });
    }
  });

  // GET /api/admin/payouts — all payouts with recipients (admin)
  app.get("/api/admin/payouts", requireAdmin, async (_req, res) => {
    try {
      const data = await storage.getPayouts();
      res.json(data);
    } catch (err) {
      console.error("[GET /api/admin/payouts]", err);
      res.status(500).json({ error: "Failed to load payouts" });
    }
  });

  // GET /api/admin/payouts/epoch-preview — show who would be paid and how much
  app.get("/api/admin/payouts/epoch-preview", requireAdmin, async (req, res) => {
    try {
      const epochStart = req.query.epochStart ? new Date(req.query.epochStart as string) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const epochEnd = req.query.epochEnd ? new Date(req.query.epochEnd as string) : new Date();
      const rows = await storage.getEpochPointsSummary(epochStart, epochEnd);
      const total = rows.reduce((s, r) => s + r.points, 0);
      res.json({ rows, totalPoints: total, epochStart, epochEnd });
    } catch (err) {
      console.error("[GET /api/admin/payouts/epoch-preview]", err);
      res.status(500).json({ error: "Failed to load epoch preview" });
    }
  });

  // POST /api/admin/payouts/distribute — initiate a payout
  app.post("/api/admin/payouts/distribute", requireAdmin, express.json(), async (req, res) => {
    try {
      const wallet = (req as any).adminWallet as string;
      const { epochStart, epochEnd, totalSolLamports, notes } = req.body;
      if (!epochStart || !epochEnd || !totalSolLamports || totalSolLamports <= 0) {
        return res.status(400).json({ error: "epochStart, epochEnd, and totalSolLamports (>0) required" });
      }
      const result = await storage.initiateSOLPayout({
        epochStart: new Date(epochStart),
        epochEnd: new Date(epochEnd),
        totalSolLamports: Number(totalSolLamports),
        initiatedBy: wallet,
        notes,
      });
      res.json(result);
    } catch (err) {
      console.error("[POST /api/admin/payouts/distribute]", err);
      res.status(500).json({ error: "Payout distribution failed", detail: String(err) });
    }
  });

  // GET /api/social/2fa/setup — generate TOTP secret + QR code
  app.get("/api/social/2fa/setup", requireSocialAuth, async (req, res) => {
    const wallet = (req as any).socialWallet as string;
    const profile = await storage.getSocialProfile(wallet);
    if (!profile) return res.status(404).json({ error: "Profile not found" });
    const secret = totpGenerateSecret();
    await storage.setTotpSecret(wallet, secret);
    const otpAuthUrl = `otpauth://totp/FeatherApp:${encodeURIComponent(profile.username)}?secret=${secret}&issuer=FeatherApp&algorithm=SHA1&digits=6&period=30`;
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);
    res.json({ secret, qrCodeDataUrl, otpAuthUrl });
  });

  // POST /api/social/2fa/enable — verify code and enable
  app.post("/api/social/2fa/enable", requireSocialAuth, express.json(), async (req, res) => {
    const wallet = (req as any).socialWallet as string;
    const { code } = req.body ?? {};
    if (!code) return res.status(400).json({ error: "code required" });
    const profile = await storage.getSocialProfile(wallet);
    if (!profile?.totpSecret) return res.status(400).json({ error: "Run 2FA setup first" });
    const result = totpVerifySync({ token: String(code), secret: profile.totpSecret, type: "totp" });
    if (!result?.valid) return res.status(401).json({ error: "Invalid code" });
    await storage.enableTotp(wallet);
    res.json({ success: true });
  });

  // POST /api/social/2fa/disable — verify code and disable
  app.post("/api/social/2fa/disable", requireSocialAuth, express.json(), async (req, res) => {
    const wallet = (req as any).socialWallet as string;
    const { code } = req.body ?? {};
    if (!code) return res.status(400).json({ error: "code required" });
    const profile = await storage.getSocialProfile(wallet);
    if (!profile?.totpSecret) return res.status(400).json({ error: "2FA not enabled" });
    const result = totpVerifySync({ token: String(code), secret: profile.totpSecret, type: "totp" });
    if (!result?.valid) return res.status(401).json({ error: "Invalid code" });
    await storage.disableTotp(wallet);
    res.json({ success: true });
  });

  // GET /api/social/balance — get cached $FEATHER balance (and optionally refresh)
  app.get("/api/social/balance", requireSocialAuth, async (req, res) => {
    const wallet = (req as any).socialWallet as string;
    const refresh = req.query.refresh === "1";
    if (refresh) {
      try {
        const { getFeatherBalance } = await import("./tokengate");
        const balance = await getFeatherBalance(wallet);
        await storage.updateTrenchyBalance(wallet, balance);
        return res.json({ balance, fromCache: false });
      } catch {
        // Fall through to cached value on RPC error
      }
    }
    const balance = await storage.getTrenchyBalance(wallet);
    res.json({ balance, fromCache: true });
  });

  // ── Launch Feed API ──────────────────────────────────────────────────────────

  app.get("/api/launch-feed", async (req, res) => {
    try {
      const { getExternalLaunches } = await import("./launchFeedCache");
      const tab = (req.query.tab as string) || "all";
      const limit = Math.min(Number(req.query.limit ?? 30), 50);
      const page = Number(req.query.page ?? 0);
      const offset = page * limit;

      const modSettings = await storage.getModerationSettings();
      const { minMcapUsd, minVolume24hUsd, trenchyBoostThreshold } = modSettings;

      type UnifiedItem = {
        id: string;
        source: "trenchy" | "external";
        launchpad: string;
        platform?: string;
        name: string;
        ticker: string;
        mintAddress: string;
        imageUrl?: string | null;
        description?: string | null;
        website?: string | null;
        twitter?: string | null;
        mcap?: number;
        volume24h?: number;
        priceUsd?: string;
        launcherHandle?: string | null;
        launcherWallet?: string | null;
        trenchyBoost: boolean;
        createdAt: string;
        pumpUrl?: string | null;
        dexUrl: string;
      };

      let items: UnifiedItem[] = [];

      if (tab === "trenchy") {
        // Only Trenchy-launched tokens
        const trenchy = await storage.getTrenchyLaunchFeed(limit, offset);
        items = trenchy
          .filter((t) => t.mintAddress)
          .map((t) => ({
            id: `trenchy-${t.id}`,
            source: "trenchy" as const,
            launchpad: t.launchpad,
            platform: t.platform,
            name: t.coinName,
            ticker: t.ticker,
            mintAddress: t.mintAddress!,
            imageUrl: t.imageUrl,
            description: t.description,
            website: t.website,
            twitter: t.twitter,
            launcherHandle: t.launcherUsername,
            launcherWallet: t.launcherWallet,
            trenchyBoost: t.trenchyBoost,
            createdAt: (t.createdAt ?? new Date()).toISOString(),
            pumpUrl: t.pumpUrl,
            dexUrl: `https://dexscreener.com/robinhood/${t.mintAddress}`,
          }));
      } else {
        // Fetch both Trenchy + external
        const [trenchy, external] = await Promise.all([
          storage.getTrenchyLaunchFeed(100),
          getExternalLaunches(),
        ]);

        // Build a set of Trenchy mint addresses to avoid duplicates
        const trenchyMints = new Set(trenchy.map((t) => t.mintAddress?.toLowerCase()).filter(Boolean));

        const trenchyItems: UnifiedItem[] = trenchy
          .filter((t) => t.mintAddress)
          .map((t) => ({
            id: `trenchy-${t.id}`,
            source: "trenchy" as const,
            launchpad: t.launchpad,
            platform: t.platform,
            name: t.coinName,
            ticker: t.ticker,
            mintAddress: t.mintAddress!,
            imageUrl: t.imageUrl,
            description: t.description,
            website: t.website,
            twitter: t.twitter,
            launcherHandle: t.launcherUsername,
            launcherWallet: t.launcherWallet,
            trenchyBoost: t.trenchyBoost,
            createdAt: (t.createdAt ?? new Date()).toISOString(),
            pumpUrl: t.pumpUrl,
            dexUrl: `https://dexscreener.com/robinhood/${t.mintAddress}`,
          }));

        // Anti-spam filter for external tokens
        const externalItems: UnifiedItem[] = external
          .filter((e) => !trenchyMints.has(e.mintAddress.toLowerCase()))
          .filter((e) => {
            const passMcap = (e.mcap ?? 0) >= minMcapUsd;
            const passVol = (e.volume24h ?? 0) >= minVolume24hUsd;
            return passMcap || passVol;
          })
          .map((e) => ({
            id: `ext-${e.mintAddress}`,
            source: "external" as const,
            launchpad: e.launchpad,
            name: e.name,
            ticker: e.ticker,
            mintAddress: e.mintAddress,
            imageUrl: e.imageUrl,
            description: e.description,
            website: e.website,
            twitter: e.twitter,
            mcap: e.mcap,
            volume24h: e.volume24h,
            priceUsd: e.priceUsd,
            trenchyBoost: false,
            createdAt: e.pairCreatedAt ? new Date(e.pairCreatedAt).toISOString() : new Date().toISOString(),
            dexUrl: e.dexUrl,
          }));

        const allItems = [...trenchyItems, ...externalItems];

        if (tab === "trending") {
          allItems.sort((a, b) => {
            const scoreA = (a.mcap ?? 0) * (a.trenchyBoost ? 2 : 1);
            const scoreB = (b.mcap ?? 0) * (b.trenchyBoost ? 2 : 1);
            return scoreB - scoreA;
          });
        } else if (tab === "curated") {
          // Curated = Trenchy first, then by MCAP
          allItems.sort((a, b) => {
            if (a.source === "trenchy" && b.source !== "trenchy") return -1;
            if (b.source === "trenchy" && a.source !== "trenchy") return 1;
            const scoreA = (a.mcap ?? 0) * (a.trenchyBoost ? 2 : 1);
            const scoreB = (b.mcap ?? 0) * (b.trenchyBoost ? 2 : 1);
            return scoreB - scoreA;
          });
        } else {
          // "all" and "new" — sorted by createdAt desc
          allItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }

        items = allItems.slice(offset, offset + limit);
      }

      res.json({
        items,
        page,
        limit,
        total: items.length,
        config: { minMcapUsd, minVolume24hUsd, trenchyBoostThreshold },
      });
    } catch (err) {
      console.error("[/api/launch-feed]", err);
      res.status(500).json({ error: "Failed to load launch feed" });
    }
  });

  // Report a launch item
  app.post("/api/launch-report", requireSocialAuth, express.json(), async (req, res) => {
    const wallet = (req as any).socialWallet as string;
    const { mintAddress, reason } = req.body ?? {};
    if (!mintAddress || !reason) return res.status(400).json({ error: "mintAddress and reason required" });
    await storage.createReport({ reporterWallet: wallet, reportedId: 0, reportedType: `launch:${mintAddress}`, reason });
    res.json({ success: true });
  });

  // ── Canonical short-path API aliases ────────────────────────────────────────
  // GET /api/users/:wallet  → profile lookup
  app.get("/api/users/:wallet", async (req, res) => {
    const profile = await storage.getSocialProfile(req.params.wallet);
    if (!profile) return res.status(404).json({ error: "User not found" });
    const [followers, following] = await Promise.all([storage.getFollowerCount(req.params.wallet), storage.getFollowingCount(req.params.wallet)]);
    const { totpSecret: _, ...safe } = profile;
    res.json({ ...safe, followerCount: followers, followingCount: following });
  });

  // GET /api/feed/public  → public paginated feed
  app.get("/api/feed/public", async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 30), 50);
    const offset = Number(req.query.offset ?? 0);
    const viewer = typeof req.query.viewer === "string" ? req.query.viewer : undefined;
    const hashtag = typeof req.query.hashtag === "string" ? req.query.hashtag.toLowerCase().replace(/^#/, "") : undefined;
    const feed = hashtag
      ? await storage.getFeedByHashtag(hashtag, limit, offset, viewer)
      : await storage.getGlobalFeed(limit, offset, viewer);
    res.json(feed.map(({ profile, ...item }) => ({ ...item, profile: profile ? { ...profile, totpSecret: undefined } : null })));
  });

  // GET /api/feed/following  → auth-gated following feed with pagination
  app.get("/api/feed/following", requireSocialAuth, async (req, res) => {
    const wallet = (req as any).socialWallet as string;
    const limit = Math.min(Number(req.query.limit ?? 30), 50);
    const offset = Number(req.query.offset ?? 0);
    const feed = await storage.getHomeFeed(wallet, limit, offset);
    res.json(feed.map(({ profile, ...item }) => ({ ...item, profile: profile ? { ...profile, totpSecret: undefined } : null })));
  });

  // POST /api/follow  — body: { wallet }
  app.post("/api/follow", requireSocialAuth, express.json(), async (req, res) => {
    const follower = (req as any).socialWallet as string;
    const { wallet } = req.body ?? {};
    if (!wallet) return res.status(400).json({ error: "wallet required" });
    if (normalizeWallet(follower) === normalizeWallet(wallet)) return res.status(400).json({ error: "Can't follow yourself" });
    const target = await storage.getSocialProfile(wallet);
    if (!target) return res.status(404).json({ error: "User not found" });
    await storage.followUser(follower, target.walletAddress);
    res.json({ success: true });
  });

  // DELETE /api/follow  — body: { wallet }
  app.delete("/api/follow", requireSocialAuth, express.json(), async (req, res) => {
    const follower = (req as any).socialWallet as string;
    const { wallet } = req.body ?? {};
    if (!wallet) return res.status(400).json({ error: "wallet required" });
    await storage.unfollowUser(follower, wallet);
    res.json({ success: true });
  });

  // ── Token Comments API ───────────────────────────────────────────────────────

  // GET /api/comments/token/:ca — fetch comments for a token (public)
  app.get("/api/comments/token/:ca", async (req, res) => {
    try {
      const ca = sanitizeText(req.params.ca, 100);
      if (!ca) return res.status(400).json({ error: "Invalid contract address" });
      const limit = Math.min(Number(req.query.limit ?? 50), 100);
      const comments = await storage.getTokenComments(ca, limit);
      res.json(
        comments.map((c) => ({
          id: c.id,
          userWallet: c.userWallet,
          content: c.content,
          createdAt: c.createdAt,
          profile: c.profile
            ? { username: c.profile.username, avatarUrl: c.profile.avatarUrl, walletAddress: c.profile.walletAddress }
            : null,
        }))
      );
    } catch (err) {
      console.error("[GET /api/comments/token]", err);
      res.status(500).json({ error: "Failed to load comments" });
    }
  });

  // POST /api/comments — post a comment on a token (requires social auth + min TRENCHY)
  app.post("/api/comments", requireSocialAuth, express.json(), async (req, res) => {
    try {
      const wallet = (req as any).socialWallet as string;
      const { tokenContractAddress, content } = req.body ?? {};
      if (!tokenContractAddress || !content) {
        return res.status(400).json({ error: "tokenContractAddress and content required" });
      }
      const cleaned = sanitizeText(content, 500);
      if (!cleaned) return res.status(400).json({ error: "Comment is empty after sanitization" });
      if (cleaned.length < 2) return res.status(400).json({ error: "Comment too short" });

      // Check moderation settings
      const mod = await storage.getModerationSettings();
      const contentErr = await checkContent(cleaned);
      if (contentErr) return res.status(400).json({ error: contentErr });

      // Token gating removed — any authenticated user can post comments

      const ca = sanitizeText(tokenContractAddress, 100);
      if (!ca) return res.status(400).json({ error: "Invalid contract address" });

      const comment = await storage.createComment({ tokenContractAddress: ca, userWallet: wallet, content: cleaned });
      res.status(201).json({ success: true, comment });
    } catch (err) {
      console.error("[POST /api/comments]", err);
      res.status(500).json({ error: "Failed to post comment" });
    }
  });

  // POST /api/reports — generic report endpoint (comments, tokens, etc.)
  app.post("/api/reports", requireSocialAuth, express.json(), async (req, res) => {
    try {
      const wallet = (req as any).socialWallet as string;
      const { reportedId, reportedType, reason } = req.body ?? {};
      if (!reportedId || !reportedType || !reason) {
        return res.status(400).json({ error: "reportedId, reportedType, and reason required" });
      }
      const cleanReason = sanitizeText(reason, 300);
      if (!cleanReason) return res.status(400).json({ error: "Reason is empty" });
      await storage.createReport({
        reporterWallet: wallet,
        reportedId: Number(reportedId),
        reportedType: sanitizeText(reportedType, 50),
        reason: cleanReason,
      });
      res.json({ success: true });
    } catch (err) {
      console.error("[POST /api/reports]", err);
      res.status(500).json({ error: "Failed to submit report" });
    }
  });

  // ── Tier ─────────────────────────────────────────────────────────────────────
  // GET /api/tier/:wallet
  app.get("/api/tier/:wallet", async (req, res) => {
    try {
      // Admin wallet always gets maximum tier (bypasses balance requirement)
      if (req.params.wallet.toLowerCase() === ADMIN_WALLET.toLowerCase()) {
        return res.json({ balance: Infinity, tier: 3, label: "Verified Trencher", vipAccess: true, dmAccess: true, priorityFeed: true, isAdmin: true });
      }
      const balance = await storage.getTrenchyBalance(req.params.wallet);
      const tier = balance >= 1_000_000 ? 3 : balance >= 500_000 ? 2 : balance >= 250_000 ? 1 : 0;
      const labels: Record<number, string> = { 0: "None", 1: "Trencher", 2: "Elite Trencher", 3: "Verified Trencher" };
      res.json({ balance, tier, label: labels[tier], vipAccess: tier >= 3, dmAccess: tier >= 2, priorityFeed: tier >= 1 });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch tier" });
    }
  });

  // ── Leaderboard ───────────────────────────────────────────────────────────────
  // GET /api/leaderboard?category=launchers|active|commenters&period=weekly|monthly
  app.get("/api/leaderboard", async (req, res) => {
    try {
      const category = (["launchers", "active", "commenters"].includes(req.query.category as string) ? req.query.category : "launchers") as "launchers" | "active" | "commenters";
      const period = req.query.period === "monthly" ? 30 : 7;
      const since = new Date(Date.now() - period * 24 * 60 * 60 * 1000);
      const entries = await storage.getLeaderboard(category, since);
      res.json(entries);
    } catch (err) {
      console.error("[GET /api/leaderboard]", err);
      res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  });

  // ── Bounties ──────────────────────────────────────────────────────────────────
  // GET /api/bounties
  app.get("/api/bounties", async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const offset = Number(req.query.offset) || 0;
      const items = await storage.getBounties(limit, offset);
      res.json(items.map(({ profile, ...item }) => ({ ...item, profile: profile ? { ...profile, totpSecret: undefined } : null })));
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch bounties" });
    }
  });

  // POST /api/bounties
  const bountySchema = z.object({
    content: z.string().min(1).max(1000),
  });

  app.post("/api/bounties", requireSocialAuth, express.json(), async (req, res) => {
    try {
      const wallet = (req as any).socialWallet as string;
      if (!socialRateLimit(`bounty:${wallet}`, 3)) return res.status(429).json({ error: "Max 3 bounty posts per minute" });
      const parsed = bountySchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid input" });
      const { content } = parsed.data;
      const clean = sanitize(content).slice(0, 1000);
      if (!clean) return res.status(400).json({ error: "Content empty after sanitization" });
      const violation = await checkContent(clean);
      if (violation) return res.status(400).json({ error: violation });
      const item = await storage.createFeedItem({ userWallet: wallet, content: clean, type: "bounty" });
      res.json(item);
    } catch (err) {
      console.error("[POST /api/bounties]", err);
      res.status(500).json({ error: "Failed to create bounty" });
    }
  });

  // ── Messages / DMs ────────────────────────────────────────────────────────────
  // Anyone with a social profile can VIEW their inbox (no balance gate on reading)
  // Sending/replying requires 500k+ $FEATHER
  // Consent rule: sender can only DM recipient if recipient follows sender OR they have an existing conversation
  // Admin bypasses all rules

  // GET /api/notifications/count — unread DMs + new replies count (for nav badge)
  app.get("/api/notifications/count", requireSocialAuth, async (req, res) => {
    try {
      const wallet = (req as any).socialWallet as string;
      const [unreadDMs, newReplies] = await Promise.all([
        storage.getUnreadMessageCount(wallet),
        storage.getNewRepliesCount(wallet),
      ]);
      res.json({ unreadDMs, newReplies, total: unreadDMs + newReplies });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  // GET /api/notifications — activity feed (follows, likes, replies, comments)
  app.get("/api/notifications", requireSocialAuth, async (req, res) => {
    try {
      const wallet = (req as any).socialWallet as string;
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const notifications = await storage.getActivityNotifications(wallet, limit);
      res.json(notifications);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  // PATCH /api/notifications/replies-seen — mark reply notifications as cleared
  app.patch("/api/notifications/replies-seen", requireSocialAuth, async (req, res) => {
    try {
      const wallet = (req as any).socialWallet as string;
      await storage.markRepliesSeen(wallet);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to mark replies seen" });
    }
  });

  // GET /api/messages/inbox — anyone with a profile can view received DMs
  app.get("/api/messages/inbox", requireSocialAuth, async (req, res) => {
    try {
      const wallet = (req as any).socialWallet as string;
      const msgs = await storage.getInboxMessages(wallet);
      res.json(msgs.map(m => ({ ...m, fromProfile: m.fromProfile ? { ...m.fromProfile, totpSecret: undefined } : null })));
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch inbox" });
    }
  });

  // GET /api/messages/sent
  app.get("/api/messages/sent", requireSocialAuth, async (req, res) => {
    try {
      const wallet = (req as any).socialWallet as string;
      if (wallet.toLowerCase() !== ADMIN_WALLET.toLowerCase()) {
        const balance = await storage.getTrenchyBalance(wallet);
        if (balance < 500_000) return res.status(403).json({ error: "Sending DMs requires 500k+ $FEATHER" });
      }
      const msgs = await storage.getSentMessages(wallet);
      res.json(msgs.map(m => ({ ...m, toProfile: m.toProfile ? { ...m.toProfile, totpSecret: undefined } : null })));
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch sent messages" });
    }
  });

  // POST /api/messages
  const dmSchema = z.object({
    toWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM wallet address"),
    content: z.string().min(1).max(500),
  });

  app.post("/api/messages", requireSocialAuth, express.json(), async (req, res) => {
    try {
      const wallet = (req as any).socialWallet as string;
      if (wallet.toLowerCase() !== ADMIN_WALLET.toLowerCase()) {
        // Must hold 500k+ $FEATHER to send DMs
        const balance = await storage.getTrenchyBalance(wallet);
        if (balance < 500_000) return res.status(403).json({ error: "Sending DMs requires 500k+ $FEATHER" });
      }
      if (!socialRateLimit(`dm:${wallet}`, 10)) return res.status(429).json({ error: "Too many messages — slow down" });
      const parsed = dmSchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid input" });
      const { toWallet, content } = parsed.data;
      if (toWallet === wallet) return res.status(400).json({ error: "Cannot message yourself" });
      // Consent check: recipient must follow sender OR an existing conversation must exist
      // Admin bypasses this check
      if (wallet.toLowerCase() !== ADMIN_WALLET.toLowerCase()) {
        const [recipientFollowsSender, hasThread] = await Promise.all([
          storage.isFollowing(toWallet as string, wallet),
          storage.hasExistingConversation(wallet, toWallet as string),
        ]);
        if (!recipientFollowsSender && !hasThread) {
          return res.status(403).json({ error: "You can only DM users who follow you. Ask them to follow you first." });
        }
      }
      const clean = sanitize(content).slice(0, 500);
      if (!clean) return res.status(400).json({ error: "Message is empty" });
      const violation = await checkContent(clean);
      if (violation) return res.status(400).json({ error: violation });
      const msg = await storage.sendMessage(wallet, toWallet as string, clean);
      res.json(msg);
    } catch (err) {
      console.error("[POST /api/messages]", err);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // PATCH /api/messages/:id/read
  app.patch("/api/messages/:id/read", requireSocialAuth, async (req, res) => {
    try {
      const wallet = (req as any).socialWallet as string;
      await storage.markMessageRead(Number(req.params.id), wallet);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to mark read" });
    }
  });

  // ── Admin: Moderation settings ────────────────────────────────────────────────
  // GET /api/admin/moderation
  app.get("/api/admin/moderation", requireAdmin, async (req, res) => {
    try {
      const settings = await storage.getModerationSettings();
      res.json(settings);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch moderation settings" });
    }
  });

  // PATCH /api/admin/moderation
  app.patch("/api/admin/moderation", requireAdmin, express.json(), async (req, res) => {
    try {
      const { blacklistedWords, blacklistedDomains, minTrenchyToPost, minMcapUsd, minVolume24hUsd, trenchyBoostThreshold, minTrenchyToUsername, minTrenchyToAI, aiDailyLimit, minTrenchyToMarket, minTrenchyToBagsLaunch, tokenGatingEnabled, pointsLikeReceived, pointsCommentMade, pointsCommentReceived, pointsReplyMade, pointsReplyReceived, pointsReferral, pointsDailyCap, pointsMinTrenchy } = req.body ?? {};
      await storage.updateModerationSettings({
        blacklistedWords: Array.isArray(blacklistedWords) ? blacklistedWords : undefined,
        blacklistedDomains: Array.isArray(blacklistedDomains) ? blacklistedDomains : undefined,
        minTrenchyToPost: minTrenchyToPost !== undefined ? Number(minTrenchyToPost) : undefined,
        minMcapUsd: minMcapUsd !== undefined ? Number(minMcapUsd) : undefined,
        minVolume24hUsd: minVolume24hUsd !== undefined ? Number(minVolume24hUsd) : undefined,
        trenchyBoostThreshold: trenchyBoostThreshold !== undefined ? Number(trenchyBoostThreshold) : undefined,
        minTrenchyToUsername: minTrenchyToUsername !== undefined ? Number(minTrenchyToUsername) : undefined,
        minTrenchyToAI: minTrenchyToAI !== undefined ? Number(minTrenchyToAI) : undefined,
        aiDailyLimit: aiDailyLimit !== undefined ? Number(aiDailyLimit) : undefined,
        minTrenchyToMarket: minTrenchyToMarket !== undefined ? Number(minTrenchyToMarket) : undefined,
        minTrenchyToBagsLaunch: minTrenchyToBagsLaunch !== undefined ? Number(minTrenchyToBagsLaunch) : undefined,
        tokenGatingEnabled: tokenGatingEnabled !== undefined ? Boolean(tokenGatingEnabled) : undefined,
        pointsLikeReceived: pointsLikeReceived !== undefined ? Number(pointsLikeReceived) : undefined,
        pointsCommentMade: pointsCommentMade !== undefined ? Number(pointsCommentMade) : undefined,
        pointsCommentReceived: pointsCommentReceived !== undefined ? Number(pointsCommentReceived) : undefined,
        pointsReplyMade: pointsReplyMade !== undefined ? Number(pointsReplyMade) : undefined,
        pointsReplyReceived: pointsReplyReceived !== undefined ? Number(pointsReplyReceived) : undefined,
        pointsReferral: pointsReferral !== undefined ? Number(pointsReferral) : undefined,
        pointsDailyCap: pointsDailyCap !== undefined ? Number(pointsDailyCap) : undefined,
        pointsMinTrenchy: pointsMinTrenchy !== undefined ? Number(pointsMinTrenchy) : undefined,
      });
      const updated = await storage.getModerationSettings();
      res.json(updated);
    } catch (err) {
      console.error("[PATCH /api/admin/moderation]", err);
      res.status(500).json({ error: "Failed to update moderation settings" });
    }
  });

  // ── Admin: Reports ────────────────────────────────────────────────────────────
  // GET /api/admin/reports
  app.get("/api/admin/reports", requireAdmin, async (req, res) => {
    try {
      const status = (req.query.status as string) || "pending";
      const reports = await storage.getReports(status);
      res.json(reports);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  });

  // PATCH /api/admin/reports/:id
  app.patch("/api/admin/reports/:id", requireAdmin, express.json(), async (req, res) => {
    try {
      const { status } = req.body ?? {};
      if (!["pending", "reviewed", "actioned", "dismissed"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      await storage.updateReportStatus(Number(req.params.id), status);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to update report" });
    }
  });

  // ── Admin: Social stats ──────────────────────────────────────────────────────
  app.get("/api/admin/social-stats", requireAdmin, async (_req, res) => {
    try {
      res.json(await storage.getSocialStats());
    } catch (err) {
      console.error("[GET /api/admin/social-stats]", err);
      res.status(500).json({ error: "Failed to fetch social stats" });
    }
  });

  // ── Admin: Blocked usernames ─────────────────────────────────────────────────
  app.get("/api/admin/blocked-usernames", requireAdmin, async (_req, res) => {
    res.json(await storage.getBlockedUsernames());
  });

  app.post("/api/admin/blocked-usernames", requireAdmin, express.json(), async (req, res) => {
    const { username, reason } = req.body ?? {};
    if (!username || typeof username !== "string") return res.status(400).json({ error: "username required" });
    const clean = username.slice(0, 15).trim().toLowerCase();
    if (!/^[a-z0-9_]+$/.test(clean)) return res.status(400).json({ error: "Invalid username format" });
    try {
      const row = await storage.addBlockedUsername(clean, reason);
      res.json(row);
    } catch (err: any) {
      if (err.code === "23505") return res.status(409).json({ error: "Already blocked" });
      res.status(500).json({ error: "Failed to block username" });
    }
  });

  app.delete("/api/admin/blocked-usernames/:username", requireAdmin, async (req, res) => {
    await storage.removeBlockedUsername(req.params.username);
    res.json({ success: true });
  });

  // Deploy webhook — called by GitHub Actions on every push to main
  app.post("/api/deploy", (req, res) => {
    const token = req.headers["x-deploy-token"];
    if (!process.env.DEPLOY_WEBHOOK_SECRET || token !== process.env.DEPLOY_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    // Respond immediately — pm2 restart would kill the process before a response could be sent
    res.json({ message: "Deploy started" });

    // Run the deploy script in a fully detached child process so it survives the pm2 restart
    const cmd = [
      "cd /home/featherapp/htdocs",
      "git pull origin main",
      "npm install --include=dev",
      "npm run build",
      // db:push BEFORE pm2 restart so the new schema is live when the process comes back up
      "set -o allexport && source /home/featherapp/htdocs/.env && set +o allexport && npm run db:push || true",
      "pm2 restart feather-app",
    ].join(" && ");

    // Small delay so the HTTP response is flushed before we potentially restart
    setTimeout(() => {
      const child = spawn("/bin/bash", ["-c", `${cmd} >> /tmp/feather-deploy.log 2>&1`], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
    }, 500);
  });

  // ── Social Ads API ────────────────────────────────────────────────────────────
  // GET /api/social/ads — public: active ads for a placement
  app.get("/api/social/ads", async (req, res) => {
    try {
      const placement = typeof req.query.placement === "string" ? req.query.placement : undefined;
      const ads = await storage.getActiveSocialAds(placement);
      res.json(ads);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch ads" });
    }
  });

  // GET /api/admin/social-ads — admin: all ads
  app.get("/api/admin/social-ads", requireAdmin, async (_req, res) => {
    try {
      const ads = await storage.getAllSocialAds();
      res.json(ads);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch ads" });
    }
  });

  // POST /api/admin/social-ads — admin: create ad
  app.post("/api/admin/social-ads", requireAdmin, express.json(), async (req, res) => {
    try {
      const { title, imageUrl, linkUrl, callToAction, placement, active } = req.body ?? {};
      if (!title || !linkUrl) return res.status(400).json({ error: "title and linkUrl required" });
      const ad = await storage.createSocialAd({ title, imageUrl, linkUrl, callToAction, placement, active });
      res.status(201).json(ad);
    } catch (err) {
      res.status(500).json({ error: "Failed to create ad" });
    }
  });

  // PATCH /api/admin/social-ads/:id — admin: update ad
  app.patch("/api/admin/social-ads/:id", requireAdmin, express.json(), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const ad = await storage.updateSocialAd(id, req.body ?? {});
      res.json(ad);
    } catch (err) {
      res.status(500).json({ error: "Failed to update ad" });
    }
  });

  // DELETE /api/admin/social-ads/:id — admin: delete ad
  app.delete("/api/admin/social-ads/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteSocialAd(Number(req.params.id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete ad" });
    }
  });

  // POST /api/social/ads/:id/impression — track impression
  app.post("/api/social/ads/:id/impression", async (req, res) => {
    try {
      await storage.incrementSocialAdImpressions(Number(req.params.id));
      res.json({ success: true });
    } catch {
      res.json({ success: false });
    }
  });

  // ── Feather AI ──────────────────────────────────────────────────────────────
  const { streamFromChainGPT } = await import("./chainGPTAI");

  // GET /api/ai/config — token gating removed; daily limit still applies
  app.get("/api/ai/config", async (_req, res) => {
    try {
      const mod = await storage.getModerationSettings();
      res.json({ minTrenchyToAI: 0, aiDailyLimit: mod.aiDailyLimit });
    } catch {
      res.json({ minTrenchyToAI: 0, aiDailyLimit: 10 });
    }
  });

  // GET /api/ai/usage — daily usage for authenticated user
  app.get("/api/ai/usage", requireSocialAuth, async (req, res) => {
    const wallet = (req as any).socialWallet as string;
    try {
      const isAdmin = wallet.toLowerCase() === ADMIN_WALLET.toLowerCase();
      const [mod, used] = await Promise.all([
        storage.getModerationSettings(),
        isAdmin ? Promise.resolve(0) : storage.getAiDailyUsageCount(wallet),
      ]);
      res.json({ used, limit: isAdmin ? null : mod.aiDailyLimit, remaining: isAdmin ? null : Math.max(0, mod.aiDailyLimit - used) });
    } catch {
      res.json({ used: 0, limit: 10, remaining: 10 });
    }
  });

  // POST /api/ai/chat — SSE streaming chat with ChainGPT
  app.post("/api/ai/chat", requireSocialAuth, express.json({ limit: "16kb" }), async (req, res) => {
    const wallet = (req as any).socialWallet as string;
    try {
      const isAdmin = wallet.toLowerCase() === ADMIN_WALLET.toLowerCase();
      const mod = await storage.getModerationSettings();
      if (!isAdmin) {
        const dailyUsed = await storage.getAiDailyUsageCount(wallet);
        if (dailyUsed >= mod.aiDailyLimit) {
          return res.status(429).json({ error: `You've used all ${mod.aiDailyLimit} of your daily Feather AI prompts. Resets at midnight UTC.` });
        }
      }

      const { message, sessionId } = req.body ?? {};
      if (!message || typeof message !== "string" || message.trim().length === 0) {
        return res.status(400).json({ error: "message is required" });
      }
      if (!sessionId || typeof sessionId !== "string") {
        return res.status(400).json({ error: "sessionId is required" });
      }
      const cleanMsg = message.trim().slice(0, 2000);

      const history = await storage.getAiHistory(wallet, sessionId, 20);
      const historyForAI = history.map((m) => ({ role: m.role, content: m.content }));

      await storage.saveAiMessage(wallet, sessionId, "user", cleanMsg);

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      const send = (data: object) => {
        if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      let fullResponse = "";
      let settled = false;

      const cleanup = streamFromChainGPT(
        cleanMsg,
        historyForAI,
        (chunk) => {
          send(chunk);
          if (chunk.type === "text" && chunk.content) fullResponse += chunk.content;
        },
        async () => {
          if (settled) return;
          settled = true;
          if (fullResponse.trim()) {
            try { await storage.saveAiMessage(wallet, sessionId, "assistant", fullResponse.trim()); } catch {}
          }
          send({ type: "done" });
          res.end();
        },
        (err) => {
          if (settled) return;
          settled = true;
          send({ type: "error", content: "Feather AI encountered an error. Please try again." });
          res.end();
          console.error("[FeatherAI] ChainGPT error:", err.message);
        }
      );

      req.on("close", () => { cleanup(); });
    } catch (err) {
      console.error("[FeatherAI] chat error:", err);
      if (!res.headersSent) res.status(500).json({ error: "Failed to reach Feather AI" });
      else res.end();
    }
  });

  // GET /api/ai/history/:sessionId — get history for a session
  app.get("/api/ai/history/:sessionId", requireSocialAuth, async (req, res) => {
    const wallet = (req as any).socialWallet as string;
    try {
      const history = await storage.getAiHistory(wallet, req.params.sessionId);
      res.json(history);
    } catch {
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  // GET /api/ai/sessions — get all sessions for user
  app.get("/api/ai/sessions", requireSocialAuth, async (req, res) => {
    const wallet = (req as any).socialWallet as string;
    try {
      const sessions = await storage.getAiSessions(wallet);
      res.json(sessions);
    } catch {
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  // DELETE /api/ai/sessions/:sessionId — clear session history
  app.delete("/api/ai/sessions/:sessionId", requireSocialAuth, async (req, res) => {
    const wallet = (req as any).socialWallet as string;
    try {
      await storage.clearAiSession(wallet, req.params.sessionId);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to clear session" });
    }
  });

  // ── Token Launcher (Robinhood Chain on-chain factory) ─────────────────────────

  // GET /api/bags/gate — returns the current threshold and the user's balance
  app.get("/api/bags/gate", async (req, res) => {
    try {
      const wallet = (req.query.wallet as string) ?? "";
      const balance = wallet ? await storage.getTrenchyBalance(wallet).catch(() => 0) : 0;
      res.json({ threshold: 0, balance, hasAccess: true });
    } catch (err: any) {
      console.error("[GET /api/bags/gate]", err.message);
      res.status(500).json({ error: "Failed to check gate" });
    }
  });

  // POST /api/bags/prepare — upload image + metadata to IPFS, return metadataURI + creation fee
  // Client then signs factory.create / createAndBuy with the user's wallet.
  app.post("/api/bags/prepare", express.json({ limit: "12mb" }), async (req, res) => {
    try {
      const {
        name, symbol, description,
        imageUrl, imageData, mimeType: reqMimeType,
        website, twitter, telegram,
        feeWallet,
        feeRecipients: rawFeeRecipients,
      } = req.body ?? {};

      if (!name || !symbol) {
        return res.status(400).json({ error: "name and symbol are required" });
      }
      if (!imageUrl && !imageData) {
        return res.status(400).json({ error: "Either imageUrl or imageData (base64) is required" });
      }

      let feeRecipients: FeeRecipientEntry[];
      if (rawFeeRecipients && Array.isArray(rawFeeRecipients) && rawFeeRecipients.length > 0) {
        feeRecipients = rawFeeRecipients as FeeRecipientEntry[];
      } else {
        if (!feeWallet || !isEvmAddress(feeWallet)) {
          return res.status(400).json({ error: "Either feeRecipients or feeWallet is required" });
        }
        feeRecipients = [{ wallet: feeWallet, basisPoints: 10000 }];
      }
      try {
        assertValidFeeRecipients(feeRecipients);
      } catch (e: any) {
        return res.status(400).json({ error: e.message });
      }

      let imageBuffer: Buffer;
      let contentType: string;
      if (imageData) {
        contentType = reqMimeType || "image/png";
        imageBuffer = Buffer.from(imageData, "base64");
        if (imageBuffer.length < 100) return res.status(400).json({ error: "Image data is too small or invalid" });
        if (imageBuffer.length > 10 * 1024 * 1024) return res.status(400).json({ error: "Image must be under 10 MB" });
      } else {
        const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) });
        if (!imgRes.ok) return res.status(400).json({ error: `Failed to fetch image (${imgRes.status})` });
        contentType = imgRes.headers.get("content-type") || "image/png";
        imageBuffer = Buffer.from(await imgRes.arrayBuffer());
      }

      const prepared = await prepareLaunchMetadata({
        name: String(name).trim(),
        symbol: String(symbol).trim().toUpperCase().slice(0, 12),
        imageBuffer,
        mimeType: contentType,
        description,
        website,
        twitter,
        telegram,
      });

      const { getLaunchPartnerConfig } = await import("./launchPartner");
      const partner = getLaunchPartnerConfig();

      // Partner wallet cannot also appear as a creator fee claimer
      if (partner.configured) {
        const clash = feeRecipients.some(
          (r) => r.wallet.toLowerCase() === partner.partner.toLowerCase()
        );
        if (clash) {
          return res.status(400).json({
            error: "Partner wallet cannot also be listed as a creator fee recipient.",
          });
        }
      }

      res.json({
        ...prepared,
        factory: ROBINHOOD_LAUNCHPAD.factory,
        feeRecipients,
        partner: partner.configured ? partner.partner : null,
        partnerBps: partner.configured ? partner.partnerBps : 0,
        partnerConfigured: partner.configured,
      });
    } catch (err: any) {
      console.error("[api/bags/prepare]", err.message);
      res.status(500).json({ error: err.message ?? "Failed to prepare launch" });
    }
  });

  // POST /api/bags/record — persist a successful on-chain launch (after wallet tx confirms)
  app.post("/api/bags/record", express.json(), async (req, res) => {
    try {
      const {
        name, symbol, description, website, twitter, telegram,
        imageUrl, mintAddress, txHash, feeShare, curve, poolId,
        creatorWallet, feeRecipients,
      } = req.body ?? {};

      if (!name || !symbol || !mintAddress || !txHash) {
        return res.status(400).json({ error: "name, symbol, mintAddress, and txHash are required" });
      }
      if (!isEvmAddress(mintAddress) || !isTxHash(txHash)) {
        return res.status(400).json({ error: "Invalid mintAddress or txHash" });
      }

      const launch = await storage.createLaunch({
        coinName: name,
        ticker: symbol,
        imageUrl: imageUrl ?? null,
        description: description ?? null,
        website: website ?? null,
        twitter: twitter ?? null,
        status: "successful",
        pumpUrl: null,
        bagsUrl: `/dex/${mintAddress}`,
          mintAddress,
          platform: "web",
          launchpad: "feather",
        } as any);

      invalidateFactoryTokenCache();
      // Clear chain-token cache so new launches appear promptly
      chainTokenCache.clear();

      res.json({
        ok: true,
        launchId: launch.id,
        mintAddress,
        txHash,
        feeShare: feeShare ?? null,
        curve: curve ?? null,
        poolId: poolId ?? null,
        creatorWallet: creatorWallet ?? null,
        feeRecipients: feeRecipients ?? null,
        telegram: telegram ?? null,
        explorerUrl: EXPLORER_TX_URL(txHash),
      });
    } catch (err: any) {
      console.error("[api/bags/record]", err.message);
      res.status(500).json({ error: err.message ?? "Failed to record launch" });
    }
  });

  // Legacy SSE endpoint — redirects clients to the prepare + wallet flow
  app.post("/api/bags/launch", express.json({ limit: "12mb" }), async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    send("error", {
      error:
        "Please update Feather App — token launches are signed in your wallet. Reload the page and try again.",
    });
    res.end();
  });

  // GET /api/token/:address/creator-fees — claimable WETH + feeShare for a wallet
  app.get("/api/token/:address/creator-fees", async (req, res) => {
    try {
      const token = req.params.address;
      const wallet = (req.query.wallet as string) || "";
      if (!isEvmAddress(token)) return res.status(400).json({ error: "Invalid token address" });

      const state = await bagsPublicClient.readContract({
        address: ROBINHOOD_LAUNCHPAD.lens as Address,
        abi: bagsLensAbi,
        functionName: "getTokenState",
        args: [token as Address],
      }) as {
        exists: boolean;
        migrated: boolean;
        curve: Address;
        feeShare: Address;
        poolId: `0x${string}`;
        bondingProgressPct: bigint;
      };

      if (!state?.exists) {
        return res.json({ exists: false, claimable: "0", feeShare: null, claimers: [], isClaimer: false, userBps: 0 });
      }

      const feeShare = state.feeShare;
      let claimers: { address: string; bps: number }[] = [];
      try {
        const [addrs, bps] = await bagsPublicClient.readContract({
          address: feeShare,
          abi: bagsFeeShareAbi,
          functionName: "getClaimers",
        }) as [Address[], number[]];
        claimers = addrs.map((a, i) => ({ address: a, bps: Number(bps[i] ?? 0) }));
      } catch {
        /* ignore */
      }

      let claimable = 0n;
      let userBps = 0;
      let isClaimer = false;
      if (wallet && isEvmAddress(wallet)) {
        claimable = await bagsPublicClient.readContract({
          address: ROBINHOOD_LAUNCHPAD.lens as Address,
          abi: bagsLensAbi,
          functionName: "claimableOf",
          args: [token as Address, wallet as Address],
        }) as bigint;
        const match = claimers.find((c) => c.address.toLowerCase() === wallet.toLowerCase());
        if (match) {
          isClaimer = true;
          userBps = match.bps;
        } else {
          // Partner may earn without appearing in getClaimers
          try {
            const partner = await bagsPublicClient.readContract({
              address: feeShare,
              abi: bagsFeeShareAbi,
              functionName: "PARTNER",
            }) as Address;
            if (partner && partner.toLowerCase() === wallet.toLowerCase()) {
              isClaimer = true;
              const partnerBps = await bagsPublicClient.readContract({
                address: feeShare,
                abi: bagsFeeShareAbi,
                functionName: "PARTNER_BPS",
              }) as number;
              userBps = Number(partnerBps);
            }
          } catch {
            /* ignore */
          }
        }
      }

      res.json({
        exists: true,
        migrated: state.migrated,
        bondingProgressPct: Number(state.bondingProgressPct),
        feeShare,
        curve: state.curve,
        poolId: state.poolId,
        claimable: claimable.toString(),
        claimers,
        isClaimer,
        userBps,
        claimCalldata: encodeClaimFeesCalldata(true),
      });
    } catch (err: any) {
      console.error("[api/token/creator-fees]", err.message);
      res.status(500).json({ error: err.message ?? "Failed to load creator fees" });
    }
  });

  // ── Communities ───────────────────────────────────────────────────────────────

  // GET /api/communities
  app.get("/api/communities", async (req, res) => {
    try {
      const communities = await storage.getCommunities(50);
      const wallet = (req as any).wallet as string | undefined;
      if (wallet) {
        const userCommunityIds = new Set((await storage.getUserCommunities(wallet)).map((c) => c.id));
        const withMembership = communities.map((c) => ({ ...c, isMember: userCommunityIds.has(c.id) }));
        return res.json(withMembership);
      }
      res.json(communities);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch communities" });
    }
  });

  // POST /api/communities
  app.post("/api/communities", requireSocialAuth, express.json(), async (req, res) => {
    try {
      const wallet = (req as any).socialWallet as string;
      const { name, description, isPublic, logoIpfsCid } = req.body ?? {};
      if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
      const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const existing = await storage.getCommunityBySlug(slug);
      if (existing) return res.status(409).json({ error: "A community with that name already exists" });
      const community = await storage.createCommunity({ name: name.trim(), slug, description: description?.trim(), logoIpfsCid: logoIpfsCid ?? undefined, createdByWallet: wallet, isPublic: isPublic !== false });
      res.json(community);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to create community" });
    }
  });

  // GET /api/communities/:slug
  app.get("/api/communities/:slug", async (req, res) => {
    try {
      const community = await storage.getCommunityBySlug(req.params.slug);
      if (!community) return res.status(404).json({ error: "Community not found" });
      res.json(community);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch community" });
    }
  });

  // GET /api/communities/:id/members
  app.get("/api/communities/:id/members", async (req, res) => {
    try {
      const members = await storage.getCommunityMembers(Number(req.params.id));
      res.json(members);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch members" });
    }
  });

  // POST /api/communities/:id/join
  app.post("/api/communities/:id/join", requireSocialAuth, async (req, res) => {
    try {
      const wallet = (req as any).socialWallet as string;
      await storage.joinCommunity(Number(req.params.id), wallet);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to join community" });
    }
  });

  // POST /api/communities/:id/leave
  app.post("/api/communities/:id/leave", requireSocialAuth, async (req, res) => {
    try {
      const wallet = (req as any).socialWallet as string;
      await storage.leaveCommunity(Number(req.params.id), wallet);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to leave community" });
    }
  });

  // GET /api/communities/user/mine — communities the authenticated wallet is a member of
  app.get("/api/communities/user/mine", requireSocialAuth, async (req, res) => {
    try {
      const wallet = (req as any).socialWallet as string;
      const communities = await storage.getUserCommunities(wallet);
      res.json(communities);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch your communities" });
    }
  });

  // GET /api/communities/:id/posts
  app.get("/api/communities/:id/posts", async (req, res) => {
    try {
      const posts = await storage.getCommunityPosts(Number(req.params.id));
      res.json(posts);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch posts" });
    }
  });

  // POST /api/communities/:id/posts
  app.delete("/api/communities/posts/:postId", requireSocialAuth, async (req, res) => {
    const postId = parseInt(req.params.postId);
    if (isNaN(postId)) return res.status(400).json({ error: "Invalid post ID" });
    const walletAddress = (req as any).socialWallet as string;
    try {
      const deleted = await storage.deleteCommunityPost(postId, walletAddress);
      if (!deleted) return res.status(403).json({ error: "Not authorized or post not found" });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message ?? "Failed to delete post" });
    }
  });

  app.post("/api/communities/:id/posts", requireSocialAuth, express.json(), async (req, res) => {
    try {
      const wallet = (req as any).socialWallet as string;
      const { content, shareToFeed } = req.body ?? {};
      if (!content?.trim()) return res.status(400).json({ error: "Content is required" });
      if (content.trim().length > 1000) return res.status(400).json({ error: "Post too long (max 1000 chars)" });
      const communityId = Number(req.params.id);
      const post = await storage.createCommunityPost(communityId, wallet, content.trim());
      // Optionally share to main feed
      if (shareToFeed) {
        const community = await storage.getCommunityById(communityId);
        if (community) {
          await storage.createFeedItem({
            userWallet: wallet,
            content: content.trim(),
            type: "community",
            communityId: community.id,
            communityName: community.name,
            communitySlug: community.slug,
          });
        }
      }
      res.json(post);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to create post" });
    }
  });

  // ── Admin: Root-file manager ───────────────────────────────────────────────
  const PUBLIC_ROOT = path.join(process.cwd(), "public-root");
  const ALLOWED_EXTENSIONS = new Set([
    "png","jpg","jpeg","gif","webp","svg","ico",
    "txt","json","xml","html","css","js","ts",
    "pdf","woff","woff2","ttf","eot",
  ]);

  app.get("/api/admin/root-files", requireAdmin, (_req, res) => {
    try {
      if (!fs.existsSync(PUBLIC_ROOT)) return res.json([]);
      const files = fs.readdirSync(PUBLIC_ROOT)
        .filter((n) => !n.startsWith("."))
        .map((name) => {
          const stat = fs.statSync(path.join(PUBLIC_ROOT, name));
          return { name, size: stat.size, modifiedAt: stat.mtime };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      res.json(files);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to list files" });
    }
  });

  app.post("/api/admin/root-files", requireAdmin, express.json({ limit: "12mb" }), (req, res) => {
    try {
      const { filename, content, encoding } = req.body ?? {};
      if (!filename || typeof filename !== "string") return res.status(400).json({ error: "filename required" });
      const safeName = path.basename(filename.replace(/\.\./g, ""));
      const ext = safeName.split(".").pop()?.toLowerCase() ?? "";
      if (!ALLOWED_EXTENSIONS.has(ext)) return res.status(400).json({ error: `File type .${ext} not allowed` });
      if (!fs.existsSync(PUBLIC_ROOT)) fs.mkdirSync(PUBLIC_ROOT, { recursive: true });
      const dest = path.join(PUBLIC_ROOT, safeName);
      if (encoding === "base64") {
        fs.writeFileSync(dest, Buffer.from(content, "base64"));
      } else {
        fs.writeFileSync(dest, content ?? "", "utf8");
      }
      const stat = fs.statSync(dest);
      res.json({ success: true, name: safeName, size: stat.size, modifiedAt: stat.mtime });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to upload file" });
    }
  });

  app.delete("/api/admin/root-files/:filename", requireAdmin, (req, res) => {
    try {
      const safeName = path.basename(req.params.filename.replace(/\.\./g, ""));
      const dest = path.join(PUBLIC_ROOT, safeName);
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to delete file" });
    }
  });

  // ── Helius Intel Routes ───────────────────────────────────────────────────────
  const heliusLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });

  app.get("/api/intel/stats", async (_req, res) => {
    try {
      const data = await getIntelStats();
      return res.json(data);
    } catch (err: any) {
      console.error("[helius] intel/stats error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to fetch intel stats" });
    }
  });

  app.get("/api/intel/wallet/:address", heliusLimiter, async (req, res) => {
    const { address } = req.params;
    if (!address || !isEvmAddress(address)) {
      return res.status(400).json({ error: "Invalid EVM wallet address" });
    }
    try {
      res.json(await getWalletProfile(address));
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch wallet profile" });
    }
  });

  app.get("/api/intel/token/:mint", heliusLimiter, async (req, res) => {
    const { mint } = req.params;
    if (!mint || !isEvmAddress(mint)) {
      return res.status(400).json({ error: "Invalid token contract address" });
    }
    try {
      res.json(await scanToken(mint));
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to scan token" });
    }
  });

  // ── Digital Asset Links — required for TWA full-screen on mobile ──────
  // Populate the ASSETLINKS_JSON env var with the JSON from `bubblewrap fingerprint generateAssetLinks`
  // after you run Bubblewrap to wrap the PWA into an APK.
  app.get("/.well-known/assetlinks.json", (_req, res) => {
    const envContent = process.env.ASSETLINKS_JSON;
    if (envContent) {
      try {
        return res.json(JSON.parse(envContent));
      } catch {
        // fall through to empty array
      }
    }
    res.json([]);
  });

  return httpServer;
}
