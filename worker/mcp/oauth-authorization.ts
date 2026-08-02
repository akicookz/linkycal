import { eq, inArray, or } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type {
  AuthRequest,
  ClientInfo,
  GrantSummary,
  OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";

import type { McpOAuthScope } from "../../shared/mcp-tools";
import * as dbSchema from "../db/schema";
import { resolveProjectEntitlements } from "../lib/entitlements";
import {
  hasProjectPermission,
  resolveProjectAccess,
} from "../lib/team-access";
import {
  McpOAuthGrantService,
  type McpConnectionDto,
} from "../services/mcp-oauth-grant-service";

type AppDatabase = DrizzleD1Database<Record<string, unknown>>;

export type McpOAuthHelpers = Pick<
  OAuthHelpers,
  | "parseAuthRequest"
  | "lookupClient"
  | "completeAuthorization"
  | "listUserGrants"
  | "revokeGrant"
>;

export interface McpOAuthProps extends Record<string, unknown> {
  connectionId: string;
  userId: string;
  projectId: string;
  scopes: McpOAuthScope[];
}

export interface McpAuthorizationContextDto {
  clientName: string;
  scopes: McpOAuthScope[];
  projects: Array<{ id: string; name: string }>;
}

interface AuthorizationContextInput {
  db: AppDatabase;
  oauth: McpOAuthHelpers;
  request: Request;
  userId: string;
}

type McpAuthorizationDecision =
  | { decision: "approve"; projectId: string }
  | { decision: "deny" };

interface AuthorizationDecisionInput extends AuthorizationContextInput {
  decision: McpAuthorizationDecision;
  createConnectionId?: () => string;
}

interface FindGrantInput {
  oauth: McpOAuthHelpers;
  userId: string;
  connectionId: string;
}

interface ListConnectionsInput {
  db: AppDatabase;
  oauth: McpOAuthHelpers;
  projectId: string;
}

interface RevokeConnectionInput extends ListConnectionsInput {
  connectionId: string;
}

interface McpTokenExchangeInput {
  grantType: string;
  scope: string[];
  requestedScope: string[];
  props: Record<string, unknown>;
}

interface McpTokenExchangeResult {
  accessTokenProps: Record<string, unknown>;
  accessTokenScope: McpOAuthScope[];
  refreshTokenTTL?: number;
}

const SUPPORTED_SCOPES = new Set<McpOAuthScope>([
  "read",
  "write",
  "offline_access",
]);
const MCP_RESOURCE = "https://linkycal.com/api/mcp";
const S256_PKCE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

// ─── Scopes and Client Metadata ─────────────────────────────────────────────

function validateScopes(scopes: string[]): asserts scopes is McpOAuthScope[] {
  for (const scope of scopes) {
    if (!SUPPORTED_SCOPES.has(scope as McpOAuthScope)) {
      throw new Error(`Unsupported OAuth scope: ${scope}`);
    }
  }
}

export function resolveAuthorizationMcpScopes(
  scopes: string[],
): McpOAuthScope[] {
  validateScopes(scopes);
  const resolved = [...scopes] as McpOAuthScope[];
  if (!resolved.includes("read") && !resolved.includes("write")) {
    resolved.unshift("read", "write");
  }
  return Array.from(new Set(resolved));
}

export function resolveEffectiveMcpTokenScopes(
  scopes: string[],
): McpOAuthScope[] {
  validateScopes(scopes);
  return [...scopes];
}

export function mcpTokenExchangeResult(
  options: McpTokenExchangeInput,
): McpTokenExchangeResult {
  const effectiveScopes = resolveEffectiveMcpTokenScopes(
    options.requestedScope,
  );
  const result: McpTokenExchangeResult = {
    accessTokenProps: {
      ...options.props,
      scopes: effectiveScopes,
    },
    accessTokenScope: effectiveScopes,
  };
  if (
    options.grantType === "authorization_code" &&
    !options.scope.includes("offline_access")
  ) {
    result.refreshTokenTTL = 0;
  }
  return result;
}

function isSafeMcpClientCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint > 31 && codePoint !== 127;
}

