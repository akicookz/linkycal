import { useCallback, useState, type KeyboardEvent } from "react";

export function useFormBuilderCommandMenu(
  initialOpen = false,
  options?: { closeOnEmptyBackspace?: boolean },
) {
  const [open, setOpen] = useState(initialOpen);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const close = useCallback(function closeMenu() {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  const openMenu = useCallback(function openCommandMenu() {
    setOpen(true);
    setQuery("");
    setActiveIndex(0);
  }, []);

  const handleKeyDown = useCallback(
    function onMenuKeyDown(
      event: KeyboardEvent,
      input: {
        itemCount: number;
        onRun: (index: number) => void;
      },
    ): boolean {
      if (!open) {
        if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          openMenu();
          return true;
        }
        return false;
      }

      const count = input.itemCount;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (count === 0) return true;
        setActiveIndex(function next(current) {
          return (current + 1) % count;
        });
        return true;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (count === 0) return true;
        setActiveIndex(function next(current) {
          return (current - 1 + count) % count;
        });
        return true;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (count > 0) input.onRun(Math.min(activeIndex, count - 1));
        return true;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return true;
      }
      if (
        event.key === "Backspace" &&
        query === "" &&
        options?.closeOnEmptyBackspace !== false
      ) {
        event.preventDefault();
        close();
        return true;
      }
      return false;
    },
    [activeIndex, close, open, openMenu, options?.closeOnEmptyBackspace, query],
  );

  return {
    open,
    query,
    activeIndex,
    setQuery,
    setActiveIndex,
    setOpen,
    openMenu,
    close,
    handleKeyDown,
  };
}
