import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SEOHead } from "../src/components/SEOHead";

describe("SEO head metadata", () => {
  test("keeps route-owned metadata out of the static app template", () => {
    const template = readFileSync(
      new URL("../index.html", import.meta.url),
      "utf8",
    );

    expect(template).not.toContain("data-rh");
    expect(template).not.toContain("<title");
    expect(template).not.toContain('name="description"');
    expect(template).not.toContain('rel="canonical"');
  });

  test("renders one canonical tag and one JSON-LD document", () => {
    const html = renderToStaticMarkup(
      createElement(SEOHead, {
        title: "Docs",
        canonical: "https://linkycal.com/docs",
        structuredData: {
          "@context": "https://schema.org",
          "@type": "TechArticle",
        },
      }),
    );

    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html).toContain('href="https://linkycal.com/docs"');
    expect(html.match(/type="application\/ld\+json"/g)).toHaveLength(1);
    expect(html).toContain('"@type":"TechArticle"');
  });
});
