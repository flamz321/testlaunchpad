import { motion } from "framer-motion";
import { useState } from "react";
import { useLocation, Link } from "wouter";
import {
  Zap, Users, MessageCircle, Trophy,
  Heart, Share2, Flame, Star, Lock, Cpu, Send, Copy, Check, ExternalLink,
} from "lucide-react";
import { SiX } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { useSocialAuth } from "@/hooks/use-social-auth";
import { useWalletConnect } from "@/hooks/use-wallet-connect";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useFeatherToken, useFeatherBalance } from "@/hooks/use-feather-token";
import { formatTokenAmount } from "@/lib/format";

// ── Mock social feed data ──────────────────────────────────────────────────────
const MOCK_POSTS = [
  {
    id: 1,
    avatar: "🐋",
    name: "whale_degen",
    handle: "@whale_degen",
    content: "Just aped into the new Uniswap launch and it's already 8x. ser, we are so early 🚀",
    likes: 247,
    comments: 38,
    time: "2m",
    badge: "🔥",
  },
  {
    id: 2,
    avatar: "⚡",
    name: "feather_99",
    handle: "@feather_99",
    content: "Robinhood Chain signal is HOT rn. 3 grads in the last hour. Markets are open anon 👀",
    likes: 89,
    comments: 14,
    time: "7m",
    badge: null,
  },
  {
    id: 3,
    avatar: "🦊",
    name: "alpha_anon",
    handle: "@alpha_anon",
    content: "Who's using the Feather Screener? Found 2 snipers on the last launch before anyone else 🎯",
    likes: 412,
    comments: 61,
    time: "12m",
    badge: "⭐",
  },
];

const MOCK_LEADERS = [
  { rank: 1, name: "feather_99", launches: 24, emoji: "🥇" },
  { rank: 2, name: "alpha_anon", launches: 19, emoji: "🥈" },
  { rank: 3, name: "whale_degen", launches: 17, emoji: "🥉" },
];

