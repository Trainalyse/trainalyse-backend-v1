import { Hono } from "hono";
import { devAuth } from "./middleware/auth";
import type { AppEnv } from "./lib/types";

const app = new Hono<AppEnv>();

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

// Temporary probe to exercise the dev-auth middleware. Reads only c.get("user"),
// so it's agnostic to how the user was authenticated.
app.get("/me", devAuth, (c) => {
  return c.json(c.get("user"));
});

export default app;
