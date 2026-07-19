import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useWalletConnect } from "@/hooks/use-wallet-connect";
import {
  Shield, Wallet, Loader2, CheckCircle2, XCircle, Pencil, Trash2,
  RefreshCw, ExternalLink, Settings, Image, LayoutDashboard, AlertTriangle,
  DollarSign, Clock, ShieldAlert, Flag, Lock, CheckCheck, Users, Ban, BarChart2, TrendingUp, Award, Coins, ChevronDown, ChevronRight,
  Zap, Key, Copy, Check, Rocket, FolderOpen, Upload, FileText, Search, Globe,
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { SEO_DEFAULTS } from "@/components/SeoHead";

const ADMIN_WALLET = "0x752C3b6CB472D426AD0438f202A46dFa7D58aF34";
const TOKEN_KEY = "feather_admin_token";

function ipfsUrl(cid: string | null | undefined): string {
  if (!cid) return "";
  if (cid.startsWith("Qm") || cid.startsWith("bafy") || cid.startsWith("baf")) {
    return `https://gateway.pinata.cloud/ipfs/${cid}`;
  }
  if (cid.endsWith(".json")) return `/uploads/metadata/${cid}`;
  return `/uploads/claim/${cid}`;
}

function truncatePk(pk: string) { return `${pk.slice(0, 4)}…${pk.slice(-4)}`; }

type Tab = "claims" | "ads" | "pricing" | "seo" | "moderation" | "reports" | "security" | "social" | "points" | "payouts" | "agents" | "files";

const ADMIN_NAV: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "claims", label: "Token Claims", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  { id: "ads", label: "Advertisements", icon: <Image className="w-3.5 h-3.5" /> },
  { id: "pricing", label: "Pricing", icon: <DollarSign className="w-3.5 h-3.5" /> },
  { id: "seo", label: "SEO & Analytics", icon: <Search className="w-3.5 h-3.5" /> },
  { id: "moderation", label: "Moderation", icon: <ShieldAlert className="w-3.5 h-3.5" /> },
  { id: "reports", label: "Reports", icon: <Flag className="w-3.5 h-3.5" /> },
  { id: "security", label: "Security", icon: <Lock className="w-3.5 h-3.5" /> },
  { id: "social", label: "Social", icon: <Users className="w-3.5 h-3.5" /> },
  { id: "points", label: "Points", icon: <Award className="w-3.5 h-3.5" /> },
  { id: "payouts", label: "Payouts", icon: <Coins className="w-3.5 h-3.5" /> },
  { id: "agents", label: "AI Agents", icon: <Zap className="w-3.5 h-3.5" /> },
  { id: "files", label: "Root Files", icon: <FolderOpen className="w-3.5 h-3.5" /> },
];

type TokenClaim = {
  tokenAddress: string; isPaid: boolean; paidAt: string | null; claimedByWallet: string | null;
  tokenName: string | null; tokenSymbol: string | null; description: string | null;
  logoIpfsCid: string | null; bannerIpfsCid: string | null;
  twitter: string | null; discord: string | null; website: string | null; github: string | null;
  isRemoved: boolean; removalReason: string | null; removalNote: string | null;
  boostTier: number;
};

type DexAd = {
  id: number; imageUrl: string; linkUrl: string; label: string | null;
  submitterWallet: string; status: string; slotType: string; adminNote: string | null;
  impressions: number; expiresAt: string; createdAt: string;
};

type SocialAdRecord = {
  id: number; title: string; imageUrl: string | null; linkUrl: string;
  callToAction: string | null; placement: string | null;
  active: boolean; impressions: number; createdAt: string;
};

type Settings = Record<string, string>;

// ── Auth hook ─────────────────────────────────────────────────────────────────

