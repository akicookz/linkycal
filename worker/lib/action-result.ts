import type { DrizzleD1Database } from "drizzle-orm/d1";

import type { AppEnv, ProjectScope } from "../types";

export type ActionStatus = 200 | 201 | 400 | 403 | 404 | 409 | 429 | 500 | 502;

export interface ActionErrorBody {
  error: string;
  code?: string;
  [key: string]: unknown;
}

export type ActionResult<T> =
  | { ok: true; status: 200 | 201; value: T }
  | {
      ok: false;
      status: Exclude<ActionStatus, 200 | 201>;
      body: ActionErrorBody;
      headers?: Record<string, string>;
    };

export interface ProjectActionDeps {
  db: DrizzleD1Database<Record<string, unknown>>;
  env: AppEnv;
  projectId: string;
  channel: "rest" | "mcp";
  projectScope?: ProjectScope;
  actorUserId?: string;
  waitUntil: (promise: Promise<unknown>) => void;
}

export function actionOk<T>(value: T): ActionResult<T> {
  return { ok: true, status: 200, value };
}

export function actionCreated<T>(value: T): ActionResult<T> {
  return { ok: true, status: 201, value };
}

export function actionError<T = never>(
  status: Exclude<ActionStatus, 200 | 201>,
  error: string,
  options?: {
    code?: string;
    details?: Record<string, unknown>;
    headers?: Record<string, string>;
  },
): ActionResult<T> {
  return {
    ok: false,
    status,
    body: {
      error,
      ...(options?.code ? { code: options.code } : {}),
      ...options?.details,
    },
    ...(options?.headers ? { headers: options.headers } : {}),
  };
}

export function actionNotFound<T = never>(resource: string): ActionResult<T> {
  return actionError(404, `${resource} not found`);
}
