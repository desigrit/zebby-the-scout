import { Download, LoaderCircle, RefreshCw } from "lucide-react";
import type { UpdateState } from "../release-updates";

export default function UpdateButton({ updates, collapsed = false, working = false, onClick }: {
  updates: UpdateState; collapsed?: boolean; working?: boolean; onClick: () => void;
}) {
  if (!updates.available) return null;
  const phase = updates.download.phase;
  const busy = ["downloading", "verifying", "installing"].includes(phase);
  const percent = updates.download.total ? Math.min(100, Math.floor(updates.download.received * 100 / updates.download.total)) : 0;
  const label = phase === "ready" ? "Restart to update" : phase === "downloading" ? `Downloading ${percent}%`
    : phase === "verifying" ? "Preparing update" : phase === "installing" ? "Restarting"
    : phase === "error" ? "Retry update" : `Update to ${updates.available.version}`;
  return <button className={`button button-secondary update-button${collapsed ? " update-button-collapsed" : ""}`}
    type="button" onClick={onClick} disabled={working || busy} aria-label={label} title={collapsed ? label : undefined}>
    {busy ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : phase === "ready"
      ? <RefreshCw size={18} aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
    {!collapsed && <span>{label}</span>}
  </button>;
}
