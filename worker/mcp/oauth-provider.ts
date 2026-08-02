import { drizzle } from "drizzle-orm/d1";
import {
  OAuthProvider,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";

import type { McpOAuthScope } from "../../shared/mcp-tools";
import * as dbSchema from "../db/schema";
import type { AppEnv } from "../types";
import { authorizeMcpRequest } from "./access";
import { LinkyCalMcp } from "./agent";
import {
  mcpTokenExchangeResult,
  type McpOAuthProps,
} from "./oauth-authorization";
import { forwardBoundMcpSession } from "./session-binding";

const { schema } = dbSchema;
const mcpHandler = LinkyCalMcp.serve("/api/mcp", {
  binding: "MCP_OBJECT",
});

type OAuthFetchHandler = Pick<Required<ExportedHandler<AppEnv>>, "fetch">;

function isMcpOAuthScope(value: unknown): value is McpOAuthScope {
  return value === "read" || value === "write" || value === "offline_access";
}

function readMcpOAuthProps(ctx: ExecutionContext): McpOAuthProps | null {
  const props = (ctx as ExecutionContext<Record<string, unknown>>).props;
  if (
    typeof props?.connectionId !== "string" ||
    typeof props.userId !== "string" ||
    typeof props.projectId !== "string" ||
    !Array.isArray(props.scopes) ||
    !props.scopes.every(isMcpOAuthScope)
  ) {
    return null;
  }
  return {
    connectionId: props.connectionId,
    userId: props.userId,
    projectId: props.projectId,
    scopes: props.scopes,
  };
}

function trustedMcpOrigins(request: Request, env: AppEnv): Set<string> {
  return new Set([
    new URL(env.BETTER_AUTH_URL).origin,
    new URL(request.url).origin,
  ]);
}

const mcpOAuthApiHandler: OAuthFetchHandler = {
  async fetch(request, env, ctx): Promise<Response> {
    const props = readMcpOAuthProps(ctx);
    if (!props) {
      return Response.json(
        { error: "MCP authorization context is invalid" },
        { status: 403 },
      );
    }
    const access = await authorizeMcpRequest(
      drizzle(env.DB, { schema }),
      props,
      request.headers.get("origin"),
      trustedMcpOrigins(request, env),
    );
    if (!access.allowed) {
      return Response.json(
        { error: access.error },
        { status: access.status },
      );
    }
    return forwardBoundMcpSession({
      request,
      connectionId: access.props.connectionId,
      scopes: access.props.scopes,
      secret: env.BETTER_AUTH_SECRET,
      fetchMcp: async function fetchMcp(boundRequest) {
        return mcpHandler.fetch(boundRequest, env, ctx);
      },
    });
  },
};

export function createMcpOAuthProvider(
  defaultHandler: OAuthFetchHandler,
): OAuthProvider<AppEnv> {
  return new OAuthProvider<AppEnv>({
    apiRoute: "/api/mcp",
    apiHandler: mcpOAuthApiHandler,
    defaultHandler,
    authorizeEndpoint: "/oauth/authorize",
    tokenEndpoint: "/oauth/token",
    clientRegistrationEndpoint: "/oauth/register",
    scopesSupported: ["read", "write", "offline_access"],
    resourceMetadata: {
      resource: "https://linkycal.com/api/mcp",
      authorization_servers: ["https://linkycal.com"],
      scopes_supported: ["read", "write", "offline_access"],
      bearer_methods_supported: ["header"],
      resource_name: "LinkyCal MCP",
    },
    clientIdMetadataDocumentEnabled: true,
    allowPlainPKCE: false,
    allowImplicitFlow: false,
    accessTokenTTL: 3_600,
    refreshTokenTTL: 2_592_000,
    clientRegistrationTTL: 7_776_000,
    onError: function logOAuthError({ code, status }) {
      console.warn(`OAuth error response: ${status} ${code}`);
    },
    tokenExchangeCallback: async function tokenExchange(options) {
      return mcpTokenExchangeResult(options);
    },
  });
}

export type { OAuthHelpers };
