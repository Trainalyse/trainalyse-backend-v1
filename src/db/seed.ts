import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { exercises } from "./schema";

/**
 * Fixed exercise catalog. Not random seed data — each row's (type, is_bodyweight)
 * pairing is meaningful, so we insert exact values rather than generate them.
 * Idempotent: re-running skips rows whose unique name already exists.
 */
const EXERCISE_CATALOG: (typeof exercises.$inferInsert)[] = [
  { name: "Bench Press", type: "weight_and_reps", isBodyweight: false },
  { name: "Pull Ups", type: "weight_and_reps", isBodyweight: true },
  { name: "Push Ups", type: "weight_and_reps", isBodyweight: true },
  { name: "Squats", type: "weight_and_reps", isBodyweight: true },
  { name: "Dips", type: "weight_and_reps", isBodyweight: true },
  { name: "Rows", type: "weight_and_reps", isBodyweight: false },
  { name: "Deadlift", type: "weight_and_reps", isBodyweight: false },
  { name: "Plank", type: "duration", isBodyweight: true },
  { name: "Dead Hang", type: "duration", isBodyweight: true },
];

async function main() {
  const db = drizzle(process.env.DATABASE_URL!);

  // Bare onConflictDoNothing() catches a conflict on ANY unique index —
  // here the normalized-name index. It can't target an expression index by
  // column, and this table has only the one uniqueness rule, so no target
  // is needed.
  const inserted = await db
    .insert(exercises)
    .values(EXERCISE_CATALOG)
    .onConflictDoNothing()
    .returning({ name: exercises.name });

  console.log(
    `Seeded exercises: ${inserted.length} inserted, ${
      EXERCISE_CATALOG.length - inserted.length
    } already present.`
  );

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
