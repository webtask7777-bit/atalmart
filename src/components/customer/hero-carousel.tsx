"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Clock, Tag, Zap, Sparkles } from "lucide-react";
import { useBannerStore, type Banner } from "@/lib/store/banners";

const BADGE_ICON: Record<string, React.ReactNode> = {
  flash: <Clock size={14} />,
  offer: <Tag size={14} />,
  free: <Zap size={14} />,
  trending: <Sparkles size={14} />,
};

function pickIcon(badge: string) {
  const key = badge.toLowerCase();
  if (key.includes("flash")) return BADGE_ICON.flash;
  if (key.includes("offer") || key.includes("coupon")) return BADGE_ICON.offer;
  if (key.includes("free") || key.includes("delivery")) return BADGE_ICON.free;
  if (key.includes("trend") || key.includes("new")) return BADGE_ICON.trending;
  return <Sparkles size={14} />;
}

export function HeroCarousel() {
  const rawBanners = useBannerStore((s) => s.banners);
  const banners = useMemo(
    () => rawBanners.filter((b) => b.enabled).sort((a, b) => a.sortOrder - b.sortOrder),
    [rawBanners],
  );
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);

  // Auto-rotate
  useEffect(() => {
    if (banners.length <= 1) return;
    const id = setInterval(() => {
      if (!pausedRef.current) {
        setActive((a) => (a + 1) % banners.length);
      }
    }, 4500);
    return () => clearInterval(id);
  }, [banners.length]);

  // Scroll to active slide
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: active * el.clientWidth, behavior: "smooth" });
  }, [active]);

  // Detect swipe — update active when scroll ends
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const idx = Math.round(el.scrollLeft / el.clientWidth);
        if (idx !== active) setActive(idx);
      }, 150);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      clearTimeout(timer);
    };
  }, [active]);

  // Re-align to the active slide when the viewport width changes (rotation,
  // split-screen, browser chrome show/hide). scrollLeft keeps the old pixel
  // offset otherwise, and the track shows two half slides.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onResize = () => {
      el.scrollTo({ left: active * el.clientWidth, behavior: "instant" });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active]);

  // Reset to first slide if banner list changes (e.g. admin disabled one)
  useEffect(() => {
    if (active >= banners.length) setActive(0);
  }, [banners.length, active]);

  if (banners.length === 0) return null;

  return (
    <section
      className="mt-3 relative"
      onMouseEnter={() => (pausedRef.current = true)}
      onMouseLeave={() => (pausedRef.current = false)}
    >
      <div
        ref={trackRef}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide rounded-2xl"
      >
        {banners.map((b, i) => (
          <Slide key={b.id} banner={b} eager={i === 0} />
        ))}
      </div>

      {banners.length > 1 && (
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex">
          {banners.map((_, i) => (
            // 24×24 minimum tap target (WCAG 2.5.8 / Lighthouse target-size);
            // the visible dot inside stays small.
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Slide ${i + 1}`}
              aria-current={i === active ? "true" : undefined}
              className="flex h-6 min-w-6 items-center justify-center px-0.5"
            >
              <span
                className={`block h-1.5 rounded-full transition-all ${
                  i === active ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/70"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Slide({ banner, eager }: { banner: Banner; eager?: boolean }) {
  // Brand artwork with the copy already in the image: render it edge to edge.
  if (banner.fullImage) {
    return (
      <Link
        href={banner.ctaHref}
        aria-label={`${banner.title} — ${banner.ctaLabel}`}
        className="relative shrink-0 w-full snap-center rounded-2xl overflow-hidden bg-saffron-light"
      >
        <picture>
          <source media="(min-width: 768px)" srcSet={banner.fullImage.desktop} />
          {/* Art-directed <picture> (different crop per breakpoint) — next/image
              can't switch sources, and these are local pre-sized WebPs. */}
          <img
            src={banner.fullImage.mobile}
            alt={`${banner.title} — ${banner.subtitle}`}
            loading={eager ? "eager" : "lazy"}
            className="block w-full h-[150px] sm:h-[160px] md:h-auto md:min-h-[200px] object-cover object-left md:object-center"
          />
        </picture>
      </Link>
    );
  }
  return (
    <Link
      href={banner.ctaHref}
      className={`relative shrink-0 w-full snap-center bg-gradient-to-br ${banner.gradient} text-white rounded-2xl overflow-hidden`}
    >
      <div className="px-4 py-5 sm:px-5 sm:py-6 md:px-8 md:py-10 min-h-[150px] sm:min-h-[160px] md:min-h-[200px] flex items-center justify-between gap-2 sm:gap-4">
        <div className="max-w-[62%] sm:max-w-[65%] md:max-w-md min-w-0 shrink">
          <span className="inline-flex items-center gap-1 bg-white/20 text-white text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-md tracking-wide">
            {pickIcon(banner.badge)}
            {banner.badge}
          </span>
          <h2 className="mt-1.5 sm:mt-2 text-base sm:text-xl md:text-3xl font-bold leading-tight">
            {banner.title}
          </h2>
          <p className="mt-1 sm:mt-1.5 text-[11px] sm:text-xs md:text-sm opacity-90 leading-snug">
            {banner.subtitle}
          </p>
          <span className="mt-2.5 sm:mt-3 inline-block bg-white text-brown text-[11px] sm:text-xs md:text-sm font-bold px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg shadow">
            {banner.ctaLabel} →
          </span>
        </div>
        <div className="flex shrink-0 items-end justify-center h-full">
          {banner.imgSrc ? (
            <Image
              src={banner.imgSrc}
              alt=""
              width={220}
              height={220}
              // First slide is above the fold and usually the LCP element, so
              // don't lazy-load it. Deliberately NOT `priority`: the carousel
              // renders client-side from the banner store, so a <link preload>
              // just competes with the JS that has to run before it can paint.
              loading={eager ? "eager" : "lazy"}
              className="w-24 sm:w-36 md:w-48 h-auto object-contain drop-shadow-xl select-none"
            />
          ) : (
            <span className="text-5xl sm:text-7xl md:text-8xl select-none opacity-90 drop-shadow-xl">
              {banner.illo}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
