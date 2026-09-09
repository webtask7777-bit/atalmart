import { AtalmartHero } from "./AtalmartHero";
import { BenefitStrip } from "./BenefitStrip";
import styles from "./AtalmartHomeHero.module.css";

type AtalmartHomeHeroProps = {
  className?: string;
  freeDeliveryAbove: number;
  deliveryFee: number;
};

/** Offer carousel + benefit cards, as one module (see README of the pack). */
export function AtalmartHomeHero({ className = "", freeDeliveryAbove, deliveryFee }: AtalmartHomeHeroProps) {
  return (
    <div className={[styles.wrapper, className].filter(Boolean).join(" ")}>
      <AtalmartHero />
      <BenefitStrip freeDeliveryAbove={freeDeliveryAbove} deliveryFee={deliveryFee} />
    </div>
  );
}
