/// <reference lib="dom" />

import { afterEach, beforeEach, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";

import Docs from "../src/pages/Docs";

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "scrollIntoView",
);

beforeEach(() => {
  globalThis.requestAnimationFrame = (() => 1) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: () => {},
  });
});

afterEach(() => {
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  if (originalScrollIntoView) {
    Object.defineProperty(
      Element.prototype,
      "scrollIntoView",
      originalScrollIntoView,
    );
  } else {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  }
});

test("renders bearer authentication and machine-readable documentation links", () => {
  render(
    <HelmetProvider>
      <MemoryRouter>
        <Docs />
      </MemoryRouter>
    </HelmetProvider>,
  );

  expect(
    screen.getByText("Authorization: Bearer lc_live_...", { exact: true }),
  ).not.toBeNull();
  expect(
    screen
      .getAllByRole("link", { name: /OpenAPI/i })
      .some((link) => link.getAttribute("href") === "/openapi.json"),
  ).toBe(true);
  expect(
    screen
      .getAllByRole("link", { name: /llms\.txt/i })
      .some((link) => link.getAttribute("href") === "/llms.txt"),
  ).toBe(true);
  expect(screen.queryByText(/Cookie: session=/)).toBeNull();
});
