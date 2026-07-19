import { motion } from "framer-motion";
import { Activity, TrendingUp, TrendingDown, BarChart2, Clock, Crown } from "lucide-react";

const details = [
  { icon: Activity, title: "Live Token Launch Count", desc: "See how many tokens launched in the last 24h and whether the pace is accelerating or cooling.", color: "bg-fuchsia-600" },
  { icon: TrendingUp, title: "Graduation Rate Tracking", desc: "Know what % of new tokens are graduating from the bonding curve. High graduation = healthy market.", color: "bg-emerald-500" },
  { icon: BarChart2, title: "MC Milestone Tracking", desc: "Track tokens hitting $10K, $50K, $100K, and $1M+ market caps. Filter noise, find the movers.", color: "bg-amber-500" },
  { icon: Clock, title: "Historical Charts & Trends", desc: "Compare today's market against past weeks. Spot seasonal patterns and know when the markets go hot.", color: "bg-cyan-500" },
  { icon: Crown, title: "Token-Gated Premium Views", desc: "$FEATHER holders unlock deeper signal history, advanced filtering, and priority access to new metrics.", color: "bg-violet-600" },
  { icon: Activity, title: "Market Sentiment Score", desc: "A single Green/Red/Neutral score synthesizing launch volume, graduation rate, and MC progression.", color: "bg-primary" },
];

function SignalMockup() {
  const hourlyData = [12, 18, 15, 22, 19, 28, 24, 31, 26, 35, 29, 38];
  return (
    <div className="bg-black/60 border border-border rounded-xl overflow-hidden text-left w-full">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
        <span className="text-xs text-muted-foreground ml-2 font-mono">Market Signal Dashboard</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Overall Sentiment</span>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-black">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
            </span>
            GREEN — Good day to launch
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Launched 24h", value: "1,247", change: "+14%", up: true },
            { label: "Graduation Rate", value: "3.2%", change: "+0.4%", up: true },
            { label: "Hits $100K+", value: "38", change: "-2", up: false },
            { label: "Hits $1M+", value: "4", change: "+1", up: true },
          ].map((s) => (
            <div key={s.label} className="bg-muted/50 rounded-lg p-2.5">
              <div className="text-base font-black">{s.value}</div>
              <div className="text-[10px] text-muted-foreground">{s.label}</div>
              <div className={`flex items-center gap-0.5 text-[10px] font-semibold mt-0.5 ${s.up ? "text-emerald-400" : "text-red-400"}`}>
                {s.up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                {s.change}
              </div>
            </div>
          ))}
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-1.5">Launches per hour (today)</div>
          <div className="flex items-end gap-0.5 h-12">
            {hourlyData.map((h, i) => {
              const maxH = Math.max(...hourlyData);
              const pct = (h / maxH) * 100;
              const isLast = i === hourlyData.length - 1;
              return <div key={i} className={`flex-1 rounded-sm ${isLast ? "bg-fuchsia-500" : "bg-muted"}`} style={{ height: `${pct}%` }} />;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MarketSignalSection() {
  return (
    <section className="py-12 px-4 relative z-10 border-t border-border/50">
      <div className="max-w-7xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/10 border border-secondary/20 text-primary text-xs font-bold uppercase tracking-widest mb-3">
            <Activity className="w-3.5 h-3.5" />Market Signal Dashboard
          </div>
          <h2 className="text-2xl md:text-4xl font-black mb-2">
            Know before you{" "}
            <span className="text-fuchsia-400">launch or ape</span>
          </h2>
          <p className="text-muted-foreground text-sm max-w-xl leading-relaxed">
            Real-time Robinhood Chain ecosystem pulse. Track launch volume, graduation rates, and market sentiment — never launch blind into a dead market again.
          </p>
        </motion.div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="relative">
            <div className="absolute inset-0 bg-secondary/8 rounded-full blur-[60px] pointer-events-none" />
            <SignalMockup />
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {details.map((d, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.07 }} className="glass-panel rounded-xl p-4 flex gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${d.color} shrink-0 mt-0.5`}>
                  <d.icon className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h4 className="font-bold text-xs mb-1">{d.title}</h4>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{d.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
