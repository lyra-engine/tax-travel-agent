import type { APIRoute } from "astro";
import {
  SESSION_COOKIE,
  createSession,
  findUserByEmail,
  verifyPassword,
} from "../../../lib/auth/auth";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await safeForm(request);
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/agent");

  if (!email || !password) {
    return json({ ok: false, error: "Email and password are required." }, 400);
  }

  const user = findUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return json({ ok: false, error: "Invalid email or password." }, 401);
  }
  const session = createSession(user.id);
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
