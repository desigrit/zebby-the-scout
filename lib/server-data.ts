import { Pool, type QueryResultRow } from "pg";
import { BlobServiceClient } from "@azure/storage-blob";
import type { Application, Resume } from "./application-types";
import { applicationInputSchema as desktopApplicationInputSchema } from "./application-validation";

export const applicationInputSchema = desktopApplicationInputSchema.refine((item) =>
  Boolean(item.company && item.title && item.listingUrl && item.appliedDate &&
    item.matchStrength !== null && item.resumeId),
  "Complete all application fields for the web version.");

let pool: Pool | undefined;
let blobService: BlobServiceClient | undefined;

export function database(): Pool {
  const url = process.env.DATABASE_URL;
  const host = process.env.PGHOST;
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  if (!url && !(host && user && password)) {
    throw new Error("Application database is unavailable");
  }
  pool ??= new Pool({
    ...(url ? { connectionString: url } : {
      host,
      user,
      password,
      database: process.env.PGDATABASE || "postgres",
      port: 5432,
      ssl: { rejectUnauthorized: true },
    }),
    max: 4,
    connectionTimeoutMillis: 10_000,
  });
  return pool;
}

export function resumeContainer() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) throw new Error("Resume storage is unavailable");
  blobService ??= BlobServiceClient.fromConnectionString(connectionString);
  return blobService.getContainerClient("resumes");
}

export async function queryDatabase<T extends QueryResultRow>(
  statement: string,
  parameters: unknown[] = [],
): Promise<T[]> {
  const result = await database().query<T>(statement, parameters);
  return result.rows;
}

export async function ownsResume(userId: string, resumeId: string) {
  const rows = await queryDatabase<{ id: string }>(
    "SELECT id FROM resumes WHERE id = $1 AND user_id = $2",
    [resumeId, userId],
  );
  return rows.length > 0;
}

export function mapApplication(row: Record<string, unknown>): Application {
  return {
    id: String(row.id),
    company: String(row.company),
    title: String(row.title),
    team: String(row.team ?? ""),
    locations: String(row.locations ?? ""),
    listingUrl: String(row.listing_url),
    jobDescription: "",
    snapshotText: "",
    snapshotCapturedAt: "",
    snapshotSource: "",
    appliedDate: String(row.applied_date),
    matchStrength: Number(row.match_strength),
    matchNotes: "",
    matchAnalyzedAt: "",
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
  const rows = await queryDatabase<Record<string, unknown>>(`SELECT a.*, r.filename AS resume_name
      FROM applications a JOIN resumes r ON r.id = a.resume_id
      WHERE a.id = $1 AND a.user_id = $2`, [id, userId]);
  return rows[0] ? mapApplication(rows[0]) : null;
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
