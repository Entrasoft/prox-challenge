/**
 * Render manual PDF pages to PNGs with Ghostscript (the one PDF rasterizer
 * present on this machine — poppler/imagemagick are absent). Dev-time only;
 * reviewers never run extraction, so a system `gs` dependency is acceptable and
 * documented in the README.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

const GS = "gs";

/** Number of pages in a PDF, via Ghostscript's pdfpagecount. */
export function pageCount(pdfPath: string): number {
  const out = execFileSync(
    GS,
    ["-q", "-dNODISPLAY", "-dNOSAFER", "-c", `(${pdfPath}) (r) file runpdfbegin pdfpagecount = quit`],
    { encoding: "utf8" },
  );
  return parseInt(out.trim(), 10);
}

/**
 * Render every page of `pdfPath` to `outDir/<prefix>-NN.png` at `dpi`.
 * Returns the sorted list of rendered file paths. Skips rendering if the
 * expected files already exist (idempotent across re-runs).
 */
export function renderPdf(pdfPath: string, outDir: string, prefix: string, dpi = 150): string[] {
  mkdirSync(outDir, { recursive: true });
  const n = pageCount(pdfPath);
  const expected = Array.from({ length: n }, (_, i) =>
    path.join(outDir, `${prefix}-${String(i + 1).padStart(2, "0")}.png`),
  );
  const allPresent = expected.every((p) => existsSync(p));
  if (!allPresent) {
    execFileSync(GS, [
      "-q",
      "-dNOSAFER",
      "-sDEVICE=png16m",
      `-r${dpi}`,
      "-o",
      path.join(outDir, `${prefix}-%02d.png`),
      pdfPath,
    ]);
  }
  return readdirSync(outDir)
    .filter((f) => f.startsWith(`${prefix}-`) && f.endsWith(".png"))
    .sort()
    .map((f) => path.join(outDir, f));
}

/** Parse the 1-based page number out of a rendered file name like `owner-07.png`. */
export function pageNumberOf(file: string): number {
  const m = path.basename(file).match(/-(\d+)\.png$/);
  return m ? parseInt(m[1], 10) : NaN;
}
