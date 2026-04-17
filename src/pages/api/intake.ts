import type { APIRoute } from "astro";
import { getLLM, getVisionModel } from "../../lib/advisor/llm";

export const prerender = false;

type IntakeRequest = {
  imageDataUrl: string;
  docType?: "w2" | "1099" | "1040" | "other";
  filename?: string;
};

const EXTRACTION_PROMPT = `You are a tax document extraction engine. The user has uploaded an image of a US tax document (W-2, 1099-NEC, 1099-MISC, 1099-INT, 1099-DIV, or Form 1040).

Extract the fields you can read and return a STRICT JSON object with this shape:

{
  "detected_type": "w2" | "1099-nec" | "1099-misc" | "1099-int" | "1099-div" | "1040" | "unknown",
  "tax_year": number | null,
  "taxpayer_name": string | null,
  "taxpayer_ssn_last4": string | null,
  "employer_or_payer": string | null,
  "state": string | null,
  "fields": {
    "wages": number | null,
    "federal_withholding": number | null,
    "social_security_wages": number | null,
    "medicare_wages": number | null,
    "state_wages": number | null,
    "state_withholding": number | null,
    "nonemployee_compensation": number | null,
    "interest_income": number | null,
    "ordinary_dividends": number | null,
    "qualified_dividends": number | null,
    "capital_gains": number | null,
    "rental_income": number | null,
    "retirement_distributions": number | null,
    "total_income_1040": number | null,
    "agi_1040": number | null,
    "taxable_income_1040": number | null,
    "total_tax_1040": number | null
  },
  "filing_status_1040": "single" | "mfj" | "mfs" | "hoh" | "qw" | null,
  "dependents_1040": number | null,
  "confidence": "high" | "medium" | "low",
  "notes": "1-3 sentences flagging anything illegible, partial, or suspicious."
}

Rules:
- Only populate fields you can actually read. Unknown = null.
- Numbers are raw dollars (no commas, no strings).
- Never invent data. If the image is blurry or not a tax doc, set detected_type="unknown", confidence="low", and explain in notes.
- Last-4 of SSN only — never the full number.
- Respond with JSON only. No preamble, no markdown.`;

export const POST: APIRoute = async ({ request }) => {
  const openai = getLLM();
  if (!openai) {
    return new Response(
      JSON.stringify({
        ok: false,
        error:
          "No LLM API key set on the server. Set GROQ_API_KEY (preferred) or OPENAI_API_KEY in the environment.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: IntakeRequest;
  try {
    body = (await request.json()) as IntakeRequest;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body.imageDataUrl || !body.imageDataUrl.startsWith("data:image/")) {
    return new Response(
      JSON.stringify({
        ok: false,
        error:
          "Expected `imageDataUrl` as a base64 data URL with an image MIME type (PDFs are not supported yet — export as PNG/JPEG).",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const completion = await openai.chat.completions.create({
      model: getVisionModel(),
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: EXTRACTION_PROMPT,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: body.docType
                ? `The advisor says this is likely a ${body.docType.toUpperCase()}. Filename: ${body.filename ?? "(unknown)"}.`
                : `Filename: ${body.filename ?? "(unknown)"}.`,
            },
            {
              type: "image_url",
              image_url: { url: body.imageDataUrl, detail: "high" },
            },
          ],
        },
      ],
    });

    const text = completion.choices[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { detected_type: "unknown", confidence: "low", notes: "Model did not return valid JSON.", fields: {} };
    }

    return new Response(
      JSON.stringify({
        ok: true,
        extraction: parsed,
        usage: {
          inputTokens: completion.usage?.prompt_tokens ?? 0,
          outputTokens: completion.usage?.completion_tokens ?? 0,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
