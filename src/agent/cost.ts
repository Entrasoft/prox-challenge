/**
 * Per-response cost, computed locally from token counts and the pricing table.
 *
 * SPEC §telemetry wants the cost derived from OUR pricing table (pricing.ts),
 * not read blindly from the SDK's `total_cost_usd` (a client-side estimate the
 * SDK computes from its own bundled price list). In M2 the route handler maps
 * the SDK's usage accounting into `Usage` and calls this; the SDK figure is
 * kept only as a cross-check. This module is pure and SDK-free so it is
 * unit-testable in isolation (agent-sdk skill §Project conventions).
 */

import { ratesFor, type ModelId } from "./pricing";
import type { Usage } from "./telemetry";

/** USD cost of one answer, from its token counts. */
export function computeCostUsd(model: ModelId, usage: Usage): number {
  const r = ratesFor(model);
  const perMTok =
    usage.tokensIn * r.input +
    usage.tokensOut * r.output +
    usage.cacheRead * r.cacheRead +
    usage.cacheWrite * r.cacheWrite;
  return perMTok / 1_000_000;
}

/** Cache hit rate over the input side: reads / (reads + writes + uncached in). */
export function cacheHitRate(usage: Usage): number {
  const totalIn = usage.cacheRead + usage.cacheWrite + usage.tokensIn;
  return totalIn === 0 ? 0 : usage.cacheRead / totalIn;
}