function useAdminAuth() {
  const wallet = useWalletConnect();
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY));
  const [authing, setAuthing] = useState(false);

  const isAdmin = !!wallet.publicKey && wallet.publicKey.toLowerCase() === ADMIN_WALLET.toLowerCase();

  const login = useCallback(async () => {
    if (!wallet.connected || !isAdmin) return;
    setAuthing(true);
    try {
      const message = `Feather Admin Login\nWallet: ${wallet.publicKey}\nTimestamp: ${Date.now()}`;
      const signature = await wallet.signMessage(message);
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: wallet.publicKey, signature, message }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Auth failed");
      const { token: t } = await res.json();
      sessionStorage.setItem(TOKEN_KEY, t);
      setToken(t);
      toast({ title: "Admin access granted", description: "Welcome back." });
    } catch (e: any) {
      toast({ title: "Auth failed", description: e.message, variant: "destructive" });
    } finally {
      setAuthing(false);
    }
  }, [wallet, isAdmin, toast]);

  const logout = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  const authFetch = useCallback(async (url: string, opts: RequestInit = {}) => {
    if (!token) throw new Error("Not authenticated");
    const res = await fetch(url, {
      ...opts,
      headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    if (res.status === 401) { logout(); throw new Error("Session expired — please log in again"); }
    return res;
  }, [token, logout]);

  return { token, isAdmin, authing, login, logout, authFetch, wallet };
}

// ── Backfill Button ───────────────────────────────────────────────────────────
function BackfillFollowButton({ token }: { token: string | null }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    if (!token) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/backfill-admin-follows", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const msg = `Backfill complete — ${data.backfilled} user${data.backfilled !== 1 ? "s" : ""} now following admin`;
      setResult(msg);
      toast({ title: "Backfill complete", description: msg });
    } catch (err: any) {
      toast({ title: "Backfill failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        size="sm"
        onClick={run}
        disabled={loading || !token}
        data-testid="button-backfill-admin-follows"
        className="gap-1.5"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
        {loading ? "Running…" : "Backfill All Users → Follow Admin"}
      </Button>
      {result && <span className="text-xs text-emerald-400">{result}</span>}
    </div>
  );
}

// ── Main Admin page ───────────────────────────────────────────────────────────

export default function Admin() {
  const { token, isAdmin, authing, login, logout, authFetch, wallet } = useAdminAuth();
  const [tab, setTab] = useState<Tab>("claims");
  const { toast } = useToast();

  // ── State ──────────────────────────────────────────────────────────────────
  const [claims, setClaims] = useState<TokenClaim[]>([]);
  const [ads, setAds] = useState<DexAd[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(false);

  // edit claim
  const [editClaim, setEditClaim] = useState<TokenClaim | null>(null);
  const [editClaimForm, setEditClaimForm] = useState<Partial<TokenClaim>>({});
  const [savingClaim, setSavingClaim] = useState(false);

  // revoke claim
  const [revokeClaim, setRevokeClaim] = useState<TokenClaim | null>(null);
  const [revokeReason, setRevokeReason] = useState("rug_pull");
  const [revokeNote, setRevokeNote] = useState("");
  const [revoking, setRevoking] = useState(false);

  // new manual claim
  const [newClaim, setNewClaim] = useState(false);
  const [newClaimForm, setNewClaimForm] = useState({ tokenAddress: "", tokenName: "", tokenSymbol: "", description: "", claimedByWallet: "", twitter: "", discord: "", website: "", github: "" });
  const [creatingClaim, setCreatingClaim] = useState(false);

  // edit ad
  const [editAd, setEditAd] = useState<DexAd | null>(null);
  const [editAdForm, setEditAdForm] = useState<Partial<DexAd>>({});
  const [savingAd, setSavingAd] = useState(false);

  // social ads
  const [socialAds, setSocialAds] = useState<SocialAdRecord[]>([]);
  const [newSocialAdForm, setNewSocialAdForm] = useState({ title: "", imageUrl: "", linkUrl: "", callToAction: "", placement: "feed" });
  const [creatingSocialAd, setCreatingSocialAd] = useState(false);
  const [showNewSocialAdForm, setShowNewSocialAdForm] = useState(false);

  // settings form
  const [settingsForm, setSettingsForm] = useState<Settings>({});
  const [savingSettings, setSavingSettings] = useState(false);

  // moderation settings
  type ModSettings = { blacklistedWords: string[]; blacklistedDomains: string[]; minTrenchyToPost: number; minTrenchyToUsername: number; minMcapUsd: number; minVolume24hUsd: number; trenchyBoostThreshold: number; minTrenchyToAI: number; aiDailyLimit: number; minTrenchyToMarket: number; minTrenchyToBagsLaunch: number; tokenGatingEnabled: boolean };
  const [modSettings, setModSettings] = useState<ModSettings | null>(null);
  const [modForm, setModForm] = useState<{ blacklistedWords: string; blacklistedDomains: string; minTrenchyToPost: string; minTrenchyToUsername: string; minMcapUsd: string; minVolume24hUsd: string; trenchyBoostThreshold: string; minTrenchyToAI: string; aiDailyLimit: string; minTrenchyToMarket: string; minTrenchyToBagsLaunch: string; tokenGatingEnabled: boolean }>({ blacklistedWords: "", blacklistedDomains: "", minTrenchyToPost: "", minTrenchyToUsername: "", minMcapUsd: "", minVolume24hUsd: "", trenchyBoostThreshold: "", minTrenchyToAI: "500000", aiDailyLimit: "10", minTrenchyToMarket: "250000", minTrenchyToBagsLaunch: "1000000", tokenGatingEnabled: true });
  const [savingMod, setSavingMod] = useState(false);

  // reports
  type Report = { id: number; reporterWallet: string; reportedId: number; reportedType: string; reason: string; status: string; createdAt: string };
  const [reports, setReports] = useState<Report[]>([]);
  const [reportFilter, setReportFilter] = useState("pending");
  const [updatingReport, setUpdatingReport] = useState<number | null>(null);

  // social stats + blocked usernames
  type SocialStats = { totalProfiles: number; totalPosts: number; totalComments: number; totalFollows: number; totalDMs: number; totalReports: number; pendingReports: number; activeProfiles7d: number; activeProfiles30d: number; topPosters: { username: string | null; walletAddress: string; postCount: number }[] };
  type BlockedUser = { id: number; username: string; reason: string | null; createdAt: string };
  const [socialStats, setSocialStats] = useState<SocialStats | null>(null);
  const [blockedUsernames, setBlockedUsernames] = useState<BlockedUser[]>([]);
  const [newBlockedUsername, setNewBlockedUsername] = useState("");
  const [newBlockedReason, setNewBlockedReason] = useState("");
  const [addingBlocked, setAddingBlocked] = useState(false);

  // agents admin
  type AgentProfile = { walletAddress: string; username: string | null; agentLabel: string | null; keyCount: number; createdAt: string };
  type AgentKey = { id: number; keyPrefix: string; createdAt: string; lastUsedAt: string | null };
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [agentKeys, setAgentKeys] = useState<Record<string, AgentKey[]>>({});
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [copiedAgent, setCopiedAgent] = useState<string | null>(null);

  // points admin
  type PointsOverviewRow = { walletAddress: string; username: string | null; totalPoints: number; eventCount: number };
  type PointEvent = { id: number; walletAddress: string; eventType: string; points: number; sourceId: number | null; voidedAt: string | null; voidedBy: string | null; createdAt: string };
  type PointsConfig = { pointsLikeReceived: number; pointsCommentMade: number; pointsCommentReceived: number; pointsReplyMade: number; pointsReplyReceived: number; pointsReferral: number; pointsDailyCap: number; pointsMinTrenchy: number };
  const [pointsOverview, setPointsOverview] = useState<PointsOverviewRow[]>([]);
  const [expandedWallet, setExpandedWallet] = useState<string | null>(null);
  const [walletEvents, setWalletEvents] = useState<Record<string, PointEvent[]>>({});
  const [voidingId, setVoidingId] = useState<number | null>(null);
  const [pointsConfig, setPointsConfig] = useState<PointsConfig | null>(null);
  const [pointsConfigForm, setPointsConfigForm] = useState<Record<string, string>>({});
  const [savingPointsConfig, setSavingPointsConfig] = useState(false);

  // payouts
  type PayoutRecipient = { id: number; payoutId: number; walletAddress: string; epochPoints: number; sharePercent: string; solLamports: number; txSignature: string | null; status: string; errorMessage: string | null };
  type PayoutRecord = { id: number; epochStart: string; epochEnd: string; totalPoints: number; totalSolLamports: number; recipientCount: number; status: string; initiatedBy: string; notes: string | null; createdAt: string; completedAt: string | null; recipients: PayoutRecipient[] };
  const [allPayouts, setAllPayouts] = useState<PayoutRecord[]>([]);
  const [expandedPayout, setExpandedPayout] = useState<number | null>(null);
  const [distributing, setDistributing] = useState(false);
  const [payoutEpochStart, setPayoutEpochStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 16);
  });
  const [payoutEpochEnd, setPayoutEpochEnd] = useState(() => new Date().toISOString().slice(0, 16));
  const [payoutSolAmount, setPayoutSolAmount] = useState("");
  const [payoutNotes, setPayoutNotes] = useState("");
  const [epochPreview, setEpochPreview] = useState<{ rows: { walletAddress: string; points: number }[]; totalPoints: number } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // root-file manager
  type RootFile = { name: string; size: number; modifiedAt: string };
  const [rootFiles, setRootFiles] = useState<RootFile[]>([]);
  const [rootFileUploading, setRootFileUploading] = useState(false);
  const [rootFilePendingName, setRootFilePendingName] = useState("");
  const [rootFilePendingContent, setRootFilePendingContent] = useState<{ content: string; encoding: "base64" | "utf8" } | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadClaims = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/admin/token-claims");
      if (res.ok) setClaims(await res.json());
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [authFetch, toast]);

  const loadAds = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/admin/ads");
      if (res.ok) setAds(await res.json());
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [authFetch, toast]);

  const loadSocialAds = useCallback(async () => {
    try {
      const res = await authFetch("/api/admin/social-ads");
      if (res.ok) setSocialAds(await res.json());
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
  }, [authFetch, toast]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [adminRes, publicRes] = await Promise.all([
        authFetch("/api/admin/settings"),
        fetch("/api/settings"),
      ]);
      const adminSettings = adminRes.ok ? await adminRes.json() : {};
      const publicSettings = publicRes.ok ? await publicRes.json() : {};
      const merged = {
        ...SEO_DEFAULTS,
        swapFeeRecipient: ADMIN_WALLET,
        swapFeeBps: "25",
        featherTokenAddress: "",
        ...publicSettings,
        ...adminSettings,
      };
      setSettings(merged);
      setSettingsForm(merged);
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [authFetch, toast]);

  const loadModSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/admin/moderation");
      if (res.ok) {
        const s: ModSettings = await res.json();
        setModSettings(s);
        setModForm({
          blacklistedWords: (s.blacklistedWords ?? []).join(", "),
          blacklistedDomains: (s.blacklistedDomains ?? []).join(", "),
          minTrenchyToPost: String(s.minTrenchyToPost ?? 0),
          minTrenchyToUsername: String(s.minTrenchyToUsername ?? 250000),
          minMcapUsd: String(s.minMcapUsd ?? 10000),
          minVolume24hUsd: String(s.minVolume24hUsd ?? 500),
          trenchyBoostThreshold: String(s.trenchyBoostThreshold ?? 250000),
          minTrenchyToAI: String(s.minTrenchyToAI ?? 500000),
          aiDailyLimit: String(s.aiDailyLimit ?? 10),
          minTrenchyToMarket: String(s.minTrenchyToMarket ?? 250000),
          minTrenchyToBagsLaunch: String(s.minTrenchyToBagsLaunch ?? 1000000),
          tokenGatingEnabled: s.tokenGatingEnabled ?? true,
        });
      }
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [authFetch, toast]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/admin/reports?status=${reportFilter}`);
      if (res.ok) setReports(await res.json());
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [authFetch, toast, reportFilter]);

  const loadSocialData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, blockedRes] = await Promise.all([
        authFetch("/api/admin/social-stats"),
        authFetch("/api/admin/blocked-usernames"),
      ]);
      if (statsRes.ok) setSocialStats(await statsRes.json());
      if (blockedRes.ok) setBlockedUsernames(await blockedRes.json());
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [authFetch, toast]);

  const loadPoints = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewRes, configRes] = await Promise.all([
        authFetch("/api/admin/points?limit=50"),
        fetch("/api/points/config"),
      ]);
      if (overviewRes.ok) setPointsOverview(await overviewRes.json());
      if (configRes.ok) {
        const cfg = await configRes.json();
        setPointsConfig(cfg);
        setPointsConfigForm({
          pointsLikeReceived:    String(cfg.pointsLikeReceived),
          pointsCommentMade:     String(cfg.pointsCommentMade),
          pointsCommentReceived: String(cfg.pointsCommentReceived),
          pointsReplyMade:       String(cfg.pointsReplyMade),
          pointsReplyReceived:   String(cfg.pointsReplyReceived),
          pointsReferral:        String(cfg.pointsReferral),
          pointsDailyCap:        String(cfg.pointsDailyCap),
          pointsMinTrenchy:      String(cfg.pointsMinTrenchy),
        });
      }
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [authFetch, toast]);

  const savePointsConfig = async () => {
    setSavingPointsConfig(true);
    try {
      const payload = {
        pointsLikeReceived:    Number(pointsConfigForm.pointsLikeReceived),
        pointsCommentMade:     Number(pointsConfigForm.pointsCommentMade),
        pointsCommentReceived: Number(pointsConfigForm.pointsCommentReceived),
        pointsReplyMade:       Number(pointsConfigForm.pointsReplyMade),
        pointsReplyReceived:   Number(pointsConfigForm.pointsReplyReceived),
        pointsReferral:        Number(pointsConfigForm.pointsReferral),
        pointsDailyCap:        Number(pointsConfigForm.pointsDailyCap),
        pointsMinTrenchy:      Number(pointsConfigForm.pointsMinTrenchy),
      };
      const res = await authFetch("/api/admin/points/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const updated = await res.json();
        setPointsConfig(updated);
        toast({ title: "Points config saved!", description: "New values take effect immediately." });
      } else {
        const err = await res.json();
        toast({ title: err.error ?? "Failed to save", variant: "destructive" });
      }
    } finally { setSavingPointsConfig(false); }
  };

  const loadWalletEvents = useCallback(async (walletAddress: string) => {
    try {
      const res = await authFetch(`/api/admin/points/${walletAddress}/events`);
      if (res.ok) {
        const data = await res.json();
        setWalletEvents(prev => ({ ...prev, [walletAddress]: data }));
      }
    } catch {}
  }, [authFetch]);

  const voidEvent = async (id: number, walletAddress: string) => {
    setVoidingId(id);
    try {
      const res = await authFetch(`/api/admin/points/${id}`, { method: "DELETE" });
      if (res.ok) { toast({ title: "Event voided" }); await loadWalletEvents(walletAddress); await loadPoints(); }
      else toast({ title: "Failed to void", variant: "destructive" });
    } finally { setVoidingId(null); }
  };

  const restoreEvent = async (id: number, walletAddress: string) => {
    setVoidingId(id);
    try {
      const res = await authFetch(`/api/admin/points/${id}/restore`, { method: "PATCH" });
      if (res.ok) { toast({ title: "Event restored" }); await loadWalletEvents(walletAddress); await loadPoints(); }
      else toast({ title: "Failed to restore", variant: "destructive" });
    } finally { setVoidingId(null); }
  };

  const loadPayouts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/admin/payouts");
      if (res.ok) setAllPayouts(await res.json());
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [authFetch, toast]);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/admin/agents");
      if (res.ok) setAgents(await res.json());
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [authFetch, toast]);

  const loadRootFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/admin/root-files");
      if (res.ok) setRootFiles(await res.json());
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [authFetch, toast]);

  const loadAgentKeys = useCallback(async (wallet: string) => {
    const res = await authFetch(`/api/agent/keys?wallet=${wallet}`);
    if (res.ok) {
      const data = await res.json();
      setAgentKeys((prev) => ({ ...prev, [wallet]: data }));
    }
  }, [authFetch]);

  const forceRevokeKey = async (keyId: number, wallet: string) => {
    if (!confirm("Force-revoke this API key? The agent will lose access immediately.")) return;
    const res = await authFetch(`/api/admin/agents/keys/${keyId}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Key revoked" });
      loadAgentKeys(wallet);
      loadAgents();
    } else {
      const d = await res.json();
      toast({ title: d.error ?? "Revoke failed", variant: "destructive" });
    }
  };

  const loadEpochPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const params = new URLSearchParams({ epochStart: new Date(payoutEpochStart).toISOString(), epochEnd: new Date(payoutEpochEnd).toISOString() });
      const res = await authFetch(`/api/admin/payouts/epoch-preview?${params}`);
      if (res.ok) setEpochPreview(await res.json());
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setPreviewLoading(false); }
  }, [authFetch, payoutEpochStart, payoutEpochEnd, toast]);

  const distributePayouts = async () => {
    const solNum = parseFloat(payoutSolAmount);
    if (isNaN(solNum) || solNum <= 0) { toast({ title: "Enter a valid ETH amount", variant: "destructive" }); return; }
    if (!confirm(`Distribute ${solNum} ETH from the bot wallet to all earners for the selected epoch? This cannot be undone.`)) return;
    setDistributing(true);
    try {
      const lamports = Math.floor(solNum * 1_000_000_000);
      const res = await authFetch("/api/admin/payouts/distribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epochStart: new Date(payoutEpochStart).toISOString(), epochEnd: new Date(payoutEpochEnd).toISOString(), totalSolLamports: lamports, notes: payoutNotes }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: `Payout #${data.payoutId} complete — ${data.successCount} sent, ${data.failCount} failed` });
        await loadPayouts();
        setEpochPreview(null);
      } else {
        toast({ title: data.error ?? "Payout failed", variant: "destructive" });
      }
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setDistributing(false); }
  };

  useEffect(() => {
    if (!token) return;
    if (tab === "claims") loadClaims();
    if (tab === "ads") { loadAds(); loadSocialAds(); }
    if (tab === "pricing" || tab === "seo") loadSettings();
    if (tab === "moderation") loadModSettings();
    if (tab === "reports") loadReports();
    if (tab === "social") loadSocialData();
    if (tab === "points") loadPoints();
    if (tab === "payouts") loadPayouts();
    if (tab === "agents") loadAgents();
    if (tab === "files") loadRootFiles();
  }, [token, tab, loadClaims, loadAds, loadSocialAds, loadSettings, loadModSettings, loadReports, loadSocialData, loadPoints, loadPayouts, loadAgents, loadRootFiles]);

  const saveModSettings = async () => {
    setSavingMod(true);
    try {
      const payload = {
        blacklistedWords: modForm.blacklistedWords.split(",").map((s) => s.trim()).filter(Boolean),
        blacklistedDomains: modForm.blacklistedDomains.split(",").map((s) => s.trim()).filter(Boolean),
        minTrenchyToPost: Number(modForm.minTrenchyToPost),
        minTrenchyToUsername: Number(modForm.minTrenchyToUsername),
        minMcapUsd: Number(modForm.minMcapUsd),
        minVolume24hUsd: Number(modForm.minVolume24hUsd),
        trenchyBoostThreshold: Number(modForm.trenchyBoostThreshold),
        minTrenchyToAI: Number(modForm.minTrenchyToAI),
        aiDailyLimit: Number(modForm.aiDailyLimit),
        minTrenchyToMarket: Number(modForm.minTrenchyToMarket),
        minTrenchyToBagsLaunch: Number(modForm.minTrenchyToBagsLaunch),
        tokenGatingEnabled: modForm.tokenGatingEnabled,
      };
      const res = await authFetch("/api/admin/moderation", { method: "PATCH", body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Moderation settings saved" });
      loadModSettings();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setSavingMod(false); }
  };

  const updateReport = async (id: number, status: string) => {
    setUpdatingReport(id);
    try {
      const res = await authFetch(`/api/admin/reports/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: `Report marked as ${status}` });
      loadReports();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setUpdatingReport(null); }
  };

  // ── Actions: claims ────────────────────────────────────────────────────────
  const saveClaim = async () => {
    if (!editClaim) return;
    setSavingClaim(true);
    try {
      const res = await authFetch(`/api/admin/token-claims/${editClaim.tokenAddress}`, {
        method: "PATCH",
        body: JSON.stringify(editClaimForm),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Token claim updated" });
      setEditClaim(null);
      loadClaims();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setSavingClaim(false); }
  };

  const doRevoke = async () => {
    if (!revokeClaim) return;
    setRevoking(true);
    try {
      const res = await authFetch(`/api/admin/token-claims/${revokeClaim.tokenAddress}`, {
        method: "DELETE",
        body: JSON.stringify({ reason: revokeReason, note: revokeNote }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Claim revoked" });
      setRevokeClaim(null);
      loadClaims();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setRevoking(false); }
  };

  const createManualClaim = async () => {
    if (!newClaimForm.tokenAddress) return;
    setCreatingClaim(true);
    try {
      const res = await authFetch(`/api/admin/token-claims/${newClaimForm.tokenAddress}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...newClaimForm,
          isPaid: true,
          paidAt: new Date().toISOString(),
          paidBy: "admin",
          paymentTxSignature: `admin_manual_${Date.now()}`,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Token claim created" });
      setNewClaim(false);
      setNewClaimForm({ tokenAddress: "", tokenName: "", tokenSymbol: "", description: "", claimedByWallet: "", twitter: "", discord: "", website: "", github: "" });
      loadClaims();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setCreatingClaim(false); }
  };

  // ── Actions: ads ───────────────────────────────────────────────────────────
  const approveAd = async (id: number) => {
    try {
      const res = await authFetch(`/api/admin/ads/${id}`, { method: "PATCH", body: JSON.stringify({ status: "active" }) });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Ad approved" });
      loadAds();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
  };

  const rejectAd = async (id: number, note: string) => {
    try {
      const res = await authFetch(`/api/admin/ads/${id}`, { method: "PATCH", body: JSON.stringify({ status: "rejected", adminNote: note }) });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Ad rejected" });
      loadAds();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
  };

  const deleteAd = async (id: number) => {
    if (!confirm("Delete this ad permanently?")) return;
    try {
      const res = await authFetch(`/api/admin/ads/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Ad deleted" });
      loadAds();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
  };

  const saveAd = async () => {
    if (!editAd) return;
    setSavingAd(true);
    try {
      const res = await authFetch(`/api/admin/ads/${editAd.id}`, { method: "PATCH", body: JSON.stringify(editAdForm) });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Ad updated" });
      setEditAd(null);
      loadAds();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setSavingAd(false); }
  };

  // ── Actions: social ads ────────────────────────────────────────────────────
  const createSocialAd = async () => {
    if (!newSocialAdForm.title.trim() || !newSocialAdForm.linkUrl.trim()) {
      toast({ title: "Title and link URL are required", variant: "destructive" }); return;
    }
    setCreatingSocialAd(true);
    try {
      const res = await authFetch("/api/admin/social-ads", { method: "POST", body: JSON.stringify({ ...newSocialAdForm, active: true }) });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Social ad created" });
      setNewSocialAdForm({ title: "", imageUrl: "", linkUrl: "", callToAction: "", placement: "feed" });
      setShowNewSocialAdForm(false);
      loadSocialAds();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setCreatingSocialAd(false); }
  };

  const toggleSocialAd = async (id: number, active: boolean) => {
    try {
      const res = await authFetch(`/api/admin/social-ads/${id}`, { method: "PATCH", body: JSON.stringify({ active: !active }) });
      if (!res.ok) throw new Error((await res.json()).error);
      setSocialAds(prev => prev.map(a => a.id === id ? { ...a, active: !active } : a));
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
  };

  const deleteSocialAd = async (id: number) => {
    if (!confirm("Delete this sponsored ad?")) return;
    try {
      const res = await authFetch(`/api/admin/social-ads/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Ad deleted" });
      setSocialAds(prev => prev.filter(a => a.id !== id));
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
  };

  // ── Actions: settings ──────────────────────────────────────────────────────
  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await authFetch("/api/admin/settings", { method: "PATCH", body: JSON.stringify(settingsForm) });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Settings updated", description: "Changes apply immediately across the site." });
      loadSettings();
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setSavingSettings(false); }
  };

  // ── Render: not connected ─────────────────────────────────────────────────
  if (!wallet.connected) {
    return (
      <AppShell>
        <div className="flex-1 flex items-center justify-center pt-8">
          <div className="text-center max-w-sm mx-auto p-8">
            <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Admin Access</h1>
            <p className="text-muted-foreground text-sm mb-6">Connect your admin wallet to continue.</p>
            <Button onClick={() => wallet.connect()} className="gap-2">
              <Wallet className="w-4 h-4" /> Connect Wallet
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  // ── Render: wrong wallet ──────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <AppShell>
        <div className="flex-1 flex items-center justify-center pt-8">
          <div className="text-center max-w-sm mx-auto p-8">
            <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
            <p className="text-muted-foreground text-sm mb-2">Connected: <span className="font-mono text-xs">{wallet.publicKey}</span></p>
            <p className="text-muted-foreground text-sm">This page requires the admin wallet.</p>
          </div>
        </div>
      </AppShell>
    );
  }

  // ── Render: not authed yet ────────────────────────────────────────────────
  if (!token) {
    return (
      <AppShell>
        <div className="flex-1 flex items-center justify-center pt-8">
          <div className="text-center max-w-sm mx-auto p-8">
            <Shield className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Sign to Authenticate</h1>
            <p className="text-muted-foreground text-sm mb-2">Wallet: <span className="font-mono text-xs">{truncatePk(wallet.publicKey!)}</span></p>
            <p className="text-muted-foreground text-sm mb-6">Sign a message with your wallet to prove ownership. No transaction is sent.</p>
            <Button onClick={login} disabled={authing} className="gap-2 bg-yellow-500 hover:bg-yellow-400 text-black">
              {authing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              {authing ? "Waiting for signature…" : "Sign & Enter Admin"}
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  // ── Render: admin dashboard ────────────────────────────────────────────────
  const adStatusColor = (s: string) =>
    s === "active" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
    : s === "rejected" ? "bg-red-500/20 text-red-300 border-red-500/40"
    : "bg-yellow-500/20 text-yellow-300 border-yellow-500/40";

  return (
    <AppShell>
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 pt-4">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-yellow-400" />
            <div>
              <h1 className="text-xl font-bold font-display">Admin Dashboard</h1>
              <p className="text-xs text-muted-foreground">{truncatePk(wallet.publicKey!)}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={logout} className="gap-1.5 text-xs">
            <XCircle className="w-3.5 h-3.5" /> Sign out
          </Button>
        </div>

        <div className="flex gap-8 items-start">
          {/* Left nav — Docs-style sticky sidebar */}
          <aside className="hidden lg:block w-56 shrink-0 sticky top-24">
            <div className="glass-panel rounded-2xl p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 px-2">Admin menu</p>
              <nav className="flex flex-col gap-0.5">
                {ADMIN_NAV.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    data-testid={`tab-admin-${t.id}`}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors text-left ${
                      tab === t.id
                        ? "bg-primary/15 text-primary font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          {/* Mobile tab strip */}
          <div className="lg:hidden w-full mb-4 -mt-2">
            <div className="flex gap-1 overflow-x-auto pb-2">
              {ADMIN_NAV.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 ${
                    tab === t.id ? "bg-primary text-primary-foreground" : "border border-border/60 text-muted-foreground"
                  }`}
                >
                  {t.icon}{t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Right content */}
          <div className="flex-1 min-w-0 space-y-4">

        {/* ── TAB: CLAIMS ─────────────────────────────────────────────────── */}
        {tab === "claims" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                {claims.length} Paid Claims
              </h2>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={loadClaims} className="gap-1.5 text-xs">
                  <RefreshCw className="w-3 h-3" /> Refresh
                </Button>
                <Button size="sm" onClick={() => setNewClaim(true)} className="gap-1.5 text-xs">
                  + Manual Claim
                </Button>
              </div>
            </div>

            {loading && <div className="flex justify-center py-8"><Loader2 className="animate-spin w-6 h-6 text-muted-foreground" /></div>}

            <div className="space-y-2">
              {claims.map((c) => (
                <div key={c.tokenAddress} className={`bg-card border rounded-xl p-4 flex items-start gap-4 ${c.isRemoved ? "border-red-500/30 opacity-60" : "border-border/60"}`}>
                  {/* Logo */}
                  <div className="w-10 h-10 rounded-full border border-border/60 bg-muted flex-shrink-0 overflow-hidden">
                    {c.logoIpfsCid ? (
                      <img src={ipfsUrl(c.logoIpfsCid)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">
                        {(c.tokenSymbol || "?").slice(0, 2)}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">{c.tokenName || "Unknown"}</span>
                      <span className="text-muted-foreground text-xs">{c.tokenSymbol}</span>
                      {c.isRemoved && <Badge className="bg-red-500/20 text-red-300 border-red-500/40 text-[10px]">REMOVED: {c.removalReason}</Badge>}
                      {!c.isRemoved && c.isPaid && <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px]">PAID</Badge>}
                      {c.boostTier > 0 && <Badge className="text-[10px]">Boost T{c.boostTier}</Badge>}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground mt-0.5 truncate">{c.tokenAddress}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Claimed by: {c.claimedByWallet ? truncatePk(c.claimedByWallet) : "—"} · Paid: {c.paidAt ? new Date(c.paidAt).toLocaleDateString() : "—"}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1.5 flex-shrink-0">
                    <a href={`/dex/${c.tokenAddress}`} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="h-7 w-7 p-0"><ExternalLink className="w-3 h-3" /></Button>
                    </a>
                    <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-xs" onClick={() => { setEditClaim(c); setEditClaimForm({ ...c }); }}>
                      <Pencil className="w-3 h-3" /> Edit
                    </Button>
                    {!c.isRemoved && (
                      <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10"
                        onClick={() => { setRevokeClaim(c); setRevokeReason("rug_pull"); setRevokeNote(""); }}>
                        <Trash2 className="w-3 h-3" /> Revoke
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {!loading && claims.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">No paid token claims yet.</div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: ADS ────────────────────────────────────────────────────── */}
        {tab === "ads" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                {ads.length} Ads — {ads.filter(a => a.status === "pending").length} Pending
              </h2>
              <Button size="sm" variant="outline" onClick={loadAds} className="gap-1.5 text-xs">
                <RefreshCw className="w-3 h-3" /> Refresh
              </Button>
            </div>

            {loading && <div className="flex justify-center py-8"><Loader2 className="animate-spin w-6 h-6 text-muted-foreground" /></div>}

            <div className="space-y-2">
              {ads.map((ad) => (
                <div key={ad.id} className="bg-card border border-border/60 rounded-xl p-4 flex items-start gap-4">
                  {/* Thumbnail */}
                  <div className="w-20 h-12 rounded-lg border border-border/60 bg-muted flex-shrink-0 overflow-hidden">
                    <img src={ad.imageUrl} alt="" className="w-full h-full object-cover" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">{ad.label || "Untitled Ad"}</span>
                      <Badge className={`text-[10px] ${adStatusColor(ad.status)}`}>{ad.status}</Badge>
                      <Badge variant="outline" className="text-[10px]">{ad.slotType}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">{ad.linkUrl}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      By {truncatePk(ad.submitterWallet)} · {ad.impressions} impressions · Expires {new Date(ad.expiresAt).toLocaleDateString()}
                    </div>
                    {ad.adminNote && <div className="text-[10px] text-yellow-300 mt-0.5">Note: {ad.adminNote}</div>}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
                    <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-xs" onClick={() => { setEditAd(ad); setEditAdForm({ ...ad }); }}>
                      <Pencil className="w-3 h-3" /> Edit
                    </Button>
                    {ad.status === "pending" && (
                      <>
                        <Button size="sm" className="h-7 px-2 gap-1 text-xs bg-emerald-600 hover:bg-emerald-500" onClick={() => approveAd(ad.id)}>
                          <CheckCircle2 className="w-3 h-3" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10"
                          onClick={() => rejectAd(ad.id, "Does not meet guidelines")}>
                          <XCircle className="w-3 h-3" /> Reject
                        </Button>
                      </>
                    )}
                    {ad.status === "rejected" && (
                      <Button size="sm" className="h-7 px-2 gap-1 text-xs bg-emerald-600 hover:bg-emerald-500" onClick={() => approveAd(ad.id)}>
                        <CheckCircle2 className="w-3 h-3" /> Re-approve
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-red-400 border-red-500/30 hover:bg-red-500/10" onClick={() => deleteAd(ad.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
              {!loading && ads.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">No ads submitted yet.</div>
              )}
            </div>

            {/* ── Social Ad Spots ── */}
            <div className="border-t border-border/40 pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                  Social Feed Ads ({socialAds.length} total · {socialAds.filter(a => a.active).length} active)
                </h3>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={loadSocialAds} className="gap-1.5 text-xs">
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </Button>
                  <Button size="sm" onClick={() => setShowNewSocialAdForm(v => !v)} className="gap-1.5 text-xs">
                    + New Sponsored Ad
                  </Button>
                </div>
              </div>

              {showNewSocialAdForm && (
                <div className="bg-card border border-border/60 rounded-xl p-4 mb-4 space-y-3">
                  <h4 className="font-medium text-sm">New Sponsored Ad</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs text-muted-foreground mb-1 block">Title *</label>
                      <Input value={newSocialAdForm.title} onChange={e => setNewSocialAdForm(f => ({ ...f, title: e.target.value }))} placeholder="Ad headline" className="h-8 text-sm" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-muted-foreground mb-1 block">Link URL *</label>
                      <Input value={newSocialAdForm.linkUrl} onChange={e => setNewSocialAdForm(f => ({ ...f, linkUrl: e.target.value }))} placeholder="https://..." className="h-8 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Image URL</label>
                      <Input value={newSocialAdForm.imageUrl} onChange={e => setNewSocialAdForm(f => ({ ...f, imageUrl: e.target.value }))} placeholder="https://..." className="h-8 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Call to Action</label>
                      <Input value={newSocialAdForm.callToAction} onChange={e => setNewSocialAdForm(f => ({ ...f, callToAction: e.target.value }))} placeholder="Learn more →" className="h-8 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Placement</label>
                      <select value={newSocialAdForm.placement} onChange={e => setNewSocialAdForm(f => ({ ...f, placement: e.target.value }))} className="w-full h-8 text-sm bg-background border border-border rounded-md px-2">
                        <option value="feed">Social Feed (in-feed)</option>
                        <option value="leaderboard">Leaderboards page</option>
                        <option value="bounties">Bounties page</option>
                        <option value="vip">VIP Lounge page</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={() => setShowNewSocialAdForm(false)} className="h-7 text-xs">Cancel</Button>
                    <Button size="sm" onClick={createSocialAd} disabled={creatingSocialAd} className="h-7 text-xs">
                      {creatingSocialAd ? <Loader2 className="w-3 h-3 animate-spin" /> : "Create Ad"}
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {socialAds.map(ad => (
                  <div key={ad.id} className="bg-card border border-border/60 rounded-xl p-4 flex items-center gap-4">
                    {ad.imageUrl && (
                      <img src={ad.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{ad.title}</span>
                        <Badge className={`text-[10px] ${ad.active ? "bg-emerald-500/20 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                          {ad.active ? "Active" : "Paused"}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">{ad.placement ?? "feed"}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">{ad.linkUrl}</div>
                      {ad.callToAction && <div className="text-[10px] text-primary/70 mt-0.5">{ad.callToAction}</div>}
                      <div className="text-[10px] text-muted-foreground mt-0.5">{ad.impressions} impressions</div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => toggleSocialAd(ad.id, ad.active)}>
                        {ad.active ? "Pause" : "Activate"}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-red-400 border-red-500/30 hover:bg-red-500/10" onClick={() => deleteSocialAd(ad.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                {socialAds.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">No sponsored feed ads yet. Create one above.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: PRICING ─────────────────────────────────────────────────── */}
        {tab === "pricing" && (
          <div className="space-y-6 max-w-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Platform Pricing</h2>
              <Button size="sm" variant="outline" onClick={loadSettings} className="gap-1.5 text-xs">
                <RefreshCw className="w-3 h-3" /> Refresh
              </Button>
            </div>

            {loading && <div className="flex justify-center py-8"><Loader2 className="animate-spin w-6 h-6 text-muted-foreground" /></div>}

            {/* Claim fee */}
            <PriceSection title="Token Claim Fee">
              <PriceField label="Claim price (USD)" value={settingsForm.claimFeeUsd || ""} onChange={(v) => setSettingsForm(s => ({ ...s, claimFeeUsd: v }))} />
            </PriceSection>

            {/* Boosts */}
            <PriceSection title="Boost Tiers">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <div className="text-xs font-medium mb-2 text-orange-300">🔥 Tier 1 — Hot</div>
                  <PriceField label="Price (USD)" value={settingsForm.boost1PriceUsd || ""} onChange={(v) => setSettingsForm(s => ({ ...s, boost1PriceUsd: v }))} />
                  <PriceField label="Duration (hours)" value={settingsForm.boost1DurationHours || ""} onChange={(v) => setSettingsForm(s => ({ ...s, boost1DurationHours: v }))} />
                </div>
                <div>
                  <div className="text-xs font-medium mb-2 text-pink-300">📈 Tier 2 — Trending</div>
                  <PriceField label="Price (USD)" value={settingsForm.boost2PriceUsd || ""} onChange={(v) => setSettingsForm(s => ({ ...s, boost2PriceUsd: v }))} />
                  <PriceField label="Duration (hours)" value={settingsForm.boost2DurationHours || ""} onChange={(v) => setSettingsForm(s => ({ ...s, boost2DurationHours: v }))} />
                </div>
                <div>
                  <div className="text-xs font-medium mb-2 text-yellow-300">⭐ Tier 3 — Featured</div>
                  <PriceField label="Price (USD)" value={settingsForm.boost3PriceUsd || ""} onChange={(v) => setSettingsForm(s => ({ ...s, boost3PriceUsd: v }))} />
                  <PriceField label="Duration (hours)" value={settingsForm.boost3DurationHours || ""} onChange={(v) => setSettingsForm(s => ({ ...s, boost3DurationHours: v }))} />
                </div>
              </div>
            </PriceSection>

            {/* Ads */}
            <PriceSection title="Advertisement Slots">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { key: "Banner", priceKey: "adBannerPriceUsd", durKey: "adBannerDurationDays" },
                  { key: "Sidebar", priceKey: "adSidebarPriceUsd", durKey: "adSidebarDurationDays" },
                  { key: "Featured", priceKey: "adFeaturedPriceUsd", durKey: "adFeaturedDurationDays" },
                ].map((slot) => (
                  <div key={slot.key}>
                    <div className="text-xs font-medium mb-2 text-muted-foreground">{slot.key} Slot</div>
                    <PriceField label="Price (USD)" value={settingsForm[slot.priceKey] || ""} onChange={(v) => setSettingsForm(s => ({ ...s, [slot.priceKey]: v }))} />
                    <PriceField label="Duration (days)" value={settingsForm[slot.durKey] || ""} onChange={(v) => setSettingsForm(s => ({ ...s, [slot.durKey]: v }))} />
                  </div>
                ))}
              </div>
            </PriceSection>

            <Button onClick={saveSettings} disabled={savingSettings} className="gap-2">
              {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
              Save All Pricing
            </Button>
          </div>
        )}

        {/* ── TAB: SEO & Analytics ────────────────────────────────────────── */}
        {tab === "seo" && (
          <div className="space-y-6 max-w-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">SEO & Analytics</h2>
                <p className="text-xs text-muted-foreground mt-1">Updates apply instantly on the live site (title, meta, OG, GA).</p>
              </div>
              <Button size="sm" variant="outline" onClick={loadSettings} className="gap-1.5 text-xs">
                <RefreshCw className="w-3 h-3" /> Refresh
              </Button>
            </div>

            <div className="glass-panel rounded-2xl p-5 space-y-4">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-primary" /> Site meta
              </h3>
              <FormRow label="Site title">
                <Input
                  data-testid="input-seo-title"
                  value={settingsForm.seoTitle ?? SEO_DEFAULTS.seoTitle}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, seoTitle: e.target.value }))}
                  placeholder={SEO_DEFAULTS.seoTitle}
                />
              </FormRow>
              <FormRow label="Meta description">
                <Textarea
                  data-testid="input-seo-description"
                  value={settingsForm.seoDescription ?? SEO_DEFAULTS.seoDescription}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, seoDescription: e.target.value }))}
                  className="min-h-[80px] text-sm"
                />
              </FormRow>
              <FormRow label="Keywords (comma-separated)">
                <Input
                  data-testid="input-seo-keywords"
                  value={settingsForm.seoKeywords ?? SEO_DEFAULTS.seoKeywords}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, seoKeywords: e.target.value }))}
                />
              </FormRow>
              <FormRow label="OG image URL">
                <Input
                  data-testid="input-seo-og-image"
                  value={settingsForm.ogImageUrl ?? SEO_DEFAULTS.ogImageUrl}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, ogImageUrl: e.target.value }))}
                  placeholder="https://featherapp.fun/og_image.jpg"
                />
              </FormRow>
              {(settingsForm.ogImageUrl || SEO_DEFAULTS.ogImageUrl) && (
                <div className="rounded-xl border border-border/60 overflow-hidden bg-muted/30">
                  <img
                    src={settingsForm.ogImageUrl || SEO_DEFAULTS.ogImageUrl}
                    alt="OG preview"
                    className="w-full max-h-40 object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              )}
            </div>

            <div className="glass-panel rounded-2xl p-5 space-y-4">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <BarChart2 className="w-3.5 h-3.5 text-primary" /> Google Analytics
              </h3>
              <FormRow label="Measurement ID">
                <Input
                  data-testid="input-seo-ga"
                  value={settingsForm.gaMeasurementId ?? SEO_DEFAULTS.gaMeasurementId}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, gaMeasurementId: e.target.value.trim() }))}
                  placeholder="G-XXXXXXXXXX"
                  className="font-mono"
                />
              </FormRow>
              <p className="text-[11px] text-muted-foreground">
                Current live ID: <span className="font-mono text-foreground">{settingsForm.gaMeasurementId || SEO_DEFAULTS.gaMeasurementId}</span>
              </p>
            </div>

            <div className="glass-panel rounded-2xl p-5 space-y-4">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <DollarSign className="w-3.5 h-3.5 text-primary" /> $FEATHER token
              </h3>
              <p className="text-xs text-muted-foreground">
                Official contract on Robinhood Chain. Updates instantly on the hero, docs, and balance checks.
              </p>
              <FormRow label="Contract address (0x…)">
                <Input
                  data-testid="input-feather-token-address"
                  value={settingsForm.featherTokenAddress ?? ""}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, featherTokenAddress: e.target.value.trim() }))}
                  placeholder="0x…"
                  className="font-mono text-xs"
                />
              </FormRow>
            </div>

            <div className="glass-panel rounded-2xl p-5 space-y-4">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <DollarSign className="w-3.5 h-3.5 text-pink-400" /> Uniswap swap fee
              </h3>
              <p className="text-xs text-muted-foreground">
                Interface / convenience fee applied on swaps via the Feather Uniswap widget (basis points, max 100 = 1%).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormRow label="Fee recipient wallet">
                  <Input
                    data-testid="input-swap-fee-recipient"
                    value={settingsForm.swapFeeRecipient ?? ADMIN_WALLET}
                    onChange={(e) => setSettingsForm((s) => ({ ...s, swapFeeRecipient: e.target.value.trim() }))}
                    className="font-mono text-xs"
                  />
                </FormRow>
                <FormRow label="Fee (bps)">
                  <Input
                    data-testid="input-swap-fee-bps"
                    type="number"
                    min={0}
                    max={100}
                    value={settingsForm.swapFeeBps ?? "25"}
                    onChange={(e) => setSettingsForm((s) => ({ ...s, swapFeeBps: e.target.value }))}
                  />
                </FormRow>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-5 space-y-2">
              <h3 className="font-semibold text-sm">Live preview</h3>
              <p className="text-base font-bold font-display">{settingsForm.seoTitle || SEO_DEFAULTS.seoTitle}</p>
              <p className="text-sm text-muted-foreground">{settingsForm.seoDescription || SEO_DEFAULTS.seoDescription}</p>
              <p className="text-[11px] text-muted-foreground font-mono">{settingsForm.seoKeywords || SEO_DEFAULTS.seoKeywords}</p>
            </div>

            <Button onClick={saveSettings} disabled={savingSettings} className="gap-2" data-testid="button-save-seo">
              {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Save SEO &amp; swap fee settings
            </Button>
          </div>
        )}

        {/* ── TAB: MODERATION ─────────────────────────────────────────────── */}
        {tab === "moderation" && (
          <div className="space-y-6 max-w-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Moderation Settings</h2>
              <Button size="sm" variant="outline" onClick={loadModSettings} className="gap-1.5 text-xs">
                <RefreshCw className="w-3 h-3" /> Refresh
              </Button>
            </div>

            {loading && <div className="flex justify-center py-8"><Loader2 className="animate-spin w-6 h-6 text-muted-foreground" /></div>}

            {!loading && (
              <div className="space-y-4">
                <div className="bg-card border border-border/60 rounded-xl p-5 space-y-4">
                  <h3 className="font-semibold text-sm">$FEATHER Requirements</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormRow label="Min $FEATHER to post">
                      <Input data-testid="input-min-feather" type="number" min="0" value={modForm.minTrenchyToPost} onChange={(e) => setModForm((f) => ({ ...f, minTrenchyToPost: e.target.value }))} className="h-8 text-sm" />
                    </FormRow>
                    <FormRow label="Min $FEATHER to claim username">
                      <Input data-testid="input-min-feather-username" type="number" min="0" value={modForm.minTrenchyToUsername} onChange={(e) => setModForm((f) => ({ ...f, minTrenchyToUsername: e.target.value }))} className="h-8 text-sm" />
                    </FormRow>
                    <FormRow label="Feed priority threshold">
                      <Input data-testid="input-boost-threshold" type="number" min="0" value={modForm.trenchyBoostThreshold} onChange={(e) => setModForm((f) => ({ ...f, trenchyBoostThreshold: e.target.value }))} className="h-8 text-sm" />
                    </FormRow>
                    <FormRow label="Min market cap (USD)">
                      <Input data-testid="input-min-mcap" type="number" min="0" value={modForm.minMcapUsd} onChange={(e) => setModForm((f) => ({ ...f, minMcapUsd: e.target.value }))} className="h-8 text-sm" />
                    </FormRow>
                    <FormRow label="Min 24h volume (USD)">
                      <Input data-testid="input-min-volume" type="number" min="0" value={modForm.minVolume24hUsd} onChange={(e) => setModForm((f) => ({ ...f, minVolume24hUsd: e.target.value }))} className="h-8 text-sm" />
                    </FormRow>
                  </div>
                </div>

                <div className="bg-card border border-primary/20 rounded-xl p-5 space-y-4">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-primary" />
                    Feather AI Access
                  </h3>
                  <p className="text-xs text-muted-foreground">Control who can access Feather AI. Admin wallet always bypasses these limits.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormRow label="Min $FEATHER to access AI">
                      <Input data-testid="input-min-feather-ai" type="number" min="0" value={modForm.minTrenchyToAI} onChange={(e) => setModForm((f) => ({ ...f, minTrenchyToAI: e.target.value }))} className="h-8 text-sm" />
                    </FormRow>
                    <FormRow label="Max AI prompts per user per day">
                      <Input data-testid="input-ai-daily-limit" type="number" min="1" max="100" value={modForm.aiDailyLimit} onChange={(e) => setModForm((f) => ({ ...f, aiDailyLimit: e.target.value }))} className="h-8 text-sm" />
                    </FormRow>
                  </div>
                </div>

                <div className="bg-card border border-amber-500/20 rounded-xl p-5 space-y-4">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                    Market Signal Access
                  </h3>
                  <p className="text-xs text-muted-foreground">Minimum $FEATHER balance required to view the Market Signal and historical chart. Admin wallet always has full access.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormRow label="Min $FEATHER to access Market Signal">
                      <Input data-testid="input-min-feather-market" type="number" min="0" value={modForm.minTrenchyToMarket} onChange={(e) => setModForm((f) => ({ ...f, minTrenchyToMarket: e.target.value }))} className="h-8 text-sm" />
                    </FormRow>
                  </div>
                </div>

                <div className="bg-card border border-green-500/20 rounded-xl p-5 space-y-4">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Rocket className="w-3.5 h-3.5 text-green-400" />
                    Uniswap Launcher Access
                  </h3>
                  <p className="text-xs text-muted-foreground">Minimum $FEATHER balance required to use the Uniswap token launcher. Admin wallet always has full access.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormRow label="Min $FEATHER to launch on Uniswap">
                      <Input data-testid="input-min-feather-bags-launch" type="number" min="0" value={modForm.minTrenchyToBagsLaunch} onChange={(e) => setModForm((f) => ({ ...f, minTrenchyToBagsLaunch: e.target.value }))} className="h-8 text-sm" />
                    </FormRow>
                  </div>
                </div>

                <div className="bg-card border border-blue-500/20 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-sm flex items-center gap-2">
                        <Lock className="w-3.5 h-3.5 text-blue-400" />
                        Token Gating
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">When disabled, any wallet can access gated features regardless of $FEATHER balance.</p>
                    </div>
                    <button
                      data-testid="toggle-token-gating"
                      onClick={() => setModForm((f) => ({ ...f, tokenGatingEnabled: !f.tokenGatingEnabled }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${modForm.tokenGatingEnabled ? "bg-blue-500" : "bg-muted"}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${modForm.tokenGatingEnabled ? "translate-x-6" : "translate-x-1"}`}
                      />
                    </button>
                  </div>
                  <div className={`text-xs font-semibold px-2.5 py-1 rounded-full w-fit ${modForm.tokenGatingEnabled ? "bg-blue-500/20 text-blue-300" : "bg-amber-500/20 text-amber-300"}`}>
                    {modForm.tokenGatingEnabled ? "Gating ON — balance checks enforced" : "Gating OFF — open access to all features"}
                  </div>
                </div>

                <div className="bg-card border border-border/60 rounded-xl p-5 space-y-4">
                  <h3 className="font-semibold text-sm">Blacklists</h3>
                  <FormRow label="Blacklisted words (comma-separated)">
                    <Textarea data-testid="input-blacklisted-words" value={modForm.blacklistedWords} onChange={(e) => setModForm((f) => ({ ...f, blacklistedWords: e.target.value }))} rows={3} placeholder="spam, scam, rug, ..." className="text-sm" />
                  </FormRow>
                  <FormRow label="Blacklisted domains (comma-separated)">
                    <Textarea data-testid="input-blacklisted-domains" value={modForm.blacklistedDomains} onChange={(e) => setModForm((f) => ({ ...f, blacklistedDomains: e.target.value }))} rows={3} placeholder="spamsite.com, phishing.io, ..." className="text-sm" />
                  </FormRow>
                </div>

                <Button data-testid="button-save-moderation" onClick={saveModSettings} disabled={savingMod} className="gap-2">
                  {savingMod ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                  Save Moderation Settings
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: REPORTS ────────────────────────────────────────────────── */}
        {tab === "reports" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">User Reports</h2>
              <div className="flex gap-2 items-center flex-wrap">
                <select
                  data-testid="select-report-filter"
                  value={reportFilter}
                  onChange={(e) => setReportFilter(e.target.value)}
                  className="rounded-lg bg-background border border-border/60 px-3 py-1.5 text-xs"
                >
                  <option value="pending">Pending</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="actioned">Actioned</option>
                  <option value="dismissed">Dismissed</option>
                  <option value="all">All</option>
                </select>
                <Button size="sm" variant="outline" onClick={loadReports} className="gap-1.5 text-xs">
                  <RefreshCw className="w-3 h-3" /> Refresh
                </Button>
              </div>
            </div>

            {loading && <div className="flex justify-center py-8"><Loader2 className="animate-spin w-6 h-6 text-muted-foreground" /></div>}

            {!loading && reports.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <Flag className="w-8 h-8 mx-auto mb-2 opacity-20" />
                No {reportFilter === "all" ? "" : reportFilter} reports
              </div>
            )}

            <div className="space-y-2">
              {reports.map((r) => (
                <div key={r.id} data-testid={`row-report-${r.id}`} className="bg-card border border-border/60 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge className={`text-[10px] ${r.status === "pending" ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/40" : r.status === "actioned" ? "bg-red-500/20 text-red-300 border-red-500/40" : "bg-muted text-muted-foreground"}`}>{r.status.toUpperCase()}</Badge>
                    <span className="text-xs text-muted-foreground font-mono">{r.reportedType} #{r.reportedId}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}</span>
                  </div>
                  <p className="text-sm"><span className="text-muted-foreground text-xs">Reason: </span>{r.reason}</p>
                  <p className="text-xs text-muted-foreground font-mono">Reporter: {truncatePk(r.reporterWallet)}</p>
                  <div className="flex gap-2 pt-1 flex-wrap">
                    {["reviewed", "actioned", "dismissed"].filter((s) => s !== r.status).map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant="outline"
                        disabled={updatingReport === r.id}
                        onClick={() => updateReport(r.id, s)}
                        data-testid={`button-report-${s}-${r.id}`}
                        className={`text-xs gap-1 ${s === "actioned" ? "border-red-500/30 text-red-400 hover:bg-red-500/10" : s === "dismissed" ? "text-muted-foreground" : ""}`}
                      >
                        {updatingReport === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        Mark {s}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB: SECURITY ───────────────────────────────────────────────── */}
        {tab === "security" && (
          <div className="space-y-6" data-testid="panel-security">
            <div>
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-4">Security Checklist</h2>
              <p className="text-xs text-muted-foreground mb-5">Live status of security controls active in the Feather App backend and frontend.</p>
            </div>

            {([
              {
                category: "XSS (Cross-Site Scripting)",
                items: [
                  { label: "React JSX auto-escapes all text content", status: "pass" },
                  { label: "server-side sanitize() strips all HTML tags before DB insert", status: "pass" },
                  { label: "DOMPurify installed on frontend for future dangerouslySetInnerHTML usage", status: "pass" },
                  { label: "Content-Security-Policy header (helmet enabled, CSP relaxed for Vite dev)", status: "warn", note: "CSP is disabled — set in production" },
                ],
              },
              {
                category: "CSRF (Cross-Site Request Forgery)",
                items: [
                  { label: "Auth uses Bearer JWT in Authorization header (not cookies)", status: "pass", note: "Header-based auth is inherently CSRF-safe" },
                  { label: "No session cookies used for API authentication", status: "pass" },
                  { label: "SameSite=Strict would be needed if cookie auth is added in future", status: "info" },
                ],
              },
              {
                category: "SQL Injection",
                items: [
                  { label: "All DB access via Drizzle ORM — no raw SQL strings", status: "pass" },
                  { label: "Parameterised queries enforced by Drizzle query builder", status: "pass" },
                  { label: "No user input concatenated into query strings", status: "pass" },
                ],
              },
              {
                category: "Rate Limiting",
                items: [
                  { label: "API read rate limit: 300 GET req / 15 min per IP (express-rate-limit)", status: "pass" },
                  { label: "API write rate limit: 120 POST/PATCH/DELETE req / 15 min per IP", status: "pass" },
                  { label: "IPFS upload rate limit: 10 uploads / 60 sec per IP", status: "pass" },
                  { label: "Per-user social rate limits: 5 posts/min, 10 comments/min, 3 bounties/min, 10 DMs/min", status: "pass" },
                  { label: "Auth rate limit: 3 profile creates per minute per wallet", status: "pass" },
                ],
              },
              {
                category: "Input Validation",
                items: [
                  { label: "Zod schema validation on DM POST (toWallet regex + content length)", status: "pass" },
                  { label: "Zod schema validation on bounty POST (content length)", status: "pass" },
                  { label: "Zod schema validation on IPFS upload (type enum + imageBase64 min-length)", status: "pass" },
                  { label: "Content max-length enforced server-side (posts 500, comments 280, DMs 500, bio 160)", status: "pass" },
                  { label: "Username whitelist regex: [a-z0-9_] only", status: "pass" },
                  { label: "URL fields validated — javascript: and non-http URIs rejected", status: "pass" },
                ],
              },
              {
                category: "Auto-Moderation",
                items: [
                  { label: "Blacklisted words checked on all post/comment/DM/bounty inserts", status: "pass" },
                  { label: "Blacklisted domains blocked in content", status: "pass" },
                  { label: "Minimum $FEATHER balance enforced for posting, DMs, VIP access", status: "pass" },
                ],
              },
              {
                category: "Auth & Access Control",
                items: [
                  { label: "JWT signed with SESSION_SECRET (env var)", status: "pass" },
                  { label: "Admin routes protected by wallet address check + admin JWT", status: "pass" },
                  { label: "Social routes protected by requireSocialAuth (separate JWT secret)", status: "pass" },
                  { label: "Wallet signature (ed25519) verified on social auth challenge", status: "pass" },
                  { label: "TOTP 2FA available for social profiles", status: "pass" },
                ],
              },
              {
                category: "Headers & Transport",
                items: [
                  { label: "Helmet.js security headers enabled (X-Frame-Options, X-XSS-Protection, etc.)", status: "pass" },
                  { label: "No internal error details leaked to callers (500 → safe message)", status: "pass" },
                  { label: "HTTPS enforced in production via VPS + Hostinger SSL", status: "info", note: "Managed outside this codebase" },
                ],
              },
            ] as { category: string; items: { label: string; status: "pass" | "warn" | "fail" | "info"; note?: string }[] }[]).map((section) => (
              <div key={section.category} className="bg-card border border-border/60 rounded-xl p-4 space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  {section.category}
                </h3>
                <div className="space-y-2">
                  {section.items.map((item, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      {item.status === "pass" && <CheckCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
                      {item.status === "warn" && <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
                      {item.status === "fail" && <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}
                      {item.status === "info" && <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />}
                      <div>
                        <p className={`text-xs ${item.status === "fail" ? "text-red-300" : item.status === "warn" ? "text-amber-200" : "text-foreground/90"}`}>
                          {item.label}
                        </p>
                        {item.note && <p className="text-[10px] text-muted-foreground mt-0.5">{item.note}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Backfill: make all existing users follow admin */}
            <div className="bg-card border border-border/60 rounded-xl p-4">
              <h3 className="font-semibold text-sm flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-primary" />
                Community Actions
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                One-time utility to make all existing users auto-follow the admin Feather profile.
                New signups follow automatically — this backfills pre-existing accounts.
              </p>
              <BackfillFollowButton token={token} />
            </div>
          </div>
        )}

        {/* ── TAB: SOCIAL ──────────────────────────────────────────────────── */}
        {tab === "social" && (
          <div className="space-y-6" data-testid="panel-social">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Social Community Overview</h2>
              <Button size="sm" variant="outline" onClick={loadSocialData} className="gap-1.5 text-xs">
                <RefreshCw className="w-3 h-3" /> Refresh
              </Button>
            </div>

            {loading && <div className="flex justify-center py-8"><Loader2 className="animate-spin w-6 h-6 text-muted-foreground" /></div>}

            {/* ── Stats grid ─────────────────────────────────────────────── */}
            {socialStats && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {([
                    { label: "Profiles", value: socialStats.totalProfiles, icon: <Users className="w-4 h-4" />, color: "text-blue-400" },
                    { label: "Posts", value: socialStats.totalPosts, icon: <BarChart2 className="w-4 h-4" />, color: "text-green-400" },
                    { label: "Comments", value: socialStats.totalComments, icon: <BarChart2 className="w-4 h-4" />, color: "text-violet-400" },
                    { label: "Follows", value: socialStats.totalFollows, icon: <TrendingUp className="w-4 h-4" />, color: "text-amber-400" },
                    { label: "DMs Sent", value: socialStats.totalDMs, icon: <BarChart2 className="w-4 h-4" />, color: "text-cyan-400" },
                    { label: "Reports Total", value: socialStats.totalReports, icon: <Flag className="w-4 h-4" />, color: "text-orange-400" },
                    { label: "Pending Reports", value: socialStats.pendingReports, icon: <AlertTriangle className="w-4 h-4" />, color: socialStats.pendingReports > 0 ? "text-red-400" : "text-green-400" },
                    { label: "Active (7d)", value: socialStats.activeProfiles7d, icon: <Users className="w-4 h-4" />, color: "text-emerald-400" },
                    { label: "Active (30d)", value: socialStats.activeProfiles30d, icon: <Users className="w-4 h-4" />, color: "text-teal-400" },
                  ]).map((stat) => (
                    <div key={stat.label} className="bg-card border border-border/60 rounded-xl p-4">
                      <div className={`${stat.color} mb-1`}>{stat.icon}</div>
                      <div className="text-2xl font-bold">{stat.value.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
                    </div>
                  ))}
                </div>

                {/* ── Top posters ──────────────────────────────────────── */}
                {socialStats.topPosters.length > 0 && (
                  <div className="bg-card border border-border/60 rounded-xl p-4">
                    <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary" /> Top Posters
                    </h3>
                    <div className="space-y-2">
                      {socialStats.topPosters.map((p, i) => (
                        <div key={p.walletAddress} className="flex items-center gap-3 text-sm">
                          <span className="w-5 text-muted-foreground text-xs font-mono">#{i + 1}</span>
                          <span className="font-medium flex-1 truncate">
                            {p.username ? `@${p.username}` : truncatePk(p.walletAddress)}
                          </span>
                          <Badge variant="secondary" className="text-xs">{p.postCount} posts</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Blocked Usernames ──────────────────────────────────────── */}
            <div className="bg-card border border-border/60 rounded-xl p-5">
              <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
                <Ban className="w-4 h-4 text-red-400" /> Blocked Usernames
              </h3>
              <p className="text-xs text-muted-foreground mb-4">Prevent impersonation — these usernames cannot be registered by anyone.</p>

              {/* Add form */}
              <div className="flex gap-2 mb-4 flex-wrap">
                <Input
                  data-testid="input-blocked-username"
                  value={newBlockedUsername}
                  onChange={(e) => setNewBlockedUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 15).toLowerCase())}
                  placeholder="username"
                  className="h-8 text-sm w-40 font-mono"
                />
                <Input
                  data-testid="input-blocked-reason"
                  value={newBlockedReason}
                  onChange={(e) => setNewBlockedReason(e.target.value.slice(0, 80))}
                  placeholder="Reason (optional)"
                  className="h-8 text-sm flex-1 min-w-32"
                />
                <Button
                  data-testid="button-add-blocked-username"
                  size="sm"
                  disabled={!newBlockedUsername || addingBlocked}
                  onClick={async () => {
                    setAddingBlocked(true);
                    try {
                      const res = await authFetch("/api/admin/blocked-usernames", {
                        method: "POST",
                        body: JSON.stringify({ username: newBlockedUsername, reason: newBlockedReason || undefined }),
                      });
                      if (!res.ok) throw new Error((await res.json()).error);
                      setNewBlockedUsername("");
                      setNewBlockedReason("");
                      toast({ title: `@${newBlockedUsername} blocked` });
                      loadSocialData();
                    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
                    finally { setAddingBlocked(false); }
                  }}
                  className="gap-1.5"
                >
                  {addingBlocked ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                  Block
                </Button>
              </div>

              {/* Blocked list */}
              {blockedUsernames.length === 0 ? (
                <p className="text-xs text-muted-foreground">No usernames blocked yet.</p>
              ) : (
                <div className="space-y-2">
                  {blockedUsernames.map((b) => (
                    <div key={b.id} data-testid={`row-blocked-${b.username}`} className="flex items-center gap-3 py-2 border-t border-border/40">
                      <span className="font-mono text-sm font-semibold flex-1">@{b.username}</span>
                      {b.reason && <span className="text-xs text-muted-foreground truncate max-w-48">{b.reason}</span>}
                      <button
                        data-testid={`button-unblock-${b.username}`}
                        onClick={async () => {
                          const res = await authFetch(`/api/admin/blocked-usernames/${b.username}`, { method: "DELETE" });
                          if (res.ok) { toast({ title: `@${b.username} unblocked` }); loadSocialData(); }
                        }}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        title="Unblock"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: POINTS ─────────────────────────────────────────────────── */}
        {tab === "points" && (
          <div className="space-y-6" data-testid="panel-points">

            {/* ── Points Configuration ─────────────────────────────────── */}
            <div className="bg-card border border-border/60 rounded-xl p-5 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">Points Configuration</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Changes take effect immediately for all new point events.</p>
                </div>
                <Button
                  size="sm"
                  onClick={savePointsConfig}
                  disabled={savingPointsConfig}
                  className="gap-1.5 text-xs"
                  data-testid="button-save-points-config"
                >
                  {savingPointsConfig ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
                  Save Changes
                </Button>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-3">Points Per Action</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {([
                    { key: "pointsLikeReceived",    label: "Like received" },
                    { key: "pointsCommentMade",      label: "Comment made" },
                    { key: "pointsCommentReceived",  label: "Comment received" },
                    { key: "pointsReplyMade",        label: "Reply made" },
                    { key: "pointsReplyReceived",    label: "Reply received" },
                    { key: "pointsReferral",         label: "Referral bonus" },
                  ] as { key: string; label: string }[]).map(({ key, label }) => (
                    <div key={key}>
                      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={pointsConfigForm[key] ?? ""}
                        onChange={(e) => setPointsConfigForm(f => ({ ...f, [key]: e.target.value }))}
                        className="h-8 text-sm"
                        data-testid={`input-${key}`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-3">Limits &amp; Eligibility</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Daily Cap (points)</label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={pointsConfigForm.pointsDailyCap ?? ""}
                      onChange={(e) => setPointsConfigForm(f => ({ ...f, pointsDailyCap: e.target.value }))}
                      className="h-8 text-sm"
                      data-testid="input-pointsDailyCap"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Min $FEATHER to Earn</label>
                    <Input
                      type="number"
                      min="0"
                      step="10000"
                      value={pointsConfigForm.pointsMinTrenchy ?? ""}
                      onChange={(e) => setPointsConfigForm(f => ({ ...f, pointsMinTrenchy: e.target.value }))}
                      className="h-8 text-sm"
                      data-testid="input-pointsMinTrenchy"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Leaderboard ──────────────────────────────────────────── */}
            <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Points Leaderboard</h2>
              <Button size="sm" variant="outline" onClick={loadPoints} className="gap-1.5 text-xs">
                <RefreshCw className="w-3 h-3" /> Refresh
              </Button>
            </div>

            {loading && <div className="flex justify-center py-8"><Loader2 className="animate-spin w-6 h-6 text-muted-foreground" /></div>}

            {!loading && pointsOverview.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">No point events recorded yet.</div>
            )}

            <div className="space-y-2">
              {pointsOverview.map((row, i) => {
                const isExpanded = expandedWallet === row.walletAddress;
                const events = walletEvents[row.walletAddress] ?? [];
                return (
                  <div key={row.walletAddress} className="bg-card border border-border/60 rounded-xl overflow-hidden">
                    <button
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                      onClick={async () => {
                        if (isExpanded) { setExpandedWallet(null); return; }
                        setExpandedWallet(row.walletAddress);
                        if (!walletEvents[row.walletAddress]) await loadWalletEvents(row.walletAddress);
                      }}
                    >
                      <span className="text-xs text-muted-foreground w-6 shrink-0">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {row.username ? `@${row.username}` : row.walletAddress.slice(0, 8) + "…"}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">{row.walletAddress.slice(0, 12)}…</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-primary">{row.totalPoints.toLocaleString()} pts</div>
                        <div className="text-[10px] text-muted-foreground">{row.eventCount} events</div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border/40 px-4 py-3 space-y-2 bg-muted/20">
                        {events.length === 0 && <p className="text-xs text-muted-foreground">No events.</p>}
                        {events.map((ev) => (
                          <div
                            key={ev.id}
                            data-testid={`point-event-${ev.id}`}
                            className={`flex items-center gap-3 text-xs rounded-lg px-3 py-2 ${ev.voidedAt ? "opacity-40 line-through bg-muted/30" : "bg-card border border-border/40"}`}
                          >
                            <span className="font-mono text-muted-foreground w-8 shrink-0">#{ev.id}</span>
                            <span className="flex-1 truncate">{ev.eventType}</span>
                            <span className={`font-semibold ${ev.voidedAt ? "text-muted-foreground" : "text-primary"}`}>
                              {ev.voidedAt ? "0" : `+${ev.points}`} pts
                            </span>
                            {ev.voidedAt ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={voidingId === ev.id}
                                onClick={() => restoreEvent(ev.id, row.walletAddress)}
                                className="text-[10px] h-6 px-2 gap-1"
                                data-testid={`button-restore-event-${ev.id}`}
                              >
                                {voidingId === ev.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Restore"}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={voidingId === ev.id}
                                onClick={() => voidEvent(ev.id, row.walletAddress)}
                                className="text-[10px] h-6 px-2 gap-1"
                                data-testid={`button-void-event-${ev.id}`}
                              >
                                {voidingId === ev.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Void"}
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </div>{/* end leaderboard space-y-4 */}
          </div>
        )}

        {/* ── TAB: PAYOUTS ─────────────────────────────────────────────────── */}
        {tab === "payouts" && (
          <div className="space-y-6">

            {/* Distribute form */}
            <div className="glass-panel rounded-2xl p-6 space-y-4">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Coins className="w-4 h-4 text-primary" /> Distribute ETH Payout
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Epoch Start</label>
                  <Input type="datetime-local" value={payoutEpochStart} onChange={(e) => setPayoutEpochStart(e.target.value)} data-testid="input-payout-epoch-start" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Epoch End</label>
                  <Input type="datetime-local" value={payoutEpochEnd} onChange={(e) => setPayoutEpochEnd(e.target.value)} data-testid="input-payout-epoch-end" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">ETH Amount to Distribute</label>
                  <Input placeholder="e.g. 1.5" value={payoutSolAmount} onChange={(e) => setPayoutSolAmount(e.target.value)} data-testid="input-payout-sol" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Notes (optional)</label>
                  <Input placeholder="Week 1 payout" value={payoutNotes} onChange={(e) => setPayoutNotes(e.target.value)} data-testid="input-payout-notes" />
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={loadEpochPreview} disabled={previewLoading} data-testid="button-payout-preview">
                  {previewLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
                  Preview Epoch
                </Button>
                <Button size="sm" onClick={distributePayouts} disabled={distributing} data-testid="button-payout-distribute" className="bg-primary text-primary-foreground">
                  {distributing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Coins className="w-3 h-3 mr-1" />}
                  {distributing ? "Distributing…" : "Distribute Now"}
                </Button>
              </div>

              {/* Epoch preview */}
              {epochPreview && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                    Preview — {epochPreview.rows.length} earners · {epochPreview.totalPoints.toLocaleString()} total pts
                  </p>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-border text-muted-foreground">
                        <th className="px-3 py-2 text-left">Wallet</th>
                        <th className="px-3 py-2 text-right">Points</th>
                        <th className="px-3 py-2 text-right">Share %</th>
                        {payoutSolAmount && <th className="px-3 py-2 text-right">ETH</th>}
                      </tr></thead>
                      <tbody>
                        {epochPreview.rows.map((r) => {
                          const share = epochPreview.totalPoints > 0 ? (r.points / epochPreview.totalPoints * 100) : 0;
                          const sol = parseFloat(payoutSolAmount) > 0 ? (share / 100 * parseFloat(payoutSolAmount)) : 0;
                          return (
                            <tr key={r.walletAddress} className="border-b border-border last:border-0 hover:bg-muted">
                              <td className="px-3 py-2 font-mono">{r.walletAddress.slice(0,4)}…{r.walletAddress.slice(-4)}</td>
                              <td className="px-3 py-2 text-right">{r.points.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right">{share.toFixed(2)}%</td>
                              {payoutSolAmount && <td className="px-3 py-2 text-right text-primary">{sol.toFixed(6)}</td>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Payout history */}
            <div className="space-y-3">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Payout History</h2>
              {loading && <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}
              {!loading && allPayouts.length === 0 && <p className="text-sm text-muted-foreground">No payouts yet.</p>}
              {allPayouts.map((payout) => (
                <div key={payout.id} className="glass-panel rounded-xl overflow-hidden" data-testid={`payout-record-${payout.id}`}>
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted transition-colors"
                    onClick={() => setExpandedPayout(expandedPayout === payout.id ? null : payout.id)}
                    data-testid={`button-expand-payout-${payout.id}`}
                  >
                    <div className="flex items-center gap-3 text-sm">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${payout.status === "completed" ? "bg-green-400" : payout.status === "processing" ? "bg-yellow-400 animate-pulse" : "bg-red-400"}`} />
                      <span className="font-semibold">Payout #{payout.id}</span>
                      <span className="text-muted-foreground text-xs">{new Date(payout.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{(payout.totalSolLamports / 1e9).toFixed(4)} ETH</span>
                      <span>{payout.recipientCount} recipients</span>
                      <span>{payout.totalPoints.toLocaleString()} pts</span>
                      {expandedPayout === payout.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </div>
                  </button>
                  {expandedPayout === payout.id && (
                    <div className="px-4 pb-4 space-y-3 border-t border-border">
                      <div className="flex gap-4 text-xs text-muted-foreground pt-3 flex-wrap">
                        <span>Epoch: {new Date(payout.epochStart).toLocaleDateString()} – {new Date(payout.epochEnd).toLocaleDateString()}</span>
                        <span>Initiated by: {payout.initiatedBy.slice(0,4)}…{payout.initiatedBy.slice(-4)}</span>
                        {payout.notes && <span>Notes: {payout.notes}</span>}
                        {payout.completedAt && <span>Completed: {new Date(payout.completedAt).toLocaleString()}</span>}
                      </div>
                      <div className="rounded-xl border border-border overflow-hidden">
                        <table className="w-full text-xs">
                          <thead><tr className="border-b border-border text-muted-foreground">
                            <th className="px-3 py-2 text-left">Wallet</th>
                            <th className="px-3 py-2 text-right">Points</th>
                            <th className="px-3 py-2 text-right">Share</th>
                            <th className="px-3 py-2 text-right">ETH</th>
                            <th className="px-3 py-2 text-right">Status</th>
                            <th className="px-3 py-2 text-right">TX</th>
                          </tr></thead>
                          <tbody>
                            {payout.recipients.map((r) => (
                              <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted" data-testid={`payout-recipient-${r.id}`}>
                                <td className="px-3 py-2 font-mono">{r.walletAddress.slice(0,4)}…{r.walletAddress.slice(-4)}</td>
                                <td className="px-3 py-2 text-right">{r.epochPoints.toLocaleString()}</td>
                                <td className="px-3 py-2 text-right">{r.sharePercent}%</td>
                                <td className="px-3 py-2 text-right text-primary">{(r.solLamports / 1e9).toFixed(6)}</td>
                                <td className="px-3 py-2 text-right">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${r.status === "sent" ? "bg-green-500/20 text-green-400" : r.status === "pending" ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"}`}>{r.status}</span>
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {r.txSignature ? (
                                    <a href={`https://blockscout.io/tx/${r.txSignature}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono" data-testid={`link-payout-tx-${r.id}`}>
                                      {r.txSignature.slice(0,6)}…
                                    </a>
                                  ) : r.errorMessage ? (
                                    <span className="text-red-400 text-[10px]">{r.errorMessage.slice(0, 30)}</span>
                                  ) : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

          </div>
        )}

        {/* ── TAB: AI AGENTS ────────────────────────────────────────────────── */}
        {tab === "agents" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Zap className="w-4 h-4 text-violet-400" /> Registered AI Agents ({agents.length})
              </h2>
              <Button size="sm" variant="outline" onClick={loadAgents} className="gap-1.5 text-xs" data-testid="button-refresh-agents">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading agents…
              </div>
            ) : agents.length === 0 ? (
              <div className="glass-panel rounded-xl p-8 text-center text-muted-foreground text-sm">
                No AI agents registered yet.
              </div>
            ) : (
              <div className="space-y-2">
                {agents.map((agent) => (
                  <div key={agent.walletAddress} className="glass-panel rounded-xl overflow-hidden" data-testid={`card-agent-${agent.walletAddress}`}>
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted transition-colors"
                      onClick={() => {
                        if (expandedAgent === agent.walletAddress) {
                          setExpandedAgent(null);
                        } else {
                          setExpandedAgent(agent.walletAddress);
                          loadAgentKeys(agent.walletAddress);
                        }
                      }}
                    >
                      <div className="w-8 h-8 rounded-full bg-violet-500/10 border border-violet-500/30 flex items-center justify-center shrink-0">
                        <Zap className="w-3.5 h-3.5 text-violet-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{agent.agentLabel ?? "Unnamed Agent"}</span>
                          {agent.username && <span className="text-xs text-muted-foreground">@{agent.username}</span>}
                          <span className="text-[10px] bg-violet-500/10 text-violet-300 px-1.5 py-0.5 rounded-full font-semibold border border-violet-500/30">{agent.keyCount} key{agent.keyCount !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] font-mono text-muted-foreground">{truncatePk(agent.walletAddress)}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(agent.walletAddress); setCopiedAgent(agent.walletAddress); setTimeout(() => setCopiedAgent(null), 2000); }}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {copiedAgent === agent.walletAddress ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <a href={`/u/${agent.walletAddress}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-primary transition-colors">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        {expandedAgent === agent.walletAddress ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </div>

                    {expandedAgent === agent.walletAddress && (
                      <div className="border-t border-border px-4 py-3 bg-white/2 space-y-3">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                          <Key className="w-3 h-3" /> API Keys
                        </h4>
                        {!agentKeys[agent.walletAddress] ? (
                          <p className="text-xs text-muted-foreground">Loading keys…</p>
                        ) : agentKeys[agent.walletAddress].length === 0 ? (
                          <p className="text-xs text-muted-foreground">No active keys.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {agentKeys[agent.walletAddress].map((k) => (
                              <div key={k.id} className="flex items-center gap-2 bg-muted/20 rounded-lg px-3 py-2" data-testid={`admin-key-${k.id}`}>
                                <code className="flex-1 text-xs font-mono text-foreground/70">{k.keyPrefix}••••••••••••••••</code>
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  {k.lastUsedAt ? `Used ${new Date(k.lastUsedAt).toLocaleDateString()}` : "Never used"}
                                </span>
                                <button
                                  data-testid={`button-admin-revoke-${k.id}`}
                                  onClick={() => forceRevokeKey(k.id, agent.walletAddress)}
                                  className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                                  title="Force revoke"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
                          <span>Rate limits: <strong className="text-foreground">20 posts</strong> · <strong className="text-foreground">50 comments</strong> · <strong className="text-foreground">50 follows</strong> per day</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: ROOT FILES ───────────────────────────────────────────────── */}
        {tab === "files" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-sky-400" /> Root Files ({rootFiles.length})
              </h2>
              <Button size="sm" variant="outline" onClick={loadRootFiles} className="gap-1.5 text-xs" data-testid="button-refresh-root-files">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </Button>
            </div>

            <div className="glass-panel rounded-xl p-5 space-y-4">
              <p className="text-xs text-muted-foreground">
                Files uploaded here are served from <code className="bg-muted px-1 rounded text-foreground">/</code> with the highest priority — they override anything in the build output. Use this to manage <code className="bg-muted px-1 rounded text-foreground">ads.txt</code>, <code className="bg-muted px-1 rounded text-foreground">robots.txt</code>, icons, verification files, etc. without a code deploy.
              </p>

              <div className="flex flex-col gap-3">
                <label
                  className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border/60 rounded-xl p-6 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                  htmlFor="root-file-input"
                  data-testid="dropzone-root-file"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    const isBinary = !file.type.startsWith("text/") && !file.name.match(/\.(txt|json|xml|html|css|js|ts|svg)$/i);
                    if (isBinary) {
                      reader.readAsDataURL(file);
                      reader.onload = () => {
                        const b64 = (reader.result as string).split(",")[1];
                        setRootFilePendingContent({ content: b64, encoding: "base64" });
                        setRootFilePendingName(file.name);
                      };
                    } else {
                      reader.readAsText(file);
                      reader.onload = () => {
                        setRootFilePendingContent({ content: reader.result as string, encoding: "utf8" });
                        setRootFilePendingName(file.name);
                      };
                    }
                  }}
                >
                  <Upload className="w-6 h-6 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Drop a file here or click to browse</span>
                  {rootFilePendingContent && (
                    <span className="text-xs text-primary font-medium">
                      Ready: {rootFilePendingName} ({rootFilePendingContent.encoding === "base64" ? "binary" : "text"})
                    </span>
                  )}
                </label>
                <input
                  id="root-file-input"
                  type="file"
                  className="hidden"
                  data-testid="input-root-file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    const isBinary = !file.type.startsWith("text/") && !file.name.match(/\.(txt|json|xml|html|css|js|ts|svg)$/i);
                    if (isBinary) {
                      reader.readAsDataURL(file);
                      reader.onload = () => {
                        const b64 = (reader.result as string).split(",")[1];
                        setRootFilePendingContent({ content: b64, encoding: "base64" });
                        setRootFilePendingName(file.name);
                      };
                    } else {
                      reader.readAsText(file);
                      reader.onload = () => {
                        setRootFilePendingContent({ content: reader.result as string, encoding: "utf8" });
                        setRootFilePendingName(file.name);
                      };
                    }
                    e.target.value = "";
                  }}
                />

                <div className="flex gap-2">
                  <Input
                    placeholder="filename (e.g. ads.txt, robots.txt, icon-192.png)"
                    value={rootFilePendingName}
                    onChange={(e) => setRootFilePendingName(e.target.value)}
                    className="flex-1 text-sm font-mono"
                    data-testid="input-root-filename"
                  />
                  <Button
                    size="sm"
                    disabled={!rootFilePendingContent || !rootFilePendingName.trim() || rootFileUploading}
                    data-testid="button-upload-root-file"
                    onClick={async () => {
                      if (!rootFilePendingContent || !rootFilePendingName.trim()) return;
                      setRootFileUploading(true);
                      try {
                        const res = await authFetch("/api/admin/root-files", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            filename: rootFilePendingName.trim(),
                            content: rootFilePendingContent.content,
                            encoding: rootFilePendingContent.encoding,
                          }),
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error ?? "Upload failed");
                        toast({ title: `Uploaded /${data.name}` });
                        setRootFilePendingContent(null);
                        setRootFilePendingName("");
                        loadRootFiles();
                      } catch (e: any) {
                        toast({ title: e.message, variant: "destructive" });
                      } finally {
                        setRootFileUploading(false);
                      }
                    }}
                    className="gap-1.5"
                  >
                    {rootFileUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    Upload
                  </Button>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading files…
              </div>
            ) : rootFiles.length === 0 ? (
              <div className="glass-panel rounded-xl p-8 text-center text-muted-foreground text-sm">
                No files in public-root yet. Upload a file above to get started.
              </div>
            ) : (
              <div className="glass-panel rounded-xl overflow-hidden divide-y divide-border/40">
                {rootFiles.map((f) => (
                  <div key={f.name} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors" data-testid={`row-root-file-${f.name}`}>
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-medium truncate">{f.name}</span>
                        <a
                          href={`/${f.name}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                          title={`Open /${f.name}`}
                          data-testid={`link-root-file-${f.name}`}
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {f.size < 1024
                          ? `${f.size} B`
                          : f.size < 1024 * 1024
                          ? `${(f.size / 1024).toFixed(1)} KB`
                          : `${(f.size / (1024 * 1024)).toFixed(2)} MB`}
                        {" · "}
                        {new Date(f.modifiedAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      disabled={deletingFile === f.name}
                      data-testid={`button-delete-root-file-${f.name}`}
                      onClick={async () => {
                        if (!confirm(`Delete /${f.name}? It will no longer be served.`)) return;
                        setDeletingFile(f.name);
                        try {
                          const res = await authFetch(`/api/admin/root-files/${encodeURIComponent(f.name)}`, { method: "DELETE" });
                          if (!res.ok) throw new Error((await res.json()).error ?? "Delete failed");
                          toast({ title: `Deleted /${f.name}` });
                          loadRootFiles();
                        } catch (e: any) {
                          toast({ title: e.message, variant: "destructive" });
                        } finally {
                          setDeletingFile(null);
                        }
                      }}
                      className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      title={`Delete /${f.name}`}
                    >
                      {deletingFile === f.name
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

          </div>{/* end right content */}
        </div>{/* end flex layout */}
      </main>

      {/* ── Edit Claim Dialog ───────────────────────────────────────────── */}
      <Dialog open={!!editClaim} onOpenChange={(o) => !o && setEditClaim(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Token Claim</DialogTitle>
            <DialogDescription className="font-mono text-xs">{editClaim?.tokenAddress}</DialogDescription>
          </DialogHeader>
          {editClaim && (
            <div className="space-y-3 mt-2">
              <FormRow label="Token Name">
                <Input value={editClaimForm.tokenName || ""} onChange={(e) => setEditClaimForm(f => ({ ...f, tokenName: e.target.value }))} />
              </FormRow>
              <FormRow label="Token Symbol">
                <Input value={editClaimForm.tokenSymbol || ""} onChange={(e) => setEditClaimForm(f => ({ ...f, tokenSymbol: e.target.value }))} />
              </FormRow>
              <FormRow label="Claimed By Wallet">
                <Input value={editClaimForm.claimedByWallet || ""} onChange={(e) => setEditClaimForm(f => ({ ...f, claimedByWallet: e.target.value }))} placeholder="EVM wallet address" />
              </FormRow>
              <FormRow label="Description">
                <Textarea value={editClaimForm.description || ""} onChange={(e) => setEditClaimForm(f => ({ ...f, description: e.target.value }))} rows={3} />
              </FormRow>
              <FormRow label="Twitter/X">
                <Input value={editClaimForm.twitter || ""} onChange={(e) => setEditClaimForm(f => ({ ...f, twitter: e.target.value }))} placeholder="https://x.com/..." />
              </FormRow>
              <FormRow label="Discord">
                <Input value={editClaimForm.discord || ""} onChange={(e) => setEditClaimForm(f => ({ ...f, discord: e.target.value }))} placeholder="https://discord.gg/..." />
              </FormRow>
              <FormRow label="Website">
                <Input value={editClaimForm.website || ""} onChange={(e) => setEditClaimForm(f => ({ ...f, website: e.target.value }))} placeholder="https://..." />
              </FormRow>
              <FormRow label="GitHub">
                <Input value={editClaimForm.github || ""} onChange={(e) => setEditClaimForm(f => ({ ...f, github: e.target.value }))} placeholder="https://github.com/..." />
              </FormRow>
              <FormRow label="Logo IPFS CID">
                <Input value={editClaimForm.logoIpfsCid || ""} onChange={(e) => setEditClaimForm(f => ({ ...f, logoIpfsCid: e.target.value }))} placeholder="QmXxx..." />
              </FormRow>
              <FormRow label="Banner IPFS CID">
                <Input value={editClaimForm.bannerIpfsCid || ""} onChange={(e) => setEditClaimForm(f => ({ ...f, bannerIpfsCid: e.target.value }))} placeholder="QmXxx..." />
              </FormRow>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="isPaid" checked={!!editClaimForm.isPaid} onChange={(e) => setEditClaimForm(f => ({ ...f, isPaid: e.target.checked }))} />
                <label htmlFor="isPaid" className="text-sm">Is Paid / Claimed</label>
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={saveClaim} disabled={savingClaim} className="gap-2">
                  {savingClaim ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save Changes
                </Button>
                <Button variant="outline" onClick={() => setEditClaim(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Revoke Claim Dialog ─────────────────────────────────────────── */}
      <Dialog open={!!revokeClaim} onOpenChange={(o) => !o && setRevokeClaim(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-400">Revoke Token Claim</DialogTitle>
            <DialogDescription>This will mark the token as removed and display a warning to visitors.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Reason</label>
              <select
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                className="w-full rounded-lg bg-background border border-border/60 px-3 py-2 text-sm"
              >
                <option value="rug_pull">Rug Pull</option>
                <option value="scam">Scam</option>
                <option value="abandoned">Project Abandoned</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Additional Note (shown to users)</label>
              <Textarea value={revokeNote} onChange={(e) => setRevokeNote(e.target.value)} placeholder="Optional explanation..." rows={2} />
            </div>
            <div className="flex gap-2">
              <Button onClick={doRevoke} disabled={revoking} className="gap-2 bg-red-600 hover:bg-red-500">
                {revoking ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                Confirm Revoke
              </Button>
              <Button variant="outline" onClick={() => setRevokeClaim(null)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Manual Claim Dialog ─────────────────────────────────────────── */}
      <Dialog open={newClaim} onOpenChange={setNewClaim}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Manual Claim</DialogTitle>
            <DialogDescription>Bypass payment and create a token claim directly.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <FormRow label="Token Address *">
              <Input value={newClaimForm.tokenAddress} onChange={(e) => setNewClaimForm(f => ({ ...f, tokenAddress: e.target.value }))} placeholder="Token contract address (0x…)" />
            </FormRow>
            <FormRow label="Token Name">
              <Input value={newClaimForm.tokenName} onChange={(e) => setNewClaimForm(f => ({ ...f, tokenName: e.target.value }))} />
            </FormRow>
            <FormRow label="Token Symbol">
              <Input value={newClaimForm.tokenSymbol} onChange={(e) => setNewClaimForm(f => ({ ...f, tokenSymbol: e.target.value }))} />
            </FormRow>
            <FormRow label="Claimed By Wallet">
              <Input value={newClaimForm.claimedByWallet} onChange={(e) => setNewClaimForm(f => ({ ...f, claimedByWallet: e.target.value }))} />
            </FormRow>
            <FormRow label="Description">
              <Textarea value={newClaimForm.description} onChange={(e) => setNewClaimForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </FormRow>
            <FormRow label="Twitter/X">
              <Input value={newClaimForm.twitter} onChange={(e) => setNewClaimForm(f => ({ ...f, twitter: e.target.value }))} />
            </FormRow>
            <FormRow label="Discord">
              <Input value={newClaimForm.discord} onChange={(e) => setNewClaimForm(f => ({ ...f, discord: e.target.value }))} />
            </FormRow>
            <FormRow label="Website">
              <Input value={newClaimForm.website} onChange={(e) => setNewClaimForm(f => ({ ...f, website: e.target.value }))} />
            </FormRow>
            <FormRow label="GitHub">
              <Input value={newClaimForm.github} onChange={(e) => setNewClaimForm(f => ({ ...f, github: e.target.value }))} />
            </FormRow>
            <div className="flex gap-2 pt-2">
              <Button onClick={createManualClaim} disabled={creatingClaim || !newClaimForm.tokenAddress} className="gap-2">
                {creatingClaim ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Create Claim
              </Button>
              <Button variant="outline" onClick={() => setNewClaim(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Ad Dialog ──────────────────────────────────────────────── */}
      <Dialog open={!!editAd} onOpenChange={(o) => !o && setEditAd(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Ad #{editAd?.id}</DialogTitle>
          </DialogHeader>
          {editAd && (
            <div className="space-y-3 mt-2">
              <FormRow label="Label">
                <Input value={editAdForm.label || ""} onChange={(e) => setEditAdForm(f => ({ ...f, label: e.target.value }))} />
              </FormRow>
              <FormRow label="Image URL">
                <Input value={editAdForm.imageUrl || ""} onChange={(e) => setEditAdForm(f => ({ ...f, imageUrl: e.target.value }))} />
              </FormRow>
              <FormRow label="Link URL">
                <Input value={editAdForm.linkUrl || ""} onChange={(e) => setEditAdForm(f => ({ ...f, linkUrl: e.target.value }))} />
              </FormRow>
              <FormRow label="Status">
                <select value={editAdForm.status || "pending"} onChange={(e) => setEditAdForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full rounded-lg bg-background border border-border/60 px-3 py-2 text-sm">
                  <option value="pending">Pending</option>
                  <option value="active">Active</option>
                  <option value="rejected">Rejected</option>
                </select>
              </FormRow>
              <FormRow label="Slot Type">
                <select value={editAdForm.slotType || "banner"} onChange={(e) => setEditAdForm(f => ({ ...f, slotType: e.target.value }))}
                  className="w-full rounded-lg bg-background border border-border/60 px-3 py-2 text-sm">
                  <option value="banner">Banner</option>
                  <option value="sidebar">Sidebar</option>
                  <option value="featured">Featured</option>
                </select>
              </FormRow>
              <FormRow label="Admin Note">
                <Input value={editAdForm.adminNote || ""} onChange={(e) => setEditAdForm(f => ({ ...f, adminNote: e.target.value }))} placeholder="Rejection reason, etc." />
              </FormRow>
              <div className="flex gap-2 pt-2">
                <Button onClick={saveAd} disabled={savingAd} className="gap-2">
                  {savingAd ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save
                </Button>
                <Button variant="outline" onClick={() => setEditAd(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </AppShell>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function PriceSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border/60 rounded-xl p-5 space-y-4">
      <h3 className="font-semibold text-sm">{title}</h3>
      {children}
    </div>
  );
}

function PriceField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-2">
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} type="number" min="0" step="0.01" className="h-8 text-sm" />
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
      {children}
    </div>
  );
}
