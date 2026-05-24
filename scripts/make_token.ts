import { SignJWT } from "jose";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";

async function main() {
  const email = process.argv[2] ?? "admin@blogstudio.local";
  const secret = new TextEncoder().encode(
    process.env.AUTH_SECRET ?? "dev-secret-blog-studio-please-set"
  );
  const user = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });
  if (!user) throw new Error("not found: " + email);
  const token = await new SignJWT({ uid: user.id, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(secret);
  process.stdout.write(token);
}

main();
