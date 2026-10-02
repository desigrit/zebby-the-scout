import { useEffect } from "react";

// App-local commands. Standard editing shortcuts remain native to Electron.
export function useWorkspaceShortcuts() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mac = window.desktop && document.querySelector(".platform-mac");
      if (!(mac ? event.metaKey : event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (document.querySelector("dialog[open]")) return;
      const command = ({ n: "new", s: "save", f: "search" } as Record<string, string>)[event.key.toLowerCase()];
      if (!command) return;
      event.preventDefault();
      const control = document.querySelector<HTMLElement>(`[data-command="${command}"]:not(:disabled)`);
      if (!control) return;
      if (control instanceof HTMLInputElement) {
        if (control.offsetParent === null) {
          document.querySelector<HTMLButtonElement>('[data-command="search-toggle"]')?.click();
          requestAnimationFrame(() => { control.focus(); control.select(); });
        } else { control.focus(); control.select(); }
      }
      else control.click();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}

export function useInteractiveScrollbars() {
  useEffect(() => {
    const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
    const onScroll = (event: Event) => {
      if (!(event.target instanceof HTMLElement)) return;
      const target = event.target;
      target.dataset.scrolling = "true";
      clearTimeout(timers.get(target));
      timers.set(target, setTimeout(() => { delete target.dataset.scrolling; timers.delete(target); }, 900));
    };
    document.addEventListener("scroll", onScroll, true);
    return () => { document.removeEventListener("scroll", onScroll, true); for (const timer of timers.values()) clearTimeout(timer); };
  }, []);
}
