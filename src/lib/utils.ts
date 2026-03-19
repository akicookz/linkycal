import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function copyToClipboard(text: string): void {
  try {
    navigator.clipboard.writeText(text);
  } catch {
    execCommandCopy(text);
  }
}

export function copyToClipboardLazy(textPromise: Promise<string>): void {
  try {
    // ClipboardItem with a Promise-based blob — called synchronously during user gesture,
    // the browser holds the activation while the promise resolves
    const item = new ClipboardItem({
      "text/plain": textPromise.then(
        (text) => new Blob([text], { type: "text/plain" }),
      ),
    });
    navigator.clipboard.write([item]);
  } catch {
    // Firefox fallback: ClipboardItem may not be available
    textPromise.then((text) => execCommandCopy(text));
  }
}

function execCommandCopy(text: string): void {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}
