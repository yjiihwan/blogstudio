import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { decryptApiKey } from "./crypto";

export type ImageKeySet = {
  unsplash: string | null;
  pexels: string | null;
  googleAi: string | null;
};

export async function resolveImageKeys(userId: string): Promise<ImageKeySet> {
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) return { unsplash: null, pexels: null, googleAi: null };

  const mode = user.imageApiKeyMode ?? "system";

  if (mode === "user_key") {
    return {
      unsplash: user.unsplashKey ? tryDecrypt(user.unsplashKey) : null,
      pexels: user.pexelsKey ? tryDecrypt(user.pexelsKey) : null,
      googleAi: user.googleAiKey ? tryDecrypt(user.googleAiKey) : null,
    };
  }

  // system mode — fall back to settings table
  const [unsplash, pexels, googleAi] = await Promise.all([
    getSystemKey("unsplash_access_key"),
    getSystemKey("pexels_api_key"),
    getSystemKey("google_ai_api_key"),
  ]);
  return { unsplash, pexels, googleAi };
}

async function getSystemKey(key: string): Promise<string | null> {
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, key) });
  if (!row) return null;
  try { return JSON.parse(row.valueJson) as string | null; } catch { return null; }
}

function tryDecrypt(enc: string): string | null {
  try { return decryptApiKey(enc); } catch { return null; }
}
