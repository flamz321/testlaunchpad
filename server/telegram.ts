import TelegramBot from "node-telegram-bot-api";
import type { Express } from "express";
import { isEvmAddress, FEATHER_TOKEN_ADDRESS } from "@shared/chain";
import { storage } from "./storage";
import type { User } from "@shared/schema";
import {
  uploadMetadataToIPFS,
  createPumpFunToken,
  setupCreatorFeeSharing,
  claimCreatorFees,
  parseFeeRecipient,
  getBotKeypair,
  type FeeRecipient,
} from "./pumpfun";
import { launchBagsToken, type BagsFeeRecipient } from "./bagsfm";
import {
  BOT_WALLET,
  TIERS,
  VERIFICATION_EXPIRY_MS,
  getTier,
  getFeatherBalance,
  formatBalance,
  verifyOwnershipTransaction,
} from "./tokengate";
import { getMarketStats, generateSignal, formatSignalMessage } from "./marketdata";

// ── Markdown safety ──────────────────────────────────────────────────────────
// Telegram's Markdown mode treats _ * ` [ as formatting markers.
// Raw error messages or user-provided text can contain these and break parsing,
// causing Telegram to return a 400 that—if unhandled—crashes the process.
function escapeMd(text: string): string {
  return String(text ?? "").replace(/[_*[\]`]/g, "\\$&");
}

// ── Owner / access control ──────────────────────────────────────────────────
const BOT_OWNER_ID = process.env.TELEGRAM_OWNER_ID || "";

// ── Time constants ──────────────────────────────────────────────────────────
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS  = 24 * 60 * 60 * 1000;

const FEATHER_CA = FEATHER_TOKEN_ADDRESS;
/** @deprecated */
const TRENCHY_CA = FEATHER_CA;

// ── Help text ───────────────────────────────────────────────────────────────
const HELP_TEXT = `
🚀 *Feather App* — Launch tokens on Robinhood Chain via Uniswap — *100% free!*

*How to launch a token:*

Bot-assisted launches are moving to the *Feather App website launchpad*.
You can still start here — we'll guide you, or send you to https://feather.app

*Option 1 — Image attached in one message:*
Send your logo image with this caption:
\`/launch CoinName, TICKER\`

*Option 2 — Two steps:*
1. Send: \`/launch CoinName, TICKER\`
2. Then send your logo image when asked

*Option 3 — Image URL:*
\`/launch CoinName, TICKER, https://your-image.com/logo.png\`

*Commands:*
/launch — Start a new token launch
/signal — Robinhood Chain market signal (5-min cooldown)
/claim — Creator fee claims (legacy — migrating to Robinhood Chain)
/help — Show this message
/skip — Skip the current step
/cancel — Cancel a launch in progress

🔐 *Verification (once per 24h):*
Prove EVM wallet ownership the first time each day. Takes about 30 seconds.

🏆 *Tiers based on $FEATHER holdings:*
• 0 $FEATHER — 1 launch/day
• 250,000 $FEATHER — 8 launches/day
• 1,000,000+ $FEATHER — 24 launches/day _(no hourly cap)_

💎 *$FEATHER CA:* \`${FEATHER_CA}\`
`;

const PAUSED_TEXT = `🔒 *Feather App is currently offline for maintenance.*\n\nWe'll be back shortly — follow [@FeatherApp](https://x.com/FeatherApp) on X for updates!`;

// ── Pending launch state ────────────────────────────────────────────────────
type PendingLaunch =
  | {
      stage: "awaiting_verify_wallet";
      coinName: string;
      ticker: string;
      imageBuffer?: Buffer;
      imageUrl?: string;
    }
  | {
      stage: "awaiting_tx";
      coinName: string;
      ticker: string;
      verifyWallet: string;
      imageBuffer?: Buffer;
      imageUrl?: string;
    }
  | {
      stage: "awaiting_image";
      coinName: string;
      ticker: string;
      imageUrl?: string;
    }
  | {
      // Step 1: choose platform (right after image)
      stage: "awaiting_platform";
      coinName: string;
      ticker: string;
      imageBuffer: Buffer;
      imageUrl?: string;
      savedWallet?: string | null;
    }
  | {
      // Step 2: enter token details (platform-specific prompts)
      stage: "awaiting_details";
      coinName: string;
      ticker: string;
      imageBuffer: Buffer;
      imageUrl?: string;
      launchpad: "pump.fun" | "bags.fm";
      savedWallet?: string | null;
    }
  | {
      // Step 3: enter fee destination (platform-specific options)
      stage: "awaiting_fee_dest";
      coinName: string;
      ticker: string;
      imageBuffer: Buffer;
      imageUrl?: string;
      launchpad: "pump.fun" | "bags.fm";
      description?: string;
      website?: string;
      twitter?: string;
    };

const pendingLaunches = new Map<string, PendingLaunch>();
const signalCooldowns = new Map<string, number>(); // userId → last-used timestamp
const SIGNAL_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// ── User cache ──────────────────────────────────────────────────────────────
const _userCache = new Map<string, { user: User | null; at: number }>();
const USER_CACHE_TTL = 5 * 60_000;

async function getCachedUser(telegramId: string): Promise<User | undefined> {
  const cached = _userCache.get(telegramId);
  if (cached && Date.now() - cached.at < USER_CACHE_TTL) {
    return cached.user ?? undefined;
  }
  const user = await storage.getUserByTelegramId(telegramId);
  _userCache.set(telegramId, { user: user ?? null, at: Date.now() });
  return user;
}

function invalidateUserCache(telegramId: string) {
  _userCache.delete(telegramId);
}

// ── Verification helpers ────────────────────────────────────────────────────
function isVerificationValid(user: User | undefined): boolean {
  if (!user?.verifiedWallet || !user?.walletVerifiedAt) return false;
  return Date.now() - user.walletVerifiedAt.getTime() < VERIFICATION_EXPIRY_MS;
}

// ── Rate limit ──────────────────────────────────────────────────────────────
async function checkRateLimit(
  telegramId: string
): Promise<{ allowed: boolean; message: string }> {
  const user = await getCachedUser(telegramId);
  if (!user) return { allowed: true, message: "" };

  const balance = user.verifiedWallet ? await getFeatherBalance(user.verifiedWallet) : 0;
  const tier = getTier(balance);

  const now = Date.now();
  const dayAgo = new Date(now - ONE_DAY_MS);
  const launchesToday = await storage.getRecentLaunchesByUser(user.id, dayAgo);

  if (launchesToday.length >= tier.dailyLimit) {
    const oldest = launchesToday[launchesToday.length - 1];
    const resetAt = new Date(oldest.createdAt!.getTime() + ONE_DAY_MS);
    return {
      allowed: false,
      message:
        `🚫 *Daily limit reached* (${tier.name})\n\n` +
        `You've used all *${tier.dailyLimit}* of your daily launches.\n\n` +
        `⏳ Resets in *${formatTimeRemaining(resetAt)}*.\n\n` +
        `_Hold more $FEATHER to unlock higher limits._`,
    };
  }

  if (tier.hourlyLimit !== null) {
    const hourAgo = new Date(now - ONE_HOUR_MS);
    const launchesThisHour = await storage.getRecentLaunchesByUser(user.id, hourAgo);
    if (launchesThisHour.length >= tier.hourlyLimit) {
      const oldest = launchesThisHour[launchesThisHour.length - 1];
      const resetAt = new Date(oldest.createdAt!.getTime() + ONE_HOUR_MS);
      return {
        allowed: false,
        message:
          `⏳ *Hourly limit reached* (${tier.name})\n\n` +
          `Next launch available in *${formatTimeRemaining(resetAt)}*.\n\n` +
          `_Hold 250K+ $FEATHER to remove the hourly cap._`,
      };
    }
  }

  return { allowed: true, message: "" };
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function isValidEvmWallet(addr: string): boolean {
  return isEvmAddress(addr.trim());
}

function parseLaunchArgs(text: string): { coinName: string; ticker: string; imageUrl?: string } | null {
  const stripped = text.replace(/^\/launch(@\w+)?/i, "").trim();
  if (!stripped) return null;
  const parts = stripped.split(",").map((s) => s.trim());
  if (parts.length < 2) return null;
  const [coinName, ticker, imageUrl] = parts;
  if (!coinName || !ticker) return null;
  return { coinName, ticker: ticker.toUpperCase(), imageUrl: imageUrl || undefined };
}

function parseDetails(
  text: string,
  launchpad: "pump.fun" | "bags.fm"
): { description?: string; website?: string; twitter?: string } {
  const result: { description?: string; website?: string; twitter?: string } = {};
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const isUrl = /^https?:\/\//i.test(line);
    const isHandle = /^@\w+$/.test(line);
    if (!isUrl && !isHandle && !result.description) {
      result.description = line;
    } else if (isUrl) {
      if (/x\.com|twitter\.com/i.test(line)) {
        if (launchpad === "bags.fm") {
          const m = line.match(/(?:x|twitter)\.com\/([^/?#\s]+)/i);
          result.twitter = m ? m[1] : line;
        } else {
          result.twitter = line;
        }
      } else if (!result.website) {
        result.website = line;
      }
    } else if (isHandle && launchpad === "bags.fm") {
      result.twitter = line.replace(/^@/, "");
    }
  }
  return result;
}

const DETAILS_PROMPT_PUMP = (coinName: string) =>
  `🌐 *Platform chosen: Uniswap (Robinhood Chain)*\n\n` +
  `📝 Optional details for *${coinName}*\n\n` +
  `Send any or all on separate lines:\n` +
  `• Description\n` +
  `• Website URL\n` +
  `• X/Twitter URL (e.g. \`https://x.com/mytoken\`)\n\n` +
  `Example:\n` +
  `\`\`\`\n` +
  `The fastest meme coin on Robinhood Chain\n` +
  `https://mytoken.com\n` +
  `https://x.com/mytoken\n` +
  `\`\`\`\n\n` +
  `Or send /skip to skip details.\n` +
  `Send /cancel to abort.`;

const DETAILS_PROMPT_BAGS = (coinName: string) =>
  `🌐 *Platform chosen: Robinhood Chain launchpad*\n\n` +
  `📝 Optional details for *${coinName}*\n\n` +
  `Send any or all on separate lines:\n` +
  `• Description\n` +
  `• Website URL\n` +
  `• X/Twitter handle (just \`@username\`, e.g. \`@mytoken\`)\n\n` +
  `Example:\n` +
  `\`\`\`\n` +
  `The fastest meme coin on Robinhood Chain\n` +
  `https://mytoken.com\n` +
  `@mytoken\n` +
  `\`\`\`\n\n` +
  `Or send /skip to skip details.\n` +
  `Send /cancel to abort.`;

function formatTimeRemaining(resetAt: Date): string {
  const ms = resetAt.getTime() - Date.now();
  if (ms <= 0) return "shortly";
  const totalMins = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

function feeDestPromptText(
  coinName: string,
  launchpad: "pump.fun" | "bags.fm",
  savedWallet: string | null
): string {
  const header = `💼 *Where should your creator fees from _${coinName}_ trades go?*`;

  let options: string;
  if (launchpad === "bags.fm") {
    options =
      `• *EVM wallet* — paste any wallet address\n` +
      `• *GitHub* — type \`github:username\`\n` +
      `• *X/Twitter* — type \`x:@username\`\n` +
      `• *Kick* — type \`kick:@username\`\n` +
      `• */skip* — Feather App keeps fees\n` +
      `• */cancel* — abort`;
  } else {
    options =
      `• *EVM wallet* — paste any wallet address\n` +
      `• *GitHub* — type \`github:username\`\n` +
      `• */skip* — Cashback Mode: fees go back to traders\n` +
      `• */cancel* — abort`;
  }

  if (savedWallet) {
    return `${header}\n\nYou last used: \`${savedWallet}\`\n\n${options}`;
  }
  return `${header}\n\n${options}`;
}

function parseBagsFeeRecipient(input: string): BagsFeeRecipient | "invalid" {
  const s = input.trim();
  if (!s) return "invalid";

  if (isValidEvmWallet(s)) return { type: "wallet", address: s };

  if (/^github:/i.test(s)) {
    const username = s.replace(/^github:/i, "").replace(/^@/, "").trim();
    return username ? { type: "github", username } : "invalid";
  }

  if (/^x:|^twitter:/i.test(s)) {
    const username = s.replace(/^(?:x|twitter):/i, "").replace(/^@/, "").trim();
    return username ? { type: "twitter", username } : "invalid";
  }

  if (/^kick:/i.test(s)) {
    const username = s.replace(/^kick:/i, "").replace(/^@/, "").trim();
    return username ? { type: "kick", username } : "invalid";
  }

  return "invalid";
}

// ── Verification prompt helpers ─────────────────────────────────────────────
const VERIFY_WALLET_PROMPT =
  `🔐 *Wallet Verification Required*\n\n` +
  `To use Feather App, you need to verify your $FEATHER holdings once every 24 hours.\n\n` +
  `*Step 1 of 2:* Send your $FEATHER holding EVM wallet address (0x…).\n\n` +
  `🏆 *Tiers:*\n` +
  `• 0 $FEATHER — 1 launch/day\n` +
  `• 250,000 $FEATHER — 8 launches/day\n` +
  `• 1,000,000+ $FEATHER — 24 launches/day\n\n` +
  `Send /cancel to abort.`;

function verifyTxPrompt(wallet: string): string {
  const short = `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
  return (
    `✅ Wallet received: \`${short}\`\n\n` +
    `*Step 2 of 2:* Send a small transaction from that wallet to our bot wallet to prove ownership.\n\n` +
    `📤 Send *a tiny amount of ETH (dust)* from \`${short}\` to:\n` +
    `\`${BOT_WALLET}\`\n\n` +
    `Then paste the *transaction signature* or a *Blockscout link* here.\n\n` +
    `⚠️ The transaction must be sent within *5 minutes*.\n\n` +
    `Send /cancel to abort.`
  );
}

// ── Download helpers ─────────────────────────────────────────────────────────
async function downloadTelegramFile(bot: TelegramBot, fileId: string): Promise<Buffer> {
  const fileLink = await bot.getFileLink(fileId);
  const response = await fetch(fileLink);
  if (!response.ok) throw new Error("Could not download your image from Telegram. Please try sending it again.");
  return Buffer.from(await response.arrayBuffer());
}

async function fetchImageFromUrl(url: string): Promise<Buffer> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  } catch {
    throw new Error("Could not reach that image URL. Please check the link and try again.");
  }
  if (!response.ok) throw new Error(`Could not download image from that URL (${response.status}). Please check the link.`);
  return Buffer.from(await response.arrayBuffer());
}

// ── processImageAndAskDetails ─────────────────────────────────────────────────
async function processImageAndAskDetails(
  bot: TelegramBot,
  msg: TelegramBot.Message,
  chatId: number,
  telegramId: string,
  coinName: string,
  ticker: string,
  imageUrl: string | undefined,
  editMessageId?: number
): Promise<void> {
  const hasPhoto = msg.photo && msg.photo.length > 0;
  const hasDocument = msg.document?.mime_type?.startsWith("image/");

  const sendOrEdit = async (text: string) => {
    if (editMessageId) {
      await bot.editMessageText(text, { chat_id: chatId, message_id: editMessageId, parse_mode: "Markdown" });
    } else {
      await bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
    }
  };

  if (!hasPhoto && !hasDocument && !imageUrl) {
    pendingLaunches.set(telegramId, { stage: "awaiting_image", coinName, ticker, imageUrl });
    await sendOrEdit(
      `Got it! Now send your logo image for *${coinName}* (${ticker}).\n\nJust send the image — no caption needed.\n\nSend /cancel to abort.`
    );
    return;
  }

  let loadingMsgId = editMessageId;
  if (!loadingMsgId) {
    const m = await bot.sendMessage(chatId, `📥 Saving your image for *${coinName}* (${ticker})...`, { parse_mode: "Markdown" });
    loadingMsgId = m.message_id;
  } else {
    await bot.editMessageText(`📥 Saving your image for *${coinName}* (${ticker})...`, {
      chat_id: chatId, message_id: loadingMsgId, parse_mode: "Markdown",
    });
  }

  let imageBuffer: Buffer;
  try {
    if (hasPhoto) {
      imageBuffer = await downloadTelegramFile(bot, msg.photo![msg.photo!.length - 1].file_id);
    } else if (hasDocument) {
      imageBuffer = await downloadTelegramFile(bot, msg.document!.file_id);
    } else {
      imageBuffer = await fetchImageFromUrl(imageUrl!);
    }
  } catch (err: any) {
    await bot.editMessageText(`❌ ${err.message || "Could not save your image. Please try again."}`, {
      chat_id: chatId, message_id: loadingMsgId!,
    });
    return;
  }

  pendingLaunches.set(telegramId, { stage: "awaiting_platform", coinName, ticker, imageBuffer, imageUrl });
  await bot.editMessageText(PLATFORM_PROMPT(coinName), {
    chat_id: chatId, message_id: loadingMsgId!, parse_mode: "Markdown",
  });
}

// ── Platform prompt (shown right after image) ─────────────────────────────────
const PLATFORM_PROMPT = (coinName: string) =>
  `✅ Image ready for *${coinName}*!\n\n` +
  `🌐 *Step 1: Choose your launch style*\n\n` +
  `1️⃣ *Uniswap* — Send \`1\` or \`uniswap\`\n` +
  `2️⃣ *Robinhood Chain DEX* — Send \`2\` or \`rh\`\n\n` +
  `Send /cancel to abort.`;

// ── executeLaunchOnPlatform — Robinhood Chain launch (bot path being rebuilt) ─
async function executeLaunchOnPlatform(
  bot: TelegramBot,
  chatId: number,
  telegramId: string,
  username: string,
  pending: Extract<PendingLaunch, { stage: "awaiting_fee_dest" }>,
  _pumpRecipient: FeeRecipient | null,
  _bagsRecipient: BagsFeeRecipient
): Promise<void> {
  pendingLaunches.delete(telegramId);

  const appUrl = process.env.APP_URL || "https://feather.app";
  const platformLabel = pending.launchpad === "bags.fm" ? "Robinhood Chain DEX" : "Uniswap";

  try {
    let user = await getCachedUser(telegramId);
    if (!user) {
      user = await storage.createUser({
        telegramId,
        username,
        walletAddress: "none",
        encryptedPrivateKey: "user_provided",
      });
      invalidateUserCache(telegramId);
    }

    await storage.createLaunch({
      userId: user.id,
      coinName: pending.coinName,
      ticker: pending.ticker,
      imageUrl: pending.imageUrl || null,
      description: pending.description || null,
      website: pending.website || null,
      twitter: pending.twitter || null,
      status: "failed",
      platform: "telegram",
      launchpad: pending.launchpad === "bags.fm" ? "uniswap" : "uniswap",
    });

    await bot.sendMessage(
      chatId,
      `🪶 *${escapeMd(pending.coinName)}* (${escapeMd(pending.ticker)}) — Feather App now launches on *Robinhood Chain* (${escapeMd(platformLabel)}).\n\n` +
      `Telegram bot launches are being rebuilt for EVM. For now, launch from the site:\n` +
      `🔗 ${appUrl}/launch\n\n` +
      `Connect MetaMask, Rabby, or Robinhood Wallet to get started.`,
      { parse_mode: "Markdown" }
    );
  } catch (err: any) {
    console.error("[telegram] Launch error:", err);
    await bot.sendMessage(
      chatId,
      `❌ Launch unavailable for *${escapeMd(pending.coinName)}*.\n\n${escapeMd(err.message || "Something went wrong.")}\n\nUse ${(process.env.APP_URL || "https://feather.app")}/launch instead.`,
      { parse_mode: "Markdown" }
    ).catch(() => {});
  }
}

// ── initTelegramBot ──────────────────────────────────────────────────────────
export function initTelegramBot(app?: Express): TelegramBot | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("[telegram] TELEGRAM_BOT_TOKEN not set — bot is disabled");
    return null;
  }

  const isProduction = process.env.NODE_ENV === "production";
  let bot: TelegramBot;

  if (isProduction && app) {
    bot = new TelegramBot(token);
    const webhookPath = `/webhook/telegram`;
    app.post(webhookPath, (req, res) => {
      bot.processUpdate(req.body);
      res.sendStatus(200);
    });

    const domain = process.env.WEBHOOK_DOMAIN || process.env.REPLIT_DOMAINS?.split(",")[0];
    if (domain) {
      const webhookUrl = `https://${domain}${webhookPath}`;
      bot.setWebHook(webhookUrl)
        .then(() => console.log(`[telegram] Webhook registered: ${webhookUrl}`))
        .catch((err: any) => console.error("[telegram] Failed to set webhook:", err.message));
    } else {
      console.log("[telegram] No WEBHOOK_DOMAIN set — clearing any old webhook and starting polling");
      bot.deleteWebHook()
        .then(() => bot.startPolling())
        .then(() => console.log("[telegram] Polling started successfully"))
        .catch((err: any) => console.error("[telegram] Failed to start polling:", err.message));
    }
  } else {
    bot = new TelegramBot(token, { polling: true });
    bot.on("polling_error", (err) => {
      if ((err as any).code === "ETELEGRAM" && err.message?.includes("409")) return;
      console.error("[telegram] Polling error:", err.message);
    });
  }

  bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, HELP_TEXT, { parse_mode: "Markdown" });
  });

  bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id, HELP_TEXT, { parse_mode: "Markdown" });
  });

  bot.onText(/\/cancel/, (msg) => {
    const telegramId = String(msg.from?.id || msg.chat.id);
    if (pendingLaunches.has(telegramId)) {
      pendingLaunches.delete(telegramId);
      bot.sendMessage(msg.chat.id, "✅ Launch cancelled.");
    } else {
      bot.sendMessage(msg.chat.id, "Nothing to cancel right now.");
    }
  });

  bot.onText(/\/pause(.*)/, async (msg, match) => {
    const telegramId = String(msg.from?.id || msg.chat.id);
    if (telegramId !== BOT_OWNER_ID) return bot.sendMessage(msg.chat.id, "⛔ You are not authorised to use this command.");
    const reason = (match?.[1] || "").trim() || undefined;
    await storage.setBotPaused(true, reason);
    const display = reason ? `\n\n*Reason:* ${reason}` : "";
    bot.sendMessage(msg.chat.id, `🔒 Bot is now *paused*. New launches are blocked.${display}`, { parse_mode: "Markdown" });
  });

  bot.onText(/\/resume/, async (msg) => {
    const telegramId = String(msg.from?.id || msg.chat.id);
    if (telegramId !== BOT_OWNER_ID) return bot.sendMessage(msg.chat.id, "⛔ You are not authorised to use this command.");
    await storage.setBotPaused(false);
    bot.sendMessage(msg.chat.id, "✅ Bot is now *live* — launches are open!", { parse_mode: "Markdown" });
  });

  bot.onText(/\/status/, async (msg) => {
    const telegramId = String(msg.from?.id || msg.chat.id);
    if (telegramId !== BOT_OWNER_ID) return bot.sendMessage(msg.chat.id, "⛔ You are not authorised to use this command.");
    const settings = await storage.getBotSettings();
    const state = settings.isPaused ? "🔒 *Paused*" : "✅ *Live*";
    const reason = settings.isPaused && settings.pauseReason ? `\n*Reason:* ${settings.pauseReason}` : "";
    bot.sendMessage(msg.chat.id, `Bot status: ${state}${reason}`, { parse_mode: "Markdown" });
  });

  bot.onText(/\/signal/, async (msg) => {
    const userId = String(msg.from?.id);
    if (!userId) return;
    const isOwner = userId === BOT_OWNER_ID;

    if (!isOwner) {
      const lastUsed = signalCooldowns.get(userId) ?? 0;
      const remaining = SIGNAL_COOLDOWN_MS - (Date.now() - lastUsed);
      if (remaining > 0) {
        const secs = Math.ceil(remaining / 1000);
        return bot.sendMessage(
          msg.chat.id,
          `⏱ Signal on cooldown. Try again in *${secs}s*`,
          { parse_mode: "Markdown" }
        );
      }
    }

    signalCooldowns.set(userId, Date.now());

    try {
      const stats = await getMarketStats();
      const signal = generateSignal(stats);
      const text = formatSignalMessage(signal);
      return bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
    } catch (err: any) {
      console.error("[signal] Error:", err.message);
      return bot.sendMessage(msg.chat.id, "❌ Failed to fetch market signal. Try again shortly.");
    }
  });

  bot.onText(/\/claim/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = String(msg.from?.id || chatId);

    const user = await getCachedUser(telegramId);
    if (!user) {
      return bot.sendMessage(chatId, "You haven't launched any tokens yet. Use /launch to get started!");
    }

    const allLaunches = await storage.getRecentLaunchesByUser(user.id, new Date(0));
    const successful = allLaunches.filter(
      (l) => l.status === "successful" && l.mintAddress
    );

    if (successful.length === 0) {
      return bot.sendMessage(chatId, "No successful token launches found for your account.");
    }

    const statusMsg = await bot.sendMessage(
      chatId,
      `⏳ Claiming fees for ${successful.length} token(s)...`,
      { parse_mode: "Markdown" }
    );

    try {
      const botKeypair = getBotKeypair();
      const claimResult = await claimCreatorFees(
        successful.map((l) => ({ mintAddress: l.mintAddress!, coinName: l.coinName })),
        botKeypair
      );

      const lines: string[] = ["💰 *Fee Claim Results*\n"];
      if (claimResult.claimed.length > 0) {
        lines.push(`✅ *Claimed* (${claimResult.claimed.length}): ${claimResult.claimed.join(", ")}`);
      }
      if (claimResult.noFees.length > 0) {
        lines.push(`💤 *No fees yet* (${claimResult.noFees.length}): ${claimResult.noFees.join(", ")}`);
      }
      if (claimResult.noConfig.length > 0) {
        lines.push(`♻️ *Cashback mode* (${claimResult.noConfig.length}): ${claimResult.noConfig.join(", ")}`);
      }
      if (claimResult.failed.length > 0) {
        lines.push(`❌ *Failed* (${claimResult.failed.length}): ${claimResult.failed.join(", ")}`);
      }

      await bot.editMessageText(lines.join("\n"), {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: "Markdown",
      });
    } catch (err: any) {
      console.error("[telegram] Claim error:", err);
      await bot.editMessageText(
        `❌ Claim failed: ${err.message || "Something went wrong. Please try again."}`,
        { chat_id: chatId, message_id: statusMsg.message_id }
      );
    }
  });

  // ── Central message handler ────────────────────────────────────────────────
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = String(msg.from?.id || chatId);
    const username = msg.from?.username || msg.from?.first_name || "unknown";
    const text = (msg.text || msg.caption || "").trim();

    if (
      text.startsWith("/start") ||
      text.startsWith("/help") ||
      text.startsWith("/cancel") ||
      text.startsWith("/pause") ||
      text.startsWith("/resume") ||
      text.startsWith("/status") ||
      text.startsWith("/claim") ||
      text.startsWith("/signal")
    ) return;

    // Paused check (owner can always launch)
    if (telegramId !== BOT_OWNER_ID) {
      const settings = await storage.getBotSettings();
      if (settings.isPaused) {
        const extra = settings.pauseReason ? `\n\n*Reason:* ${settings.pauseReason}` : "";
        return bot.sendMessage(chatId, PAUSED_TEXT + extra, { parse_mode: "Markdown" });
      }
    }

    const pending = pendingLaunches.get(telegramId);

    // ── Stage: awaiting_verify_wallet ─────────────────────────────────────────
    if (pending?.stage === "awaiting_verify_wallet") {
      if (!text || text.startsWith("/")) {
        return bot.sendMessage(chatId,
          "Please send your $FEATHER holding EVM wallet address (0x…), or /cancel to abort.",
          { parse_mode: "Markdown" }
        );
      }
      if (!isValidEvmWallet(text)) {
        return bot.sendMessage(chatId,
          "❌ That doesn't look like a valid EVM wallet address (0x…). Please check and try again, or /cancel to abort."
        );
      }
      pendingLaunches.set(telegramId, {
        stage: "awaiting_tx",
        coinName: pending.coinName,
        ticker: pending.ticker,
        verifyWallet: text,
        imageBuffer: pending.imageBuffer,
        imageUrl: pending.imageUrl,
      });
      return bot.sendMessage(chatId, verifyTxPrompt(text), { parse_mode: "Markdown" });
    }

    // ── Stage: awaiting_tx ────────────────────────────────────────────────────
    if (pending?.stage === "awaiting_tx") {
      if (!text || text.startsWith("/")) {
        return bot.sendMessage(chatId,
          "Please paste the transaction signature or Blockscout link, or /cancel to abort."
        );
      }

      const checkingMsg = await bot.sendMessage(chatId, "🔍 Verifying your transaction...");

      const result = await verifyOwnershipTransaction(text, pending.verifyWallet);
      if (!result.valid) {
        await bot.editMessageText(`❌ ${result.error}`, {
          chat_id: chatId, message_id: checkingMsg.message_id,
        });
        return;
      }

      // Check balance & determine tier
      const balance = await getFeatherBalance(pending.verifyWallet);
      const tier = getTier(balance);

      // Upsert user with verified wallet
      let user = await getCachedUser(telegramId);
      if (!user) {
        user = await storage.createUser({
          telegramId,
          username,
          walletAddress: "none",
          encryptedPrivateKey: "user_provided",
          verifiedWallet: pending.verifyWallet,
          walletVerifiedAt: new Date(),
        });
      } else {
        user = await storage.updateUser(user.id, {
          verifiedWallet: pending.verifyWallet,
          walletVerifiedAt: new Date(),
        });
      }
      invalidateUserCache(telegramId);

      const balanceDisplay = balance === 0 ? "None" : `${formatBalance(balance)} $FEATHER`;
      await bot.editMessageText(
        `✅ *Verified!*\n\n` +
        `💎 Balance: *${balanceDisplay}*\n` +
        `🏆 Tier: *${tier.name}*\n` +
        `📊 Daily limit: *${tier.dailyLimit} launch${tier.dailyLimit > 1 ? "es" : ""}*\n\n` +
        `Verification lasts 24 hours. Now let's launch your token!`,
        { chat_id: chatId, message_id: checkingMsg.message_id, parse_mode: "Markdown" }
      );

      // Rate limit check now that we're verified
      const rateCheck = await checkRateLimit(telegramId);
      if (!rateCheck.allowed) {
        pendingLaunches.delete(telegramId);
        return bot.sendMessage(chatId, rateCheck.message, { parse_mode: "Markdown" });
      }

      // Proceed to image or platform selection
      if (pending.imageBuffer) {
        pendingLaunches.set(telegramId, {
          stage: "awaiting_platform",
          coinName: pending.coinName,
          ticker: pending.ticker,
          imageBuffer: pending.imageBuffer,
          imageUrl: pending.imageUrl,
        });
        return bot.sendMessage(chatId, PLATFORM_PROMPT(pending.coinName), { parse_mode: "Markdown" });
      } else {
        pendingLaunches.set(telegramId, {
          stage: "awaiting_image",
          coinName: pending.coinName,
          ticker: pending.ticker,
        });
        return bot.sendMessage(chatId,
          `Now send your logo image for *${pending.coinName}* (${pending.ticker}).\n\nJust attach an image — no caption needed.\n\nSend /cancel to abort.`,
          { parse_mode: "Markdown" }
        );
      }
    }

    // ── Stage: awaiting_platform (Step 1 — choose platform after image) ──────
    if (pending?.stage === "awaiting_platform") {
      const input = text.toLowerCase().trim();

      let launchpad: "pump.fun" | "bags.fm" | null = null;
      if (input === "1" || input === "pump" || input === "pump.fun" || input === "pumpfun" || input === "uniswap") {
        launchpad = "pump.fun";
      } else if (input === "2" || input === "bags" || input === "bags.fm" || input === "bagsfm" || input === "rh" || input === "robinhood") {
        launchpad = "bags.fm";
      }

      if (!launchpad) {
        return bot.sendMessage(chatId,
          "❌ Unrecognised choice.\n\nSend `1` or `uniswap` for Uniswap, or `2` or `rh` for Robinhood Chain DEX.\nSend /cancel to abort.",
          { parse_mode: "Markdown" }
        );
      }

      const existingUser = await getCachedUser(telegramId);
      const savedWallet = getSavedWallet(existingUser);
      pendingLaunches.set(telegramId, {
        stage: "awaiting_details",
        coinName: pending.coinName,
        ticker: pending.ticker,
        imageBuffer: pending.imageBuffer,
        imageUrl: pending.imageUrl,
        launchpad,
        savedWallet,
      });

      const detailsPrompt = launchpad === "bags.fm"
        ? DETAILS_PROMPT_BAGS(pending.coinName)
        : DETAILS_PROMPT_PUMP(pending.coinName);
      await bot.sendMessage(chatId, detailsPrompt, { parse_mode: "Markdown" });
      return;
    }

    // ── Stage: awaiting_details (Step 2 — token details, platform-specific) ──
    if (pending?.stage === "awaiting_details") {
      if (text.startsWith("/cancel")) return;

      let details: { description?: string; website?: string; twitter?: string } = {};
      if (!text.startsWith("/skip")) {
        details = parseDetails(text, pending.launchpad);
      }

      pendingLaunches.set(telegramId, {
        stage: "awaiting_fee_dest",
        coinName: pending.coinName,
        ticker: pending.ticker,
        imageBuffer: pending.imageBuffer,
        imageUrl: pending.imageUrl,
        launchpad: pending.launchpad,
        ...details,
      });

      const savedWallet = pending.savedWallet ?? null;
      await bot.sendMessage(chatId, feeDestPromptText(pending.coinName, pending.launchpad, savedWallet), { parse_mode: "Markdown" });
      return;
    }

    // ── Stage: awaiting_image ─────────────────────────────────────────────────
    if (pending?.stage === "awaiting_image") {
      const hasPhoto = msg.photo && msg.photo.length > 0;
      const hasDocument = msg.document?.mime_type?.startsWith("image/");

      if (text.startsWith("/skip")) {
        pendingLaunches.delete(telegramId);
        return bot.sendMessage(chatId, "Launch cancelled. Use /launch to start again.");
      }
      if (!hasPhoto && !hasDocument) {
        return bot.sendMessage(chatId,
          `Please send your logo image for *${pending.coinName}* (${pending.ticker}), or /cancel to abort.`,
          { parse_mode: "Markdown" }
        );
      }
      await processImageAndAskDetails(bot, msg, chatId, telegramId, pending.coinName, pending.ticker, pending.imageUrl, undefined);
      return;
    }

    // ── Stage: awaiting_fee_dest (Step 3 — fee destination, platform-specific)
    if (pending?.stage === "awaiting_fee_dest") {
      const feeInput = (msg.text || "").trim();
      const isSkip = feeInput.startsWith("/skip");

      if (!feeInput) {
        const savedWallet = getSavedWallet(await getCachedUser(telegramId));
        return bot.sendMessage(chatId, feeDestPromptText(pending.coinName, pending.launchpad, savedWallet), { parse_mode: "Markdown" });
      }

      if (pending.launchpad === "bags.fm") {
        if (isSkip) {
          await executeLaunchOnPlatform(bot, chatId, telegramId, username, pending, null, null);
          return;
        }
        const bagsRecipient = parseBagsFeeRecipient(feeInput);
        if (bagsRecipient === "invalid") {
          return bot.sendMessage(chatId,
            `❌ That doesn't look right.\n\n` +
            `Please send a *EVM wallet address*, \`github:username\`, \`x:@username\`, \`kick:@username\`, /skip, or /cancel.`,
            { parse_mode: "Markdown" }
          );
        }
        await executeLaunchOnPlatform(bot, chatId, telegramId, username, pending, null, bagsRecipient);
      } else {
        if (isSkip) {
          await executeLaunchOnPlatform(bot, chatId, telegramId, username, pending, null, null);
          return;
        }
        const pumpRecipient = parseFeeRecipient(feeInput);
        if (!pumpRecipient) {
          return bot.sendMessage(chatId,
            `❌ That doesn't look right.\n\n` +
            `Please send a *EVM wallet address*, \`github:username\`, /skip for cashback mode, or /cancel.`,
            { parse_mode: "Markdown" }
          );
        }
        await executeLaunchOnPlatform(bot, chatId, telegramId, username, pending, pumpRecipient, null);
      }
      return;
    }

    // ── New /launch command ───────────────────────────────────────────────────
    if (!text.startsWith("/launch")) return;

    const args = parseLaunchArgs(text);
    if (!args) {
      return bot.sendMessage(chatId,
        [
          "❌ Incorrect format. Here's how to use it:\n",
          "`/launch CoinName, TICKER`\n",
          "Attach your logo image to that message, or just send the command and the bot will ask for the image next.\n",
          "Example: `/launch Doge Killer, DKILL`",
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    // Owner bypasses verification and rate limits
    if (telegramId === BOT_OWNER_ID) {
      await processImageAndAskDetails(bot, msg, chatId, telegramId, args.coinName, args.ticker, args.imageUrl, undefined);
      return;
    }

    // Check if user has valid verification
    const existingUser = await getCachedUser(telegramId);
    if (!isVerificationValid(existingUser)) {
      // Download image now if present so we can store it during verification
      const hasPhoto = msg.photo && msg.photo.length > 0;
      const hasDocument = msg.document?.mime_type?.startsWith("image/");
      let imageBuffer: Buffer | undefined;
      let imageUrl = args.imageUrl;

      if (hasPhoto || hasDocument || imageUrl) {
        try {
          if (hasPhoto) {
            imageBuffer = await downloadTelegramFile(bot, msg.photo![msg.photo!.length - 1].file_id);
          } else if (hasDocument) {
            imageBuffer = await downloadTelegramFile(bot, msg.document!.file_id);
          } else if (imageUrl) {
            imageBuffer = await fetchImageFromUrl(imageUrl);
          }
        } catch {
          imageBuffer = undefined;
        }
      }

      pendingLaunches.set(telegramId, {
        stage: "awaiting_verify_wallet",
        coinName: args.coinName,
        ticker: args.ticker,
        imageBuffer,
        imageUrl,
      });
      return bot.sendMessage(chatId, VERIFY_WALLET_PROMPT, { parse_mode: "Markdown" });
    }

    // Verified — check rate limits
    const rateCheck = await checkRateLimit(telegramId);
    if (!rateCheck.allowed) {
      return bot.sendMessage(chatId, rateCheck.message, { parse_mode: "Markdown" });
    }

    await processImageAndAskDetails(bot, msg, chatId, telegramId, args.coinName, args.ticker, args.imageUrl, undefined);
  });

  console.log("[telegram] Bot initialized");
  return bot;
}

// ── Utility ──────────────────────────────────────────────────────────────────
function getSavedWallet(user: User | undefined): string | null {
  if (!user) return null;
  const w = user.walletAddress;
  if (!w || w === "managed_by_bot" || w === "user_provided" || w === "none") return null;
  return w;
}
