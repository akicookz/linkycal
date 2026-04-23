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
  BarChart3,
  LogOut,
  ChevronDown,
  Plus,
  Check,
  User,
  CreditCard,
} from "lucide-react";
import { Logo } from "@/components/Logo";
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
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
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
          <div className="flex items-center justify-between gap-2 px-2 h-10 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center">
            <Link
              to="/app"
              className="flex items-center min-w-0 group-data-[collapsible=icon]:hidden"
            >
              <Logo size="sm" />
            </Link>
            <SidebarTrigger className="shrink-0" />
          </div>
          {currentProject && projects && (
            <div className="group-data-[collapsible=icon]:hidden">
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
          <SidebarMenu>
            <SidebarMenuItem>
              <Popover>
                <PopoverTrigger asChild>
                  <SidebarMenuButton size="lg" tooltip={userName}>
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                      {userName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0 text-left group-data-[collapsible=icon]:hidden">
                      <p className="text-[13px] font-medium text-foreground truncate">
                        {userName}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {userEmail}
                      </p>
                    </div>
                  </SidebarMenuButton>
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
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="overflow-x-hidden">
        <div className="p-4 md:p-8">
          <Outlet />
        </div>
      </SidebarInset>
    </>
  );
}

export default Layout;
