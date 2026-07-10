import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import {
  dropsets,
  exercises as exercisesTable,
  exerciseWorkout,
  sets,
  userSettings,
  userStats,
  userWeight,
  users,
  workouts,
} from "./schema";

/**
 * Hand-rolled dummy-data seed. drizzle-seed can't satisfy the dropset
 * reps-xor-duration / assistance-xor-resistance CHECKs or the per-parent
 * position uniqueness, so we generate constraint-valid data directly.
 *
 * Deterministic: a seeded PRNG (no Math.random) makes every run reproducible.
 * Destructive for the tables it owns — it wipes users + the whole workout tree
 * first (via cascade), then rebuilds. It does NOT touch the exercises catalog.
 */

const NUM_USERS = 10;
const WORKOUTS_PER_USER = 20;

// ---- deterministic PRNG (mulberry32) --------------------------------------
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = makeRng(1337);
const randInt = (min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1));
const pick = <T>(arr: T[]): T => arr[randInt(0, arr.length - 1)];
const chance = (p: number) => rng() < p;
// numeric columns take strings in drizzle-orm; round to 2 decimals like numeric(5,2)
const money = (n: number) => n.toFixed(2);

const WORKOUT_TITLES = [
  "Push Day",
  "Pull Day",
  "Leg Day",
  "Upper Body",
  "Full Body",
  "Chest & Triceps",
  "Back & Biceps",
];

async function main() {
  const db = drizzle(process.env.DATABASE_URL!);

  // Load the seeded catalog so we branch on the real type / is_bodyweight.
  const catalog = await db
    .select({
      id: exercisesTable.id,
      type: exercisesTable.type,
      isBodyweight: exercisesTable.isBodyweight,
    })
    .from(exercisesTable);

  if (catalog.length === 0) {
    throw new Error("No exercises in DB — run the catalog seed first.");
  }

  // Wipe generated data. Deleting users cascades to workouts -> exercise_workout
  // -> sets -> dropsets, plus user_weight / user_stats / user_settings.
  console.log("Resetting generated tables (users cascade)...");
  await db.delete(users);

  for (let u = 0; u < NUM_USERS; u++) {
    const [user] = await db
      .insert(users)
      .values({
        username: `lifter_${u + 1}`,
        email: `lifter_${u + 1}@example.com`,
        passwordHash: "$2a$10$dummyhashdummyhashdummyhashdum", // not a real hash
      })
      .returning({ id: users.id });

    await db.insert(userSettings).values({ userId: user.id });
    await db.insert(userStats).values({
      userId: user.id,
      heightCm: money(randInt(155, 195)),
      birthDate: `${randInt(1975, 2005)}-${String(randInt(1, 12)).padStart(
        2,
        "0"
      )}-${String(randInt(1, 28)).padStart(2, "0")}`,
    });

    // Bodyweight history: a starting weight that drifts a little over time.
    // Each weigh-in is a few weeks apart, spread backward over ~5 months so the
    // history reads as real weigh-ins (and supports weight-at-workout-date).
    const NUM_WEIGH_INS = 6;
    let bw = randInt(60, 95);
    const weightHistory: { createdAt: Date; weightKg: number }[] = [];
    for (let w = 0; w < NUM_WEIGH_INS; w++) {
      bw += randInt(-2, 2);
      // oldest first: w=0 is ~5 months ago, last is within the past ~2 weeks.
      const daysAgo = (NUM_WEIGH_INS - w) * randInt(20, 28) - randInt(0, 10);
      weightHistory.push({
        createdAt: new Date(Date.now() - daysAgo * 86_400_000),
        weightKg: bw,
      });
    }
    await db.insert(userWeight).values(
      weightHistory.map((h) => ({
        userId: user.id,
        weightKg: money(h.weightKg),
        createdAt: h.createdAt,
      }))
    );

    // Effective bodyweight for a given moment = the latest weigh-in at or before
    // it. Used so a workout's bodyweight dropsets reflect the weight at the time.
    const bodyweightAt = (when: Date) => {
      let val = weightHistory[0].weightKg;
      for (const h of weightHistory) {
        if (h.createdAt.getTime() <= when.getTime()) val = h.weightKg;
        else break;
      }
      return val;
    };

    for (let wk = 0; wk < WORKOUTS_PER_USER; wk++) {
      // Spread workouts backward over ~5 months, one every ~7-8 days.
      const daysAgo = (WORKOUTS_PER_USER - wk) * randInt(6, 9);
      const started = new Date(Date.now() - daysAgo * 86_400_000);
      const finished = new Date(started.getTime() + randInt(35, 75) * 60_000);

      const [workout] = await db
        .insert(workouts)
        .values({
          userId: user.id,
          title: pick(WORKOUT_TITLES),
          startedAt: started,
          finishedAt: finished,
        })
        .returning({ id: workouts.id });

      // Bodyweight as it was on the day of this workout, not today's.
      const workoutBw = bodyweightAt(started);

      // 3-6 exercises per workout, distinct, in order.
      const shuffled = [...catalog].sort(() => rng() - 0.5);
      const chosen = shuffled.slice(0, randInt(3, 6));

      for (let ei = 0; ei < chosen.length; ei++) {
        const ex = chosen[ei];
        const [ew] = await db
          .insert(exerciseWorkout)
          .values({ exerciseId: ex.id, workoutId: workout.id, position: ei })
          .returning({ id: exerciseWorkout.id });

        // 2-4 sets per exercise.
        const numSets = randInt(2, 4);
        for (let si = 0; si < numSets; si++) {
          const [set] = await db
            .insert(sets)
            .values({ exerciseWorkoutId: ew.id, position: si })
            .returning({ id: sets.id });

          // 1-2 dropsets per set (a plain set = 1 dropset).
          const numDrops = chance(0.25) ? 2 : 1;
          const dropRows = [];
          for (let di = 0; di < numDrops; di++) {
            dropRows.push(buildDropset(ex, workoutBw, set.id, di));
          }
          await db.insert(dropsets).values(dropRows);
        }
      }
    }
    console.log(`  user ${u + 1}/${NUM_USERS} done`);
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(dropsets);
  console.log(`Seed complete. ${count} dropsets across ${NUM_USERS} users.`);
  process.exit(0);
}

/**
 * Build one constraint-valid dropset for the given exercise.
 * - duration exercises: durationSec set, reps null.
 * - weight_and_reps: reps set, durationSec null.
 * - bodyweight: loadKg = snapshot bodyweight; optionally assistance XOR resistance.
 * - non-bodyweight: loadKg = external plate weight; no assistance/resistance.
 */
function buildDropset(
  ex: { type: "weight_and_reps" | "duration"; isBodyweight: boolean },
  bodyweight: number,
  setId: string,
  position: number
): typeof dropsets.$inferInsert {
  const base: typeof dropsets.$inferInsert = {
    setId,
    position,
    reps: null,
    durationSec: null,
    loadKg: "0",
    assistance: "0",
    resistance: "0",
  };

  if (ex.type === "duration") {
    base.durationSec = randInt(20, 120);
  } else {
    base.reps = randInt(4, 15);
  }

  if (ex.isBodyweight) {
    base.loadKg = money(bodyweight);
    // sometimes add resistance (weighted) OR assistance (assisted) — never both.
    if (chance(0.2)) base.resistance = money(randInt(5, 25));
    else if (chance(0.2)) base.assistance = money(randInt(5, 30));
  } else {
    base.loadKg = money(randInt(20, 140));
  }

  return base;
}

main().catch((err) => {
  console.error("Dummy seed failed:", err);
  process.exit(1);
});
