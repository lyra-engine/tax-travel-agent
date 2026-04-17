import type { APIRoute } from "astro";
import { TOOL_MAP } from "../../lib/advisor/tools";
import type { ToolContext } from "../../lib/advisor/tools";

export const prerender = false;

/**
 * Lightweight JSON endpoint that exposes the deterministic calculator tools
 * directly (no LLM) for the /scenarios page and any future UI that needs
 * to run side-by-side what-if comparisons.
 *
 * POST { tool: "federal_tax_estimate", args: {...} }
 * -> { ok: true, result: ... }
 */
export const POST: APIRoute = async ({ request }) => {
  let body: { tool: string; args: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const def = TOOL_MAP[body.tool];
  if (!def) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: `Unknown tool: ${body.tool}.`,
        known: Object.keys(TOOL_MAP),
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const parsed = def.schema.parse(body.args ?? {});
    const ctx: ToolContext = {
      pendingNotes: [],
      citedSources: [],
      pendingEmails: [],
    };
    const result = await def.run(parsed, ctx);
    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
};
