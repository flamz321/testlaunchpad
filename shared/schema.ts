import { pgTable, text, serial, integer, timestamp, boolean, doublePrecision, json, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  username: text("username"),
  walletAddress: text("wallet_address").notNull(),
  encryptedPrivateKey: text("encrypted_private_key").notNull(),
  verifiedWallet: text("verified_wallet"),
  walletVerifiedAt: timestamp("wallet_verified_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const launches = pgTable("launches", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  coinName: text("coin_name").notNull(),
  ticker: text("ticker").notNull(),
  imageUrl: text("image_url"),
  description: text("description"),
  website: text("website"),
  twitter: text("twitter"),
  status: text("status").notNull().default("pending"), // pending, successful, failed
  pumpUrl: text("pump_url"),
  bagsUrl: text("bags_url"),
  mintAddress: text("mint_address"),
  platform: text("platform").notNull().default("telegram"), // telegram | discord | web
  launchpad: text("launchpad").default("uniswap"), // uniswap | unknown
  createdAt: timestamp("created_at").defaultNow(),
});

export const botSettings = pgTable("bot_settings", {
  id: serial("id").primaryKey(),
  isPaused: boolean("is_paused").notNull().default(false),
  pauseReason: text("pause_reason"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const usedSignatures = pgTable("used_signatures", {
  id: serial("id").primaryKey(),
  signature: text("signature").notNull().unique(),
  usedAt: timestamp("used_at").defaultNow(),
});

export const marketSnapshots = pgTable("market_snapshots", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  totalLaunches: integer("total_launches").notNull().default(0),
  graduatedCount: integer("graduated_count").notNull().default(0),
  hits100k: integer("hits_100k").notNull().default(0),
  hits1m: integer("hits_1m").notNull().default(0),
  hits10m: integer("hits_10m").notNull().default(0),
  solPriceUsd: doublePrecision("sol_price_usd"),
});

export type MarketSnapshot = typeof marketSnapshots.$inferSelect;
export type BotSettings = typeof botSettings.$inferSelect;

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertLaunchSchema = createInsertSchema(launches).omit({ id: true, createdAt: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Launch = typeof launches.$inferSelect;
export type InsertLaunch = z.infer<typeof insertLaunchSchema>;

export type CreateLaunchRequest = InsertLaunch;
export type LaunchResponse = Launch;

// ── DEX Screener ──────────────────────────────────────────────────────────────

export const dexListings = pgTable("dex_listings", {
  id: serial("id").primaryKey(),
  mintAddress: text("mint_address").notNull().unique(),
  name: text("name").notNull(),
  ticker: text("ticker").notNull(),
  description: text("description"),
  logoUrl: text("logo_url"),
  website: text("website"),
  twitter: text("twitter"),
  telegram: text("telegram"),
  discord: text("discord"),
  tags: text("tags"), // comma-separated
  submitterWallet: text("submitter_wallet").notNull(),
  status: text("status").notNull().default("pending"), // pending | active | rejected
  paymentTxSignature: text("payment_tx_signature").notNull().unique(),
  paymentCurrency: text("payment_currency").notNull(), // sol | usdc | trenchy
  paymentAmountRaw: text("payment_amount_raw").notNull(), // raw units as string
  expiresAt: timestamp("expires_at").notNull(), // 90 days from listing
  createdAt: timestamp("created_at").defaultNow(),
});

export const dexBoosts = pgTable("dex_boosts", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull(),
  boostTier: integer("boost_tier").notNull(), // 1=hot($10/24h) 2=trending($25/72h) 3=featured($100/7d)
  paymentTxSignature: text("payment_tx_signature").notNull().unique(),
  paymentCurrency: text("payment_currency").notNull(),
  paymentAmountRaw: text("payment_amount_raw").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const dexAds = pgTable("dex_ads", {
  id: serial("id").primaryKey(),
  imageUrl: text("image_url").notNull(),
  linkUrl: text("link_url").notNull(),
  label: text("label"),
  submitterWallet: text("submitter_wallet").notNull(),
  paymentTxSignature: text("payment_tx_signature").notNull().unique(),
  paymentCurrency: text("payment_currency").notNull(),
  paymentAmountRaw: text("payment_amount_raw").notNull(),
  impressions: integer("impressions").notNull().default(0),
  expiresAt: timestamp("expires_at").notNull(),
  status: text("status").notNull().default("pending"), // pending | active | rejected
  slotType: text("slot_type").notNull().default("banner"), // banner | sidebar | featured
  adminNote: text("admin_note"), // rejection reason or admin comment
  createdAt: timestamp("created_at").defaultNow(),
});

// Token status — keyed by tokenAddress; tracks paid DEX listing + boost tier + metadata
export const tokenStatus = pgTable("token_status", {
  tokenAddress: text("token_address").primaryKey(),
  isPaid: boolean("is_paid").notNull().default(false),
  paidAt: timestamp("paid_at"),
  paidBy: text("paid_by"),
  paymentTxSignature: text("payment_tx_signature"),
  claimedByWallet: text("claimed_by_wallet"),
  boostTier: integer("boost_tier").notNull().default(0), // 0=none 1=hot 2=trending 3=featured
  boostExpiresAt: timestamp("boost_expires_at"),
  // IPFS metadata
  tokenName: text("token_name"),
  tokenSymbol: text("token_symbol"),
  description: text("description"),
  logoIpfsCid: text("logo_ipfs_cid"),
  bannerIpfsCid: text("banner_ipfs_cid"),
  metadataIpfsCid: text("metadata_ipfs_cid"),
  twitter: text("twitter"),
  discord: text("discord"),
  website: text("website"),
  github: text("github"),
  // Admin moderation
  isRemoved: boolean("is_removed").notNull().default(false),
  removalReason: text("removal_reason"), // "rug_pull" | "scam" | "abandoned" | "other"
  removalNote: text("removal_note"),
  removedAt: timestamp("removed_at"),
  removedBy: text("removed_by"), // admin wallet
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Site-wide settings (admin configurable): prices, ad slot durations, etc.
export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDexListingSchema = createInsertSchema(dexListings).omit({ id: true, createdAt: true });
export const insertDexBoostSchema = createInsertSchema(dexBoosts).omit({ id: true, createdAt: true });
export const insertDexAdSchema = createInsertSchema(dexAds).omit({ id: true, createdAt: true });

export type DexListing = typeof dexListings.$inferSelect;
export type InsertDexListing = z.infer<typeof insertDexListingSchema>;
export type DexBoost = typeof dexBoosts.$inferSelect;
export type DexAd = typeof dexAds.$inferSelect;
export type TokenStatus = typeof tokenStatus.$inferSelect;
export type SiteSetting = typeof siteSettings.$inferSelect;

// ── Social Layer ──────────────────────────────────────────────────────────────

export const socialProfiles = pgTable("social_profiles", {
  walletAddress: text("wallet_address").primaryKey(),
  username: text("username").unique(),
  profileImageIpfsCid: text("profile_image_ipfs_cid"),
  bio: text("bio"),
  twitterLink: text("twitter_link"),
  githubLink: text("github_link"),
  instagramLink: text("instagram_link"),
  websiteLink: text("website_link"),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  referralCode: text("referral_code").unique(),
  isAgent: boolean("is_agent").notNull().default(false),
  agentLabel: text("agent_label"),
  createdAt: timestamp("created_at").defaultNow(),
  lastActive: timestamp("last_active").defaultNow(),
  lastSeenRepliesAt: timestamp("last_seen_replies_at"),
});

// API keys for AI agent programmatic access
export const agentApiKeys = pgTable("agent_api_keys", {
  id: serial("id").primaryKey(),
  agentWallet: text("agent_wallet").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  label: text("label"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
});

export const userTrenchyBalances = pgTable("user_trenchy_balances", {
  walletAddress: text("wallet_address").primaryKey(),
  balance: doublePrecision("balance").notNull().default(0),
  lastChecked: timestamp("last_checked").defaultNow(),
});

export const socialFollows = pgTable("social_follows", {
  id: serial("id").primaryKey(),
  followerWallet: text("follower_wallet").notNull(),
  followingWallet: text("following_wallet").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [unique("follows_unique_pair").on(t.followerWallet, t.followingWallet)]);

export const feedItems = pgTable("feed_items", {
  id: serial("id").primaryKey(),
  userWallet: text("user_wallet").notNull(),
  content: text("content").notNull(),
  imageIpfsCid: text("image_ipfs_cid"),
  type: text("type").notNull().default("general"), // launch | bounty | general | community
  parentId: integer("parent_id"), // null = top-level post; set = reply to post
  communityId: integer("community_id"),
  communityName: text("community_name"),
  communitySlug: text("community_slug"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const feedComments = pgTable("feed_comments", {
  id: serial("id").primaryKey(),
  feedItemId: integer("feed_item_id"),
  tokenContractAddress: text("token_contract_address"),
  userWallet: text("user_wallet").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const socialReports = pgTable("social_reports", {
  id: serial("id").primaryKey(),
  reporterWallet: text("reporter_wallet").notNull(),
  reportedId: integer("reported_id").notNull(),
  reportedType: text("reported_type").notNull(), // comment | feed_item
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"), // pending | resolved | dismissed
  createdAt: timestamp("created_at").defaultNow(),
});

export const moderationSettings = pgTable("moderation_settings", {
  id: serial("id").primaryKey(),
  blacklistedWords: json("blacklisted_words").$type<string[]>().default([]),
  blacklistedDomains: json("blacklisted_domains").$type<string[]>().default([]),
  minTrenchyToPost: doublePrecision("min_trenchy_to_post").notNull().default(0),
  // Anti-spam thresholds for external token display
  minMcapUsd: doublePrecision("min_mcap_usd").default(10000),
  minVolume24hUsd: doublePrecision("min_volume_24h_usd").default(500),
  // TRENCHY holder boost threshold
  trenchyBoostThreshold: doublePrecision("trenchy_boost_threshold").default(250000),
  // Minimum TRENCHY required to claim a username
  minTrenchyToUsername: doublePrecision("min_trenchy_to_username").default(250000),
  // Trenchy AI access threshold
  minTrenchyToAI: doublePrecision("min_trenchy_to_ai").default(500000),
  // Max AI prompts per user per day
  aiDailyLimit: integer("ai_daily_limit").default(10),
  // Market Signal page token-gate threshold
  minTrenchyToMarket: doublePrecision("min_trenchy_to_market").default(250000),
  // Bags.fm token launcher token-gate threshold
  minTrenchyToBagsLaunch: doublePrecision("min_trenchy_to_bags_launch").default(1_000_000),
  // Points system — configurable by admin
  pointsLikeReceived:    integer("points_like_received").default(2),
  pointsCommentMade:     integer("points_comment_made").default(5),
  pointsCommentReceived: integer("points_comment_received").default(3),
  pointsReplyMade:       integer("points_reply_made").default(3),
  pointsReplyReceived:   integer("points_reply_received").default(2),
  pointsReferral:        integer("points_referral").default(100),
  pointsDailyCap:        integer("points_daily_cap").default(200),
  pointsMinTrenchy:      doublePrecision("points_min_trenchy").default(1_000_000),
  // Global token gating switch
  tokenGatingEnabled:    boolean("token_gating_enabled").notNull().default(true),
});

// Social insert schemas
export const insertSocialProfileSchema = createInsertSchema(socialProfiles).omit({ createdAt: true, lastActive: true, totpSecret: true, totpEnabled: true });
export const insertFeedItemSchema = createInsertSchema(feedItems).omit({ id: true, createdAt: true });
export const insertFeedCommentSchema = createInsertSchema(feedComments).omit({ id: true, createdAt: true });

// Social types
export type SocialProfile = typeof socialProfiles.$inferSelect;
export type InsertSocialProfile = z.infer<typeof insertSocialProfileSchema>;
export type AgentApiKey = typeof agentApiKeys.$inferSelect;
export type FeedItem = typeof feedItems.$inferSelect;
export type InsertFeedItem = z.infer<typeof insertFeedItemSchema>;
export type FeedComment = typeof feedComments.$inferSelect;
export type SocialFollow = typeof socialFollows.$inferSelect;
export type SocialReport = typeof socialReports.$inferSelect;

// ── Direct Messages (500k+ TRENCHY tier gate) ────────────────────────────────
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  fromWallet: text("from_wallet").notNull(),
  toWallet: text("to_wallet").notNull(),
  content: text("content").notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true, readAt: true });
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

// ── Social Ad Spots (admin-managed banners in community pages) ────────────────
export const socialAds = pgTable("social_ads", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  imageUrl: text("image_url"),
  linkUrl: text("link_url").notNull(),
  callToAction: text("call_to_action").default("Learn More"),
  placement: text("placement").notNull().default("feed"), // feed | leaderboard | bounties | sidebar
  active: boolean("active").notNull().default(true),
  impressions: integer("impressions").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSocialAdSchema = createInsertSchema(socialAds).omit({ id: true, createdAt: true, updatedAt: true, impressions: true });
export type SocialAd = typeof socialAds.$inferSelect;
export type InsertSocialAd = z.infer<typeof insertSocialAdSchema>;

// ── Blocked Usernames (admin-managed impersonation prevention) ────────────────
export const blockedUsernames = pgTable("blocked_usernames", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type BlockedUsername = typeof blockedUsernames.$inferSelect;

// ── Feed Likes (per-user, unique per feedItem) ────────────────────────────────
export const feedLikes = pgTable("feed_likes", {
  id: serial("id").primaryKey(),
  userWallet: text("user_wallet").notNull(),
  feedItemId: integer("feed_item_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [unique("feed_likes_unique").on(t.userWallet, t.feedItemId)]);

export type FeedLike = typeof feedLikes.$inferSelect;

// ── Feed Hashtags (for trending topics) ──────────────────────────────────────
export const feedHashtags = pgTable("feed_hashtags", {
  id: serial("id").primaryKey(),
  feedItemId: integer("feed_item_id").notNull(),
  tag: text("tag").notNull(), // lowercase, no #
  createdAt: timestamp("created_at").defaultNow(),
});

export type FeedHashtag = typeof feedHashtags.$inferSelect;

// ── Referrals (one referral per new user, awarded when profile is created) ───
export const referrals = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerWallet: text("referrer_wallet").notNull(),
  referredWallet: text("referred_wallet").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [unique("referrals_referred_unique").on(t.referredWallet)]);

export type Referral = typeof referrals.$inferSelect;

// ── Point Events (immutable audit log of every point award) ──────────────────
// action values: like_received | comment_made | comment_received |
//                reply_made | reply_received | referral
// Daily cap: 200 pts / 24h per wallet. Requires 1M+ $FEATHER to earn.
export const pointEvents = pgTable("point_events", {
  id: serial("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  action: text("action").notNull(),
  points: integer("points").notNull(),
  sourceType: text("source_type"),  // feed_item | feed_comment | referral
  sourceId: integer("source_id"),   // ID of the entity that triggered the event
  voided: boolean("voided").notNull().default(false),
  voidedBy: text("voided_by"),      // admin wallet that voided it
  voidedAt: timestamp("voided_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type PointEvent = typeof pointEvents.$inferSelect;

// ── SOL Payouts (weekly epoch payouts from creator fee pool) ─────────────────
export const payouts = pgTable("payouts", {
  id: serial("id").primaryKey(),
  epochStart: timestamp("epoch_start").notNull(),
  epochEnd: timestamp("epoch_end").notNull(),
  totalPoints: integer("total_points").notNull().default(0),
  totalSolLamports: doublePrecision("total_sol_lamports").notNull().default(0),
  recipientCount: integer("recipient_count").notNull().default(0),
  status: text("status").notNull().default("processing"), // processing | completed | failed
  initiatedBy: text("initiated_by").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});
export type Payout = typeof payouts.$inferSelect;

export const payoutRecipients = pgTable("payout_recipients", {
  id: serial("id").primaryKey(),
  payoutId: integer("payout_id").notNull().references(() => payouts.id),
  walletAddress: text("wallet_address").notNull(),
  epochPoints: integer("epoch_points").notNull(),
  sharePercent: text("share_percent").notNull(),
  solLamports: doublePrecision("sol_lamports").notNull().default(0),
  txSignature: text("tx_signature"),
  status: text("status").notNull().default("pending"), // pending | sent | failed
  errorMessage: text("error_message"),
});
export type PayoutRecipient = typeof payoutRecipients.$inferSelect;

// ── Communities ───────────────────────────────────────────────────────────────

export const communities = pgTable("communities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  logoIpfsCid: text("logo_ipfs_cid"),
  createdByWallet: text("created_by_wallet").notNull(),
  memberCount: integer("member_count").notNull().default(1),
  isPublic: boolean("is_public").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const communityMembers = pgTable("community_members", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id").notNull().references(() => communities.id),
  walletAddress: text("wallet_address").notNull(),
  role: text("role").notNull().default("member"), // owner | moderator | member
  joinedAt: timestamp("joined_at").defaultNow(),
}, (t) => [unique("community_members_unique").on(t.communityId, t.walletAddress)]);

export const communityPosts = pgTable("community_posts", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id").notNull().references(() => communities.id),
  walletAddress: text("wallet_address").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCommunitySchema = createInsertSchema(communities).omit({ id: true, createdAt: true, memberCount: true });
export type Community = typeof communities.$inferSelect;
export type InsertCommunity = z.infer<typeof insertCommunitySchema>;
export type CommunityMember = typeof communityMembers.$inferSelect;
export type CommunityPost = typeof communityPosts.$inferSelect;

// ── Trenchy AI Conversations ────────────────────────────────────────────────
export const aiMessages = pgTable("ai_messages", {
  id: serial("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  sessionId: text("session_id").notNull(),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
export type AiMessage = typeof aiMessages.$inferSelect;

/** Bonding-curve price samples for pre-migration charts */
export const bondingPriceTicks = pgTable("bonding_price_ticks", {
  id: serial("id").primaryKey(),
  tokenAddress: text("token_address").notNull(),
  priceUsd: doublePrecision("price_usd"),
  priceEth: doublePrecision("price_eth"),
  bondingProgressPct: doublePrecision("bonding_progress_pct"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});
export type BondingPriceTick = typeof bondingPriceTicks.$inferSelect;
