import { useQuery } from "@tanstack/react-query";
import { Crown, Star, Zap } from "lucide-react";

export interface TierInfo {
  balance: number;
  tier: number;
  label: string;
  vipAccess: boolean;
  dmAccess: boolean;
  priorityFeed: boolean;
}

export function getTierFromBalance(balance: number): number {
  if (balance >= 1_000_000) return 3;
  if (balance >= 500_000) return 2;
  if (balance >= 250_000) return 1;
  return 0;
}

export function useTier(wallet: string | null | undefined) {
  return useQuery<TierInfo>({
    queryKey: ["/api/tier", wallet],
    queryFn: () => fetch(`/api/tier/${wallet}`).then((r) => r.json()),
    enabled: !!wallet,
    staleTime: 60_000,
  });
}

interface TierBadgeProps {
  tier: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

const TIER_CONFIG = {
  1: {
    label: "Trencher",
    icon: Zap,
    className: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    iconClass: "text-emerald-400",
  },
  2: {
    label: "Elite",
    icon: Star,
    className: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
    iconClass: "text-blue-400",
  },
  3: {
    label: "Verified Trencher",
    icon: Crown,
    className: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
    iconClass: "text-yellow-400",
  },
};

export function TierBadge({ tier, size = "sm", showLabel = true }: TierBadgeProps) {
  if (tier < 1) return null;
  const config = TIER_CONFIG[tier as 1 | 2 | 3];
  if (!config) return null;
  const Icon = config.icon;

  const sizes = {
    sm: { badge: "px-1.5 py-0.5 text-xs gap-1 rounded", icon: "w-3 h-3" },
    md: { badge: "px-2 py-1 text-xs gap-1.5 rounded-md", icon: "w-3.5 h-3.5" },
    lg: { badge: "px-3 py-1.5 text-sm gap-2 rounded-md font-semibold", icon: "w-4 h-4" },
  };

  const s = sizes[size];

  return (
    <span
      data-testid={`badge-tier-${tier}`}
      className={`inline-flex items-center font-medium ${s.badge} ${config.className}`}
    >
      <Icon className={`${s.icon} ${config.iconClass}`} />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}
