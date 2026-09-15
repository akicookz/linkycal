import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    let observer: MutationObserver | undefined;
    let timeout: number | undefined;

    function scrollToRoute() {
      const html = document.documentElement;
      const previous = html.style.scrollBehavior;
      html.style.scrollBehavior = "auto";

      if (hash) {
        let hashId = hash.slice(1);
        try {
          hashId = decodeURIComponent(hashId);
        } catch {
          // Keep the raw hash when a malformed escape is present.
        }
        const el = document.getElementById(hashId);
        if (el) {
          el.scrollIntoView({ block: "start" });
          html.style.scrollBehavior = previous;
          observer?.disconnect();
          if (timeout) window.clearTimeout(timeout);
          return true;
        }
        html.style.scrollBehavior = previous;
        return false;
      }

      window.scrollTo(0, 0);
      html.style.scrollBehavior = previous;
      return true;
    }

    const frame = window.requestAnimationFrame(() => {
      if (!scrollToRoute() && hash) {
        observer = new MutationObserver(() => {
          if (scrollToRoute()) observer?.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["id"] });
        timeout = window.setTimeout(() => observer?.disconnect(), 5000);
      }
    });

    return function cancelScroll() {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      if (timeout) window.clearTimeout(timeout);
    };
  }, [pathname, hash]);

  return null;
}
