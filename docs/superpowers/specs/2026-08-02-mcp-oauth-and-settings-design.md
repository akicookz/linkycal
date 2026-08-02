# MCP OAuth and Settings Redesign

**Date:** 2026-08-02
**Status:** Approved

## Summary

LinkyCal will replace API-key authentication on its Streamable HTTP MCP server
with standards-compliant OAuth 2.1 authorization. Each OAuth grant will belong
to one LinkyCal user, one selected project, one registered MCP client, and an
enforced set of `read` and `write` scopes. Existing REST API keys will remain
unchanged and will no longer authenticate requests to `/api/mcp`.

The implementation will use Cloudflare's OAuth Provider library around the
existing Worker and MCP Durable Object. Better Auth remains LinkyCal's user
authentication system; it authenticates the resource owner during consent,
while the Cloudflare provider owns MCP client registration, authorization
codes, access tokens, refresh tokens, token validation, and revocation.

The `MCP & APIs` dashboard page will lead with connected MCP clients and
client-specific OAuth connection instructions modeled on the approved
reference. REST API keys will move into a clearly separate section below the
MCP content.

## Goals

1. Make `/api/mcp` interoperable with OAuth-capable remote MCP clients without
   requiring users to copy long-lived API keys into those clients.
2. Preserve the existing one-project security boundary for every MCP session.
3. Implement real `read` and `write` authorization scopes and enforce them at
   the tool boundary.
4. Let project administrators see and revoke every active MCP connection for
   a project.
5. Preserve the current Pro/Business entitlement and project-administration
   permission required to create an MCP credential.
6. Keep REST API-key behavior and contracts unchanged.
7. Publish accurate dashboard instructions and public documentation for
   Claude, ChatGPT, Cursor, Lovable, and other standards-compliant MCP clients.

## Non-Goals

- Replacing REST API keys with OAuth.
- Allowing one MCP grant to access multiple projects.
- Adding a caller-supplied `projectId` argument to MCP tools.
- Creating public or anonymous MCP tools.
- Building a second user authentication system alongside Better Auth.
- Supporting legacy API-key authentication on `/api/mcp` after the cutover.
- Changing the business behavior of existing MCP tools beyond scope
  enforcement and fresh access checks.

## Standards and Dependencies

The protected MCP endpoint will follow the current MCP authorization contract,
including OAuth 2.1, PKCE with S256, OAuth Authorization Server Metadata,
OAuth Protected Resource Metadata, resource indicators and audience binding,
and supported client registration mechanisms.

The Cloudflare OAuth Provider library will supply the protocol implementation
and hashed/encrypted token storage. LinkyCal will configure:

- Client ID Metadata Documents for clients that support them.
- Dynamic Client Registration as an interoperability fallback.
- Short-lived access tokens.
- Rotating refresh-token support.
- `read`, `write`, and `offline_access` in `scopes_supported`.
- A dedicated `OAUTH_KV` namespace for provider state.
- The Cloudflare compatibility flag required for SSRF-safe Client ID Metadata
  Document fetching.

Primary references:

