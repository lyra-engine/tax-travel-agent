import type { FilingStatus } from "./types";
import {
  BRACKETS_2024,
  computeFederalIncomeTax,
  STANDARD_DEDUCTION_2024,
} from "./brackets";

/* -------------------------------------------------------------------------- */
/* Roth conversion ladder                                                     */
/* -------------------------------------------------------------------------- */

export type RothLadderInput = {
  pretax_balance: number;
  years: number;
  filing_status: FilingStatus;
  baseline_taxable_income: number;
  target_top_rate: 0.10 | 0.12 | 0.22 | 0.24 | 0.32 | 0.35 | 0.37;
};

export type RothLadderResult = {
  total_converted: number;
  total_federal_tax_on_conversions: number;
  remaining_pretax_balance: number;
  average_effective_conversion_rate: number;
  years: Array<{
    year_index: number;
    conversion_amount: number;
    taxable_income_after: number;
    federal_tax_before: number;
    federal_tax_after: number;
    incremental_tax: number;
    effective_conversion_rate: number;
  }>;
  assumptions: string[];
};

export function projectRothLadder(input: RothLadderInput): RothLadderResult {
  const brackets = BRACKETS_2024[input.filing_status];
  const targetBracket = brackets.find((b) => b.rate === input.target_top_rate);
  if (!targetBracket) {
    return {
      total_converted: 0,
      total_federal_tax_on_conversions: 0,
      remaining_pretax_balance: input.pretax_balance,
      average_effective_conversion_rate: 0,
      years: [],
      assumptions: [`No bracket with rate ${input.target_top_rate} for ${input.filing_status}.`],
    };
  }
  const headroom = Math.max(0, (targetBracket.max ?? Infinity) - input.baseline_taxable_income);
  let remaining = input.pretax_balance;
  let totalConverted = 0;
  let totalTax = 0;
  const years: RothLadderResult["years"] = [];
  for (let i = 0; i < input.years && remaining > 0; i++) {
    const amount = Math.max(0, Math.min(headroom, remaining));
    if (amount === 0) break;
    const before = computeFederalIncomeTax(input.baseline_taxable_income, input.filing_status).tax;
    const after = computeFederalIncomeTax(
      input.baseline_taxable_income + amount,
      input.filing_status,
    ).tax;
    const incremental = after - before;
    years.push({
      year_index: i + 1,
      conversion_amount: round2(amount),
      taxable_income_after: round2(input.baseline_taxable_income + amount),
      federal_tax_before: round2(before),
      federal_tax_after: round2(after),
      incremental_tax: round2(incremental),
      effective_conversion_rate: amount > 0 ? round4(incremental / amount) : 0,
    });
    totalConverted += amount;
    totalTax += incremental;
    remaining -= amount;
  }
  return {
    total_converted: round2(totalConverted),
    total_federal_tax_on_conversions: round2(totalTax),
    remaining_pretax_balance: round2(remaining),
    average_effective_conversion_rate:
      totalConverted > 0 ? round4(totalTax / totalConverted) : 0,
    years,
    assumptions: [
      "Assumes baseline taxable income is constant each year.",
      "Assumes 2024 brackets apply to every year (they don't — schedules change).",
      "Excludes state tax, IRMAA, NIIT effects, and the pro-rata rule for basis.",
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* AMT                                                                        */
/* -------------------------------------------------------------------------- */

export const AMT_2024 = {
  exemption: { single: 85_700, mfj: 133_300, mfs: 66_650, hoh: 85_700, qw: 133_300 },
  phaseoutStart: {
    single: 609_350,
    mfj: 1_218_700,
    mfs: 609_350,
    hoh: 609_350,
    qw: 1_218_700,
  },
  lowerRate: 0.26,
  upperRate: 0.28,
  rateBreak: { single: 232_600, mfj: 232_600, mfs: 116_300, hoh: 232_600, qw: 232_600 },
};

export function estimateAMT(
  amti: number,
  filingStatus: FilingStatus,
  regularTax: number,
): {
  amti: number;
  exemption_full: number;
  exemption_applied: number;
  tentative_minimum_tax: number;
  amt_owed: number;
  binding: boolean;
} {
  const fullExemption = AMT_2024.exemption[filingStatus];
  const phaseStart = AMT_2024.phaseoutStart[filingStatus];
  const over = Math.max(0, amti - phaseStart);
  const exemption = Math.max(0, fullExemption - 0.25 * over);
  const base = Math.max(0, amti - exemption);
  const rateBreak = AMT_2024.rateBreak[filingStatus];
  const tmt =
    base <= rateBreak
      ? base * AMT_2024.lowerRate
      : rateBreak * AMT_2024.lowerRate + (base - rateBreak) * AMT_2024.upperRate;
  const amt = Math.max(0, tmt - regularTax);
  return {
    amti,
    exemption_full: fullExemption,
    exemption_applied: round2(exemption),
    tentative_minimum_tax: round2(tmt),
    amt_owed: round2(amt),
    binding: amt > 0,
  };
}

/* -------------------------------------------------------------------------- */
/* NIIT                                                                       */
/* -------------------------------------------------------------------------- */

export const NIIT_THRESHOLDS = {
  single: 200_000,
  hoh: 200_000,
  mfj: 250_000,
  qw: 250_000,
  mfs: 125_000,
};

export function estimateNIIT(
  nii: number,
  magi: number,
  filingStatus: FilingStatus,
): {
  threshold: number;
  magi_excess: number;
  taxable_base: number;
  niit: number;
} {
  const threshold = NIIT_THRESHOLDS[filingStatus];
  const excess = Math.max(0, magi - threshold);
  const base = Math.min(Math.max(0, nii), excess);
  return {
    threshold,
    magi_excess: round2(excess),
    taxable_base: round2(base),
    niit: round2(base * 0.038),
  };
}

/* -------------------------------------------------------------------------- */
/* Entity comparison                                                          */
/* -------------------------------------------------------------------------- */

const SS_WAGE_BASE_2024 = 168_600;
const FICA_SS_EMP_RATE = 0.062;
const FICA_MED_EMP_RATE = 0.0145;
const FICA_SS_SE_RATE = 0.124;
const FICA_MED_SE_RATE = 0.029;
const ADDL_MEDICARE_RATE = 0.009;
const ADDL_MEDICARE_THRESHOLD: Record<FilingStatus, number> = {
  single: 200_000,
  hoh: 200_000,
  mfj: 250_000,
  qw: 250_000,
  mfs: 125_000,
};

export type EntityComparisonInput = {
  net_business_income: number;
  filing_status: FilingStatus;
  other_wages?: number;
  reasonable_salary_pct?: number;
  qbi_eligible?: boolean;
  state_marginal_rate?: number;
};

export type EntityResult = {
  entity: "sole_prop" | "s_corp" | "c_corp";
  federal_income_tax: number;
  self_employment_or_fica_tax: number;
  additional_medicare: number;
  qbi_deduction: number;
  corporate_tax: number;
  shareholder_dividend_tax: number;
  state_tax_estimate: number;
  total_tax: number;
  effective_total_rate: number;
  notes: string[];
};

export function compareEntities(input: EntityComparisonInput): EntityResult[] {
  const results: EntityResult[] = [];

  const salaryPct = input.reasonable_salary_pct ?? 0.4;
  const stdDed = STANDARD_DEDUCTION_2024[input.filing_status];

  // --- Sole prop / LLC disregarded ---
  const spSE = selfEmploymentTax(input.net_business_income);
  const spHalfSE = spSE.total / 2;
  const spQbiBase = Math.max(0, input.net_business_income - spHalfSE);
  const spQbi = input.qbi_eligible ? Math.min(0.2 * spQbiBase, 0.2 * (spQbiBase + (input.other_wages ?? 0) - stdDed)) : 0;
  const spTaxable = Math.max(
    0,
    (input.other_wages ?? 0) + input.net_business_income - spHalfSE - stdDed - spQbi,
  );
  const spFed = computeFederalIncomeTax(spTaxable, input.filing_status).tax;
  const spAddlMed = additionalMedicare(input.net_business_income + (input.other_wages ?? 0), input.filing_status);
  const spState = (input.state_marginal_rate ?? 0) * spTaxable;
  const spTotal = spFed + spSE.total + spAddlMed + spState;

  results.push({
    entity: "sole_prop",
    federal_income_tax: round2(spFed),
    self_employment_or_fica_tax: round2(spSE.total),
    additional_medicare: round2(spAddlMed),
    qbi_deduction: round2(spQbi),
    corporate_tax: 0,
    shareholder_dividend_tax: 0,
    state_tax_estimate: round2(spState),
    total_tax: round2(spTotal),
    effective_total_rate: input.net_business_income > 0 ? round4(spTotal / input.net_business_income) : 0,
    notes: [
      "Full self-employment tax on net business income.",
      input.qbi_eligible ? "QBI deduction applied." : "No QBI assumed.",
      "Half of SE tax deductible above the line.",
    ],
  });

  // --- S-corp ---
  const salary = input.net_business_income * salaryPct;
  const k1 = input.net_business_income - salary;
  const scFica = employerEmployeeFICA(salary);
  const scHalfEmployerFica = scFica.employer;
  const scQbiBase = k1;
  const scQbi = input.qbi_eligible
    ? Math.min(0.2 * scQbiBase, 0.2 * (scQbiBase + salary + (input.other_wages ?? 0) - stdDed))
    : 0;
  const scTaxable = Math.max(
    0,
    (input.other_wages ?? 0) + salary + k1 - scHalfEmployerFica - stdDed - scQbi,
  );
  const scFed = computeFederalIncomeTax(scTaxable, input.filing_status).tax;
  const scAddlMed = additionalMedicare(salary + (input.other_wages ?? 0), input.filing_status);
  const scState = (input.state_marginal_rate ?? 0) * scTaxable;
  const scTotal = scFed + scFica.total + scAddlMed + scState;

  results.push({
    entity: "s_corp",
    federal_income_tax: round2(scFed),
    self_employment_or_fica_tax: round2(scFica.total),
    additional_medicare: round2(scAddlMed),
    qbi_deduction: round2(scQbi),
    corporate_tax: 0,
    shareholder_dividend_tax: 0,
    state_tax_estimate: round2(scState),
    total_tax: round2(scTotal),
    effective_total_rate: input.net_business_income > 0 ? round4(scTotal / input.net_business_income) : 0,
    notes: [
      `Reasonable salary assumed at ${Math.round(salaryPct * 100)}% of net.`,
      "FICA only on salary; K-1 distribution escapes SE/FICA.",
      "Payroll/admin costs (~$1k–$2k/yr) not modelled.",
    ],
  });

  // --- C-corp (simplified: 100% distribution) ---
  const cCorpSalary = input.net_business_income * 0.5;
  const cK1 = 0; // C-corps don't issue K-1
  const retained = input.net_business_income - cCorpSalary;
  const corpTax = Math.max(0, retained) * 0.21;
  const afterCorp = retained - corpTax;
  const cFica = employerEmployeeFICA(cCorpSalary);
  const cTaxableOrdinary = Math.max(
    0,
    (input.other_wages ?? 0) + cCorpSalary - cFica.employer - stdDed,
  );
  const cFed = computeFederalIncomeTax(cTaxableOrdinary, input.filing_status).tax;
  const qdivRate = input.filing_status === "mfj" || input.filing_status === "qw" ? 0.15 : 0.15;
  const qdivTax = Math.max(0, afterCorp) * qdivRate;
  const cState = (input.state_marginal_rate ?? 0) * cTaxableOrdinary;
  const cTotal = corpTax + cFed + cFica.total + qdivTax + cState;

  results.push({
    entity: "c_corp",
    federal_income_tax: round2(cFed),
    self_employment_or_fica_tax: round2(cFica.total),
    additional_medicare: 0,
    qbi_deduction: 0,
    corporate_tax: round2(corpTax),
    shareholder_dividend_tax: round2(qdivTax),
    state_tax_estimate: round2(cState),
    total_tax: round2(cTotal),
    effective_total_rate: input.net_business_income > 0 ? round4(cTotal / input.net_business_income) : 0,
    notes: [
      "Simplified: 50% paid as salary, 50% retained then distributed as qualified dividends.",
      "Assumes 15% qualified dividend rate; QBI deduction does not apply to C-corp earnings.",
      "Double taxation visible in the total.",
    ],
  });

  return results;
}

function selfEmploymentTax(netSE: number): { total: number; ss: number; medicare: number } {
  const base = netSE * 0.9235;
  const ss = Math.min(base, SS_WAGE_BASE_2024) * FICA_SS_SE_RATE;
  const medicare = base * FICA_MED_SE_RATE;
  return { total: ss + medicare, ss, medicare };
}

function employerEmployeeFICA(wages: number): { total: number; employee: number; employer: number } {
  const ssTaxable = Math.min(wages, SS_WAGE_BASE_2024);
  const employee = ssTaxable * FICA_SS_EMP_RATE + wages * FICA_MED_EMP_RATE;
  const employer = ssTaxable * FICA_SS_EMP_RATE + wages * FICA_MED_EMP_RATE;
  return { total: employee + employer, employee, employer };
}

function additionalMedicare(wages: number, filingStatus: FilingStatus): number {
  return Math.max(0, wages - ADDL_MEDICARE_THRESHOLD[filingStatus]) * ADDL_MEDICARE_RATE;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
