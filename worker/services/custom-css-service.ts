import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as csstree from "css-tree";

import { evaluateEntitlement } from "../../shared/entitlement-decision";
import type { EntitlementDecision, Plan } from "../../shared/plan-catalog";
import * as dbSchema from "../db/schema";
import { EntitlementService } from "./entitlement-service";

type AppDatabase = DrizzleD1Database<Record<string, unknown>>;
const PUBLIC_ROOT = "[data-linkycal-public]";
const MAX_CUSTOM_CSS_BYTES = 20 * 1024;
const ALLOWED_AT_RULES = new Set([
  "media",
  "supports",
  "container",
  "layer",
  "keyframes",
]);

export class CustomCssEntitlementError extends Error {
  constructor(readonly decision: EntitlementDecision) {
    super("Custom CSS is not available on this workspace plan");
    this.name = "CustomCssEntitlementError";
  }
}

export class CustomCssService {
  constructor(private db: AppDatabase) {}

  compile(
    projectId: string,
    sourceCss: string,
  ): { compiledCss: string; sourceBytes: number } {
    const sourceBytes = new TextEncoder().encode(sourceCss).byteLength;
    if (sourceBytes > MAX_CUSTOM_CSS_BYTES) {
      throw new Error("Custom CSS must be 20 KB or less");
    }
    assertBalancedCss(sourceCss);

    let ast: csstree.CssNode;
    try {
      ast = csstree.parse(sourceCss, {
        positions: false,
        parseCustomProperty: true,
        onParseError(error) {
          throw error;
        },
      });
    } catch {
      throw new Error("Invalid CSS");
    }

    const keyframes = new Map<string, string>();
    csstree.walk(ast, {
      visit: "Url",
      enter() {
        throw new Error("URLs are not allowed in Custom CSS");
      },
    });
    csstree.walk(ast, {
      visit: "Atrule",
      enter(node) {
        const name = node.name.toLowerCase();
        if (!ALLOWED_AT_RULES.has(name)) {
          throw new Error(`@${node.name} is not allowed in Custom CSS`);
        }
        if (name !== "keyframes" || !node.prelude) return;
        const original = csstree.generate(node.prelude).trim();
        const namespaced = `lc-${stableProjectSegment(projectId)}-${original}`;
        keyframes.set(original, namespaced);
        node.prelude = csstree.parse(namespaced, {
          context: "atrulePrelude",
          atrule: "keyframes",
        }) as csstree.AtrulePrelude;
      },
    });

    csstree.walk(ast, {
      visit: "Rule",
      enter(node) {
        if (this.atrule?.name.toLowerCase() === "keyframes") return;
        if (node.prelude.type !== "SelectorList") {
          throw new Error("Invalid CSS selector");
        }
        const selectors = node.prelude.children
          .toArray()
          .map((selector) => scopeSelector(csstree.generate(selector)))
          .join(",");
        node.prelude = csstree.parse(selectors, {
          context: "selectorList",
        }) as csstree.SelectorList;
      },
    });

    if (keyframes.size > 0) {
      csstree.walk(ast, {
        visit: "Declaration",
        enter(node) {
          const property = node.property.toLowerCase();
          if (property !== "animation" && property !== "animation-name") return;
          csstree.walk(node.value, {
            visit: "Identifier",
            enter(identifier) {
              const replacement = keyframes.get(identifier.name);
              if (replacement) identifier.name = replacement;
            },
          });
        },
      });
    }

    return { compiledCss: csstree.generate(ast), sourceBytes };
  }

  async getForSettings(
    projectId: string,
  ): Promise<dbSchema.ProjectCustomCssRow | null> {
    const [row] = await this.db
      .select()
      .from(dbSchema.projectCustomCss)
      .where(eq(dbSchema.projectCustomCss.projectId, projectId))
      .limit(1);
    return row ?? null;
  }

  async getPublished(projectId: string, plan: Plan): Promise<string | null> {
    const decision = evaluateEntitlement({ plan, key: "customCss" });
    if (!decision.allowed) return null;
    return (await this.getForSettings(projectId))?.compiledCss ?? null;
  }

  async save(
    projectId: string,
    sourceCss: string,
    updatedByUserId: string,
  ): Promise<dbSchema.ProjectCustomCssRow> {
    const decision = await new EntitlementService(this.db).feature(
      projectId,
      "customCss",
    );
    if (!decision.allowed) throw new CustomCssEntitlementError(decision);
    const compiled = this.compile(projectId, sourceCss);
    await this.db
      .insert(dbSchema.projectCustomCss)
      .values({
        id: crypto.randomUUID(),
        projectId,
        sourceCss,
        compiledCss: compiled.compiledCss,
        sourceBytes: compiled.sourceBytes,
        updatedByUserId,
      })
      .onConflictDoUpdate({
        target: dbSchema.projectCustomCss.projectId,
        set: {
          sourceCss,
          compiledCss: compiled.compiledCss,
          sourceBytes: compiled.sourceBytes,
          updatedByUserId,
          updatedAt: new Date(),
        },
      });
    const saved = await this.getForSettings(projectId);
    if (!saved) throw new Error("Failed to save Custom CSS");
    return saved;
  }

  async remove(projectId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(dbSchema.projectCustomCss)
      .where(eq(dbSchema.projectCustomCss.projectId, projectId))
      .returning({ id: dbSchema.projectCustomCss.id });
    return deleted.length > 0;
  }
}

function scopeSelector(selector: string): string {
  let remainder = selector.trim();
  let consumedRoot = false;
  while (true) {
    const match = /^(?::root|html|body)(?=$|[\s.#:[>+~])/i.exec(remainder);
    if (!match) break;
    consumedRoot = true;
    remainder = remainder.slice(match[0].length).trimStart();
  }
  if (consumedRoot) return `${PUBLIC_ROOT}${remainder}`;
  return `${PUBLIC_ROOT} ${remainder}`;
}

function stableProjectSegment(projectId: string): string {
  let hash = 2166136261;
  for (let index = 0; index < projectId.length; index += 1) {
    hash ^= projectId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function assertBalancedCss(sourceCss: string): void {
  const stack: string[] = [];
  let quote: '"' | "'" | null = null;
  let inComment = false;
  for (let index = 0; index < sourceCss.length; index += 1) {
    const char = sourceCss[index];
    const next = sourceCss[index + 1];
    if (inComment) {
      if (char === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (char === "\\") {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "/" && next === "*") {
      inComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "{" || char === "(" || char === "[") {
      stack.push(char);
      continue;
    }
    if (char === "}" || char === ")" || char === "]") {
      const expected = char === "}" ? "{" : char === ")" ? "(" : "[";
      if (stack.pop() !== expected) throw new Error("Invalid CSS");
    }
  }
  if (stack.length > 0 || quote || inComment) throw new Error("Invalid CSS");
}
