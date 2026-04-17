import type { FilingStatus } from "./types";

export type StateBracket = { rate: number; min: number; max: number | null };

/**
 * 2024 state income tax reference.
 * Only covers the states the agent is most commonly asked about.
 * Brackets are simplifications — always verify before taking action.
 */

type StateTable = {
  code: string;
  name: string;
  type: "none" | "flat" | "progressive";
  flatRate?: number;
  brackets?: Partial<Record<FilingStatus, StateBracket[]>>;
  standardDeduction?: Partial<Record<FilingStatus, number>>;
  notes?: string[];
};

const CA_BRACKETS_SINGLE: StateBracket[] = [
  { rate: 0.01, min: 0, max: 10_756 },
  { rate: 0.02, min: 10_756, max: 25_499 },
  { rate: 0.04, min: 25_499, max: 40_245 },
  { rate: 0.06, min: 40_245, max: 55_866 },
  { rate: 0.08, min: 55_866, max: 70_606 },
  { rate: 0.093, min: 70_606, max: 360_659 },
  { rate: 0.103, min: 360_659, max: 432_787 },
  { rate: 0.113, min: 432_787, max: 721_314 },
  { rate: 0.123, min: 721_314, max: null },
];

const CA_BRACKETS_MFJ: StateBracket[] = CA_BRACKETS_SINGLE.map((b) => ({
  ...b,
  min: b.min * 2,
  max: b.max == null ? null : b.max * 2,
}));

export const STATE_TAX: Record<string, StateTable> = {
  CA: {
    code: "CA",
    name: "California",
    type: "progressive",
    brackets: {
      single: CA_BRACKETS_SINGLE,
      mfs: CA_BRACKETS_SINGLE,
      mfj: CA_BRACKETS_MFJ,
      qw: CA_BRACKETS_MFJ,
      hoh: CA_BRACKETS_MFJ,
    },
    standardDeduction: { single: 5_540, mfs: 5_540, mfj: 11_080, qw: 11_080, hoh: 11_080 },
    notes: [
      "Plus a 1% mental-health surtax on taxable income above $1M.",
      "No preferential capital-gains rate — LTCG taxed as ordinary.",
    ],
  },
  NY: {
    code: "NY",
    name: "New York",
    type: "progressive",
    brackets: {
      single: [
        { rate: 0.04, min: 0, max: 8_500 },
        { rate: 0.045, min: 8_500, max: 11_700 },
        { rate: 0.0525, min: 11_700, max: 13_900 },
        { rate: 0.055, min: 13_900, max: 80_650 },
        { rate: 0.06, min: 80_650, max: 215_400 },
        { rate: 0.0685, min: 215_400, max: 1_077_550 },
        { rate: 0.0965, min: 1_077_550, max: 5_000_000 },
        { rate: 0.103, min: 5_000_000, max: 25_000_000 },
        { rate: 0.109, min: 25_000_000, max: null },
      ],
      mfj: [
        { rate: 0.04, min: 0, max: 17_150 },
        { rate: 0.045, min: 17_150, max: 23_600 },
        { rate: 0.0525, min: 23_600, max: 27_900 },
        { rate: 0.055, min: 27_900, max: 161_550 },
        { rate: 0.06, min: 161_550, max: 323_200 },
        { rate: 0.0685, min: 323_200, max: 2_155_350 },
        { rate: 0.0965, min: 2_155_350, max: 5_000_000 },
        { rate: 0.103, min: 5_000_000, max: 25_000_000 },
        { rate: 0.109, min: 25_000_000, max: null },
      ],
    },
    standardDeduction: { single: 8_000, mfs: 8_000, mfj: 16_050, qw: 16_050, hoh: 11_200 },
    notes: [
      "NYC residents pay an additional city income tax (3.078%–3.876%).",
      "Yonkers adds a surcharge for residents and non-resident earners.",
    ],
  },
  NJ: {
    code: "NJ",
    name: "New Jersey",
    type: "progressive",
    brackets: {
      single: [
        { rate: 0.014, min: 0, max: 20_000 },
        { rate: 0.0175, min: 20_000, max: 35_000 },
        { rate: 0.035, min: 35_000, max: 40_000 },
        { rate: 0.05525, min: 40_000, max: 75_000 },
        { rate: 0.0637, min: 75_000, max: 500_000 },
        { rate: 0.0897, min: 500_000, max: 1_000_000 },
        { rate: 0.1075, min: 1_000_000, max: null },
      ],
      mfj: [
        { rate: 0.014, min: 0, max: 20_000 },
        { rate: 0.0175, min: 20_000, max: 50_000 },
        { rate: 0.0245, min: 50_000, max: 70_000 },
        { rate: 0.035, min: 70_000, max: 80_000 },
        { rate: 0.05525, min: 80_000, max: 150_000 },
        { rate: 0.0637, min: 150_000, max: 500_000 },
        { rate: 0.0897, min: 500_000, max: 1_000_000 },
        { rate: 0.1075, min: 1_000_000, max: null },
      ],
    },
  },
  MA: {
    code: "MA",
    name: "Massachusetts",
    type: "flat",
    flatRate: 0.05,
    notes: [
      "Additional 4% 'millionaire surtax' on taxable income over $1,053,750 (2024).",
      "Long-term capital gains taxed at 5% (short-term at 8.5%).",
    ],
  },
  IL: {
    code: "IL",
    name: "Illinois",
    type: "flat",
    flatRate: 0.0495,
    notes: ["No bracket structure — flat 4.95% on net income."],
  },
  PA: {
    code: "PA",
    name: "Pennsylvania",
    type: "flat",
    flatRate: 0.0307,
    notes: ["Flat 3.07%. Some municipalities add local income tax (typically ~1%)."],
  },
  TX: { code: "TX", name: "Texas", type: "none" },
  FL: { code: "FL", name: "Florida", type: "none" },
  WA: { code: "WA", name: "Washington", type: "none", notes: ["No wage income tax; 7% tax on long-term capital gains over $262,000 (2024)."] },
  NV: { code: "NV", name: "Nevada", type: "none" },
  TN: { code: "TN", name: "Tennessee", type: "none" },
  SD: { code: "SD", name: "South Dakota", type: "none" },
  WY: { code: "WY", name: "Wyoming", type: "none" },
  AK: { code: "AK", name: "Alaska", type: "none" },
  NH: { code: "NH", name: "New Hampshire", type: "none", notes: ["No wage income tax. Prior interest & dividends tax (5%) was repealed effective 2025."] },
};