export function sanitizeMcpClientName(value: string | undefined): string {
  const safe = Array.from(value ?? "")
    .filter(isSafeMcpClientCharacter)
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .trim();
  return safe || "MCP client";
}

function validateClientRedirect(
  request: AuthRequest,
  client: ClientInfo | null,
): ClientInfo {
  if (!client) throw new Error("Unknown OAuth client");
  if (!client.redirectUris.includes(request.redirectUri)) {
    throw new Error("Invalid OAuth redirect URI");
  }
  return client;
}

function validateMcpResource(request: AuthRequest): void {
  const resources = Array.isArray(request.resource)
    ? request.resource
    : request.resource
      ? [request.resource]
      : [];
  if (resources.length !== 1 || resources[0] !== MCP_RESOURCE) {
    throw new Error("Invalid OAuth resource");
  }
}

function validateAuthorizationCodeFlow(request: AuthRequest): void {
  if (request.responseType !== "code") {
    throw new Error("MCP OAuth requires the authorization code flow");
  }
  if (
    request.codeChallengeMethod !== "S256" ||
    !request.codeChallenge ||
    !S256_PKCE_CHALLENGE.test(request.codeChallenge)
  ) {
    throw new Error("MCP OAuth requires a valid S256 PKCE challenge");
  }
}

async function parseAuthorization(
  oauth: McpOAuthHelpers,
  request: Request,
): Promise<{ request: AuthRequest; client: ClientInfo }> {
  const parsed = await oauth.parseAuthRequest(request);
  validateAuthorizationCodeFlow(parsed);
  const client = validateClientRedirect(
    parsed,
    await oauth.lookupClient(parsed.clientId),
  );
  validateMcpResource(parsed);
  return { request: parsed, client };
}

// ─── Eligible Projects ──────────────────────────────────────────────────────

async function listCandidateProjects(
  db: AppDatabase,
  userId: string,
): Promise<Array<{ id: string; name: string }>> {
  const memberships = await db
    .select({ teamId: dbSchema.teamMembers.teamId })
    .from(dbSchema.teamMembers)
    .where(eq(dbSchema.teamMembers.userId, userId));
  const teamIds = memberships.map(function teamId(membership) {
    return membership.teamId;
  });
  const filter =
    teamIds.length > 0
      ? or(
          eq(dbSchema.projects.userId, userId),
          inArray(dbSchema.projects.teamId, teamIds),
        )
      : eq(dbSchema.projects.userId, userId);

  return db
    .select({ id: dbSchema.projects.id, name: dbSchema.projects.name })
    .from(dbSchema.projects)
    .where(filter);
}

async function isEligibleProject(
  db: AppDatabase,
  projectId: string,
  userId: string,
): Promise<boolean> {
  const access = await resolveProjectAccess(db, projectId, userId);
  if (!access || !hasProjectPermission(access, "project:api_keys")) {
    return false;
  }
  const entitlements = await resolveProjectEntitlements(db, projectId);
  return entitlements?.planLimits.mcpAccess === true;
}

async function listEligibleProjects(
  db: AppDatabase,
  userId: string,
): Promise<Array<{ id: string; name: string }>> {
  const candidates = await listCandidateProjects(db, userId);
  const eligibility = await Promise.all(
    candidates.map(async function eligible(candidate) {
      return {
        candidate,
        eligible: await isEligibleProject(db, candidate.id, userId),
      };
    }),
  );
  return eligibility
    .filter(function permitted(result) {
      return result.eligible;
    })
    .map(function project(result) {
      return result.candidate;
    });
}

// ─── Authorization ──────────────────────────────────────────────────────────

export async function loadMcpAuthorizationContext(
  input: AuthorizationContextInput,
): Promise<McpAuthorizationContextDto> {
  const { request, client } = await parseAuthorization(
    input.oauth,
    input.request,
  );
  return {
    clientName: sanitizeMcpClientName(client.clientName),
    scopes: resolveAuthorizationMcpScopes(request.scope),
    projects: await listEligibleProjects(input.db, input.userId),
  };
}

function denialRedirect(request: AuthRequest): string {
  const redirect = new URL(request.redirectUri);
  redirect.searchParams.set("error", "access_denied");
  if (request.state) redirect.searchParams.set("state", request.state);
  return redirect.toString();
}

