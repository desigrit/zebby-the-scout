import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, RotateCw } from "lucide-react";

const SavedContext = createContext<() => void>(() => undefined);

export function SavedFeedbackProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saved = useCallback(() => {
    clearTimeout(timer.current);
    setVisible(true);
    timer.current = setTimeout(() => setVisible(false), 2200);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return <SavedContext.Provider value={saved}>{children}
    <div className="workspace-save-feedback" role="status" aria-live="polite" aria-atomic="true">
      {visible && <span><Check size={13} strokeWidth={1.5} aria-hidden="true" />Saved</span>}
    </div>
  </SavedContext.Provider>;
}

export const useSavedFeedback = () => useContext(SavedContext);

export function ErrorBanner({ message, retry, busy = false, className = "form-error", recovery }: {
  message: string; retry?: () => void; busy?: boolean; className?: string; recovery?: ReactNode;
}) {
  if (!message) return null;
  return <div className={`${className} retry-banner`} role="alert"><span>{message}</span>
    <span className="banner-actions">{recovery}{retry && <button type="button" className="banner-retry" disabled={busy} onClick={retry}>
      <RotateCw size={15} strokeWidth={1.5} className={busy ? "spin" : undefined} aria-hidden="true" />Try again
    </button>}</span>
  </div>;
}
