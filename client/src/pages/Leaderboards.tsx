import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { SocialLayout } from "@/components/SocialLayout";
import { SponsoredSidebar } from "@/components/SponsoredSidebar";
import { TierBadge } from "@/components/TierBadge";
import { SocialAdSpot } from "@/components/SocialAdSpot";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Rocket, MessageCircle, Flame, Crown } from "lucide-react";

interface LeaderboardEntry {
  walletAddress: string;
  username: string | null;
  profileImageIpfsCid: string | null;
  score: number;
  rawCount: number;
  tier: number;
}

type Category = "launchers" | "active" | "commenters";
type Period = "weekly" | "monthly";

function Avatar({ cid, username }: { cid: string | null; username: string | null }) {
  const src = cid ? `https://gateway.pinata.cloud/ipfs/${cid}` : null;
  return src
    ? <img src={src} alt={username ?? "?"} className="w-10 h-10 rounded-full object-cover border border-border/40" />
    : (
      <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-sm">
        {username ? username.slice(0, 2).toUpperCase() : "??"}
      </div>
    );
}

function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-yellow-400 font-bold text-lg">🥇</span>;
  if (rank === 2) return <span className="text-slate-300 font-bold text-lg">🥈</span>;
  if (rank === 3) return <span className="text-amber-600 font-bold text-lg">🥉</span>;
  return <span className="text-muted-foreground font-mono text-sm w-6 text-center">{rank}</span>;
}

export default function Leaderboards() {
  const [category, setCategory] = useState<Category>("launchers");
  const [period, setPeriod] = useState<Period>("weekly");

  const { data: entries = [], isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/leaderboard", category, period],
    queryFn: () => fetch(`/api/leaderboard?category=${category}&period=${period}`).then((r) => r.json()),
  });

  const categories: { id: Category; label: string; icon: React.ReactNode; unit: string }[] = [
    { id: "launchers", label: "Top Launchers", icon: <Rocket className="w-4 h-4" />, unit: "launches" },
    { id: "active", label: "Most Active", icon: <Flame className="w-4 h-4" />, unit: "posts" },
    { id: "commenters", label: "Top Commenters", icon: <MessageCircle className="w-4 h-4" />, unit: "comments" },
  ];

  const activeCategory = categories.find((c) => c.id === category)!;

  return (
    <SocialLayout rightSidebar={<SponsoredSidebar placement="leaderboard" />}>
      {/* Sticky header */}
      <div className="sticky top-14 lg:top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-[17px] font-bold flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-400" />
            Leaderboards
          </h1>
          <div className="flex gap-1 p-1 bg-muted rounded-lg">
            {(["weekly", "monthly"] as Period[]).map((p) => (
              <button
                key={p}
                data-testid={`button-period-${p}`}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 rounded text-xs font-medium transition-all ${period === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {p === "weekly" ? "Week" : "Month"}
              </button>
            ))}
          </div>
        </div>

        {/* Category underline tabs */}
        <div className="flex border-b border-border">
          {categories.map((c) => (
            <button
              key={c.id}
              data-testid={`tab-leaderboard-${c.id}`}
              onClick={() => setCategory(c.id)}
              className={`flex items-center gap-1.5 flex-1 justify-center py-3 text-sm font-medium relative transition-colors ${
                category === c.id ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
            >
              {c.icon}
              <span className="hidden sm:inline">{c.label}</span>
              <span className="sm:hidden">{c.id === "launchers" ? "Launchers" : c.id === "active" ? "Active" : "Comments"}</span>
              {category === c.id && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-[3px] rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4 space-y-2">
        <p className="text-xs text-muted-foreground mb-3">
          Weekly &amp; monthly top Trenchers · Elite tier = 2× points
        </p>

        {isLoading
          ? Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)
          : entries.length === 0
            ? (
              <div className="text-center py-16 text-muted-foreground">
                <Trophy className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No data for this period yet</p>
              </div>
            )
            : entries.map((entry, i) => (
              <div
                key={entry.walletAddress}
                data-testid={`row-leaderboard-${i + 1}`}
                className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${i < 3 ? "bg-card border-primary/20 hover:border-primary/40" : "bg-card/50 border-border/40 hover:border-border/70"}`}
              >
                <div className="w-8 flex items-center justify-center shrink-0">
                  <RankMedal rank={i + 1} />
                </div>
                <Avatar cid={entry.profileImageIpfsCid} username={entry.username} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {entry.username
                      ? <Link href={`/u/${entry.walletAddress}`} className="font-semibold hover:text-primary transition-colors text-sm" data-testid={`link-profile-${entry.walletAddress}`}>@{entry.username}</Link>
                      : <span className="font-mono text-xs text-muted-foreground">{entry.walletAddress.slice(0, 8)}…</span>
                    }
                    <TierBadge tier={entry.tier} size="sm" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {entry.rawCount} {activeCategory.unit}
                    {entry.tier >= 2 && <span className="text-blue-400 ml-1">× 2 multiplier</span>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-lg font-mono text-primary" data-testid={`text-score-${i + 1}`}>{entry.score.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">pts</div>
                </div>
              </div>
            ))
        }

        {/* Tier info */}
        <div className="mt-8 p-5 rounded-xl border border-border/40 bg-card/50">
          <div className="flex items-center gap-2 mb-3">
            <Crown className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-semibold">Tier Multipliers</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2"><TierBadge tier={1} size="sm" /> 250k+ $FEATHER — 1× points</div>
            <div className="flex items-center gap-2"><TierBadge tier={2} size="sm" /> 500k+ $FEATHER — 2× points + DMs</div>
            <div className="flex items-center gap-2"><TierBadge tier={3} size="sm" /> 1M+ $FEATHER — 2× points + VIP</div>
          </div>
        </div>

        <SocialAdSpot placement="leaderboard" className="mt-4" />
      </div>
    </SocialLayout>
  );
}
