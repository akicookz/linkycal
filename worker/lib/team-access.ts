import { and, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import * as dbSchema from "../db/schema";
import type {
  ProjectAccessContext,
  ProjectRole,
  TeamRole,
} from "../types";

type AppDatabase = DrizzleD1Database<Record<string, unknown>>;

export type ProjectPermission =
  | "project:read"
  | "project:write"
  | "project:settings"
  | "project:api_keys"
  | "project:members"
  | "project:delete";

export interface TeamBillingReadContext {
  team: dbSchema.TeamRow;
  member: dbSchema.TeamMemberRow;
  canManageBilling: boolean;
}

interface UserIdentity {
  id: string;
  name: string;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "team";
}

export async function ensurePersonalTeam(
  db: AppDatabase,
  user: UserIdentity,
): Promise<dbSchema.TeamRow> {
  const [existing] = await db
    .select()
    .from(dbSchema.teams)
    .where(eq(dbSchema.teams.ownerUserId, user.id))
    .limit(1);

  if (existing) {
    await ensureOwnerMembership(db, existing.id, user.id);
    return existing;
  }

  const id = crypto.randomUUID();
  const baseName = user.name?.trim() || "Personal";
  const name = `${baseName}'s Team`;
  const slug = `${slugify(baseName)}-${crypto.randomUUID().slice(0, 8)}`;

  await db.insert(dbSchema.teams).values({
    id,
    ownerUserId: user.id,
    name,
    slug,
  });
  await ensureOwnerMembership(db, id, user.id);

  const [team] = await db
    .select()
    .from(dbSchema.teams)
    .where(eq(dbSchema.teams.id, id))
    .limit(1);

  if (!team) {
    throw new Error(`Failed to create personal team for user ${user.id}`);
  }

  return team;
}

export async function ensureOwnerMembership(
  db: AppDatabase,
  teamId: string,
  userId: string,
): Promise<dbSchema.TeamMemberRow> {
  const [existing] = await db
    .select()
    .from(dbSchema.teamMembers)
    .where(
      and(
        eq(dbSchema.teamMembers.teamId, teamId),
        eq(dbSchema.teamMembers.userId, userId),
      ),
    )
    .limit(1);

  if (existing) {
    if (existing.role !== "owner") {
      await db
        .update(dbSchema.teamMembers)
        .set({ role: "owner" })
        .where(eq(dbSchema.teamMembers.id, existing.id));
      return { ...existing, role: "owner" };
    }
    return existing;
  }

  const id = crypto.randomUUID();
  await db.insert(dbSchema.teamMembers).values({
    id,
    teamId,
    userId,
    role: "owner",
  });

  const [member] = await db
    .select()
    .from(dbSchema.teamMembers)
    .where(eq(dbSchema.teamMembers.id, id))
    .limit(1);

  if (!member) {
    throw new Error(`Failed to create owner membership for team ${teamId}`);
  }

  return member;
}

export async function getTeamMembership(
  db: AppDatabase,
  teamId: string,
  userId: string,
): Promise<dbSchema.TeamMemberRow | null> {
  const [member] = await db
    .select()
    .from(dbSchema.teamMembers)
    .where(
      and(
        eq(dbSchema.teamMembers.teamId, teamId),
        eq(dbSchema.teamMembers.userId, userId),
      ),
    )
    .limit(1);

  return member ?? null;
}

export async function getTeamBillingReadContext(
  db: AppDatabase,
  teamId: string,
  userId: string,
): Promise<TeamBillingReadContext | null> {
  const [team] = await db
    .select()
    .from(dbSchema.teams)
    .where(eq(dbSchema.teams.id, teamId))
    .limit(1);
  if (!team) return null;

  let member = await getTeamMembership(db, teamId, userId);
  if (!member && team.ownerUserId === userId) {
    member = await ensureOwnerMembership(db, teamId, userId);
  }
  if (!member) return null;

  return {
    team,
    member,
    canManageBilling: member.role === "owner" || member.role === "admin",
  };
}

export async function resolveProjectAccess(
  db: AppDatabase,
  projectId: string,
  userId: string,
): Promise<ProjectAccessContext | null> {
  const [project] = await db
    .select({
      id: dbSchema.projects.id,
      userId: dbSchema.projects.userId,
      teamId: dbSchema.projects.teamId,
    })
    .from(dbSchema.projects)
    .where(eq(dbSchema.projects.id, projectId))
    .limit(1);

  if (!project) return null;

  if (!project.teamId) {
    if (project.userId !== userId) return null;
    return {
      projectId,
      teamId: null,
      ownerUserId: project.userId,
      teamMemberId: null,
      teamRole: "owner",
      projectMemberId: null,
      projectRole: "admin",
      effectiveProjectRole: "admin",
      isLegacyOwner: true,
    };
  }

  const [team] = await db
    .select({
      id: dbSchema.teams.id,
      ownerUserId: dbSchema.teams.ownerUserId,
    })
    .from(dbSchema.teams)
    .where(eq(dbSchema.teams.id, project.teamId))
    .limit(1);

  if (!team) {
    if (project.userId !== userId) return null;
    return {
      projectId,
      teamId: null,
      ownerUserId: project.userId,
      teamMemberId: null,
      teamRole: "owner",
      projectMemberId: null,
      projectRole: "admin",
      effectiveProjectRole: "admin",
      isLegacyOwner: true,
    };
  }

  let teamMember = await getTeamMembership(db, team.id, userId);
  if (!teamMember && team.ownerUserId === userId) {
    teamMember = await ensureOwnerMembership(db, team.id, userId);
  }
  if (!teamMember) return null;

  const teamRole = teamMember.role as TeamRole;
  if (teamRole === "owner" || teamRole === "admin") {
    return {
      projectId,
      teamId: team.id,
      ownerUserId: team.ownerUserId,
      teamMemberId: teamMember.id,
      teamRole,
      projectMemberId: null,
      projectRole: "admin",
      effectiveProjectRole: "admin",
      isLegacyOwner: false,
    };
  }

  const [grant] = await db
    .select()
    .from(dbSchema.projectMembers)
    .where(
      and(
        eq(dbSchema.projectMembers.projectId, projectId),
        eq(dbSchema.projectMembers.teamMemberId, teamMember.id),
      ),
    )
    .limit(1);

  if (!grant) return null;

  return {
    projectId,
    teamId: team.id,
    ownerUserId: team.ownerUserId,
    teamMemberId: teamMember.id,
    teamRole,
    projectMemberId: grant.id,
    projectRole: grant.role as ProjectRole,
    effectiveProjectRole: grant.role as ProjectRole,
    isLegacyOwner: false,
  };
}

export function hasProjectPermission(
  access: ProjectAccessContext,
  permission: ProjectPermission,
): boolean {
  if (access.teamRole === "owner" || access.teamRole === "admin") {
    return true;
  }

  if (permission === "project:read") return true;

  const role = access.effectiveProjectRole;
  if (role === "admin") {
    return permission !== "project:members" && permission !== "project:delete";
  }

  if (role === "editor") {
    return permission === "project:write";
  }

  return false;
}

export function requiredProjectPermission(
  method: string,
  path: string,
): ProjectPermission {
  const normalizedMethod = method.toUpperCase();
  if (path.includes("/api-keys")) return "project:api_keys";
  if (path.includes("/mcp-connections")) return "project:api_keys";
  if (path.includes("/members")) {
    return normalizedMethod === "GET" || normalizedMethod === "HEAD"
      ? "project:read"
      : "project:members";
  }
  if (path.includes("/calendar/")) return "project:write";
  if (path.includes("/calendars")) return "project:write";
  if (
    path.includes("/custom-css") &&
    normalizedMethod !== "GET" &&
    normalizedMethod !== "HEAD"
  ) {
    return "project:settings";
  }
  if (normalizedMethod === "PUT" && /^\/api\/projects\/[^/]+$/.test(path)) {
    return "project:settings";
  }
  if (
    normalizedMethod === "DELETE" &&
    /^\/api\/projects\/[^/]+$/.test(path)
  ) {
    return "project:delete";
  }
  if (normalizedMethod === "GET" || normalizedMethod === "HEAD") {
    return "project:read";
  }
  return "project:write";
}
