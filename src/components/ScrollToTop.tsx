import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    const frame = window.requestAnimationFrame(function scrollToRoute() {
      const html = document.documentElement;
      const previous = html.style.scrollBehavior;
      html.style.scrollBehavior = "auto";

      if (hash) {
        const el = document.getElementById(hash.slice(1));
        if (el) {
          el.scrollIntoView({ block: "start" });
          html.style.scrollBehavior = previous;
          return;
        }
      }

      window.scrollTo(0, 0);
      html.style.scrollBehavior = previous;
    });

    return function cancelScroll() {
      window.cancelAnimationFrame(frame);
    };
  }, [pathname, hash]);

  return null;
}
