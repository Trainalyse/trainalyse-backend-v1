import type { users } from "../db/schema";

/**
 * The authenticated user as seen by every endpoint. Never carries passwordHash.
 * How this gets populated (dev header today, JWT/session later) is the
 * middleware's concern — endpoints only ever read c.get("user").
 */
export type AuthUser = Pick<
  typeof users.$inferSelect,
  "id" | "username" | "email"
>;

export type AppEnv = {
  Variables: {
    user: AuthUser;
  };
};
