import { useState, useEffect } from "react";
import { Outlet, Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import {
  LayoutDashboard,
  Calendar,
  Clock,
  FileText,
  Users,
  Workflow,
  Settings,
  Key,
  UserPlus,
  BarChart3,
  LogOut,
  ChevronsUpDown,
  Plus,
  User,
  CreditCard,
} from "lucide-react";
import { signOut, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

interface Project {
  id: string;
  name: string;
  slug: string;
  teamId?: string | null;
  teamName?: string | null;
  teamRole?: "owner" | "admin" | "member" | null;
  effectiveProjectRole?: "admin" | "editor" | "viewer" | null;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

function ProjectMark({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[8px] bg-foreground font-semibold text-background",
        size === "md" ? "size-8 text-[11px]" : "size-6 text-[10px]",
      )}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function Layout() {
  return (
    <SidebarProvider>
      <LayoutInner />
    </SidebarProvider>
  );
}

function LayoutInner() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ projectId?: string }>();
  const { data: session } = useSession();
  const posthog = usePostHog();
  const { setOpenMobile, isMobile } = useSidebar();
  const [selectorOpen, setSelectorOpen] = useState(false);

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
  const billingHref = currentProject?.teamId
    ? `/app/account/billing?teamId=${encodeURIComponent(currentProject.teamId)}`
    : "/app/account/billing";

  useEffect(() => {
    if (!projects || projects.length === 0) return;
    if (params.projectId && !projects.find((p) => p.id === params.projectId)) {
      navigate(`/app/projects/${projects[0].id}`, { replace: true });
    }
  }, [params.projectId, projects, navigate]);

  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [location.pathname, isMobile, setOpenMobile]);

  const mainNav: NavItem[] = currentProject
    ? [
        { label: "Dashboard", href: `/app/projects/${currentProject.id}`, icon: LayoutDashboard },
        { label: "Event Types", href: `/app/projects/${currentProject.id}/event-types`, icon: Calendar },
        { label: "Bookings", href: `/app/projects/${currentProject.id}/bookings`, icon: Clock },
        { label: "Forms", href: `/app/projects/${currentProject.id}/forms`, icon: FileText },
        { label: "Contacts", href: `/app/projects/${currentProject.id}/contacts`, icon: Users },
        { label: "Analytics", href: `/app/projects/${currentProject.id}/analytics`, icon: BarChart3 },
      ]
    : [];

  const toolsNav: NavItem[] = currentProject
    ? [
        { label: "Workflows", href: `/app/projects/${currentProject.id}/workflows`, icon: Workflow },
        { label: "MCP & APIs", href: `/app/projects/${currentProject.id}/api-keys`, icon: Key },
        { label: "Team", href: `/app/projects/${currentProject.id}/team`, icon: UserPlus },
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
    posthog?.capture("user_signed_out");
    posthog?.reset();
    await signOut();
    navigate("/");
  }

  function isActive(item: NavItem) {
    return item.label === "Dashboard"
      ? location.pathname === item.href
      : location.pathname.startsWith(item.href);
  }

  const userName = session?.user?.name ?? "User";
  const userEmail = session?.user?.email ?? "";

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          {currentProject && projects && (
            <Popover open={selectorOpen} onOpenChange={setSelectorOpen}>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "flex w-full items-center gap-2 rounded-full bg-muted/60 px-2 py-1.5 text-left transition-colors hover:bg-muted",
                    "group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0",
                  )}
                >
                  <ProjectMark name={currentProject.name} />
                  <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                    <p className="truncate text-sm font-medium text-foreground">
                      {currentProject.name}
                    </p>
                    {currentProject.teamName && (
                      <p className="truncate text-xs text-muted-foreground">
                        {currentProject.teamName}
                      </p>
                    )}
                  </div>
                  <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-1">
                <p className="px-2 py-1.5 text-xs text-muted-foreground">Projects</p>
                <div className="space-y-0.5">
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => switchProject(project)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left text-sm transition-colors",
                        project.id === currentProject.id
                          ? "bg-accent text-foreground font-medium"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <ProjectMark name={project.name} size="sm" />
                      <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    </button>
                  ))}
                </div>
                <div className="pt-1" />
                <Link
                  to="/app/new-project"
                  onClick={() => setSelectorOpen(false)}
                  className="flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Plus className="size-4" />
                  New Project
                </Link>
              </PopoverContent>
            </Popover>
          )}
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {mainNav.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive(item)} tooltip={item.label}>
                      <Link to={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {toolsNav.length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel>Configure</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {toolsNav.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive(item)} tooltip={item.label}>
                        <Link to={item.href}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter>
          <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
            <Popover>
              <PopoverTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  tooltip={userName}
                  className="flex-1 group-data-[collapsible=icon]:flex-none"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {userName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1 text-left group-data-[collapsible=icon]:hidden">
                    <p className="truncate text-[13px] font-medium text-foreground">
                      {userName}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {userEmail}
                    </p>
                  </div>
                </SidebarMenuButton>
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="w-52 p-1">
                <Link
                  to="/app/account"
                  className="flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <User className="h-4 w-4 shrink-0" />
                  My Profile
                </Link>
                <Link
                  to={billingHref}
                  className="flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <CreditCard className="h-4 w-4 shrink-0" />
                  Billing
                </Link>
                <div className="pt-1" />
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  Sign Out
                </button>
              </PopoverContent>
            </Popover>
            <SidebarTrigger className="shrink-0" />
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="overflow-x-hidden overscroll-x-none">
        <div className="min-w-0 overflow-x-hidden p-3 sm:p-4 md:p-8">
          <Outlet />
        </div>
      </SidebarInset>
    </>
  );
}

export default Layout;
