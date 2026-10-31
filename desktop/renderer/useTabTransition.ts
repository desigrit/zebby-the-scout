import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

// Snapshot only the workspace. The sidebar and ongoing analysis stay live.
export function useTabTransition<T extends string>(initial: T) {
  const [tab, setTab] = useState(initial);
  const current = useRef(initial), sequence = useRef(0), transition = useRef<ViewTransition | null>(null);
  const pendingTab = useRef<T | null>(null);
  const changeTab = useCallback((next: T) => {
    if (current.current === next) return;
    current.current = next;
    const intent = ++sequence.current;
    transition.current?.skipTransition();
    if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      pendingTab.current = null;
      setTab(next); return;
    }
    pendingTab.current = next;
    const pending = document.startViewTransition(() => {
      // A skipped transition still calls its update. Only the latest click wins.
      if (sequence.current === intent) {
        pendingTab.current = null;
        flushSync(() => setTab(next));
      }
    });
    transition.current = pending;
    void pending.ready.catch(() => undefined);
    void pending.finished.catch(() => undefined).finally(() => {
      if (transition.current === pending) transition.current = null;
    });
  }, []);
  const settleTab = useCallback(() => {
    const next = pendingTab.current;
    if (next === null) return;
    pendingTab.current = null;
    sequence.current++;
    transition.current?.skipTransition();
    // A shortcut immediately after navigation belongs to the destination page,
    // even while Chromium is still capturing the outgoing page's snapshot.
    flushSync(() => setTab(next));
  }, []);
  useEffect(() => () => { sequence.current++; pendingTab.current = null; transition.current?.skipTransition(); }, []);
  return [tab, changeTab, settleTab] as const;
}
