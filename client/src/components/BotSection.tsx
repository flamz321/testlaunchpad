import { useState } from "react";
import { motion } from "framer-motion";
import { Send, ImageIcon, FileText, Wallet, Globe, Rocket, Users, Coins, Activity, Copy, CheckCheck, Terminal } from "lucide-react";
import { SiDiscord } from "react-icons/si";
import { useStats } from "@/hooks/use-stats";
import { useLaunches } from "@/hooks/use-launches";
import { LaunchCard } from "./LaunchCard";

import { FEATHER_TOKEN_ADDRESS } from "@shared/chain";
const FEATHER_CA = FEATHER_TOKEN_ADDRESS;
const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "FeatherAppBot";
const DISCORD_INVITE_URL = import.meta.env.VITE_DISCORD_INVITE_URL || "https://discord.com/oauth2/authorize?client_id=1481865866151989409&permissions=101376&integration_type=0&scope=bot+applications.commands";

type Platform = "telegram" | "discord";

const steps = (platform: Platform) => [
  {
    icon: platform === "telegram" ? Send : SiDiscord,
    step: "01",
    title: "Open the Bot",
    desc:
      platform === "telegram"
        ? "Search for @FeatherAppBot on Telegram and send /start. No sign-up, no wallet connection, no website needed."
        : "Add FeatherAppBot to your Discord server (or DM it directly). Use the slash command — no sign-up or wallet needed.",
    code: platform === "telegram" ? "/start" : "/launch (slash command)",
    color: platform === "telegram" ? "bg-blue-500" : "bg-indigo-500",
  },
  {
    icon: ImageIcon,
    step: "02",
    title: "Send /launch",
    desc: "Attach your token logo image and send the launch command with your coin name and ticker symbol.",
    code:
      platform === "telegram"
        ? "/launch CoinName, TICKER"
        : "/launch name:CoinName ticker:TICKER",
    color: "bg-primary",
  },
  {
    icon: FileText,
    step: "03",
    title: "Add Token Details",
    desc: "Optionally add a description, website, and X/Twitter link. Type skip to leave them blank — all fields are optional.",
    code: "Description · website · X link",
    color: "bg-emerald-600",
  },
  {
    icon: Wallet,
    step: "04",
    title: "Give Your Wallet",
    desc: "The bot asks for your wallet address for creator fees. Skip for cashback mode where trading fees go back to traders instead.",
    code: "Your ETH address → creator fees",
    color: "bg-amber-500",
  },
  {
    icon: Globe,
    step: "05",
    title: "Pick Platform",
    desc: "Choose where to launch: Uniswap (the OG DEX). Reply to confirm and you're set.",
    code: "1 = Uniswap",
    color: "bg-cyan-500",
  },
  {
    icon: Rocket,
    step: "06",
    title: "Token Goes Live",
    desc: "The bot creates your token on Robinhood Chain, wires creator fees to your wallet on-chain, and sends you the live link — all in seconds.",
    code: "✅ Live on Uniswap",
    color: "bg-emerald-700",
  },
];

const launchTiers = [
  { tier: "0 $FEATHER",   launches: "1 launch/day",   label: "Free",    style: "text-muted-foreground" },
  { tier: "250,000",      launches: "8 launches/day",  label: "Member",  style: "text-primary font-semibold" },
  { tier: "500,000",      launches: "12 launches/day", label: "Elite",    style: "text-blue-400 font-semibold" },
  { tier: "1,000,000+",   launches: "24 launches/day", label: "Verified", style: "text-emerald-400 font-semibold" },
];

