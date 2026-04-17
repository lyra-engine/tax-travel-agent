import type { APIRoute } from "astro";
import {
  SESSION_COOKIE,
  consumeInvite,
  createOrgAndAdmin,
  createSession,
  findUserByEmail,
} from "../../../lib/auth/auth";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await safeForm(request);
  const email = String(form.get("email") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const orgName = String(form.get("orgName") ?? "").trim();
  const inviteToken = String(form.get("invite") ?? "").trim();
  const next = String(form.get("next") ?? "/agent");

  if (!email || !name || !password) {
    return json({ ok: false, error: "Name, email, and password are required." }, 400);
  }
  if (password.length < 8) {
    return json({ ok: false, error: "Password must be at least 8 characters." }, 400);
  }
  if (findUserByEmail(email)) {
    return json({ ok: false, error: "An account with that email already exists." }, 409);
  }

  let userId: string;

  if (inviteToken) {
    const result = consumeInvite(inviteToken, { email, name, password });
    if ("error" in result) return json({ ok: false, error: result.error }, 400);
    userId = result.user.id;
  } else {
    if (!orgName) {
      return json(
        { ok: false, error: "Organization name is required when signing up without an invite." },
        400,
      );
    }
    const { user } = createOrgAndAdmin({ orgName, email, name, password });
    userId = user.id;
  }

  const session = createSession(userId);
  cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(session.expiresAt),
    secure: import.meta.env.PROD,
  });

  if (request.headers.get("accept")?.includes("application/json")) {
    return json({ ok: true, redirect: next }, 200);
  }
  return redirect(next);
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
