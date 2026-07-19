import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

export interface SeoSettings {
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  ogImageUrl: string;
  gaMeasurementId: string;
}

export const SEO_DEFAULTS: SeoSettings = {
  seoTitle: "Feather App - The Premier Platform for Robinhood Chain",
  seoDescription:
    "Feather App brings profiles, feeds, and discovery to Robinhood Chain so you can share setups, track launches, and build reputation next to the markets you trade.",
  seoKeywords: "Feather App, Robinhood Chain, crypto, token launch, DEX, Uniswap",
  ogImageUrl: "https://featherapp.fun/og_image.jpg",
  gaMeasurementId: "G-9XDT0FZ05B",
};

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  if (typeof document === "undefined") return;
  let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function ensureGaScript(measurementId: string) {
  if (typeof window === "undefined" || !measurementId) return;
  const id = measurementId.trim();
  if (!/^G-[A-Z0-9]+$/i.test(id)) return;

  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== "function") {
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer!.push(args);
    };
  }

  const existing = document.querySelector(`script[data-ga-id]`) as HTMLScriptElement | null;
  if (existing?.dataset.gaId === id) {
    window.gtag("config", id, { send_page_view: false });
    return;
  }
  if (existing) existing.remove();

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  script.dataset.gaId = id;
  document.head.appendChild(script);
  window.gtag("js", new Date());
  window.gtag("config", id, { send_page_view: false });
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Apply SEO settings to document head (title, meta, OG, GA). */
export function applySeoSettings(seo: SeoSettings) {
  document.title = seo.seoTitle;
  upsertMeta("name", "description", seo.seoDescription);
  upsertMeta("name", "keywords", seo.seoKeywords);
  upsertMeta("property", "og:title", seo.seoTitle);
  upsertMeta("property", "og:description", seo.seoDescription);
  upsertMeta("property", "og:image", seo.ogImageUrl);
  upsertMeta("property", "og:site_name", "Feather App");
  upsertMeta("name", "twitter:title", seo.seoTitle);
  upsertMeta("name", "twitter:description", seo.seoDescription);
  upsertMeta("name", "twitter:image", seo.ogImageUrl);
  ensureGaScript(seo.gaMeasurementId);
}

/** Loads public SEO settings and keeps <head> in sync (including after admin edits). */
export function SeoHead() {
  const { data } = useQuery<Partial<SeoSettings> & Record<string, string>>({
    queryKey: ["/api/settings"],
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const applied = useRef<string>("");

  useEffect(() => {
    const seo: SeoSettings = {
      seoTitle: data?.seoTitle || SEO_DEFAULTS.seoTitle,
      seoDescription: data?.seoDescription || SEO_DEFAULTS.seoDescription,
      seoKeywords: data?.seoKeywords || SEO_DEFAULTS.seoKeywords,
      ogImageUrl: data?.ogImageUrl || SEO_DEFAULTS.ogImageUrl,
      gaMeasurementId: data?.gaMeasurementId || SEO_DEFAULTS.gaMeasurementId,
    };
    const key = JSON.stringify(seo);
    if (key === applied.current) return;
    applied.current = key;
    applySeoSettings(seo);
  }, [data]);

  return null;
}
