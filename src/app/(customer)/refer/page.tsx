"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Gift,
  Share2,
  Copy,
  MessageCircle,
  CheckCircle2,
  Wallet,
  Users,
  TrendingUp,
} from "lucide-react";
import {
  useReferralStore,
  REFERRAL_REWARD,
  REFERRAL_MIN_ORDER,
} from "@/lib/store/referrals";
import { toast } from "sonner";

export default function ReferAndEarnPage() {
  const ensureMyCode = useReferralStore((s) => s.ensureMyCode);
  const events = useReferralStore((s) => s.events);
  const creditBalance = useReferralStore((s) => s.creditBalance);
  const [code, setCode] = useState("");
  const [shareUrl, setShareUrl] = useState("");

  useEffect(() => {
    const c = ensureMyCode();
    setCode(c);
    if (typeof window !== "undefined") {
      setShareUrl(`${window.location.origin}/?ref=${c}`);
    }
  }, [ensureMyCode]);

  const signups = events.length;
  const ordered = events.filter((e) => e.status !== "signed_up").length;
  const credited = events.filter((e) => e.status === "credited").length;
  const totalEarned = credited * REFERRAL_REWARD;

  const shareMessage = `Hey! 👋 Try Atalmart — Naya Raipur ka quick grocery delivery 🛵⚡\n\nUse my code *${code}* and get ₹${REFERRAL_REWARD} OFF on your first order (₹${REFERRAL_MIN_ORDER}+)\n\n${shareUrl}`;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Code copied!");
    } catch {
      toast.error("Could not copy");
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied!");
    } catch {
      toast.error("Could not copy");
    }
  };

  const shareWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
    window.open(url, "_blank", "noopener");
  };

  const shareNative = async () => {
    if (!navigator.share) {
      shareWhatsApp();
      return;
    }
    try {
      await navigator.share({
        title: "Atalmart — ₹50 off",
        text: shareMessage,
        url: shareUrl,
      });
    } catch {
      // user cancelled
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-32">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/"
          className="p-2 rounded-full hover:bg-saffron-light transition-colors"
        >
          <ArrowLeft size={20} className="text-brown" />
        </Link>
        <h1 className="text-xl font-bold text-brown">Refer & Earn</h1>
      </div>

      {/* Hero card */}
      <div className="relative overflow-hidden bg-gradient-to-br from-saffron via-orange-500 to-red-500 rounded-3xl p-6 text-white mb-5">
        <div className="absolute -right-6 -bottom-6 text-8xl opacity-20 select-none pointer-events-none">
          🎁
        </div>
        <div className="relative z-10">
          <p className="text-xs font-bold uppercase tracking-wider opacity-90 mb-2">
            Apne dosto ko invite karein
          </p>
          <h2 className="text-2xl font-bold leading-tight">
            Refer a friend &<br />
            both get ₹{REFERRAL_REWARD}
          </h2>
          <p className="text-sm opacity-90 mt-2 max-w-xs leading-relaxed">
            Friend signs up via your code → both of you get ₹{REFERRAL_REWARD} off.
            Friend ka pehla order min ₹{REFERRAL_MIN_ORDER} ka hona chahiye.
          </p>
        </div>
      </div>

      {/* My code */}
      <div className="bg-white rounded-2xl border-2 border-saffron p-5 mb-5">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">
          Your referral code
        </p>
        <div className="flex items-center justify-between gap-3">
          <p className="text-3xl font-bold text-brown font-mono tracking-widest">
            {code || "------"}
          </p>
          <button
            onClick={copyCode}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-saffron border-2 border-saffron rounded-xl hover:bg-saffron-light transition-colors"
          >
            <Copy size={14} />
            Copy
          </button>
        </div>

        {/* Share buttons */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <button
            onClick={shareWhatsApp}
            className="flex flex-col items-center gap-1.5 py-3 bg-indian-green text-white rounded-xl hover:bg-green-700 transition-colors"
          >
            <MessageCircle size={20} />
            <span className="text-xs font-semibold">WhatsApp</span>
          </button>
          <button
            onClick={copyLink}
            className="flex flex-col items-center gap-1.5 py-3 bg-gray-100 text-brown rounded-xl hover:bg-gray-200 transition-colors"
          >
            <Copy size={20} />
            <span className="text-xs font-semibold">Copy link</span>
          </button>
          <button
            onClick={shareNative}
            className="flex flex-col items-center gap-1.5 py-3 bg-saffron text-white rounded-xl hover:bg-orange-600 transition-colors"
          >
            <Share2 size={20} />
            <span className="text-xs font-semibold">More</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatTile
          icon={<Users size={14} />}
          label="Invited"
          value={String(signups)}
          accent="brown"
        />
        <StatTile
          icon={<TrendingUp size={14} />}
          label="Ordered"
          value={String(ordered)}
          accent="orange"
        />
        <StatTile
          icon={<Wallet size={14} />}
          label="Earned"
          value={`₹${totalEarned}`}
          accent="green"
        />
      </div>

      {/* Available credit banner */}
      {creditBalance > 0 && (
        <div className="bg-green-light border-2 border-green-300 rounded-2xl p-4 mb-5 flex items-center gap-3">
          <div className="w-10 h-10 bg-indian-green text-white rounded-full flex items-center justify-center shrink-0">
            <Wallet size={18} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-indian-green">
              ₹{creditBalance} credit available
            </p>
            <p className="text-xs text-green-700">
              Apply at checkout on your next order
            </p>
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-5">
        <h3 className="font-bold text-brown mb-3">How it works</h3>
        <ol className="space-y-3">
          {[
            {
              title: "Share your code",
              desc: "WhatsApp, copy link, ya direct message — kahin bhi share karein",
            },
            {
              title: "Friend signs up + orders",
              desc: `They use code ${code || "XXX"} and place an order of ₹${REFERRAL_MIN_ORDER}+`,
            },
            {
              title: "Both of you get ₹50",
              desc: `Friend ko ₹${REFERRAL_REWARD} off first order. Aapko ₹${REFERRAL_REWARD} credit — auto-applied next order pe.`,
            },
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="w-6 h-6 bg-saffron text-white text-xs font-bold rounded-full flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-brown">{step.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{step.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Referral history */}
      {events.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-bold text-brown mb-3">Your referrals</h3>
          <div className="space-y-3">
            {events.slice(0, 10).map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-brown">
                    {e.refereeName || e.refereePhone}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {new Date(e.signedUpAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                </div>
                {e.status === "credited" ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indian-green bg-green-light px-2 py-1 rounded-full">
                    <CheckCircle2 size={11} />
                    +₹{REFERRAL_REWARD}
                  </span>
                ) : e.status === "ordered" ? (
                  <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                    Ordered (below ₹{REFERRAL_MIN_ORDER})
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                    Pending order
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {events.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center">
          <Gift size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm font-semibold text-brown">No referrals yet</p>
          <p className="text-xs text-gray-500 mt-1">
            Share your code and watch your earnings grow!
          </p>
        </div>
      )}
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: "brown" | "orange" | "green";
}) {
  const accentMap = {
    brown: "bg-gray-100 text-brown",
    orange: "bg-saffron-light text-saffron",
    green: "bg-green-light text-indian-green",
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
      <div
        className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center mb-1 ${accentMap[accent]}`}
      >
        {icon}
      </div>
      <p className="text-lg font-bold text-brown leading-none">{value}</p>
      <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider">
        {label}
      </p>
    </div>
  );
}