// ── Mock feed visual ───────────────────────────────────────────────────────────
function MockFeed() {
  const [liked, setLiked] = useState<number[]>([]);

  function toggleLike(id: number) {
    setLiked((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  return (
    <div className="relative w-full max-w-sm mx-auto">
      {/* Glow */}
      <div className="absolute -inset-4 bg-primary/20 rounded-3xl blur-2xl pointer-events-none" />
      <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-secondary/20 rounded-full blur-2xl pointer-events-none" />

      {/* Card container */}
      <div className="relative glass-panel rounded-2xl overflow-hidden border border-border shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-primary/5">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold">Feather Social</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-emerald-400 font-medium">Live</span>
          </div>
        </div>

        {/* Posts */}
        <div className="divide-y divide-white/5">
          {MOCK_POSTS.map((post) => (
            <div
              key={post.id}
              className="p-3 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-base shrink-0">
                  {post.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs font-bold text-foreground">{post.handle}</span>
                    {post.badge && <span className="text-[10px]">{post.badge}</span>}
                    <span className="text-[10px] text-muted-foreground ml-auto">{post.time}</span>
                  </div>
                  <p className="text-xs text-foreground/90 leading-relaxed line-clamp-2">{post.content}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <button
                      onClick={() => toggleLike(post.id)}
                      className={`flex items-center gap-1 text-[10px] transition-colors ${liked.includes(post.id) ? "text-red-400" : "text-muted-foreground hover:text-red-400"}`}
                    >
                      <Heart className={`w-3 h-3 ${liked.includes(post.id) ? "fill-current" : ""}`} />
                      {post.likes + (liked.includes(post.id) ? 1 : 0)}
                    </button>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <MessageCircle className="w-3 h-3" />
                      {post.comments}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Share2 className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Mini leaderboard */}
        <div className="border-t border-border bg-secondary/5 px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Trophy className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Top Launchers</span>
          </div>
          <div className="space-y-1">
            {MOCK_LEADERS.map((l) => (
              <div key={l.rank} className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">{l.emoji} @{l.name}</span>
                <span className="text-foreground font-medium">{l.launches} launches</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-primary/5 border-t border-border">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><Star className="w-3 h-3 text-primary" /> VIP Lounge</span>
            <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Bounty Board</span>
            <span className="flex items-center gap-1 text-primary font-medium">1M+ $FEATHER →</span>
          </div>
        </div>
      </div>

      {/* Floating DM notification */}
      <div className="absolute -top-3 -right-3 z-10 glass-panel border border-border rounded-xl px-3 py-2 shadow-xl max-w-[160px]">
        <div className="flex items-start gap-2">
          <span className="text-base">📬</span>
          <div>
            <p className="text-[10px] font-bold text-foreground">@satoshi_anon</p>
            <p className="text-[10px] text-muted-foreground">"ser what's the play rn?"</p>
          </div>
        </div>
      </div>

      {/* Floating bounty pill */}
      <div className="absolute -bottom-3 -left-3 z-10 glass-panel border border-amber-500/30 rounded-full px-3 py-1.5 shadow-xl">
        <div className="flex items-center gap-1.5">
          <Flame className="w-3 h-3 text-amber-400" />
          <span className="text-[10px] font-bold text-amber-400">New Bounty: 50K $FEATHER</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Hero ──────────────────────────────────────────────────────────────────
export function Hero() {
  const { openAuthModal } = useAuthModal();
  const wallet = useWalletConnect();
  const { profile, token } = useSocialAuth();
  const [, navigate] = useLocation();
  const feather = useFeatherToken();
  const { data: balData } = useFeatherBalance(wallet.publicKey);
  const [copiedCa, setCopiedCa] = useState(false);

  function openSignUp() {
    if (wallet.connected && token && profile) {
      navigate("/community");
      return;
    }
    openAuthModal("signup");
  }

  async function copyCa() {
    if (!feather.configured) return;
    try {
      await navigator.clipboard.writeText(feather.address);
      setCopiedCa(true);
      window.setTimeout(() => setCopiedCa(false), 1600);
    } catch {
      /* ignore */
    }
  }

  const featurePills = [
    { icon: MessageCircle, label: "Social Feed" },
    { icon: Users, label: "Profiles & DMs" },
    { icon: Trophy, label: "Leaderboards" },
    { icon: Flame, label: "Bounty Board" },
    { icon: Star, label: "VIP Lounge" },
  ];

  return (
    <>
      <section className="relative pt-24 pb-14 md:pt-32 md:pb-20 overflow-hidden px-4">
        {/* Background glows */}
        <div className="absolute top-1/3 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[500px] bg-primary/15 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute top-1/2 right-0 w-[350px] h-[350px] bg-secondary/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-1/2 w-[400px] h-[200px] bg-primary/8 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-6xl mx-auto relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

            {/* ── Left column ────────────────────────────────────────── */}
            <div>
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-panel border-primary/30 text-primary mb-5">
                <Zap className="w-4 h-4" />
                <span className="text-sm font-bold tracking-wide uppercase">Social Layer for Robinhood Chain</span>
              </div>

              {/* Headline */}
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black mb-5 leading-[1.05]">
                Where Robinhood Chain{" "}
                <span className="text-primary">
                  Traders Connect
                </span>
              </h1>

              {/* Description */}
              <p className="text-base md:text-lg text-muted-foreground mb-6 leading-relaxed">
                Feather App brings profiles, feeds, and discovery to Robinhood Chain — so you can share setups,
                track launches, and build reputation next to the markets you trade. Hold{" "}
                <span className="text-primary font-semibold">$FEATHER</span> to unlock DMs, leaderboards,
                bounties, and the VIP Lounge.
              </p>

              {/* Official $FEATHER CA */}
              <div
                className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-3"
                data-testid="hero-feather-ca"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs font-bold uppercase tracking-wider text-primary">
                    Official $FEATHER Contract
                  </div>
                  {wallet.connected && feather.configured && (
                    <div className="text-xs text-muted-foreground" data-testid="hero-feather-balance">
                      Your balance:{" "}
                      <span className="font-semibold text-foreground">
                        {balData ? `${formatTokenAmount(balData.balance)} $FEATHER` : "…"}
                      </span>
                    </div>
                  )}
                </div>
                {feather.configured ? (
                  <>
                    <code className="block break-all font-mono text-[11px] sm:text-xs text-foreground/90 select-all">
                      {feather.address}
                    </code>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5 h-8 text-xs"
                        onClick={copyCa}
                        data-testid="button-hero-copy-ca"
                      >
                        {copiedCa ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedCa ? "Copied" : "Copy CA"}
                      </Button>
                      <Button asChild size="sm" className="gap-1.5 h-8 text-xs">
                        <Link href={feather.swapUrl}>Buy $FEATHER</Link>
                      </Button>
                      {feather.explorerUrl && (
                        <Button asChild size="sm" variant="outline" className="gap-1.5 h-8 text-xs">
                          <a href={feather.explorerUrl} target="_blank" rel="noopener noreferrer">
                            Explorer <ExternalLink className="w-3 h-3" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Contract address coming soon — set it in Admin → SEO & Analytics.
                  </p>
                )}
              </div>

              {/* Feature pills */}
              <div className="flex flex-wrap gap-2 mb-8">
                {featurePills.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-panel border-border text-xs font-medium text-muted-foreground"
                  >
                    <p.icon className="w-3 h-3 text-primary" />
                    {p.label}
                  </div>
                ))}
              </div>

              {/* CTA buttons */}
              <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <Button
                  onClick={openSignUp}
                  size="lg"
                  className="gap-2 font-bold text-sm px-7 bg-primary hover:opacity-90 hover:-translate-y-0.5 transition-all"
                  data-testid="button-hero-signup"
                >
                  <Users className="w-4 h-4" />
                  {wallet.connected && token && profile ? "Go to Community" : "Sign Up Free"}
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="gap-2 font-bold text-sm px-7 border-border hover:bg-muted hover:-translate-y-0.5 transition-all"
                  data-testid="button-hero-x"
                >
                  <a href="https://x.com/featherappfun" target="_blank" rel="noopener noreferrer">
                    <SiX className="w-4 h-4" />
                    Follow on X
                  </a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="gap-2 font-bold text-sm px-7 border-[#26A5E4]/30 text-[#26A5E4] hover:bg-[#26A5E4]/10 hover:-translate-y-0.5 transition-all"
                  data-testid="button-hero-telegram"
                >
                  <a href="https://t.me/featherappfun" target="_blank" rel="noopener noreferrer">
                    <Send className="w-4 h-4" />
                    Telegram
                  </a>
                </Button>
              </div>

              {/* Agent CTA */}
              <div className="mb-5">
                <Link href="/agents/register" data-testid="link-hero-agent-register">
                  <span className="inline-flex items-center gap-1.5 text-xs text-primary/80 hover:text-primary transition-colors group">
                    <Cpu className="w-3.5 h-3.5" />
                    Building an AI agent?
                    <span className="underline underline-offset-2">Register it here →</span>
                  </span>
                </Link>
              </div>

              {/* Social proof note */}
              <p className="text-xs text-muted-foreground/60 flex items-center gap-2">
                <span className="flex -space-x-1">
                  {["🐋", "⚡", "🦊", "🎯"].map((e, i) => (
                    <span key={i} className="w-5 h-5 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[10px]">{e}</span>
                  ))}
                </span>
                No email required — your wallet is your identity
              </p>
            </div>

            {/* ── Right column — mock social feed ───────────────────── */}
            <div className="flex justify-center lg:justify-end">
              <MockFeed />
            </div>

          </div>
        </div>
      </section>

    </>
  );
}
