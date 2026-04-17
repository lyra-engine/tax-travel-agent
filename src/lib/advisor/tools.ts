import { z } from "zod";
import type { Client, Source } from "./types";
import { BRACKETS_2024, KEY_LIMITS_2024, KEY_LIMITS_2025, LTCG_BRACKETS_2024, STANDARD_DEDUCTION_2024, computeFederalIncomeTax } from "./brackets";
import { substantialPresenceTest, tallyByJurisdiction } from "../calc";
import type { Trip } from "../types";
import { JURISDICTION_MAP } from "../jurisdictions";
import { STATE_TAX, computeStateTax } from "./state-tax";
import { compareEntities, estimateAMT, estimateNIIT, projectRothLadder } from "./planning";
import { semanticSearch } from "./embeddings";

/**
 * Context injected by the server into every tool call.
 * Client data is passed in from the browser on each request (no DB).
 */
export type DraftEmail = {
  subject: string;
  body: string;
  tone: "formal" | "friendly" | "concise";
  to?: string;
  cc?: string[];
};

export type ToolContext = {
  client?: Client;
  /** Notes collected via save_client_note within this turn. Returned to the UI. */
  pendingNotes: Array<{ note: string; tags?: string[] }>;
  /** Sources cited by the agent this turn. Streamed back to the UI. */
  citedSources: Source[];
  /** Email drafts the agent produced this turn. */
  pendingEmails: DraftEmail[];
};

export type ToolDef<A, R> = {
  name: string;
  description: string;
  schema: z.ZodType<A>;
  jsonSchema: Record<string, unknown>;
  run: (args: A, ctx: ToolContext) => Promise<R> | R;
};

/* -------------------------------------------------------------------------- */
/* get_client_profile                                                         */
/* -------------------------------------------------------------------------- */

const getClientProfile: ToolDef<{}, unknown> = {
  name: "get_client_profile",
  description:
    "Returns the currently active client's profile (filing status, income, state, age, notes, trips). Call this before giving any personalized answer. Returns {error} if no client is selected.",
  schema: z.object({}).strict(),
  jsonSchema: { type: "object", properties: {}, additionalProperties: false },
  run: (_args, ctx) => {
    if (!ctx.client) {
      return { error: "No client is currently selected. Ask the advisor to pick one or answer only in general terms." };
    }
    const { trips, ...rest } = ctx.client;
    return { client: { ...rest, tripCount: trips?.length ?? 0 } };
  },
};

/* -------------------------------------------------------------------------- */
/* federal_tax_estimate                                                       */
/* -------------------------------------------------------------------------- */

const federalEstimateSchema = z.object({
  taxable_income: z.number().nonnegative().describe("Taxable income in USD."),
  filing_status: z
    .enum(["single", "mfj", "mfs", "hoh", "qw"])
    .describe("Filing status."),
  use_standard_deduction: z
    .boolean()
    .optional()
    .describe("If true, subtract the 2024 standard deduction from taxable_income before applying brackets. Default false."),
}).strict();

const federalEstimate: ToolDef<z.infer<typeof federalEstimateSchema>, unknown> = {
  name: "federal_tax_estimate",
  description:
    "Compute 2024 US federal ordinary-income tax for a given taxable income and filing status. Returns marginal/effective rate and a bracket-by-bracket breakdown. Does NOT include state tax, NIIT, AMT, or SE tax.",
  schema: federalEstimateSchema,
  jsonSchema: {
    type: "object",
    properties: {
      taxable_income: { type: "number", description: "Taxable income in USD." },
      filing_status: {
        type: "string",
        enum: ["single", "mfj", "mfs", "hoh", "qw"],
        description: "Filing status.",
      },
      use_standard_deduction: {
        type: "boolean",
        description: "If true, subtract the 2024 standard deduction first.",
      },
    },
    required: ["taxable_income", "filing_status"],
    additionalProperties: false,
  },
  run: (args) => {
    let ti = args.taxable_income;
    let stdDeductionApplied: number | undefined;
    if (args.use_standard_deduction) {
      stdDeductionApplied = STANDARD_DEDUCTION_2024[args.filing_status];
      ti = Math.max(0, ti - stdDeductionApplied);
    }
    const result = computeFederalIncomeTax(ti, args.filing_status);
    return {
      year: 2024,
      inputs: { ...args, taxable_income_after_deduction: ti, standard_deduction_applied: stdDeductionApplied },
      tax_owed: Math.round(result.tax * 100) / 100,
      marginal_rate: result.marginalRate,
      effective_rate: Math.round(result.effectiveRate * 10000) / 10000,
      breakdown: result.breakdown.map((b) => ({
        rate: b.rate,
        amount_taxed: Math.round(b.taxed * 100) / 100,
        tax: Math.round(b.tax * 100) / 100,
      })),
      note: "Federal ordinary income only. Excludes state, NIIT (3.8%), AMT, SE tax, credits.",
    };
  },
};

