import styles from "./BenefitStrip.module.css";

/**
 * Service promises under the hero (atalmart-hero-benefits-premium-v1).
 * Icons are the animated trust SVGs already shipped in public/icons/trust
 * (animation lives inside the file, static under prefers-reduced-motion),
 * so a plain <img> is enough. The delivery numbers come from store settings.
 */

type BenefitStripProps = {
  className?: string;
  /** Order value from which delivery is free (settings.freeDeliveryAbove). */
  freeDeliveryAbove: number;
  /** Delivery charge below that threshold (settings.deliveryFee). */
  deliveryFee: number;
};

export function BenefitStrip({ className = "", freeDeliveryAbove, deliveryFee }: BenefitStripProps) {
  const benefits = [
    {
      value: "Quick",
      label: "delivery",
      detail: "Atal Nagar mein fast fulfilment",
      icon: "/icons/trust/quick-delivery.svg",
      tone: "orange",
    },
    {
      value: `₹${freeDeliveryAbove}+`,
      label: "free delivery",
      detail: `Delivery charges par ₹${deliveryFee} bachao`,
      icon: "/icons/trust/free-delivery.svg",
      tone: "green",
    },
    {
      value: "100%",
      label: "genuine",
      detail: "Quality-checked original products",
      icon: "/icons/trust/genuine.svg",
      tone: "gold",
    },
  ] as const;

  return (
    <ul
      aria-label="Atalmart service promises"
      className={[styles.strip, className].filter(Boolean).join(" ")}
    >
      {benefits.map((benefit) => (
        <li key={benefit.label} className={styles.card} data-tone={benefit.tone}>
          <span className={styles.iconWrap} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={benefit.icon}
              alt=""
              width={38}
              height={38}
              decoding="async"
              draggable={false}
            />
          </span>
          <span className={styles.copy}>
            <span className={styles.heading}>
              <strong>{benefit.value}</strong>
              <span>{benefit.label}</span>
            </span>
            <small>{benefit.detail}</small>
          </span>
          <span className={styles.shine} aria-hidden="true" />
        </li>
      ))}
    </ul>
  );
}
