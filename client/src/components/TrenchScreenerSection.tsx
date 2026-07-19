import { motion } from "framer-motion";
import { BarChart2, Bell, Shield, TrendingUp, Zap, Eye } from "lucide-react";

const details = [
  { icon: Zap, title: "Lightning-Fast Charts", desc: "Dexscreener-style charts for every Uniswap token — optimized for mobile traders.", color: "bg-primary" },
  { icon: Shield, title: "Bundler & Sniper Detection", desc: "Bundled wallets, coordinated buys, and known bot addresses are flagged automatically.", color: "bg-red-500" },
  { icon: Eye, title: "Whale Tracking", desc: "Early volume spikes and large wallet movements surface before they hit CT.", color: "bg-cyan-500" },
  { icon: TrendingUp, title: "On-Chain Sniping Data", desc: "Block-by-block sniping history so you know exactly how clean a launch was.", color: "bg-emerald-500" },
  { icon: Bell, title: "Integrated Alerts", desc: "Price, volume, or wallet alerts that fire straight to your Discord or Telegram.", color: "bg-amber-500" },
  { icon: BarChart2, title: "No Paywalls. Ever.", desc: "Zero premium tiers for core chart access. $FEATHER holders get priority alert delivery.", color: "bg-emerald-600" },
];

function ChartMockup() {
  const bars = [22, 35, 28, 45, 38, 52, 41, 68, 55, 72, 60, 85, 70, 92, 78];
  const maxBar = Math.max(...bars);
  return (
    <div className="bg-black/60 border border-border rounded-xl overflow-hidden text-left w-full">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
        <span className="text-xs text-muted-foreground ml-2 font-mono">Feather Screener</span>
        <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30">● LIVE</span>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-xs font-black text-black">M</div>
              <span className="font-bold text-sm">$MOON</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">2 snipers</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">uniswap · Bonding curve 34%</p>
          </div>
          <div className="text-right">
            <div className="text-sm font-black text-emerald-400">$0.000042</div>
            <div className="text-[10px] text-emerald-400 font-semibold">+127.4% 1h</div>
          </div>
        </div>
        <div className="flex items-end gap-0.5 h-20 mb-2">
          {bars.map((h, i) => {
            const heightPct = (h / maxBar) * 100;
            const isRecent = i >= bars.length - 3;
            return (
              <div key={i} className="flex-1 rounded-sm transition-all" style={{
                height: `${heightPct}%`,
                background: isRecent ? "#00C805" : i % 2 === 0 ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.08)",
              }} />
            );
          })}
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {[{ label: "Vol 1h", value: "47 ETH", color: "text-foreground" }, { label: "MC", value: "$38K", color: "text-amber-400" }, { label: "Holders", value: "142", color: "text-cyan-400" }].map((s) => (
            <div key={s.label} className="bg-muted/50 rounded-lg py-1.5 px-1">
              <div className={`text-xs font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TrenchScreenerSection() {
  return (
    <section className="py-12 px-4 relative z-10 border-t border-border/50">
      <div className="max-w-7xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold uppercase tracking-widest mb-3">
            <BarChart2 className="w-3.5 h-3.5" />Feather Screener
          </div>
          <h2 className="text-2xl md:text-4xl font-black mb-2">
            Charts built for{" "}
            <span className="text-cyan-400">real traders</span>
          </h2>
          <p className="text-muted-foreground text-sm max-w-xl leading-relaxed">
            Native to Uniswap — with sniping data, whale alerts, and bot notifications. No paywalls. No rate limits. Just signal.
          </p>
        </motion.div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
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
          <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="relative">
            <div className="absolute inset-0 bg-cyan-500/8 rounded-full blur-[60px] pointer-events-none" />
            <ChartMockup />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
