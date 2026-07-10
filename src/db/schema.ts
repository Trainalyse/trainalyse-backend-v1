import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ---------------------------------------------------------------- enums */

export const heightUnit = pgEnum("height_unit", ["cm", "ft", "in"]);
export const weightUnit = pgEnum("weight_unit", ["kg", "lb"]);
export const exerciseType = pgEnum("exercise_type", [
  "weight_and_reps",
  "duration",
]);

/* ---------------------------------------------------------------- users */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username").unique().notNull(),
  email: varchar("email").unique().notNull(),
  passwordHash: varchar("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * One row per user, edited in place — height barely changes and birth_date
 * never does, so this isn't versioned (unlike user_weight).
 */
export const userStats = pgTable(
  "user_stats",
  {
    // 1:1 with user — user_id is the PK.
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    heightCm: numeric("height_cm", { precision: 5, scale: 2 }), // canonical, always cm
    birthDate: date("birth_date"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("chk_height_positive", sql`${t.heightCm} IS NULL OR ${t.heightCm} > 0`),
  ]
);

/**
 * Append-only history — this is what enables bodyweight-over-time and
 * resolving a workout's effective bodyweight at the time it was logged.
 */
export const userWeight = pgTable(
  "user_weight",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weightKg: numeric("weight_kg", { precision: 5, scale: 2 }).notNull(), // canonical, always kg
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("user_weight_user_created_idx").on(t.userId, t.createdAt),
    check("chk_weight_positive", sql`${t.weightKg} > 0`),
  ]
);

export const userSettings = pgTable("user_settings", {
  // 1:1 with user.
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  heightUnit: heightUnit("height_unit").notNull().default("cm"), // preferred display unit
  weightUnit: weightUnit("weight_unit").notNull().default("kg"), // preferred display unit
});

/* ------------------------------------------------------------- workouts */

export const workouts = pgTable(
  "workouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }) // row created
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }), // workout began
    finishedAt: timestamp("finished_at", { withTimezone: true }), // workout ended
  },
  (t) => [index("workouts_user_started_idx").on(t.userId, t.startedAt)]
);

/* ------------------------------------------------------------ exercises */

/** Global, seeded catalog. */
export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Stored as-is for display ("Dead Hang"). Uniqueness is enforced on a
    // normalized key (see below) so "Dead Hang" / "dead hang" / "dead  hang"
    // all collapse to the same exercise. Normalize at the app layer too, so
    // inserts fail fast rather than only tripping this index.
    name: varchar("name").notNull(),
    type: exerciseType("type").notNull(),
    isBodyweight: boolean("is_bodyweight").notNull(),
  },
  (t) => [
    // unique on lower(name) with all whitespace stripped
    uniqueIndex("exercises_name_norm_uq").on(
      sql`lower(regexp_replace(${t.name}, '\\s+', '', 'g'))`
    ),
  ]
);

export const exerciseWorkout = pgTable(
  "exercise_workout",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // restrict: a seeded exercise referenced by historical workouts can't be
    // deleted out from under them.
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    workoutId: uuid("workout_id")
      .notNull()
      .references(() => workouts.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
  },
  (t) => [
    // NOTE: this must be DEFERRABLE INITIALLY DEFERRED so reordering within one
    // transaction can hold transiently-duplicate positions and resolve by
    // COMMIT. drizzle-orm 0.45 can't declare deferrability on unique(), so a
    // follow-up .sql migration recreates this constraint as deferrable. See
    // src/db/migrations note.
    unique("exercise_workout_position_uq").on(t.workoutId, t.position),
  ]
);

export const sets = pgTable(
  "sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exerciseWorkoutId: uuid("exercise_workout_id")
      .notNull()
      .references(() => exerciseWorkout.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
  },
  (t) => [
    // deferrable — see exercise_workout note
    unique("sets_position_uq").on(t.exerciseWorkoutId, t.position),
  ]
);

export const dropsets = pgTable(
  "dropsets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    setId: uuid("set_id")
      .notNull()
      .references(() => sets.id, { onDelete: "cascade" }),
    // Exactly one of reps / durationSec is set (chk_reps_xor_duration).
    // reps-shaped rows belong to weight_and_reps exercises, duration-shaped to
    // duration exercises — that match is enforced in APP code, not the DB.
    reps: smallint("reps"),
    durationSec: integer("duration_sec"),
    loadKg: numeric("load_kg", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    assistance: numeric("assistance", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    resistance: numeric("resistance", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    position: smallint("position").notNull(),
  },
  (t) => [
    // deferrable — see exercise_workout note
    unique("dropsets_position_uq").on(t.setId, t.position),
    check(
      "chk_reps_xor_duration",
      sql`(${t.reps} IS NULL) <> (${t.durationSec} IS NULL)`
    ),
    check(
      "chk_assistance_resistance",
      sql`NOT (${t.assistance} > 0 AND ${t.resistance} > 0)`
    ),
    check("chk_reps_positive", sql`${t.reps} IS NULL OR ${t.reps} > 0`),
    check(
      "chk_duration_positive",
      sql`${t.durationSec} IS NULL OR ${t.durationSec} > 0`
    ),
    check(
      "chk_loads_nonneg",
      sql`${t.loadKg} >= 0 AND ${t.assistance} >= 0 AND ${t.resistance} >= 0`
    ),
  ]
);
