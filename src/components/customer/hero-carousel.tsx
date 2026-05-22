"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
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
        {banners.map((b) => (
          <Slide key={b.id} banner={b} />
        ))}
      </div>

      {banners.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {banners.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              aria-label={`Slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === active ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/70"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function Slide({ banner }: { banner: Banner }) {
  return (
    <Link
      href={banner.ctaHref}
      className={`relative shrink-0 w-full snap-center bg-gradient-to-br ${banner.gradient} text-white rounded-2xl overflow-hidden`}
    >
      <div className="px-5 py-6 md:px-8 md:py-10 min-h-[160px] md:min-h-[200px] flex items-center justify-between gap-4">
        <div className="max-w-md">
          <span className="inline-flex items-center gap-1 bg-white/20 text-white text-[10px] font-bold px-2 py-1 rounded-md tracking-wide">
            {pickIcon(banner.badge)}
            {banner.badge}
          </span>
          <h2 className="mt-2 text-xl md:text-3xl font-bold leading-tight">
            {banner.title}
          </h2>
          <p className="mt-1.5 text-xs md:text-sm opacity-90 leading-snug">
            {banner.subtitle}
          </p>
          <span className="mt-3 inline-block bg-white text-brown text-xs md:text-sm font-bold px-4 py-2 rounded-lg shadow">
            {banner.ctaLabel} →
          </span>
        </div>
        <div className="hidden sm:block text-7xl md:text-8xl select-none opacity-90 drop-shadow-xl">
          {banner.illo}
        </div>
      </div>
    </Link>
  );
}
