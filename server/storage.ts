import { db } from "./db";
import {
  users, launches, botSettings, usedSignatures, marketSnapshots,
  dexListings, dexBoosts, dexAds, tokenStatus, siteSettings,
  socialProfiles, userTrenchyBalances, socialFollows, feedItems, feedComments, socialReports, moderationSettings,
  messages, socialAds, blockedUsernames, aiMessages, feedLikes, feedHashtags,
  referrals, pointEvents, payouts, payoutRecipients, agentApiKeys,
  communities, communityMembers, communityPosts,
  bondingPriceTicks,
  type User, type InsertUser,
  type Launch, type InsertLaunch,
  type BotSettings, type MarketSnapshot,
  type DexListing, type InsertDexListing,
  type DexBoost, type DexAd, type TokenStatus, type SiteSetting,
  type SocialProfile, type FeedItem, type FeedComment, type SocialFollow, type Message, type SocialAd, type BlockedUsername, type AiMessage,
  type Referral, type PointEvent, type Payout, type PayoutRecipient, type AgentApiKey,
  type Community, type CommunityMember, type CommunityPost,
  type BondingPriceTick,
} from "@shared/schema";
import { eq, desc, and, gte, ne, count, gt, sql, or, inArray, lt, isNull, isNotNull } from "drizzle-orm";
import { normalizeWallet } from "@shared/chain";

export interface ActivityNotification {
  id: string;
  type: "follow" | "like" | "reply" | "comment";
  actorWallet: string;
  actorUsername: string | null;
  actorImageCid: string | null;
  postId?: number;
  postPreview?: string;
  createdAt: Date;
}

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByTelegramId(telegramId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<InsertUser>): Promise<User>;

  createLaunch(launch: InsertLaunch): Promise<Launch>;
  updateLaunch(id: number, updates: Partial<InsertLaunch>): Promise<Launch>;
  getLaunches(): Promise<Launch[]>;
  getLaunch(id: number): Promise<Launch | undefined>;

  getStats(): Promise<{ totalUsers: number; totalLaunches: number }>;
  getRecentLaunchesByUser(userId: number, since: Date): Promise<Launch[]>;

  getBotSettings(): Promise<BotSettings>;
  setBotPaused(isPaused: boolean, reason?: string): Promise<BotSettings>;

  isSignatureUsed(signature: string): Promise<boolean>;
  markSignatureUsed(signature: string): Promise<void>;

  getAllSuccessfulLaunches(): Promise<Launch[]>;
  addMarketSnapshot(snapshot: Omit<MarketSnapshot, "id" | "timestamp">): Promise<void>;
  getMarketSnapshots(days: number): Promise<MarketSnapshot[]>;

  // DEX
  createDexListing(listing: InsertDexListing): Promise<DexListing>;
  getDexListings(opts?: { status?: string; limit?: number; offset?: number }): Promise<DexListing[]>;
  getDexListing(mintAddress: string): Promise<DexListing | undefined>;
  updateDexListingStatus(id: number, status: string): Promise<DexListing>;
  getActiveDexBoosts(): Promise<(DexBoost & { listing: DexListing })[]>;
  createDexBoost(boost: { listingId: number; boostTier: number; paymentTxSignature: string; paymentCurrency: string; paymentAmountRaw: string; expiresAt: Date }): Promise<DexBoost>;
  getBoostsForListing(listingId: number): Promise<DexBoost[]>;
  createDexAd(ad: { imageUrl: string; linkUrl: string; label?: string; submitterWallet: string; paymentTxSignature: string; paymentCurrency: string; paymentAmountRaw: string; expiresAt: Date; slotType?: string }): Promise<DexAd>;
  getActiveDexAds(): Promise<DexAd[]>;
  getAllDexAds(): Promise<DexAd[]>;
  getDexAdsByWallet(wallet: string): Promise<DexAd[]>;
  updateDexAd(id: number, data: Partial<DexAd>): Promise<DexAd>;
  deleteDexAd(id: number): Promise<void>;
  incrementAdImpressions(id: number): Promise<void>;
  getTokenStatus(tokenAddress: string): Promise<TokenStatus | undefined>;
  getAllTokenStatuses(): Promise<TokenStatus[]>;
  getAllPaidTokenStatuses(): Promise<TokenStatus[]>;
  upsertTokenStatus(tokenAddress: string, data: Partial<Omit<TokenStatus, "tokenAddress">>): Promise<TokenStatus>;
  getTokensByWallet(walletAddress: string): Promise<TokenStatus[]>;
  // Site settings
  getSiteSettings(): Promise<Record<string, string>>;
  setSiteSetting(key: string, value: string): Promise<void>;

  // ── Social ──────────────────────────────────────────────────────────────────
  getSocialProfile(wallet: string): Promise<SocialProfile | undefined>;
  getSocialProfileByUsername(username: string): Promise<SocialProfile | undefined>;
  createSocialProfile(data: { walletAddress: string; username?: string; profileImageIpfsCid?: string; bio?: string; twitterLink?: string; githubLink?: string; instagramLink?: string; websiteLink?: string; isAgent?: boolean; agentLabel?: string }): Promise<SocialProfile>;
  updateSocialProfile(wallet: string, data: Partial<SocialProfile>): Promise<SocialProfile>;
  isUsernameTaken(username: string): Promise<boolean>;
  setTotpSecret(wallet: string, secret: string): Promise<void>;
  enableTotp(wallet: string): Promise<void>;
  disableTotp(wallet: string): Promise<void>;
  touchLastActive(wallet: string): Promise<void>;

  followUser(followerWallet: string, followingWallet: string): Promise<void>;
  unfollowUser(followerWallet: string, followingWallet: string): Promise<void>;
  isFollowing(followerWallet: string, followingWallet: string): Promise<boolean>;
  getFollowers(wallet: string): Promise<SocialProfile[]>;
  getFollowing(wallet: string): Promise<SocialProfile[]>;
  getFollowerCount(wallet: string): Promise<number>;
  getFollowingCount(wallet: string): Promise<number>;
  getNewestProfiles(limit: number): Promise<SocialProfile[]>;
  getAllProfileWallets(): Promise<string[]>;

  createFeedItem(data: { userWallet: string; content: string; imageIpfsCid?: string; type?: string; parentId?: number; communityId?: number; communityName?: string; communitySlug?: string }): Promise<FeedItem>;
  getFeedItem(id: number): Promise<FeedItem | undefined>;
  getGlobalFeed(limit?: number, offset?: number): Promise<(FeedItem & { profile: SocialProfile | null; commentCount: number; replyCount: number })[]>;
  getUserFeed(wallet: string, limit?: number): Promise<(FeedItem & { profile: SocialProfile | null; commentCount: number; replyCount: number })[]>;
  getHomeFeed(viewerWallet: string, limit?: number, offset?: number): Promise<(FeedItem & { profile: SocialProfile | null; commentCount: number; replyCount: number })[]>;
  getReplies(parentId: number): Promise<(FeedItem & { profile: SocialProfile | null; commentCount: number; replyCount: number })[]>;
  deleteFeedItem(id: number, ownerWallet: string): Promise<boolean>;

  createComment(data: { feedItemId?: number; tokenContractAddress?: string; userWallet: string; content: string }): Promise<FeedComment>;
  getComments(feedItemId: number): Promise<(FeedComment & { profile: SocialProfile | null })[]>;
  getTokenComments(tokenContractAddress: string, limit?: number): Promise<(FeedComment & { profile: SocialProfile | null })[]>;
  deleteComment(id: number, ownerWallet: string): Promise<boolean>;

  createReport(data: { reporterWallet: string; reportedId: number; reportedType: string; reason: string }): Promise<void>;

  getTrenchyBalance(wallet: string): Promise<number>;
  updateTrenchyBalance(wallet: string, balance: number): Promise<void>;
  getModerationSettings(): Promise<{ blacklistedWords: string[]; blacklistedDomains: string[]; minTrenchyToPost: number; minMcapUsd: number; minVolume24hUsd: number; trenchyBoostThreshold: number; minTrenchyToUsername: number; minTrenchyToAI: number; aiDailyLimit: number; minTrenchyToMarket: number; minTrenchyToBagsLaunch: number; pointsLikeReceived: number; pointsCommentMade: number; pointsCommentReceived: number; pointsReplyMade: number; pointsReplyReceived: number; pointsReferral: number; pointsDailyCap: number; pointsMinTrenchy: number; tokenGatingEnabled: boolean }>;
  updateModerationSettings(data: { blacklistedWords?: string[]; blacklistedDomains?: string[]; minTrenchyToPost?: number; minMcapUsd?: number; minVolume24hUsd?: number; trenchyBoostThreshold?: number; minTrenchyToUsername?: number; minTrenchyToAI?: number; aiDailyLimit?: number; minTrenchyToMarket?: number; minTrenchyToBagsLaunch?: number; pointsLikeReceived?: number; pointsCommentMade?: number; pointsCommentReceived?: number; pointsReplyMade?: number; pointsReplyReceived?: number; pointsReferral?: number; pointsDailyCap?: number; pointsMinTrenchy?: number; tokenGatingEnabled?: boolean }): Promise<void>;
  getPointsConfig(): Promise<{ pointsLikeReceived: number; pointsCommentMade: number; pointsCommentReceived: number; pointsReplyMade: number; pointsReplyReceived: number; pointsReferral: number; pointsDailyCap: number; pointsMinTrenchy: number }>;
  getAiDailyUsageCount(wallet: string): Promise<number>;
  getTrenchyLaunchFeed(limit?: number, offset?: number, launchpadFilter?: string): Promise<TrenchyLaunchFeedItem[]>;

  // ── Leaderboard ──────────────────────────────────────────────────────────────
  getLeaderboard(category: "launchers" | "active" | "commenters", since: Date): Promise<LeaderboardEntry[]>;

  // ── Bounties ─────────────────────────────────────────────────────────────────
  getBounties(limit?: number, offset?: number): Promise<(FeedItem & { profile: SocialProfile | null; commentCount: number })[]>;

  // ── Messages / DMs ───────────────────────────────────────────────────────────
  sendMessage(fromWallet: string, toWallet: string, content: string): Promise<Message>;
  getInboxMessages(wallet: string): Promise<(Message & { fromProfile: SocialProfile | null })[]>;
  getSentMessages(wallet: string): Promise<(Message & { toProfile: SocialProfile | null })[]>;
  markMessageRead(id: number, wallet: string): Promise<void>;
  hasExistingConversation(walletA: string, walletB: string): Promise<boolean>;
  getUnreadMessageCount(wallet: string): Promise<number>;
  getNewRepliesCount(wallet: string): Promise<number>;
  markRepliesSeen(wallet: string): Promise<void>;
  getActivityNotifications(wallet: string, limit?: number): Promise<ActivityNotification[]>;

  // ── Admin: Reports ────────────────────────────────────────────────────────────
  getReports(status?: string, limit?: number): Promise<any[]>;
  updateReportStatus(id: number, status: string): Promise<void>;

  // ── Social Ads ────────────────────────────────────────────────────────────────
  getActiveSocialAds(placement?: string): Promise<SocialAd[]>;
  getAllSocialAds(): Promise<SocialAd[]>;
  createSocialAd(data: { title: string; imageUrl?: string; linkUrl: string; callToAction?: string; placement?: string; active?: boolean }): Promise<SocialAd>;
  updateSocialAd(id: number, data: Partial<SocialAd>): Promise<SocialAd>;
  deleteSocialAd(id: number): Promise<void>;
  incrementSocialAdImpressions(id: number): Promise<void>;

  getSocialStats(): Promise<{
    totalProfiles: number; totalPosts: number; totalComments: number;
    totalFollows: number; totalDMs: number; totalReports: number;
    pendingReports: number; activeProfiles7d: number; activeProfiles30d: number;
    topPosters: { username: string | null; walletAddress: string; postCount: number }[];
  }>;
  getBlockedUsernames(): Promise<BlockedUsername[]>;
  addBlockedUsername(username: string, reason?: string): Promise<BlockedUsername>;
  removeBlockedUsername(username: string): Promise<void>;
  isUsernameBlocked(username: string): Promise<boolean>;

  // ── Trenchy AI ────────────────────────────────────────────────────────────
  saveAiMessage(walletAddress: string, sessionId: string, role: string, content: string): Promise<AiMessage>;
  getAiHistory(walletAddress: string, sessionId: string, limit?: number): Promise<AiMessage[]>;
  getAiSessions(walletAddress: string): Promise<{ sessionId: string; lastMessage: string; createdAt: Date | null }[]>;
  clearAiSession(walletAddress: string, sessionId: string): Promise<void>;

  // ── SOL Payouts ───────────────────────────────────────────────────────────
  initiateSOLPayout(params: {
    epochStart: Date;
    epochEnd: Date;
    totalSolLamports: number;
    initiatedBy: string;
    notes?: string;
  }): Promise<{ payoutId: number; recipientCount: number; successCount: number; failCount: number }>;
  getPayouts(): Promise<(Payout & { recipients: PayoutRecipient[] })[]>;
  getUserPayouts(walletAddress: string): Promise<(PayoutRecipient & { payout: Payout })[]>;
  getEpochPointsSummary(epochStart: Date, epochEnd: Date): Promise<{ walletAddress: string; points: number }[]>;

  // ── Agent API Keys ─────────────────────────────────────────────────────────
  createAgentApiKey(agentWallet: string, label?: string): Promise<{ key: string; record: AgentApiKey }>;
  verifyAgentApiKey(key: string): Promise<AgentApiKey | null>;
  getAgentApiKeys(agentWallet: string): Promise<AgentApiKey[]>;
  getAllAgentProfiles(limit?: number): Promise<SocialProfile[]>;
  revokeAgentApiKey(id: number): Promise<void>;

  // ── Communities ────────────────────────────────────────────────────────────
  createCommunity(data: { name: string; slug: string; description?: string; logoIpfsCid?: string; createdByWallet: string; isPublic?: boolean }): Promise<Community>;
  getCommunities(limit?: number): Promise<(Community & { isMember?: boolean })[]>;
  getCommunityById(id: number): Promise<Community | null>;
  getCommunityBySlug(slug: string): Promise<Community | null>;
  getCommunityMembers(communityId: number): Promise<(CommunityMember & { profile: any })[]>;
  joinCommunity(communityId: number, walletAddress: string): Promise<void>;
  leaveCommunity(communityId: number, walletAddress: string): Promise<void>;
  getCommunityPosts(communityId: number, limit?: number): Promise<(CommunityPost & { profile: any })[]>;
  createCommunityPost(communityId: number, walletAddress: string, content: string): Promise<CommunityPost>;
  deleteCommunityPost(postId: number, walletAddress: string): Promise<boolean>;
  isCommunitymember(communityId: number, walletAddress: string): Promise<boolean>;
  getUserCommunities(walletAddress: string): Promise<Community[]>;
}

