/**
 * Server-only PDF → text rows, using pdf.js (no AI, no external service).
 *
 * Wholesale invoices (Flipkart Wholesale, most distributors) are generated
 * PDFs with real text, not scans. pdf.js gives us every text run with its
 * x/y position; we cluster runs by y into visual rows and join them left to
 * right, so a table row comes out as one line like
 *   "1  AASHIRVAAD SHUDH CHAKKI ATTA 10 KG  1101  12  455.00  0%  5460.00".
 * Scanned/image-only PDFs yield no text — the caller falls back to AI (if a
 * key is configured) or asks for the Excel export.
 */

import type { TextItem } from "pdfjs-dist/types/src/display/api";

export interface PdfRow {
  page: number;
  y: number;
  text: string;
  /** Individual cells, split where the horizontal gap is wide. */
  cells: string[];
}

const ROW_TOLERANCE = 3; // pt — runs whose baselines differ by less are one row
const CELL_GAP = 12; // pt — a horizontal gap wider than this starts a new cell

export async function extractPdfRows(data: Uint8Array): Promise<PdfRow[]> {
  // ~1.5 MB library — loaded on first PDF only, not on every cold start.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
  });
  const doc = await task.promise;

  const rows: PdfRow[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const runs = (content.items as TextItem[])
        .filter((it) => typeof it.str === "string" && it.str.trim().length > 0)
        .map((it) => ({
          x: it.transform[4],
          y: it.transform[5],
          w: it.width,
          str: it.str,
        }))
        .sort((a, b) => b.y - a.y || a.x - b.x);

      let current: typeof runs = [];
      let currentY = Number.NaN;
      const flush = () => {
        if (current.length === 0) return;
        current.sort((a, b) => a.x - b.x);
        const cells: string[] = [];
        let text = "";
        let cell = "";
        let lastEnd = Number.NaN;
        for (const r of current) {
          const gap = Number.isNaN(lastEnd) ? 0 : r.x - lastEnd;
          if (cell && gap > CELL_GAP) {
            cells.push(cell.trim());
            cell = "";
          }
          cell += (cell && gap > 1 ? " " : "") + r.str;
          text += (text && gap > 1 ? " " : "") + r.str;
          lastEnd = r.x + r.w;
        }
        if (cell.trim()) cells.push(cell.trim());
        rows.push({ page: p, y: currentY, text: text.replace(/\s+/g, " ").trim(), cells });
        current = [];
      };
      for (const r of runs) {
        if (Number.isNaN(currentY) || Math.abs(r.y - currentY) > ROW_TOLERANCE) {
          flush();
          currentY = r.y;
        }
        current.push(r);
      }
      flush();
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return rows;
}