- [MCP authorization specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [Cloudflare Workers OAuth Provider](https://github.com/cloudflare/workers-oauth-provider)
- [Cloudflare MCP authorization guidance](https://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization/)

## OAuth Surface

The canonical protected resource remains:

```text
https://linkycal.com/api/mcp
```

The provider will expose standards metadata at the well-known locations and
advertise LinkyCal's authorization, token, and client-registration endpoints.
The browser authorization endpoint will be `/oauth/authorize`; it will render
the LinkyCal React consent page through the existing SPA. Provider-owned token
and registration endpoints will live under `/oauth/` and will not pass through
the dashboard session middleware.

The consent page will use a session-only authorization-context API outside the
protected `/api/mcp` route prefix. That API will:

1. Parse and validate the original OAuth request through the provider.
2. Resolve registered client metadata.
3. Return a sanitized client name and the current user's eligible projects.
4. Accept an approval or denial decision for one project.
5. Recheck the session, Origin, project permission, project entitlement,
   requested scopes, redirect URI, and client registration before completing
   authorization.

The raw OAuth request is never trusted merely because it round-tripped through
the browser. Approval reparses the provider request and revalidates the client
and redirect URI. Denial returns the standard `access_denied` result only to a
validated redirect URI.

## Authorization and Project Scope

### Grant issuance

Only a signed-in user with `project:api_keys` permission may approve an MCP
grant. The selected project must currently have API access under a Pro or
Business plan. The consent project selector will show only projects satisfying
both conditions.

Each authorization creates a random LinkyCal `connectionId`. Provider grant
metadata and token props will include only the identifiers needed for runtime
authorization:

```ts
interface McpOAuthProps {
  connectionId: string;
  userId: string;
  projectId: string;
  scopes: Array<"read" | "write" | "offline_access">;
}
```

LinkyCal will complete each authorization with
`revokeExistingGrants: false`. The provider otherwise revokes older grants for
the same user and client by default, which would silently disconnect a second
project-specific connection. Token exchange will replace `props.scopes` with
the provider's effective requested scope exactly, without applying the
consent-time default, so a downscoped access token cannot inherit broader
permissions.

No API key, session token, OAuth access token, refresh token, authorization
code, or PKCE verifier is written to D1, logs, analytics, or client-visible
grant metadata.

### Runtime authorization

The Cloudflare provider validates the Bearer token, expiry, grant, client,
resource indicator, and audience before the MCP handler runs. LinkyCal's MCP
API wrapper then performs fresh application checks on every authorized HTTP
request:

1. Load the grant props supplied by the provider.
2. Resolve the user's current access to the grant project.
3. Require the user to retain `project:api_keys` permission.
4. Resolve current project entitlements and require API access.
5. Pass the trusted `projectId`, `connectionId`, and scopes into the existing
   MCP Durable Object.

Removal from the project, demotion below project administration, project
deletion, plan downgrade, grant revocation, wrong token audience, or expired
credentials therefore stops access without waiting for the connection to be
recreated.

The project ID remains transport context and never becomes an MCP tool
argument. Every existing tool continues to obtain its project from
`ToolContext`.

### Tool scopes

The MCP tool catalog will classify every tool as read or write:

- Listing, retrieving, searching, availability checks, aggregate reports, and
  other non-mutating operations require `read`.
- Creating, updating, deleting, booking, canceling, tagging, triggering,
  configuring, or otherwise mutating operations require `write`.

The scope guard runs inside the shared MCP tool wrapper before the production
action executes. A token lacking the required scope produces an MCP
authorization error and no persistence, queue delivery, provider request, or
other side effect occurs.

Current client setup will grant both `read` and `write`. `offline_access` is
advertised and granted when requested so clients such as ChatGPT can maintain
the connection with refresh tokens. A future read-only consent option can be
added without changing tool handlers because the scope boundary is already
real.

## Connected Client Registry

OAuth provider KV is the source of truth for whether tokens and grants are
valid. D1 will contain a non-secret project index and audit record so project
administrators can list connections across all users without scanning provider
KV.

When the dashboard lists connections, LinkyCal will reconcile active D1 rows
against the provider's active grant summaries, grouped by grant owner. Missing
or expired provider grants are marked revoked in D1 and omitted from the
response so the project index never presents stale access as connected.

The `mcp_oauth_grants` table will contain:

- `id`: the random LinkyCal `connectionId` primary key.
- `projectId`: cascading project foreign key.
- `userId`: cascading Better Auth user foreign key.
- `clientId`: the registered OAuth client identifier.
- `clientName`: a sanitized snapshot used in the dashboard.
- `scopes`: a bounded JSON array containing supported scope names.
- `createdAt`: connection time.
- `revokedAt`: nullable revocation time.

Client-provided remote image URLs will not render directly in the dashboard.
Known client identities use local icons; unknown clients use a generic MCP
client icon. This avoids browser privacy leaks and unstable remote assets.

The project connection endpoints are session-only and use the existing
`project:api_keys` authorization boundary:

```text
GET    /api/projects/:projectId/mcp-connections
DELETE /api/projects/:projectId/mcp-connections/:connectionId
```

Revocation first invalidates the provider grant and all associated access and
refresh tokens. Only after provider invalidation succeeds does LinkyCal set
`revokedAt`. This ordering prioritizes stopping access if KV and D1 cannot be
changed atomically. Repeating revocation is idempotent from the dashboard's
perspective.

## OAuth and MCP Request Flow

1. The MCP client calls `/api/mcp` without a token.
2. LinkyCal returns `401 Unauthorized` with a `WWW-Authenticate` Bearer
   challenge pointing to Protected Resource Metadata.
3. The client discovers LinkyCal's authorization server and uses a Client ID
   Metadata Document or Dynamic Client Registration.
4. The client creates an S256 PKCE challenge and opens `/oauth/authorize`.
5. A signed-out resource owner uses the existing LinkyCal login flow and is
   returned to the complete authorization URL.
6. The consent page shows the sanitized client identity, one eligible-project
   selector, and the requested Read/Write permissions.
7. Approval creates the provider grant and, before returning its redirect,
   persists the connection index. If that D1 write fails, LinkyCal revokes the
   just-created provider grant and does not return an authorization code.
8. The client exchanges the code and verifier for an audience-bound access
   token and refresh token.
9. The provider validates subsequent Bearer tokens; LinkyCal performs fresh
   project access and entitlement checks and supplies the trusted grant props
   to the MCP Durable Object.
10. Tool scope enforcement runs before the existing project-scoped action.

If the request contains an `Origin` header, the MCP boundary validates it
against trusted LinkyCal origins before transport handling. Server-to-server
MCP clients normally omit `Origin` and continue normally.

## Cutover and Compatibility

This is a hard MCP authentication cutover:

- `/api/mcp` accepts provider-issued OAuth access tokens only.
- Existing `lc_live_...` API keys receive the same OAuth `401` challenge as a
  missing or invalid access token.
- LinkyCal never attempts API-key validation after OAuth token validation
  fails.
- Existing MCP users must remove their Bearer-header configuration and
  reconnect through OAuth.
- REST routes that already support project API keys continue to accept those
  keys with their current contracts, plan checks, and project scoping.
- API-key creation, listing, deletion, and copy-once behavior remain unchanged.

There is no dual-authentication grace period because it would keep long-lived
secrets valid on MCP and make the dashboard's connected-client list
incomplete.

## Dashboard Design

The route and navigation label remain `MCP & APIs`. The page header description
will explain that MCP uses OAuth while API keys are REST credentials. The page
content will use three vertically spaced sections without divider lines.

### Connected MCP clients

The first structural card contains the title `Connected MCP clients` and a
short description pointing users to the connection instructions below.

Each active grant renders as a muted, rounded row containing:

- A local known-client icon or generic MCP client icon.
- Sanitized client name.
- `read, write` scope summary.
- Connected date using stable, readable formatting.
- The authorizing user's display name or email for project-level auditability.
- An icon-and-text `Revoke` action.

Revocation opens a confirmation dialog explaining that the client will lose
access immediately. The loading state swaps the action icon for a spinner while
keeping its label. An empty state says no MCP clients are connected and points
to the instructions below. Fetch and revoke failures remain visible and do not
optimistically claim that access was removed.

### Connect a client

The second structural card follows the approved reference with an inset tab
control for:

- Claude
- ChatGPT
- Cursor
- Lovable

Each tab contains current numbered setup instructions, the canonical
`https://linkycal.com/api/mcp` URL, and copy controls. Claude also includes:

```text
claude mcp add --transport http linkycal https://linkycal.com/api/mcp
```

No tab instructs the user to create an API key or add an Authorization header.
The instructions explain that the client opens LinkyCal in a browser to sign in
and select a project. Plan-specific client limitations, such as ChatGPT's
current custom MCP availability, are stated without implying that LinkyCal
controls the client plan.

The tab list remains usable on narrow screens through horizontal overflow. All
interactive targets are at least 40px, nested radii are concentric, headings
use balanced wrapping, body copy uses pretty wrapping, and copy/revoke buttons
use specific interruptible transitions and a subtle `0.96` press scale.

### REST API keys

The existing API-key workflow moves into a third structural card titled
`REST API keys`. Its create action is inside the card header so it cannot be
mistaken for MCP setup. Explanatory copy and the curl example identify API keys
as server-side REST credentials and explicitly say that MCP uses OAuth.

The existing create dialog, copy-once warning, key list, last-used display,
delete confirmation, plan entitlement, and backend contracts remain intact.

## Consent Screen

The public SPA route `/oauth/authorize` renders a focused, LinkyCal-branded
authorization card rather than the dashboard shell. It shows:

- The registered client name and known-client icon.
- `wants to access LinkyCal` context.
- A selector containing only eligible projects.
- A Read permission row describing data the client can inspect.
- A Write permission row describing actions the client can perform.
- A text-only `Cancel` action, allowed by the dialog convention.
- A `ShieldCheck` plus `Allow access` primary action.

The primary loading state replaces `ShieldCheck` with a spinner and keeps the
text. Invalid, expired, malformed, ineligible, or already-completed requests
show a safe error state without exposing raw provider errors or offering an
unvalidated redirect.

If the resource owner is signed out, LinkyCal reuses the existing landing-page
authentication dialog with a same-origin return URL containing the OAuth
request. Google, Facebook, and email OTP sign-in all return to the consent
screen.

## Errors and Security Properties

- Missing, malformed, expired, revoked, API-key, or wrong-audience Bearer
  credentials on `/api/mcp` return `401` with the standards discovery
  challenge.
- Insufficient scopes return an MCP authorization error naming the required
  scope before the production tool action runs. No mutation or external side
  effect occurs.
- Lost project administration or API entitlement returns `403` before the MCP
  Durable Object executes a tool.
- Invalid `Origin` returns `403` before MCP transport handling.
- Malformed OAuth parameters, invalid redirect URIs, unknown clients, invalid
  PKCE, replayed authorization codes, and unsupported scopes use provider-owned
  OAuth errors.
- Consent approval uses the existing trusted-origin session CSRF boundary and
  never accepts a caller-supplied user identity.
- Project administrators can list and revoke only connections whose D1
  `projectId` matches the authorized route project.
- Logs may include a connection ID, project ID, client ID, and protocol error
  code, but never codes, tokens, verifiers, session cookies, or raw request
  query strings.

## Documentation Changes

All claims that MCP uses an API key will change to OAuth while REST API-key
documentation remains intact. The update includes:

- `README.md` architecture and authentication description.
- MCP route metadata in `scripts/api-docs-catalog.ts`.
- OpenAPI/auth rendering in `scripts/generate-api-docs.ts`.
- `scripts/llms-template.ts` and generated `public/llms.txt`.
- Generated endpoint audit and `public/openapi.json`.
- The dashboard documentation page.
- MCP marketing examples and feature copy.
- Any checked-in prompt or API-reference copy that currently tells MCP users
  to send an API key.

The REST API continues to document `Authorization: Bearer lc_live_...` for its
approved project-resource routes. OAuth access tokens are not presented as a
general REST authentication mechanism.

## Test Strategy

Tests will protect observable protocol, security, persistence, and rendered
user outcomes rather than Cloudflare provider internals or styling classes.

### Protocol and authorization journey

A focused MCP OAuth integration suite will demonstrate red before production
changes and then require:

- An unauthenticated request receives `401` and the exact protected-resource
  discovery challenge.
- Metadata advertises S256 PKCE, the protected MCP resource, supported client
  registration, refresh access, and supported scopes.
- A project administrator can approve one paid project and the resulting MCP
  token reaches tools with only that project context.
- An inaccessible, free-plan, or non-admin project cannot be granted.
- A token for project A cannot read or mutate project B.
- A read-only token can call a representative read tool but cannot trigger a
  representative write side effect.
- Revocation invalidates both access and refresh behavior before the dashboard
  reports success.
- Removing the grant owner from project administration or removing API access
  blocks an otherwise valid token.
- A project API key still authenticates a representative REST project route
  but receives the OAuth challenge from `/api/mcp`.

Provider doubles, if unavoidable in the Bun environment, must reject malformed
OAuth requests, invalid redirect URIs, wrong audiences, bad PKCE verifiers, and
revoked grants. Tests assert protocol responses, persisted grant state, tool
results, and absence of side effects.

### Dashboard and consent journeys

Rendered tests will require:

- Connected clients show their client name, scopes, date, authorizer, and
  revoke action.
- Confirmed revocation removes the active connection only after the server
  succeeds; failure remains visible.
- Client tabs expose OAuth-only instructions and the correct endpoint/Claude
  command without an API-key header.
- The REST API-key area retains create, copy-once, list, and delete behavior
  with REST-only labeling.
- Consent renders only eligible projects and requested permission descriptions,
  and approval/denial sends the validated decision.

### Required final checks

Because this changes the SPA, Worker, database schema, Worker bindings, public
protocol, and generated documentation, final verification requires:

```text
bun run db:generate
bun run db:migrate:dev
bun run cf-typegen
bun run test
bun run lint
bun run docs:check
bun run build
git diff --check
```

The generated migration must be inspected for the intended cascading foreign
keys, nullable revocation timestamp, and project/user/client indexes. No
production migration, deployment, or widget upload is part of this change.

## Operational Requirements

- Provisioning the dedicated production `OAUTH_KV` namespace is an explicit
  infrastructure step; production migration and deployment remain separate,
  explicitly authorized operations.
- Existing remote MCP users must reconnect after deployment.
- OAuth grant and token TTLs must be documented in configuration rather than
  hidden as library defaults.
- Scheduled provider cleanup will be incorporated into the existing Worker
  scheduled handler without weakening booking expiry or workflow dispatch.
- Provider cleanup failure is logged independently and does not prevent the
  existing scheduled jobs from running.

## Success Criteria

The change is successful when an OAuth-capable client can add the single
LinkyCal endpoint, authenticate through the existing LinkyCal account, select
one eligible project, obtain refreshable read/write access, use the existing
MCP tools only within that project, appear in the project's connected-client
list, and lose access immediately when revoked. At the same time, REST API keys
continue to work on their approved REST routes and cannot authenticate MCP.
