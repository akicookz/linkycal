# MCP Settings Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace placeholder MCP client glyphs with the official Encited-section marks, rename the settings surface to “API keys,” and omit the connected-client card when there are no OAuth connections.

**Architecture:** Keep `McpClientIcon` as the single name-to-visual resolver, but serve four local SVG assets from `public/mcp-client-logos` and retain `PlugZap` only as an unknown-client fallback. Let `ConnectedMcpClients` return `null` for non-error empty data (including initial loading) while preserving its error and connected states. This is a frontend-only change with no API, OAuth, or schema work.

**Tech Stack:** React 19, TypeScript, TanStack Query, Tailwind CSS v4, Bun test, Testing Library

## Global Constraints

- Use the exact Claude, ChatGPT, Cursor, and Lovable SVGs from the Encited landing page MCP section.
- Store all four assets locally; the production UI must not fetch assets from Encited.
- Change user-facing `REST API keys` wording to `API keys` without renaming backend routes or database fields.
- Hide the connected-client card for loading and successful-empty states, but preserve error feedback.
- Do not add tests that assert CSS classes, DOM ancestry, or source filenames.

---

### Task 1: Empty connected-client behavior and API key copy

**Files:**
- Modify: `tests/mcp-settings.test.tsx:14-267`
- Modify: `src/components/mcp/ConnectedMcpClients.tsx:1-222`
- Modify: `src/components/api-keys/RestApiKeys.tsx:144-151`
- Modify: `src/pages/ApiKeys.tsx:11-21`

**Interfaces:**
- Consumes: `GET /api/projects/:projectId/mcp-connections` returning `{ connections: McpConnection[] }`
- Produces: `ConnectedMcpClients({ projectId }: { projectId: string })` renders nothing for non-error empty data and a card for errors or at least one connection.

- [ ] **Step 1: Write the failing settings test**

Replace the empty-state assertion with observable page behavior and update the post-revocation assertion:

```tsx
test("projects without connections omit the client card but retain setup and API keys", async function () {
  installSettingsApi({ emptyConnections: true });
  renderSettings();

  expect(await screen.findByText("Backend")).toBeTruthy();
  expect(screen.queryByText("Connected MCP clients")).toBeNull();
  expect(screen.getByRole("region", { name: "Connect a client" })).toBeTruthy();
  expect(screen.getByText("API keys")).toBeTruthy();
  expect(screen.queryByText("REST API keys")).toBeNull();
});
```

After releasing a successful revoke, wait for the connected-client heading to disappear while retaining the request-count assertion:

```tsx
releaseRevoke();

await waitFor(function connectedCardWasRemoved() {
  expect(screen.queryByText("Connected MCP clients")).toBeNull();
});
```

- [ ] **Step 2: Run the focused test to prove the old UI fails**

Run:

```bash
bun test tests/mcp-settings.test.tsx --test-name-pattern "projects without connections"
```

Expected: FAIL because the old page still displays `Connected MCP clients` and `REST API keys`.

- [ ] **Step 3: Implement the minimal empty-state and copy changes**

In `ConnectedMcpClients`, remove the unused `PlugZap` import, keep `Loader` for the revoke button, and return before the card when a non-error query has no rows:

```tsx
const connections = connectionsQuery.data ?? [];

if (!connectionsQuery.isError && connections.length === 0) {
  return null;
}
```

Inside `CardContent`, retain only the error and connected-row branches:

```tsx
{connectionsQuery.isError ? (
  <p role="alert" className="rounded-[16px] bg-destructive/10 p-4 text-sm text-destructive">
    {connectionsQuery.error.message}
  </p>
) : (
  <div className="space-y-3">
    {connections.map(function connectionRow(connection) {
      return (
        <div
          key={connection.id}
          className="flex flex-col gap-4 rounded-[16px] bg-muted/50 px-4 py-3 sm:flex-row sm:items-center"
        >
          <McpClientIcon clientName={connection.clientName} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {connection.clientName}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <span>{connection.scopes.join(", ")}</span>
              <span>{" "}· Connected {formatConnectedDate(connection.createdAt)}</span>
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              Authorized by {connection.authorizedBy.name} · {connection.authorizedBy.email}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={function openRevokeDialog() {
              revokeMutation.reset();
              setRevokeConnection(connection);
            }}
          >
            <Unplug aria-hidden="true" />
            Revoke
          </Button>
        </div>
      );
    })}
  </div>
)}
```

Change the exact user-facing strings:

```tsx
<CardTitle>API keys</CardTitle>
```

```tsx
description="Connect AI clients with OAuth and manage server-side API keys."
```

- [ ] **Step 4: Run the MCP settings test file**

Run:

```bash
bun test tests/mcp-settings.test.tsx
```

