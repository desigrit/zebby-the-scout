import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { APPLICATION_STATUSES, REJECTION_STAGES, type ApplicationOutcome, type ApplicationStatus, type RejectionStage } from "../../lib/application-types";

type Props = {
  value: ApplicationOutcome;
  onChange: (outcome: ApplicationOutcome) => void;
  label: string;
  disabled?: boolean;
  compact?: boolean;
};

function Choice({ value, label = value }: { value: string; label?: string }) {
  return <Menu.RadioItem className="status-menu-item" value={value}>
    {label}<Menu.ItemIndicator><Check size={14} aria-hidden="true" /></Menu.ItemIndicator>
  </Menu.RadioItem>;
}

export default function ApplicationStatusPicker({ value, onChange, label, disabled, compact }: Props) {
  const { status, rejectionStage } = value;
  const stage = status === "Rejected" ? rejectionStage : null;
  const caption = stage ? `${status} · ${stage}` : status;
  return <Menu.Root modal={false}>
    <Menu.Trigger type="button" disabled={disabled} className={compact ? "status-select" : "status-field"}
      data-status={status} data-staged={stage ? "true" : undefined} aria-label={`${label}, ${caption}`} title={caption}>
      <span className="status-selection">{status}{stage && <small>{stage}</small>}</span>
      <ChevronDown size={14} aria-hidden="true" />
    </Menu.Trigger>
    <Menu.Portal><Menu.Content className="status-menu" align="start" sideOffset={4} collisionPadding={8}>
      <Menu.RadioGroup value={status} onValueChange={(next) => onChange({ status: next as ApplicationStatus, rejectionStage: null })}>
        {APPLICATION_STATUSES.map((option) => option === "Rejected" ? <Menu.Sub key={option}>
          <Menu.SubTrigger className="status-menu-item">{option}<ChevronRight size={14} aria-hidden="true" /></Menu.SubTrigger>
          <Menu.Portal><Menu.SubContent className="status-menu" sideOffset={3} collisionPadding={8}>
            <Menu.RadioGroup value={status === "Rejected" ? stage ?? "" : undefined}
              onValueChange={(next) => onChange({ status: "Rejected", rejectionStage: next ? next as RejectionStage : null })}>
              {REJECTION_STAGES.map((stageName) => <Choice key={stageName} value={stageName} />)}
              <Menu.Separator className="status-menu-separator" />
              <Choice value="" label="Stage unspecified" />
            </Menu.RadioGroup>
          </Menu.SubContent></Menu.Portal>
        </Menu.Sub> : <Choice key={option} value={option} />)}
      </Menu.RadioGroup>
    </Menu.Content></Menu.Portal>
  </Menu.Root>;
}
