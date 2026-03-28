const ALLOWED_LINK_PROTOCOLS = ["http:", "https:", "mailto:", "tel:"];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function normalizePlainText(value: string | null | undefined): string {
  return (value ?? "").replace(/\r\n?/g, "\n").trim();
}

function sanitizeHref(value: string | null): string | null {
  if (!value) return null;

  try {
    const parsed = new URL(value, window.location.origin);
    if (!ALLOWED_LINK_PROTOCOLS.includes(parsed.protocol)) {
      return null;
    }

    return parsed.href;
  } catch {
    return null;
  }
}

function serializeNode(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtml(node.textContent ?? "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();
  const children = Array.from(element.childNodes)
    .map(serializeNode)
    .join("");

  if (tagName === "br") {
    return "<br>";
  }

  if (tagName === "b" || tagName === "strong") {
    return children ? `<strong>${children}</strong>` : "";
  }

  if (tagName === "i" || tagName === "em") {
    return children ? `<em>${children}</em>` : "";
  }

  if (tagName === "a") {
    const href = sanitizeHref(element.getAttribute("href"));
    if (!href) return children;
    return children
      ? `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">${children}</a>`
      : "";
  }

  if (tagName === "p" || tagName === "div") {
    const innerHtml = children.trim();
    if (!innerHtml) return "";
    return `<p>${innerHtml}</p>`;
  }

  return children;
}

export function plainTextToRichTextHtml(value: string | null | undefined): string | null {
  const normalizedValue = normalizePlainText(value);
  if (!normalizedValue) return null;

  const paragraphs = normalizedValue
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return null;

  return paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function sanitizeRichTextHtml(value: string | null | undefined): string | null {
  if (!value || typeof DOMParser === "undefined") {
    return plainTextToRichTextHtml(value);
  }

  const parser = new DOMParser();
  const documentNode = parser.parseFromString(`<div>${value}</div>`, "text/html");
  const root = documentNode.body.firstElementChild;
  if (!root) return null;

  const sanitized = Array.from(root.childNodes)
    .map(serializeNode)
    .join("")
    .trim();

  return getPlainTextFromSanitizedHtml(sanitized).length === 0 ? null : sanitized;
}

export function richTextToPlainText(value: string | null | undefined): string {
  const sanitized = sanitizeRichTextHtml(value);
  return getPlainTextFromSanitizedHtml(sanitized);
}

export function isRichTextEmpty(value: string | null | undefined): boolean {
  return richTextToPlainText(value).length === 0;
}

export function getRenderableRichTextHtml(
  richValue: string | null | undefined,
  fallbackPlainText?: string | null,
): string | null {
  return sanitizeRichTextHtml(richValue) ?? plainTextToRichTextHtml(fallbackPlainText);
}

function getPlainTextFromSanitizedHtml(value: string | null | undefined): string {
  if (!value || typeof DOMParser === "undefined") {
    return "";
  }

  const parser = new DOMParser();
  const documentNode = parser.parseFromString(value, "text/html");

  const lines = Array.from(documentNode.body.childNodes).flatMap((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const textValue = node.textContent?.trim() ?? "";
      return textValue ? [textValue] : [];
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return [];
    }

    const element = node as HTMLElement;
    const textValue = element.textContent?.replace(/\u00a0/g, " ").trim() ?? "";
    return textValue ? [textValue] : [];
  });

  return lines.join("\n").trim();
}
