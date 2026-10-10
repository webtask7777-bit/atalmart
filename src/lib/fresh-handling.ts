/**
 * Fresh-produce handling promise — ONE source for the "3-step sanitized"
 * messaging on the category page, the PDP and the FAQ.
 *
 * Keyed by the live category name (categories.name). Add a category here and
 * every surface picks it up. Copy is deliberately about the process we run,
 * not a medical/safety claim — keep it that way.
 */

export interface FreshStep {
  /** Short title, e.g. "Chhantai" */
  title: string;
  /** One line on what happens in this step. */
  detail: string;
  /** Emoji used as the step icon (no asset needed). */
  icon: string;
}

export interface FreshHandling {
  /** Short badge text, e.g. "3-step sanitized". */
  badge: string;
  /** Heading for the full explanation. */
  title: string;
  /** One-line summary for compact placements. */
  summary: string;
  steps: readonly FreshStep[];
  /** Small honest footnote shown under the steps. */
  footnote: string;
}

export const FRESH_HANDLING: Record<string, FreshHandling> = {
  "Fruits & Vegetables": {
    badge: "3-step sanitized",
    title: "Har sabzi aur fruit 3-step sanitized",
    summary: "Chhantai → sanitizer wash → fresh rinse, phir pack.",
    steps: [
      {
        title: "Chhantai",
        detail: "Har lot haath se sort hota hai — daagi, kata ya naram piece alag.",
        icon: "🧺",
      },
      {
        title: "Sanitizer wash",
        detail:
          "Food-grade vegetable wash mein dhulai — mitti, dhool aur surface residue hatate hain.",
        icon: "🫧",
      },
      {
        title: "Fresh rinse & pack",
        detail: "Saaf paani se dobara rinse, air-dry, phir usi din pack.",
        icon: "💧",
      },
    ],
    footnote: "Ghar par use se pehle ek baar dhona phir bhi achhi aadat hai.",
  },
};

/** The handling promise for a category, or null when none applies. */
export function freshHandlingFor(categoryName?: string | null): FreshHandling | null {
  if (!categoryName) return null;
  return FRESH_HANDLING[categoryName] ?? null;
}
