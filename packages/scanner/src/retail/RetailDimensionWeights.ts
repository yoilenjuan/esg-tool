import type { RetailDimensionKey } from './RetailTypes';

// ─── Retail Dimension Weights ─────────────────────────────────────────────────
// Conversion-critical dimensions carry higher weight than inclusion-only ones.
// Total MUST equal 1.  Validated at module load via the assertion below.

export const RetailDimensionWeights: Record<RetailDimensionKey, number> = {
  // ── Conversion-critical (contribute directly to basket / registration rates)
  checkoutFriction:              0.18,
  paymentInclusivity:            0.15,
  genderInclusion:               0.18,

  // ── Regulatory & trust baseline
  internationalizationFlexibility: 0.15,
  accessibilityBaseline:         0.15,

  // ── Inclusion / brand perception
  microcopyBias:                 0.07,
  visualRepresentation:          0.07,

  // ── Data governance
  dataProportionality:           0.05,
} as const;

// ── Compile-time weight total guard ───────────────────────────────────────────
const _total = Object.values(RetailDimensionWeights).reduce((a, b) => a + b, 0);
// Allow ±0.001 floating-point tolerance
if (Math.abs(_total - 1) > 0.001) {
  throw new Error(
    `RetailDimensionWeights must sum to 1. Current sum: ${_total.toFixed(4)}`
  );
}
