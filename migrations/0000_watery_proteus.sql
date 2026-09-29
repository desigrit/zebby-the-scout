CREATE TABLE "applications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company" text NOT NULL,
	"title" text NOT NULL,
	"team" text DEFAULT '' NOT NULL,
	"locations" text DEFAULT '' NOT NULL,
	"listing_url" text NOT NULL,
	"applied_date" text NOT NULL,
	"match_strength" integer NOT NULL,
	"resume_id" text NOT NULL,
	"status" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"object_key" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_applications_user_date" ON "applications" USING btree ("user_id","applied_date");--> statement-breakpoint
CREATE INDEX "idx_resumes_user_created" ON "resumes" USING btree ("user_id","created_at");