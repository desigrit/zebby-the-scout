import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { AnalysisJobs } from "./analysis-jobs";

const Context = createContext<AnalysisJobs | null>(null);
export function BackgroundAnalysisProvider({ children }: { children: ReactNode }) {
  const [jobs] = useState(() => new AnalysisJobs((...args) => fetch(...args),
    (id) => window.desktop?.cancelAnalysis(id) ?? Promise.resolve(true)));
  useEffect(() => window.desktop?.onAnalysisProgress?.(jobs.progress), [jobs]);
  return <Context.Provider value={jobs}>{children}</Context.Provider>;
}
export function useBackgroundAnalysis() {
  const jobs = useContext(Context);
  if (!jobs) throw new Error("Analysis workspace is unavailable.");
  const snapshot = useSyncExternalStore(jobs.subscribe, jobs.snapshot);
  return { jobs, snapshot };
}
