import { motion } from "framer-motion";
import {
  Rocket, TrendingUp, Zap, Users, Wallet, Globe, Shield, BarChart2,
  ChevronRight, CheckCircle, ArrowRight, Target, Layers, Cpu,
  DollarSign, Trophy, MessageSquare, Send, Star, Lock, Gift,
  PieChart, Activity, Map, Sparkles, Building2, LineChart,
} from "lucide-react";
import { SiDiscord, SiX, SiTelegram, SiEthereum } from "react-icons/si";
import { AppShell } from "@/components/AppShell";
import { FEATHER_TOKEN_ADDRESS } from "@shared/chain";

const FEATHER_CA = FEATHER_TOKEN_ADDRESS;

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionHeading({ id, icon: Icon, title, subtitle }: {
  id: string; icon: React.ElementType; title: string; subtitle?: string;
}) {
  return (
    <div id={id} className="mb-6 pt-2">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <h2 className="text-2xl font-black">{title}</h2>
      </div>
      {subtitle && <p className="text-muted-foreground text-sm leading-relaxed ml-12">{subtitle}</p>}
    </div>
  );
}

function StatCard({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="bg-muted/50 rounded-2xl p-5 border border-white/8 text-center">
      <div className="text-3xl font-black text-primary mb-1">{value}</div>
      <div className="font-semibold text-sm text-foreground">{label}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function Check({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm text-muted-foreground">
      <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
      <span>{children}</span>
    </li>
  );
}

function Tag({ color = "primary", children }: { color?: string; children: React.ReactNode }) {
  const map: Record<string, string> = {
    primary: "bg-primary/10 text-primary border-primary/20",
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    cyan: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${map[color] ?? map.primary}`}>
      {children}
    </span>
  );
}

function RoadmapItem({ quarter, title, items, done }: {
  quarter: string; title: string; items: string[]; done?: boolean;
}) {
  return (
    <div className={`relative pl-6 pb-8 border-l-2 last:pb-0 last:border-transparent ${done ? "border-primary" : "border-white/10"}`}>
      <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 ${done ? "bg-primary border-primary" : "bg-background border-white/20"}`} />
      <div className="mb-2">
        <span className={`text-xs font-bold ${done ? "text-primary" : "text-muted-foreground"}`}>{quarter}</span>
        <h4 className="font-bold text-foreground">{title}</h4>
        {done && <Tag color="emerald">Shipped</Tag>}
      </div>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item} className="text-xs text-muted-foreground flex gap-2">
            <span className={done ? "text-primary" : "text-muted-foreground/40"}>▸</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

const tocItems = [
  { id: "headline", label: "Headline" },
  { id: "problem", label: "The Problem" },
  { id: "solution", label: "Our Solution" },
  { id: "product", label: "The Product" },
  { id: "traction", label: "Traction" },
  { id: "market", label: "Market Opportunity" },
  { id: "business-model", label: "Business Model" },
  { id: "token", label: "$FEATHER Token" },
  { id: "competitive", label: "Why Feather Wins" },
  { id: "community", label: "Community Layer" },
  { id: "roadmap", label: "Roadmap" },
  { id: "team", label: "Team" },
  { id: "cta", label: "Get Involved" },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PitchDeck() {
  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 pt-6 pb-24">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-14 text-center"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-semibold mb-6">
            <Sparkles className="w-4 h-4" />
            Investor Pitch Deck — 2025
          </div>
          <h1 className="text-4xl md:text-6xl font-black mb-4">
            The Infrastructure Layer for{" "}
            <span className="text-primary">
              Robinhood Chain Token Culture
            </span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-8">
            Feather App is where tokens get launched, traded, and discussed — all in one place,
            entirely through the tools people already use.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Tag color="emerald">Live on Mainnet</Tag>
            <Tag color="cyan">Telegram + Discord</Tag>
            <Tag color="purple">$FEATHER Token Gated</Tag>
            <Tag color="amber">ETH Revenue Sharing</Tag>
          </div>
        </motion.div>

        <div className="flex gap-10 items-start">

          {/* ── Sticky Sidebar TOC ──────────────────────────────────────────── */}
          <aside className="hidden xl:block w-56 shrink-0 sticky top-24">
            <div className="glass-panel rounded-2xl p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 px-2">Sections</p>
              <nav className="flex flex-col gap-0.5">
                {tocItems.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <ChevronRight className="w-3 h-3 shrink-0" />
                    {item.label}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          {/* ── Main Content ─────────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-16">

            {/* ── 01 Headline ──────────────────────────────────────────────── */}
            <section>
              <SectionHeading
                id="headline"
                icon={Rocket}
                title="01 — What We Are"
                subtitle="The fastest way to launch a Robinhood Chain token is a conversation."
              />
              <div className="glass-panel rounded-2xl p-6 space-y-5 text-muted-foreground leading-relaxed">
                <p>
                  <span className="font-bold text-foreground">Feather App</span> is the leading Telegram and Discord bot for launching tokens on Robinhood Chain.
                  Our preferred launch platform is <span className="font-semibold text-foreground">Uniswap</span> — a next-generation social-first Robinhood Chain launchpad —
                  with <span className="font-semibold text-foreground">Uniswap</span> support as a secondary option.
                  A creator sends one message and a live, tradeable token with on-chain creator fees exists within 60 seconds.
                </p>
                <p>
                  We integrate directly with the <span className="font-semibold text-foreground">Uniswap API v2</span> — handling metadata upload,
                  fee-share configuration, token creation, and social profile linking entirely server-side.
                  No wallet pop-ups, no browser tabs, no friction.
                </p>
                <p>
                  But we're not just a launch tool. On top of the bot infrastructure we've built a full
                  <span className="font-semibold text-foreground"> social layer</span> — community feeds, profiles, DMs, leaderboards,
                  a bounty board, an AI trading assistant, a DEX aggregator, and a points/referral economy —
                  all gated to <span className="font-semibold text-foreground">$FEATHER</span> token holders.
                </p>

                <div className="flex gap-3 p-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 items-start">
                  <Globe className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-cyan-300 mb-0.5">Powered by Uniswap API v2</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Feather interfaces directly with Uniswap's public API — uploading token metadata, configuring fee-share,
                      and creating tokens on-chain, all server-side. Our web launcher at <code className="font-mono text-xs">/bags-launch</code> gives
                      $FEATHER holders a dedicated browser-based Uniswap creation flow, gated by minimum token balance.
                    </p>
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-4 pt-2">
                  {[
                    { icon: Send, label: "60-Second Launch", sub: "Token live on-chain in under a minute via chat" },
                    { icon: DollarSign, label: "Creator Revenue", sub: "On-chain fees flow to the creator's wallet forever" },
                    { icon: Users, label: "Social Economy", sub: "Points, referrals, and weekly ETH payouts for top holders" },
                  ].map(({ icon: Icon, label, sub }) => (
                    <div key={label} className="bg-muted/50 rounded-xl p-4 border border-white/8">
                      <Icon className="w-5 h-5 text-primary mb-2" />
                      <div className="font-semibold text-sm text-foreground">{label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ── 02 Problem ───────────────────────────────────────────────── */}
            <section>
              <SectionHeading
                id="problem"
                icon={Target}
                title="02 — The Problem"
                subtitle="Launching a token is harder, slower, and more fragmented than it needs to be."
              />
              <div className="glass-panel rounded-2xl p-6 space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                  {[
                    {
                      title: "Context switching kills momentum",
                      desc: "Creators have to leave their Telegram or Discord community, open a browser, connect a wallet, upload metadata — then come back and post the link. The flow is fractured.",
                      icon: Layers,
                    },
                    {
                      title: "Creator fees are left on the table",
                      desc: "Most tokens are launched anonymously or through third-party tools with no fee configuration. Billions in creator revenue goes unclaimed every month on Uniswap alone.",
                      icon: DollarSign,
                    },
                    {
                      title: "Community is scattered",
                      desc: "Token communities live across Telegram, Discord, and X — with no unified social layer that ties together holders, launches, and culture. There's no home for Robinhood Chain degen identity.",
                      icon: Globe,
                    },
                    {
                      title: "Signal vs noise is a real problem",
                      desc: "New token launches are announced constantly. Without on-chain context, market signals, or quality filters, traders make uninformed decisions and lose money they shouldn't lose.",
                      icon: Activity,
                    },
                  ].map(({ title, desc, icon: Icon }) => (
                    <div key={title} className="bg-destructive/5 border border-destructive/15 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="w-4 h-4 text-destructive/70" />
                        <span className="font-semibold text-sm text-foreground">{title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-muted/40 rounded-xl p-4 border border-white/8">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    <span className="font-bold text-foreground">The bottom line:</span> The Robinhood Chain memecoin ecosystem generates hundreds of millions in volume daily —
                    but the UX for creators and community members is still primitive. There's no single platform that owns the full lifecycle of a token launch,
                    from creation to community to trading.
                  </p>
                </div>
              </div>
            </section>

            {/* ── 03 Solution ──────────────────────────────────────────────── */}
            <section>
              <SectionHeading
                id="solution"
                icon={Zap}
                title="03 — Our Solution"
                subtitle="Meet creators where they already are. Build the community layer on top."
              />
              <div className="glass-panel rounded-2xl p-6 space-y-6">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Feather App collapses the entire token launch experience into a single conversation — inside the tools
                  where crypto communities already live. Then we extend that experience with a web app that becomes the
                  social and trading hub for the tokens that launch through us.
                </p>

                <div className="space-y-4">
                  {[
                    {
                      n: "01",
                      title: "Chat-native launch",
                      desc: "Type /launch in Telegram or Discord. Answer a few prompts. Your token is live on-chain in under 60 seconds, with creator fees configured and a link to share.",
                      color: "text-primary",
                    },
                    {
                      n: "02",
                      title: "Social identity layer",
                      desc: "Every wallet that launches a token through Feather can build a Feather profile — with a feed, followers, post history, and a reputation score. Community forms around individual creators.",
                      color: "text-cyan-400",
                    },
                    {
                      n: "03",
                      title: "AI-powered market intelligence",
                      desc: "Feather AI gives $FEATHER holders access to token-gated trading analysis, real-time market signals, and on-chain context — all through the same chat-native experience.",
                      color: "text-purple-400",
                    },
                    {
                      n: "04",
                      title: "Revenue sharing flywheel",
                      desc: "Points earned through community engagement convert to weekly ETH payouts. Referrals compound through a tracked chain. The more active the community, the more it earns.",
                      color: "text-emerald-400",
                    },
                  ].map(({ n, title, desc, color }) => (
                    <div key={n} className="flex gap-4 p-4 bg-muted/40 rounded-xl border border-white/8">
                      <div className={`shrink-0 text-2xl font-black ${color} opacity-40 w-8 text-right`}>{n}</div>
                      <div>
                        <div className="font-bold text-sm text-foreground mb-1">{title}</div>
                        <div className="text-xs text-muted-foreground leading-relaxed">{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ── 04 Product ───────────────────────────────────────────────── */}
            <section>
              <SectionHeading
                id="product"
                icon={Layers}
                title="04 — The Product"
                subtitle="Seven interconnected products that form a complete ecosystem."
              />
              <div className="grid md:grid-cols-2 gap-4">
                {[
                  {
                    icon: Send,
                    name: "Telegram Bot",
                    tag: "Live",
                    tagColor: "emerald",
                    desc: "Full token launch flow via chat. Supports Uniswap. Fee routing, IPFS metadata, and on-chain creation — all from a single message.",
                    features: ["Multi-platform launch (Uniswap)", "Creator fee configuration per launch", "IPFS metadata via Pinata", "Rate limiting and abuse protection"],
                  },
                  {
                    icon: SiDiscord,
                    name: "Discord Bot",
                    tag: "Live",
                    tagColor: "emerald",
                    desc: "Native slash commands for Discord communities. Same launch flow, designed for server culture — with thread-based conversations and bot channel support.",
                    features: ["Slash command UX (/launch, /signal)", "Server-wide and DM support", "Token-gated /signal command", "Multi-server compatible"],
                  },
                  {
                    icon: Users,
                    name: "Feather Social",
                    tag: "Live",
                    tagColor: "emerald",
                    desc: "A full social feed for the Robinhood Chain degen community. Posts, replies, likes, follows, DMs, hashtags, and trending topics — all wallet-authenticated.",
                    features: ["Wallet-signed authentication (no email)", "Public feed + profile pages", "Private DM inbox", "Bounty board + leaderboard system"],
                  },
                  {
                    icon: Cpu,
                    name: "Feather AI",
                    tag: "Live",
                    tagColor: "emerald",
                    desc: "Token-gated AI assistant for Robinhood Chain trading. Ask about token launches, market conditions, portfolio strategies, and on-chain patterns.",
                    features: ["$FEATHER holder gate", "Robinhood Chain-native context", "Market signal integration", "Conversational history"],
                  },
                  {
                    icon: BarChart2,
                    name: "Market Dashboard",
                    tag: "Live",
                    tagColor: "emerald",
                    desc: "Real-time Robinhood Chain market overview — trending tokens, on-chain signals, volume patterns, and a custom DEX aggregator powered by Uniswap.",
                    features: ["Real-time token feed", "On-chain market signals (/signal)", "DEX token detail pages", "Volume and holder analytics"],
                  },
                  {
                    icon: Globe,
                    name: "Uniswap Web Launcher",
                    tag: "Live",
                    tagColor: "emerald",
                    desc: "A web-native Uniswap token launcher at /bags-launch, gated to $FEATHER holders. Direct API integration for verified, high-quality launches.",
                    features: ["$FEATHER balance gate", "Admin-configurable threshold", "Direct Uniswap API integration", "Wallet-connected launch flow"],
                  },
                  {
                    icon: Trophy,
                    name: "Points & Rewards",
                    tag: "Live",
                    tagColor: "emerald",
                    desc: "A points economy that rewards community engagement. Points are earned through likes, posts, replies, and referrals — and convert to weekly ETH payouts.",
                    features: ["Points per action (configurable)", "Referral chain tracking", "Weekly ETH payout pool", "VIP tier for top $FEATHER holders"],
                  },
                  {
                    icon: Cpu,
                    name: "AI Agent Accounts",
                    tag: "Beta",
                    tagColor: "amber",
                    desc: "Registered AI agents can participate in the Feather Social feed — posting market commentary, alerts, and analysis — authenticated by a special agent key system.",
                    features: ["Agent registration endpoint", "Agent badge on posts", "API-driven posting", "Feather-owned agent included"],
                  },
                ].map(({ icon: Icon, name, tag, tagColor, desc, features }) => (
                  <div key={name} className="glass-panel rounded-2xl p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Icon className="w-4 h-4 text-primary" />
                        </div>
                        <span className="font-bold text-sm">{name}</span>
                      </div>
                      <Tag color={tagColor}>{tag}</Tag>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-3">{desc}</p>
                    <ul className="space-y-1">
                      {features.map((f) => (
                        <li key={f} className="flex gap-2 text-xs text-muted-foreground">
                          <span className="text-primary shrink-0">▸</span> {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {/* ── 05 Traction ──────────────────────────────────────────────── */}
            <section>
              <SectionHeading
                id="traction"
                icon={TrendingUp}
                title="05 — Traction"
                subtitle="Built in public, live on mainnet, growing organically."
              />
              <div className="glass-panel rounded-2xl p-6 space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard value="Live" label="Mainnet Status" sub="Telegram + Discord + Web" />
                  <StatCard value="2" label="Launch Platforms" sub="Uniswap" />
                  <StatCard value="8" label="Core Products" sub="All live or in beta" />
                  <StatCard value="60s" label="Token Launch Speed" sub="From /launch to on-chain" />
                </div>

                <div className="border-t border-white/8 pt-6">
                  <h3 className="font-bold mb-4 text-sm">What's already working</h3>
                  <ul className="grid sm:grid-cols-2 gap-2">
                    {[
                      "Telegram and Discord bots live and accepting commands",
                      "Real launches on Uniswap via bot",
                      "Feather Social — feed, profiles, DMs, leaderboards all live",
                      "$FEATHER token deployed on Robinhood Chain",
                      "Feather AI live and serving $FEATHER holders",
                      "Market dashboard with real-time token feeds",
                      "Points economy + referral system active",
                      "Uniswap web launcher with $FEATHER gate live",
                      "AI Agent registration system live",
                      "Admin control panel for all platform settings",
                    ].map((item) => <Check key={item}>{item}</Check>)}
                  </ul>
                </div>

                <div className="bg-primary/5 border border-primary/15 rounded-xl p-4">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-bold text-foreground">Organic growth signal:</span> Every token launched through Feather generates a shareable link
                    and attributes the bot. Every $FEATHER holder who earns weekly ETH payouts has direct monetary incentive to bring more people in.
                    The referral chain is on-chain traceable and compounds over time.
                  </p>
                </div>
              </div>
            </section>

            {/* ── 06 Market Opportunity ────────────────────────────────────── */}
            <section>
              <SectionHeading
                id="market"
                icon={LineChart}
                title="06 — Market Opportunity"
                subtitle="Robinhood Chain is the next home of memecoin culture. We own the creation layer."
              />
              <div className="glass-panel rounded-2xl p-6 space-y-6">

                {/* Robinhood Chain ecosystem stats */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Robinhood Chain Ecosystem</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      { label: "Daily DEX Volume", value: "$2–4B", sub: "Consistently top-3 chain by volume", color: "text-primary" },
                      { label: "Uniswap Tokens Launched", value: "5M+", sub: "Growing by thousands per day", color: "text-purple-400" },
                      { label: "Creator Fee Opportunity", value: "$100M+", sub: "Annual potential on active tokens", color: "text-emerald-400" },
                    ].map(({ label, value, sub, color }) => (
                      <div key={label} className="bg-muted/50 rounded-xl p-4 border border-white/8 text-center">
                        <div className={`text-2xl font-black ${color} mb-1`}>{value}</div>
                        <div className="font-semibold text-xs text-foreground">{label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Uniswap platform stats */}
                <div className="border-t border-white/8 pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-5 h-5 rounded bg-cyan-500/20 flex items-center justify-center">
                      <Globe className="w-3 h-3 text-cyan-400" />
                    </div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Uniswap — Our Primary Launch Platform</h3>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    {[
                      { label: "Tokens Launched", value: "200K+", sub: "Via the Uniswap platform" },
                      { label: "Social-First Design", value: "DEX", sub: "Direct to DEX, no bonding curve" },
                      { label: "API Integration", value: "v2", sub: "Full public API — we use it all" },
                      { label: "Fee-Share System", value: "Live", sub: "On-chain routing to creator wallets" },
                    ].map(({ label, value, sub }) => (
                      <div key={label} className="bg-cyan-500/5 border border-cyan-500/15 rounded-xl p-3 text-center">
                        <div className="text-xl font-black text-cyan-400 mb-0.5">{value}</div>
                        <div className="font-semibold text-xs text-foreground">{label}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-cyan-500/5 border border-cyan-500/15 rounded-xl p-4">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      <span className="font-semibold text-cyan-300">Why Uniswap matters for Feather App:</span> Uniswap is purpose-built for social-first token launches with direct DEX listings,
                      creator profiles, and a growing community of builders. By integrating deeply with their public API v2 — not just linking to their website — we give creators
                      an experience that no other bot or tool currently offers: a fully automated Uniswap launch from inside Telegram or Discord.
                    </p>
                  </div>
                </div>

                <div className="border-t border-white/8 pt-4 space-y-3">
                  <h3 className="font-bold text-sm">Why now</h3>
                  <ul className="space-y-2">
                    {[
                      "Memecoin launches have become a dominant cultural and economic behaviour on Robinhood Chain — this isn't a trend, it's a structural shift",
                      "Uniswap is growing fast as an alternative to the bonding-curve model — direct DEX listings appeal to creators who want real liquidity from day one",
                      "Telegram bots are the fastest-growing category of crypto tooling — users trust chat-native UX far more than anonymous websites",
                      "Creator economies are converging with on-chain tokens — every influencer, community, and brand will eventually want a token",
                      "The social layer of crypto is completely underbuilt — there is no wallet-native community hub that ties launches, trading, and culture together",
                      "Weekly ETH reward distributions create a sustainable, viral growth loop without requiring paid advertising",
                    ].map((item) => <Check key={item}>{item}</Check>)}
                  </ul>
                </div>

                <div className="bg-muted/40 rounded-xl p-4 border border-white/8">
                  <p className="text-sm font-semibold text-foreground mb-1">Total Addressable Market</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Every Robinhood Chain user who wants to launch a token is a potential Feather user. Every token community looking for a social home is a potential Feather community.
                    Every $FEATHER holder who earns weekly payouts is a distribution engine. Between the Uniswap ecosystem ($5M+ launches) and the rapidly scaling Uniswap platform,
                    the addressable market is the entire Robinhood Chain retail and creator economy — conservatively multi-billion and growing month over month.
                  </p>
                </div>
              </div>
            </section>

            {/* ── 07 Business Model ────────────────────────────────────────── */}
            <section>
              <SectionHeading
                id="business-model"
                icon={DollarSign}
                title="07 — Business Model"
                subtitle="Multiple revenue streams, all aligned with platform growth."
              />
              <div className="glass-panel rounded-2xl p-6 space-y-6">
                <div className="space-y-3">
                  {[
                    {
                      stream: "Creator Fee Capture (Default)",
                      how: "When a creator skips the wallet step during /launch, creator fees from their token route to the Feather bot wallet — a passive on-chain revenue stream that scales with launch volume.",
                      badge: "Primary",
                      badgeColor: "emerald",
                    },
                    {
                      stream: "$FEATHER Token Appreciation",
                      how: "As the platform grows, demand for $FEATHER increases. Token gates on premium features (AI, Uniswap Launcher, market signals, VIP) create sustained buy pressure. The team holds a portion of supply.",
                      badge: "Core",
                      badgeColor: "primary",
                    },
                    {
                      stream: "Weekly Payout Pool Float",
                      how: "The ETH reward pool is funded from platform revenue. As the pool grows with platform activity, the spread between earned revenue and distributed payouts represents operating margin.",
                      badge: "Secondary",
                      badgeColor: "cyan",
                    },
                    {
                      stream: "Premium API / Agent Access",
                      how: "Third-party AI agents and trading bots can register and access the Feather Social feed via an authenticated API. Future pricing tiers for high-frequency or institutional access.",
                      badge: "Roadmap",
                      badgeColor: "amber",
                    },
                    {
                      stream: "Sponsored Placement",
                      how: "Featured slots in the launch feed, sponsored trending topics, and promoted bounties are natural native ad placements that don't break the user experience.",
                      badge: "Roadmap",
                      badgeColor: "amber",
                    },
                  ].map(({ stream, how, badge, badgeColor }) => (
                    <div key={stream} className="flex gap-4 p-4 bg-muted/40 rounded-xl border border-white/8">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-sm text-foreground">{stream}</span>
                          <Tag color={badgeColor}>{badge}</Tag>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{how}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-primary/5 border border-primary/15 rounded-xl p-4">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-bold text-foreground">Unit economics:</span> Every token launched through Feather where the creator skips the wallet step
                    becomes a permanent, passive revenue source — fees accrue forever. One high-volume meme token that goes viral can generate thousands of ETH in creator fees
                    routed to the platform, with zero additional cost.
                  </p>
                </div>
              </div>
            </section>

            {/* ── 08 $FEATHER Token ────────────────────────────────────────── */}
            <section>
              <SectionHeading
                id="token"
                icon={SiEthereum}
                title="08 — $FEATHER Token"
                subtitle="The access token, governance layer, and community reward currency of the platform."
              />
              <div className="glass-panel rounded-2xl p-6 space-y-6">
                <div className="flex flex-wrap items-center gap-3">
                  <code className="text-xs font-mono bg-muted/60 border border-border px-3 py-1.5 rounded-lg text-muted-foreground break-all">
                    CA: {FEATHER_CA}
                  </code>
                  <Tag color="emerald">Live on Robinhood Chain</Tag>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-bold mb-3 text-sm">Utility</h3>
                    <ul className="space-y-2">
                      {[
                        "Gate access to Feather AI (intelligent assistant)",
                        "Gate access to /signal market intelligence command",
                        "Gate access to Uniswap web launcher (/bags-launch)",
                        "Required to join VIP Lounge and exclusive discussions",
                        "Qualify for weekly ETH reward pool distributions",
                        "Points multiplier for top-tier $FEATHER holders",
                        "Vote weight in future governance decisions",
                      ].map((item) => <Check key={item}>{item}</Check>)}
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-bold mb-3 text-sm">Demand drivers</h3>
                    <ul className="space-y-2">
                      {[
                        "Every new gated feature requires holding $FEATHER",
                        "Weekly ETH payouts incentivise holding, not selling",
                        "Referral rewards are distributed in points → ETH",
                        "Leaderboard visibility creates social status tied to holding",
                        "Creator community that grows with the platform grows demand",
                        "AI Agent system — agents must hold $FEATHER to register",
                      ].map((item) => <Check key={item}>{item}</Check>)}
                    </ul>
                  </div>
                </div>

                <div className="bg-muted/40 rounded-xl p-4 border border-white/8">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <span className="font-semibold text-foreground">Token design principle:</span> $FEATHER is designed as an access and reward token, not a speculative bet.
                    The more the platform grows, the more valuable access to its gated features becomes — which creates organic demand from new users who want in.
                    Weekly ETH payouts reduce sell pressure by rewarding holding over trading.
                  </p>
                </div>
              </div>
            </section>

            {/* ── 09 Competitive Advantage ─────────────────────────────────── */}
            <section>
              <SectionHeading
                id="competitive"
                icon={Shield}
                title="09 — Why Feather Wins"
                subtitle="We don't compete with launchpads — we bring them directly into the communities that need them."
              />
              <div className="glass-panel rounded-2xl p-6 space-y-6">

                {/* Strategic framing */}
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Feather App's competitive position isn't about replacing launch platforms — it's about
                  being the <span className="font-semibold text-foreground">distribution and community layer</span> that sits on top of them.
                  We bring Uniswap into Telegram and Discord groups that would never visit a website on their own.
                  That's a fundamentally different and complementary model.
                </p>

                {/* Uniswap partnership callout */}
                <div className="flex gap-3 p-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 items-start">
                  <Globe className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-cyan-300 mb-0.5">Uniswap — Strategic Partner, Not Competitor</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      We are deep API partners with Uniswap — our bot drives token creation, fee-share configuration, and metadata management
                      entirely through their public API v2. Every Uniswap launch through Feather is additive volume and creator acquisition for the Uniswap ecosystem.
                      We are a distribution channel and power user of Uniswap, not a rival.
                    </p>
                  </div>
                </div>

                {/* Comparison table — vs generic alternatives */}
                <div>
                  <h3 className="font-bold text-sm mb-3">Feather vs. the alternative approaches</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/8">
                          <th className="text-left py-2 text-muted-foreground font-semibold text-xs">Capability</th>
                          <th className="text-center py-2 text-primary font-bold text-xs">Feather App</th>
                          <th className="text-center py-2 text-muted-foreground font-semibold text-xs">Generic Bots</th>
                          <th className="text-center py-2 text-muted-foreground font-semibold text-xs">Manual Web Launch</th>
                          <th className="text-center py-2 text-muted-foreground font-semibold text-xs">No Tool</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {[
                          ["Launch from Telegram / Discord", "✅", "Partial", "❌", "❌"],
                          ["Uniswap deep API integration", "✅", "❌", "Manual", "❌"],
                          ["Automated fee-share routing", "✅", "❌", "Manual", "❌"],
                          ["Social community layer", "✅", "❌", "❌", "❌"],
                          ["AI trading assistant", "✅", "❌", "❌", "❌"],
                          ["Token-gated features", "✅", "❌", "❌", "❌"],
                          ["Points + ETH reward system", "✅", "❌", "❌", "❌"],
                          ["DEX aggregator + market signals", "✅", "❌", "Partial", "❌"],
                          ["AI Agent API", "✅", "❌", "❌", "❌"],
                        ].map(([feature, ...vals]) => (
                          <tr key={feature as string}>
                            <td className="py-2.5 text-xs text-muted-foreground">{feature}</td>
                            {vals.map((v, i) => (
                              <td key={i} className={`py-2.5 text-center text-xs ${i === 0 ? "font-bold text-emerald-400" : "text-muted-foreground/50"}`}>{v}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="border-t border-white/8 pt-4 space-y-3">
                  <h3 className="font-bold text-sm">The moat</h3>
                  <ul className="space-y-2">
                    {[
                      "Distribution moat: Telegram and Discord bots have instant reach to millions of existing crypto communities — no app install, no onboarding friction",
                      "API depth moat: Our server-side Uniswap integration is non-trivial to replicate — fee-share config, metadata upload, and on-chain creation are all automated end-to-end",
                      "Data moat: Every launch, trade signal, and social interaction builds a richer dataset for AI and market intelligence that improves with scale",
                      "Community moat: Once a creator community adopts Feather Social as their home, switching costs are high — profile history, reputation, and followers all stay on-platform",
                      "Token moat: $FEATHER holders have a direct financial stake in platform growth — they're simultaneously users, advocates, and investors",
                    ].map((item) => <Check key={item}>{item}</Check>)}
                  </ul>
                </div>
              </div>
            </section>

            {/* ── 10 Community Layer ───────────────────────────────────────── */}
            <section>
              <SectionHeading
                id="community"
                icon={Users}
                title="10 — Community Layer"
                subtitle="The social infrastructure that turns token launchers into a loyal ecosystem."
              />
              <div className="glass-panel rounded-2xl p-6 space-y-6">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Feather Social is a wallet-native social network purpose-built for the Robinhood Chain creator economy.
                  It's the place where token launchers become known, communities form around tokens, and culture compounds.
                </p>

                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    { icon: Users, title: "Profiles & Identity", desc: "Wallet-signed profiles with avatar, bio, social links, and full launch history." },
                    { icon: MessageSquare, title: "Community Feed", desc: "Public posts with hashtags, trending topics, likes, replies, and quote posts." },
                    { icon: Lock, title: "Private DMs", desc: "Wallet-to-wallet encrypted direct messages. No phone number or email required." },
                    { icon: Trophy, title: "Leaderboards", desc: "Top Members ranked by points, launches, followers, and weekly earnings." },
                    { icon: Gift, title: "Bounty Board", desc: "Community-posted bounties rewarded with ETH — driving organic task completion." },
                    { icon: Star, title: "VIP Lounge", desc: "Exclusive gated section for top $FEATHER holders with special privileges." },
                  ].map(({ icon: Icon, title, desc }) => (
                    <div key={title} className="bg-muted/50 rounded-xl p-4 border border-white/8">
                      <Icon className="w-5 h-5 text-primary mb-2" />
                      <div className="font-semibold text-xs text-foreground mb-1">{title}</div>
                      <div className="text-xs text-muted-foreground leading-relaxed">{desc}</div>
                    </div>
                  ))}
                </div>

                <div className="bg-muted/40 rounded-xl p-4 border border-white/8">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    <span className="font-bold text-foreground">The flywheel:</span> New token → creator joins Feather → builds following → earns points →
                    converts to ETH → invites others via referral → new users hold $FEATHER → fees increase →
                    payout pool grows → more people want in. The loop closes and accelerates itself.
                  </p>
                </div>
              </div>
            </section>

            {/* ── 11 Roadmap ───────────────────────────────────────────────── */}
            <section>
              <SectionHeading
                id="roadmap"
                icon={Map}
                title="11 — Roadmap"
                subtitle="Where we are, where we're going."
              />
              <div className="glass-panel rounded-2xl p-6">
                <div className="pl-2">
                  <RoadmapItem
                    quarter="Q3–Q4 2024"
                    title="Foundation"
                    done
                    items={[
                      "Telegram + Discord bot launch",
                      "Uniswap integration",
                      "Creator fee routing system",
                      "$FEATHER token deployed on Robinhood Chain",
                    ]}
                  />
                  <RoadmapItem
                    quarter="Q1 2025"
                    title="Platform Expansion"
                    done
                    items={[
                      "Uniswap integration added",
                      "Feather Social (feed, profiles, DMs) launched",
                      "Feather AI launched (token-gated)",
                      "Points + referral economy deployed",
                      "Leaderboards, bounties, VIP lounge live",
                      "Uniswap web launcher (/bags-launch) live",
                      "AI Agent API and registration live",
                    ]}
                  />
                  <RoadmapItem
                    quarter="Q2 2025"
                    title="Distribution & Growth"
                    items={[
                      "Automated weekly ETH payout distribution",
                      "Mobile-optimised web app",
                      "Cross-community launch announcements",
                      "Partnership with major Robinhood Chain communities",
                      "Token-gated Telegram group for $FEATHER holders",
                    ]}
                  />
                  <RoadmapItem
                    quarter="Q3 2025"
                    title="Scale & Monetisation"
                    items={[
                      "Sponsored placements in launch feed",
                      "Creator analytics dashboard",
                      "Premium API access tiers for agents",
                      "Multi-chain expansion research (Base, TON)",
                      "On-chain governance via $FEATHER voting",
                    ]}
                  />
                  <RoadmapItem
                    quarter="Q4 2025"
                    title="Ecosystem Maturity"
                    items={[
                      "Feather Launchpad — pre-launch whitelist system",
                      "Token-gated community spaces for any Robinhood Chain project",
                      "Feather Intelligence — institutional signal product",
                      "Cross-platform referral attribution layer",
                    ]}
                  />
                </div>
              </div>
            </section>

            {/* ── 12 Team ──────────────────────────────────────────────────── */}
            <section>
              <SectionHeading
                id="team"
                icon={Building2}
                title="12 — Team"
                subtitle="Builders who understand crypto culture from the inside."
              />
              <div className="glass-panel rounded-2xl p-6 space-y-6">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Feather App is built by a pseudonymous team of Robinhood Chain natives — developers, community operators, and former
                  memecoin traders who've been on both sides of the market. We build in public, ship fast, and listen to our community.
                </p>

                <div className="grid sm:grid-cols-2 gap-4">
                  {[
                    {
                      role: "Founder / Lead Developer",
                      desc: "Full-stack EVM engineer with deep experience building on-chain infrastructure, bots, and DeFi tooling. Architectured and shipped all core systems.",
                      skills: ["EVM / Solidity", "TypeScript / Node.js", "Telegram + Discord bot APIs", "React / PostgreSQL"],
                    },
                    {
                      role: "Community Lead",
                      desc: "Long-term Robinhood Chain community operator. Manages Feather Social growth, bounty programs, leaderboards, and partnerships with other Robinhood Chain projects.",
                      skills: ["Community operations", "Growth strategy", "Influencer relations", "Content and narrative"],
                    },
                  ].map(({ role, desc, skills }) => (
                    <div key={role} className="bg-muted/50 rounded-xl p-5 border border-white/8">
                      <div className="font-bold text-sm text-foreground mb-2">{role}</div>
                      <p className="text-xs text-muted-foreground leading-relaxed mb-3">{desc}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {skills.map((s) => (
                          <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{s}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-muted/40 rounded-xl p-4 border border-white/8">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    We operate pseudonymously in line with crypto culture norms — a pattern shared by many of the most successful projects in the space (Uniswap, Uniswap early team, etc.).
                    Our work is public, our code is live, and our track record is verifiable on-chain.
                  </p>
                </div>
              </div>
            </section>

            {/* ── 13 CTA ───────────────────────────────────────────────────── */}
            <section>
              <SectionHeading
                id="cta"
                icon={ArrowRight}
                title="13 — Get Involved"
                subtitle="The Robinhood Chain creator economy is being built right now. Here's how to be part of it."
              />
              <div className="glass-panel rounded-2xl p-6 space-y-6">
                <div className="grid md:grid-cols-3 gap-4">
                  {[
                    {
                      icon: SiTelegram,
                      title: "Launch a Token",
                      desc: "Start the /launch flow on Telegram and go from idea to live token in under a minute.",
                      cta: "Open Bot",
                      href: `https://t.me/${import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "FeatherAppBot"}`,
                      color: "[#26A5E4]",
                    },
                    {
                      icon: Wallet,
                      title: "Hold $FEATHER",
                      desc: "Unlock gated features, earn weekly ETH payouts, and gain a stake in the platform's growth.",
                      cta: "Buy on Uniswap",
                      href: `https://app.uniswap.org`,
                      color: "primary",
                    },
                    {
                      icon: SiX,
                      title: "Follow Updates",
                      desc: "Stay up to date with launches, payout announcements, and community highlights.",
                      cta: "Follow on X",
                      href: "https://x.com/featherapp",
                      color: "[#fff]",
                    },
                  ].map(({ icon: Icon, title, desc, cta, href, color }) => (
                    <div key={title} className="bg-muted/50 rounded-xl p-5 border border-white/8 flex flex-col">
                      <Icon className={`w-6 h-6 text-${color} mb-3`} />
                      <div className="font-bold text-sm text-foreground mb-1">{title}</div>
                      <p className="text-xs text-muted-foreground leading-relaxed flex-1 mb-4">{desc}</p>
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold transition-colors"
                      >
                        {cta} <ArrowRight className="w-3 h-3" />
                      </a>
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/8 pt-6 text-center">
                  <p className="text-muted-foreground text-sm mb-2">
                    For partnership inquiries, investment discussions, or press
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <a
                      href="https://x.com/featherapp"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 hover:border-primary/40 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <SiX className="w-4 h-4" /> @featherapp
                    </a>
                    <a
                      href={`https://t.me/${import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "FeatherAppBot"}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 hover:border-primary/40 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <SiTelegram className="w-4 h-4" /> Telegram
                    </a>
                  </div>
                </div>

                {/* Legal disclaimer */}
                <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <span className="font-semibold text-amber-400">Disclaimer:</span> This pitch deck is for informational purposes only and does not constitute an offer of securities, financial advice, or an invitation to invest.
                    $FEATHER is a community token on Robinhood Chain. Crypto assets carry significant risk. Past performance of any token or platform does not guarantee future results. Please do your own research.
                  </p>
                </div>
              </div>
            </section>

          </div>
        </div>
      </div>

    </AppShell>
  );
}