export interface LeaderboardEntry {
  walletAddress: string;
  username: string | null;
  profileImageIpfsCid: string | null;
  score: number;
  rawCount: number;
  tier: number; // 0=none 1=trencher 2=elite 3=verified
}

export interface TrenchyLaunchFeedItem {
  id: number;
  coinName: string;
  ticker: string;
  mintAddress: string | null;
  imageUrl: string | null;
  description: string | null;
  website: string | null;
  twitter: string | null;
  launchpad: string;
  platform: string;
  pumpUrl: string | null;
  createdAt: Date | null;
  launcherUsername: string | null;
  launcherWallet: string | null;
  trenchyBoost: boolean;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByTelegramId(telegramId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.telegramId, telegramId));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: number, updates: Partial<InsertUser>): Promise<User> {
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async createLaunch(insertLaunch: InsertLaunch): Promise<Launch> {
    const [launch] = await db.insert(launches).values(insertLaunch).returning();
    return launch;
  }

  async updateLaunch(id: number, updates: Partial<InsertLaunch>): Promise<Launch> {
    const [launch] = await db
      .update(launches)
      .set(updates)
      .where(eq(launches.id, id))
      .returning();
    return launch;
  }

  async getLaunches(): Promise<Launch[]> {
    return await db
      .select()
      .from(launches)
      .where(eq(launches.status, "successful"))
      .orderBy(desc(launches.createdAt))
      .limit(4);
  }

  async getLaunch(id: number): Promise<Launch | undefined> {
    const [launch] = await db.select().from(launches).where(eq(launches.id, id));
    return launch;
  }

  async getStats(): Promise<{ totalUsers: number; totalLaunches: number }> {
    const [{ userCount }] = await db.select({ userCount: count() }).from(users);
    const [{ launchCount }] = await db.select({ launchCount: count() }).from(launches);
    return {
      totalUsers: Number(userCount),
      totalLaunches: Number(launchCount),
    };
  }

  async getRecentLaunchesByUser(userId: number, since: Date): Promise<Launch[]> {
    return await db
      .select()
      .from(launches)
      .where(
        and(
          eq(launches.userId, userId),
          gte(launches.createdAt, since),
          ne(launches.status, "failed")
        )
      )
      .orderBy(desc(launches.createdAt));
  }

  async getBotSettings(): Promise<BotSettings> {
    const [row] = await db.select().from(botSettings).limit(1);
    if (row) return row;
    const [created] = await db.insert(botSettings).values({ isPaused: false }).returning();
    return created;
  }

  async setBotPaused(isPaused: boolean, reason?: string): Promise<BotSettings> {
    const existing = await this.getBotSettings();
    const [updated] = await db
      .update(botSettings)
      .set({ isPaused, pauseReason: reason ?? null, updatedAt: new Date() })
      .where(eq(botSettings.id, existing.id))
      .returning();
    return updated;
  }

  async isSignatureUsed(signature: string): Promise<boolean> {
    const [row] = await db
      .select()
      .from(usedSignatures)
      .where(eq(usedSignatures.signature, signature));
    return !!row;
  }

  async markSignatureUsed(signature: string): Promise<void> {
    await db
      .insert(usedSignatures)
      .values({ signature })
      .onConflictDoNothing();
  }

  async getAllSuccessfulLaunches(): Promise<Launch[]> {
    return await db
      .select()
      .from(launches)
      .where(eq(launches.status, "successful"))
      .orderBy(desc(launches.createdAt));
  }

  async addMarketSnapshot(
    snapshot: Omit<MarketSnapshot, "id" | "timestamp">
  ): Promise<void> {
    await db.insert(marketSnapshots).values(snapshot);
  }

  async getMarketSnapshots(days: number): Promise<MarketSnapshot[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return await db
      .select()
      .from(marketSnapshots)
      .where(gte(marketSnapshots.timestamp, since))
      .orderBy(marketSnapshots.timestamp);
  }

  // ── DEX methods ─────────────────────────────────────────────────────────────

  async createDexListing(listing: InsertDexListing): Promise<DexListing> {
    const [row] = await db.insert(dexListings).values(listing).returning();
    return row;
  }

  async getDexListings(opts: { status?: string; limit?: number; offset?: number } = {}): Promise<DexListing[]> {
    const { status = "active", limit = 50, offset = 0 } = opts;
    const now = new Date();
    return await db
      .select()
      .from(dexListings)
      .where(and(eq(dexListings.status, status), gte(dexListings.expiresAt, now)))
      .orderBy(desc(dexListings.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getDexListing(mintAddress: string): Promise<DexListing | undefined> {
    const [row] = await db
      .select()
      .from(dexListings)
      .where(eq(dexListings.mintAddress, mintAddress));
    return row;
  }

  async updateDexListingStatus(id: number, status: string): Promise<DexListing> {
    const [row] = await db
      .update(dexListings)
      .set({ status })
      .where(eq(dexListings.id, id))
      .returning();
    return row;
  }

  async getActiveDexBoosts(): Promise<(DexBoost & { listing: DexListing })[]> {
    const now = new Date();
    const rows = await db
      .select()
      .from(dexBoosts)
      .innerJoin(dexListings, eq(dexBoosts.listingId, dexListings.id))
      .where(gte(dexBoosts.expiresAt, now))
      .orderBy(desc(dexBoosts.boostTier), desc(dexBoosts.createdAt));
    return rows.map((r) => ({ ...r.dex_boosts, listing: r.dex_listings }));
  }

  async createDexBoost(boost: { listingId: number; boostTier: number; paymentTxSignature: string; paymentCurrency: string; paymentAmountRaw: string; expiresAt: Date }): Promise<DexBoost> {
    const [row] = await db.insert(dexBoosts).values(boost).returning();
    return row;
  }

  async getBoostsForListing(listingId: number): Promise<DexBoost[]> {
    const now = new Date();
    return await db
      .select()
      .from(dexBoosts)
      .where(and(eq(dexBoosts.listingId, listingId), gte(dexBoosts.expiresAt, now)))
      .orderBy(desc(dexBoosts.boostTier));
  }

  async createDexAd(ad: { imageUrl: string; linkUrl: string; label?: string; submitterWallet: string; paymentTxSignature: string; paymentCurrency: string; paymentAmountRaw: string; expiresAt: Date; slotType?: string }): Promise<DexAd> {
    const [row] = await db.insert(dexAds).values({
      ...ad,
      label: ad.label ?? null,
      slotType: ad.slotType ?? "banner",
      status: "pending",
    }).returning();
    return row;
  }

  async getActiveDexAds(): Promise<DexAd[]> {
    const now = new Date();
    return await db
      .select()
      .from(dexAds)
      .where(and(eq(dexAds.status, "active"), gte(dexAds.expiresAt, now)))
      .orderBy(desc(dexAds.createdAt));
  }

  async getAllDexAds(): Promise<DexAd[]> {
    return await db.select().from(dexAds).orderBy(desc(dexAds.createdAt));
  }

  async getDexAdsByWallet(wallet: string): Promise<DexAd[]> {
    return await db
      .select()
      .from(dexAds)
      .where(eq(dexAds.submitterWallet, wallet))
      .orderBy(desc(dexAds.createdAt));
  }

  async updateDexAd(id: number, data: Partial<DexAd>): Promise<DexAd> {
    const [row] = await db
      .update(dexAds)
      .set(data)
      .where(eq(dexAds.id, id))
      .returning();
    return row;
  }

  async deleteDexAd(id: number): Promise<void> {
    await db.delete(dexAds).where(eq(dexAds.id, id));
  }

  async incrementAdImpressions(id: number): Promise<void> {
    await db
      .update(dexAds)
      .set({ impressions: sql`${dexAds.impressions} + 1` })
      .where(eq(dexAds.id, id));
  }

  async getTokenStatus(tokenAddress: string): Promise<TokenStatus | undefined> {
    const [row] = await db
      .select()
      .from(tokenStatus)
      .where(eq(tokenStatus.tokenAddress, tokenAddress));
    return row;
  }

  async getAllTokenStatuses(): Promise<TokenStatus[]> {
    return await db.select().from(tokenStatus);
  }

  async getAllPaidTokenStatuses(): Promise<TokenStatus[]> {
    return await db
      .select()
      .from(tokenStatus)
      .where(eq(tokenStatus.isPaid, true))
      .orderBy(desc(tokenStatus.paidAt));
  }

  async upsertTokenStatus(tokenAddress: string, data: Partial<Omit<TokenStatus, "tokenAddress">>): Promise<TokenStatus> {
    const [row] = await db
      .insert(tokenStatus)
      .values({ tokenAddress, ...data, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: tokenStatus.tokenAddress,
        set: { ...data, updatedAt: new Date() },
      })
      .returning();
    return row;
  }

  async getTokensByWallet(walletAddress: string): Promise<TokenStatus[]> {
    return await db
      .select()
      .from(tokenStatus)
      .where(eq(tokenStatus.claimedByWallet, walletAddress))
      .orderBy(desc(tokenStatus.paidAt));
  }

  // ── Site settings ────────────────────────────────────────────────────────────

  async getSiteSettings(): Promise<Record<string, string>> {
    const rows = await db.select().from(siteSettings);
    const result: Record<string, string> = {};
    for (const row of rows) result[row.key] = row.value;
    return result;
  }

  async setSiteSetting(key: string, value: string): Promise<void> {
    await db
      .insert(siteSettings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: siteSettings.key,
        set: { value, updatedAt: new Date() },
      });
  }

  // ── Bonding-curve price ticks (pre-migration charts) ─────────────────────────

  async recordBondingPriceTick(params: {
    tokenAddress: string;
    priceUsd: number | null;
    priceEth: number | null;
    bondingProgressPct: number | null;
  }): Promise<void> {
    const token = normalizeWallet(params.tokenAddress);
    // Throttle: at most one sample per token per ~60s
    const [latest] = await db
      .select()
      .from(bondingPriceTicks)
      .where(eq(bondingPriceTicks.tokenAddress, token))
      .orderBy(desc(bondingPriceTicks.recordedAt))
      .limit(1);
    if (latest?.recordedAt && Date.now() - new Date(latest.recordedAt).getTime() < 55_000) {
      return;
    }
    await db.insert(bondingPriceTicks).values({
      tokenAddress: token,
      priceUsd: params.priceUsd,
      priceEth: params.priceEth,
      bondingProgressPct: params.bondingProgressPct,
    });
  }

  async getBondingPriceTicks(tokenAddress: string, limit = 120): Promise<BondingPriceTick[]> {
    const token = normalizeWallet(tokenAddress);
    const rows = await db
      .select()
      .from(bondingPriceTicks)
      .where(eq(bondingPriceTicks.tokenAddress, token))
      .orderBy(desc(bondingPriceTicks.recordedAt))
      .limit(limit);
    return rows.reverse();
  }

  // ── Social: Profiles ─────────────────────────────────────────────────────────

  async getSocialProfile(wallet: string): Promise<SocialProfile | undefined> {
    const normalized = normalizeWallet(wallet);
    // Case-insensitive — EVM wallets may be stored checksummed or lowercase
    const [row] = await db
      .select()
      .from(socialProfiles)
      .where(sql`lower(${socialProfiles.walletAddress}) = ${normalized}`);
    return row;
  }

  async getSocialProfileByUsername(username: string): Promise<SocialProfile | undefined> {
    const [row] = await db.select().from(socialProfiles).where(eq(socialProfiles.username, username.toLowerCase()));
    return row;
  }

  async createSocialProfile(data: { walletAddress: string; username?: string; profileImageIpfsCid?: string; bio?: string; twitterLink?: string; githubLink?: string; instagramLink?: string; websiteLink?: string; isAgent?: boolean; agentLabel?: string }): Promise<SocialProfile> {
    const [row] = await db.insert(socialProfiles).values({
      ...data,
      walletAddress: normalizeWallet(data.walletAddress),
      username: data.username ? data.username.toLowerCase() : null,
      createdAt: new Date(),
      lastActive: new Date(),
    }).returning();
    return row;
  }

  async updateSocialProfile(wallet: string, data: Partial<SocialProfile>): Promise<SocialProfile> {
    const { walletAddress: _, ...updateData } = data as any;
    const [row] = await db
      .update(socialProfiles)
      .set({ ...updateData, lastActive: new Date() })
      .where(sql`lower(${socialProfiles.walletAddress}) = ${normalizeWallet(wallet)}`)
      .returning();
    return row;
  }

  async isUsernameTaken(username: string): Promise<boolean> {
    const [row] = await db.select({ w: socialProfiles.walletAddress }).from(socialProfiles).where(eq(socialProfiles.username, username.toLowerCase()));
    return !!row;
  }

  async setTotpSecret(wallet: string, secret: string): Promise<void> {
    await db.update(socialProfiles).set({ totpSecret: secret }).where(sql`lower(${socialProfiles.walletAddress}) = ${normalizeWallet(wallet)}`);
  }

  async enableTotp(wallet: string): Promise<void> {
    await db.update(socialProfiles).set({ totpEnabled: true }).where(sql`lower(${socialProfiles.walletAddress}) = ${normalizeWallet(wallet)}`);
  }

  async disableTotp(wallet: string): Promise<void> {
    await db.update(socialProfiles).set({ totpEnabled: false, totpSecret: null }).where(sql`lower(${socialProfiles.walletAddress}) = ${normalizeWallet(wallet)}`);
  }

  async touchLastActive(wallet: string): Promise<void> {
    await db.update(socialProfiles).set({ lastActive: new Date() }).where(sql`lower(${socialProfiles.walletAddress}) = ${normalizeWallet(wallet)}`);
  }

  // ── Social: Follows ───────────────────────────────────────────────────────────

  async followUser(followerWallet: string, followingWallet: string): Promise<void> {
    const follower = normalizeWallet(followerWallet);
    const following = normalizeWallet(followingWallet);
    if (follower === following) return;
    await db.insert(socialFollows).values({ followerWallet: follower, followingWallet: following, createdAt: new Date() }).onConflictDoNothing();
  }

  async unfollowUser(followerWallet: string, followingWallet: string): Promise<void> {
    await db.delete(socialFollows).where(and(
      sql`lower(${socialFollows.followerWallet}) = ${normalizeWallet(followerWallet)}`,
      sql`lower(${socialFollows.followingWallet}) = ${normalizeWallet(followingWallet)}`,
    ));
  }

  async isFollowing(followerWallet: string, followingWallet: string): Promise<boolean> {
    const [row] = await db.select({ id: socialFollows.id }).from(socialFollows).where(and(
      sql`lower(${socialFollows.followerWallet}) = ${normalizeWallet(followerWallet)}`,
      sql`lower(${socialFollows.followingWallet}) = ${normalizeWallet(followingWallet)}`,
    ));
    return !!row;
  }

  async getFollowers(wallet: string): Promise<SocialProfile[]> {
    const rows = await db.select({ followerWallet: socialFollows.followerWallet }).from(socialFollows)
      .where(sql`lower(${socialFollows.followingWallet}) = ${normalizeWallet(wallet)}`);
    if (!rows.length) return [];
    const lowers = [...new Set(rows.map((r) => normalizeWallet(r.followerWallet)))];
    return db.select().from(socialProfiles).where(
      sql`lower(${socialProfiles.walletAddress}) in (${sql.join(lowers.map((w) => sql`${w}`), sql`, `)})`
    );
  }

  async getFollowing(wallet: string): Promise<SocialProfile[]> {
    const rows = await db.select({ followingWallet: socialFollows.followingWallet }).from(socialFollows)
      .where(sql`lower(${socialFollows.followerWallet}) = ${normalizeWallet(wallet)}`);
    if (!rows.length) return [];
    const lowers = [...new Set(rows.map((r) => normalizeWallet(r.followingWallet)))];
    return db.select().from(socialProfiles).where(
      sql`lower(${socialProfiles.walletAddress}) in (${sql.join(lowers.map((w) => sql`${w}`), sql`, `)})`
    );
  }

  async getFollowerCount(wallet: string): Promise<number> {
    const [{ c }] = await db.select({ c: count() }).from(socialFollows)
      .where(sql`lower(${socialFollows.followingWallet}) = ${normalizeWallet(wallet)}`);
    return Number(c);
  }

  async getFollowingCount(wallet: string): Promise<number> {
    const [{ c }] = await db.select({ c: count() }).from(socialFollows)
      .where(sql`lower(${socialFollows.followerWallet}) = ${normalizeWallet(wallet)}`);
    return Number(c);
  }

  async getNewestProfiles(limit: number): Promise<SocialProfile[]> {
    return db.select().from(socialProfiles).orderBy(desc(socialProfiles.createdAt)).limit(limit);
  }

  async getAllProfileWallets(): Promise<string[]> {
    const rows = await db.select({ w: socialProfiles.walletAddress }).from(socialProfiles);
    return rows.map((r) => r.w);
  }

  // ── Social: Feed ──────────────────────────────────────────────────────────────

  private async enrichFeedItems(items: FeedItem[], viewerWallet?: string): Promise<(FeedItem & { profile: SocialProfile | null; commentCount: number; replyCount: number; likeCount: number; likedByViewer: boolean })[]> {
    if (!items.length) return [];
    const wallets = [...new Set(items.map((i) => i.userWallet))];
    const lowers = [...new Set(wallets.map((w) => normalizeWallet(w)))];
    const profiles = lowers.length
      ? await db.select().from(socialProfiles).where(
          sql`lower(${socialProfiles.walletAddress}) in (${sql.join(lowers.map((w) => sql`${w}`), sql`, `)})`
        )
      : [];
    const profileMap: Record<string, SocialProfile> = {};
    for (const p of profiles) {
      profileMap[normalizeWallet(p.walletAddress)] = p;
      profileMap[p.walletAddress] = p;
    }
    const ids = items.map((i) => i.id);
    const commentCounts = await db.select({ feedItemId: feedComments.feedItemId, c: count() }).from(feedComments).where(inArray(feedComments.feedItemId, ids)).groupBy(feedComments.feedItemId);
    const ccMap: Record<number, number> = {};
    for (const cc of commentCounts) if (cc.feedItemId) ccMap[cc.feedItemId] = Number(cc.c);
    const replyCounts = await db.select({ parentId: feedItems.parentId, c: count() }).from(feedItems).where(and(isNotNull(feedItems.parentId), inArray(feedItems.parentId, ids))).groupBy(feedItems.parentId);
    const rcMap: Record<number, number> = {};
    for (const rc of replyCounts) if (rc.parentId) rcMap[rc.parentId] = Number(rc.c);
    const likeCounts = await db.select({ feedItemId: feedLikes.feedItemId, c: count() }).from(feedLikes).where(inArray(feedLikes.feedItemId, ids)).groupBy(feedLikes.feedItemId);
    const lcMap: Record<number, number> = {};
    for (const lc of likeCounts) lcMap[lc.feedItemId] = Number(lc.c);
    const likedSet = new Set<number>();
    if (viewerWallet) {
      const viewerLikes = await db.select({ feedItemId: feedLikes.feedItemId }).from(feedLikes).where(and(
        sql`lower(${feedLikes.userWallet}) = ${normalizeWallet(viewerWallet)}`,
        inArray(feedLikes.feedItemId, ids)
      ));
      for (const l of viewerLikes) likedSet.add(l.feedItemId);
    }
    return items.map((item) => ({
      ...item,
      profile: profileMap[normalizeWallet(item.userWallet)] ?? profileMap[item.userWallet] ?? null,
      commentCount: ccMap[item.id] ?? 0,
      replyCount: rcMap[item.id] ?? 0,
      likeCount: lcMap[item.id] ?? 0,
      likedByViewer: likedSet.has(item.id),
    }));
  }

  async createFeedItem(data: { userWallet: string; content: string; imageIpfsCid?: string; type?: string; parentId?: number; communityId?: number; communityName?: string; communitySlug?: string }): Promise<FeedItem> {
    const [row] = await db.insert(feedItems).values({ ...data, type: data.type ?? "general", createdAt: new Date() }).returning();
    return row;
  }

  async getFeedItem(id: number): Promise<FeedItem | undefined> {
    const [row] = await db.select().from(feedItems).where(eq(feedItems.id, id));
    return row;
  }

  async getGlobalFeed(limit = 30, offset = 0, viewerWallet?: string): Promise<(FeedItem & { profile: SocialProfile | null; commentCount: number; replyCount: number; likeCount: number; likedByViewer: boolean })[]> {
    const items = await db.select().from(feedItems).where(isNull(feedItems.parentId)).orderBy(desc(feedItems.createdAt)).limit(limit).offset(offset);
    return this.enrichFeedItems(items, viewerWallet);
  }

  async getUserFeed(wallet: string, limit = 30, viewerWallet?: string): Promise<(FeedItem & { profile: SocialProfile | null; commentCount: number; replyCount: number; likeCount: number; likedByViewer: boolean })[]> {
    const items = await db.select().from(feedItems).where(and(
      sql`lower(${feedItems.userWallet}) = ${normalizeWallet(wallet)}`,
      isNull(feedItems.parentId)
    )).orderBy(desc(feedItems.createdAt)).limit(limit);
    return this.enrichFeedItems(items, viewerWallet);
  }

  async getHomeFeed(viewerWallet: string, limit = 30, offset = 0): Promise<(FeedItem & { profile: SocialProfile | null; commentCount: number; replyCount: number; likeCount: number; likedByViewer: boolean })[]> {
    const viewer = normalizeWallet(viewerWallet);
    const followingRows = await db.select({ w: socialFollows.followingWallet }).from(socialFollows)
      .where(sql`lower(${socialFollows.followerWallet}) = ${viewer}`);
    const walletsToShow = [viewer, ...followingRows.map((r) => normalizeWallet(r.w))];
    const items = await db.select().from(feedItems).where(and(
      sql`lower(${feedItems.userWallet}) in (${sql.join(walletsToShow.map((w) => sql`${w}`), sql`, `)})`,
      isNull(feedItems.parentId),
    )).orderBy(desc(feedItems.createdAt)).limit(limit).offset(offset);
    return this.enrichFeedItems(items, viewerWallet);
  }

  async getReplies(parentId: number, viewerWallet?: string): Promise<(FeedItem & { profile: SocialProfile | null; commentCount: number; replyCount: number; likeCount: number; likedByViewer: boolean })[]> {
    const items = await db.select().from(feedItems).where(eq(feedItems.parentId, parentId)).orderBy(feedItems.createdAt);
    return this.enrichFeedItems(items, viewerWallet);
  }

  async getFeedByHashtag(tag: string, limit = 30, offset = 0, viewerWallet?: string): Promise<(FeedItem & { profile: SocialProfile | null; commentCount: number; replyCount: number; likeCount: number; likedByViewer: boolean })[]> {
    const normalized = tag.toLowerCase().replace(/^#/, "");
    const tagged = await db.select({ feedItemId: feedHashtags.feedItemId }).from(feedHashtags).where(eq(feedHashtags.tag, normalized)).orderBy(desc(feedHashtags.createdAt)).limit(limit).offset(offset);
    if (!tagged.length) return [];
    const ids = tagged.map((t) => t.feedItemId);
    const items = await db.select().from(feedItems).where(and(inArray(feedItems.id, ids), isNull(feedItems.parentId))).orderBy(desc(feedItems.createdAt));
    return this.enrichFeedItems(items, viewerWallet);
  }

  async deleteFeedItem(id: number, ownerWallet: string): Promise<boolean> {
    const result = await db.delete(feedItems).where(and(eq(feedItems.id, id), eq(feedItems.userWallet, ownerWallet))).returning();
    return result.length > 0;
  }

  // ── Social: Likes ─────────────────────────────────────────────────────────────

  async toggleFeedLike(userWallet: string, feedItemId: number): Promise<{ liked: boolean; count: number }> {
    const existing = await db.select().from(feedLikes).where(and(eq(feedLikes.userWallet, userWallet), eq(feedLikes.feedItemId, feedItemId)));
    if (existing.length > 0) {
      await db.delete(feedLikes).where(and(eq(feedLikes.userWallet, userWallet), eq(feedLikes.feedItemId, feedItemId)));
    } else {
      await db.insert(feedLikes).values({ userWallet, feedItemId, createdAt: new Date() });
    }
    const [{ c }] = await db.select({ c: count() }).from(feedLikes).where(eq(feedLikes.feedItemId, feedItemId));
    return { liked: existing.length === 0, count: Number(c) };
  }

  // ── Social: Hashtags ──────────────────────────────────────────────────────────

  async saveHashtags(feedItemId: number, content: string, blacklistedWords: string[] = []): Promise<void> {
    const matches = [...content.matchAll(/(?<!\w)#([a-zA-Z][a-zA-Z0-9_]{0,49})/g)];
    if (!matches.length) return;
    const blackSet = new Set(blacklistedWords.map((w) => w.toLowerCase()));
    const tags = [...new Set(matches.map((m) => m[1].toLowerCase()))].filter((t) => !blackSet.has(t) && t.length >= 2);
    if (!tags.length) return;
    await db.insert(feedHashtags).values(tags.map((tag) => ({ feedItemId, tag, createdAt: new Date() }))).onConflictDoNothing();
  }

  async getTrendingHashtags(hours = 24, limit = 10, blacklistedWords: string[] = []): Promise<{ tag: string; count: number }[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const blackSet = new Set(blacklistedWords.map((w) => w.toLowerCase()));
    const rows = await db
      .select({ tag: feedHashtags.tag, c: count() })
      .from(feedHashtags)
      .where(gte(feedHashtags.createdAt, since))
      .groupBy(feedHashtags.tag)
      .orderBy(desc(count()))
      .limit(limit * 3);
    return rows.filter((r) => !blackSet.has(r.tag)).slice(0, limit).map((r) => ({ tag: r.tag, count: Number(r.c) }));
  }

  // ── Social: Comments ──────────────────────────────────────────────────────────

  async createComment(data: { feedItemId?: number; tokenContractAddress?: string; userWallet: string; content: string }): Promise<FeedComment> {
    const [row] = await db.insert(feedComments).values({ ...data, createdAt: new Date() }).returning();
    return row;
  }

  async getComments(feedItemId: number): Promise<(FeedComment & { profile: SocialProfile | null })[]> {
    const comments = await db.select().from(feedComments).where(eq(feedComments.feedItemId, feedItemId)).orderBy(feedComments.createdAt);
    if (!comments.length) return [];
    const wallets = [...new Set(comments.map((c) => c.userWallet))];
    const profiles = await db.select().from(socialProfiles).where(inArray(socialProfiles.walletAddress, wallets));
    const profileMap = Object.fromEntries(profiles.map((p) => [p.walletAddress, p]));
    return comments.map((c) => ({ ...c, profile: profileMap[c.userWallet] ?? null }));
  }

  async getTokenComments(tokenContractAddress: string, limit = 100): Promise<(FeedComment & { profile: SocialProfile | null })[]> {
    const comments = await db
      .select()
      .from(feedComments)
      .where(eq(feedComments.tokenContractAddress, tokenContractAddress))
      .orderBy(desc(feedComments.createdAt))
      .limit(limit);
    if (!comments.length) return [];
    const wallets = [...new Set(comments.map((c) => c.userWallet))];
    const profiles = await db.select().from(socialProfiles).where(inArray(socialProfiles.walletAddress, wallets));
    const profileMap = Object.fromEntries(profiles.map((p) => [p.walletAddress, p]));
    return comments.map((c) => ({ ...c, profile: profileMap[c.userWallet] ?? null }));
  }

  async deleteComment(id: number, ownerWallet: string): Promise<boolean> {
    const result = await db.delete(feedComments).where(and(eq(feedComments.id, id), eq(feedComments.userWallet, ownerWallet))).returning();
    return result.length > 0;
  }

  // ── Social: Reports ───────────────────────────────────────────────────────────

  async createReport(data: { reporterWallet: string; reportedId: number; reportedType: string; reason: string }): Promise<void> {
    await db.insert(socialReports).values({ ...data, status: "pending", createdAt: new Date() });
  }

  // ── Social: Trenchy balance ───────────────────────────────────────────────────

  async getTrenchyBalance(wallet: string): Promise<number> {
    const [row] = await db.select().from(userTrenchyBalances).where(eq(userTrenchyBalances.walletAddress, wallet));
    return row?.balance ?? 0;
  }

  async updateTrenchyBalance(wallet: string, balance: number): Promise<void> {
    await db.insert(userTrenchyBalances).values({ walletAddress: wallet, balance, lastChecked: new Date() })
      .onConflictDoUpdate({ target: userTrenchyBalances.walletAddress, set: { balance, lastChecked: new Date() } });
  }

  // ── Social: Moderation ───────────────────────────────────────────────────────

  async getModerationSettings(): Promise<{ blacklistedWords: string[]; blacklistedDomains: string[]; minTrenchyToPost: number; minMcapUsd: number; minVolume24hUsd: number; trenchyBoostThreshold: number; minTrenchyToUsername: number; minTrenchyToAI: number; aiDailyLimit: number; minTrenchyToMarket: number; minTrenchyToBagsLaunch: number; pointsLikeReceived: number; pointsCommentMade: number; pointsCommentReceived: number; pointsReplyMade: number; pointsReplyReceived: number; pointsReferral: number; pointsDailyCap: number; pointsMinTrenchy: number; tokenGatingEnabled: boolean }> {
    const [row] = await db.select().from(moderationSettings);
    if (!row) {
      await db.insert(moderationSettings).values({ blacklistedWords: [], blacklistedDomains: [], minTrenchyToPost: 0, tokenGatingEnabled: true });
      return { blacklistedWords: [], blacklistedDomains: [], minTrenchyToPost: 0, minMcapUsd: 10000, minVolume24hUsd: 500, trenchyBoostThreshold: 250000, minTrenchyToUsername: 250000, minTrenchyToAI: 500000, aiDailyLimit: 10, minTrenchyToMarket: 250000, minTrenchyToBagsLaunch: 1_000_000, pointsLikeReceived: 2, pointsCommentMade: 5, pointsCommentReceived: 3, pointsReplyMade: 3, pointsReplyReceived: 2, pointsReferral: 100, pointsDailyCap: 200, pointsMinTrenchy: 1_000_000, tokenGatingEnabled: true };
    }
    return {
      blacklistedWords: (row.blacklistedWords as string[]) ?? [],
      blacklistedDomains: (row.blacklistedDomains as string[]) ?? [],
      minTrenchyToPost: row.minTrenchyToPost,
      minMcapUsd: row.minMcapUsd ?? 10000,
      minVolume24hUsd: row.minVolume24hUsd ?? 500,
      trenchyBoostThreshold: row.trenchyBoostThreshold ?? 250000,
      minTrenchyToUsername: row.minTrenchyToUsername ?? 250000,
      minTrenchyToAI: row.minTrenchyToAI ?? 500000,
      aiDailyLimit: row.aiDailyLimit ?? 10,
      minTrenchyToMarket: row.minTrenchyToMarket ?? 250000,
      minTrenchyToBagsLaunch: (row as any).minTrenchyToBagsLaunch ?? 1_000_000,
      pointsLikeReceived:    row.pointsLikeReceived    ?? 2,
      pointsCommentMade:     row.pointsCommentMade     ?? 5,
      pointsCommentReceived: row.pointsCommentReceived ?? 3,
      pointsReplyMade:       row.pointsReplyMade       ?? 3,
      pointsReplyReceived:   row.pointsReplyReceived   ?? 2,
      pointsReferral:        row.pointsReferral        ?? 100,
      pointsDailyCap:        row.pointsDailyCap        ?? 200,
      pointsMinTrenchy:      row.pointsMinTrenchy      ?? 1_000_000,
      tokenGatingEnabled:    (row as any).tokenGatingEnabled ?? true,
    };
  }

  // ── Moderation: update settings ──────────────────────────────────────────────

  async updateModerationSettings(data: { blacklistedWords?: string[]; blacklistedDomains?: string[]; minTrenchyToPost?: number; minMcapUsd?: number; minVolume24hUsd?: number; trenchyBoostThreshold?: number; minTrenchyToUsername?: number; minTrenchyToAI?: number; aiDailyLimit?: number; minTrenchyToMarket?: number; minTrenchyToBagsLaunch?: number; pointsLikeReceived?: number; pointsCommentMade?: number; pointsCommentReceived?: number; pointsReplyMade?: number; pointsReplyReceived?: number; pointsReferral?: number; pointsDailyCap?: number; pointsMinTrenchy?: number; tokenGatingEnabled?: boolean }): Promise<void> {
    const [existing] = await db.select().from(moderationSettings);
    if (!existing) {
      await db.insert(moderationSettings).values({ blacklistedWords: data.blacklistedWords ?? [], blacklistedDomains: data.blacklistedDomains ?? [], minTrenchyToPost: data.minTrenchyToPost ?? 0 });
    } else {
      const updates: Record<string, unknown> = {};
      if (data.blacklistedWords !== undefined) updates.blacklistedWords = data.blacklistedWords;
      if (data.blacklistedDomains !== undefined) updates.blacklistedDomains = data.blacklistedDomains;
      if (data.minTrenchyToPost !== undefined) updates.minTrenchyToPost = data.minTrenchyToPost;
      if (data.minMcapUsd !== undefined) updates.minMcapUsd = data.minMcapUsd;
      if (data.minVolume24hUsd !== undefined) updates.minVolume24hUsd = data.minVolume24hUsd;
      if (data.trenchyBoostThreshold !== undefined) updates.trenchyBoostThreshold = data.trenchyBoostThreshold;
      if (data.minTrenchyToUsername !== undefined) updates.minTrenchyToUsername = data.minTrenchyToUsername;
      if (data.minTrenchyToAI !== undefined) updates.minTrenchyToAI = data.minTrenchyToAI;
      if (data.aiDailyLimit !== undefined) updates.aiDailyLimit = data.aiDailyLimit;
      if (data.minTrenchyToMarket !== undefined) updates.minTrenchyToMarket = data.minTrenchyToMarket;
      if (data.minTrenchyToBagsLaunch !== undefined) updates.minTrenchyToBagsLaunch = data.minTrenchyToBagsLaunch;
      if (data.pointsLikeReceived !== undefined) updates.pointsLikeReceived = data.pointsLikeReceived;
      if (data.pointsCommentMade !== undefined) updates.pointsCommentMade = data.pointsCommentMade;
      if (data.pointsCommentReceived !== undefined) updates.pointsCommentReceived = data.pointsCommentReceived;
      if (data.pointsReplyMade !== undefined) updates.pointsReplyMade = data.pointsReplyMade;
      if (data.pointsReplyReceived !== undefined) updates.pointsReplyReceived = data.pointsReplyReceived;
      if (data.pointsReferral !== undefined) updates.pointsReferral = data.pointsReferral;
      if (data.pointsDailyCap !== undefined) updates.pointsDailyCap = data.pointsDailyCap;
      if (data.pointsMinTrenchy !== undefined) updates.pointsMinTrenchy = data.pointsMinTrenchy;
      if (data.tokenGatingEnabled !== undefined) (updates as any).tokenGatingEnabled = data.tokenGatingEnabled;
      await db.update(moderationSettings).set(updates as any);
    }
  }

  // Get just the points config (used by awardPoints for efficiency)
  async getPointsConfig(): Promise<{ pointsLikeReceived: number; pointsCommentMade: number; pointsCommentReceived: number; pointsReplyMade: number; pointsReplyReceived: number; pointsReferral: number; pointsDailyCap: number; pointsMinTrenchy: number }> {
    const [row] = await db.select().from(moderationSettings);
    return {
      pointsLikeReceived:    row?.pointsLikeReceived    ?? 2,
      pointsCommentMade:     row?.pointsCommentMade     ?? 5,
      pointsCommentReceived: row?.pointsCommentReceived ?? 3,
      pointsReplyMade:       row?.pointsReplyMade       ?? 3,
      pointsReplyReceived:   row?.pointsReplyReceived   ?? 2,
      pointsReferral:        row?.pointsReferral        ?? 100,
      pointsDailyCap:        row?.pointsDailyCap        ?? 200,
      pointsMinTrenchy:      row?.pointsMinTrenchy      ?? 1_000_000,
    };
  }

  async getAiDailyUsageCount(wallet: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const rows = await db.select().from(aiMessages)
      .where(and(
        eq(aiMessages.walletAddress, wallet),
        eq(aiMessages.role, "user"),
        gte(aiMessages.createdAt, startOfDay),
      ));
    return rows.length;
  }

  // ── Leaderboard ──────────────────────────────────────────────────────────────

  async getLeaderboard(category: "launchers" | "active" | "commenters", since: Date): Promise<LeaderboardEntry[]> {
    const TIER_MULTIPLIER: Record<number, number> = { 0: 1, 1: 1, 2: 2, 3: 2 };

    let rows: { wallet: string; rawCount: number; balance: number; username: string | null; profileImageIpfsCid: string | null }[] = [];

    if (category === "launchers") {
      const result = await db
        .select({
          wallet: users.walletAddress,
          rawCount: count(launches.id),
          balance: sql<number>`coalesce(max(${userTrenchyBalances.balance}), 0)`,
          username: socialProfiles.username,
          profileImageIpfsCid: socialProfiles.profileImageIpfsCid,
        })
        .from(launches)
        .innerJoin(users, eq(launches.userId, users.id))
        .leftJoin(userTrenchyBalances, eq(users.walletAddress, userTrenchyBalances.walletAddress))
        .leftJoin(socialProfiles, eq(users.walletAddress, socialProfiles.walletAddress))
        .where(and(eq(launches.status, "successful"), gte(launches.createdAt, since)))
        .groupBy(users.walletAddress, socialProfiles.username, socialProfiles.profileImageIpfsCid)
        .orderBy(desc(count(launches.id)))
        .limit(50);
      rows = result.map(r => ({ wallet: r.wallet ?? "", rawCount: Number(r.rawCount), balance: r.balance, username: r.username, profileImageIpfsCid: r.profileImageIpfsCid }));
    } else if (category === "active") {
      const result = await db
        .select({
          wallet: feedItems.userWallet,
          rawCount: count(feedItems.id),
          balance: sql<number>`coalesce(max(${userTrenchyBalances.balance}), 0)`,
          username: socialProfiles.username,
          profileImageIpfsCid: socialProfiles.profileImageIpfsCid,
        })
        .from(feedItems)
        .leftJoin(userTrenchyBalances, eq(feedItems.userWallet, userTrenchyBalances.walletAddress))
        .leftJoin(socialProfiles, eq(feedItems.userWallet, socialProfiles.walletAddress))
        .where(gte(feedItems.createdAt, since))
        .groupBy(feedItems.userWallet, socialProfiles.username, socialProfiles.profileImageIpfsCid)
        .orderBy(desc(count(feedItems.id)))
        .limit(50);
      rows = result.map(r => ({ wallet: r.wallet, rawCount: Number(r.rawCount), balance: r.balance, username: r.username, profileImageIpfsCid: r.profileImageIpfsCid }));
    } else {
      const result = await db
        .select({
          wallet: feedComments.userWallet,
          rawCount: count(feedComments.id),
          balance: sql<number>`coalesce(max(${userTrenchyBalances.balance}), 0)`,
          username: socialProfiles.username,
          profileImageIpfsCid: socialProfiles.profileImageIpfsCid,
        })
        .from(feedComments)
        .leftJoin(userTrenchyBalances, eq(feedComments.userWallet, userTrenchyBalances.walletAddress))
        .leftJoin(socialProfiles, eq(feedComments.userWallet, socialProfiles.walletAddress))
        .where(gte(feedComments.createdAt, since))
        .groupBy(feedComments.userWallet, socialProfiles.username, socialProfiles.profileImageIpfsCid)
        .orderBy(desc(count(feedComments.id)))
        .limit(50);
      rows = result.map(r => ({ wallet: r.wallet, rawCount: Number(r.rawCount), balance: r.balance, username: r.username, profileImageIpfsCid: r.profileImageIpfsCid }));
    }

    return rows.map(r => {
      const tier = r.balance >= 1_000_000 ? 3 : r.balance >= 500_000 ? 2 : r.balance >= 250_000 ? 1 : 0;
      return {
        walletAddress: r.wallet,
        username: r.username,
        profileImageIpfsCid: r.profileImageIpfsCid,
        rawCount: r.rawCount,
        score: r.rawCount * (TIER_MULTIPLIER[tier] ?? 1),
        tier,
      };
    }).sort((a, b) => b.score - a.score);
  }

  // ── Bounties ─────────────────────────────────────────────────────────────────

  async getBounties(limit = 50, offset = 0): Promise<(FeedItem & { profile: SocialProfile | null; commentCount: number })[]> {
    const rows = await db
      .select({
        item: feedItems,
        profile: socialProfiles,
        commentCount: sql<number>`count(${feedComments.id})`,
      })
      .from(feedItems)
      .leftJoin(socialProfiles, eq(feedItems.userWallet, socialProfiles.walletAddress))
      .leftJoin(feedComments, eq(feedComments.feedItemId, feedItems.id))
      .where(eq(feedItems.type, "bounty"))
      .groupBy(feedItems.id, socialProfiles.walletAddress)
      .orderBy(desc(feedItems.createdAt))
      .limit(limit)
      .offset(offset);
    return rows.map(r => ({ ...r.item, profile: r.profile ?? null, commentCount: Number(r.commentCount) }));
  }

  // ── Messages / DMs ────────────────────────────────────────────────────────────

  async sendMessage(fromWallet: string, toWallet: string, content: string): Promise<Message> {
    const [msg] = await db.insert(messages).values({ fromWallet, toWallet, content }).returning();
    return msg;
  }

  async getInboxMessages(wallet: string): Promise<(Message & { fromProfile: SocialProfile | null })[]> {
    const rows = await db
      .select({ msg: messages, fromProfile: socialProfiles })
      .from(messages)
      .leftJoin(socialProfiles, eq(messages.fromWallet, socialProfiles.walletAddress))
      .where(eq(messages.toWallet, wallet))
      .orderBy(desc(messages.createdAt))
      .limit(100);
    return rows.map(r => ({ ...r.msg, fromProfile: r.fromProfile ?? null }));
  }

  async getSentMessages(wallet: string): Promise<(Message & { toProfile: SocialProfile | null })[]> {
    const rows = await db
      .select({ msg: messages, toProfile: socialProfiles })
      .from(messages)
      .leftJoin(socialProfiles, eq(messages.toWallet, socialProfiles.walletAddress))
      .where(eq(messages.fromWallet, wallet))
      .orderBy(desc(messages.createdAt))
      .limit(100);
    return rows.map(r => ({ ...r.msg, toProfile: r.toProfile ?? null }));
  }

  async markMessageRead(id: number, wallet: string): Promise<void> {
    await db.update(messages).set({ readAt: new Date() }).where(and(eq(messages.id, id), eq(messages.toWallet, wallet)));
  }

  async hasExistingConversation(walletA: string, walletB: string): Promise<boolean> {
    const rows = await db.select({ id: messages.id }).from(messages).where(
      or(
        and(eq(messages.fromWallet, walletA), eq(messages.toWallet, walletB)),
        and(eq(messages.fromWallet, walletB), eq(messages.toWallet, walletA)),
      )
    ).limit(1);
    return rows.length > 0;
  }

  async getUnreadMessageCount(wallet: string): Promise<number> {
    const [row] = await db.select({ c: count() }).from(messages).where(and(eq(messages.toWallet, wallet), isNull(messages.readAt)));
    return Number(row?.c ?? 0);
  }

  async getNewRepliesCount(wallet: string): Promise<number> {
    // Replies to my posts by others, created after lastSeenRepliesAt (or last 30 days if never set)
    const [profile] = await db.select({ lastSeenRepliesAt: socialProfiles.lastSeenRepliesAt }).from(socialProfiles).where(eq(socialProfiles.walletAddress, wallet)).limit(1);
    const since = profile?.lastSeenRepliesAt ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const myPosts = await db.select({ id: feedItems.id }).from(feedItems).where(and(eq(feedItems.userWallet, wallet), isNull(feedItems.parentId)));
    if (!myPosts.length) return 0;
    const myPostIds = myPosts.map((p) => p.id);
    const [row] = await db.select({ c: count() }).from(feedItems).where(
      and(
        inArray(feedItems.parentId, myPostIds),
        ne(feedItems.userWallet, wallet),
        gte(feedItems.createdAt, since),
      )
    );
    return Number(row?.c ?? 0);
  }

  async markRepliesSeen(wallet: string): Promise<void> {
    await db.update(socialProfiles).set({ lastSeenRepliesAt: new Date() }).where(eq(socialProfiles.walletAddress, wallet));
  }

  async getActivityNotifications(wallet: string, limit = 50): Promise<ActivityNotification[]> {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // last 30 days

    // Helper: fetch profile info for a set of wallets
    const fetchProfiles = async (wallets: string[]) => {
      if (!wallets.length) return new Map<string, { username: string | null; profileImageIpfsCid: string | null }>();
      const rows = await db.select({ walletAddress: socialProfiles.walletAddress, username: socialProfiles.username, profileImageIpfsCid: socialProfiles.profileImageIpfsCid })
        .from(socialProfiles).where(inArray(socialProfiles.walletAddress, wallets));
      return new Map(rows.map((r) => [r.walletAddress, r]));
    };

    // My top-level post IDs
    const myPosts = await db.select({ id: feedItems.id, content: feedItems.content }).from(feedItems)
      .where(and(eq(feedItems.userWallet, wallet), isNull(feedItems.parentId))).orderBy(desc(feedItems.createdAt)).limit(200);
    const myPostIds = myPosts.map((p) => p.id);
    const myPostMap = new Map(myPosts.map((p) => [p.id, p.content]));

    const notifications: ActivityNotification[] = [];

    // 1. New followers
    const follows = await db.select({ followerWallet: socialFollows.followerWallet, createdAt: socialFollows.createdAt })
      .from(socialFollows).where(and(eq(socialFollows.followingWallet, wallet), gte(socialFollows.createdAt, since)))
      .orderBy(desc(socialFollows.createdAt)).limit(limit);

    // 2. Likes on my posts
    const likes = myPostIds.length ? await db.select({ userWallet: feedLikes.userWallet, feedItemId: feedLikes.feedItemId, createdAt: feedLikes.createdAt })
      .from(feedLikes).where(and(inArray(feedLikes.feedItemId, myPostIds), ne(feedLikes.userWallet, wallet), gte(feedLikes.createdAt, since)))
      .orderBy(desc(feedLikes.createdAt)).limit(limit) : [];

    // 3. Replies to my posts (feedItems with parentId of mine)
    const replies = myPostIds.length ? await db.select({ id: feedItems.id, userWallet: feedItems.userWallet, parentId: feedItems.parentId, content: feedItems.content, createdAt: feedItems.createdAt })
      .from(feedItems).where(and(inArray(feedItems.parentId, myPostIds), ne(feedItems.userWallet, wallet), gte(feedItems.createdAt, since)))
      .orderBy(desc(feedItems.createdAt)).limit(limit) : [];

    // 4. Comments on my posts
    const comments = myPostIds.length ? await db.select({ id: feedComments.id, userWallet: feedComments.userWallet, feedItemId: feedComments.feedItemId, content: feedComments.content, createdAt: feedComments.createdAt })
      .from(feedComments).where(and(inArray(feedComments.feedItemId, myPostIds), ne(feedComments.userWallet, wallet), gte(feedComments.createdAt, since)))
      .orderBy(desc(feedComments.createdAt)).limit(limit) : [];

    // Collect all actor wallets and fetch profiles once
    const allActors = [
      ...follows.map((f) => f.followerWallet),
      ...likes.map((l) => l.userWallet),
      ...replies.map((r) => r.userWallet),
      ...comments.map((c) => c.userWallet),
    ];
    const profileMap = await fetchProfiles([...new Set(allActors)]);

    for (const f of follows) {
      const p = profileMap.get(f.followerWallet);
      notifications.push({ id: `follow-${f.followerWallet}`, type: "follow", actorWallet: f.followerWallet, actorUsername: p?.username ?? null, actorImageCid: p?.profileImageIpfsCid ?? null, createdAt: f.createdAt! });
    }
    for (const l of likes) {
      const p = profileMap.get(l.userWallet);
      notifications.push({ id: `like-${l.userWallet}-${l.feedItemId}`, type: "like", actorWallet: l.userWallet, actorUsername: p?.username ?? null, actorImageCid: p?.profileImageIpfsCid ?? null, postId: l.feedItemId, postPreview: (myPostMap.get(l.feedItemId) ?? "").slice(0, 60), createdAt: l.createdAt! });
    }
    for (const r of replies) {
      const p = profileMap.get(r.userWallet);
      notifications.push({ id: `reply-${r.id}`, type: "reply", actorWallet: r.userWallet, actorUsername: p?.username ?? null, actorImageCid: p?.profileImageIpfsCid ?? null, postId: r.parentId ?? undefined, postPreview: r.content.slice(0, 60), createdAt: r.createdAt! });
    }
    for (const c of comments) {
      const p = profileMap.get(c.userWallet);
      notifications.push({ id: `comment-${c.id}`, type: "comment", actorWallet: c.userWallet, actorUsername: p?.username ?? null, actorImageCid: p?.profileImageIpfsCid ?? null, postId: c.feedItemId ?? undefined, postPreview: c.content.slice(0, 60), createdAt: c.createdAt! });
    }

    notifications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return notifications.slice(0, limit);
  }

  // ── Admin: Reports ────────────────────────────────────────────────────────────

  async getReports(status = "pending", limit = 100): Promise<any[]> {
    const conditions = status === "all" ? [] : [eq(socialReports.status, status)];
    return db.select().from(socialReports).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(socialReports.createdAt)).limit(limit);
  }

  async updateReportStatus(id: number, status: string): Promise<void> {
    await db.update(socialReports).set({ status } as any).where(eq(socialReports.id, id));
  }

  // ── Launch Feed ──────────────────────────────────────────────────────────────

  async getTrenchyLaunchFeed(limit = 50, offset = 0, launchpadFilter?: string): Promise<TrenchyLaunchFeedItem[]> {
    const BOOST_THRESHOLD = 250_000;
    const conditions = [eq(launches.status, "successful")];
    if (launchpadFilter) conditions.push(eq(launches.launchpad, launchpadFilter));

    const rows = await db
      .select({
        id: launches.id,
        coinName: launches.coinName,
        ticker: launches.ticker,
        mintAddress: launches.mintAddress,
        imageUrl: launches.imageUrl,
        description: launches.description,
        website: launches.website,
        twitter: launches.twitter,
        launchpad: launches.launchpad,
        platform: launches.platform,
        pumpUrl: launches.pumpUrl,
        createdAt: launches.createdAt,
        launcherUsername: users.username,
        launcherWallet: users.walletAddress,
        trenchyBalance: userTrenchyBalances.balance,
      })
      .from(launches)
      .leftJoin(users, eq(launches.userId, users.id))
      .leftJoin(userTrenchyBalances, eq(users.walletAddress, userTrenchyBalances.walletAddress))
      .where(and(...conditions))
      .orderBy(desc(launches.createdAt))
      .limit(limit)
      .offset(offset);

    return rows.map((r) => ({
      id: r.id,
      coinName: r.coinName,
      ticker: r.ticker,
      mintAddress: r.mintAddress,
      imageUrl: r.imageUrl,
      description: r.description,
      website: r.website,
      twitter: r.twitter,
      launchpad: r.launchpad ?? "pump.fun",
      platform: r.platform,
      pumpUrl: r.pumpUrl,
      createdAt: r.createdAt,
      launcherUsername: r.launcherUsername ?? null,
      launcherWallet: r.launcherWallet ?? null,
      trenchyBoost: (r.trenchyBalance ?? 0) >= BOOST_THRESHOLD,
    }));
  }

  async getActiveSocialAds(placement?: string): Promise<SocialAd[]> {
    const conditions = [eq(socialAds.active, true)];
    if (placement) conditions.push(eq(socialAds.placement, placement));
    return db.select().from(socialAds).where(and(...conditions)).orderBy(desc(socialAds.createdAt));
  }

  async getAllSocialAds(): Promise<SocialAd[]> {
    return db.select().from(socialAds).orderBy(desc(socialAds.createdAt));
  }

  async createSocialAd(data: { title: string; imageUrl?: string; linkUrl: string; callToAction?: string; placement?: string; active?: boolean }): Promise<SocialAd> {
    const [row] = await db.insert(socialAds).values({
      title: data.title,
      imageUrl: data.imageUrl ?? null,
      linkUrl: data.linkUrl,
      callToAction: data.callToAction ?? "Learn More",
      placement: data.placement ?? "feed",
      active: data.active ?? true,
    }).returning();
    return row;
  }

  async updateSocialAd(id: number, data: Partial<SocialAd>): Promise<SocialAd> {
    const { id: _id, createdAt: _c, ...safe } = data as any;
    const [row] = await db.update(socialAds).set({ ...safe, updatedAt: new Date() }).where(eq(socialAds.id, id)).returning();
    return row;
  }

  async deleteSocialAd(id: number): Promise<void> {
    await db.delete(socialAds).where(eq(socialAds.id, id));
  }

  async incrementSocialAdImpressions(id: number): Promise<void> {
    await db.update(socialAds).set({ impressions: sql`${socialAds.impressions} + 1` }).where(eq(socialAds.id, id));
  }

  async getSocialStats() {
    const now = new Date();
    const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const ago30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [
      [{ c: totalProfiles }],
      [{ c: totalPosts }],
      [{ c: totalComments }],
      [{ c: totalFollows }],
      [{ c: totalDMs }],
      [{ c: totalReports }],
      [{ c: pendingReports }],
      [{ c: activeProfiles7d }],
      [{ c: activeProfiles30d }],
      topPosters,
    ] = await Promise.all([
      db.select({ c: count() }).from(socialProfiles),
      db.select({ c: count() }).from(feedItems),
      db.select({ c: count() }).from(feedComments),
      db.select({ c: count() }).from(socialFollows),
      db.select({ c: count() }).from(messages),
      db.select({ c: count() }).from(socialReports),
      db.select({ c: count() }).from(socialReports).where(eq(socialReports.status, "pending")),
      db.select({ c: count() }).from(socialProfiles).where(gte(socialProfiles.lastActive, ago7d)),
      db.select({ c: count() }).from(socialProfiles).where(gte(socialProfiles.lastActive, ago30d)),
      db.select({
        walletAddress: feedItems.userWallet,
        username: socialProfiles.username,
        postCount: count(feedItems.id),
      })
        .from(feedItems)
        .leftJoin(socialProfiles, eq(feedItems.userWallet, socialProfiles.walletAddress))
        .groupBy(feedItems.userWallet, socialProfiles.username)
        .orderBy(desc(count(feedItems.id)))
        .limit(5),
    ]);
    return {
      totalProfiles: Number(totalProfiles),
      totalPosts: Number(totalPosts),
      totalComments: Number(totalComments),
      totalFollows: Number(totalFollows),
      totalDMs: Number(totalDMs),
      totalReports: Number(totalReports),
      pendingReports: Number(pendingReports),
      activeProfiles7d: Number(activeProfiles7d),
      activeProfiles30d: Number(activeProfiles30d),
      topPosters: topPosters.map((r) => ({ walletAddress: r.walletAddress, username: r.username ?? null, postCount: Number(r.postCount) })),
    };
  }

  async getBlockedUsernames(): Promise<BlockedUsername[]> {
    return db.select().from(blockedUsernames).orderBy(blockedUsernames.username);
  }

  async addBlockedUsername(username: string, reason?: string): Promise<BlockedUsername> {
    const [row] = await db.insert(blockedUsernames).values({ username: username.toLowerCase(), reason: reason ?? null }).returning();
    return row;
  }

  async removeBlockedUsername(username: string): Promise<void> {
    await db.delete(blockedUsernames).where(eq(blockedUsernames.username, username.toLowerCase()));
  }

  async isUsernameBlocked(username: string): Promise<boolean> {
    const [row] = await db.select({ id: blockedUsernames.id }).from(blockedUsernames).where(eq(blockedUsernames.username, username.toLowerCase()));
    return !!row;
  }

  async saveAiMessage(walletAddress: string, sessionId: string, role: string, content: string): Promise<AiMessage> {
    const [msg] = await db.insert(aiMessages).values({ walletAddress, sessionId, role, content }).returning();
    return msg;
  }

  async getAiHistory(walletAddress: string, sessionId: string, limit = 40): Promise<AiMessage[]> {
    return db.select().from(aiMessages)
      .where(and(eq(aiMessages.walletAddress, walletAddress), eq(aiMessages.sessionId, sessionId)))
      .orderBy(aiMessages.createdAt)
      .limit(limit);
  }

  async getAiSessions(walletAddress: string): Promise<{ sessionId: string; lastMessage: string; createdAt: Date | null }[]> {
    const rows = await db.select({
      sessionId: aiMessages.sessionId,
      lastMessage: aiMessages.content,
      createdAt: aiMessages.createdAt,
    }).from(aiMessages)
      .where(eq(aiMessages.walletAddress, walletAddress))
      .orderBy(desc(aiMessages.createdAt))
      .limit(100);
    const seen = new Map<string, { sessionId: string; lastMessage: string; createdAt: Date | null }>();
    for (const row of rows) {
      if (!seen.has(row.sessionId)) seen.set(row.sessionId, row);
    }
    return Array.from(seen.values()).slice(0, 20);
  }

  async clearAiSession(walletAddress: string, sessionId: string): Promise<void> {
    await db.delete(aiMessages).where(and(eq(aiMessages.walletAddress, walletAddress), eq(aiMessages.sessionId, sessionId)));
  }

  // ── Points System ─────────────────────────────────────────────────────────
  // Default fallback values (used only if DB row is missing)
  static readonly DEFAULT_POINT_VALUES: Record<string, number> = {
    like_received:    2,
    comment_made:     5,
    comment_received: 3,
    reply_made:       3,
    reply_received:   2,
    referral:         100,
  };
  static readonly DEFAULT_POINTS_DAILY_CAP = 200;
  static readonly DEFAULT_POINTS_MIN_TRENCHY = 1_000_000;

  // Sum of non-voided points earned in last 24h for a wallet
  async getDailyPointsEarned(walletAddress: string): Promise<number> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [row] = await db
      .select({ total: sql<number>`COALESCE(SUM(${pointEvents.points}), 0)` })
      .from(pointEvents)
      .where(and(
        eq(pointEvents.walletAddress, walletAddress),
        eq(pointEvents.voided, false),
        gte(pointEvents.createdAt, since),
      ));
    return Number(row?.total ?? 0);
  }

  // Core award method — handles eligibility check, daily cap, and insertion
  async awardPoints(
    walletAddress: string,
    action: string,
    sourceType?: string,
    sourceId?: number,
  ): Promise<void> {
    // Fetch live config from DB
    const cfg = await this.getPointsConfig();

    // Map action → point value using live DB config
    const actionToField: Record<string, keyof typeof cfg> = {
      like_received:    "pointsLikeReceived",
      comment_made:     "pointsCommentMade",
      comment_received: "pointsCommentReceived",
      reply_made:       "pointsReplyMade",
      reply_received:   "pointsReplyReceived",
      referral:         "pointsReferral",
    };
    const fieldName = actionToField[action];
    if (!fieldName) return;
    const pts = cfg[fieldName] as number;
    if (!pts || pts <= 0) return;

    // Must hold required $FEATHER to earn points (cached balance check)
    const balance = await this.getTrenchyBalance(walletAddress);
    if (balance < cfg.pointsMinTrenchy) return;

    // Enforce daily cap
    const earned = await this.getDailyPointsEarned(walletAddress);
    const remaining = cfg.pointsDailyCap - earned;
    if (remaining <= 0) return;
    const award = Math.min(pts, remaining);

    await db.insert(pointEvents).values({
      walletAddress,
      action,
      points: award,
      sourceType: sourceType ?? null,
      sourceId: sourceId ?? null,
    });
  }

  // Summary for the user dashboard
  async getUserPointsSummary(walletAddress: string): Promise<{
    totalPoints: number;
    dailyPointsEarned: number;
    dailyCap: number;
    pointsMinTrenchy: number;
    eligible: boolean;
    breakdown: { eventType: string; total: number; count: number }[];
  }> {
    const [cfg, balance] = await Promise.all([
      this.getPointsConfig(),
      this.getTrenchyBalance(walletAddress),
    ]);

    const [totRow] = await db
      .select({ total: sql<number>`COALESCE(SUM(${pointEvents.points}), 0)` })
      .from(pointEvents)
      .where(and(eq(pointEvents.walletAddress, walletAddress), eq(pointEvents.voided, false)));

    const dailyPointsEarned = await this.getDailyPointsEarned(walletAddress);

    const breakdownRows = await db
      .select({
        action: pointEvents.action,
        points: sql<number>`COALESCE(SUM(${pointEvents.points}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(pointEvents)
      .where(and(eq(pointEvents.walletAddress, walletAddress), eq(pointEvents.voided, false)))
      .groupBy(pointEvents.action)
      .orderBy(desc(sql`SUM(${pointEvents.points})`));

    return {
      totalPoints: Number(totRow?.total ?? 0),
      dailyPointsEarned,
      dailyCap: cfg.pointsDailyCap,
      pointsMinTrenchy: cfg.pointsMinTrenchy,
      eligible: balance >= cfg.pointsMinTrenchy,
      breakdown: breakdownRows.map((r) => ({
        eventType: r.action,
        total: Number(r.points),
        count: Number(r.count),
      })),
    };
  }

  // Get or generate a referral code for a user
  async getOrCreateReferralCode(walletAddress: string): Promise<string> {
    const [profile] = await db
      .select({ referralCode: socialProfiles.referralCode })
      .from(socialProfiles)
      .where(eq(socialProfiles.walletAddress, walletAddress));
    if (profile?.referralCode) return profile.referralCode;
    // Generate a short unique code: 8 hex chars
    const { randomBytes } = await import("crypto");
    const code = randomBytes(5).toString("hex"); // 10 chars
    await db
      .update(socialProfiles)
      .set({ referralCode: code })
      .where(eq(socialProfiles.walletAddress, walletAddress));
    return code;
  }

  // Resolve a referral code to a wallet address
  async getReferralCodeOwner(code: string): Promise<string | null> {
    const [row] = await db
      .select({ walletAddress: socialProfiles.walletAddress })
      .from(socialProfiles)
      .where(eq(socialProfiles.referralCode, code));
    return row?.walletAddress ?? null;
  }

  // Claim referral: attribute referred user to referrer and award points
  // Returns { success, referrerWallet } — idempotent (safe to call twice)
  async claimReferral(referralCode: string, referredWallet: string): Promise<{ success: boolean; referrerWallet?: string }> {
    const referrerWallet = await this.getReferralCodeOwner(referralCode);
    if (!referrerWallet) return { success: false };
    if (referrerWallet === referredWallet) return { success: false };

    // Check if already referred
    const existing = await db
      .select({ id: referrals.id })
      .from(referrals)
      .where(eq(referrals.referredWallet, referredWallet));
    if (existing.length > 0) return { success: true, referrerWallet }; // idempotent

    // Insert referral record
    try {
      await db.insert(referrals).values({ referrerWallet, referredWallet });
    } catch {
      return { success: true, referrerWallet }; // unique constraint — already inserted
    }

    // Award points to referrer
    await this.awardPoints(referrerWallet, "referral", "referral", undefined);
    return { success: true, referrerWallet };
  }

  // Get list of users referred by this wallet
  async getUserReferrals(walletAddress: string): Promise<{
    referredWallet: string;
    username: string | null;
    createdAt: Date | null;
  }[]> {
    const rows = await db
      .select({
        referredWallet: referrals.referredWallet,
        username: socialProfiles.username,
        createdAt: referrals.createdAt,
      })
      .from(referrals)
      .leftJoin(socialProfiles, eq(socialProfiles.walletAddress, referrals.referredWallet))
      .where(eq(referrals.referrerWallet, walletAddress))
      .orderBy(desc(referrals.createdAt));
    return rows;
  }

  // Admin: list all users sorted by total points
  async getAdminPointsOverview(limit = 50, offset = 0): Promise<{
    walletAddress: string;
    username: string | null;
    totalPoints: number;
    eventCount: number;
  }[]> {
    const rows = await db
      .select({
        walletAddress: pointEvents.walletAddress,
        totalPoints: sql<number>`COALESCE(SUM(CASE WHEN ${pointEvents.voided} = false THEN ${pointEvents.points} ELSE 0 END), 0)`,
        eventCount: sql<number>`COUNT(*)`,
      })
      .from(pointEvents)
      .groupBy(pointEvents.walletAddress)
      .orderBy(desc(sql`SUM(CASE WHEN ${pointEvents.voided} = false THEN ${pointEvents.points} ELSE 0 END)`))
      .limit(limit)
      .offset(offset);

    const wallets = rows.map((r) => r.walletAddress);
    const profiles = wallets.length > 0
      ? await db.select({ walletAddress: socialProfiles.walletAddress, username: socialProfiles.username })
          .from(socialProfiles).where(inArray(socialProfiles.walletAddress, wallets))
      : [];
    const profileMap = new Map(profiles.map((p) => [p.walletAddress, p.username]));

    return rows.map((r) => ({
      walletAddress: r.walletAddress,
      username: profileMap.get(r.walletAddress) ?? null,
      totalPoints: Number(r.totalPoints),
      eventCount: Number(r.eventCount),
    }));
  }

  // Admin: get recent events for a specific user
  async getUserPointEvents(walletAddress: string, limit = 30): Promise<PointEvent[]> {
    return db
      .select()
      .from(pointEvents)
      .where(eq(pointEvents.walletAddress, walletAddress))
      .orderBy(desc(pointEvents.createdAt))
      .limit(limit);
  }

  // Admin: void a point event
  async voidPointEvent(id: number, adminWallet: string): Promise<void> {
    await db
      .update(pointEvents)
      .set({ voided: true, voidedBy: adminWallet, voidedAt: new Date() })
      .where(eq(pointEvents.id, id));
  }

  // Admin: un-void a point event
  async unvoidPointEvent(id: number): Promise<void> {
    await db
      .update(pointEvents)
      .set({ voided: false, voidedBy: null, voidedAt: null })
      .where(eq(pointEvents.id, id));
  }

  // ── SOL Payouts ─────────────────────────────────────────────────────────────

  async getEpochPointsSummary(epochStart: Date, epochEnd: Date): Promise<{ walletAddress: string; points: number }[]> {
    const rows = await db
      .select({
        walletAddress: pointEvents.walletAddress,
        points: sql<number>`COALESCE(SUM(${pointEvents.points}), 0)`,
      })
      .from(pointEvents)
      .where(
        and(
          eq(pointEvents.voided, false),
          gte(pointEvents.createdAt, epochStart),
          lt(pointEvents.createdAt, epochEnd),
        )
      )
      .groupBy(pointEvents.walletAddress)
      .orderBy(desc(sql`SUM(${pointEvents.points})`));
    return rows.map((r) => ({ walletAddress: r.walletAddress, points: Number(r.points) }));
  }

  async initiateSOLPayout(params: {
    epochStart: Date;
    epochEnd: Date;
    totalSolLamports: number;
    initiatedBy: string;
    notes?: string;
  }): Promise<{ payoutId: number; recipientCount: number; successCount: number; failCount: number }> {
    const { epochStart, epochEnd, totalSolLamports, initiatedBy, notes } = params;

    // 1. Calculate epoch points per wallet
    const recipients = await this.getEpochPointsSummary(epochStart, epochEnd);
    const totalPoints = recipients.reduce((s, r) => s + r.points, 0);

    // 2. Create payout record
    const [payout] = await db.insert(payouts).values({
      epochStart,
      epochEnd,
      totalPoints,
      totalSolLamports,
      recipientCount: recipients.length,
      status: "processing",
      initiatedBy,
      notes: notes ?? null,
    }).returning();

    if (!recipients.length || totalPoints === 0) {
      await db.update(payouts).set({ status: "completed", completedAt: new Date() }).where(eq(payouts.id, payout.id));
      return { payoutId: payout.id, recipientCount: 0, successCount: 0, failCount: 0 };
    }

    // 3. Build recipient rows with proportional shares
    const recipientRows = recipients.map((r) => {
      const sharePercent = ((r.points / totalPoints) * 100).toFixed(4);
      const solLamports = Math.floor((r.points / totalPoints) * totalSolLamports);
      return { payoutId: payout.id, walletAddress: r.walletAddress, epochPoints: r.points, sharePercent, solLamports };
    });
    await db.insert(payoutRecipients).values(recipientRows);

    // 4. On-chain ETH payouts on Robinhood Chain are not wired yet —
    // mark recipients as failed with a clear migration message.
    let successCount = 0;
    let failCount = 0;

    const inserted = await db.select().from(payoutRecipients).where(eq(payoutRecipients.payoutId, payout.id));

    for (const rec of inserted) {
      await db.update(payoutRecipients).set({
        status: "failed",
        errorMessage: "ETH payouts on Robinhood Chain are coming soon.",
      }).where(eq(payoutRecipients.id, rec.id));
      failCount++;
    }

    await db.update(payouts).set({
      status: failCount === inserted.length ? "failed" : "completed",
      completedAt: new Date(),
    }).where(eq(payouts.id, payout.id));

    return { payoutId: payout.id, recipientCount: inserted.length, successCount, failCount };
  }

  async getPayouts(): Promise<(Payout & { recipients: PayoutRecipient[] })[]> {
    const allPayouts = await db.select().from(payouts).orderBy(desc(payouts.createdAt));
    const allRecipients = allPayouts.length
      ? await db.select().from(payoutRecipients).where(inArray(payoutRecipients.payoutId, allPayouts.map((p) => p.id)))
      : [];
    return allPayouts.map((p) => ({
      ...p,
      recipients: allRecipients.filter((r) => r.payoutId === p.id),
    }));
  }

  async getUserPayouts(walletAddress: string): Promise<(PayoutRecipient & { payout: Payout })[]> {
    const rows = await db
      .select()
      .from(payoutRecipients)
      .innerJoin(payouts, eq(payoutRecipients.payoutId, payouts.id))
      .where(eq(payoutRecipients.walletAddress, walletAddress))
      .orderBy(desc(payouts.createdAt));
    return rows.map((r) => ({ ...r.payout_recipients, payout: r.payouts }));
  }

  // ── Agent API Keys ──────────────────────────────────────────────────────────

  async createAgentApiKey(agentWallet: string, label?: string): Promise<{ key: string; record: AgentApiKey }> {
    const crypto = await import("crypto");
    const key = `trk_${crypto.randomBytes(32).toString("hex")}`;
    const keyHash = crypto.createHash("sha256").update(key).digest("hex");
    const [record] = await db.insert(agentApiKeys).values({ agentWallet, keyHash, label: label ?? null, isActive: true }).returning();
    return { key, record };
  }

  async verifyAgentApiKey(key: string): Promise<AgentApiKey | null> {
    const crypto = await import("crypto");
    const keyHash = crypto.createHash("sha256").update(key).digest("hex");
    const [row] = await db.select().from(agentApiKeys).where(and(eq(agentApiKeys.keyHash, keyHash), eq(agentApiKeys.isActive, true)));
    if (!row) return null;
    await db.update(agentApiKeys).set({ lastUsedAt: new Date() }).where(eq(agentApiKeys.id, row.id));
    return row;
  }

  async getAgentApiKeys(agentWallet: string): Promise<AgentApiKey[]> {
    return db.select().from(agentApiKeys).where(and(eq(agentApiKeys.agentWallet, agentWallet), eq(agentApiKeys.isActive, true))).orderBy(desc(agentApiKeys.createdAt));
  }

  async getAllAgentProfiles(limit = 100): Promise<SocialProfile[]> {
    return db.select().from(socialProfiles).where(eq(socialProfiles.isAgent, true)).orderBy(desc(socialProfiles.createdAt)).limit(limit);
  }

  async revokeAgentApiKey(id: number): Promise<void> {
    await db.update(agentApiKeys).set({ isActive: false }).where(eq(agentApiKeys.id, id));
  }

  // ── Communities ────────────────────────────────────────────────────────────

  async createCommunity(data: { name: string; slug: string; description?: string; logoIpfsCid?: string; createdByWallet: string; isPublic?: boolean }): Promise<Community> {
    const [community] = await db.insert(communities).values({
      name: data.name,
      slug: data.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      description: data.description ?? null,
      logoIpfsCid: data.logoIpfsCid ?? null,
      createdByWallet: data.createdByWallet,
      isPublic: data.isPublic ?? true,
      memberCount: 1,
    }).returning();
    // Auto-join as owner
    await db.insert(communityMembers).values({
      communityId: community.id,
      walletAddress: data.createdByWallet,
      role: "owner",
    });
    return community;
  }

  async getCommunities(limit = 50): Promise<(Community & { isMember?: boolean })[]> {
    return db.select().from(communities).where(eq(communities.isPublic, true)).orderBy(desc(communities.memberCount), desc(communities.createdAt)).limit(limit);
  }

  async getCommunityById(id: number): Promise<Community | null> {
    const [row] = await db.select().from(communities).where(eq(communities.id, id));
    return row ?? null;
  }

  async getCommunityBySlug(slug: string): Promise<Community | null> {
    const [row] = await db.select().from(communities).where(eq(communities.slug, slug));
    return row ?? null;
  }

  async getCommunityMembers(communityId: number): Promise<(CommunityMember & { profile: any })[]> {
    const rows = await db.select().from(communityMembers)
      .leftJoin(socialProfiles, eq(communityMembers.walletAddress, socialProfiles.walletAddress))
      .where(eq(communityMembers.communityId, communityId))
      .orderBy(communityMembers.joinedAt)
      .limit(100);
    return rows.map(r => ({ ...r.community_members, profile: r.social_profiles }));
  }

  async joinCommunity(communityId: number, walletAddress: string): Promise<void> {
    const existing = await db.select().from(communityMembers)
      .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.walletAddress, walletAddress)));
    if (existing.length > 0) return;
    await db.insert(communityMembers).values({ communityId, walletAddress, role: "member" });
    await db.update(communities).set({ memberCount: sql`${communities.memberCount} + 1` }).where(eq(communities.id, communityId));
  }

  async leaveCommunity(communityId: number, walletAddress: string): Promise<void> {
    await db.delete(communityMembers).where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.walletAddress, walletAddress)));
    await db.update(communities).set({ memberCount: sql`GREATEST(${communities.memberCount} - 1, 0)` }).where(eq(communities.id, communityId));
  }

  async isCommunitymember(communityId: number, walletAddress: string): Promise<boolean> {
    const [row] = await db.select().from(communityMembers)
      .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.walletAddress, walletAddress)));
    return !!row;
  }

  async getUserCommunities(walletAddress: string): Promise<Community[]> {
    const rows = await db.select().from(communityMembers)
      .innerJoin(communities, eq(communityMembers.communityId, communities.id))
      .where(eq(communityMembers.walletAddress, walletAddress))
      .orderBy(desc(communities.memberCount));
    return rows.map(r => r.communities);
  }

  async getCommunityPosts(communityId: number, limit = 50): Promise<(CommunityPost & { profile: any })[]> {
    const rows = await db.select().from(communityPosts)
      .leftJoin(socialProfiles, eq(communityPosts.walletAddress, socialProfiles.walletAddress))
      .where(eq(communityPosts.communityId, communityId))
      .orderBy(desc(communityPosts.createdAt))
      .limit(limit);
    return rows.map(r => ({ ...r.community_posts, profile: r.social_profiles ?? null }));
  }

  async createCommunityPost(communityId: number, walletAddress: string, content: string): Promise<CommunityPost> {
    const [row] = await db.insert(communityPosts).values({ communityId, walletAddress, content }).returning();
    return row;
  }

  async deleteCommunityPost(postId: number, walletAddress: string): Promise<boolean> {
    const [post] = await db.select().from(communityPosts).where(eq(communityPosts.id, postId));
    if (!post) return false;
    // Allow post author OR community owner to delete
    if (post.walletAddress !== walletAddress) {
      // Check if deleter is community owner
      const [community] = await db.select().from(communities).where(eq(communities.id, post.communityId));
      if (!community || community.createdByWallet !== walletAddress) return false;
    }
    await db.delete(communityPosts).where(eq(communityPosts.id, postId));
    return true;
  }
}

export const storage = new DatabaseStorage();
