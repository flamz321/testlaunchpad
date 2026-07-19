import { useState } from "react";
import { motion } from "framer-motion";
import { Send, ImageIcon, FileText, Wallet, Globe, Rocket } from "lucide-react";
import { SiDiscord } from "react-icons/si";

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
    desc: "Choose where to launch: Uniswap. Just reply to confirm — that's it.",
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

export function HowItWorks() {
  const [platform, setPlatform] = useState<Platform>("telegram");

  return (
    <section id="how-it-works" className="py-24 px-4 relative z-10">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-5xl font-black mb-4">
            Six steps.{" "}
            <span className="text-primary">
              {platform === "telegram" ? "All in Telegram." : "All in Discord."}
            </span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-lg mb-8">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {steps(platform).map((step, idx) => (
            <motion.div
              key={`${platform}-${idx}`}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08 }}
              className="glass-panel p-8 rounded-3xl relative group"
            >
              <div className="flex items-center justify-between mb-6">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${step.color}`}>
                  <step.icon className="w-7 h-7 text-white" />
                </div>
                <span className="text-5xl font-black text-white/5">{step.step}</span>
              </div>

              <h3 className="text-xl font-bold mb-3">{step.title}</h3>
              <p className="text-muted-foreground leading-relaxed mb-6 text-sm">{step.desc}</p>

              <div className="bg-black/60 px-4 py-3 rounded-xl border border-border font-mono text-sm text-green-400">
                {step.code}
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="mt-16 glass-panel rounded-3xl p-8 max-w-3xl mx-auto"
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
      </div>
    </section>
  );
}
