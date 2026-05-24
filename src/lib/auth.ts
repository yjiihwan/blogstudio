import { cookies } from "next/headers";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { env } from "./env";

export { hashPassword, verifyPassword } from "./auth/passwords";

const COOKIE_NAME = "bs_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 14;
const secret = new TextEncoder().encode(env.AUTH_SECRET);

export type SessionPayload = JWTPayload & {
  uid: string;
  role: "owner" | "editor" | "viewer";
};

export async function signSession(
  payload: Omit<SessionPayload, "iat" | "exp">
) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${COOKIE_MAX_AGE}s`)
    .sign(secret);
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const u = await db.query.users.findFirst({
    where: eq(schema.users.id, session.uid),
  });
  return u ?? null;
}

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}

export async function requireOwner() {
  const u = await requireUser();
  if (u.role !== "owner") throw new Error("FORBIDDEN");
  return u;
}
