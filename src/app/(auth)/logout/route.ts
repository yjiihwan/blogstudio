import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import { env } from "@/lib/env";

async function handler() {
  await clearSessionCookie();
  return NextResponse.redirect(new URL("/login", env.APP_URL || "http://localhost:3000"));
}

export const GET = handler;
export const POST = handler;
