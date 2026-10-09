"use client";

import { useState, useEffect } from "react";
import {
  Save,
  RefreshCw,
  Store,
  Truck,
  Wallet,
  MapPin,
  Megaphone,
  CreditCard,
  Eye,
  EyeOff,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  MessageCircle,
  Power,
  Zap,
  Clock,
} from "lucide-react";
import type { StoreStatus } from "@/lib/store/settings";
import { useSettingsStore, type SiteSettings } from "@/lib/store/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

const STORE_STATUS_OPTIONS: {
  value: StoreStatus;
  label: string;
  sub: string;
  icon: typeof Power;
  activeCls: string;
}[] = [
  {
    value: "open",
    label: "Open",
    sub: "Normal",
    icon: Power,
    activeCls: "border-indian-green bg-green-light text-indian-green",
  },
  {
    value: "busy",
    label: "Busy",
    sub: "Rush — paused",
    icon: Zap,
    activeCls: "border-amber-500 bg-amber-50 text-amber-600",
  },
  {
    value: "opening_soon",
    label: "Opening Soon",
    sub: "Pre-launch",
    icon: Clock,
    activeCls: "border-saffron bg-saffron-light text-saffron",
  },
];

export default function SettingsAdminPage() {
  const { settings, update, reset } = useSettingsStore();
  const [form, setForm] = useState<SiteSettings>(settings);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setForm(settings);
    setDirty(false);
  }, [settings]);

  const set = <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const save = () => {
    update(form);
    toast.success("Settings saved");
    setDirty(false);
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6 sticky top-0 bg-gray-50 -mx-4 px-4 py-3 z-10 border-b border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-brown">Site Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure global app behavior, delivery, payment, and content.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              const ok = await confirmDialog({
                title: "Reset to factory defaults?",
                message: "All site settings will return to their original values. Custom configuration will be lost.",
                confirmLabel: "Reset",
                destructive: true,
              });
              if (ok) {
                reset();
                toast.success("Reset to defaults");
              }
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-500 hover:text-brown rounded-lg border border-gray-200"
          >
            <RefreshCw size={12} />
            Reset
          </button>
          <Button size="sm" onClick={save} disabled={!dirty}>
            <Save size={14} />
            {dirty ? "Save Changes" : "Saved"}
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Store availability — rush handling + pre-launch */}
        <Section icon={<Power size={16} className="text-red-500" />} title="Store availability">
          <p className="text-xs text-gray-500 -mt-1">
            Customers ko live board dikhta hai.{" "}
            <span className="font-semibold text-brown">Busy</span> ya{" "}
            <span className="font-semibold text-brown">Opening Soon</span> pe naye
            orders apne aap paused ho jaate hain.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {STORE_STATUS_OPTIONS.map((opt) => {
              const active = form.storeStatus === opt.value;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set("storeStatus", opt.value)}
                  className={`flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-3 text-center transition-colors ${
                    active
                      ? opt.activeCls
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <Icon size={18} className={active ? "" : "text-gray-400"} />
                  <span className="text-sm font-bold leading-tight">{opt.label}</span>
                  <span className="text-[10px] leading-tight opacity-80">{opt.sub}</span>
                </button>
              );
            })}
          </div>
          {form.storeStatus !== "open" && (
            <Input
              label="Custom board message (optional)"
              value={form.storeStatusMessage}
              onChange={(e) => set("storeStatusMessage", e.target.value)}
              placeholder="Khaali = default message use hoga"
            />
          )}
        </Section>

        {/* General */}
        <Section icon={<Store size={16} className="text-saffron" />} title="General">
          <Input
            label="App name"
            value={form.appName}
            onChange={(e) => set("appName", e.target.value)}
          />
          <Input
            label="Tagline"
            value={form.tagline}
            onChange={(e) => set("tagline", e.target.value)}
            placeholder="Atal Nagar ki Atal Delivery"
          />
        </Section>

        {/* Contact */}
        <Section icon={<MapPin size={16} className="text-indian-green" />} title="Store & contact">
          <Input
            label="Store address"
            value={form.storeAddress}
            onChange={(e) => set("storeAddress", e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Contact email"
              type="email"
              value={form.contactEmail}
              onChange={(e) => set("contactEmail", e.target.value)}
            />
            <Input
              label="Contact phone"
              type="tel"
              value={form.contactPhone}
              onChange={(e) => set("contactPhone", e.target.value)}
            />
          </div>
        </Section>

        {/* Delivery */}
        <Section icon={<Truck size={16} className="text-saffron" />} title="Delivery">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Delivery fee (₹)"
              type="number"
              value={String(form.deliveryFee)}
              onChange={(e) => set("deliveryFee", Number(e.target.value) || 0)}
            />
            <Input
              label="Free delivery above (₹)"
              type="number"
              value={String(form.freeDeliveryAbove)}
              onChange={(e) => set("freeDeliveryAbove", Number(e.target.value) || 0)}
            />
            <Input
              label="Min order amount (₹)"
              type="number"
              value={String(form.minOrderAmount)}
              onChange={(e) => set("minOrderAmount", Number(e.target.value) || 0)}
            />
            <Input
              label="Delivery time (mins)"
              type="number"
              value={String(form.deliveryTimeMins)}
              onChange={(e) => set("deliveryTimeMins", Number(e.target.value) || 10)}
            />
            <Input
              label="Service radius (km)"
              type="number"
              value={String(form.deliveryRadiusKm)}
              onChange={(e) => set("deliveryRadiusKm", Number(e.target.value) || 5)}
            />
            <Input
              label="Rider payout per delivery (₹, 0 = fixed salary)"
              type="number"
              value={String(form.riderPayoutPerDelivery)}
              onChange={(e) =>
                set("riderPayoutPerDelivery", Math.max(0, Number(e.target.value) || 0))
              }
            />
            <Input
              label="Rider daily bonus target (deliveries/day, 0 = off)"
              type="number"
              value={String(form.riderBonusTarget)}
              onChange={(e) =>
                set("riderBonusTarget", Math.max(0, Math.floor(Number(e.target.value) || 0)))
              }
            />
            <Input
              label="Rider daily bonus points (1 point = ₹1)"
              type="number"
              value={String(form.riderBonusAmount)}
              onChange={(e) =>
                set("riderBonusAmount", Math.max(0, Number(e.target.value) || 0))
              }
            />
          </div>
          <Input
            label="Serviceable pincodes (comma-separated)"
            value={form.serviceablePincodes}
            onChange={(e) => set("serviceablePincodes", e.target.value)}
            placeholder="492101, 492014, …"
          />
        </Section>

        {/* Payment */}
        <Section icon={<Wallet size={16} className="text-indian-green" />} title="Payment methods">
          <div className="space-y-2">
            <Toggle
              label="Cash on Delivery (COD)"
              checked={form.codEnabled}
              onChange={(v) => set("codEnabled", v)}
            />
            <Toggle
              label="Online payment (UPI / Card)"
              checked={form.onlinePaymentEnabled}
              onChange={(v) => set("onlinePaymentEnabled", v)}
            />
          </div>
        </Section>

        {/* Razorpay */}
        <RazorpaySection
          form={form}
          set={set}
        />

        {/* Anthropic Claude */}
        <AnthropicSection
          form={form}
          set={set}
        />

        {/* WhatsApp Business */}
        <WhatsAppSection
          form={form}
          set={set}
        />

        {/* Announcement */}
        <Section icon={<Megaphone size={16} className="text-purple-600" />} title="Site-wide announcement">
          <Input
            label="Banner message (leave empty to hide)"
            value={form.notificationBanner}
            onChange={(e) => set("notificationBanner", e.target.value)}
            placeholder="🎉 Free delivery on all orders above ₹199 — today only!"
          />
          {form.notificationBanner && (
            <div className="bg-saffron text-white text-center text-xs font-medium py-2 px-3 rounded-lg">
              {form.notificationBanner}
            </div>
          )}
        </Section>

        {/* Bottom save bar (mobile/long forms) */}
        {dirty && (
          <div className="sticky bottom-3 bg-white border border-saffron rounded-2xl p-3 shadow-lg flex items-center justify-between">
            <span className="text-sm font-medium text-brown">
              You have unsaved changes
            </span>
            <Button size="sm" onClick={save}>
              <Save size={14} />
              Save Changes
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5">
      <h2 className="flex items-center gap-2 font-bold text-brown mb-4">
        {icon}
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between p-3 rounded-xl border border-gray-200 cursor-pointer hover:border-saffron">
      <span className="text-sm font-medium text-brown">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          checked ? "bg-indian-green" : "bg-gray-300"
        }`}
        aria-pressed={checked}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
    </label>
  );
}

