import type { ActionResult } from "../lib/action-result";
import { err, ok } from "./helpers";
import type { ToolResult } from "./helpers";

export function actionToMcpResult(result: ActionResult<unknown> | {
  ok: boolean;
  body: { error?: string; code?: string } | unknown;
  value?: unknown;
}): ToolResult {
  if (result.ok) {
    return ok("value" in result && result.value !== undefined
      ? result.value
      : "body" in result ? result.body : null);
  }
  const body = result.body && typeof result.body === "object"
    ? result.body as { error?: string; code?: string }
    : {};
  if (body.code?.startsWith("plan_")) {
    return {
      content: [{ type: "text", text: body.error ?? "Request denied" }],
      isError: true,
      structuredContent: { entitlementError: body },
    };
  }
  return err(body.error ?? "Request failed");
}
