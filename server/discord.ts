import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  Events,
  Message,
  ChatInputCommandInteraction,
  ChannelType,
  TextChannel,
  DMChannel,
} from "discord.js";
import { isEvmAddress, FEATHER_TOKEN_ADDRESS } from "@shared/chain";
import { storage } from "./storage";
import { getMarketStats, generateSignal, formatSignalMessageDiscord } from "./marketdata";
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
  VERIFICATION_EXPIRY_MS,
  getTier,
  getFeatherBalance,
  formatBalance,
  verifyOwnershipTransaction,
} from "./tokengate";
import type { User } from "@shared/schema";

// ── Constants ──────────────────────────────────────────────────────────────────
const DISCORD_OWNER_ID = process.env.DISCORD_OWNER_ID || "";
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS  = 24 * 60 * 60 * 1000;
const FEATHER_CA = FEATHER_TOKEN_ADDRESS;
/** @deprecated */
const TRENCHY_CA = FEATHER_CA;

// ── Pending launch state ───────────────────────────────────────────────────────
type PendingLaunch =
  | {
      stage: "awaiting_verify_wallet";
      coinName: string;
      ticker: string;
      channelId: string;
      guildId: string | null;
      imageBuffer?: Buffer;
      imageUrl?: string;
    }
  | {
      stage: "awaiting_tx";
      coinName: string;
      ticker: string;
      channelId: string;
      guildId: string | null;
      verifyWallet: string;
      imageBuffer?: Buffer;
      imageUrl?: string;
    }
  | {
      stage: "awaiting_image";
      coinName: string;
      ticker: string;
      channelId: string;
      guildId: string | null;
    }
  | {
      // Step 1: choose platform (right after image)
      stage: "awaiting_platform";
      coinName: string;
      ticker: string;
      imageBuffer: Buffer;
      imageUrl?: string;
      channelId: string;
      guildId: string | null;
      savedWallet?: string | null;
    }
  | {
      // Step 2: enter token details (platform-specific)
      stage: "awaiting_details";
      coinName: string;
      ticker: string;
      imageBuffer: Buffer;
      imageUrl?: string;
      channelId: string;
      guildId: string | null;
      launchpad: "pump.fun" | "bags.fm";
      savedWallet?: string | null;
    }
  | {
      // Step 3: enter fee destination (platform-specific)
      stage: "awaiting_fee_dest";
      coinName: string;
      ticker: string;
      imageBuffer: Buffer;
      imageUrl?: string;
      description?: string;
      website?: string;
      twitter?: string;
      channelId: string;
      guildId: string | null;
      launchpad: "pump.fun" | "bags.fm";
    };

const pendingLaunches = new Map<string, PendingLaunch>();
const signalCooldowns = new Map<string, number>(); // discordId → last-used timestamp
const SIGNAL_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// ── User cache ─────────────────────────────────────────────────────────────────
const _userCache = new Map<string, { user: User | null; at: number }>();
const USER_CACHE_TTL = 5 * 60_000;

async function getCachedUser(discordId: string): Promise<User | undefined> {
  const cached = _userCache.get(discordId);
  if (cached && Date.now() - cached.at < USER_CACHE_TTL) return cached.user ?? undefined;
  const user = await storage.getUserByTelegramId(`discord:${discordId}`);
  _userCache.set(discordId, { user: user ?? null, at: Date.now() });
  return user;
}

function invalidateUserCache(discordId: string) { _userCache.delete(discordId); }

// ── Verification helpers ───────────────────────────────────────────────────────
function isVerificationValid(user: User | undefined): boolean {
  if (!user?.verifiedWallet || !user?.walletVerifiedAt) return false;
  return Date.now() - user.walletVerifiedAt.getTime() < VERIFICATION_EXPIRY_MS;
}

