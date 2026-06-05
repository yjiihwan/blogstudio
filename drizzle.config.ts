import type { Config } from "drizzle-kit";

const dbUrl =
  process.env.DATABASE_URL?.replace(/^file:/, "") ?? "./.data/studio.db";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: dbUrl },
} satisfies Config;
