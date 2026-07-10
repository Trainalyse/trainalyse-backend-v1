CREATE TYPE "public"."exercise_type" AS ENUM('weight_and_reps', 'duration');--> statement-breakpoint
CREATE TYPE "public"."height_unit" AS ENUM('cm', 'ft', 'in');--> statement-breakpoint
CREATE TYPE "public"."weight_unit" AS ENUM('kg', 'lb');--> statement-breakpoint
CREATE TABLE "dropsets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_id" uuid NOT NULL,
	"reps" smallint,
	"duration_sec" integer,
	"load_kg" numeric(5, 2) DEFAULT '0' NOT NULL,
	"assistance" numeric(5, 2) DEFAULT '0' NOT NULL,
	"resistance" numeric(5, 2) DEFAULT '0' NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "dropsets_position_uq" UNIQUE("set_id","position"),
	CONSTRAINT "chk_reps_xor_duration" CHECK (("dropsets"."reps" IS NULL) <> ("dropsets"."duration_sec" IS NULL)),
	CONSTRAINT "chk_assistance_resistance" CHECK (NOT ("dropsets"."assistance" > 0 AND "dropsets"."resistance" > 0)),
	CONSTRAINT "chk_reps_positive" CHECK ("dropsets"."reps" IS NULL OR "dropsets"."reps" > 0),
	CONSTRAINT "chk_duration_positive" CHECK ("dropsets"."duration_sec" IS NULL OR "dropsets"."duration_sec" > 0),
	CONSTRAINT "chk_loads_nonneg" CHECK ("dropsets"."load_kg" >= 0 AND "dropsets"."assistance" >= 0 AND "dropsets"."resistance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "exercise_workout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exercise_id" uuid NOT NULL,
	"workout_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "exercise_workout_position_uq" UNIQUE("workout_id","position")
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"type" "exercise_type" NOT NULL,
	"is_bodyweight" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exercise_workout_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "sets_position_uq" UNIQUE("exercise_workout_id","position")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"height_unit" "height_unit" DEFAULT 'cm' NOT NULL,
	"weight_unit" "weight_unit" DEFAULT 'kg' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_stats" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"height_cm" numeric(5, 2),
	"birth_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_height_positive" CHECK ("user_stats"."height_cm" IS NULL OR "user_stats"."height_cm" > 0)
);
--> statement-breakpoint
CREATE TABLE "user_weight" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"weight_kg" numeric(5, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_weight_positive" CHECK ("user_weight"."weight_kg" > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar NOT NULL,
	"email" varchar NOT NULL,
	"password_hash" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "dropsets" ADD CONSTRAINT "dropsets_set_id_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_workout" ADD CONSTRAINT "exercise_workout_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_workout" ADD CONSTRAINT "exercise_workout_workout_id_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_exercise_workout_id_exercise_workout_id_fk" FOREIGN KEY ("exercise_workout_id") REFERENCES "public"."exercise_workout"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_weight" ADD CONSTRAINT "user_weight_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_name_norm_uq" ON "exercises" USING btree (lower(regexp_replace("name", '\s+', '', 'g')));--> statement-breakpoint
CREATE INDEX "user_weight_user_created_idx" ON "user_weight" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "workouts_user_started_idx" ON "workouts" USING btree ("user_id","started_at");