export async function decideMcpAuthorization(
  input: AuthorizationDecisionInput,
): Promise<string> {
  const { request, client } = await parseAuthorization(
    input.oauth,
    input.request,
  );
  if (input.decision.decision === "deny") {
    return denialRedirect(request);
  }
  if (
    !(await isEligibleProject(
      input.db,
      input.decision.projectId,
      input.userId,
    ))
  ) {
    throw new Error("Project is not eligible for MCP authorization");
  }

  const scopes = resolveAuthorizationMcpScopes(request.scope);
  const connectionId =
    input.createConnectionId?.() ?? crypto.randomUUID();
  const clientName = sanitizeMcpClientName(client.clientName);
  const props: McpOAuthProps = {
    connectionId,
    userId: input.userId,
    projectId: input.decision.projectId,
    scopes,
  };
  const metadata = {
    connectionId,
    projectId: input.decision.projectId,
    clientName,
  };
  const { redirectTo } = await input.oauth.completeAuthorization({
    request,
    userId: input.userId,
    metadata,
    scope: scopes,
    props,
    revokeExistingGrants: false,
  });

  try {
    await new McpOAuthGrantService(input.db).create({
      id: connectionId,
      projectId: input.decision.projectId,
      userId: input.userId,
      clientId: client.clientId,
      clientName,
      scopes,
    });
  } catch (error) {
    const grant = await findProviderGrantByConnectionId({
      oauth: input.oauth,
      userId: input.userId,
      connectionId,
    });
    if (grant) {
      await input.oauth.revokeGrant(grant.id, input.userId);
    }
    throw error;
  }

  return redirectTo;
}

// ─── Grant Reconciliation and Revocation ────────────────────────────────────

export async function findProviderGrantByConnectionId(
  input: FindGrantInput,
): Promise<GrantSummary | null> {
  let cursor: string | undefined;
  do {
    const page = await input.oauth.listUserGrants(input.userId, {
      limit: 100,
      cursor,
    });
    const found = page.items.find(function matchingConnection(grant) {
      return grant.metadata?.connectionId === input.connectionId;
    });
    if (found) return found;
    cursor = page.cursor;
  } while (cursor);
  return null;
}

async function providerConnectionIdsForUser(
  oauth: McpOAuthHelpers,
  userId: string,
): Promise<Set<string>> {
  const connectionIds = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await oauth.listUserGrants(userId, { limit: 100, cursor });
    for (const grant of page.items) {
      if (typeof grant.metadata?.connectionId === "string") {
        connectionIds.add(grant.metadata.connectionId);
      }
    }
    cursor = page.cursor;
  } while (cursor);
  return connectionIds;
}

export async function listMcpConnections(
  input: ListConnectionsInput,
): Promise<McpConnectionDto[]> {
  const service = new McpOAuthGrantService(input.db);
  const records = await service.listActiveGrantRecordsForProject(
    input.projectId,
  );
  const userIds = Array.from(
    new Set(records.map(function userId(record) {
      return record.userId;
    })),
  );
  const providerIdsByUser = new Map<string, Set<string>>();
  for (const userId of userIds) {
    providerIdsByUser.set(
      userId,
      await providerConnectionIdsForUser(input.oauth, userId),
    );
  }
  for (const record of records) {
    if (!providerIdsByUser.get(record.userId)?.has(record.id)) {
      await service.markRevoked(record.id, input.projectId);
    }
  }
  return service.listActiveForProject(input.projectId);
}

export async function revokeMcpConnection(
  input: RevokeConnectionInput,
): Promise<void> {
  const service = new McpOAuthGrantService(input.db);
  const active = await service.getActive(input.connectionId);
  if (!active || active.projectId !== input.projectId) return;
  const providerGrant = await findProviderGrantByConnectionId({
    oauth: input.oauth,
    userId: active.userId,
    connectionId: input.connectionId,
  });
  if (providerGrant) {
    await input.oauth.revokeGrant(providerGrant.id, active.userId);
  }
  await service.markRevoked(input.connectionId, input.projectId);
}
