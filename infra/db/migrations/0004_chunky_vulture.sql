CREATE TABLE "hospital_poc_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"hospital_id" text NOT NULL,
	"display_name" text DEFAULT 'POC hospitalario' NOT NULL,
	"role" text DEFAULT 'hospital_poc' NOT NULL,
	"restricted_contact" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hospital_supply_events" (
	"id" text PRIMARY KEY NOT NULL,
	"hospital_id" text NOT NULL,
	"category" text,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"action" text NOT NULL,
	"actor" text DEFAULT 'equipo_operativo' NOT NULL,
	"source" text DEFAULT 'admin_panel' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hospital_supply_help_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"hospital_id" text NOT NULL,
	"category" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"urgency" text DEFAULT 'yellow' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"requested_by" text DEFAULT 'poc_hospitalario' NOT NULL,
	"source" text DEFAULT 'admin_panel' NOT NULL,
	"restricted_note" text DEFAULT '' NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hospital_supply_needs" (
	"id" text PRIMARY KEY NOT NULL,
	"hospital_id" text NOT NULL,
	"category" text NOT NULL,
	"item_type" text NOT NULL,
	"quantity" integer,
	"unit" text DEFAULT '' NOT NULL,
	"urgency" text DEFAULT 'yellow' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"public_note" text DEFAULT '' NOT NULL,
	"restricted_note" text DEFAULT '' NOT NULL,
	"last_confirmed_at" bigint NOT NULL,
	"updated_by" text DEFAULT 'equipo_operativo' NOT NULL,
	"source" text DEFAULT 'admin_panel' NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hospital_supply_statuses" (
	"id" text PRIMARY KEY NOT NULL,
	"hospital_id" text NOT NULL,
	"category" text NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"public_note" text DEFAULT '' NOT NULL,
	"restricted_note" text DEFAULT '' NOT NULL,
	"stale_after_hours" integer DEFAULT 12 NOT NULL,
	"last_updated_at" bigint NOT NULL,
	"last_confirmed_at" bigint NOT NULL,
	"updated_by" text DEFAULT 'equipo_operativo' NOT NULL,
	"source" text DEFAULT 'admin_panel' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hospital_poc_assignments" ADD CONSTRAINT "hospital_poc_assignments_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hospital_supply_events" ADD CONSTRAINT "hospital_supply_events_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hospital_supply_help_requests" ADD CONSTRAINT "hospital_supply_help_requests_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hospital_supply_needs" ADD CONSTRAINT "hospital_supply_needs_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hospital_supply_statuses" ADD CONSTRAINT "hospital_supply_statuses_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_hospital_poc_assignments_hospital" ON "hospital_poc_assignments" USING btree ("hospital_id","active");--> statement-breakpoint
CREATE INDEX "idx_hospital_supply_events_hospital" ON "hospital_supply_events" USING btree ("hospital_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_hospital_supply_events_entity" ON "hospital_supply_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_hospital_supply_help_open" ON "hospital_supply_help_requests" USING btree ("status","urgency","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_hospital_supply_help_hospital" ON "hospital_supply_help_requests" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_hospital_supply_needs_active" ON "hospital_supply_needs" USING btree ("hospital_id","status","urgency","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_hospital_supply_needs_category" ON "hospital_supply_needs" USING btree ("category","status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_hospital_supply_status_unique" ON "hospital_supply_statuses" USING btree ("hospital_id","category");--> statement-breakpoint
CREATE INDEX "idx_hospital_supply_status_stale" ON "hospital_supply_statuses" USING btree ("category","status","last_confirmed_at");--> statement-breakpoint
CREATE INDEX "idx_hospital_supply_status_hospital" ON "hospital_supply_statuses" USING btree ("hospital_id");