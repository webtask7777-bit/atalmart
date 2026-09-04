import { ImageResponse } from "next/og";

// Site-wide social preview (WhatsApp / Instagram / X link cards). Generated
// at build time; product pages override it with their own og:image.

export const alt = "Atalmart — Atal Nagar ki Atal Delivery";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PILLS = [
  "Free delivery on ₹299+",
  "100% genuine products",
  "Naya Raipur · 5 pincodes",
];

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background:
            "linear-gradient(135deg, #FF6B00 0%, #FF8534 55%, #FFA65C 100%)",
          color: "#FFFFFF",
          fontFamily: "sans-serif",
        }}
      >
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          <div
            style={{
              display: "flex",
              fontSize: 104,
              fontWeight: 800,
              letterSpacing: -4,
              lineHeight: 1,
            }}
          >
            <span style={{ color: "#FFFFFF" }}>Atal</span>
            <span style={{ color: "#0B4D22" }}>mart</span>
            <span
              style={{
                fontSize: 30,
                marginTop: 8,
                marginLeft: 6,
                fontWeight: 400,
                letterSpacing: 0,
              }}
            >
              ®
            </span>
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.1 }}>
            Atal Nagar ki Atal Delivery
          </div>
          <div style={{ fontSize: 32, lineHeight: 1.3, opacity: 0.95 }}>
            Groceries, dairy, snacks aur daily essentials — Naya Raipur mein
            quick delivery, seedha aapke darwaze pe.
          </div>
        </div>

        {/* Trust pills */}
        <div style={{ display: "flex", gap: 16, fontSize: 26 }}>
          {PILLS.map((t) => (
            <div
              key={t}
              style={{
                display: "flex",
                padding: "12px 24px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.18)",
                border: "2px solid rgba(255,255,255,0.45)",
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