/* -------------------------------------------------------------------------- */
/* key_limits_lookup                                                          */
/* -------------------------------------------------------------------------- */

const keyLimitsSchema = z.object({
  year: z.union([z.literal(2024), z.literal(2025)]).describe("Tax year."),
}).strict();

const keyLimits: ToolDef<z.infer<typeof keyLimitsSchema>, unknown> = {
  name: "key_limits_lookup",
  description:
    "Return the commonly-referenced 2024/2025 tax and retirement limits: IRA, 401(k), HSA, SS wage base, SALT cap, estate exemption, annual gift exclusion, FEIE.",
  schema: keyLimitsSchema,
  jsonSchema: {
    type: "object",
    properties: { year: { type: "number", enum: [2024, 2025] } },
    required: ["year"],
    additionalProperties: false,
  },
  run: (args) => (args.year === 2025 ? KEY_LIMITS_2025 : KEY_LIMITS_2024),
};

/* -------------------------------------------------------------------------- */
/* ltcg_rate_lookup                                                           */
/* -------------------------------------------------------------------------- */

const ltcgSchema = z.object({
  taxable_income: z.number().nonnegative(),
  filing_status: z.enum(["single", "mfj", "mfs", "hoh", "qw"]),
}).strict();

const ltcgLookup: ToolDef<z.infer<typeof ltcgSchema>, unknown> = {
  name: "ltcg_rate_lookup",
  description:
    "Return the 2024 long-term capital gains rate that applies at a given taxable-income level for the given filing status.",
  schema: ltcgSchema,
  jsonSchema: {
    type: "object",
    properties: {
      taxable_income: { type: "number" },
      filing_status: { type: "string", enum: ["single", "mfj", "mfs", "hoh", "qw"] },
    },
    required: ["taxable_income", "filing_status"],
    additionalProperties: false,
  },
  run: (args) => {
    const brackets = LTCG_BRACKETS_2024[args.filing_status];
    const bracket = brackets.find(
      (b) => args.taxable_income >= b.min && (b.max == null || args.taxable_income < b.max),
    );
    return {
      year: 2024,
      rate: bracket?.rate ?? 0,
      brackets,
      note: "Does not include the 3.8% NIIT that may also apply.",
    };
  },
};

/* -------------------------------------------------------------------------- */
/* residency_check                                                            */
/* -------------------------------------------------------------------------- */

const residencyCheckSchema = z.object({
  tax_year: z.number().int().min(2000).max(2100),
  hypothetical_trips: z
    .array(
      z.object({
        jurisdiction_code: z.string(),
        start_date: z.string().describe("ISO date YYYY-MM-DD"),
        end_date: z.string().describe("ISO date YYYY-MM-DD"),
      }),
    )
    .optional()
    .describe("Optional extra trips to append to the client's log for a 'what if' projection."),
}).strict();

