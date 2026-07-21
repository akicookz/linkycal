import { describe, expect, test } from "bun:test";

import {
  isTrustedOrigin,
  sessionOriginAllowed,
} from "../../worker/lib/cors-policy";

describe("API CORS policy", () => {
  test("trusts the configured LinkyCal origin", () => {
    expect(
      isTrustedOrigin(
        "https://linkycal.com",
        "https://linkycal.com",
        "https://linkycal.com/api/projects/project-a",
      ),
    ).toBe(true);
  });

  test("trusts the current same-origin development URL", () => {
    expect(
      isTrustedOrigin(
        "http://localhost:3001",
        "https://linkycal.com",
        "http://localhost:3001/api/projects/project-a",
      ),
    ).toBe(true);
  });

  test("rejects an unrelated origin", () => {
    expect(
      isTrustedOrigin(
        "https://evil.example",
        "https://linkycal.com",
        "https://linkycal.com/api/projects/project-a",
      ),
    ).toBe(false);
  });

  test("allows server and same-origin session requests", () => {
    expect(
      sessionOriginAllowed(
        "POST",
        undefined,
        "https://linkycal.com",
        "https://linkycal.com/api/projects/project-a",
      ),
    ).toBe(true);
    expect(
      sessionOriginAllowed(
        "POST",
        "https://linkycal.com",
        "https://linkycal.com",
        "https://linkycal.com/api/projects/project-a",
      ),
    ).toBe(true);
  });

  test("rejects session requests from an untrusted origin", () => {
    expect(
      sessionOriginAllowed(
        "POST",
        "https://evil.example",
        "https://linkycal.com",
        "https://linkycal.com/api/projects/project-a",
      ),
    ).toBe(false);
  });

  test("fails closed for malformed URL values when Origin is present", () => {
    expect(
      isTrustedOrigin("not a url", "https://linkycal.com", "also invalid"),
    ).toBe(false);
    expect(
      sessionOriginAllowed(
        "GET",
        "https://evil.example",
        "not a url",
        "also invalid",
      ),
    ).toBe(false);
  });
});
