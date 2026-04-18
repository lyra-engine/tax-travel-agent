import { defineMiddleware } from "astro:middleware";
import { SESSION_COOKIE, authEnabled, readSession } from "./lib/auth/auth";

const PUBLIC_PATHS = new Set([
  "/",
  "/marea.html",
  "/fidelis",
  "/login",
  "/signup",
  "/tracker",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/logout",
]);

const PROTECTED_PREFIXES = [
  "/agent",
  "/intake",
  "/audit",
  "/scenarios",
  "/memo",
  "/api/chat",
  "/api/compute",
  "/api/intake",
];

function isProtected(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return false;
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.authEnabled = authEnabled();

  // Prerendered routes run this middleware at build-time. Touching cookies
  // (or request.headers) there emits warnings and is meaningless since there
  // is no real request. Bail out cleanly.
  if (context.isPrerendered) return next();

  const token = context.cookies.get(SESSION_COOKIE)?.value;
  const url = new URL(context.request.url);
  const session = readSafe(token);

  context.locals.user = session?.user;
  context.locals.org = session?.org;

  if (!authEnabled()) return next();
  if (!isProtected(url.pathname)) return next();
  if (session) return next();

  // API routes -> 401 JSON
  if (url.pathname.startsWith("/api/")) {
    return new Response(
      JSON.stringify({ ok: false, error: "Not authenticated." }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // Page -> redirect to login
  const next_ = encodeURIComponent(url.pathname + url.search);
  return context.redirect(`/login?next=${next_}`);
});

function readSafe(token: string | undefined) {
  try {
    return readSession(token);
  } catch {
    return null;
  }
}
