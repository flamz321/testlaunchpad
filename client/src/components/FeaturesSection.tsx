import { motion } from "framer-motion";
import { Send, BarChart2, Activity } from "lucide-react";

const features = [
  {
    icon: Send,
    accent: "bg-primary",
    label: "Feather Launcher Bots",
    sublabel: "Telegram + Discord",
    headline: "Launch in 6 seconds flat.",
    points: [
      "/launch + name + ticker + image",
      "Launch on Uniswap",
      "Route fees to any wallet",
      "Cashback mode optional",
      "1 free launch/day (0 $FEATHER) → 8/day (250k $FEATHER) → 24/day (1M+ $FEATHER)",
    ],
    footer: "100% free forever. Bots stay online thanks to your fees.",
    footerColor: "text-primary",
  },
  {
    icon: BarChart2,
    accent: "bg-cyan-500",
    label: "Feather Screener",
    sublabel: "Charts for Robinhood Chain",
    headline: "Charts built for real traders.",
    points: [
      "Lightning-fast charts for Uniswap tokens",
      "No premium paywalls or rate limits that kill mobile traders",
      "On-chain sniping data, bundler/sniper detection",
      "Early volume spikes & whale alerts",
      "Integrated alerts straight to your Discord/Telegram",
    ],
    footer: "Affordable. Accurate. Chain-native.",
    footerColor: "text-cyan-400",
  },
  {
    icon: Activity,
    accent: "bg-emerald-600",
    label: "Market Signal Dashboard",
    sublabel: "Know before you launch or ape",
    headline: "Real-time Robinhood Chain pulse.",
    points: [
      "Tokens launched in last 24h",
      "Graduation rate & MC milestones tracked",
      "Market sentiment score (Green/Red)",
      "Historical charts & trends",
      "Token-gated premium views for $FEATHER holders",
    ],
    footer: "Never launch blind again.",
    footerColor: "text-primary",
  },
];

export function FeaturesSection() {
  return (
    <section className="py-20 px-4 relative z-10">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <h2 className="text-3xl md:text-5xl font-black mb-4">
            Everything you need to{" "}
            <span className="text-primary">
              dominate the market
            </span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Three tools. One platform. Built for Robinhood Chain traders who don't have time for bloated, overpriced dashboards.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.12 }}
              className="glass-panel rounded-3xl p-8 flex flex-col"
            >
              {/* Header */}
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${f.accent} mb-5`}>
                <f.icon className="w-6 h-6 text-white" />
              </div>
              <div className="mb-1">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{f.sublabel}</span>
              </div>
              <h3 className="text-xl font-bold mb-1">{f.label}</h3>
              <p className="text-sm text-muted-foreground mb-5">{f.headline}</p>

              {/* Points */}
              <ul className="space-y-2.5 flex-1 mb-6">
                {f.points.map((p, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>

              {/* Footer note */}
              <div className={`text-sm font-semibold ${f.footerColor} border-t border-border pt-4`}>
                {f.footer}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