export type StateTaxResult = {
  state: string;
  type: "none" | "flat" | "progressive";
  tax: number;
  effective_rate: number;
  marginal_rate: number;
  breakdown?: Array<{ rate: number; amount_taxed: number; tax: number }>;
  notes?: string[];
};

export function computeStateTax(
  state: string,
  taxableIncome: number,
  filingStatus: FilingStatus,
): StateTaxResult | { error: string; known_states: string[] } {
  const s = STATE_TAX[state.toUpperCase()];
  if (!s) {
    return {
      error: `State '${state}' is not in the modelled dataset.`,
      known_states: Object.keys(STATE_TAX),
    };
  }
  if (s.type === "none") {
    return {
      state: s.code,
      type: "none",
      tax: 0,
      effective_rate: 0,
      marginal_rate: 0,
      notes: s.notes,
    };
  }
  if (s.type === "flat" && s.flatRate != null) {
    const tax = Math.max(0, taxableIncome) * s.flatRate;
    return {
      state: s.code,
      type: "flat",
      tax,
      effective_rate: taxableIncome > 0 ? tax / taxableIncome : 0,
      marginal_rate: s.flatRate,
      notes: s.notes,
    };
  }
  const brackets =
    s.brackets?.[filingStatus] ??
    s.brackets?.single ??
    s.brackets?.mfj;
  if (!brackets) {
    return {
      error: `No bracket table for state ${s.code} + ${filingStatus}.`,
      known_states: Object.keys(STATE_TAX),
    };
  }
  let tax = 0;
  let marginal = 0;
  const breakdown: Array<{ rate: number; amount_taxed: number; tax: number }> = [];
  for (const b of brackets) {
    if (taxableIncome <= b.min) break;
    const top = Math.min(taxableIncome, b.max ?? Infinity);
    const taxed = Math.max(0, top - b.min);
    if (taxed > 0) {
      const chunk = taxed * b.rate;
      tax += chunk;
      marginal = b.rate;
      breakdown.push({ rate: b.rate, amount_taxed: taxed, tax: chunk });
    }
  }
  return {
    state: s.code,
    type: "progressive",
    tax,
    effective_rate: taxableIncome > 0 ? tax / taxableIncome : 0,
    marginal_rate: marginal,
    breakdown,
    notes: s.notes,
  };
}
