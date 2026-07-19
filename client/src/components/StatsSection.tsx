import { motion } from "framer-motion";
import { Users, Coins, Activity } from "lucide-react";
import { useStats } from "@/hooks/use-stats";

export function StatsSection() {
  const { data: stats, isLoading } = useStats();

  const statItems = [
    {
      label: "Total Users",
      value: isLoading ? "..." : stats?.totalUsers.toLocaleString() || "0",
      icon: Users,
      color: "text-primary",
      glow: "shadow-glow-primary",
    },
    {
      label: "Tokens Launched",
      value: isLoading ? "..." : stats?.totalLaunches.toLocaleString() || "0",
      icon: Coins,
      color: "text-primary",
      glow: "shadow-glow-secondary",
    },
    {
      label: "Network Status",
      value: "Online",
      icon: Activity,
      color: "text-accent",
      glow: "shadow-[0_0_20px_hsla(var(--accent)/0.2)]",
    }
  ];

  return (
    <section className="py-12 border-y border-border bg-black/20 relative z-20">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {statItems.map((item, idx) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className={`glass-panel p-6 rounded-2xl flex items-center gap-6 ${item.glow} border-t-white/10`}
            >
              <div className={`p-4 rounded-xl bg-black/50 ${item.color}`}>
                <item.icon className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{item.label}</p>
                <h4 className={`text-3xl font-display font-bold ${item.color === 'text-primary' ? 'text-glow-primary' : ''}`}>
                  {item.value}
                </h4>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
