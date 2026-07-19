import { motion } from "framer-motion";
import { Link } from "wouter";
import { Users, MessageCircle, Trophy, Crown, Briefcase, UserCircle, Globe, Check, Heart, Repeat2, Bookmark } from "lucide-react";

const tiers = [
  {
    label: "Member",
    threshold: "250,000 $FEATHER",
    accent: "text-primary",
    ring: "border-primary/40",
    badge: "bg-primary/15 text-primary border-primary/30",
    perks: [
      "Community Feed — post, comment & follow",
      "Bounty Board access",
      "Leaderboard ranking",
      "8 token launches/day",
    ],
  },
  {
    label: "Elite",
    threshold: "500,000 $FEATHER",
    accent: "text-blue-400",
    ring: "border-blue-500/40",
    badge: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    perks: [
      "Private DM inbox — send & receive",
      "Elite badge on profile",
      "Full signal history access",
      "12 token launches/day",
    ],
  },
  {
    label: "Verified",
    threshold: "1,000,000 $FEATHER",
    accent: "text-emerald-400",
    ring: "border-emerald-500/40",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    perks: [
      "VIP Lounge — exclusive community hub",
      "Verified badge on profile",
      "Priority screener alerts",
      "Future governance votes",
    ],
  },
];

const features = [
  {
    icon: Globe,
    label: "Community Feed",
    desc: "Share alpha, tag launches, and follow the pulse of the market in real time.",
    href: "/community",
    color: "bg-primary",
  },
  {
    icon: UserCircle,
    label: "Feather Profiles",
    desc: "Claim your @username, link your socials, and build your on-chain reputation.",
    href: "/profile",
    color: "bg-cyan-500",
  },
  {
    icon: MessageCircle,
    label: "Private DMs",
    desc: "Elite members (500k+) can send and receive private direct messages securely.",
    href: "/inbox",
    color: "bg-blue-500",
  },
  {
    icon: Briefcase,
    label: "Bounty Board",
    desc: "Post bounties, claim alpha rewards, and collaborate with the Feather community.",
    href: "/bounties",
    color: "bg-amber-500",
  },
  {
    icon: Trophy,
    label: "Leaderboards",
    desc: "See who's topping the charts — most launches, highest volume, top contributors.",
    href: "/leaderboards",
    color: "bg-yellow-500",
  },
  {
    icon: Crown,
    label: "VIP Lounge",
    desc: "Verified members (1M+ $FEATHER) unlock an exclusive community hub.",
    href: "/vip",
    color: "bg-emerald-600",
  },
];

const mockPosts = [
  {
    avatar: "D",
    avatarColor: "bg-primary",
    username: "degeneth",
    badge: "Verified",
    badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    time: "2m ago",
    text: "Just launched $MOON on Uniswap via Feather — creator fees already hitting my wallet 🔥",
    likes: 47,
    reposts: 12,
  },
  {
    avatar: "T",
    avatarColor: "bg-blue-500",
    username: "feathermaster",
    badge: "Elite",
    badgeColor: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    time: "8m ago",
    text: "Feather Screener caught a whale moving 50 ETH into a fresh token 10 min before it 5x'd. This platform is built different.",
    likes: 93,
    reposts: 31,
  },
  {
    avatar: "A",
    avatarColor: "bg-emerald-600",
    username: "alphafeather",
    badge: "Member",
    badgeColor: "bg-primary/15 text-primary border-primary/30",
    time: "15m ago",
    text: "Market signals showing green — graduation rate up 12% today. Good time to launch 👀",
    likes: 24,
    reposts: 8,
  },
];

