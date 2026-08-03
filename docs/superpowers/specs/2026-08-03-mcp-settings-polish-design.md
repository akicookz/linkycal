# MCP Settings Polish Design

## Goal

Make the MCP and API settings page use recognizable official client marks, simplify the API key language, and avoid showing an empty connected-client surface when the project has no OAuth connections.

## Scope

### Official MCP client marks

Replace the generic Lucide glyphs used for Claude, ChatGPT, Cursor, and Lovable with the exact SVG assets shown in the Encited landing page's MCP section:

- `https://encited.com/crawler-logos/claude.svg`
- `https://encited.com/crawler-logos/chatgpt.svg`
- `https://encited.com/logos/cursor.svg`
- `https://encited.com/stack-logos/lovable.svg`

Store local copies in the repository so the settings page does not depend on Encited at runtime. `McpClientIcon` remains the single client-name resolver and uses the existing generic plug icon only for unknown OAuth clients. Brand SVGs retain their supplied colors and receive a consistent optical size inside the existing icon container.

### Connected clients visibility

`ConnectedMcpClients` will not render while its query is loading or when the successful response contains no connections. This prevents an empty-state card and avoids a brief empty-card flash during loading.

The card continues to render when:

- at least one OAuth client is connected, including its scopes, connection date, and revoke action; or
- the request fails, so the user still receives actionable failure feedback.

### API key language

Change the card title from `REST API keys` to `API keys`. Update the page description to say `API keys` as well. The keys remain REST API credentials; only the user-facing label changes, so no API route, component name, or database field needs renaming.

## Testing

Update the MCP settings integration tests first and demonstrate that the new expectations fail before production changes:

- A successful empty connections response does not display the `Connected MCP clients` heading.
- The rest of the page still renders the client setup instructions and `API keys` section.
- A failed connections request still displays its error feedback.
- Existing tests continue to cover connected-client revocation, setup tabs, API key creation, and API key revocation.

Logo correctness is verified through the rendered page because a test that asserts asset filenames or DOM implementation details would not protect user behavior.

## Non-goals

- No OAuth protocol or database schema changes.
- No changes to REST API key authentication.
- No changes to the MCP setup instructions beyond the requested labels and icons.
