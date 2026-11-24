export const APPLICATION_STATUSES = [
  "Applied",
  "Heard back",
  "Interview scheduled",
  "Rejected",
  "Offer received",
] as const;

export const MAX_APPLICATION_NOTES_CHARS = 200_000;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const REJECTION_STAGES = [
  "After application",
  "After recruiter screen",
  "After pre-loop",
  "After full loop",
] as const;
export type RejectionStage = (typeof REJECTION_STAGES)[number];

export type ApplicationOutcome = {
  status: ApplicationStatus;
  rejectionStage?: RejectionStage | null;
};

export type Resume = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
};

export type Application = ApplicationOutcome & {
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
  | "rejectionStage"
>;
