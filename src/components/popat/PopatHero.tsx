"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./PopatHero.module.css";
import { popatSlides, type PopatSlide } from "./popat-slides";

export type PopatHeroProps = {
  slides?: readonly PopatSlide[];
  autoPlayMs?: number;
  initialSlide?: number;
  className?: string;
  /** Set when the hero is above the fold (first paint). Off by default: on
   *  Atalmart it sits mid-page, so preloading its images would only compete
   *  with the real LCP element. */
  eager?: boolean;
};

export function PopatHero({
  slides = popatSlides,
  autoPlayMs = 6500,
  initialSlide = 0,
  className = "",
  eager = false,
}: PopatHeroProps) {
  const firstSlide = Math.min(
    Math.max(initialSlide, 0),
    Math.max(slides.length - 1, 0),
  );
  const [rawIndex, setActiveIndex] = useState(firstSlide);
  const [isPaused, setIsPaused] = useState(false);
  // The hero sits mid-page on Atalmart: don't rotate slides or fetch the next
  // slide's packshots until the visitor has scrolled near it.
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  // Clamp in render (not in an effect) so a shorter `slides` list never
  // leaves the index pointing past the end.
  const activeIndex = rawIndex < slides.length ? rawIndex : 0;

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: "200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || slides.length < 2 || autoPlayMs <= 0 || isPaused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, autoPlayMs);

    return () => window.clearInterval(timer);
  }, [autoPlayMs, inView, isPaused, slides.length]);

  // Warm the next slide's packshots while the current one is showing, so a
  // slide change never paints an empty product stack (the images are only
  // mounted for the active slide and load lazily by default).
  useEffect(() => {
    if (!inView || slides.length < 2) return;
    const next = slides[(activeIndex + 1) % slides.length];
    for (const item of next.products) {
      const img = new window.Image();
      img.src = item.src;
    }
  }, [activeIndex, inView, slides]);

  // Touch swipe: a mostly-horizontal flick of 40px+ changes slide; vertical
  // scrolling through the hero is left alone.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swipedRef = useRef(false);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || slides.length < 2) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    swipedRef.current = true;
    setActiveIndex((current) => (current + (dx < 0 ? 1 : -1) + slides.length) % slides.length);
  };

  if (!slides.length) return null;

  const slide = slides[activeIndex];

  return (
    <section
      ref={sectionRef}
      className={[styles.hero, className].filter(Boolean).join(" ")}
      data-theme={slide.theme}
      aria-roledescription="carousel"
      aria-label="Popat featured snacks"
      onPointerEnter={() => setIsPaused(true)}
      onPointerLeave={() => setIsPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsPaused(false);
        }
      }}
    >
      <div className={styles.pattern} aria-hidden="true" />
      <div className={styles.orb} aria-hidden="true" />

      {/* The whole slide is the link (no separate CTA button). A swipe that
          just changed the slide must not also count as a tap. */}
      <Link
        href={slide.href}
        aria-label={`${slide.eyebrow} — ${slide.title} ${slide.accent}. ${slide.cta}`}
        className={styles.slideLink}
        draggable={false}
        onClick={(e) => {
          if (swipedRef.current) {
            e.preventDefault();
            swipedRef.current = false;
          }
        }}
      >
        <div className={styles.shell} key={slide.id}>
          <div className={styles.copy}>
            <Image
              className={styles.logo}
              src="/popat/popat-logo.webp"
              width={260}
              height={165}
              alt="Popat Plus"
              priority={eager}
              loading={eager ? "eager" : "lazy"}
            />

            <p className={styles.eyebrow}>{slide.eyebrow}</p>

            <h2 className={styles.title}>
              <span>{slide.title}</span>
              <strong>{slide.accent}</strong>
            </h2>

            <p className={styles.description}>{slide.description}</p>

            <div className={styles.actions}>
              <span className={styles.microBadge}>
                <i aria-hidden="true" />
                100% Veg
              </span>
            </div>
          </div>

          <div
            className={styles.products}
            aria-label={"Products for " + slide.eyebrow}
          >
            <div className={styles.productGlow} aria-hidden="true" />
            {slide.products.map((item, index) => (
              <div
                className={[
                  styles.product,
                  styles["product" + (index + 1)],
                ].join(" ")}
                key={slide.id + "-" + item.src}
              >
                <Image
                  src={item.src}
                  alt={item.alt}
                  fill
                  priority={eager && activeIndex === firstSlide && index < 3}
                  loading={eager ? "eager" : "lazy"}
                  sizes="(max-width: 720px) 34vw, (max-width: 1100px) 22vw, 19vw"
                />
              </div>
            ))}
            <div className={styles.flavourBadge}>
              <span>{slide.badge}</span>
              <small>Popat favourites</small>
            </div>
          </div>
        </div>
      </Link>

      <p className={styles.srOnly} aria-live="polite">
        Showing banner {activeIndex + 1} of {slides.length}: {slide.eyebrow}
      </p>
    </section>
  );
}
