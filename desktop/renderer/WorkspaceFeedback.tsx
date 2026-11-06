import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { RotateCw } from "lucide-react";

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
    <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {visible ? "Saved" : ""}
    </div>
  </SavedContext.Provider>;
}

export const useSavedFeedback = () => useContext(SavedContext);

type ErrorVariant = "banner" | "inline";
const ErrorStyleContext = createContext<ErrorVariant>("banner");

export function ErrorStyleProvider({ variant, children }: { variant: ErrorVariant; children: ReactNode }) {
  return <ErrorStyleContext.Provider value={variant}>{children}</ErrorStyleContext.Provider>;
}

export function ErrorBanner({ message, retry, busy = false, className = "form-error", recovery, variant, id }: {
  message: string; retry?: () => void; busy?: boolean; className?: string; recovery?: ReactNode; variant?: ErrorVariant; id?: string;
}) {
  const inheritedVariant = useContext(ErrorStyleContext);
  const inline = (variant || inheritedVariant) === "inline";
  if (!message) return null;
  const readableMessage = message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
  return <div id={id} className={`${inline ? "inline-error" : className} retry-banner`} role="alert"><span>{readableMessage}</span>
    {(recovery || retry) && <span className="banner-actions">{recovery}{retry && <button type="button" className="banner-retry" disabled={busy} onClick={retry}>
      <RotateCw size={inline ? 14 : 15} strokeWidth={1.5} className={busy ? "spin" : undefined} aria-hidden="true" />{inline ? "Retry" : "Try again"}
    </button>}</span>}
  </div>;
}
