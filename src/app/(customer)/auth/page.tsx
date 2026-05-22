"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, ArrowRight, AlertCircle, LogOut, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APP_NAME } from "@/lib/constants";
import { useAuth } from "@/lib/hooks/use-auth";
import { toast } from "sonner";

export default function AuthPage() {
  const router = useRouter();
  const { user, profile, isDemo, signInWithOtp, verifyOtp, signInWithPassword, signOut, updateProfile } = useAuth();
  // "phone" = customer phone-OTP, "otp" = OTP entry, "name" = first-time profile,
  // "admin" = email+password form for operators (created via Supabase Admin API).
  const [step, setStep] = useState<"phone" | "otp" | "name" | "admin">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [loading, setLoading] = useState(false);

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
    const { error } = await signInWithOtp(phone);
    setLoading(false);
    if (error) {
      toast.error(error);
      return;
    }
    setStep("otp");
    toast.success("OTP sent to +91 " + phone);
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) {
      toast.error("Enter 6-digit OTP");
      return;
    }
    setLoading(true);
    const { error } = await verifyOtp(phone, otp);
    setLoading(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Verified!");
    setStep("name");
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
    router.push("/");
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
        <div className="w-16 h-16 bg-saffron rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold text-3xl">A</span>
        </div>
        <h1 className="text-2xl font-bold text-brown">{APP_NAME}</h1>
        <p className="text-sm text-gray-500 mt-1">
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
            placeholder="Enter 6-digit OTP"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            className="text-center text-lg tracking-widest"
          />
          <Button size="lg" className="w-full" loading={loading} onClick={handleVerifyOTP}>
            Verify & Login
            <ArrowRight size={18} />
          </Button>
          <button
            onClick={() => { setStep("phone"); setOtp(""); }}
            className="w-full text-sm text-saffron hover:underline"
          >
            Change phone number
          </button>
        </div>
      )}

      {step === "name" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 text-center">
            Almost there! What should we call you?
          </p>
          <Input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
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
