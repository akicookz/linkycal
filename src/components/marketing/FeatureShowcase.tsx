import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { LandingSceneSection } from "./LandingScene";
import { featureShowcaseItems } from "./feature-showcase-data";
import type { FeatureShowcaseItem } from "./feature-showcase-data";

interface FeatureShowcasePanelProps {
  item: FeatureShowcaseItem;
  index: number;
  total: number;
}

export function FeatureShowcasePanel({
  item,
  index,
  total,
}: FeatureShowcasePanelProps) {
  const DemoComponent = item.DemoComponent;
  const step = String(index + 1).padStart(2, "0");
  const totalSteps = String(total).padStart(2, "0");
  const progressWidth = `${((index + 1) / total) * 100}%`;

  return (
    <article
      id={item.id}
      className="feature-editorial-panel scroll-mt-32 p-5 sm:p-7 lg:p-8"
    >
      <div className="flex items-center gap-4 mb-7">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-brand" />
          <span className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
            {item.eyebrow}
          </span>
        </div>
        <div className="relative h-px flex-1 bg-brand/12 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-brand"
            style={{ width: progressWidth }}
          />
        </div>
        <span className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground tabular-nums">
          {step}/{totalSteps}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {item.capabilities.map((capability, capabilityIndex) => (
          <div
            key={capability.title}
            className="rounded-[20px] border border-brand/10 bg-white/45 px-4 pt-4 pb-5 backdrop-blur-xl min-h-[112px]"
          >
            <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground tabular-nums mb-3">
              {String(capabilityIndex + 1).padStart(2, "0")}
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-2">
              {capability.title}
            </h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {capability.description}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.92fr)] gap-8 xl:gap-10 items-start border-t border-brand/12 pt-8">
        <div className="space-y-7">
          <h2 className="font-heading max-w-4xl text-[2.75rem] sm:text-[3.35rem] lg:text-[4.15rem] font-medium tracking-tight leading-[0.94] text-foreground">
            {item.title}{" "}
            {item.highlightedTitle && (
              <span className="text-brand">{item.highlightedTitle}</span>
            )}
          </h2>

          <div className="max-w-2xl">
            <p className="text-base leading-relaxed text-muted-foreground">
              {item.description}
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-6">
              <Link
                to={`/features/${item.pageSlug}`}
                className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:text-foreground transition-colors"
              >
                Learn more about {item.railLabel.toLowerCase()}
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/docs"
                className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-brand transition-colors"
              >
                View documentation
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>

        <div className="xl:pl-2">
          <DemoComponent />
        </div>
      </div>
    </article>
  );
}

export function FeatureShowcaseSection() {
  const [activeFeatureShowcase, setActiveFeatureShowcase] = useState(
    featureShowcaseItems[0].id,
  );

  useEffect(() => {
    const panels = featureShowcaseItems
      .map((item) => document.getElementById(item.id))
      .filter((panel): panel is HTMLElement => panel instanceof HTMLElement);

    if (!panels.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visibleEntry?.target.id) {
          setActiveFeatureShowcase(visibleEntry.target.id);
        }
      },
      {
        rootMargin: "-18% 0px -55% 0px",
        threshold: [0.18, 0.35, 0.55, 0.75],
      },
    );

    panels.forEach((panel) => observer.observe(panel));

    return () => observer.disconnect();
  }, []);

  return (
        <LandingSceneSection
          id="feature-showcase"
          fullHeight={false}
          contentClassName="max-w-[90rem]"
        >
          <div className="grid grid-cols-1 lg:grid-cols-[15rem_minmax(0,1fr)] gap-6 lg:gap-8">
            <aside className="lg:w-60 shrink-0 lg:self-start lg:sticky lg:top-28">
              <div className="feature-showcase-rail">
                <div className="text-[10px] uppercase tracking-[0.28em] text-white/70 mb-4">
                  Product Surface
                </div>

                <div className="lg:hidden -mx-1 overflow-x-auto pb-1">
                  <div className="flex min-w-max gap-2 px-1">
                    {featureShowcaseItems.map((item, index) => {
                      const isActive = activeFeatureShowcase === item.id;
                      return (
                        <a
                          key={item.id}
                          href={`#${item.id}`}
                          onClick={() => setActiveFeatureShowcase(item.id)}
                          className={cn(
                            "rounded-full border px-4 py-2 text-[11px] uppercase tracking-[0.24em] transition-colors whitespace-nowrap",
                            isActive
                              ? "border-brand-soft/30 bg-brand-soft/20 text-white"
                              : "border-white/10 text-white/65 hover:text-white hover:border-white/20",
                          )}
                        >
                          {String(index + 1).padStart(2, "0")} {item.railLabel}
                        </a>
                      );
                    })}
                  </div>
                </div>

                <div className="hidden lg:block space-y-1.5">
                  {featureShowcaseItems.map((item, index) => {
                    const isActive = activeFeatureShowcase === item.id;

                    return (
                      <a
                        key={item.id}
                        href={`#${item.id}`}
                        onClick={() => setActiveFeatureShowcase(item.id)}
                        className={cn(
                          "group block rounded-2xl px-3 py-3 transition-colors",
                          isActive && "bg-white/6",
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              "text-[11px] uppercase tracking-[0.24em] tabular-nums transition-colors",
                              isActive ? "text-white" : "text-white/45",
                            )}
                          >
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span
                            className={cn(
                              "text-[11px] uppercase tracking-[0.24em] transition-colors",
                              isActive ? "text-white" : "text-white/62 group-hover:text-white/88",
                            )}
                          >
                            {item.railLabel}
                          </span>
                        </div>
                        <div className="mt-2 h-px bg-white/10 overflow-hidden">
                          <div
                            className={cn(
                              "h-full transition-all duration-300",
                              isActive ? "w-full bg-brand-soft" : "w-0 bg-white/35 group-hover:w-14",
                            )}
                          />
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            </aside>

            <div className="flex-1 space-y-8 lg:space-y-10">
              {featureShowcaseItems.map((item, index) => (
                <FeatureShowcasePanel
                  key={item.id}
                  item={item}
                  index={index}
                  total={featureShowcaseItems.length}
                />
              ))}
            </div>
          </div>
        </LandingSceneSection>
  );
}
