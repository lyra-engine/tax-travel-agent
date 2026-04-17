import type { FilingStatus } from "./types";

/**
 * 2024 US federal ordinary-income tax brackets.
 * Source: IRS Rev. Proc. 2023-34.
 * Kept in simple form for the tool; update yearly.
 */

export type Bracket = { rate: number; min: number; max: number | null };

type BracketTable = Record<FilingStatus, Bracket[]>;

export const BRACKETS_2024: BracketTable = {
  single: [
    { rate: 0.10, min: 0, max: 11_600 },
    { rate: 0.12, min: 11_600, max: 47_150 },
    { rate: 0.22, min: 47_150, max: 100_525 },
    { rate: 0.24, min: 100_525, max: 191_950 },
    { rate: 0.32, min: 191_950, max: 243_725 },
    { rate: 0.35, min: 243_725, max: 609_350 },
    { rate: 0.37, min: 609_350, max: null },
  ],
  mfj: [
    { rate: 0.10, min: 0, max: 23_200 },
    { rate: 0.12, min: 23_200, max: 94_300 },
    { rate: 0.22, min: 94_300, max: 201_050 },
    { rate: 0.24, min: 201_050, max: 383_900 },
    { rate: 0.32, min: 383_900, max: 487_450 },
    { rate: 0.35, min: 487_450, max: 731_200 },
    { rate: 0.37, min: 731_200, max: null },
  ],
  mfs: [
    { rate: 0.10, min: 0, max: 11_600 },
    { rate: 0.12, min: 11_600, max: 47_150 },
    { rate: 0.22, min: 47_150, max: 100_525 },
    { rate: 0.24, min: 100_525, max: 191_950 },
    { rate: 0.32, min: 191_950, max: 243_725 },
    { rate: 0.35, min: 243_725, max: 365_600 },
    { rate: 0.37, min: 365_600, max: null },
  ],
  hoh: [
    { rate: 0.10, min: 0, max: 16_550 },
    { rate: 0.12, min: 16_550, max: 63_100 },
    { rate: 0.22, min: 63_100, max: 100_500 },
    { rate: 0.24, min: 100_500, max: 191_950 },
    { rate: 0.32, min: 191_950, max: 243_700 },
    { rate: 0.35, min: 243_700, max: 609_350 },
    { rate: 0.37, min: 609_350, max: null },
  ],
  qw: [
    { rate: 0.10, min: 0, max: 23_200 },
    { rate: 0.12, min: 23_200, max: 94_300 },
    { rate: 0.22, min: 94_300, max: 201_050 },
    { rate: 0.24, min: 201_050, max: 383_900 },
    { rate: 0.32, min: 383_900, max: 487_450 },
    { rate: 0.35, min: 487_450, max: 731_200 },
    { rate: 0.37, min: 731_200, max: null },
  ],
};

export const STANDARD_DEDUCTION_2024: Record<FilingStatus, number> = {
  single: 14_600,
  mfj: 29_200,
  mfs: 14_600,
  hoh: 21_900,
  qw: 29_200,
};

/** LTCG brackets (simplified — ignores NIIT). */
export const LTCG_BRACKETS_2024: Record<FilingStatus, Array<{ rate: number; min: number; max: number | null }>> = {
  single: [
    { rate: 0.0, min: 0, max: 47_025 },
    { rate: 0.15, min: 47_025, max: 518_900 },
    { rate: 0.20, min: 518_900, max: null },
  ],
  mfj: [
    { rate: 0.0, min: 0, max: 94_050 },
    { rate: 0.15, min: 94_050, max: 583_750 },
    { rate: 0.20, min: 583_750, max: null },
  ],
  mfs: [
    { rate: 0.0, min: 0, max: 47_025 },
    { rate: 0.15, min: 47_025, max: 291_850 },
    { rate: 0.20, min: 291_850, max: null },
  ],
  hoh: [
    { rate: 0.0, min: 0, max: 63_000 },
    { rate: 0.15, min: 63_000, max: 551_350 },
    { rate: 0.20, min: 551_350, max: null },
  ],
  qw: [
    { rate: 0.0, min: 0, max: 94_050 },
    { rate: 0.15, min: 94_050, max: 583_750 },
    { rate: 0.20, min: 583_750, max: null },
  ],
};

export function computeFederalIncomeTax(
  taxableIncome: number,
  status: FilingStatus,
): { tax: number; marginalRate: number; effectiveRate: number; breakdown: Array<{ rate: number; taxed: number; tax: number }>; } {
  const brackets = BRACKETS_2024[status];
  let remaining = Math.max(0, taxableIncome);
  let tax = 0;
  let marginalRate = 0;
  const breakdown: Array<{ rate: number; taxed: number; tax: number }> = [];
  for (const b of brackets) {
    if (remaining <= 0 && taxableIncome < b.min) break;
    const cap = b.max == null ? Infinity : b.max;
    if (taxableIncome <= b.min) break;
    const sliceTop = Math.min(taxableIncome, cap);
    const taxed = Math.max(0, sliceTop - b.min);
    if (taxed > 0) {
      const sliceTax = taxed * b.rate;
      tax += sliceTax;
      marginalRate = b.rate;
      breakdown.push({ rate: b.rate, taxed, tax: sliceTax });
    }
  }
  const effectiveRate = taxableIncome > 0 ? tax / taxableIncome : 0;
  return { tax, marginalRate, effectiveRate, breakdown };
}

/** Common 2024/2025 limits advisors ask about a lot. */
export const KEY_LIMITS_2024 = {
  year: 2024,
  ira: { limit: 7_000, catchUp50Plus: 1_000 },
  the401k: { employeeDeferral: 23_000, catchUp50Plus: 7_500, totalContribution: 69_000 },
  hsa: { self: 4_150, family: 8_300, catchUp55Plus: 1_000 },
  ssWageBase: 168_600,
  saltCap: 10_000,
  estateExemption: 13_610_000,
  annualGiftExclusion: 18_000,
  feie: 126_500,
};

export const KEY_LIMITS_2025 = {
  year: 2025,
  ira: { limit: 7_000, catchUp50Plus: 1_000 },
  the401k: { employeeDeferral: 23_500, catchUp50Plus: 7_500, totalContribution: 70_000 },
  hsa: { self: 4_300, family: 8_550, catchUp55Plus: 1_000 },
  ssWageBase: 176_100,
  saltCap: 10_000,
  estateExemption: 13_990_000,
  annualGiftExclusion: 19_000,
  feie: 130_000,
};
