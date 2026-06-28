CREATE TABLE "missing_person_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"normalized_name" text DEFAULT '' NOT NULL,
	"representative_area" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"report_count" integer DEFAULT 0 NOT NULL,
	"has_identity_document" boolean DEFAULT false NOT NULL,
	"status_conflict" boolean DEFAULT false NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missing_person_image_hashes" (
	"photo_hash" text PRIMARY KEY NOT NULL,
	"missing_person_id" text NOT NULL,
	"purpose" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "missing_persons" ADD COLUMN "person_group_id" text;--> statement-breakpoint
ALTER TABLE "missing_persons" ADD COLUMN "group_match_kind" text;--> statement-breakpoint
ALTER TABLE "missing_persons" ADD COLUMN "photo_hash" text;--> statement-breakpoint
ALTER TABLE "missing_persons" ADD COLUMN "resolution_photo_hash" text;--> statement-breakpoint
ALTER TABLE "missing_persons" ADD COLUMN "identity_document_hash" text;--> statement-breakpoint
ALTER TABLE "missing_person_image_hashes" ADD CONSTRAINT "missing_person_image_hashes_missing_person_id_missing_persons_id_fk" FOREIGN KEY ("missing_person_id") REFERENCES "public"."missing_persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_missing_person_groups_status" ON "missing_person_groups" USING btree ("status","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_missing_person_groups_name" ON "missing_person_groups" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "idx_missing_image_hash_person" ON "missing_person_image_hashes" USING btree ("missing_person_id","purpose");--> statement-breakpoint
CREATE INDEX "idx_missing_person_group" ON "missing_persons" USING btree ("person_group_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_missing_photo_hash" ON "missing_persons" USING btree ("photo_hash");--> statement-breakpoint
CREATE INDEX "idx_missing_resolution_photo_hash" ON "missing_persons" USING btree ("resolution_photo_hash");--> statement-breakpoint
CREATE INDEX "idx_missing_identity_document_hash" ON "missing_persons" USING btree ("identity_document_hash");