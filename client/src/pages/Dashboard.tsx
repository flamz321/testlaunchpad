import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { SocialLayout } from "@/components/SocialLayout";
import { SponsoredSidebar } from "@/components/SponsoredSidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useWalletConnect } from "@/hooks/use-wallet-connect";
import { useSocialAuth, socialAuthHeaders } from "@/hooks/use-social-auth";
import { TierBadge } from "@/components/TierBadge";
import { apiRequest } from "@/lib/queryClient";
import {
  Wallet, CheckCircle2, Pencil, ExternalLink, Loader2, ArrowRight,
  Globe, Github, Star, Flame, TrendingUp, LayoutDashboard, Upload, Image, Eye,
  User, Users, MessageCircle, UserPlus, Coins, Award, Copy, Check, Gift,
  Heart, MessageSquare, CornerDownRight, Link2, Lock, Zap, Key, Trash2, Plus, RefreshCw,
} from "lucide-react";
import { SiDiscord, SiX } from "react-icons/si";
import { formatDistanceToNow } from "date-fns";
import { profilePath } from "@/lib/profileUrl";

// ── helpers ───────────────────────────────────────────────────────────────────

function truncatePk(pk: string) {
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

function ipfsUrl(cid: string | null | undefined): string {
  if (!cid) return "";
  if (cid.startsWith("Qm") || cid.startsWith("bafy") || cid.startsWith("baf")) {
    return `https://gateway.pinata.cloud/ipfs/${cid}`;
  }
  if (cid.endsWith(".json")) return `/uploads/metadata/${cid}`;
  return `/uploads/claim/${cid}`;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadImageToIpfs(base64: string, type: string) {
  const res = await fetch("/api/ipfs/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: base64, type }),
  });
  if (!res.ok) throw new Error((await res.json()).message);
  return res.json() as Promise<{ cid: string; url: string }>;
}

// ── Boost badge ───────────────────────────────────────────────────────────────

function BoostBadge({ tier }: { tier: number }) {
  if (tier === 3) return <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/40 text-[10px]"><Star className="w-2.5 h-2.5 mr-0.5" />Featured</Badge>;
  if (tier === 2) return <Badge className="bg-pink-500/20 text-pink-300 border-pink-500/40 text-[10px]"><TrendingUp className="w-2.5 h-2.5 mr-0.5" />Trending</Badge>;
  if (tier === 1) return <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/40 text-[10px]"><Flame className="w-2.5 h-2.5 mr-0.5" />Hot</Badge>;
  return null;
}

// ── Edit metadata dialog ──────────────────────────────────────────────────────

interface EditDialogProps {
  token: any;
  walletAddress: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function EditDialog({ token, walletAddress, open, onClose, onSaved }: EditDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tokenName, setTokenName] = useState(token.tokenName ?? "");
  const [description, setDescription] = useState(token.description ?? "");
  const [twitter, setTwitter] = useState(token.twitter ?? "");
  const [discord, setDiscord] = useState(token.discord ?? "");
  const [website, setWebsite] = useState(token.website ?? "");
  const [github, setGithub] = useState(token.github ?? "");
  const [logoCid, setLogoCid] = useState(token.logoIpfsCid ?? "");
  const [logoUrl, setLogoUrl] = useState(token.logoUrl ?? "");
  const [bannerCid, setBannerCid] = useState(token.bannerIpfsCid ?? "");
  const [bannerUrl, setBannerUrl] = useState(token.bannerUrl ?? "");
  const [uploading, setUploading] = useState<"logo" | "banner" | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/token/${token.tokenAddress}/update`, {
        walletAddress,
        tokenName,
        description,
        logoCid,
        bannerCid,
        twitter,
        discord,
        website,
        github,
      }),
    onSuccess: () => {
      toast({ title: "Metadata updated!", description: "Your token info has been saved." });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard", walletAddress] });
      queryClient.invalidateQueries({ queryKey: ["/api/status", token.tokenAddress] });
      onSaved();
      onClose();
    },
    onError: (e: any) => {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    },
  });

  const handleImageUpload = async (type: "logo" | "banner", file: File) => {
    if (file.size > 5_242_880) {
      toast({ title: "File too large", description: "Max 5MB", variant: "destructive" });
      return;
    }
    setUploading(type);
    try {
      const base64 = await fileToBase64(file);
      const result = await uploadImageToIpfs(base64, type);
      if (type === "logo") { setLogoCid(result.cid); setLogoUrl(result.url); }
      else { setBannerCid(result.cid); setBannerUrl(result.url); }
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-card border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-lg flex items-center gap-2">
            <Pencil className="w-4 h-4 text-primary" /> Update Token Info
          </DialogTitle>
          <DialogDescription>
            {token.tokenSymbol || token.tokenAddress.slice(0, 8)} — changes are saved to IPFS
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Token Name</label>
            <Input value={tokenName} onChange={(e) => setTokenName(e.target.value)} placeholder="Token name" maxLength={80} data-testid="input-edit-name" />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="About your token…" rows={3} maxLength={1000} className="resize-none" data-testid="input-edit-description" />
          </div>

          <div className="flex gap-4 items-start">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Logo</label>
              <label className={`relative w-28 h-28 rounded-xl border-2 border-dashed cursor-pointer overflow-hidden flex items-center justify-center transition-all
                ${logoUrl ? "border-emerald-500/40" : "border-border/60 hover:border-primary/40"}`}>
                {uploading === "logo" ? (
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                ) : logoUrl ? (
                  <img src={logoUrl} alt="logo" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <Upload className="w-5 h-5" />
                    <span className="text-[10px]">Logo</span>
                  </div>
                )}
                <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleImageUpload("logo", e.target.files[0])} />
              </label>
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Banner</label>
              <label className={`relative w-full h-28 rounded-xl border-2 border-dashed cursor-pointer overflow-hidden flex items-center justify-center transition-all
                ${bannerUrl ? "border-emerald-500/40" : "border-border/60 hover:border-primary/40"}`}>
                {uploading === "banner" ? (
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                ) : bannerUrl ? (
                  <img src={bannerUrl} alt="banner" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <Upload className="w-5 h-5" />
                    <span className="text-[10px]">Banner (1500×500)</span>
                  </div>
                )}
                <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleImageUpload("banner", e.target.files[0])} />
              </label>
            </div>
          </div>

          <div className="space-y-2.5">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1 flex items-center gap-1.5"><span>𝕏</span> Twitter / X</label>
              <Input value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="https://x.com/yourtoken" data-testid="input-edit-twitter" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1 flex items-center gap-1.5"><SiDiscord className="w-3.5 h-3.5" /> Discord</label>
              <Input value={discord} onChange={(e) => setDiscord(e.target.value)} placeholder="https://discord.gg/invite" data-testid="input-edit-discord" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1 flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Website</label>
              <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://yourtoken.io" data-testid="input-edit-website" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1 flex items-center gap-1.5"><Github className="w-3.5 h-3.5" /> GitHub</label>
              <Input value={github} onChange={(e) => setGithub(e.target.value)} placeholder="https://github.com/yourtoken" data-testid="input-edit-github" />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose} data-testid="button-edit-cancel">Cancel</Button>
            <Button className="flex-1" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-edit-save">
              {mutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Token card ─────────────────────────────────────────────────────────────────

function TokenCard({ token, walletAddress }: { token: any; walletAddress: string }) {
  const [editOpen, setEditOpen] = useState(false);
  const queryClient = useQueryClient();
  const logoUrl = token.logoUrl || (token.logoIpfsCid ? ipfsUrl(token.logoIpfsCid) : null);
  const displayName = token.tokenName || token.tokenSymbol || `${token.tokenAddress.slice(0, 8)}…`;

  return (
    <>
      <div
        data-testid={`card-dashboard-token-${token.tokenAddress}`}
        className="bg-card border border-border/60 rounded-xl overflow-hidden hover:border-border transition-all"
      >
        {/* Banner */}
        <div className="h-24 bg-primary/10 relative">
          {token.bannerUrl && (
            <img src={token.bannerUrl} alt="banner" className="w-full h-full object-cover" />
          )}
          <div className="absolute top-2 right-2 flex gap-1">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/50">
              <CheckCircle2 className="w-3 h-3" /> DEX IS PAID
            </span>
            {token.boostTier > 0 && <BoostBadge tier={token.boostTier} />}
          </div>
        </div>

        {/* Info */}
        <div className="p-4">
          <div className="flex items-center gap-3 -mt-8 mb-3">
            <div className="w-14 h-14 rounded-full border-2 border-border bg-muted overflow-hidden flex-shrink-0 shadow-lg">
              {logoUrl ? (
                <img src={logoUrl} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm font-bold text-muted-foreground">
                  {(token.tokenSymbol ?? "?").slice(0, 2)}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 mt-8">
              <div className="font-bold text-sm truncate">{displayName}</div>
              {token.tokenSymbol && <div className="text-xs text-muted-foreground">{token.tokenSymbol}</div>}
            </div>
          </div>

          {token.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{token.description}</p>
          )}

          <div className="text-[10px] text-muted-foreground mb-3 font-mono">{token.tokenAddress.slice(0, 8)}…{token.tokenAddress.slice(-6)}</div>

          <div className="flex gap-1.5">
            <Link href={`/dex/${token.tokenAddress}`}>
              <Button
                data-testid={`button-view-token-${token.tokenAddress}`}
                size="sm"
                variant="outline"
                className="gap-1.5 flex-1 text-xs"
              >
                <ExternalLink className="w-3.5 h-3.5" /> View
              </Button>
            </Link>
            <Button
              data-testid={`button-edit-token-${token.tokenAddress}`}
              size="sm"
              className="gap-1.5 flex-1 text-xs"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
            </Button>
          </div>
        </div>
      </div>

      <EditDialog
        token={token}
        walletAddress={walletAddress}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard", walletAddress] });
        }}
      />
    </>
  );
}

// ── Ad card ───────────────────────────────────────────────────────────────────

function AdCard({ ad, walletAddress, onUpdated }: { ad: any; walletAddress: string; onUpdated: () => void }) {
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState(ad.imageUrl);
  const [linkUrl, setLinkUrl] = useState(ad.linkUrl);
  const [label, setLabel] = useState(ad.label || "");
  const [saving, setSaving] = useState(false);

  const statusColor = ad.status === "active" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
    : ad.status === "rejected" ? "bg-red-500/20 text-red-300 border-red-500/40"
    : "bg-yellow-500/20 text-yellow-300 border-yellow-500/40";

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/ads/${ad.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: walletAddress, imageUrl, linkUrl, label }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Ad updated" });
      setEditOpen(false);
      onUpdated();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <>
      <div data-testid={`card-ad-${ad.id}`} className="bg-card border border-border/60 rounded-xl overflow-hidden">
        <div className="h-28 bg-muted overflow-hidden">
          <img src={ad.imageUrl} alt={ad.label || "Ad"} className="w-full h-full object-cover" />
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-semibold text-sm">{ad.label || "Untitled Ad"}</span>
            <Badge className={`text-[10px] ${statusColor}`}>{ad.status}</Badge>
            <Badge variant="outline" className="text-[10px]">{ad.slotType}</Badge>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1">
            <Eye className="w-3 h-3" /> {ad.impressions} impressions
          </div>
          <div className="text-[10px] text-muted-foreground mb-3 truncate">{ad.linkUrl}</div>
          {ad.adminNote && <div className="text-[10px] text-yellow-300 mb-3">Admin note: {ad.adminNote}</div>}
          <div className="text-[10px] text-muted-foreground mb-3">Expires {new Date(ad.expiresAt).toLocaleDateString()}</div>
          <Button size="sm" variant="outline" className="gap-1.5 w-full text-xs" onClick={() => setEditOpen(true)}>
            <Pencil className="w-3.5 h-3.5" /> Edit Ad
          </Button>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={(o) => !o && setEditOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Ad</DialogTitle>
            <DialogDescription>Update your ad details. Changes require admin re-approval.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Label</label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Image URL</label>
              <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Link URL</label>
              <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save
              </Button>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Points Tab ────────────────────────────────────────────────────────────────

interface PointsSummary {
  totalPoints: number;
  dailyPointsEarned: number;
  dailyCap: number;
  pointsMinFeather: number;
  eligible: boolean;
  breakdown: { eventType: string; total: number; count: number }[];
}

interface ReferralCodeData { code: string; link: string; }

interface ReferralEntry {
  referredWallet: string;
  pointsAwarded: number;
  createdAt: string;
  username?: string;
}

const ACTION_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  like_received:    { label: "Likes received",    icon: <Heart className="w-3.5 h-3.5" />,          color: "text-pink-400" },
  comment_made:     { label: "Comments made",     icon: <MessageSquare className="w-3.5 h-3.5" />,   color: "text-blue-400" },
  comment_received: { label: "Comments received", icon: <MessageSquare className="w-3.5 h-3.5" />,   color: "text-blue-300" },
  reply_made:       { label: "Replies made",      icon: <CornerDownRight className="w-3.5 h-3.5" />, color: "text-violet-400" },
  reply_received:   { label: "Replies received",  icon: <CornerDownRight className="w-3.5 h-3.5" />, color: "text-violet-300" },
  referral:         { label: "Referrals",         icon: <Gift className="w-3.5 h-3.5" />,            color: "text-emerald-400" },
};

function PointsTab({ walletAddress }: { walletAddress: string }) {
  const { token } = useSocialAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const headers = token ? { Authorization: `Bearer ${token}` } : ({} as Record<string, string>);

  const { data: summary, isLoading: summaryLoading } = useQuery<PointsSummary>({
    queryKey: ["/api/points/me", walletAddress],
    queryFn: () => fetch("/api/points/me", { headers }).then(r => r.json()),
    enabled: !!token,
    staleTime: 30_000,
  });

  const { data: refData } = useQuery<ReferralCodeData>({
    queryKey: ["/api/points/referral-code", walletAddress],
    queryFn: () => fetch("/api/points/referral-code", { headers }).then(r => r.json()),
    enabled: !!token,
    staleTime: 300_000,
  });

  const { data: referrals = [] } = useQuery<ReferralEntry[]>({
    queryKey: ["/api/points/referrals", walletAddress],
    queryFn: () => fetch("/api/points/referrals", { headers }).then(r => r.json()),
    enabled: !!token,
    staleTime: 30_000,
  });

  function copyLink() {
    if (!refData?.link) return;
    navigator.clipboard.writeText(refData.link).then(() => {
      setCopied(true);
      toast({ title: "Copied!", description: "Referral link copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!token) {
    return (
      <div className="flex flex-col items-center gap-6 py-16 text-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Award className="w-10 h-10 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold font-display">Sign In to See Your Points</h3>
          <p className="text-muted-foreground mt-2 max-w-sm">
            Create a Feather Social profile to earn points for likes, comments, and referrals.
          </p>
        </div>
      </div>
    );
  }

  if (summaryLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-card border border-border/60 rounded-2xl h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  const totalPoints   = summary?.totalPoints ?? 0;
  const dailyEarned   = summary?.dailyPointsEarned ?? 0;
  const dailyCap      = summary?.dailyCap ?? 200;
  const minFeather    = summary?.pointsMinFeather ?? 1_000_000;
  const eligible      = summary?.eligible ?? false;
  const breakdown     = summary?.breakdown ?? [];
  const dailyPct      = Math.min(100, Math.round((dailyEarned / dailyCap) * 100));

  return (
    <div className="space-y-5">
      {/* Hero card */}
      <div className="bg-card border border-border/60 rounded-2xl p-6 flex items-center gap-5">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <Award className="w-7 h-7 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span data-testid="text-total-points" className="text-3xl font-bold font-display">{totalPoints.toLocaleString()}</span>
            <span className="text-muted-foreground text-sm">Feather Points</span>
          </div>
          {!eligible && (
            <div className="flex items-center gap-1.5 mt-1 text-xs text-yellow-400">
              <Lock className="w-3 h-3" />
              Hold {(minFeather / 1_000_000).toLocaleString()}M+ $FEATHER to earn points
            </div>
          )}
        </div>
      </div>

      {/* Daily cap */}
      <div className="bg-card border border-border/60 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Daily Cap</span>
          <span data-testid="text-daily-points" className="text-sm text-muted-foreground">{dailyEarned} / {dailyCap} pts today</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${dailyPct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground mt-2">Resets every 24 hours. Max {dailyCap} points per day.</p>
      </div>

      {/* Breakdown */}
      {breakdown.length > 0 && (
        <div className="bg-card border border-border/60 rounded-2xl p-5">
          <h3 className="text-sm font-semibold mb-4">Points Breakdown</h3>
          <div className="space-y-3">
            {breakdown.map((row) => {
              const meta = ACTION_META[row.eventType] ?? { label: row.eventType, icon: <Star className="w-3.5 h-3.5" />, color: "text-muted-foreground" };
              return (
                <div key={row.eventType} className="flex items-center justify-between text-sm">
                  <div className={`flex items-center gap-2 ${meta.color}`}>
                    {meta.icon}
                    <span>{meta.label}</span>
                    <span className="text-muted-foreground text-xs">× {row.count}</span>
                  </div>
                  <span className="font-semibold">{row.total.toLocaleString()} pts</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Referral section */}
      <div className="bg-card border border-border/60 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Gift className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold">Referral Program</h3>
          <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-400/30">+100 pts / referral</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Share your link — earn 100 points for every new user who joins with your referral code.
        </p>
        {refData?.link && (
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-muted/50 border border-border/60 rounded-lg px-3 py-2 text-xs font-mono truncate text-muted-foreground">
              {refData.link}
            </div>
            <Button
              data-testid="button-copy-referral"
              size="sm"
              variant="outline"
              onClick={copyLink}
              className="gap-1.5 shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        )}
        {referrals.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">{referrals.length} user{referrals.length !== 1 ? "s" : ""} referred</p>
            <div className="space-y-1.5">
              {referrals.map((r) => (
                <div
                  key={r.referredWallet}
                  data-testid={`referral-entry-${r.referredWallet}`}
                  className="flex items-center justify-between text-xs bg-muted/30 rounded-lg px-3 py-2"
                >
                  <span className="font-mono text-muted-foreground">
                    {r.username ? `@${r.username}` : r.referredWallet.slice(0, 8) + "…"}
                  </span>
                  <div className="flex items-center gap-1 text-emerald-400">
                    <Award className="w-3 h-3" />
                    +{r.pointsAwarded} pts
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {referrals.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No referrals yet — share your link to get started!</p>
        )}
      </div>
    </div>
  );
}

// ── Social Profile Tab ────────────────────────────────────────────────────────

function SocialProfileTab({ walletAddress }: { walletAddress: string }) {
  const { profile, token } = useSocialAuth();

  const { data: posts = [], isLoading: postsLoading } = useQuery<any[]>({
    queryKey: ["/api/social/feed/user", walletAddress],
    queryFn: () => fetch(`/api/social/feed/user/${walletAddress}`).then((r) => r.json()),
    enabled: !!walletAddress,
    staleTime: 30_000,
  });

  if (!profile) {
    return (
      <div className="flex flex-col items-center gap-6 py-16 text-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
          <User className="w-10 h-10 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold font-display">No Social Profile Yet</h3>
          <p className="text-muted-foreground mt-2 max-w-sm">
            Create a Feather Social profile to post in the community feed, follow other traders, and build your reputation.
          </p>
        </div>
        <Link href="/profile/setup">
          <Button data-testid="button-dashboard-create-profile" className="gap-2">
            <UserPlus className="w-4 h-4" /> Create Profile
          </Button>
        </Link>
      </div>
    );
  }

  const avatarSrc = profile.profileImageIpfsCid
    ? `https://gateway.pinata.cloud/ipfs/${profile.profileImageIpfsCid}`
    : null;
  const displayName = profile.username ? `@${profile.username}` : profile.walletAddress.slice(0, 8) + "…";

  return (
    <div className="space-y-5">
      {/* Profile card */}
      <div className="bg-card border border-border/60 rounded-2xl p-5">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden shrink-0">
            {avatarSrc
              ? <img src={avatarSrc} alt={profile.username ?? "avatar"} className="w-full h-full object-cover" />
              : <span className="text-xl font-bold text-primary">{displayName.replace("@", "").slice(0, 2).toUpperCase()}</span>
            }
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span data-testid="text-social-username" className="font-bold text-base">{displayName}</span>
              <TierBadge walletAddress={walletAddress} />
            </div>
            {profile.bio && <p className="text-sm text-muted-foreground mb-2">{profile.bio}</p>}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span data-testid="text-follower-count"><strong className="text-foreground">{profile.followerCount ?? 0}</strong> followers</span>
              <span data-testid="text-following-count"><strong className="text-foreground">{profile.followingCount ?? 0}</strong> following</span>
              <span><strong className="text-foreground">{posts.length}</strong> posts</span>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {profile.twitterLink && (
                <a href={profile.twitterLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <SiX className="w-3 h-3" /> Twitter
                </a>
              )}
              {profile.websiteLink && (
                <a href={profile.websiteLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <Globe className="w-3 h-3" /> Website
                </a>
              )}
              {profile.githubLink && (
                <a href={profile.githubLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <Github className="w-3 h-3" /> GitHub
                </a>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <Link href="/profile/edit">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Pencil className="w-3.5 h-3.5" /> Edit
              </Button>
            </Link>
            <Link href={profilePath(profile)}>
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                <Eye className="w-3.5 h-3.5" /> View
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        <Link href="/social">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <Globe className="w-3.5 h-3.5" /> Community Feed
          </Button>
        </Link>
        <Link href="/leaderboards">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <Star className="w-3.5 h-3.5" /> Leaderboards
          </Button>
        </Link>
        <Link href="/vip">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <Coins className="w-3.5 h-3.5" /> VIP Lounge
          </Button>
        </Link>
      </div>

      {/* Recent posts */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-primary" />
          Recent Posts
        </h3>
        {postsLoading && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        )}
        {!postsLoading && posts.length === 0 && (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No posts yet. <Link href="/social"><span className="text-primary hover:underline cursor-pointer">Head to the feed to start posting.</span></Link>
          </div>
        )}
        {!postsLoading && posts.length > 0 && (
          <div className="space-y-2">
            {posts.slice(0, 5).map((post: any) => (
              <div key={post.id} data-testid={`card-post-${post.id}`} className="bg-card border border-border/40 rounded-xl p-3">
                <p className="text-sm text-foreground/90 line-clamp-2">{post.content}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span>{formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}</span>
                  {post.commentCount > 0 && (
                    <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{post.commentCount}</span>
                  )}
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">{post.type}</Badge>
                </div>
              </div>
            ))}
            {posts.length > 5 && (
              <Link href={profilePath(profile)}>
                <p className="text-xs text-primary hover:underline cursor-pointer text-center pt-1">View all {posts.length} posts →</p>
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Payouts Tab ───────────────────────────────────────────────────────────────

function PayoutsTab({ walletAddress }: { walletAddress: string }) {
  const { token } = useSocialAuth();
  type PayoutEntry = {
    id: number; payoutId: number; walletAddress: string;
    epochPoints: number; sharePercent: string; solLamports: number;
    txSignature: string | null; status: string; errorMessage: string | null;
    payout: { id: number; epochStart: string; epochEnd: string; totalPoints: number; totalSolLamports: number; recipientCount: number; status: string; createdAt: string };
  };

  const { data: payoutRows = [], isLoading } = useQuery<PayoutEntry[]>({
    queryKey: ["/api/payouts/me", walletAddress],
    queryFn: async () => {
      if (!token) return [];
      const res = await fetch("/api/payouts/me", { headers: socialAuthHeaders(token) });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!walletAddress && !!token,
    staleTime: 60_000,
  });

  if (isLoading) return <div className="flex items-center gap-2 text-muted-foreground py-8"><Loader2 className="w-4 h-4 animate-spin" /> Loading payouts…</div>;

  if (!payoutRows.length) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Coins className="w-10 h-10 mx-auto mb-3 opacity-20" />
        <p className="font-semibold text-sm">No payouts yet</p>
        <p className="text-xs mt-1">Earn points each week — your share of creator fees is distributed at the end of each epoch.</p>
      </div>
    );
  }

  const totalSol = payoutRows.filter((r) => r.status === "sent").reduce((s, r) => s + r.solLamports, 0) / 1e9;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-panel rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Received</p>
          <p className="text-2xl font-black text-primary">{totalSol.toFixed(6)} <span className="text-sm font-semibold">ETH</span></p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Payout Rounds</p>
          <p className="text-2xl font-black">{payoutRows.length}</p>
        </div>
      </div>

      <div className="space-y-2">
        {payoutRows.map((r) => (
          <div key={r.id} className="glass-panel rounded-xl px-4 py-3 flex items-center justify-between gap-3" data-testid={`payout-row-${r.id}`}>
            <div className="space-y-0.5 min-w-0">
              <p className="text-sm font-semibold">Payout #{r.payoutId}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(r.payout.epochStart).toLocaleDateString()} – {new Date(r.payout.epochEnd).toLocaleDateString()}
              </p>
              <p className="text-xs text-muted-foreground">{r.epochPoints.toLocaleString()} pts · {r.sharePercent}% share</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-black text-primary">{(r.solLamports / 1e9).toFixed(6)} ETH</p>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${r.status === "sent" ? "bg-green-500/20 text-green-400" : r.status === "pending" ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"}`}>
                {r.status}
              </span>
              {r.txSignature && (
                <div className="mt-1">
                  <a href={`https://blockscout.io/tx/${r.txSignature}`} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-primary hover:underline flex items-center gap-1 justify-end"
                    data-testid={`link-user-payout-tx-${r.id}`}
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                    {r.txSignature.slice(0, 8)}…
                  </a>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Agent API Keys Tab ────────────────────────────────────────────────────────

function AgentKeysTab({ walletAddress }: { walletAddress: string }) {
  const { token } = useSocialAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [copied, setCopied] = useState<number | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [newKeyCopied, setNewKeyCopied] = useState(false);

  const { data: keys = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/agent/keys", walletAddress],
    queryFn: () =>
      fetch("/api/agent/keys", { headers: socialAuthHeaders(token) }).then((r) => r.json()),
    enabled: !!token,
  });

  const createMut = useMutation({
    mutationFn: () =>
      fetch("/api/agent/keys", {
        method: "POST",
        headers: { ...socialAuthHeaders(token), "Content-Type": "application/json" },
      }).then((r) => r.json()),
    onSuccess: (data) => {
      if (data.error) { toast({ title: data.error, variant: "destructive" }); return; }
      setNewKey(data.apiKey);
      qc.invalidateQueries({ queryKey: ["/api/agent/keys", walletAddress] });
      toast({ title: "New API key created", description: "Copy it now — it won't be shown again." });
    },
  });

  const revokeMut = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/agent/keys/${id}`, {
        method: "DELETE",
        headers: socialAuthHeaders(token),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/agent/keys", walletAddress] });
      toast({ title: "Key revoked" });
    },
  });

  const copyText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Key className="w-4 h-4 text-violet-400" /> API Keys
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Use these keys to authenticate your agent via <code className="bg-muted/50 px-1 rounded">POST /api/agent/auth</code>
          </p>
        </div>
        <Button
          data-testid="button-create-api-key"
          size="sm"
          className="gap-2"
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending}
        >
          {createMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Generate New Key
        </Button>
      </div>

      {/* New key banner */}
      {newKey && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" /> New key — copy it now, it won't be shown again
          </p>
          <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2">
            <code className="flex-1 text-xs font-mono text-emerald-300 break-all">{newKey}</code>
            <button onClick={() => { navigator.clipboard.writeText(newKey); setNewKeyCopied(true); setTimeout(() => setNewKeyCopied(false), 2000); }} className="shrink-0 text-emerald-400">
              {newKeyCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setNewKey(null)}>Dismiss</Button>
        </div>
      )}

      {/* Keys list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1,2].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
        </div>
      ) : keys.length === 0 ? (
        <div className="glass-panel rounded-xl p-8 text-center">
          <Key className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No API keys yet. Generate one above to start using your agent.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map((k: any, idx: number) => (
            <div key={k.id} data-testid={`card-api-key-${k.id}`} className="glass-panel rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0">
                <Key className="w-3.5 h-3.5 text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-xs font-mono text-foreground/80">{k.keyPrefix}••••••••••••••••</code>
                  <button
                    onClick={() => copyText(k.keyPrefix, idx)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="Copy key prefix"
                  >
                    {copied === idx ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Created {formatDistanceToNow(new Date(k.createdAt), { addSuffix: true })}
                  {k.lastUsedAt && ` · Last used ${formatDistanceToNow(new Date(k.lastUsedAt), { addSuffix: true })}`}
                </p>
              </div>
              <button
                data-testid={`button-revoke-key-${k.id}`}
                onClick={() => revokeMut.mutate(k.id)}
                disabled={revokeMut.isPending}
                className="text-muted-foreground hover:text-destructive transition-colors"
                title="Revoke key"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Usage docs */}
      <div className="glass-panel rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quick Start</p>
        <pre className="text-[11px] font-mono text-foreground/60 whitespace-pre-wrap">{`# 1. Exchange your API key for a JWT (valid 7 days)
POST /api/agent/auth
Content-Type: application/json
{ "apiKey": "trk_your_key_here" }
→ { "token": "eyJ..." }

# 2. Use the JWT in all requests
Authorization: Bearer eyJ...

# 3. Post to the feed
POST /api/social/feed
{ "content": "Hello from my AI agent!" }`}</pre>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const wallet = useWalletConnect();
  const { profile: socialProfile } = useSocialAuth();
  const [tab, setTab] = useState<"tokens" | "ads" | "social" | "points" | "payouts" | "agentkeys">("tokens");

  const { data: tokens = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/dashboard", wallet.publicKey],
    queryFn: () => fetch(`/api/dashboard/${wallet.publicKey}`).then((r) => r.json()),
    enabled: !!wallet.publicKey,
    staleTime: 30_000,
  });

  const { data: ads = [], isLoading: adsLoading, refetch: refetchAds } = useQuery<any[]>({
    queryKey: ["/api/ads/wallet", wallet.publicKey],
    queryFn: () => fetch(`/api/ads/wallet/${wallet.publicKey}`).then((r) => r.json()),
    enabled: !!wallet.publicKey,
    staleTime: 30_000,
  });

  const DASH_TABS = [
    { key: "tokens" as const, label: "Token Claims", icon: <CheckCircle2 className="w-3.5 h-3.5" />, badge: tokens.length > 0 ? tokens.length : null },
    { key: "ads" as const, label: "My Ads", icon: <Image className="w-3.5 h-3.5" />, badge: ads.length > 0 ? ads.length : null },
    { key: "social" as const, label: "Social", icon: <User className="w-3.5 h-3.5" />, badge: null },
    { key: "points" as const, label: "Points", icon: <Award className="w-3.5 h-3.5" />, badge: null },
    { key: "payouts" as const, label: "ETH Payouts", icon: <Coins className="w-3.5 h-3.5" />, badge: null },
    ...((socialProfile as any)?.isAgent ? [{ key: "agentkeys" as const, label: "API Keys", icon: <Key className="w-3.5 h-3.5" />, badge: null }] : []),
  ];

  return (
    <SocialLayout rightSidebar={<SponsoredSidebar placement="sidebar" />}>
      {/* Sticky header */}
      <div className="sticky top-14 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between px-4 py-3 gap-3">
          <h1 className="text-[17px] font-bold flex items-center gap-2 shrink-0">
            <LayoutDashboard className="w-5 h-5 text-primary" />
            My Dashboard
          </h1>
          <div className="flex items-center gap-2 min-w-0">
            {wallet.publicKey && (
              <span className="text-[11px] text-muted-foreground font-mono truncate hidden sm:block max-w-[140px]">
                {wallet.publicKey.slice(0, 6)}…{wallet.publicKey.slice(-4)}
              </span>
            )}
            {wallet.connected && (
              <Link href="/dex">
                <Button data-testid="button-dashboard-browse-dex" variant="outline" size="sm" className="rounded-full text-xs px-3 gap-1.5 shrink-0">
                  Browse DEX <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            )}
          </div>
        </div>

        {wallet.connected && (
          <div className="flex overflow-x-auto scrollbar-hide">
            {DASH_TABS.map(({ key, label, icon, badge }) => (
              <button
                key={key}
                data-testid={`tab-dashboard-${key}`}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap shrink-0 relative transition-colors ${
                  tab === key ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                }`}
              >
                {icon}
                {label}
                {badge !== null && (
                  <span className="ml-1 text-[10px] bg-primary/20 text-primary rounded-full px-1.5">{badge}</span>
                )}
                {tab === key && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-full bg-primary" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-4">
        {/* Not connected */}
        {!wallet.connected && (
          <div className="flex flex-col items-center gap-6 py-20">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Wallet className="w-10 h-10 text-primary" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold font-display">Connect Your Wallet</h2>
              <p className="text-muted-foreground mt-2">Connect your wallet (MetaMask, Rabby, or Robinhood Wallet) to view your claimed tokens and ads.</p>
            </div>
            <Button
              data-testid="button-dashboard-connect-wallet"
              onClick={() => wallet.connect()}
              disabled={wallet.connecting}
              size="lg"
              className="gap-2"
            >
              {wallet.connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
              {wallet.connecting ? "Connecting…" : "Connect Wallet"}
            </Button>
          </div>
        )}

        {/* Tab content */}
        {wallet.connected && (
          <>

              {/* ── Token Claims Tab ── */}
              {tab === "tokens" && (
                <>
                  {isLoading && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="bg-card border border-border/60 rounded-xl h-64 animate-pulse" />
                      ))}
                    </div>
                  )}

                  {!isLoading && tokens.length === 0 && (
                    <div className="flex flex-col items-center gap-6 py-16 text-center">
                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                        <LayoutDashboard className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold font-display">No Claimed Tokens Yet</h3>
                        <p className="text-muted-foreground mt-2 max-w-sm">
                          Find a token on the DEX and click "Claim Token" to list it with your branding for $50.
                        </p>
                      </div>
                      <Link href="/dex">
                        <Button data-testid="button-dashboard-go-dex" className="gap-2">
                          Browse Tokens <ArrowRight className="w-4 h-4" />
                        </Button>
                      </Link>
                    </div>
                  )}

                  {!isLoading && tokens.length > 0 && (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-sm text-muted-foreground">
                          {tokens.length} claimed token{tokens.length !== 1 ? "s" : ""}
                        </p>
                        <Link href="/dex">
                          <Button data-testid="button-dashboard-claim-another" variant="outline" size="sm" className="gap-1.5 text-xs">
                            Claim Another Token
                          </Button>
                        </Link>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {tokens.map((token: any) => (
                          <TokenCard key={token.tokenAddress} token={token} walletAddress={wallet.publicKey!} />
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ── My Ads Tab ── */}
              {tab === "ads" && (
                <>
                  {adsLoading && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[...Array(2)].map((_, i) => (
                        <div key={i} className="bg-card border border-border/60 rounded-xl h-52 animate-pulse" />
                      ))}
                    </div>
                  )}

                  {!adsLoading && ads.length === 0 && (
                    <div className="flex flex-col items-center gap-6 py-16 text-center">
                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                        <Image className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold font-display">No Ads Yet</h3>
                        <p className="text-muted-foreground mt-2 max-w-sm">
                          Purchase an advertisement slot on the DEX to promote your project.
                        </p>
                      </div>
                    </div>
                  )}

                  {!adsLoading && ads.length > 0 && (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-sm text-muted-foreground">{ads.length} ad{ads.length !== 1 ? "s" : ""}</p>
                        <div className="text-xs text-muted-foreground">
                          {ads.filter((a: any) => a.status === "active").length} active · {ads.filter((a: any) => a.status === "pending").length} pending
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {ads.map((ad: any) => (
                          <AdCard key={ad.id} ad={ad} walletAddress={wallet.publicKey!} onUpdated={() => refetchAds()} />
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ── Social Profile Tab ── */}
              {tab === "social" && (
                <SocialProfileTab walletAddress={wallet.publicKey!} />
              )}

              {/* ── Points Tab ── */}
              {tab === "points" && (
                <PointsTab walletAddress={wallet.publicKey!} />
              )}

              {/* ── Payouts Tab ── */}
              {tab === "payouts" && (
                <PayoutsTab walletAddress={wallet.publicKey!} />
              )}

              {/* ── Agent API Keys Tab ── */}
              {tab === "agentkeys" && (
                <AgentKeysTab walletAddress={wallet.publicKey!} />
              )}
            </>
          )}
        </div>
    </SocialLayout>
  );
}
