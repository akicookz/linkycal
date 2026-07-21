import type { ComponentType } from "react";
import { Link } from "react-router-dom";

import { SidebarTrigger, useMaybeSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

interface AppBreadcrumbItem {
  label: string;
  href?: string;
}

interface AppBreadcrumbSection {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}

interface AppBreadcrumbProps {
  section: AppBreadcrumbSection;
  items?: AppBreadcrumbItem[];
  className?: string;
}

export function AppBreadcrumb({
  section,
  items = [],
  className,
}: AppBreadcrumbProps) {
  const sidebar = useMaybeSidebar();
  const SectionIcon = section.icon;

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      {sidebar && (
        <SidebarTrigger className="-ml-1 mr-1 shrink-0 md:hidden" />
      )}
      <Link
        to={section.href}
        className="flex shrink-0 items-center gap-1.5 transition-colors hover:text-foreground"
      >
        <SectionIcon className="h-3.5 w-3.5" />
        <span>{section.label}</span>
      </Link>
      {items.map((item, index) => {
        const isCurrent = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="contents">
            <span aria-hidden="true">/</span>
            {item.href ? (
              <Link
                to={item.href}
                className="truncate transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ) : (
              <span
                aria-current={isCurrent ? "page" : undefined}
                className="truncate text-foreground/70"
              >
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
