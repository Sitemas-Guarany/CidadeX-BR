import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const STORAGE_KEY = "scroll-positions";

function getPositions(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

/**
 * Saves scroll position when leaving a route and restores it when returning.
 * Call once per page component that should remember its scroll.
 */
export function useScrollRestore() {
  const { pathname } = useLocation();

  // Restore on mount
  useEffect(() => {
    const pos = getPositions();
    const saved = pos[pathname];
    if (saved != null) {
      // Small delay to let DOM render
      requestAnimationFrame(() => {
        window.scrollTo(0, saved);
      });
    }
  }, [pathname]);

  // Save on unmount
  useEffect(() => {
    return () => {
      const pos = getPositions();
      pos[pathname] = window.scrollY;
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
    };
  }, [pathname]);
}
