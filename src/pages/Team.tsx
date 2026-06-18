import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Loader, MailPlus, Trash2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/PageHeader";

interface Project {
  id: string;
  name: string;
  teamId: string | null;
}

interface ProjectMemberGrant {
  id: string;
  role: "admin" | "editor" | "viewer";
}

interface ProjectMember {
  teamMemberId: string;
  teamRole: "owner" | "admin" | "member";
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
  projectMember: ProjectMemberGrant | null;
}

interface ProjectMembersResponse {
  members: ProjectMember[];
  planLimits: {
    maxTeamMembers: number;
  };
}

type ProjectRole = "admin" | "editor" | "viewer";

export default function Team() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<ProjectRole>("editor");

  const { data: project } = useQuery<Project>({
    queryKey: ["projects", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch project");
      const data = await res.json();
      return data.project;
    },
    enabled: !!projectId,
  });

  const {
    data: membersData,
    isLoading,
    isError,
  } = useQuery<ProjectMembersResponse>({
    queryKey: ["projects", projectId, "members"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/members`);
      if (!res.ok) throw new Error("Failed to fetch members");
      const data = await res.json();
      return {
        members: data.members ?? [],
        planLimits: data.planLimits ?? { maxTeamMembers: -1 },
      };
    },
    enabled: !!projectId,
  });
  const members = membersData?.members ?? [];
  const canInviteTeamMembers = (membersData?.planLimits.maxTeamMembers ?? -1) !== 0;

  const inviteMutation = useMutation({
    mutationFn: async () => {
      if (!project?.teamId) throw new Error("Project is not attached to a team");
      const res = await fetch(`/api/teams/${project.teamId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail,
          teamRole: "member",
          projectId,
          projectRole: inviteRole,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to send invite");
      return data;
    },
    onSuccess: () => {
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("editor");
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "members"] });
      if (project?.teamId) {
        queryClient.invalidateQueries({ queryKey: ["teams", project.teamId, "members"] });
      }
    },
  });

  const grantMutation = useMutation({
    mutationFn: async ({
      teamMemberId,
      role,
    }: {
      teamMemberId: string;
      role: ProjectRole;
    }) => {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamMemberId, role }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update access");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "members"] });
    },
  });

  const removeGrantMutation = useMutation({
    mutationFn: async (projectMemberId: string) => {
      const res = await fetch(`/api/projects/${projectId}/members/${projectMemberId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to remove access");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "members"] });
    },
  });

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  function roleLabel(member: ProjectMember) {
    if (member.teamRole === "owner") return "Team owner";
    if (member.teamRole === "admin") return "Team admin";
    return member.projectMember?.role ?? "No project access";
  }

  return (
    <div>
      <PageHeader
        title="Team"
        description="Manage who can access this project."
      >
        {canInviteTeamMembers && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4" />
                Invite
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite team member</DialogTitle>
                <DialogDescription>
                  Send an email invite and grant access to this project.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="teammate@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Project role</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(value) => setInviteRole(value as ProjectRole)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {inviteMutation.isError && (
                <p className="text-sm text-destructive">
                  {(inviteMutation.error as Error).message}
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setInviteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => inviteMutation.mutate()}
                  disabled={!inviteEmail.trim() || inviteMutation.isPending}
                >
                  {inviteMutation.isPending ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <MailPlus className="h-4 w-4" />
                  )}
                  Send invite
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project Access</CardTitle>
          <CardDescription>
            Team owners and admins can access every project automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader className="h-4 w-4 animate-spin" />
              Loading members
            </div>
          ) : isError ? (
            <div className="py-8 text-sm text-muted-foreground">
              You do not have permission to manage this project&apos;s team access.
            </div>
          ) : (
            <div className="space-y-2">
              {members.map((member) => {
                const implicitAdmin =
                  member.teamRole === "owner" || member.teamRole === "admin";
                return (
                  <div
                    key={member.teamMemberId}
                    className="flex flex-wrap items-center gap-3 rounded-[16px] bg-muted/50 px-4 py-3"
                  >
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                      {getInitials(member.user.name || member.user.email)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{member.user.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {member.user.email}
                      </p>
                    </div>
                    <Badge variant="secondary">{roleLabel(member)}</Badge>
                    {!implicitAdmin && (
                      <div className="flex items-center gap-2">
                        <Select
                          value={member.projectMember?.role ?? "viewer"}
                          onValueChange={(value) =>
                            grantMutation.mutate({
                              teamMemberId: member.teamMemberId,
                              role: value as ProjectRole,
                            })
                          }
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="editor">Editor</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (member.projectMember) {
                              removeGrantMutation.mutate(member.projectMember.id);
                            }
                          }}
                          disabled={!member.projectMember || removeGrantMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {grantMutation.isError && (
            <p className="mt-4 text-sm text-destructive">
              {(grantMutation.error as Error).message}
            </p>
          )}
          {removeGrantMutation.isError && (
            <p className="mt-4 text-sm text-destructive">
              {(removeGrantMutation.error as Error).message}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
