import { motion } from "framer-motion";
import { useLaunches } from "@/hooks/use-launches";
import { LaunchCard } from "./LaunchCard";
import { Terminal } from "lucide-react";

export function RecentLaunches() {
  const { data: launches, isLoading, error } = useLaunches();

  return (
    <section id="recent" className="py-24 px-4 relative z-10">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div>
            <h2 className="text-3xl md:text-4xl font-black mb-3">
              Recent <span className="text-primary text-glow-secondary">Deployments</span>
            </h2>
            <p className="text-muted-foreground">The latest tokens brought to life by Feather App.</p>
          </div>
          
          <div className="flex items-center gap-2 text-sm text-primary font-mono bg-primary/10 px-4 py-2 rounded-full border border-primary/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Live Feed
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-80 rounded-2xl bg-card/40 animate-pulse border border-border" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-20 glass-panel rounded-2xl border-destructive/20">
            <Terminal className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">Failed to load feed</h3>
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
            <h3 className="text-xl font-bold mb-2">No deployments yet</h3>
            <p className="text-muted-foreground">Be the first to launch a token today.</p>
          </div>
        )}
      </div>
    </section>
  );
}
