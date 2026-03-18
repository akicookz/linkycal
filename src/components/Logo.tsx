import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  iconOnly?: boolean;
}

function Logo({ size = "md", iconOnly = false }: LogoProps) {
  const sizeClasses = {
    sm: "text-base",
    md: "text-xl",
    lg: "text-2xl",
  };

  return (
    <div className={cn("flex items-center gap-2 font-bold", sizeClasses[size])}>
      <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
        <span
          className="text-[15px] font-extrabold bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent"
          style={{ transform: "rotate(-6deg)", display: "inline-block" }}
        >
          L
        </span>
      </div>
      {!iconOnly && (
        <span className="text-foreground tracking-tight">LinkyCal</span>
      )}
    </div>
  );
}

export { Logo };
