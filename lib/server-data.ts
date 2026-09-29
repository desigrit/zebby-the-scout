import { env } from "cloudflare:workers";
import { z } from "zod";
import type { Application, Resume } from "./application-types";

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

export function database(): D1Database {
  if (!env.DB) throw new Error("Application database is unavailable");
  return env.DB;
}

export function resumeBucket(): R2Bucket {
  if (!env.BUCKET) throw new Error("Resume storage is unavailable");
  return env.BUCKET;
}

export async function ownsResume(userId: string, resumeId: string) {
  const row = await database()
    .prepare("SELECT id FROM resumes WHERE id = ? AND user_id = ?")
    .bind(resumeId, userId)
    .first<{ id: string }>();
  return Boolean(row);
}

export function mapApplication(row: Record<string, unknown>): Application {
  return {
    id: String(row.id),
    company: String(row.company),
    title: String(row.title),
    team: String(row.team ?? ""),
    locations: String(row.locations ?? ""),
    listingUrl: String(row.listing_url),
    appliedDate: String(row.applied_date),
    matchStrength: Number(row.match_strength),
    resumeId: String(row.resume_id),
    resumeName: String(row.resume_name),
    status: row.status as Application["status"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapResume(row: Record<string, unknown>): Resume {
  return {
    id: String(row.id),
    filename: String(row.filename),
    contentType: String(row.content_type),
    size: Number(row.size),
    createdAt: String(row.created_at),
  };
}

export async function findApplication(userId: string, id: string) {
  const row = await database()
    .prepare(`SELECT a.*, r.filename AS resume_name
      FROM applications a JOIN resumes r ON r.id = a.resume_id
      WHERE a.id = ? AND a.user_id = ?`)
    .bind(id, userId)
    .first<Record<string, unknown>>();
  return row ? mapApplication(row) : null;
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
