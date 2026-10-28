import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

// Snapshot only the workspace. The sidebar and ongoing analysis stay live.
export function useTabTransition<T extends string>(initial: T) {
  const [tab, setTab] = useState(initial);
  const current = useRef(initial), sequence = useRef(0), transition = useRef<ViewTransition | null>(null);
  const changeTab = useCallback((next: T) => {
    if (current.current === next) return;
    current.current = next;
    const intent = ++sequence.current;
    transition.current?.skipTransition();
    if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTab(next); return;
    }
    const pending = document.startViewTransition(() => {
      // A skipped transition still calls its update. Only the latest click wins.
      if (sequence.current === intent) flushSync(() => setTab(next));
    });
    transition.current = pending;
    void pending.ready.catch(() => undefined);
    void pending.finished.catch(() => undefined).finally(() => {
      if (transition.current === pending) transition.current = null;
    });
  }, []);
  useEffect(() => () => { sequence.current++; transition.current?.skipTransition(); }, []);
  return [tab, changeTab] as const;
}
