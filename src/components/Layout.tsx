import { useState, useEffect, useCallback } from "react";
import { Outlet, Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Calendar,
  Clock,
  FileText,
  Users,
  Workflow,
  Settings,
  Key,
  LogOut,
  ChevronDown,
  Plus,
  Check,
  PanelLeftClose,
  User,
  CreditCard,
  X,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { signOut, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { MobileSidebarContext } from "@/lib/mobile-sidebar";

interface Project {
  id: string;
  name: string;
  slug: string;
}

function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ projectId?: string }>();
  const { data: session } = useSession();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      const data = await res.json();
      return data.projects ?? data;
    },
  });

  const currentProject = params.projectId
    ? projects?.find((p) => p.id === params.projectId)
    : projects?.[0];

  useEffect(() => {
    if (!projects || projects.length === 0) return;
    if (params.projectId && !projects.find((p) => p.id === params.projectId)) {
      navigate(`/app/projects/${projects[0].id}`, { replace: true });
    }
  }, [params.projectId, projects, navigate]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const openMobile = useCallback(() => setMobileOpen(true), []);
  const sidebarCtx = { openSidebar: openMobile };

  const mainNav = currentProject
    ? [
        { label: "Dashboard", href: `/app/projects/${currentProject.id}`, icon: LayoutDashboard },
        { label: "Event Types", href: `/app/projects/${currentProject.id}/event-types`, icon: Calendar },
        { label: "Bookings", href: `/app/projects/${currentProject.id}/bookings`, icon: Clock },
        { label: "Forms", href: `/app/projects/${currentProject.id}/forms`, icon: FileText },
        { label: "Contacts", href: `/app/projects/${currentProject.id}/contacts`, icon: Users },
      ]
    : [];

  const toolsNav = currentProject
    ? [
        { label: "Workflows", href: `/app/projects/${currentProject.id}/workflows`, icon: Workflow },
        { label: "API Keys", href: `/app/projects/${currentProject.id}/api-keys`, icon: Key },
        { label: "Settings", href: `/app/projects/${currentProject.id}/settings`, icon: Settings },
      ]
    : [];

  function switchProject(project: Project) {
    setSelectorOpen(false);
    if (params.projectId) {
      const newPath = location.pathname.replace(
        `/projects/${params.projectId}`,
        `/projects/${project.id}`,
      );
      navigate(newPath);
    } else {
      navigate(`/app/projects/${project.id}`);
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  function isActive(item: { label: string; href: string }) {
    return item.label === "Dashboard"
      ? location.pathname === item.href
      : location.pathname.startsWith(item.href);
  }

  function NavLink({ item }: { item: { label: string; href: string; icon: React.ComponentType<{ className?: string }> } }) {
    const active = isActive(item);
    return (
      <Link
        to={item.href}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-[12px] text-[13px] font-medium transition-colors",
          active
            ? "glow-surface-subtle text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <item.icon className={cn("w-[18px] h-[18px] shrink-0", active && "text-foreground")} />
        {!collapsed && item.label}
      </Link>
    );
  }

  const userName = session?.user?.name ?? "User";
  const userEmail = session?.user?.email ?? "";

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200",
          "hidden md:flex",
          collapsed ? "md:w-[68px]" : "md:w-60",
          mobileOpen
            ? "fixed inset-y-0 left-0 z-50 flex w-60"
            : "fixed inset-y-0 left-0 z-50 -translate-x-full md:translate-x-0 md:relative",
        )}
      >
        {/* Logo + Collapse */}
        <div className="flex items-center justify-between px-4 h-14">
          <Link to="/app" className="min-w-0">
            <Logo size="sm" iconOnly={collapsed} />
          </Link>
          <button
            onClick={closeMobile}
            className="p-1 rounded-[8px] hover:bg-accent text-muted-foreground transition-colors md:hidden"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="hidden md:block p-1 rounded-[8px] hover:bg-accent text-muted-foreground transition-colors"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
          {collapsed && (
            <button onClick={() => setCollapsed(false)} className="sr-only">
              Expand
            </button>
          )}
        </div>

        {/* Project Selector */}
        {currentProject && projects && !collapsed && (
          <div className="px-3 pb-3">
            <Popover open={selectorOpen} onOpenChange={setSelectorOpen}>
              <PopoverTrigger asChild>
                <button className="w-full flex items-center gap-2 px-3 py-2 rounded-[12px] border border-border bg-background text-sm hover:bg-accent transition-colors">
                  <span className="truncate font-medium flex-1 text-left text-foreground text-[13px]">
                    {currentProject.name}
                  </span>
                  <ChevronDown
                    className={cn(
                      "w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform",
                      selectorOpen && "rotate-180",
                    )}
                  />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-1">
                <div className="space-y-0.5">
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => switchProject(project)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 rounded-[10px] text-sm text-left transition-colors",
                        project.id === currentProject.id
                          ? "bg-accent text-foreground font-medium"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <span className="flex-1 truncate">{project.name}</span>
                      {project.id === currentProject.id && (
                        <Check className="w-4 h-4 shrink-0 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
                <div className="pt-1" />
                <Link
                  to="/app/new-project"
                  onClick={() => setSelectorOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New Project
                </Link>
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 space-y-5">
          <div className="space-y-0.5">
            {mainNav.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>

          {toolsNav.length > 0 && (
            <div className="space-y-1">
              {!collapsed && (
                <p className="px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Configure
                </p>
              )}
              <div className="space-y-0.5">
                {toolsNav.map((item) => (
                  <NavLink key={item.href} item={item} />
                ))}
              </div>
            </div>
          )}
        </nav>

        {/* User */}
        <div className="px-3 pb-3 pt-2 border-t border-sidebar-border">
          <Popover>
            <PopoverTrigger asChild>
              <button className="w-full flex items-center gap-3 px-2 py-2 rounded-[12px] hover:bg-accent transition-colors">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                  {userName.charAt(0).toUpperCase()}
                </div>
                {!collapsed && (
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-[13px] font-medium text-foreground truncate">
                      {userName}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {userEmail}
                    </p>
                  </div>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-52 p-1">
              <Link
                to="/app/account"
                className="flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <User className="w-4 h-4 shrink-0" />
                My Profile
              </Link>
              <Link
                to="/app/account/billing"
                className="flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <CreditCard className="w-4 h-4 shrink-0" />
                Billing
              </Link>
              <div className="pt-1" />
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                Sign Out
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </aside>

      {/* Main Content */}
      <MobileSidebarContext.Provider value={sidebarCtx}>
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-4 md:p-8">
            <Outlet />
          </div>
        </main>
      </MobileSidebarContext.Provider>
    </div>
  );
}

export default Layout;
