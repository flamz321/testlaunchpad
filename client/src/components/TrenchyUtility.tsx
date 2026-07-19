import { motion } from "framer-motion";
import { Copy, CheckCheck } from "lucide-react";
import { useState } from "react";

import { FEATHER_TOKEN_ADDRESS } from "@shared/chain";
const FEATHER_CA = FEATHER_TOKEN_ADDRESS;

const perks = [
  { tier: "0 $FEATHER",   cols: "1 launch/day",  community: "Read-only Feed" },
  { tier: "250k",         cols: "8 launches/day", community: "Post + Bounties + Follow (Member)" },
  { tier: "500k",         cols: "12 launches/day",community: "Private DMs unlocked (Elite)" },
  { tier: "1M+",          cols: "24 launches/day",community: "VIP Lounge access (Verified)" },
];

const benefits = [
  "More daily launches (1 → 24)",
  "Token-gated Market Signals & historical data",
  "Community Feed: post alpha, follow traders, earn bounties",
  "Private DMs at Elite tier (500k+)",
  "VIP Lounge & Verified badge at 1M+",
  "Priority Feather Screener alerts",
];

export function TrenchyUtility() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(FEATHER_CA);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="py-20 px-4 relative z-10">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="glass-panel rounded-3xl p-10 md:p-14 relative overflow-hidden"
        >
          {/* Glow */}
          <div className="absolute top-0 right-0 w-72 h-72 bg-primary/10 rounded-full blur-[80px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-secondary/10 rounded-full blur-[60px] pointer-events-none" />

          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/15 border border-primary/30 text-primary text-xs font-bold uppercase tracking-widest mb-6">
              $FEATHER Holders
            </div>

            <h2 className="text-3xl md:text-4xl font-black mb-4">
              Hold $FEATHER ={" "}
              <span className="text-primary">
                Get the Real Edge
              </span>
            </h2>
            <p className="text-muted-foreground text-base mb-8 max-w-2xl">
              Your token isn't just a meme — it's your VIP pass. Every $FEATHER holder gets
              real, tangible advantages that traders without it simply don't have.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
              {/* Benefits list */}
              <div>
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-4">Holder Benefits</h3>
                <ul className="space-y-3">
                  {benefits.map((b, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      <span className="text-muted-foreground">{b}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Tiers */}
              <div>
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-4">$FEATHER Tiers</h3>
                <div className="space-y-0">
                  <div className="grid grid-cols-3 gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest pb-2 border-b border-border px-1">
                    <span>Balance</span>
                    <span>Launches</span>
                    <span>Community</span>
                  </div>
                  {perks.map((p, i) => (
                    <div key={i} className="grid grid-cols-3 gap-2 items-start py-2.5 border-b border-border text-xs px-1 last:border-0">
                      <span className={i === 0 ? "text-muted-foreground" : "text-primary font-semibold font-mono"}>{p.tier}</span>
                      <span className="font-semibold">{p.cols}</span>
                      <span className="text-muted-foreground">{p.community}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* CA + CTA */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex items-center gap-3 flex-1 px-4 py-3 rounded-xl bg-black/40 border border-border min-w-0">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-primary uppercase tracking-widest mb-0.5">CA</p>
                  <p className="font-mono text-xs text-foreground truncate" data-testid="text-feather-ca-utility">
                    {FEATHER_CA}
                  </p>
                </div>
                <button
                  onClick={handleCopy}
                  data-testid="button-copy-ca-utility"
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
                data-testid="link-buy-feather"
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-black transition-all hover:opacity-90 hover:-translate-y-0.5 whitespace-nowrap"
                style={{ background: "#00C805" }}
              >
                Buy $FEATHER on Uniswap
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
