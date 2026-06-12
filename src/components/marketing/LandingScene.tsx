import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface LandingSceneSectionProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  fullHeight?: boolean;
  id?: string;
}

export function LandingSceneBackground() {
  return (
    <>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center opacity-95 pointer-events-none"
        style={{ backgroundImage: "url('/bg-image.webp')" }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, rgba(255, 255, 255, 0.78) 0%, rgba(248, 252, 249, 0.74) 26%, rgba(244, 250, 246, 0.7) 55%, rgba(249, 252, 250, 0.78) 100%)",
          backdropFilter: "blur(22px)",
          WebkitBackdropFilter: "blur(22px)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at top left, rgba(255, 255, 255, 0.44), transparent 34%), radial-gradient(circle at 80% 18%, rgba(45, 106, 79, 0.18), transparent 30%), radial-gradient(circle at 50% 85%, rgba(27, 67, 50, 0.12), transparent 38%)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute top-[8%] -left-32 h-[28rem] w-[28rem] rounded-full bg-brand/[0.08] blur-[140px] pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute top-[32%] right-[-8rem] h-[24rem] w-[24rem] rounded-full bg-brand-dark/[0.08] blur-[130px] pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute bottom-[6%] left-[18%] h-[22rem] w-[22rem] rounded-full bg-white/40 blur-[120px] pointer-events-none"
      />
    </>
  );
}

export function LandingSceneSection({
  children,
  className,
  contentClassName,
  fullHeight = true,
  id,
}: LandingSceneSectionProps) {
  return (
    <section
      id={id}
      className={cn(
        "relative py-24",
        fullHeight && "min-h-screen flex items-center",
        className,
      )}
    >
      <div className={cn("max-w-7xl mx-auto px-6 w-full", contentClassName)}>
        {children}
      </div>
    </section>
  );
}
