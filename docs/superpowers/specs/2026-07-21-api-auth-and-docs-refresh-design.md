# API Authentication and Documentation Refresh Design

**Date:** 2026-07-21
**Status:** Approved

## Summary

LinkyCal will keep one canonical project REST contract at
`/api/projects/:projectId/*`. Those project-resource routes will accept either
a dashboard session or a project-scoped API key. Authentication will resolve
once into an explicit session-or-API-key context before authorization runs.

Visitor-facing booking, form, availability, widget, and tracking routes will
remain anonymous and rate-limited. Account governance, billing, team and member
management, API-key management, onboarding, and OAuth connection lifecycle
will remain session-only. MCP and private external file downloads will remain
API-key-only.

The public documentation will describe API-key authentication only. Dashboard
session authentication remains an internal implementation detail rather than a
public integration contract.

## Current-State Audit

The worker currently registers 155 explicit API routes, including 98 routes
under `/api/projects`. The global session middleware protects those project
routes and does not attempt API-key authentication.

API keys themselves work. `ApiKeyService` hashes and validates keys, and the
MCP route independently performs Bearer validation before forwarding the
validated `projectId` into the MCP Durable Object. Every MCP tool reads that
project ID from its tool context. The private form-file download route uses a
similar inline API-key check.

The resulting inconsistency is:

- `/api/mcp` supports project-scoped API keys.
- The private `/api/v1/forms/.../files/...` download supports API keys.
- Most visitor `/api/v1`, `/api/public`, and `/api/widget` routes are anonymous;
  they ignore a supplied API key because they do not require one.
- `/api/projects/:projectId/*` is session-only even when the documentation
  presents those endpoints as programmatic APIs.
- The docs show session-cookie examples for contacts and booking cancellation,
  contradicting the broader API-key messaging.
- Marketing links to `/openapi.json`, but no OpenAPI document exists.
- There are no endpoint-level regression tests for the authentication matrix.
- Global CORS currently reflects arbitrary origins while enabling credentials,
  mixing anonymous, session, and server API policies.

## Goals

1. Make the supported project management REST surface work with project-scoped
   API keys without duplicating request or response contracts.
2. Preserve existing dashboard behavior through session authentication.
3. Keep visitor integrations anonymous and safe to embed without exposing a
   project API key.
4. Make ambiguous, invalid, or cross-project credentials fail before handlers
   execute.
5. Prevent API keys from reaching account-governance or OAuth-lifecycle routes.
6. Publish a complete, accurate human-readable reference, `llms.txt`, endpoint
   audit, and OpenAPI 3.1 document.
7. Add automated coverage that prevents future routes or docs from silently
   escaping classification.

## Non-Goals

- Creating a second `/api/v1/projects` management namespace.
- Changing existing project-resource request or response shapes solely for the
  authentication refresh.
- Requiring API keys in visitor-side JavaScript, widgets, hosted forms, or
  booking pages.
- Allowing API keys to create projects, rotate other API keys, manage teams or
  billing, or create/delete Google OAuth grants.
- Introducing API-key scopes in this change. A valid key retains full access to
  the approved resource surface of its one project.

## Authentication Architecture

### Request authentication context

The worker will expose a discriminated context rather than populating session
fields for API-key requests:

```ts
export type RequestAuth =
  | {
      kind: "session";
      userId: string;
    }
  | {
      kind: "apiKey";
      apiKeyId: string;
      projectId: string;
    };
```

`ApiKeyService.validate()` will return both `apiKeyId` and `projectId`, allowing
the request context and future audit logging to identify the credential without
retaining the secret.

### Credential selection

Credential selection is deterministic:

| Credentials present | Result |
| --- | --- |
| Valid session only | Authenticate as the dashboard user |
| Valid API key only | Authenticate as the key's project |
| Valid session plus any Bearer credential | `400 ambiguous_credentials` |
| No valid session; Bearer is malformed or invalid | `401 invalid_api_key` |
| Neither credential present on a protected route | `401 unauthorized` |

A Bearer credential is explicit while a session cookie is ambient. When both
are present, the request is rejected before either identity is authorized. An
invalid Bearer credential is never allowed to fall back to a valid session.
Determining whether a Cookie header contains a real session will use Better
Auth session resolution rather than treating every unrelated cookie as a
session.

