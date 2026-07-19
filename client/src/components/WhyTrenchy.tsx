import { motion } from "framer-motion";
import { Send, BarChart2, Activity, UserCircle } from "lucide-react";

const features = [
  {
    icon: Send,
    accent: "bg-[#26A5E4]",
    label: "Feather Launcher Bots",
    sublabel: "Telegram + Discord",
    headline: "Launch in 6 seconds flat.",
    desc: "No dev fees. No middlemen. Just send /launch and your token is live on Uniswap. Creator fees go 100% to your wallet — automatically, forever.",
  },
  {
    icon: BarChart2,
    accent: "bg-cyan-500",
    label: "Feather Screener",
    sublabel: "Charts for Robinhood Chain",
    headline: "Charts built for real traders.",
    desc: "Lightning-fast Robinhood Chain token charts with zero paywalls. Bundler detection, whale alerts, early volume spikes, and integrated Discord/Telegram alerts.",
  },
  {
    icon: Activity,
    accent: "bg-emerald-600",
    label: "Market Signal Dashboard",
    sublabel: "Know before you launch or ape",
    headline: "Real-time Robinhood Chain pulse.",
    desc: "Track tokens launched in the last 24h, graduation rates, MC milestones, and a market sentiment score. Know whether it's a green day to launch or a red day to wait.",
  },
  {
    icon: UserCircle,
    accent: "bg-primary",
    label: "Feather Social Network",
    sublabel: "Profiles · Feeds · DMs · Bounties",
    headline: "Your on-chain reputation starts here.",
    desc: "Claim your @username, post alpha, send DMs, post bounties, and unlock the VIP Lounge — all gated by $FEATHER.",
  },
];

export function WhyTrenchy() {
  return (
    <section className="py-12 px-4 relative z-10 border-t border-border/50">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-8"
        >
          <h2 className="text-2xl md:text-4xl font-black mb-3">
            We're not another{" "}
            <span className="text-destructive">
              bloated dashboard.
            </span>
          </h2>
          <p className="text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-4">
            Built for traders, by traders. The all-in-one platform Robinhood Chain users actually need — not another overpriced VC tool.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-primary"><span className="w-1.5 h-1.5 rounded-full bg-primary" />Creator fees 100% to you</span>
            <span className="flex items-center gap-1.5 text-primary"><span className="w-1.5 h-1.5 rounded-full bg-secondary" />Bots funded by community</span>
            <span className="flex items-center gap-1.5 text-cyan-400"><span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />Token-gated perks</span>
          </div>
        </motion.div>

        <div className="flex items-center gap-4 mb-8">
          <div className="flex-1 h-px bg-border/50" />
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">Everything you need to dominate the market</span>
          <div className="flex-1 h-px bg-border/50" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {features.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="glass-panel rounded-xl p-5 flex gap-4"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${f.accent} shrink-0 mt-0.5`}>
                <f.icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">{f.sublabel}</p>
                <h4 className="text-sm font-bold mb-1">{f.label}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
