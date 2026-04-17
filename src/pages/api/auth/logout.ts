import type { APIRoute } from "astro";
import { SESSION_COOKIE, deleteSession } from "../../../lib/auth/auth";

export const prerender = false;

export const POST: APIRoute = async ({ cookies, redirect }) => {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token) deleteSession(token);
  cookies.delete(SESSION_COOKIE, { path: "/" });
  return redirect("/login");
};

export const GET: APIRoute = async ({ cookies, redirect }) => {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token) deleteSession(token);
  cookies.delete(SESSION_COOKIE, { path: "/" });
  return redirect("/login");
};
