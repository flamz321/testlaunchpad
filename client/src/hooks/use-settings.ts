import { useQuery } from "@tanstack/react-query";

export interface SiteSettings {
  claimFeeUsd: string;
  boost1PriceUsd: string; boost1DurationHours: string;
  boost2PriceUsd: string; boost2DurationHours: string;
  boost3PriceUsd: string; boost3DurationHours: string;
  adBannerPriceUsd: string; adBannerDurationDays: string;
  adSidebarPriceUsd: string; adSidebarDurationDays: string;
  adFeaturedPriceUsd: string; adFeaturedDurationDays: string;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
  ogImageUrl?: string;
  gaMeasurementId?: string;
  swapFeeRecipient?: string;
  swapFeeBps?: string;
  /** Admin-settable $FEATHER contract on Robinhood Chain */
  featherTokenAddress?: string;
}

const DEFAULTS: SiteSettings = {
  claimFeeUsd: "50",
  boost1PriceUsd: "10", boost1DurationHours: "24",
  boost2PriceUsd: "25", boost2DurationHours: "72",
  boost3PriceUsd: "100", boost3DurationHours: "168",
  adBannerPriceUsd: "20", adBannerDurationDays: "7",
  adSidebarPriceUsd: "50", adSidebarDurationDays: "14",
  adFeaturedPriceUsd: "100", adFeaturedDurationDays: "30",
  featherTokenAddress: "0x0000000000000000000000000000000000000000",
};

export function useSettings() {
  const { data, isLoading } = useQuery<SiteSettings>({
    queryKey: ["/api/settings"],
    staleTime: 30_000,
  });
  return { settings: data ?? DEFAULTS, isLoading };
}
