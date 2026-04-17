import type { APIRoute } from "astro";
import { authEnabled, createInvite } from "../../../lib/auth/auth";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (authEnabled()) {
    if (!locals.user) return json({ ok: false, error: "Not authenticated." }, 401);
    if (locals.user.role !== "admin")
      return json({ ok: false, error: "Admin only." }, 403);
  } else if (!locals.org) {
    return json(
      {
        ok: false,
        error: "Auth is disabled; signup is not available in this mode.",
      },
      400,
    );
  }

  const form = await safeForm(request);
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const role = (String(form.get("role") ?? "member") === "admin" ? "admin" : "member") as
    | "admin"
    | "member";
  if (!email) return json({ ok: false, error: "Email is required." }, 400);

  const orgId = locals.org!.id;
  const token = createInvite({ orgId, email, role });
  const url = new URL(request.url);
  const link = `${url.origin}/signup?invite=${token}`;
  return json({ ok: true, token, link }, 200);
};

async function safeForm(req: Request): Promise<FormData> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const data = (await req.json()) as Record<string, string>;
    const fd = new FormData();
    for (const [k, v] of Object.entries(data)) fd.set(k, String(v));
    return fd;
  }
  return req.formData();
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
