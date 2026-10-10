import { LoaderCircle, type LucideIcon } from "lucide-react";
import type { ComponentPropsWithRef } from "react";

type SettingsActionProps = ComponentPropsWithRef<"button"> & {
  variant?: "primary" | "secondary" | "danger";
  icon?: LucideIcon;
  busy?: boolean;
  iconOnly?: boolean;
};

export default function SettingsAction({ children, variant = "secondary", icon: Icon, busy = false,
  iconOnly = false, className = "", type = "button", disabled, ...props }: SettingsActionProps) {
  return <button {...props} type={type} disabled={disabled || busy} aria-busy={busy || undefined}
    className={`button button-${variant === "danger" ? "secondary" : variant} settings-action${variant === "danger" ? " settings-action-danger" : ""}${iconOnly ? " settings-action-icon" : ""}${className ? ` ${className}` : ""}`}>
    {busy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : Icon && <Icon size={16} aria-hidden="true" />}
    {children}
  </button>;
}
