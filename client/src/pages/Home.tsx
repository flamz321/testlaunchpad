import { lazy, Suspense, useRef, useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Footer } from "@/components/Footer";

const WhyTrenchy            = lazy(() => import("@/components/WhyTrenchy").then(m => ({ default: m.WhyTrenchy })));
const CommunitySection      = lazy(() => import("@/components/CommunitySection").then(m => ({ default: m.CommunitySection })));
const TrenchScreenerSection = lazy(() => import("@/components/TrenchScreenerSection").then(m => ({ default: m.TrenchScreenerSection })));
const MarketSignalSection   = lazy(() => import("@/components/MarketSignalSection").then(m => ({ default: m.MarketSignalSection })));
const Roadmap               = lazy(() => import("@/components/Roadmap").then(m => ({ default: m.Roadmap })));

function LazySection({ children, minHeight = 480 }: { children: React.ReactNode; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={ref}>
      {visible ? (
        <Suspense fallback={<div style={{ minHeight }} />}>
          {children}
        </Suspense>
      ) : (
        <div style={{ minHeight }} aria-hidden="true" />
      )}
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Hero />

        <LazySection minHeight={520}>
          <WhyTrenchy />
        </LazySection>

        <LazySection minHeight={480}>
          <CommunitySection />
        </LazySection>

        <LazySection minHeight={480}>
          <TrenchScreenerSection />
        </LazySection>

        <LazySection minHeight={480}>
          <MarketSignalSection />
        </LazySection>

        <LazySection minHeight={400}>
          <Roadmap />
        </LazySection>
      </main>
      <Footer />
    </div>
  );
}
