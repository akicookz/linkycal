import { useRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

const DISMISS_DISTANCE = 64;

export function DismissHandle({ className }: { className?: string }) {
  const startY = useRef<number | null>(null);
  const lastDy = useRef(0);

  function sheetEl(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof HTMLElement)) return null;
    return target.closest("[role='dialog']");
  }

  function resetTransform(target: EventTarget | null) {
    const el = sheetEl(target);
    if (el) el.style.transform = "";
  }

  return (
    <DialogPrimitive.Close
      type="button"
      aria-label="Dismiss"
      className={className ?? "mx-auto flex h-8 w-full items-center justify-center sm:hidden"}
      onPointerDown={(event) => {
        startY.current = event.clientY;
        lastDy.current = 0;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (startY.current == null) return;
        const dy = Math.max(0, event.clientY - startY.current);
        lastDy.current = dy;
        const el = sheetEl(event.currentTarget);
        if (el) el.style.transform = `translateY(${dy}px)`;
      }}
      onPointerUp={(event) => {
        const dy = lastDy.current;
        startY.current = null;
        lastDy.current = 0;
        resetTransform(event.currentTarget);
        if (dy >= 8 && dy < DISMISS_DISTANCE) {
          event.preventDefault();
          return;
        }
        if (dy >= DISMISS_DISTANCE) {
          event.currentTarget.click();
        }
      }}
      onPointerCancel={(event) => {
        startY.current = null;
        lastDy.current = 0;
        resetTransform(event.currentTarget);
      }}
    >
      <span className="h-1 w-10 rounded-full bg-muted-foreground/25" />
    </DialogPrimitive.Close>
  );
}
