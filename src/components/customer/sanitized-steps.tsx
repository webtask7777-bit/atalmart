import type { FreshHandling } from "@/lib/fresh-handling";

/**
 * "3-step sanitized" promise, rendered from src/lib/fresh-handling.ts.
 *
 *  - `strip`: compact card for the category page (under the heading).
 *  - `section`: the same three steps laid out for the PDP.
 *
 * Server-safe (no hooks) so the PDP server page and the home client can both
 * use it.
 */
export function SanitizedSteps({
  handling,
  variant = "strip",
  className = "",
}: {
  handling: FreshHandling;
  variant?: "strip" | "section";
  className?: string;
}) {
  if (variant === "section") {
    return (
      <div className={className}>
        <ol className="space-y-3">
          {handling.steps.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3">
              <span
                className="shrink-0 w-9 h-9 rounded-xl bg-green-light text-indian-green flex items-center justify-center text-lg"
                aria-hidden="true"
              >
                {s.icon}
              </span>
              <div className="text-sm leading-snug">
                <p className="font-semibold text-brown">
                  <span className="text-gray-400 font-normal mr-1">Step {i + 1}</span>
                  {s.title}
                </p>
                <p className="text-brown-light">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="text-xs text-gray-500 mt-3">{handling.footnote}</p>
      </div>
    );
  }

  return (
    <section
      aria-label={handling.title}
      className={`rounded-2xl border border-green-200 bg-green-light/60 px-3 py-2.5 ${className}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center gap-1 bg-indian-green text-white text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full uppercase whitespace-nowrap shrink-0">
          ✓ {handling.badge}
        </span>
        <p className="text-[13px] font-semibold text-brown leading-tight">{handling.title}</p>
      </div>
      <ol className="grid grid-cols-3 gap-2">
        {handling.steps.map((s, i) => (
          <li key={s.title} className="flex flex-col items-start gap-1 min-w-0">
            <span className="text-lg leading-none" aria-hidden="true">
              {s.icon}
            </span>
            <p className="text-[12px] font-semibold text-brown leading-tight">
              <span className="text-gray-400 font-normal">{i + 1}.</span> {s.title}
            </p>
            {/* Details only from tablet up; on phones the titles carry it and
                the PDP has the full text. */}
            <p className="hidden sm:block text-[11px] text-brown-light leading-snug line-clamp-2">
              {s.detail}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