const residencyCheck: ToolDef<z.infer<typeof residencyCheckSchema>, unknown> = {
  name: "residency_check",
  description:
    "Run the residency day-count analysis for the active client. Uses the client's logged trips plus any hypothetical_trips and returns per-jurisdiction day counts, threshold status, and US Substantial Presence Test results. Requires a selected client with trips.",
  schema: residencyCheckSchema,
  jsonSchema: {
    type: "object",
    properties: {
      tax_year: { type: "number" },
      hypothetical_trips: {
        type: "array",
        items: {
          type: "object",
          properties: {
            jurisdiction_code: { type: "string" },
            start_date: { type: "string" },
            end_date: { type: "string" },
          },
          required: ["jurisdiction_code", "start_date", "end_date"],
          additionalProperties: false,
        },
      },
    },
    required: ["tax_year"],
    additionalProperties: false,
  },
  run: (args, ctx) => {
    if (!ctx.client) return { error: "No client selected." };
    const base: Trip[] = ctx.client.trips ?? [];
    const extra: Trip[] = (args.hypothetical_trips ?? []).map((t, i) => ({
      id: `hyp-${i}`,
      jurisdictionCode: t.jurisdiction_code,
      startDate: t.start_date,
      endDate: t.end_date,
    }));
    const all = [...base, ...extra];
    if (all.length === 0) {
      return { error: "No trips on file for this client and none supplied as hypotheticals." };
    }
    const tally = tallyByJurisdiction(all, args.tax_year, "inclusive");
    const spt = substantialPresenceTest(all, args.tax_year, "inclusive");
    return {
      tax_year: args.tax_year,
      client_name: ctx.client.name,
      by_jurisdiction: [...tally.values()].map((row) => {
        const j = JURISDICTION_MAP[row.code];
        const threshold = j?.threshold?.days;
        const remaining = threshold != null ? Math.max(0, threshold - row.days) : null;
        const status = threshold == null ? "no-threshold" : row.days >= threshold ? "over" : row.days / threshold >= 0.75 ? "warning" : "safe";
        return {
          code: row.code,
          name: j?.name ?? row.code,
          days: row.days,
          threshold_days: threshold ?? null,
          threshold_label: j?.threshold?.label ?? null,
          days_remaining: remaining,
          status,
        };
      }),
      substantial_presence_test: {
        days_current: spt.daysCurrent,
        days_prior: spt.daysPriorRaw,
        days_two_prior: spt.daysTwoPriorRaw,
        weighted_total: Math.round(spt.weightedTotal * 100) / 100,
        meets_31_day_minimum: spt.meets31DayMin,
        meets_test: spt.meetsTest,
        threshold_reached_on: spt.thresholdReachedOn ?? null,
      },
      included_hypothetical_trips: extra.length,
    };
  },
};

/* -------------------------------------------------------------------------- */
/* search_tax_sources                                                         */
/* -------------------------------------------------------------------------- */

const searchSourcesSchema = z.object({
  query: z.string().min(2),
  k: z.number().int().min(1).max(8).optional(),
}).strict();

const searchSources: ToolDef<z.infer<typeof searchSourcesSchema>, unknown> = {
  name: "search_tax_sources",
  description:
    "Search the internal tax knowledge base for authoritative snippets relevant to a question. Always call this before stating a specific rule, limit, or threshold so the response is properly cited. Sources found are automatically surfaced to the advisor.",
  schema: searchSourcesSchema,
  jsonSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      k: { type: "number", minimum: 1, maximum: 8 },
    },
    required: ["query"],
    additionalProperties: false,
  },
  run: async (args, ctx) => {
    const results = await semanticSearch(args.query, args.k ?? 4);
    for (const s of results) {
      if (!ctx.citedSources.some((c) => c.id === s.id)) {
        ctx.citedSources.push({ id: s.id, title: s.title, url: s.url, snippet: s.snippet });
      }
    }
    const method = results[0]?.method ?? "keyword";
    return {
      query: args.query,
      method,
      results: results.map((r) => ({
        id: r.id,
        title: r.title,
        snippet: r.snippet,
        url: r.url,
        score: Number(r.score.toFixed(3)),
      })),
      note: results.length === 0 ? "No matching sources found; proceed cautiously or say you don't know." : undefined,
    };
  },
};

/* -------------------------------------------------------------------------- */
/* save_client_note                                                           */
/* -------------------------------------------------------------------------- */

const saveNoteSchema = z.object({
  note: z.string().min(3),
  tags: z.array(z.string()).optional(),
}).strict();

