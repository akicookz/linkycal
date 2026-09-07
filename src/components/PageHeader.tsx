import { cn } from "@/lib/utils";
import { SidebarTrigger, useMaybeSidebar } from "@/components/ui/sidebar";

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

function PageHeader({ title, description, children, className }: PageHeaderProps) {
  const sidebar = useMaybeSidebar();

  return (
    <div className={cn("mb-5 min-w-0 sm:mb-8", className)}>
      <div className="flex min-w-0 items-center gap-2">
        {sidebar && <SidebarTrigger className="-ml-1 shrink-0 md:hidden" />}
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight text-foreground md:text-2xl">
          {title}
        </h1>
        {children && (
          <div className="flex shrink-0 items-center gap-1.5">{children}</div>
        )}
      </div>
      {description && (
        <p className="mt-1 text-xs text-pretty text-muted-foreground sm:text-sm">
          {description}
        </p>
      )}
    </div>
  );
}

export default PageHeader;
