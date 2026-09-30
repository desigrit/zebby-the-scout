import { z } from "zod";
import { MAX_APPLICATION_NOTES_CHARS } from "./application-types";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});

export const applicationInputSchema = z.object({
  company: z.string().trim().max(120).default(""),
  title: z.string().trim().max(160).default(""),
  team: z.string().trim().max(160).default(""),
  locations: z.string().trim().max(500).default(""),
  listingUrl: z.string().trim().max(2000).refine((value) => {
    if (!value) return true;
    try {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch { return false; }
  }).default(""),
  jobDescription: z.string().trim().max(80_000).default(""),
  notes: z.string().max(MAX_APPLICATION_NOTES_CHARS).default(""),
  snapshotText: z.string().trim().max(80_000).default(""),
  snapshotSource: z.enum(["page", "manual", "saved", ""]).default(""),
  appliedDate: z.union([z.literal(""), dateSchema]).default(""),
  matchStrength: z.number().int().min(0).max(100).nullable().default(null),
  resumeId: z.union([z.literal(""), z.string().uuid()]).default(""),
  status: z.enum(["Applied", "Heard back", "Interview scheduled", "Rejected"]).default("Applied"),
});
