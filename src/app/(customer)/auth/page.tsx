"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, ArrowRight, AlertCircle, LogOut, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { useAuth } from "@/lib/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import {
  sendOtp as msg91SendOtp,
  verifyOtp as msg91VerifyOtp,
  retryOtp as msg91RetryOtp,
} from "@/lib/msg91-widget";
import { toast } from "sonner";

export default function AuthPage() {
  const router = useRouter();
  const { user, profile, isDemo, signInWithPassword, signOut, updateProfile } = useAuth();
  // "phone" = customer phone-OTP, "otp" = OTP entry, "name" = first-time profile,
  // "admin" = email+password form for operators (created via Supabase Admin API).
  const [step, setStep] = useState<"phone" | "otp" | "name" | "admin">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // Where to send the customer after login (e.g. /auth?next=/checkout).
  // Read from window (not useSearchParams) so the static page needs no
  // Suspense boundary. Only same-origin paths are honoured.
  const [next, setNext] = useState<string | null>(null);
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("next");
    if (raw && raw.startsWith("/") && !raw.startsWith("//")) setNext(raw);
  }, []);

  // Returning user who logged in mid-flow (e.g. from checkout): as soon as
  // the profile lands with a name, send them back where they came from
  // instead of stranding them on the account card.
  useEffect(() => {
    if (next && user && profile?.name) router.replace(next);
  }, [next, user, profile?.name, router]);

  if (user && profile?.name) {
    return (
      <div className="max-w-sm mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-saffron rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold text-3xl">
            {profile.name.charAt(0).toUpperCase()}
          </span>
        </div>
        <h2 className="text-xl font-bold text-brown mb-1">{profile.name}</h2>
        <p className="text-sm text-gray-500 mb-6">{profile.phone}</p>
        <div className="space-y-3">
          <Button variant="outline" className="w-full" onClick={() => router.push("/orders")}>
            My Orders
          </Button>
          <Button
            variant="ghost"
            className="w-full text-red-500"
            onClick={async () => {
              await signOut();
              toast.success("Logged out");
            }}
          >
            <LogOut size={16} />
            Logout
          </Button>
        </div>
      </div>
    );
  }

  const handleSendOTP = async () => {
    if (phone.length !== 10) {
      toast.error("Enter a valid 10-digit phone number");
      return;
    }
    setLoading(true);
    try {
      await msg91SendOtp(phone);
      setStep("otp");
      toast.success("OTP bheja gaya +91 " + phone);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "OTP bhejne me dikkat");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setLoading(true);
    try {
      await msg91RetryOtp();
      toast.success("Naya OTP bhej diya");
    } catch {
      // Fall back to a fresh send if retry isn't available on this channel.
      try {
        await msg91SendOtp(phone);
        toast.success("Naya OTP bhej diya");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "OTP dobara bhejne me dikkat");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length < 4) {
      toast.error("Poora OTP daalein");
      return;
    }
    setLoading(true);
    try {
      // 1) MSG91 verifies the OTP and returns a signed access token.
      const accessToken = await msg91VerifyOtp(otp);
      // 2) Our server re-verifies it and mints a Supabase session.
      const res = await fetch("/api/auth/msg91", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessToken, phone }),
      });
      const data = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
        error?: string;
      };
      if (!res.ok || !data.access_token || !data.refresh_token) {
        throw new Error(data.error || "Login complete nahi ho paya");
      }
      // 3) Adopt the session in the browser.
      const supabase = createClient();
      const { error: sessErr } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (sessErr) throw new Error(sessErr.message);

      // First-time users have no name yet → collect it; returning users go on.
      const {
        data: { user: u },
      } = await supabase.auth.getUser();
      let hasName = false;
      if (u) {
        const { data: p } = await supabase
          .from("profiles")
          .select("name")
          .eq("id", u.id)
          .maybeSingle();
        hasName = Boolean(p?.name);
      }
      toast.success("Verified!");
      if (hasName) router.replace(next || "/");
      else setStep("name");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "OTP verify nahi hua");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveName = async () => {
    if (!name.trim()) {
      toast.error("Please enter your name");
      return;
    }
    setLoading(true);
    await updateProfile({ name: name.trim() });
    setLoading(false);
    toast.success("Welcome to Atalmart!");
    router.push(next || "/");
  };

  const handleAdminLogin = async () => {
    if (!adminEmail.trim() || !adminPassword.trim()) {
      toast.error("Email and password required");
      return;
    }
    setLoading(true);
    const { error } = await signInWithPassword(adminEmail.trim(), adminPassword);
    setLoading(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Logged in!");
    router.push("/admin");
  };

  return (
    <div className="max-w-sm mx-auto px-4 py-16">
      <div className="text-center mb-8">
        {/* Page h1 for SEO/accessibility — the visible headline is the logo,
            so this stays screen-reader-only. */}
        <h1 className="sr-only">Login or Sign Up — Atalmart</h1>
        <Logo className="text-4xl" />
        <p className="text-sm text-gray-500 -mt-1">
          Atal Nagar ki Atal Delivery
        </p>
      </div>

      {isDemo && (
        <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-6">
          <AlertCircle size={16} className="text-yellow-600 shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-700">
            <strong>Demo Mode:</strong> Supabase not connected. Connect Supabase
            in <code className="bg-yellow-100 px-1 rounded">.env.local</code> to
            enable real OTP auth.
          </p>
        </div>
      )}

      {step === "phone" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-brown-light mb-1.5">
              Phone Number
            </label>
            <div className="flex gap-2">
              <div className="flex items-center px-3 bg-gray-100 rounded-xl border-2 border-gray-200 text-sm font-medium text-gray-600">
                +91
              </div>
              <Input
                type="tel"
                placeholder="Enter phone number"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter") handleSendOTP(); }}
              />
            </div>
          </div>
          <Button size="lg" className="w-full" loading={loading} onClick={handleSendOTP}>
            <Phone size={18} />
            Send OTP
          </Button>
          <button
            onClick={() => setStep("admin")}
            className="w-full text-xs text-gray-500 hover:text-saffron hover:underline mt-2 flex items-center justify-center gap-1"
          >
            <Shield size={12} /> Admin / Staff login
          </button>
        </div>
      )}

      {step === "admin" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield size={18} className="text-brown" />
            <h2 className="text-lg font-semibold text-brown">Admin / Staff Login</h2>
          </div>
          <p className="text-sm text-gray-600">
            Use the email + password from your Supabase Auth account.
          </p>
          <Input
            type="email"
            placeholder="admin@atalmart.in"
            autoComplete="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
          />
          <Input
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdminLogin(); }}
          />
          <Button size="lg" className="w-full" loading={loading} onClick={handleAdminLogin}>
            Login
            <ArrowRight size={18} />
          </Button>
          <button
            onClick={() => { setStep("phone"); setAdminEmail(""); setAdminPassword(""); }}
            className="w-full text-sm text-saffron hover:underline"
          >
            ← Customer login (phone OTP)
          </button>
        </div>
      )}

      {step === "otp" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 text-center">
            OTP sent to <strong>+91 {phone}</strong>
          </p>
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="Enter 6-digit OTP"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") handleVerifyOTP(); }}
            className="text-center text-lg tracking-widest"
          />
          <Button size="lg" className="w-full" loading={loading} onClick={handleVerifyOTP}>
            Verify & Login
            <ArrowRight size={18} />
          </Button>
          <div className="flex items-center justify-between">
            <button
              onClick={() => { setStep("phone"); setOtp(""); }}
              className="text-sm text-saffron hover:underline"
            >
              Change phone number
            </button>
            <button
              onClick={handleResendOTP}
              disabled={loading}
              className="text-sm text-saffron hover:underline disabled:opacity-50"
            >
              Resend OTP
            </button>
          </div>
        </div>
      )}

      {step === "name" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 text-center">
            Almost there! What should we call you?
          </p>
          <Input
            type="text"
            autoFocus
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); }}
          />
          <Button size="lg" className="w-full" loading={loading} onClick={handleSaveName}>
            Start Shopping
            <ArrowRight size={18} />
          </Button>
        </div>
      )}
    </div>
  );
}
