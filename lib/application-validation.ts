import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});

export const applicationInputSchema = z.object({
  company: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(160),
  team: z.string().trim().max(160).optional(),
  locations: z.string().trim().max(500).optional(),
  listingUrl: z.string().trim().url().max(2000).refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }),
  appliedDate: dateSchema,
  matchStrength: z.number().int().min(0).max(100),
  resumeId: z.string().uuid(),
  status: z.enum(["Applied", "Heard back", "Interview scheduled", "Rejected"]),
});