function SocialMockup() {
  return (
    <div className="bg-black/60 border border-border rounded-xl overflow-hidden text-left w-full max-w-sm mx-auto">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <div className="w-3 h-3 rounded-full bg-red-500/70" />
        <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
        <div className="w-3 h-3 rounded-full bg-green-500/70" />
        <span className="text-xs text-muted-foreground ml-2 font-mono">feather.app/community</span>
      </div>

      {/* Profile mini-header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-sm font-black text-black shrink-0">F</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold">@featherdegen</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border bg-emerald-500/20 text-emerald-300 border-emerald-500/30">Verified</span>
          </div>
          <p className="text-[11px] text-muted-foreground">47 following · 312 followers</p>
        </div>
        <button className="text-[11px] font-bold px-3 py-1 rounded-full bg-primary/20 border border-primary/30 text-primary shrink-0">Follow</button>
      </div>

      {/* Feed posts */}
      <div className="divide-y divide-white/5">
        {mockPosts.map((post, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 + i * 0.1 }}
            className="px-4 py-3"
          >
            <div className="flex items-start gap-2.5">
              <div className={`w-7 h-7 rounded-full ${post.avatarColor} flex items-center justify-center text-xs font-black text-white shrink-0`}>
                {post.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <span className="text-xs font-bold">@{post.username}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${post.badgeColor}`}>{post.badge}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{post.time}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{post.text}</p>
                <div className="flex items-center gap-4 mt-2">
                  <button className="flex items-center gap-1 text-muted-foreground hover:text-red-400 transition-colors">
                    <Heart className="w-3 h-3" />
                    <span className="text-[10px]">{post.likes}</span>
                  </button>
                  <button className="flex items-center gap-1 text-muted-foreground hover:text-green-400 transition-colors">
                    <Repeat2 className="w-3 h-3" />
                    <span className="text-[10px]">{post.reposts}</span>
                  </button>
                  <button className="flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors">
                    <Bookmark className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function CommunitySection() {
  return (
    <section className="py-12 px-4 relative z-10 border-t border-border/50">
      <div className="max-w-7xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/10 border border-secondary/20 text-primary text-xs font-bold uppercase tracking-widest mb-3">
            <Users className="w-3.5 h-3.5" />Community Layer
          </div>
          <h2 className="text-2xl md:text-4xl font-black mb-2">
            More than a launch tool —{" "}
            <span className="text-primary">
              it's the Robinhood Chain community
            </span>
          </h2>
          <p className="text-muted-foreground text-sm max-w-xl leading-relaxed">
            Full social layer for traders. Profiles, feeds, DMs, bounties, leaderboards, and a VIP lounge — all gated by your $FEATHER balance.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center mb-10">
          <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="relative">
            <div className="absolute inset-0 bg-secondary/8 rounded-full blur-[60px] pointer-events-none" />
            <SocialMockup />
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {features.map((f, i) => (
              <motion.div key={f.label} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}>
                <Link href={f.href} className="group block glass-panel rounded-xl p-4 h-full hover:border-border/80 transition-all">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${f.color} mb-2.5`}>
                    <f.icon className="w-3.5 h-3.5 text-white" />
                  </div>
                  <h3 className="font-bold text-xs mb-1 group-hover:text-primary transition-colors">{f.label}</h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{f.desc}</p>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 h-px bg-border/50" />
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">$FEATHER Tiers</span>
          <div className="flex-1 h-px bg-border/50" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {tiers.map((tier, i) => (
            <motion.div key={tier.label} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className={`glass-panel rounded-xl p-5 border ${tier.ring}`}>
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border mb-3 ${tier.badge}`}>{tier.label}</div>
              <div className={`text-base font-black mb-3 ${tier.accent}`}>{tier.threshold}</div>
              <ul className="space-y-2">
                {tier.perks.map((perk) => (
                  <li key={perk} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="w-3 h-3 text-primary shrink-0" />{perk}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/community" data-testid="link-community-section-cta"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold text-sm text-black transition-all hover:-translate-y-0.5"
            style={{ background: "hsl(var(--primary))" }}>
            <Globe className="w-4 h-4" />Explore Community Feed
          </Link>
          <Link href="/profile" data-testid="link-community-create-profile"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold text-sm glass-panel border-border text-foreground transition-all hover:-translate-y-0.5">
            <UserCircle className="w-4 h-4" />Create Your Profile
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
