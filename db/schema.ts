import { index, integer, pgTable, text } from "drizzle-orm/pg-core";

export const resumes = pgTable(
  "resumes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    objectKey: text("object_key").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_resumes_user_created").on(table.userId, table.createdAt)],
);

export const applications = pgTable(
  "applications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    company: text("company").notNull(),
    title: text("title").notNull(),
    team: text("team").notNull().default(""),
    locations: text("locations").notNull().default(""),
    listingUrl: text("listing_url").notNull(),
    appliedDate: text("applied_date").notNull(),
    matchStrength: integer("match_strength").notNull(),
    resumeId: text("resume_id")
      .notNull()
      .references(() => resumes.id),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_applications_user_date").on(table.userId, table.appliedDate),
  ],
);
