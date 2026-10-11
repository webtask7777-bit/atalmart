#!/usr/bin/env node
/**
 * Atalmart® wordmark from real Helvetica outlines.
 *
 * The brand kit from the design pass used Nimbus Sans (a Helvetica clone)
 * because Helvetica wasn't available there. This rebuilds every wordmark file
 * from Helvetica Bold / Helvetica outlines exported with fontTools
 * (helvetica-wordmark-outlines.json), reproducing Vivek's registered artwork
 * exactly: "Atal" 82.46 at (26.617, 77.938) under a 1° skew, "mart" 85.57 at
 * (177.417, 82.509), ® 25.667 at (365.284, 35.698) in the 400×100 box.
 *
 * Writes:
 *   exports/brand-kit/logo/<variant>[-no-r].svg + -800/-1600/-3200.png
 *   public/logo.svg                      (colour variant, tight viewBox)
 *   src/components/ui/logo-paths.ts      (paths for the <Logo/> component)
 *
 * Usage: node scripts/brand/build-wordmark.mjs
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const F = JSON.parse(readFileSync(join(ROOT, "scripts/brand/helvetica-wordmark-outlines.json"), "utf8"));
const OUT = join(ROOT, "exports/brand-kit/logo");
mkdirSync(OUT, { recursive: true });

const SAFFRON = "#FF6B03", GREEN = "#008236", GREEN_DEEP = "#0B4D22", CREAM = "#FFFAF5", INK = "#1A1A1A", WHITE = "#FFFFFF";
const SKEW = "matrix(0.999838,0.018008,0,0.999838,-0.019873,2.201304)";
const r = (n, p = 3) => Number(n.toFixed(p));

/** Lay out `str` at `size` px, baseline (x, y). Returns per-glyph paths + ink bbox. */
function text(str, face, size, x, y) {
  const font = F[face];
  const s = size / font.upm;
  let cx = x, bb = null;
  const paths = [];
  const chars = [...str];
  chars.forEach((ch, i) => {
    const g = font.glyphs[ch];
    if (!g) throw new Error("no glyph " + ch);
    if (i > 0 && font.kern[chars[i - 1] + ch]) cx += font.kern[chars[i - 1] + ch] * s;
    paths.push(`<path transform="translate(${r(cx)} ${r(y)}) scale(${r(s, 6)})" d="${g.d}"/>`);
    const [x0, y0, x1, y1] = g.bbox;
    const box = [cx + x0 * s, y - y1 * s, cx + x1 * s, y - y0 * s];
    bb = bb ? [Math.min(bb[0], box[0]), Math.min(bb[1], box[1]), Math.max(bb[2], box[2]), Math.max(bb[3], box[3])] : box;
    cx += g.adv * s;
  });
  return { paths: paths.join(""), bbox: bb };
}

const ATAL = text("Atal", "bold", 82.46, 26.617, 77.938);
const MART = text("mart", "bold", 85.57, 177.417, 82.509);
const REG = text("®", "regular", 25.667, 365.284, 35.698);
// ™ for as long as the mark is unregistered (TM Act: ® only after the
// certificate). Helvetica's ™ glyph already sits high (ink 744–1469 units
// above the baseline), so place it with its top on the ®'s top, same left.
const TM_SIZE = 30;
const TM_S = TM_SIZE / F.regular.upm;
const TM = text("™", "regular", TM_SIZE, 365.284, REG.bbox[1] + F.regular.glyphs["™"].bbox[3] * TM_S);
/** Which symbol the kit carries: "tm" | "registered" | "none". */
const MARKS = { tm: TM, registered: REG, none: null };

// The skew shifts "Atal" by up to ~1.1 px vertically (x·0.018 + 2.2); widen the
// bbox for it rather than transforming every point.
function viewBox(mark) {
  const a = [ATAL.bbox[0], ATAL.bbox[1] + 2.2, ATAL.bbox[2], ATAL.bbox[3] + 2.2 + ATAL.bbox[2] * 0.018];
  const boxes = [a, MART.bbox, mark ? mark.bbox : null].filter(Boolean);
  const pad = 2;
  const x0 = Math.min(...boxes.map((b) => b[0])) - pad;
  const y0 = Math.min(...boxes.map((b) => b[1])) - pad;
  const x1 = Math.max(...boxes.map((b) => b[2])) + pad;
  const y1 = Math.max(...boxes.map((b) => b[3])) + pad;
  return [r(x0), r(y0), r(x1 - x0), r(y1 - y0)];
}

function svg({ atal, mart, reg, mark = "tm", width }) {
  const M = MARKS[mark];
  const vb = viewBox(M);
  const W = width ?? vb[2];
  const H = r((W * vb[3]) / vb[2]);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(" ")}" width="${W}" height="${H}" role="img" aria-label="Atalmart">` +
    `<g transform="${SKEW}" fill="${atal}">${ATAL.paths}</g>` +
    `<g fill="${mart}">${MART.paths}</g>` +
    (M ? `<g fill="${reg}">${M.paths}</g>` : "") +
    `</svg>`;
}

const VARIANTS = {
  "atalmart-wordmark": { atal: SAFFRON, mart: GREEN, reg: INK },
  "atalmart-wordmark-on-dark": { atal: SAFFRON, mart: CREAM, reg: CREAM },
  "atalmart-wordmark-mono-black": { atal: INK, mart: INK, reg: INK },
  "atalmart-wordmark-mono-white": { atal: WHITE, mart: WHITE, reg: WHITE },
  "atalmart-wordmark-reverse": { atal: WHITE, mart: GREEN_DEEP, reg: GREEN_DEEP },
};

// Default files carry ™ (unregistered). "-registered" is ready for the day
// the certificate arrives; "-no-mark" for tiny or decorative placements.
const SUFFIX = { tm: "", registered: "-registered", none: "-no-mark" };
for (const [name, c] of Object.entries(VARIANTS)) {
  for (const mark of ["tm", "registered", "none"]) {
    const stem = `${name}${SUFFIX[mark]}`;
    writeFileSync(join(OUT, `${stem}.svg`), svg({ ...c, mark }));
    for (const w of [800, 1600, 3200]) {
      const vb = viewBox(MARKS[mark]);
      const h = Math.round((w * vb[3]) / vb[2]);
      await sharp(Buffer.from(svg({ ...c, mark, width: w })), { density: 300 })
        .resize(w, h)
        .png({ compressionLevel: 9 })
        .toFile(join(OUT, `${stem}-${w}.png`));
    }
  }
}

// App copies
writeFileSync(join(ROOT, "public/logo.svg"), svg(VARIANTS["atalmart-wordmark"]));
writeFileSync(
  join(ROOT, "src/components/ui/logo-paths.ts"),
  `// GENERATED by scripts/brand/build-wordmark.mjs — do not edit by hand.
// Helvetica Bold / Helvetica outlines of the registered Atalmart® wordmark in
// the original 400×100 artwork coordinates. <Logo/> applies the fills.
export const LOGO_SKEW = ${JSON.stringify(SKEW)};
export const LOGO_ATAL = ${JSON.stringify(ATAL.paths)};
export const LOGO_MART = ${JSON.stringify(MART.paths)};
/** ® — use only once the trademark certificate is issued. */
export const LOGO_REG = ${JSON.stringify(REG.paths)};
/** ™ — the unregistered-mark symbol, current default. */
export const LOGO_TM = ${JSON.stringify(TM.paths)};
`,
);
console.log("wordmark built:", Object.keys(VARIANTS).length * 3, "SVGs + PNGs →", OUT, "| viewBox(tm)", viewBox(TM).join(" "));
