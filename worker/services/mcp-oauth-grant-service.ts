import { and, desc, eq, isNull } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { z } from "zod";

import * as dbSchema from "../db/schema";

type AppDatabase = DrizzleD1Database<Record<string, unknown>>;

const mcpGrantScopesSchema = z
  .array(z.enum(["read", "write", "offline_access"]))
  .min(1)
  .max(3);

export type McpGrantScope = z.infer<typeof mcpGrantScopesSchema>[number];

export interface NewMcpOAuthGrant {
  id: string;
  projectId: string;
  userId: string;
  clientId: string;
  clientName: string;
  scopes: McpGrantScope[];
  createdAt?: Date;
}

export interface McpConnectionDto {
  id: string;
  clientName: string;
  scopes: McpGrantScope[];
  createdAt: string;
  authorizedBy: {
    name: string;
    email: string;
  };
}

function parseStoredScopes(value: string): McpGrantScope[] {
  return mcpGrantScopesSchema.parse(JSON.parse(value));
}

// ─── Service ────────────────────────────────────────────────────────────────

export class McpOAuthGrantService {
  constructor(private db: AppDatabase) {}

  async create(input: NewMcpOAuthGrant): Promise<dbSchema.McpOAuthGrantRow> {
    await this.db.insert(dbSchema.mcpOAuthGrants).values({
      id: input.id,
      projectId: input.projectId,
      userId: input.userId,
      clientId: input.clientId,
      clientName: input.clientName,
      scopes: JSON.stringify(mcpGrantScopesSchema.parse(input.scopes)),
      createdAt: input.createdAt,
    });

    const [created] = await this.db
      .select()
      .from(dbSchema.mcpOAuthGrants)
      .where(eq(dbSchema.mcpOAuthGrants.id, input.id))
      .limit(1);

    if (!created) {
      throw new Error(`Failed to create MCP OAuth grant ${input.id}`);
    }
    return created;
  }

  async getActive(
    connectionId: string,
  ): Promise<dbSchema.McpOAuthGrantRow | null> {
    const [grant] = await this.db
      .select()
      .from(dbSchema.mcpOAuthGrants)
      .where(
        and(
          eq(dbSchema.mcpOAuthGrants.id, connectionId),
          isNull(dbSchema.mcpOAuthGrants.revokedAt),
        ),
      )
      .limit(1);

    return grant ?? null;
  }

  async listActiveForProject(projectId: string): Promise<McpConnectionDto[]> {
    const rows = await this.db
      .select({
        id: dbSchema.mcpOAuthGrants.id,
        clientName: dbSchema.mcpOAuthGrants.clientName,
        scopes: dbSchema.mcpOAuthGrants.scopes,
        createdAt: dbSchema.mcpOAuthGrants.createdAt,
        authorizerName: dbSchema.schema.users.name,
        authorizerEmail: dbSchema.schema.users.email,
      })
      .from(dbSchema.mcpOAuthGrants)
      .innerJoin(
        dbSchema.schema.users,
        eq(dbSchema.mcpOAuthGrants.userId, dbSchema.schema.users.id),
      )
      .where(
        and(
          eq(dbSchema.mcpOAuthGrants.projectId, projectId),
          isNull(dbSchema.mcpOAuthGrants.revokedAt),
        ),
      )
      .orderBy(desc(dbSchema.mcpOAuthGrants.createdAt));

    return rows.map(function toConnection(row): McpConnectionDto {
      return {
        id: row.id,
        clientName: row.clientName,
        scopes: parseStoredScopes(row.scopes),
        createdAt: row.createdAt.toISOString(),
        authorizedBy: {
          name: row.authorizerName,
          email: row.authorizerEmail,
        },
      };
    });
  }

  async markRevoked(
    connectionId: string,
    projectId: string,
  ): Promise<boolean> {
    const [grant] = await this.db
      .select({ id: dbSchema.mcpOAuthGrants.id })
      .from(dbSchema.mcpOAuthGrants)
      .where(
        and(
          eq(dbSchema.mcpOAuthGrants.id, connectionId),
          eq(dbSchema.mcpOAuthGrants.projectId, projectId),
        ),
      )
      .limit(1);

    if (!grant) return false;

    await this.db
      .update(dbSchema.mcpOAuthGrants)
      .set({ revokedAt: new Date() })
      .where(eq(dbSchema.mcpOAuthGrants.id, connectionId));
    return true;
  }
}