### Project authorization

For a session request, existing team/project RBAC remains authoritative. The
worker resolves membership, role, plan, and permissions exactly as it does now.

For an API-key request, authorization will:

1. Validate the key and load its project.
2. Require the route `:projectId` to equal the key's project ID.
3. Verify the project's current entitlement still permits API access. A key
   created on a paid plan stops working if that entitlement is lost.
4. Check the request against the explicit API-key route policy.
5. Populate project subscription and plan-limit context without inventing a
   dashboard user or team role.

An invalid key returns `401`. A valid key for another project, a lost API
entitlement, or a route outside the API-key policy returns `403` before the
handler runs.

### No duplicated contracts

Session and API-key requests reach the same route handler after authentication
and authorization. Existing validation, services, status codes, and response
shapes therefore remain canonical. Handlers that currently read a user ID for
project-owned behavior will be adjusted to consume project access information;
the middleware will not fabricate a user identity for an API key.

## Route Policy

Route classification will live in one focused module as method-plus-path
patterns. Every protected route must match exactly one category. Tests will fail
when a new route is unclassified or matches conflicting categories.

### Anonymous and rate-limited visitor routes

- Availability lookup and public event-type detail.
- Visitor booking creation.
- Form response start, step submission, and file upload.
- Public/hosted form lookup and native HTML form submission.
- Booking and form widget configuration.
- Public slug resolution.
- Visitor analytics tracking.
- Non-private uploaded asset delivery.

These routes do not treat an optional Bearer header as an authorization grant.
They continue to enforce validation, resource status checks, spam protection,
and per-IP rate limits.

### Session or API key

The approved project-resource surface is:

- Read and update the current project and read its entitlements. Project
  creation, listing, and deletion remain session-only.
- Project image upload and deletion.
- Event types, including event-type calendar selection.
- Schedules, availability rules, and date overrides.
- Bookings, booking details, booking-form responses, cancellation,
  confirmation, and decline.
- Forms, steps, fields, responses, private response files, and response
  deletion.
- Contacts, contact views, imports, next actions, tags, pipeline stages,
  enrichment, and pipeline seeding.
- Workflows, steps, runs, manual triggers, and test runs.
- Recent project activity and project analytics.
- Read available calendars needed to configure an event type, provided those
  calendars come from connections already available to the project.

### Session-only

- Project listing, creation, and deletion.
- Project member management.
- API-key listing, creation, and deletion.
- Team, team-member, and invite administration.
- Account uploads and account/profile operations.
- Billing and subscription-management routes.
- Onboarding routes.
- Google Calendar OAuth initiation, callback, connection listing, and
  connection deletion.
- User-level calendar enumeration.

Invitation preview remains token-protected and anonymous. Invitation acceptance
continues to resolve and require a matching dashboard session within the
handler.

### API-key-only and signed system routes

- `/api/mcp` remains API-key-only and continues to hard-scope tool context to
  the validated project.
- Private external form-file download remains API-key-only. The dashboard uses
  its session-protected project response-file route.
- Stripe webhooks remain protected by Stripe signature validation rather than
  LinkyCal authentication.
- Better Auth routes remain owned by Better Auth.

## CORS and Browser-Origin Policy

The global reflected-origin, credentialed CORS policy will be replaced with
route-aware behavior:

- Anonymous visitor endpoints allow any origin without credentials.
- Trusted LinkyCal origins may make credentialed dashboard requests.
- Session-authenticated state-changing requests carrying an untrusted Origin
  are rejected server-side; response-header restrictions alone are not treated
  as CSRF protection.
- API-key requests may be made by server clients, which are not governed by
  browser CORS. If an untrusted browser origin sends a Bearer credential, it
  receives non-credentialed CORS behavior and must not also carry a session.
- Auth callbacks and Stripe webhooks retain the narrowly required policies.

Trusted origins will be derived from configured LinkyCal application/auth URLs,
not accepted by reflecting arbitrary origins with credentials.

## Error Contract

Authentication and authorization failures use stable JSON codes:

