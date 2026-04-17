import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb } from "./db";

export type Org = { id: string; name: string; createdAt: number };
export type User = {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: "admin" | "member";
  createdAt: number;
};
export type Session = {
  token: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
};

export const SESSION_COOKIE = "fidelis_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

/** Whether auth is enforced. Opt-in via FIDELIS_AUTH=1. */
export function authEnabled(): boolean {
  return process.env.FIDELIS_AUTH === "1" || import.meta.env.FIDELIS_AUTH === "1";
}

/* -------------------------------------------------------------------------- */
/* Password hashing (scrypt, Node built-in)                                   */
/* -------------------------------------------------------------------------- */

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, saltHex, hashHex] = stored.split("$");
  if (alg !== "scrypt" || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const got = scryptSync(password, salt, expected.length, { N: 16384, r: 8, p: 1 });
  return expected.length === got.length && timingSafeEqual(expected, got);
}

/* -------------------------------------------------------------------------- */
/* Org + user CRUD                                                            */
/* -------------------------------------------------------------------------- */

export function createOrgAndAdmin(input: {
  orgName: string;
  email: string;
  name: string;
  password: string;
}): { org: Org; user: User } {
  const db = getDb();
  const now = Date.now();
  const org: Org = { id: crypto.randomUUID(), name: input.orgName, createdAt: now };
  const user: User = {
    id: crypto.randomUUID(),
    orgId: org.id,
    email: input.email.toLowerCase(),
    name: input.name,
    role: "admin",
    createdAt: now,
  };
  const passwordHash = hashPassword(input.password);
  db.transaction(() => {
    db.prepare(`INSERT INTO orgs (id, name, createdAt) VALUES (?, ?, ?)`).run(
      org.id,
      org.name,
      org.createdAt,
    );
    db.prepare(
      `INSERT INTO users (id, orgId, email, name, passwordHash, role, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(user.id, user.orgId, user.email, user.name, passwordHash, user.role, user.createdAt);
  })();
  return { org, user };
}

export function findUserByEmail(email: string): (User & { passwordHash: string }) | null {
  const db = getDb();
  return (
    (db
      .prepare(
        `SELECT id, orgId, email, name, passwordHash, role, createdAt FROM users WHERE lower(email) = ?`,
      )
      .get(email.toLowerCase()) as (User & { passwordHash: string }) | undefined) ?? null
  );
}

export function getUser(id: string): User | null {
  const db = getDb();
  return (
    (db
      .prepare(`SELECT id, orgId, email, name, role, createdAt FROM users WHERE id = ?`)
      .get(id) as User | undefined) ?? null
  );
}

export function getOrg(id: string): Org | null {
  const db = getDb();
  return (db.prepare(`SELECT id, name, createdAt FROM orgs WHERE id = ?`).get(id) as Org | undefined) ?? null;
}

export function listOrgMembers(orgId: string): User[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, orgId, email, name, role, createdAt FROM users WHERE orgId = ? ORDER BY createdAt ASC`,
    )
    .all(orgId) as User[];
}

/* -------------------------------------------------------------------------- */
/* Sessions                                                                   */
/* -------------------------------------------------------------------------- */

export function createSession(userId: string): Session {
  const db = getDb();
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const session: Session = {
    token,
    userId,
    createdAt: now,
    expiresAt: now + SESSION_DURATION_MS,
  };
  db.prepare(
    `INSERT INTO sessions (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)`,
  ).run(session.token, session.userId, session.createdAt, session.expiresAt);
  return session;
}

export function readSession(token: string | undefined): {
  user: User;
  org: Org;
} | null {
  if (!token) return null;
  const db = getDb();
  const row = db
    .prepare(`SELECT token, userId, createdAt, expiresAt FROM sessions WHERE token = ?`)
    .get(token) as Session | undefined;
  if (!row) return null;
  if (row.expiresAt < Date.now()) {
    db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
    return null;
  }
  const user = getUser(row.userId);
  if (!user) return null;
  const org = getOrg(user.orgId);
  if (!org) return null;
  return { user, org };
}

export function deleteSession(token: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

/* -------------------------------------------------------------------------- */
/* Invites                                                                    */
/* -------------------------------------------------------------------------- */

export function createInvite(input: { orgId: string; email: string; role?: "admin" | "member" }): string {
  const db = getDb();
  const token = randomBytes(24).toString("base64url");
  const now = Date.now();
  db.prepare(
    `INSERT INTO invites (token, orgId, email, role, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(token, input.orgId, input.email.toLowerCase(), input.role ?? "member", now, now + 1000 * 60 * 60 * 24 * 7);
  return token;
}

export function consumeInvite(
  token: string,
  user: { email: string; name: string; password: string },
): { user: User; org: Org } | { error: string } {
  const db = getDb();
  const invite = db
    .prepare(
      `SELECT token, orgId, email, role, createdAt, expiresAt, consumedAt FROM invites WHERE token = ?`,
    )
    .get(token) as
    | {
        token: string;
        orgId: string;
        email: string;
        role: "admin" | "member";
        createdAt: number;
        expiresAt: number;
        consumedAt: number | null;
      }
    | undefined;
  if (!invite) return { error: "Invite not found." };
  if (invite.consumedAt) return { error: "Invite already used." };
  if (invite.expiresAt < Date.now()) return { error: "Invite expired." };
  if (invite.email !== user.email.toLowerCase()) {
    return { error: "Email does not match the invite." };
  }
  const org = getOrg(invite.orgId);
  if (!org) return { error: "Org no longer exists." };
  const now = Date.now();
  const newUser: User = {
    id: crypto.randomUUID(),
    orgId: invite.orgId,
    email: user.email.toLowerCase(),
    name: user.name,
    role: invite.role,
    createdAt: now,
  };
  const passwordHash = hashPassword(user.password);
  db.transaction(() => {
    db.prepare(
      `INSERT INTO users (id, orgId, email, name, passwordHash, role, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(newUser.id, newUser.orgId, newUser.email, newUser.name, passwordHash, newUser.role, newUser.createdAt);
    db.prepare(`UPDATE invites SET consumedAt = ? WHERE token = ?`).run(now, token);
  })();
  return { user: newUser, org };
}
