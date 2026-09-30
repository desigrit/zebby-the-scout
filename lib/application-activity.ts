import type { Application } from "./application-types";

export type ApplicationDay = { date: string; count: number };

export function applicationActivity(applications: Pick<Application, "appliedDate">[], today: string): ApplicationDay[] {
  const counts = new Map<string, number>();
  for (const application of applications) {
    if (application.appliedDate) counts.set(application.appliedDate, (counts.get(application.appliedDate) || 0) + 1);
  }
  const end = new Date(`${today}T12:00:00`);
  return Array.from({ length: 30 }, (_, index) => {
    const day = new Date(end);
    day.setDate(day.getDate() - 29 + index);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    return { date, count: counts.get(date) || 0 };
  });
}
