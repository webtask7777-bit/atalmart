"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

/**
 * Horizontal-rail scroll state for a `ref`'d overflow-x container:
 * whether there is anything to scroll to the left / right (so arrows can
 * hide at the ends and disappear entirely when the content fits), plus a
 * page-wise smooth scroller for those arrows / keyboard.
 */
export function useRailScroll(ref: RefObject<HTMLElement | null>) {
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const max = el.scrollWidth - el.clientWidth;
      setCanLeft(el.scrollLeft > 4);
      setCanRight(el.scrollLeft < max - 4);
    };
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(measure);
    };
    schedule();
    el.addEventListener("scroll", schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    // Content can change width after mount (images, more cards).
    const mo = new MutationObserver(schedule);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener("scroll", schedule);
      ro.disconnect();
      mo.disconnect();
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [ref]);

  const scrollByPage = useCallback(
    (dir: "left" | "right") => {
      const el = ref.current;
      if (!el) return;
      const amount = Math.max(160, el.clientWidth * 0.85);
      el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
    },
    [ref],
  );

  return { canLeft, canRight, scrollByPage };
}
