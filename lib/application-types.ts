export const APPLICATION_STATUSES = [
  "Applied",
  "Heard back",
  "Interview scheduled",
  "Rejected",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type Resume = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
};

export type Application = {
  id: string;
  company: string;
  title: string;
  team: string;
  locations: string;
  listingUrl: string;
  jobDescription: string;
  notes: string;
  snapshotText: string;
  snapshotCapturedAt: string;
  snapshotSource: "page" | "manual" | "saved" | "";
  appliedDate: string;
  matchStrength: number | null;
  matchNotes: string;
  matchAnalyzedAt: string;
  resumeId: string;
  resumeName: string;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
};

export type ApplicationInput = Pick<
  Application,
  | "company"
  | "title"
  | "team"
  | "locations"
  | "listingUrl"
  | "jobDescription"
  | "notes"
  | "snapshotText"
  | "snapshotSource"
  | "appliedDate"
  | "matchStrength"
  | "resumeId"
  | "status"
>;
