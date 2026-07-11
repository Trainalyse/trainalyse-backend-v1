import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import type { AppEnv } from "../lib/types";

/**
 * Dev-only auth: the frontend sends `X-Dev-User: <username>` (e.g. lifter_3)
 * to act as that user, so switching users while iterating on the UI is just a
 * header change. This stands in for real auth — swapping in JWT/session later
 * means rewriting only this file (parse token -> load user -> c.set("user")).
 * Downstream endpoints stay agnostic; they only ever read c.get("user").
 */
export const DEV_USER_HEADER = "X-Dev-User";

export const devAuth = createMiddleware<AppEnv>(async (c, next) => {
  const username = c.req.header(DEV_USER_HEADER);
  if (!username) {
    return c.json({ error: `Missing ${DEV_USER_HEADER} header` }, 401);
  }

  const [user] = await db
    .select({ id: users.id, username: users.username, email: users.email })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (!user) {
    return c.json({ error: `Unknown dev user: ${username}` }, 401);
  }

  c.set("user", user);
  await next();
});