export function BotSection() {
  const [platform, setPlatform] = useState<Platform>("telegram");
  const [copied, setCopied] = useState(false);
  const { data: stats, isLoading: statsLoading } = useStats();
  const { data: launches, isLoading: launchesLoading, error: launchesError } = useLaunches();

  const statItems = [
    {
      label: "Total Users",
      value: statsLoading ? "..." : stats?.totalUsers.toLocaleString() || "0",
      icon: Users,
      color: "text-primary",
      glow: "shadow-glow-primary",
    },
    {
      label: "Tokens Launched",
      value: statsLoading ? "..." : stats?.totalLaunches.toLocaleString() || "0",
      icon: Coins,
      color: "text-primary",
      glow: "shadow-glow-secondary",
    },
    {
      label: "Network Status",
      value: "Online",
      icon: Activity,
      color: "text-emerald-400",
      glow: "shadow-[0_0_20px_hsla(var(--accent)/0.2)]",
    },
  ];

  const handleCopy = () => {
    navigator.clipboard.writeText(FEATHER_CA);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {/* ── Bot section wrapper ─────────────────────────────────── */}
      <section id="how-it-works" className="py-20 px-4 relative z-10">
        <div className="max-w-7xl mx-auto">
          {/* Section heading */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-bold uppercase tracking-widest mb-5">
              <Send className="w-4 h-4" />
              Feather Launcher Bots
            </div>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              Telegram + Discord.{" "}
              <span className="text-primary">
                One command. Token live.
              </span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              The fastest way to launch a Robinhood Chain token. No websites, no wallet connections, no friction —
              just send a command and your creator fees flow directly to your wallet.
            </p>
          </motion.div>

          {/* Live stats bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-14 border-y border-border py-8 bg-black/20 -mx-4 px-4">
            {statItems.map((item, idx) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className={`glass-panel p-5 rounded-2xl flex items-center gap-5 ${item.glow}`}
              >
                <div className={`p-3 rounded-xl bg-black/50 ${item.color}`}>
                  <item.icon className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-0.5">{item.label}</p>
                  <h4 className="text-2xl font-bold">{item.value}</h4>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Six steps */}
          <div className="text-center mb-8">
            <h3 className="text-2xl md:text-4xl font-black mb-4">
              Six steps.{" "}
              <span className="text-primary">
                {platform === "telegram" ? "All in Telegram." : "All in Discord."}
              </span>
            </h3>
            <p className="text-muted-foreground max-w-xl mx-auto mb-6">
              No websites, no wallets to connect, no complexity. Your creator fees go directly to your wallet — not ours.
            </p>

            {/* Platform selector */}
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-black/40 border border-border">
              <button
                onClick={() => setPlatform("telegram")}
                data-testid="button-platform-telegram"
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${
                  platform === "telegram"
                    ? "bg-[#26A5E4] text-white shadow-lg"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Send className="w-4 h-4" />
                Telegram
              </button>
              <button
                onClick={() => setPlatform("discord")}
                data-testid="button-platform-discord"
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${
                  platform === "discord"
                    ? "bg-[#5865F2] text-white shadow-lg"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <SiDiscord className="w-4 h-4" />
                Discord
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {steps(platform).map((step, idx) => (
              <motion.div
                key={`${platform}-${idx}`}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.08 }}
                className="glass-panel p-8 rounded-3xl relative"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${step.color}`}>
                    <step.icon className="w-7 h-7 text-white" />
                  </div>
                  <span className="text-5xl font-black text-white/5">{step.step}</span>
                </div>
                <h4 className="text-xl font-bold mb-3">{step.title}</h4>
                <p className="text-muted-foreground leading-relaxed mb-6 text-sm">{step.desc}</p>
                <div className="bg-black/60 px-4 py-3 rounded-xl border border-border font-mono text-sm text-green-400">
                  {step.code}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Creator fees callout */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-panel rounded-3xl p-8 max-w-3xl mx-auto mb-14"
          >
            <h3 className="text-xl font-bold mb-2 text-center">About Creator Fees <span className="text-sm font-normal text-muted-foreground">(Uniswap)</span></h3>
            <p className="text-muted-foreground text-center text-sm leading-relaxed mb-6">
              Uniswap pays token creators a percentage of every trade. Feather configures this on-chain at launch so fees flow directly to your wallet automatically, forever.
            </p>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-black text-primary mb-1">0.30%</div>
                <div className="text-xs text-muted-foreground">Creator fee<br />on bonding curve</div>
              </div>
              <div>
                <div className="text-2xl font-black text-amber-400 mb-1">Up to 0.95%</div>
                <div className="text-xs text-muted-foreground">Creator fee after<br />graduation (mid-cap)</div>
              </div>
              <div>
                <div className="text-2xl font-black text-emerald-400 mb-1">100%</div>
                <div className="text-xs text-muted-foreground">Of creator fees<br />go to your wallet</div>
              </div>
            </div>
          </motion.div>

          {/* $FEATHER bot holder tiers */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-panel rounded-3xl p-8 md:p-12 relative overflow-hidden max-w-4xl mx-auto mb-14"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-secondary/10 rounded-full blur-[60px] pointer-events-none" />

            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/15 border border-primary/30 text-primary text-xs font-bold uppercase tracking-widest mb-5">
                $FEATHER Holders — Launch Tiers
              </div>
              <h3 className="text-2xl md:text-3xl font-black mb-2">
                Hold more $FEATHER ={" "}
                <span className="text-primary">
                  launch more every day
                </span>
              </h3>
              <p className="text-muted-foreground text-sm mb-6 max-w-xl">
                The bots are 100% free forever. $FEATHER isn't a paywall — it's your multiplier. The more you hold, the more you can launch per day.
              </p>

              <div className="space-y-0 mb-6">
                <div className="grid grid-cols-3 gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest pb-2 border-b border-border px-2">
                  <span>$FEATHER Balance</span>
                  <span>Daily Launches</span>
                  <span>Tier</span>
                </div>
                {launchTiers.map((row, i) => (
                  <div key={i} className="grid grid-cols-3 gap-2 items-center py-3 border-b border-border text-sm px-2 last:border-0">
                    <span className={`font-mono ${row.style}`}>{row.tier}</span>
                    <span className="font-bold">{row.launches}</span>
                    <span className={`text-xs ${row.style}`}>{row.label}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-1 px-4 py-3 rounded-xl bg-black/40 border border-border min-w-0">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-primary uppercase tracking-widest mb-0.5">CA</p>
                    <p className="font-mono text-xs text-foreground truncate" data-testid="text-feather-ca-bot">
                      {FEATHER_CA}
                    </p>
                  </div>
                  <button
                    onClick={handleCopy}
                    data-testid="button-copy-ca-bot"
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-primary/20 hover:bg-primary/40 text-primary transition-colors"
                  >
                    {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <a
                  href={`https://app.uniswap.org/swap?outputCurrency=${FEATHER_CA}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="link-buy-feather-bot"
                  className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-black transition-all hover:opacity-90 hover:-translate-y-0.5 whitespace-nowrap"
                  style={{ background: "#00C805" }}
                >
                  Buy $FEATHER on Uniswap
                </a>
              </div>
            </div>
          </motion.div>

          {/* Bot CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-20"
          >
            <a
              href={`https://t.me/${BOT_USERNAME}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-7 py-4 rounded-xl font-bold text-base
                       bg-[#26A5E4] text-white
                       hover:shadow-[0_0_30px_rgba(38,165,228,0.4)] hover:-translate-y-1
                       transition-all duration-300"
              data-testid="link-start-telegram-bot"
            >
              <Send className="w-5 h-5" />
              Start Bot on Telegram
            </a>
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-7 py-4 rounded-xl font-bold text-base
                       bg-[#5865F2] text-white
                       hover:shadow-[0_0_30px_rgba(88,101,242,0.4)] hover:-translate-y-1
                       transition-all duration-300"
              data-testid="link-add-discord-bot"
            >
              <SiDiscord className="w-5 h-5" />
              Add Discord Bot
            </a>
          </motion.div>

          {/* ── Recent Deployments ──────────────────────────────── */}
          <div id="recent">
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
              <div>
                <h3 className="text-2xl md:text-4xl font-black mb-2">
                  Recent <span className="text-primary text-glow-secondary">Deployments</span>
                </h3>
                <p className="text-muted-foreground text-sm">The latest tokens brought to life by Feather App.</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-primary font-mono bg-primary/10 px-4 py-2 rounded-full border border-primary/20 self-start md:self-auto">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
                Live Feed
              </div>
            </div>

            {launchesLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-80 rounded-2xl bg-card/40 animate-pulse border border-border" />
                ))}
              </div>
            ) : launchesError ? (
              <div className="text-center py-20 glass-panel rounded-2xl border-destructive/20">
                <Terminal className="w-12 h-12 text-destructive mx-auto mb-4" />
                <h4 className="text-xl font-bold mb-2">Failed to load feed</h4>
                <p className="text-muted-foreground text-sm">Our nodes are experiencing temporary interference.</p>
              </div>
            ) : launches && launches.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {launches.map((launch, idx) => (
                  <motion.div
                    key={launch.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: (idx % 4) * 0.1 }}
                    className="h-full"
                  >
                    <LaunchCard launch={launch} />
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 glass-panel rounded-2xl">
                <h4 className="text-xl font-bold mb-2">No deployments yet</h4>
                <p className="text-muted-foreground">Be the first to launch a token today.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
