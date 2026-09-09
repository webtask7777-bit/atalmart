"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { heroSlides, type HeroProduct, type HeroSlide } from "@/data/hero-slides";
import styles from "./AtalmartHero.module.css";

/**
 * Home offer carousel (atalmart-hero-benefits-premium-v1).
 *
 * Copy, links and the packshots of each slide live in src/data/hero-slides.ts
 * — edit an object there; this component only renders. Only the active slide
 * is in the DOM, so the first slide's images are the only ones in the initial
 * HTML (its centre pack is the home's LCP candidate and is preloaded).
 */

type AtalmartHeroProps = {
  className?: string;
  slides?: readonly HeroSlide[];
  autoPlayMs?: number;
};

const PACK_CLASS = [styles.packLeft, styles.packCenter, styles.packRight] as const;
const PACK_SIZES = ["170px", "210px", "165px"] as const;

/** Up to three real packshots (transparent cutouts) + one badge pill. */
function PackArt({ products, badge, eager }: { products: readonly HeroProduct[]; badge: string; eager: boolean }) {
  return (
    <div className={styles.packArt} aria-hidden="true">
      {products.slice(0, 3).map((product, i) => (
        <div key={product.src} className={`${styles.pack} ${PACK_CLASS[i]}`}>
          <Image
            unoptimized
            src={product.src}
            alt=""
            fill
            sizes={PACK_SIZES[i]}
            priority={eager && i === 1}
            loading={eager ? "eager" : undefined}
          />
        </div>
      ))}
      <span className={styles.artBadge}>{badge}</span>
    </div>
  );
}

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={direction === "left" ? "m15 18-6-6 6-6" : "m9 6 6 6-6 6"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// prefers-reduced-motion as an external store: no effect + setState, and the
// server snapshot (true = no autoplay) never differs from the first client
// render, so there is nothing to hydrate around.
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const getReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;
const getReducedMotionServer = () => true;

export function AtalmartHero({
  className = "",
  slides = heroSlides,
  autoPlayMs = 6500,
}: AtalmartHeroProps) {
  const [rawIndex, setRawIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const reduceMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    getReducedMotionServer,
  );
  const touchStartX = useRef<number | null>(null);
  const slideCount = slides.length;
  // Clamp at render time (instead of an effect) in case the slide list shrinks.
  const activeIndex = rawIndex < slideCount ? rawIndex : 0;

  const goTo = useCallback(
    (index: number) => {
      setRawIndex((index + slideCount) % slideCount);
    },
    [slideCount],
  );

  // Restarts whenever the slide changes, so a tap on a dot/arrow or a swipe
  // gets the full interval before autoplay moves on again.
  useEffect(() => {
    if (isPaused || reduceMotion || slideCount < 2) return;
    const timer = window.setInterval(
      () => setRawIndex((current) => (current + 1) % slideCount),
      autoPlayMs,
    );
    return () => window.clearInterval(timer);
  }, [autoPlayMs, isPaused, reduceMotion, slideCount, activeIndex]);

  if (!slideCount) return null;

  const slide = slides[activeIndex] ?? slides[0];
  if (!slide) return null;

  return (
    <section
      className={[styles.hero, className].filter(Boolean).join(" ")}
      data-tone={slide.tone}
      aria-roledescription="carousel"
      aria-label="Atalmart offers"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (!nextTarget || !event.currentTarget.contains(nextTarget as Node)) {
          setIsPaused(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") goTo(activeIndex - 1);
        if (event.key === "ArrowRight") goTo(activeIndex + 1);
      }}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        if (touchStartX.current === null) return;
        const distance = (event.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
        if (Math.abs(distance) > 42) goTo(activeIndex + (distance < 0 ? 1 : -1));
        touchStartX.current = null;
      }}
    >
      <div className={styles.ambientOne} aria-hidden="true" />
      <div className={styles.ambientTwo} aria-hidden="true" />

      <div
        key={slide.id}
        className={styles.slide}
        role="group"
        aria-roledescription="slide"
        aria-label={`${activeIndex + 1} of ${slideCount}`}
        aria-live={isPaused ? "polite" : "off"}
      >
        <div className={styles.content}>
          <span className={styles.eyebrow}>{slide.eyebrow}</span>
          <h2 className={styles.title}>
            {slide.title}
            <span>{slide.accent}</span>
          </h2>
          <p className={styles.description}>{slide.description}</p>

          <div className={styles.actions}>
            <Link href={slide.href} prefetch={false} className={styles.primaryCta}>
              {slide.ctaLabel}
              <span aria-hidden="true">→</span>
            </Link>
            <span className={styles.meta}>{slide.meta}</span>
          </div>
        </div>

        <div className={styles.art}>
          <PackArt products={slide.products} badge={slide.badge} eager={activeIndex === 0} />
        </div>
      </div>

      {slideCount > 1 && (
        <>
          <button
            type="button"
            className={`${styles.arrow} ${styles.arrowLeft}`}
            onClick={() => goTo(activeIndex - 1)}
            aria-label="Previous offer"
          >
            <ArrowIcon direction="left" />
          </button>
          <button
            type="button"
            className={`${styles.arrow} ${styles.arrowRight}`}
            onClick={() => goTo(activeIndex + 1)}
            aria-label="Next offer"
          >
            <ArrowIcon direction="right" />
          </button>

          <div className={styles.dots} aria-label="Choose offer">
            {slides.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => goTo(index)}
                aria-label={`Show ${item.eyebrow.replace(/^[^A-Z₹]+/, "").toLowerCase()}`}
                aria-current={index === activeIndex ? "true" : undefined}
                className={index === activeIndex ? styles.activeDot : styles.dot}
              >
                <span />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
