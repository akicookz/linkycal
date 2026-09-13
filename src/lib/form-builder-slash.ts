const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "tel",
  "url",
  "number",
  "password",
  "date",
  "time",
  "datetime-local",
  "month",
  "week",
]);

function closestSurface(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  return target.closest(
    "input, textarea, select, [contenteditable], [role='textbox'], [role='combobox'], [role='listbox']",
  );
}

export function isSlashHotkey(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "isComposing">,
): boolean {
  return (
    event.key === "/" &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.isComposing
  );
}

export function isTypingSurface(target: EventTarget | null): boolean {
  const el = closestSurface(target);
  if (!el) return false;
  if (el instanceof HTMLInputElement) {
    return TEXT_INPUT_TYPES.has((el.type || "text").toLowerCase());
  }
  if (el.getAttribute("contenteditable") === "false") return false;
  return true;
}

export function isFocusableControl(
  target: EventTarget | null,
  root?: HTMLElement | null,
): boolean {
  if (!(target instanceof Element)) return false;
  const el = target.closest(
    "a[href], button, input, textarea, select, [contenteditable], [role='button'], [role='textbox'], [role='combobox'], [role='listbox']",
  );
  if (!el || el === root) return false;
  return true;
}

export function findScrollParent(el: HTMLElement): HTMLElement | null {
  let current = el.parentElement;
  while (current) {
    const overflowY = getComputedStyle(current).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return current;
    current = current.parentElement;
  }
  return null;
}

export function scrollNodeIntoNearest(
  node: HTMLElement,
  scroller: HTMLElement | null,
): void {
  if (!scroller) {
    node.scrollIntoView({ block: "nearest", inline: "nearest" });
    return;
  }
  const nodeRect = node.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  if (nodeRect.bottom > scrollerRect.bottom) {
    scroller.scrollTop += nodeRect.bottom - scrollerRect.bottom + 8;
    return;
  }
  if (nodeRect.top < scrollerRect.top) {
    scroller.scrollTop -= scrollerRect.top - nodeRect.top + 8;
  }
}
