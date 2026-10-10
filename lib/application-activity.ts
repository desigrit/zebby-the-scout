import { APPLICATION_STATUSES, type Application, type ApplicationStatus } from "./application-types.ts";

export type ApplicationDay = { date: string; count: number; statuses: Record<ApplicationStatus, number> };

function emptyStatuses(): ApplicationDay["statuses"] {
  return { Applied: 0, "Heard back": 0, "Interview scheduled": 0, Rejected: 0 };
}

export function applicationActivity(applications: Pick<Application, "appliedDate" | "status">[], today: string): ApplicationDay[] {
  const counts = new Map<string, ApplicationDay["statuses"]>();
  for (const application of applications) {
    if (!application.appliedDate) continue;
    const statuses = counts.get(application.appliedDate) || emptyStatuses();
    statuses[application.status] += 1;
    counts.set(application.appliedDate, statuses);
  }
  const end = new Date(`${today}T12:00:00`);
  return Array.from({ length: 30 }, (_, index) => {
    const day = new Date(end);
    day.setDate(day.getDate() - 29 + index);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const statuses = counts.get(date) || emptyStatuses();
    return { date, count: APPLICATION_STATUSES.reduce((sum, status) => sum + statuses[status], 0), statuses };
  });
}
