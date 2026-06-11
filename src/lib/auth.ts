import { cookies } from "next/headers";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { db, schema } from "@/db/client";
import { eq, inArray, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { env } from "./env";

export { hashPassword, verifyPassword } from "./auth/passwords";

const COOKIE_NAME = "bs_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 14;
const secret = new TextEncoder().encode(env.AUTH_SECRET);

export type SessionPayload = JWTPayload & {
  uid: string;
  role: "admin" | "user";
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
  if (!u || !u.isActive) return null;
  return u;
}

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}

export async function requireAdmin() {
  const u = await requireUser();
  if (u.role !== "admin") throw new Error("FORBIDDEN");
  return u;
}

/** @deprecated alias kept for future use — prefer requireAdmin() */
export const requireOwner = requireAdmin;

/* =========================================================================
   BLOG OWNERSHIP / ISOLATION
   - 블로그 = 1 소유자 + 어드민 전체열람. 모든 작업물(drafts·personas·
     schedules·imageRequests …)은 blogs.id에 종속되므로, blogs 접근만
     스코프하면 하위 데이터가 자동 격리된다.
   ========================================================================= */

type ScopeUser = { id: string; role: "admin" | "user" };

/** 항상 0건을 반환하는 조건 (소유 블로그가 하나도 없는 일반 유저용). */
const NEVER = sql`1 = 0`;

export function isAdmin(user: ScopeUser): boolean {
  return user.role === "admin";
}

/** 유저가 소유한 blog id 목록. */
export async function ownedBlogIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: schema.blogs.id })
    .from(schema.blogs)
    .where(eq(schema.blogs.ownerId, userId));
  return rows.map((r) => r.id);
}

/** 유저가 소유한 블로그에 속한 draft id 목록. */
export async function ownedDraftIds(userId: string): Promise<string[]> {
  const blogIds = await ownedBlogIds(userId);
  if (!blogIds.length) return [];
  const rows = await db
    .select({ id: schema.drafts.id })
    .from(schema.drafts)
    .where(inArray(schema.drafts.blogId, blogIds));
  return rows.map((r) => r.id);
}

/** `blogs` 테이블 직접 조회용 WHERE. 어드민이면 undefined(제한 없음). */
export function scopeBlogsWhere(user: ScopeUser) {
  return user.role === "admin"
    ? undefined
    : eq(schema.blogs.ownerId, user.id);
}

/** blogId 컬럼을 가진 테이블(drafts·schedules·topicCandidates …) 조회용 WHERE. */
export async function scopeByBlogId(user: ScopeUser, column: AnySQLiteColumn) {
  if (user.role === "admin") return undefined;
  const ids = await ownedBlogIds(user.id);
  return ids.length ? inArray(column, ids) : NEVER;
}

/** draftId 컬럼을 가진 테이블(imageRequests …) 조회용 WHERE. */
export async function scopeByDraftId(user: ScopeUser, column: AnySQLiteColumn) {
  if (user.role === "admin") return undefined;
  const ids = await ownedDraftIds(user.id);
  return ids.length ? inArray(column, ids) : NEVER;
}

/** 유저가 접근 가능한 블로그를 반환, 없거나 권한 없으면 null. */
export async function getAccessibleBlog(blogId: string, user: ScopeUser) {
  const blog = await db.query.blogs.findFirst({
    where: eq(schema.blogs.id, blogId),
  });
  if (!blog) return null;
  if (user.role !== "admin" && blog.ownerId !== user.id) return null;
  return blog;
}

/** 유저가 접근 가능한 draft(+blog)를 반환, 없거나 권한 없으면 null. */
export async function getAccessibleDraft(draftId: string, user: ScopeUser) {
  const draft = await db.query.drafts.findFirst({
    where: eq(schema.drafts.id, draftId),
    with: { blog: true },
  });
  if (!draft) return null;
  if (user.role !== "admin" && draft.blog.ownerId !== user.id) return null;
  return draft;
}