Expected: all MCP settings tests PASS, including revocation, tabs, empty data, and API key lifecycle.

- [ ] **Step 5: Commit the behavior and copy change**

```bash
git add tests/mcp-settings.test.tsx src/components/mcp/ConnectedMcpClients.tsx src/components/api-keys/RestApiKeys.tsx src/pages/ApiKeys.tsx
git commit -m "fix: simplify empty MCP settings"
```

### Task 2: Official MCP client logo assets

**Files:**
- Create: `public/mcp-client-logos/claude.svg`
- Create: `public/mcp-client-logos/chatgpt.svg`
- Create: `public/mcp-client-logos/cursor.svg`
- Create: `public/mcp-client-logos/lovable.svg`
- Modify: `src/components/mcp/McpClientIcon.tsx:1-57`

**Interfaces:**
- Consumes: `clientName: string` from setup tabs and connected OAuth records.
- Produces: `McpClientIcon({ clientName, className })` renders a known brand image or the existing generic fallback.

- [ ] **Step 1: Add the four exact SVG files**

Add the pageAssets downloads from these exact sources to their corresponding repository paths:

```text
https://encited.com/crawler-logos/claude.svg  -> public/mcp-client-logos/claude.svg
https://encited.com/crawler-logos/chatgpt.svg -> public/mcp-client-logos/chatgpt.svg
https://encited.com/logos/cursor.svg           -> public/mcp-client-logos/cursor.svg
https://encited.com/stack-logos/lovable.svg    -> public/mcp-client-logos/lovable.svg
```

Verify the source files are all SVG and that no external image reference remains inside them:

```bash
file public/mcp-client-logos/*.svg
rg -n "https?://" public/mcp-client-logos
```

Expected: all four report SVG/XML text; `rg` produces no matches other than the SVG namespace declaration if present.

- [ ] **Step 2: Replace the generic known-client glyph resolver**

Use local paths for known clients while preserving `PlugZap` for names not in the known set:

```tsx
import { PlugZap } from "lucide-react";

import { cn } from "@/lib/utils";

interface McpClientIconProps {
  clientName: string;
  className?: string;
}

function clientLogoPath(clientName: string): string | null {
  const normalized = clientName.toLowerCase();
  if (normalized.includes("claude")) return "/mcp-client-logos/claude.svg";
  if (normalized.includes("chatgpt")) return "/mcp-client-logos/chatgpt.svg";
  if (normalized.includes("cursor")) return "/mcp-client-logos/cursor.svg";
  if (normalized.includes("lovable")) return "/mcp-client-logos/lovable.svg";
  return null;
}

export function McpClientIcon({ clientName, className }: McpClientIconProps) {
  const logoPath = clientLogoPath(clientName);

  return (
    <span
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-background shadow-sm",
        className,
      )}
      aria-hidden="true"
    >
      {logoPath ? (
        <img src={logoPath} alt="" className="size-5 object-contain" />
      ) : (
        <PlugZap className="size-5 text-primary" />
      )}
    </span>
  );
}
```

- [ ] **Step 3: Run focused tests and production build**

Run:

```bash
bun test tests/mcp-settings.test.tsx
bun run build
```

Expected: tests PASS and the TypeScript/Vite production build completes successfully.

- [ ] **Step 4: Verify the rendered settings page**

Open the local MCP & APIs settings route and confirm:

```text
Claude tab   -> terracotta Claude starburst
ChatGPT tab  -> official ChatGPT knot
Cursor tab   -> official dark Cursor mark
Lovable tab  -> multicolor Lovable heart
No connections -> Connect a client is the first card
Connections    -> Connected MCP clients appears above setup
API key card   -> title reads API keys
```

- [ ] **Step 5: Commit the official logo integration**

```bash
git add public/mcp-client-logos src/components/mcp/McpClientIcon.tsx
git commit -m "fix: use official MCP client logos"
```

### Task 3: Final regression verification

**Files:**
- Verify only: all files changed in Tasks 1-2

**Interfaces:**
- Consumes: completed UI changes from Tasks 1-2.
- Produces: a verified MCP settings page with no backend contract changes.

- [ ] **Step 1: Run whitespace, tests, and build checks**

```bash
git diff --check HEAD~2
bun test tests/mcp-settings.test.tsx
bun run build
```

Expected: no whitespace errors, all focused tests pass, and the build exits successfully.

- [ ] **Step 2: Review the final diff for scope**

```bash
git diff --stat HEAD~2
git diff HEAD~2 -- src/components/mcp src/components/api-keys/RestApiKeys.tsx src/pages/ApiKeys.tsx tests/mcp-settings.test.tsx public/mcp-client-logos
```

Expected: only the requested UI copy, visibility behavior, official logo assets, and regression tests are present; no worker, migration, or schema file changed.