```json
{
  "error": "Human-readable explanation",
  "code": "invalid_api_key"
}
```

The new codes are:

- `ambiguous_credentials` with status `400`.
- `unauthorized` with status `401`.
- `invalid_api_key` with status `401` and a Bearer `WWW-Authenticate` header.
- `api_access_unavailable` with status `403`.
- `api_key_project_mismatch` with status `403`.
- `api_key_route_forbidden` with status `403`.
- `origin_forbidden` with status `403` for an untrusted session origin.

Existing handler-specific validation and resource errors remain unchanged.

## Documentation Refresh

### Endpoint audit

A checked-in audit will list every worker endpoint with:

- Method and path.
- Authentication category.
- API-key support.
- Session support.
- Public documentation status.
- Notes for rate limiting, signature protection, or internal-only behavior.

The audit is comprehensive, while public API documentation intentionally omits
internal session-only dashboard operations unless needed to explain why they
are unavailable to API keys.

### Human and agent documentation

`src/pages/Docs.tsx` and `public/llms.txt` will be updated together:

- Remove session-cookie integration examples.
- Use Bearer authentication for every project management example.
- Clearly separate anonymous visitor endpoints from protected management
  endpoints.
- Document all API-key-enabled project domains, not only contacts and booking
  cancellation.
- Document stable errors, pagination/query parameters, rate limits, and the
  project ID/key matching rule.
- Keep MCP tool documentation aligned with the actual registered tools.
- Remove or correct stale dates, payload fields, route names, and feature
  claims discovered during the contract audit.

### OpenAPI

`/openapi.json` will become a real OpenAPI 3.1 document containing:

- The anonymous visitor API.
- Every API-key-enabled project REST endpoint.
- Bearer security scheme and per-operation security declarations.
- Request parameters and bodies, success responses, and common error schemas.
- No dashboard cookie as a public integration security scheme.

Automated checks will compare OpenAPI method/path pairs with the public route
policy so undocumented API-key routes and nonexistent documented routes fail
tests.

Marketing and API-key dashboard copy that links to or describes the API will be
updated to match the implemented surface.

## Testing Strategy

Implementation follows test-driven development.

### Authentication tests

- Session-only project request succeeds and retains RBAC behavior.
- API-key-only project request succeeds on an allowed route.
- Both valid credentials return `400 ambiguous_credentials`.
- Invalid or malformed Bearer credentials return `401` without session fallback.
- A key cannot access a different project.
- A key cannot access members, API-key management, project deletion, OAuth
  connection lifecycle, billing, team, account, or onboarding routes.
- A key stops working when the project's current plan does not permit API
  access.
- MCP still accepts a valid key and rejects missing/invalid keys.
- Anonymous visitor routes still work without either credential.

### Policy and contract tests

- Every registered API route is classified once.
- Every API-key policy pattern corresponds to a real route.
- Shared handlers return the same contract regardless of session or API-key
  authentication.
- Nested resource access remains scoped to the route project, preserving prior
  IDOR protections.

### CORS tests

- Public endpoints allow uncredentialed cross-origin access.
- Trusted dashboard origins receive credential support.
- Untrusted origins cannot execute session-authenticated state changes.
- Server-style API-key requests remain usable without Origin headers.

### Documentation tests

- OpenAPI parses as version 3.1.
- OpenAPI security matches the route policy.
- All documented method/path pairs exist.
- No public code sample uses a dashboard session cookie.
- `llms.txt` and the human docs contain the canonical authentication guidance.

The final verification run will include focused worker tests, the full Bun test
suite, TypeScript/build validation, linting for changed files where supported,
and a regenerated endpoint audit diff.

## Rollout and Compatibility

Existing dashboard URLs and handler contracts remain unchanged. Existing MCP
clients remain compatible. Visitor embeds remain keyless and do not require a
migration.

The change only expands the approved `/api/projects/:projectId/*` routes to
accept API keys. Because project ID matching and route policy execute before
handlers, the rollout does not turn account-governance routes into public API
operations.

The docs will state that integrations must not send dashboard cookies alongside
API keys. Requests containing both credentials will fail deterministically so
misconfigured integrations are discovered immediately.