// ── Rate limit ─────────────────────────────────────────────────────────────────
async function checkRateLimit(discordId: string): Promise<{ allowed: boolean; message: string }> {
  const user = await getCachedUser(discordId);
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
        `🚫 **Daily limit reached** (${tier.name})\n\n` +
        `You've used all **${tier.dailyLimit}** of your daily launches.\n\n` +
        `⏳ Resets in **${formatTimeRemaining(resetAt)}**.\n\n` +
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
          `⏳ **Hourly limit reached** (${tier.name})\n\n` +
          `Next launch available in **${formatTimeRemaining(resetAt)}**.\n\n` +
          `_Hold 250K+ $FEATHER to remove the hourly cap._`,
      };
    }
  }

  return { allowed: true, message: "" };
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function isValidEvmWallet(addr: string): boolean {
  return isEvmAddress(addr.trim());
}

function parseDetails(
  text: string,
  launchpad: "pump.fun" | "bags.fm"
): { description?: string; website?: string; twitter?: string } {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const result: { description?: string; website?: string; twitter?: string } = {};
  for (const line of lines) {
    const isUrl = /^https?:\/\//i.test(line);
    const isHandle = /^@\w+$/.test(line);
    const lower = line.toLowerCase();
    if (lower.startsWith("website:") || lower.startsWith("web:")) {
      result.website = line.split(":").slice(1).join(":").trim();
    } else if (isUrl && /x\.com|twitter\.com/i.test(line)) {
      if (launchpad === "bags.fm") {
        const m = line.match(/(?:x|twitter)\.com\/([^/?#\s]+)/i);
        result.twitter = m ? m[1] : line;
      } else {
        result.twitter = line;
      }
    } else if (isHandle && launchpad === "bags.fm") {
      result.twitter = line.replace(/^@/, "");
    } else if (isUrl && !result.website) {
      result.website = line;
    } else if (!isUrl && !isHandle && !result.description) {
      result.description = line;
    }
  }
  return result;
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

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download image: ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

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

// ── Help / prompt text ─────────────────────────────────────────────────────────
const HELP_TEXT = `🚀 **Feather App** — Launch tokens on Robinhood Chain via Uniswap — **100% free!**

Bot-assisted launches are moving to the **Feather App website launchpad** at https://feather.app

**Commands:**
\`/launch\` — Start a new token launch
\`/signal\` — Robinhood Chain market signal (5-min cooldown)
\`/claim\` — Creator fee claims (legacy — migrating)
\`/help\` — Show this message

You'll need to verify your $FEATHER holding EVM wallet the first time each day. Takes about 30 seconds.

🏆 **Tiers based on $FEATHER holdings:**
• 0 $FEATHER — 1 launch/day
• 250,000 $FEATHER — 8 launches/day
• 1,000,000+ $FEATHER — 24 launches/day *(no hourly cap)*

💎 **$FEATHER CA:** \`${FEATHER_CA}\``;

const DETAILS_PROMPT_PUMP = (coinName: string) =>
  `🌐 **Platform chosen: Uniswap (Robinhood Chain)**\n\n` +
  `📝 **Optional details for ${coinName}** — send on separate lines:\n` +
  `• Description\n` +
  `• Website URL\n` +
  `• X/Twitter URL (e.g. \`https://x.com/mytoken\`)\n\n` +
  `Example:\n\`\`\`\nThe fastest meme coin on Robinhood Chain\nhttps://mytoken.com\nhttps://x.com/mytoken\n\`\`\`\n\n` +
  `Or type \`skip\` to skip details. Type \`cancel\` to abort.`;

const DETAILS_PROMPT_BAGS = (coinName: string) =>
  `🌐 **Platform chosen: Robinhood Chain launchpad**\n\n` +
  `📝 **Optional details for ${coinName}** — send on separate lines:\n` +
  `• Description\n` +
  `• Website URL\n` +
  `• X/Twitter handle (just \`@username\`, e.g. \`@mytoken\`)\n\n` +
  `Example:\n\`\`\`\nThe fastest meme coin on Robinhood Chain\nhttps://mytoken.com\n@mytoken\n\`\`\`\n\n` +
  `Or type \`skip\` to skip details. Type \`cancel\` to abort.`;

function feeDestPrompt(coinName: string, launchpad: "pump.fun" | "bags.fm", savedWallet?: string | null): string {
  const header = `💼 **Fee destination for ${coinName}**`;
  let options: string;
  if (launchpad === "bags.fm") {
    options =
      `• **EVM wallet** — paste any address\n` +
      `• **GitHub** — type \`github:username\`\n` +
      `• **X/Twitter** — type \`x:@username\`\n` +
      `• **Kick** — type \`kick:@username\`\n` +
      `• \`skip\` — Feather App keeps fees\n` +
      `• \`cancel\` — abort`;
  } else {
    options =
      `• **EVM wallet** — paste any address\n` +
      `• **GitHub** — type \`github:username\`\n` +
      `• \`skip\` — Cashback Mode: fees go back to traders\n` +
      `• \`cancel\` — abort`;
  }
  const saved = savedWallet ? `\n\n💡 **Last used:** \`${savedWallet}\`` : "";
  return `${header}\n\n${options}${saved}`;
}

const VERIFY_WALLET_PROMPT =
  `🔐 **Wallet Verification Required**\n\n` +
  `To use Feather App, you need to verify your $FEATHER holdings once every 24 hours.\n\n` +
  `**Step 1 of 2:** Send your $FEATHER holding EVM wallet address (0x…) in this channel.\n\n` +
  `🏆 **Tiers:**\n` +
  `• 0 $FEATHER — 1 launch/day\n` +
  `• 250,000 $FEATHER — 8 launches/day\n` +
  `• 1,000,000+ $FEATHER — 24 launches/day\n\n` +
  `Type \`cancel\` to abort.`;

function verifyTxPrompt(wallet: string): string {
  const short = `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
  return (
    `✅ Wallet received: \`${short}\`\n\n` +
    `**Step 2 of 2:** Send a small transaction from that wallet to our bot wallet to prove ownership.\n\n` +
    `📤 Send **a tiny amount of ETH (dust)** from \`${short}\` to:\n` +
    `\`${BOT_WALLET}\`\n\n` +
    `Then paste the **transaction signature** or a **Blockscout link** here.\n\n` +
    `⚠️ The transaction must be sent within **5 minutes**.\n\n` +
    `Type \`cancel\` to abort.`
  );
}

// ── Slash command definitions ──────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName("launch")
    .setDescription("Launch a new token on Robinhood Chain — 100% free!")
    .addStringOption((o) => o.setName("name").setDescription("Token name (e.g. Doge Killer)").setRequired(true))
    .addStringOption((o) => o.setName("ticker").setDescription("Token ticker (e.g. DKILL)").setRequired(true))
    .addAttachmentOption((o) => o.setName("image").setDescription("Token logo image (optional — bot will ask if not provided)").setRequired(false)),

  new SlashCommandBuilder().setName("help").setDescription("Show how to use Feather App bot"),
  new SlashCommandBuilder().setName("cancel").setDescription("Cancel your current launch in progress"),

  new SlashCommandBuilder()
    .setName("pause")
    .setDescription("[Owner] Pause the bot — blocks all new launches")
    .addStringOption((o) => o.setName("reason").setDescription("Optional reason shown to users").setRequired(false)),

  new SlashCommandBuilder().setName("resume").setDescription("[Owner] Resume the bot — re-enables launches"),
  new SlashCommandBuilder().setName("status").setDescription("[Owner] Show current bot status (live/paused)"),
  new SlashCommandBuilder().setName("claim").setDescription("Push accumulated creator fees to your configured wallet(s)"),
  new SlashCommandBuilder().setName("signal").setDescription("Robinhood Chain market signal — is now a good time to launch? (5-min cooldown)"),
].map((c) => c.toJSON());

// ── Platform prompt (shown right after image) ──────────────────────────────────
const PLATFORM_PROMPT = (coinName: string) =>
  `✅ **Image ready for ${coinName}!**\n\n` +
  `🌐 **Step 1: Choose your launch style**\n\n` +
  `• Type \`1\` or \`uniswap\` for **Uniswap**\n` +
  `• Type \`2\` or \`rh\` for **Robinhood Chain DEX**\n\n` +
  `Type \`cancel\` to abort.`;

// ── executeLaunchOnPlatform — Robinhood Chain launch (bot path being rebuilt) ──
async function executeLaunchOnPlatform(
  client: Client,
  discordId: string,
  username: string,
  pending: Extract<PendingLaunch, { stage: "awaiting_fee_dest" }>,
  _pumpRecipient: FeeRecipient | null,
  _bagsRecipient: BagsFeeRecipient | null
): Promise<void> {
  pendingLaunches.delete(discordId);

  const channel = await client.channels.fetch(pending.channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const appUrl = process.env.APP_URL || "https://feather.app";
  const platformLabel = pending.launchpad === "bags.fm" ? "Robinhood Chain DEX" : "Uniswap";

  try {
    let user = await getCachedUser(discordId);
    if (!user) {
      user = await storage.createUser({
        telegramId: `discord:${discordId}`,
        username,
        walletAddress: "none",
        encryptedPrivateKey: "user_provided",
      });
      invalidateUserCache(discordId);
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
      platform: "discord",
      launchpad: "uniswap",
    });

    await (channel as TextChannel | DMChannel).send(
      `🪶 **${pending.coinName}** (${pending.ticker}) — Feather App now launches on **Robinhood Chain** (${platformLabel}).\n\n` +
      `Discord bot launches are being rebuilt for EVM. For now, launch from the site:\n` +
      `🔗 ${appUrl}/launch\n\n` +
      `Connect MetaMask, Rabby, or Robinhood Wallet to get started.`
    );
  } catch (err: any) {
    console.error("[discord] Launch failed:", err.message);
    await (channel as TextChannel | DMChannel).send(
      `❌ **Launch unavailable**\n\n\`${err.message || "Unknown error"}\`\n\nUse ${process.env.APP_URL || "https://feather.app"}/launch instead.`
    ).catch(() => {});
  }
}

// ── initDiscordBot ─────────────────────────────────────────────────────────────
export function initDiscordBot(): void {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.log("[discord] DISCORD_BOT_TOKEN not set — Discord bot disabled");
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  client.once(Events.ClientReady, async (c) => {
    console.log(`[discord] Bot ready as ${c.user.tag}`);
    const rest = new REST({ version: "10" }).setToken(token);
    try {
      await rest.put(Routes.applicationCommands(c.user.id), { body: commands });
      console.log("[discord] Slash commands registered");
    } catch (err: any) {
      console.error("[discord] Failed to register slash commands:", err.message);
    }
  });

  // ── Slash command interactions ────────────────────────────────────────────────
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, user } = interaction;
    const discordId = user.id;
    const username = user.username;

    if (commandName === "help") {
      return interaction.reply({ content: HELP_TEXT, ephemeral: false });
    }

    if (commandName === "cancel") {
      if (pendingLaunches.has(discordId)) {
        pendingLaunches.delete(discordId);
        return interaction.reply({ content: "✅ Launch cancelled.", ephemeral: true });
      }
      return interaction.reply({ content: "Nothing to cancel right now.", ephemeral: true });
    }

    if (commandName === "pause") {
      if (discordId !== DISCORD_OWNER_ID) {
        return interaction.reply({ content: "⛔ You are not authorised to use this command.", ephemeral: true });
      }
      const reason = interaction.options.getString("reason") || undefined;
      await storage.setBotPaused(true, reason);
      const display = reason ? `\n\n**Reason:** ${reason}` : "";
      return interaction.reply({ content: `🔒 Bot is now **paused**. New launches are blocked.${display}` });
    }

    if (commandName === "resume") {
      if (discordId !== DISCORD_OWNER_ID) {
        return interaction.reply({ content: "⛔ You are not authorised to use this command.", ephemeral: true });
      }
      await storage.setBotPaused(false);
      return interaction.reply({ content: "✅ Bot is now **live** — launches are open!" });
    }

    if (commandName === "status") {
      if (discordId !== DISCORD_OWNER_ID) {
        return interaction.reply({ content: "⛔ You are not authorised to use this command.", ephemeral: true });
      }
      const settings = await storage.getBotSettings();
      const state = settings.isPaused ? "🔒 **Paused**" : "✅ **Live**";
      const reason = settings.isPaused && settings.pauseReason ? `\n**Reason:** ${settings.pauseReason}` : "";
      return interaction.reply({ content: `Bot status: ${state}${reason}`, ephemeral: true });
    }

    if (commandName === "claim") {
      await interaction.deferReply({ ephemeral: false });

      const user = await getCachedUser(discordId);
      if (!user) {
        return interaction.editReply("You haven't launched any tokens yet. Use `/launch` to get started!");
      }

      const allLaunches = await storage.getRecentLaunchesByUser(user.id, new Date(0));
      const successful = allLaunches.filter(
        (l) => l.status === "successful" && l.mintAddress
      );

      if (successful.length === 0) {
        return interaction.editReply("No successful token launches found for your account.");
      }

      await interaction.editReply(`⏳ Claiming fees for ${successful.length} token(s)...`);

      try {
        const botKeypair = getBotKeypair();
        const claimResult = await claimCreatorFees(
          successful.map((l) => ({ mintAddress: l.mintAddress!, coinName: l.coinName })),
          botKeypair
        );

        const lines: string[] = ["💰 **Fee Claim Results**\n"];
        if (claimResult.claimed.length > 0) {
          lines.push(`✅ **Claimed** (${claimResult.claimed.length}): ${claimResult.claimed.join(", ")}`);
        }
        if (claimResult.noFees.length > 0) {
          lines.push(`💤 **No fees yet** (${claimResult.noFees.length}): ${claimResult.noFees.join(", ")}`);
        }
        if (claimResult.noConfig.length > 0) {
          lines.push(`♻️ **Cashback mode** (${claimResult.noConfig.length}): ${claimResult.noConfig.join(", ")}`);
        }
        if (claimResult.failed.length > 0) {
          lines.push(`❌ **Failed** (${claimResult.failed.length}): ${claimResult.failed.join(", ")}`);
        }

        return interaction.editReply(lines.join("\n"));
      } catch (err: any) {
        console.error("[discord] Claim error:", err);
        return interaction.editReply(
          `❌ Claim failed: ${err.message || "Something went wrong. Please try again."}`
        );
      }
    }

    if (commandName === "signal") {
      const isOwner = discordId === DISCORD_OWNER_ID;
      if (!isOwner) {
        const lastUsed = signalCooldowns.get(discordId) ?? 0;
        const remaining = SIGNAL_COOLDOWN_MS - (Date.now() - lastUsed);
        if (remaining > 0) {
          const secs = Math.ceil(remaining / 1000);
          return interaction.reply({
            content: `⏱ Signal on cooldown. Try again in **${secs}s**`,
            ephemeral: true,
          });
        }
      }
      signalCooldowns.set(discordId, Date.now());

      await interaction.deferReply({ ephemeral: false });
      try {
        const stats = await getMarketStats();
        const signal = generateSignal(stats);
        const text = formatSignalMessageDiscord(signal);
        return interaction.editReply(text);
      } catch (err: any) {
        console.error("[discord] signal error:", err.message);
        return interaction.editReply("❌ Failed to fetch market signal. Try again shortly.");
      }
    }

    if (commandName === "launch") {
      // Paused check
      if (discordId !== DISCORD_OWNER_ID) {
        const settings = await storage.getBotSettings();
        if (settings.isPaused) {
          const extra = settings.pauseReason ? `\n\n**Reason:** ${settings.pauseReason}` : "";
          return interaction.reply({
            content: `🔒 **Feather App is currently offline for maintenance.**\n\nWe'll be back shortly — follow [@FeatherApp](https://x.com/FeatherApp) on X for updates!${extra}`,
          });
        }
      }

      const coinName = interaction.options.getString("name", true).trim();
      const ticker   = interaction.options.getString("ticker", true).trim().toUpperCase();
      const imageAttachment = interaction.options.getAttachment("image");
      const channelId = interaction.channelId;
      const guildId   = interaction.guildId;

      // Owner bypasses verification and rate limits
      if (discordId === DISCORD_OWNER_ID) {
        if (imageAttachment) {
          await interaction.reply({ content: `📥 Saving your image for **${coinName}** (${ticker})...` });
          let imageBuffer: Buffer;
          try {
            imageBuffer = await fetchImageBuffer(imageAttachment.url);
          } catch (err: any) {
            return interaction.editReply(`❌ Could not download your image: ${err.message}\n\nPlease try again.`);
          }
          const savedWallet = getSavedWallet(await getCachedUser(discordId));
          pendingLaunches.set(discordId, { stage: "awaiting_platform", coinName, ticker, imageBuffer, imageUrl: imageAttachment.url, channelId, guildId, savedWallet });
          await interaction.editReply(PLATFORM_PROMPT(coinName));
        } else {
          pendingLaunches.set(discordId, { stage: "awaiting_image", coinName, ticker, channelId, guildId });
          await interaction.reply({ content: `📸 **Please send your logo image for ${coinName} (${ticker}) in this channel.**\n\nAttach an image file to your next message, or type \`cancel\` to abort.` });
        }
        return;
      }

      // Check verification
      const existingUser = await getCachedUser(discordId);
      if (!isVerificationValid(existingUser)) {
        // Store image if provided
        let imageBuffer: Buffer | undefined;
        let imageUrl: string | undefined;
        if (imageAttachment) {
          try {
            imageBuffer = await fetchImageBuffer(imageAttachment.url);
            imageUrl = imageAttachment.url;
          } catch {}
        }
        await interaction.reply({ content: VERIFY_WALLET_PROMPT });
        pendingLaunches.set(discordId, { stage: "awaiting_verify_wallet", coinName, ticker, channelId, guildId, imageBuffer, imageUrl });
        return;
      }

      // Rate limit check
      const rateCheck = await checkRateLimit(discordId);
      if (!rateCheck.allowed) {
        return interaction.reply({ content: rateCheck.message });
      }

      // Proceed with launch
      if (imageAttachment) {
        await interaction.reply({ content: `📥 Saving your image for **${coinName}** (${ticker})...` });
        let imageBuffer: Buffer;
        try {
          imageBuffer = await fetchImageBuffer(imageAttachment.url);
        } catch (err: any) {
          return interaction.editReply(`❌ Could not download your image: ${err.message}\n\nPlease try again.`);
        }
        const savedWallet = getSavedWallet(existingUser);
        pendingLaunches.set(discordId, { stage: "awaiting_platform", coinName, ticker, imageBuffer, imageUrl: imageAttachment.url, channelId, guildId, savedWallet });
        await interaction.editReply(PLATFORM_PROMPT(coinName));
      } else {
        pendingLaunches.set(discordId, { stage: "awaiting_image", coinName, ticker, channelId, guildId });
        await interaction.reply({
          content:
            `📸 **Please send your logo image for ${coinName} (${ticker}) in this channel.**\n\n` +
            `Attach an image file to your next message, or type \`cancel\` to abort.`,
        });
      }
    }
  });

  // ── Message handler (multi-step flow) ─────────────────────────────────────────
  client.on(Events.MessageCreate, async (msg: Message) => {
    if (msg.author.bot) return;

    const discordId = msg.author.id;
    const username  = msg.author.username;
    const text      = msg.content.trim();
    const pending   = pendingLaunches.get(discordId);

    if (!pending || msg.channelId !== pending.channelId) return;

    if (text.toLowerCase() === "cancel") {
      pendingLaunches.delete(discordId);
      return msg.reply("✅ Launch cancelled.");
    }

    // ── Stage: awaiting_verify_wallet ─────────────────────────────────────────
    if (pending.stage === "awaiting_verify_wallet") {
      if (!isValidEvmWallet(text)) {
        return msg.reply("❌ That doesn't look like a valid EVM wallet address. Please check and try again, or type `cancel`.");
      }
      pendingLaunches.set(discordId, {
        stage: "awaiting_tx",
        coinName: pending.coinName,
        ticker: pending.ticker,
        channelId: pending.channelId,
        guildId: pending.guildId,
        verifyWallet: text,
        imageBuffer: pending.imageBuffer,
        imageUrl: pending.imageUrl,
      });
      return msg.reply(verifyTxPrompt(text));
    }

    // ── Stage: awaiting_tx ────────────────────────────────────────────────────
    if (pending.stage === "awaiting_tx") {
      const checkingMsg = await msg.reply("🔍 Verifying your transaction...");

      const result = await verifyOwnershipTransaction(text, pending.verifyWallet);
      if (!result.valid) {
        await checkingMsg.edit(`❌ ${result.error}`);
        return;
      }

      const balance = await getFeatherBalance(pending.verifyWallet);
      const tier    = getTier(balance);

      // Upsert user with verified wallet
      let user = await getCachedUser(discordId);
      if (!user) {
        user = await storage.createUser({
          telegramId: `discord:${discordId}`,
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
      invalidateUserCache(discordId);

      const balanceDisplay = balance === 0 ? "None" : `${formatBalance(balance)} $FEATHER`;
      await checkingMsg.edit(
        `✅ **Verified!**\n\n` +
        `💎 Balance: **${balanceDisplay}**\n` +
        `🏆 Tier: **${tier.name}**\n` +
        `📊 Daily limit: **${tier.dailyLimit} launch${tier.dailyLimit > 1 ? "es" : ""}**\n\n` +
        `Verification lasts 24 hours. Now let's launch your token!`
      );

      // Rate limit check
      const rateCheck = await checkRateLimit(discordId);
      if (!rateCheck.allowed) {
        pendingLaunches.delete(discordId);
        await msg.channel.send(rateCheck.message);
        return;
      }

      // Proceed to image or platform prompt
      if (pending.imageBuffer) {
        const savedWallet = getSavedWallet(user);
        pendingLaunches.set(discordId, {
          stage: "awaiting_platform",
          coinName: pending.coinName,
          ticker: pending.ticker,
          imageBuffer: pending.imageBuffer,
          imageUrl: pending.imageUrl,
          channelId: pending.channelId,
          guildId: pending.guildId,
          savedWallet,
        });
        await msg.channel.send(PLATFORM_PROMPT(pending.coinName));
      } else {
        pendingLaunches.set(discordId, {
          stage: "awaiting_image",
          coinName: pending.coinName,
          ticker: pending.ticker,
          channelId: pending.channelId,
          guildId: pending.guildId,
        });
        await msg.channel.send(
          `📸 **Please send your logo image for ${pending.coinName} (${pending.ticker}) in this channel.**\n\n` +
          `Attach an image file to your next message, or type \`cancel\` to abort.`
        );
      }
      return;
    }

    // ── Stage: awaiting_image ─────────────────────────────────────────────────
    if (pending.stage === "awaiting_image") {
      const attachment = msg.attachments.first();
      const hasImage = attachment && attachment.contentType?.startsWith("image/");

      if (!hasImage) {
        return msg.reply(
          `Please send an **image file** for **${pending.coinName}** (${pending.ticker}), or type \`cancel\` to abort.`
        );
      }

      const loadingMsg = await msg.reply(`📥 Saving your image for **${pending.coinName}** (${pending.ticker})...`);
      let imageBuffer: Buffer;
      try {
        imageBuffer = await fetchImageBuffer(attachment.url);
      } catch (err: any) {
        return loadingMsg.edit(`❌ Could not download your image: ${err.message}\n\nPlease try again.`);
      }

      const existingUser = await getCachedUser(discordId);
      const savedWallet  = getSavedWallet(existingUser);

      pendingLaunches.set(discordId, {
        stage: "awaiting_platform",
        coinName: pending.coinName,
        ticker: pending.ticker,
        imageBuffer,
        imageUrl: attachment.url,
        channelId: pending.channelId,
        guildId: pending.guildId,
        savedWallet,
      });

      await loadingMsg.edit(PLATFORM_PROMPT(pending.coinName));
      return;
    }

    // ── Stage: awaiting_platform ──────────────────────────────────────────────
    if (pending.stage === "awaiting_platform") {
      const input = text.toLowerCase().trim();

      let launchpad: "pump.fun" | "bags.fm" | null = null;
      if (input === "1" || input === "pump" || input === "pump.fun" || input === "pumpfun" || input === "uniswap") {
        launchpad = "pump.fun";
      } else if (input === "2" || input === "bags" || input === "bags.fm" || input === "bagsfm" || input === "rh" || input === "robinhood") {
        launchpad = "bags.fm";
      }

      if (!launchpad) {
        return msg.reply(
          "❌ Unrecognised choice.\n\nType `1` or `pump` for **Uniswap**, or `2` or `bags` for **Robinhood Chain**.\nType `cancel` to abort."
        );
      }

      pendingLaunches.set(discordId, {
        stage: "awaiting_details",
        coinName: pending.coinName,
        ticker: pending.ticker,
        imageBuffer: pending.imageBuffer,
        imageUrl: pending.imageUrl,
        channelId: pending.channelId,
        guildId: pending.guildId,
        launchpad,
        savedWallet: pending.savedWallet,
      });

      const prompt = launchpad === "bags.fm"
        ? DETAILS_PROMPT_BAGS(pending.coinName)
        : DETAILS_PROMPT_PUMP(pending.coinName);
      await msg.reply(prompt);
      return;
    }

    // ── Stage: awaiting_details ───────────────────────────────────────────────
    if (pending.stage === "awaiting_details") {
      let details: { description?: string; website?: string; twitter?: string } = {};
      if (text.toLowerCase() !== "skip") {
        details = parseDetails(text, pending.launchpad);
      }

      const existingUser = await getCachedUser(discordId);
      const savedWallet  = pending.savedWallet ?? getSavedWallet(existingUser);

      pendingLaunches.set(discordId, {
        stage: "awaiting_fee_dest",
        coinName: pending.coinName,
        ticker: pending.ticker,
        imageBuffer: pending.imageBuffer,
        imageUrl: pending.imageUrl,
        channelId: pending.channelId,
        guildId: pending.guildId,
        launchpad: pending.launchpad,
        ...details,
      });

      await msg.reply(feeDestPrompt(pending.coinName, pending.launchpad, savedWallet));
      return;
    }

    // ── Stage: awaiting_fee_dest ──────────────────────────────────────────────
    if (pending.stage === "awaiting_fee_dest") {
      const isSkip = text.toLowerCase() === "skip";
      const { launchpad } = pending;

      if (isSkip) {
        await executeLaunchOnPlatform(client, discordId, username, pending, null, null);
        return;
      }

      if (launchpad === "bags.fm") {
        const bagRec = parseBagsFeeRecipient(text);
        if (bagRec === "invalid") {
          return msg.reply(
            "❌ That doesn't look right.\n\nSend a **EVM wallet**, `github:username`, `x:@handle`, `kick:@handle`, or type `skip`.\nType `cancel` to abort."
          );
        }
        await executeLaunchOnPlatform(client, discordId, username, pending, null, bagRec);
      } else {
        const pumpRec = parseFeeRecipient(text);
        if (!pumpRec) {
          return msg.reply(
            "❌ That doesn't look right.\n\nSend a **EVM wallet**, `github:username`, type `skip` for cashback mode, or `cancel` to abort."
          );
        }
        await executeLaunchOnPlatform(client, discordId, username, pending, pumpRec, null);
      }
      return;
    }
  });

  client.login(token).catch((err) => {
    console.error("[discord] Failed to login:", err.message);
  });
}

// ── Utility ────────────────────────────────────────────────────────────────────
function getSavedWallet(user: User | undefined): string | null {
  if (!user) return null;
  const w = user.walletAddress;
  if (!w || w === "managed_by_bot" || w === "user_provided" || w === "none") return null;
  return w;
}
