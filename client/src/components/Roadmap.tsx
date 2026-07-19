import { motion } from "framer-motion";
import { SiX } from "react-icons/si";

const milestones = [
  { quarter: "Q1 2026", title: "Feather Screener Live", desc: "Full Market Signal Dashboard + real-time Robinhood Chain ecosystem pulse.", status: "now" },
  { quarter: "Q2 2026", title: "Bot Alerts + Sniper Detection", desc: "Real-time alerts for new launches, bundler/sniper detection direct to your Discord/Telegram.", status: "next" },
  { quarter: "Q3 2026", title: "Mobile App", desc: "Native mobile app with advanced on-chain analytics. Never miss a move.", status: "soon" },
  { quarter: "Long-term", title: "The Only Dashboard You'll Ever Need", desc: "The all-in-one command center for every Robinhood Chain trader. We're shipping fast.", status: "vision" },
];

const statusStyles: Record<string, { bar: string; badge: string; label: string }> = {
  now: { bar: "bg-primary", badge: "bg-primary/20 text-primary border-primary/30", label: "Shipping Now" },
  next: { bar: "bg-secondary", badge: "bg-secondary/20 text-primary border-secondary/30", label: "Up Next" },
  soon: { bar: "bg-cyan-500", badge: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30", label: "Coming Soon" },
  vision: { bar: "bg-amber-500", badge: "bg-amber-500/20 text-amber-400 border-amber-500/30", label: "Vision" },
};

export function Roadmap() {
  return (
    <section className="py-12 px-4 relative z-10 border-t border-border/50">
      <div className="max-w-5xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-8">
          <h2 className="text-2xl md:text-3xl font-black mb-2">
            What's Next —{" "}
            <span className="text-amber-400">We're shipping fast</span>
          </h2>
          <p className="text-muted-foreground text-sm max-w-xl">
            A living roadmap. Follow along and hold tight — Feather is just getting started.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {milestones.map((m, i) => {
            const s = statusStyles[m.status];
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.07 }} className="glass-panel rounded-xl p-5 relative overflow-hidden">
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${s.bar} rounded-l-xl`} />
                <div className="flex items-start justify-between gap-3 mb-2">
                  <span className="font-mono text-xs text-muted-foreground">{m.quarter}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${s.badge}`}>{s.label}</span>
                </div>
                <h3 className="text-sm font-bold mb-1.5">{m.title}</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">{m.desc}</p>
              </motion.div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 pt-2">
          <div className="flex-1 h-px bg-border/50" />
          <a href="https://x.com/featherappfun" target="_blank" rel="noopener noreferrer" data-testid="link-follow-x"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-xs bg-muted/50 border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
            <SiX className="w-3.5 h-3.5" />Follow @featherappfun for live updates
          </a>
          <div className="flex-1 h-px bg-border/50" />
        </div>
      </div>
    </section>
  );
}
