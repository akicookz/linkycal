import { describe, expect, test } from "bun:test";

import {
  isTrustedOrigin,
  sessionOriginAllowed,
} from "../../worker/lib/cors-policy";

describe("API CORS policy", () => {
  test("trusts only configured or current request origins", () => {
    const cases = [
      [
        "configured LinkyCal origin",
        "https://linkycal.com",
        "https://linkycal.com",
        "https://linkycal.com/api/projects/project-a",
        true,
      ],
      [
        "same-origin development URL",
        "http://localhost:3001",
        "https://linkycal.com",
        "http://localhost:3001/api/projects/project-a",
        true,
      ],
      [
        "unrelated origin",
        "https://evil.example",
        "https://linkycal.com",
        "https://linkycal.com/api/projects/project-a",
        false,
      ],
      [
        "malformed origin and request URL",
        "not a url",
        "https://linkycal.com",
        "also invalid",
        false,
      ],
    ] as const;

    for (const [
      name,
      origin,
      configuredBaseUrl,
      requestUrl,
      expected,
    ] of cases) {
      expect([
        name,
        isTrustedOrigin(origin, configuredBaseUrl, requestUrl),
      ]).toEqual([name, expected]);
    }
  });

  test("allows only server-side or trusted-origin session requests", () => {
    const cases = [
      [
        "server request without Origin",
        "POST",
        undefined,
        "https://linkycal.com",
        "https://linkycal.com/api/projects/project-a",
        true,
      ],
      [
        "same-origin browser request",
        "POST",
        "https://linkycal.com",
        "https://linkycal.com",
        "https://linkycal.com/api/projects/project-a",
        true,
      ],
      [
        "untrusted browser origin",
        "POST",
        "https://evil.example",
        "https://linkycal.com",
        "https://linkycal.com/api/projects/project-a",
        false,
      ],
      [
        "malformed configured and request URLs",
        "GET",
        "https://evil.example",
        "not a url",
        "also invalid",
        false,
      ],
    ] as const;

    for (const [
      name,
      method,
      origin,
      configuredBaseUrl,
      requestUrl,
      expected,
    ] of cases) {
      expect([
        name,
        sessionOriginAllowed(
          method,
          origin,
          configuredBaseUrl,
          requestUrl,
        ),
      ]).toEqual([name, expected]);
    }
  });
});