function RazorpaySection({
  form,
  set,
}: {
  form: SiteSettings;
  set: <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => void;
}) {
  const [showSecret, setShowSecret] = useState(false);
  const [showWebhook, setShowWebhook] = useState(false);

  const expectedPrefix = form.razorpayTestMode ? "rzp_test_" : "rzp_live_";
  const keyIdValid =
    !form.razorpayKeyId || form.razorpayKeyId.startsWith(expectedPrefix);
  const configured =
    form.razorpayEnabled &&
    form.razorpayKeyId.length > 0 &&
    form.razorpayKeySecret.length > 0;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 font-bold text-brown">
          <CreditCard size={16} className="text-blue-600" />
          Razorpay payment gateway
        </h2>
        {configured ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indian-green bg-green-light px-2 py-1 rounded-full">
            <CheckCircle2 size={11} />
            {form.razorpayTestMode ? "Test mode" : "Live"}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
            <AlertCircle size={11} />
            Not configured
          </span>
        )}
      </div>

      <p className="text-xs text-gray-500 mb-4 leading-relaxed">
        Razorpay account se UPI, cards, netbanking, aur wallets accept karein. Keys
        Razorpay Dashboard &rarr; Settings &rarr; API Keys se milte hain.{" "}
        <a
          href="https://dashboard.razorpay.com/app/keys"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-saffron font-medium hover:underline"
        >
          Open dashboard <ExternalLink size={10} />
        </a>
      </p>

      <div className="space-y-3">
        <Toggle
          label="Enable Razorpay"
          checked={form.razorpayEnabled}
          onChange={(v) => set("razorpayEnabled", v)}
        />

        {form.razorpayEnabled && (
          <>
            <Toggle
              label={`${form.razorpayTestMode ? "Test mode" : "Live mode"} — ${form.razorpayTestMode ? "no real money charged" : "REAL payments will be processed"}`}
              checked={!form.razorpayTestMode}
              onChange={(v) => set("razorpayTestMode", !v)}
            />

            <div>
              <Input
                label={`Key ID (${form.razorpayTestMode ? "test" : "live"})`}
                value={form.razorpayKeyId}
                onChange={(e) => set("razorpayKeyId", e.target.value.trim())}
                placeholder={`${expectedPrefix}xxxxxxxxxxxxxx`}
                autoComplete="off"
              />
              {form.razorpayKeyId && !keyIdValid && (
                <p className="text-[11px] text-red-500 mt-1 ml-1">
                  Should start with <code className="bg-red-50 px-1 rounded">{expectedPrefix}</code> for {form.razorpayTestMode ? "test" : "live"} mode
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-brown-light mb-1.5 ml-1">
                Key Secret
              </label>
              <div className="relative">
                <input
                  type={showSecret ? "text" : "password"}
                  value={form.razorpayKeySecret}
                  onChange={(e) =>
                    set("razorpayKeySecret", e.target.value.trim())
                  }
                  placeholder="Paste secret from Razorpay dashboard"
                  autoComplete="off"
                  className="w-full px-3 py-2.5 pr-10 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/20 transition-colors font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-brown rounded"
                  aria-label={showSecret ? "Hide secret" : "Show secret"}
                >
                  {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-1 ml-1">
                Secret is sensitive — never share. Stored locally in browser.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-brown-light mb-1.5 ml-1">
                Webhook secret <span className="text-gray-400">(optional)</span>
              </label>
              <div className="relative">
                <input
                  type={showWebhook ? "text" : "password"}
                  value={form.razorpayWebhookSecret}
                  onChange={(e) =>
                    set("razorpayWebhookSecret", e.target.value.trim())
                  }
                  placeholder="For verifying payment.captured webhooks"
                  autoComplete="off"
                  className="w-full px-3 py-2.5 pr-10 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/20 transition-colors font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowWebhook((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-brown rounded"
                  aria-label={showWebhook ? "Hide webhook secret" : "Show webhook secret"}
                >
                  {showWebhook ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-1 ml-1">
                Webhook URL:{" "}
                <code className="bg-gray-100 px-1 rounded">
                  https://yourdomain.com/api/razorpay/webhook
                </code>
              </p>
            </div>

            {!form.razorpayTestMode && configured && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  <b>Live mode active.</b> Real customer payments will be charged.
                  Confirm KYC complete and bank account verified before going live.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function AnthropicSection({
  form,
  set,
}: {
  form: SiteSettings;
  set: <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => void;
}) {
  const [showKey, setShowKey] = useState(false);
  const configured =
    form.anthropicEnabled && form.anthropicApiKey.trim().length > 0;
  const keyValid =
    !form.anthropicApiKey || form.anthropicApiKey.startsWith("sk-ant-");

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 font-bold text-brown">
          <Sparkles size={16} className="text-purple-600" />
          AI Customer Support (Claude)
        </h2>
        {configured ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indian-green bg-green-light px-2 py-1 rounded-full">
            <CheckCircle2 size={11} />
            Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
            <AlertCircle size={11} />
            Not configured
          </span>
        )}
      </div>

      <p className="text-xs text-gray-500 mb-4 leading-relaxed">
        Claude AI ka use karke customer ko Hinglish me 24×7 support do —
        delivery time, payment, products, returns sab handle karega. Key
        Anthropic Console se milegi.{" "}
        <a
          href="https://console.anthropic.com/settings/keys"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-saffron font-medium hover:underline"
        >
          Get API key <ExternalLink size={10} />
        </a>
      </p>

      <div className="space-y-3">
        <Toggle
          label="Enable AI chat support"
          checked={form.anthropicEnabled}
          onChange={(v) => set("anthropicEnabled", v)}
        />

        {form.anthropicEnabled && (
          <>
            <div>
              <label className="block text-xs font-medium text-brown-light mb-1.5 ml-1">
                API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={form.anthropicApiKey}
                  onChange={(e) => set("anthropicApiKey", e.target.value.trim())}
                  placeholder="sk-ant-api03-..."
                  autoComplete="off"
                  className="w-full px-3 py-2.5 pr-10 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/20 transition-colors font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-brown rounded"
                  aria-label={showKey ? "Hide API key" : "Show API key"}
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {form.anthropicApiKey && !keyValid && (
                <p className="text-[11px] text-red-500 mt-1 ml-1">
                  API keys start with <code className="bg-red-50 px-1 rounded">sk-ant-</code>
                </p>
              )}
              <p className="text-[11px] text-gray-400 mt-1 ml-1">
                Server-side only. Browser ko expose nahi hoti.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-brown-light mb-1.5 ml-1">
                Model
              </label>
              <select
                value={form.anthropicModel}
                onChange={(e) => set("anthropicModel", e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/20"
              >
                <option value="claude-haiku-4-5">
                  Claude Haiku 4.5 — fastest, cheapest (recommended)
                </option>
                <option value="claude-sonnet-4-6">
                  Claude Sonnet 4.6 — balanced speed + intelligence
                </option>
                <option value="claude-opus-4-7">
                  Claude Opus 4.7 — most capable, slower + expensive
                </option>
              </select>
              <p className="text-[11px] text-gray-400 mt-1 ml-1">
                Haiku is ~5× cheaper than Sonnet — perfect for chat support.
              </p>
            </div>

            <div className="flex items-start gap-2 p-3 bg-purple-50 border border-purple-200 rounded-xl">
              <Sparkles size={14} className="text-purple-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-purple-800 leading-relaxed">
                <b>Prompt caching enabled</b> — system prompt (store info,
                products, FAQ) is cached for 5 minutes → ~90% cost reduction on
                repeat questions.
              </p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function WhatsAppSection({
  form,
  set,
}: {
  form: SiteSettings;
  set: <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => void;
}) {
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const configured =
    form.whatsappEnabled &&
    form.whatsappAccessToken.length > 0 &&
    form.whatsappPhoneNumberId.length > 0;

  const sendTest = async () => {
    if (!form.whatsappTestRecipient) {
      toast.error("Enter a test recipient phone number first");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch("/api/notifications/whatsapp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: form.whatsappTestRecipient,
          template: "order_placed",
          params: ["TEST-001", "342"],
          settings: {
            enabled: form.whatsappEnabled,
            accessToken: form.whatsappAccessToken,
            phoneNumberId: form.whatsappPhoneNumberId,
          },
        }),
      });
      const data = (await res.json()) as { success?: boolean; demo?: boolean; error?: string };
      if (data.demo) {
        toast.success("Demo mode — message logged in server console");
      } else if (data.success) {
        toast.success(`Test WhatsApp sent to ${form.whatsappTestRecipient}`);
      } else {
        toast.error(data.error || "Failed to send test message");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 font-bold text-brown">
          <MessageCircle size={16} className="text-indian-green" />
          WhatsApp Order Notifications
        </h2>
        {configured ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indian-green bg-green-light px-2 py-1 rounded-full">
            <CheckCircle2 size={11} />
            Live
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
            <AlertCircle size={11} />
            Demo mode
          </span>
        )}
      </div>

      <p className="text-xs text-gray-500 mb-4 leading-relaxed">
        WhatsApp Business Cloud API se customers ko order updates (placed,
        confirmed, out for delivery, delivered) ka real-time notifications
        bhejein.{" "}
        <a
          href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-saffron font-medium hover:underline"
        >
          Setup guide <ExternalLink size={10} />
        </a>
      </p>

      <div className="space-y-3">
        <Toggle
          label="Enable WhatsApp notifications"
          checked={form.whatsappEnabled}
          onChange={(v) => set("whatsappEnabled", v)}
        />

        {form.whatsappEnabled && (
          <>
            <div>
              <label className="block text-xs font-medium text-brown-light mb-1.5 ml-1">
                Access Token
              </label>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={form.whatsappAccessToken}
                  onChange={(e) =>
                    set("whatsappAccessToken", e.target.value.trim())
                  }
                  placeholder="EAAxxxxxxxxxxxxxxxxx..."
                  autoComplete="off"
                  className="w-full px-3 py-2.5 pr-10 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/20 transition-colors font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-brown rounded"
                  aria-label={showToken ? "Hide token" : "Show token"}
                >
                  {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-1 ml-1">
                Meta Developer Console → WhatsApp → System User Access Token
              </p>
            </div>

            <Input
              label="Phone Number ID"
              value={form.whatsappPhoneNumberId}
              onChange={(e) =>
                set("whatsappPhoneNumberId", e.target.value.trim())
              }
              placeholder="1234567890123456"
            />

            <Input
              label="Business Account ID (optional)"
              value={form.whatsappBusinessAccountId}
              onChange={(e) =>
                set("whatsappBusinessAccountId", e.target.value.trim())
              }
              placeholder="For template management"
            />

            <Input
              label="Test recipient phone (with +91)"
              value={form.whatsappTestRecipient}
              onChange={(e) =>
                set("whatsappTestRecipient", e.target.value.trim())
              }
              placeholder="+919876543210"
            />

            <button
              onClick={sendTest}
              disabled={testing}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-indian-green text-white text-sm font-bold rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <MessageCircle size={14} />
              {testing ? "Sending…" : "Send test message"}
            </button>

            <div className="flex items-start gap-2 p-3 bg-green-light border border-green-200 rounded-xl">
              <MessageCircle size={14} className="text-indian-green shrink-0 mt-0.5" />
              <div className="text-[11px] text-green-800 leading-relaxed">
                <b>Templates needed</b> (pre-approve in Meta Console):
                <code className="bg-white/60 px-1 rounded mx-1">order_placed</code>,
                <code className="bg-white/60 px-1 rounded mx-1">order_out_for_delivery</code>,
                <code className="bg-white/60 px-1 rounded mx-1">order_delivered</code>,
                <code className="bg-white/60 px-1 rounded mx-1">order_cancelled</code>,
                <code className="bg-white/60 px-1 rounded mx-1">return_approved</code>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