const saveClientNote: ToolDef<z.infer<typeof saveNoteSchema>, unknown> = {
  name: "save_client_note",
  description:
    "Stage a note to be appended to the active client's file. Use for items the advisor confirms (e.g. 'client is planning to relocate to Florida in Q3'). The note is shown to the advisor for approval and only persisted client-side.",
  schema: saveNoteSchema,
  jsonSchema: {
    type: "object",
    properties: {
      note: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["note"],
    additionalProperties: false,
  },
  run: (args, ctx) => {
    if (!ctx.client) return { error: "No client selected — note cannot be attached." };
    ctx.pendingNotes.push({ note: args.note, tags: args.tags });
    return { ok: true, staged_note: args.note, requires_advisor_approval: true };
  },
};

/* -------------------------------------------------------------------------- */
/* state_tax_estimate                                                         */
/* -------------------------------------------------------------------------- */

const stateTaxSchema = z.object({
  state: z.string().length(2),
  taxable_income: z.number().nonnegative(),
  filing_status: z.enum(["single", "mfj", "mfs", "hoh", "qw"]),
}).strict();

const stateTax: ToolDef<z.infer<typeof stateTaxSchema>, unknown> = {
  name: "state_tax_estimate",
  description:
    "Estimate 2024 state income tax for a US state. Covers CA, NY, NJ, MA, IL, PA (progressive/flat) and all major no-income-tax states (TX, FL, WA, NV, TN, SD, WY, AK, NH). Returns {error, known_states} for any other state.",
  schema: stateTaxSchema,
  jsonSchema: {
    type: "object",
    properties: {
      state: { type: "string", description: "Two-letter state abbreviation." },
      taxable_income: { type: "number" },
      filing_status: { type: "string", enum: ["single", "mfj", "mfs", "hoh", "qw"] },
    },
    required: ["state", "taxable_income", "filing_status"],
    additionalProperties: false,
  },
  run: (args) => computeStateTax(args.state, args.taxable_income, args.filing_status),
};

/* -------------------------------------------------------------------------- */
/* roth_conversion_ladder                                                     */
/* -------------------------------------------------------------------------- */

const rothLadderSchema = z.object({
  pretax_balance: z.number().positive(),
  years: z.number().int().min(1).max(30),
  filing_status: z.enum(["single", "mfj", "mfs", "hoh", "qw"]),
  baseline_taxable_income: z.number().nonnegative(),
  target_top_rate: z.union([
    z.literal(0.1),
    z.literal(0.12),
    z.literal(0.22),
    z.literal(0.24),
    z.literal(0.32),
    z.literal(0.35),
    z.literal(0.37),
  ]).describe("Top federal bracket you want to fill each year (0.10–0.37)."),
}).strict();

const rothLadder: ToolDef<z.infer<typeof rothLadderSchema>, unknown> = {
  name: "roth_conversion_ladder",
  description:
    "Project a year-by-year Roth conversion ladder. Each year converts up to the headroom inside the chosen federal bracket, given baseline taxable income. Returns per-year amounts, incremental federal tax, and the blended effective rate.",
  schema: rothLadderSchema,
  jsonSchema: {
    type: "object",
    properties: {
      pretax_balance: { type: "number" },
      years: { type: "number" },
      filing_status: { type: "string", enum: ["single", "mfj", "mfs", "hoh", "qw"] },
      baseline_taxable_income: { type: "number" },
      target_top_rate: { type: "number", enum: [0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37] },
    },
    required: ["pretax_balance", "years", "filing_status", "baseline_taxable_income", "target_top_rate"],
    additionalProperties: false,
  },
  run: (args) =>
    projectRothLadder({
      pretax_balance: args.pretax_balance,
      years: args.years,
      filing_status: args.filing_status,
      baseline_taxable_income: args.baseline_taxable_income,
      target_top_rate: args.target_top_rate,
    }),
};

/* -------------------------------------------------------------------------- */
/* amt_estimate                                                               */
/* -------------------------------------------------------------------------- */

const amtSchema = z.object({
  amti: z.number().nonnegative(),
  filing_status: z.enum(["single", "mfj", "mfs", "hoh", "qw"]),
  regular_tax: z.number().nonnegative(),
}).strict();

const amt: ToolDef<z.infer<typeof amtSchema>, unknown> = {
  name: "amt_estimate",
  description:
    "Estimate 2024 AMT. Caller provides AMTI (regular taxable income plus AMT add-backs) and the regular tax already computed. Returns tentative minimum tax and the incremental AMT owed (zero if regular tax is larger). Does not model AMT capital gains stacking.",
  schema: amtSchema,
  jsonSchema: {
    type: "object",
    properties: {
      amti: { type: "number" },
      filing_status: { type: "string", enum: ["single", "mfj", "mfs", "hoh", "qw"] },
      regular_tax: { type: "number" },
    },
    required: ["amti", "filing_status", "regular_tax"],
    additionalProperties: false,
  },
  run: (args) => estimateAMT(args.amti, args.filing_status, args.regular_tax),
};

/* -------------------------------------------------------------------------- */
/* niit_estimate                                                              */
/* -------------------------------------------------------------------------- */

const niitSchema = z.object({
  net_investment_income: z.number().nonnegative(),
  magi: z.number().nonnegative(),
  filing_status: z.enum(["single", "mfj", "mfs", "hoh", "qw"]),
}).strict();

const niit: ToolDef<z.infer<typeof niitSchema>, unknown> = {
  name: "niit_estimate",
  description:
    "Estimate the 3.8% Net Investment Income Tax (IRC §1411). Applied to the lesser of net investment income or MAGI-over-threshold.",
  schema: niitSchema,
  jsonSchema: {
    type: "object",
    properties: {
      net_investment_income: { type: "number" },
      magi: { type: "number" },
      filing_status: { type: "string", enum: ["single", "mfj", "mfs", "hoh", "qw"] },
    },
    required: ["net_investment_income", "magi", "filing_status"],
    additionalProperties: false,
  },
  run: (args) => estimateNIIT(args.net_investment_income, args.magi, args.filing_status),
};

/* -------------------------------------------------------------------------- */
/* entity_comparison                                                          */
/* -------------------------------------------------------------------------- */

const entityComparisonSchema = z.object({
  net_business_income: z.number().positive(),
  filing_status: z.enum(["single", "mfj", "mfs", "hoh", "qw"]),
  other_wages: z.number().nonnegative().optional(),
  reasonable_salary_pct: z.number().min(0.1).max(0.95).optional(),
  qbi_eligible: z.boolean().optional(),
  state_marginal_rate: z.number().min(0).max(0.15).optional(),
}).strict();

const entityComparison: ToolDef<z.infer<typeof entityComparisonSchema>, unknown> = {
  name: "entity_comparison",
  description:
    "Compare total federal tax (and optional state) across Sole-Prop/LLC-disregarded, S-Corp, and C-Corp structures at a given net business income. Models SE tax, FICA, QBI, and a simplified C-corp double-tax. Use this when the advisor is choosing or revisiting an entity structure.",
  schema: entityComparisonSchema,
  jsonSchema: {
    type: "object",
    properties: {
      net_business_income: { type: "number" },
      filing_status: { type: "string", enum: ["single", "mfj", "mfs", "hoh", "qw"] },
      other_wages: { type: "number" },
      reasonable_salary_pct: { type: "number", minimum: 0.1, maximum: 0.95 },
      qbi_eligible: { type: "boolean" },
      state_marginal_rate: { type: "number", minimum: 0, maximum: 0.15 },
    },
    required: ["net_business_income", "filing_status"],
    additionalProperties: false,
  },
  run: (args) =>
    compareEntities({
      net_business_income: args.net_business_income,
      filing_status: args.filing_status,
      other_wages: args.other_wages,
      reasonable_salary_pct: args.reasonable_salary_pct,
      qbi_eligible: args.qbi_eligible,
      state_marginal_rate: args.state_marginal_rate,
    }),
};

/* -------------------------------------------------------------------------- */
/* draft_client_email                                                         */
/* -------------------------------------------------------------------------- */

const draftEmailSchema = z.object({
  subject: z.string().min(3).max(200),
  body: z.string().min(20).describe("Plain-text email body. Plaintext only, 120–600 words typical."),
  tone: z.enum(["formal", "friendly", "concise"]).optional(),
  cc: z.array(z.string().email()).optional(),
}).strict();

const draftClientEmail: ToolDef<z.infer<typeof draftEmailSchema>, unknown> = {
  name: "draft_client_email",
  description:
    "Draft an advisor-to-client email summarizing the discussion. The draft appears as a card the advisor can review, edit, copy, and open in their email client. Never reaches the client directly — human review is required. Use only when the advisor explicitly asks for a draft or memo-to-client.",
  schema: draftEmailSchema,
  jsonSchema: {
    type: "object",
    properties: {
      subject: { type: "string" },
      body: { type: "string" },
      tone: { type: "string", enum: ["formal", "friendly", "concise"] },
      cc: { type: "array", items: { type: "string", format: "email" } },
    },
    required: ["subject", "body"],
    additionalProperties: false,
  },
  run: (args, ctx) => {
    const draft: DraftEmail = {
      subject: args.subject,
      body: args.body,
      tone: args.tone ?? "formal",
      to: ctx.client?.email,
      cc: args.cc,
    };
    ctx.pendingEmails.push(draft);
    return {
      ok: true,
      staged: true,
      requires_advisor_approval: true,
      preview: {
        to: draft.to ?? "(no client email on file)",
        subject: draft.subject,
        body_preview: args.body.slice(0, 200) + (args.body.length > 200 ? "…" : ""),
        tone: draft.tone,
      },
    };
  },
};

/* -------------------------------------------------------------------------- */

export const TOOLS: ToolDef<any, any>[] = [
  getClientProfile,
  federalEstimate,
  stateTax,
  keyLimits,
  ltcgLookup,
  residencyCheck,
  rothLadder,
  amt,
  niit,
  entityComparison,
  searchSources,
  saveClientNote,
  draftClientEmail,
];

export const TOOL_MAP: Record<string, ToolDef<any, any>> = Object.fromEntries(
  TOOLS.map((t) => [t.name, t]),
);

/** OpenAI tool spec list for chat.completions.create({ tools }). */
export function openAIToolSpecs() {
  return TOOLS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.jsonSchema,
    },
  }));
}
