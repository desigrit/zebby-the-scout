import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ApplicationDay } from "../../lib/application-activity";
import { APPLICATION_STATUSES } from "../../lib/application-types";

function dayLabel(date: string, long = false) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", ...(long ? { year: "numeric" } : {}) })
    .format(new Date(`${date}T12:00:00`));
}

function positionTooltip(button: HTMLButtonElement | null, bars: HTMLDivElement | null) {
  const tooltip = button?.querySelector<HTMLElement>(".activity-tooltip");
  if (!button || !bars || !tooltip) return;
  const bounds = bars.getBoundingClientRect(), anchor = button.getBoundingClientRect();
  tooltip.style.maxWidth = `${bounds.width}px`;
  const width = tooltip.getBoundingClientRect().width;
  const left = Math.max(bounds.left, Math.min(anchor.left + anchor.width / 2 - width / 2, bounds.right - width));
  tooltip.style.left = `${left - anchor.left}px`;
  tooltip.style.transform = "none";
}

export default function ApplicationActivity({ days }: { days: ApplicationDay[] }) {
  const [focusedDay, setFocusedDay] = useState(Math.max(0, days.length - 1));
  const [tooltipDismissed, setTooltipDismissed] = useState(false);
  const barsRef = useRef<HTMLDivElement>(null);
  const activeDayRef = useRef<HTMLButtonElement>(null);
  const maximum = Math.max(1, ...days.map((day) => day.count));
  const total = days.reduce((sum, day) => sum + day.count, 0);
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") setTooltipDismissed(true); };
    const observer = new ResizeObserver(() => positionTooltip(activeDayRef.current, barsRef.current));
    if (barsRef.current) observer.observe(barsRef.current);
    document.addEventListener("keydown", dismiss);
    return () => { observer.disconnect(); document.removeEventListener("keydown", dismiss); };
  }, []);
  useLayoutEffect(() => { positionTooltip(activeDayRef.current, barsRef.current); }, [days]);

  return <figure className="application-activity" aria-label="Applications by applied date and current status over the last 30 days">
    <figcaption className="activity-caption"><span>Application activity</span>
      <span>{total} {total === 1 ? "application" : "applications"} <span className="activity-period">in the last 30 days</span></span>
    </figcaption>
    <div className="activity-bars" ref={barsRef} data-tooltip-dismissed={tooltipDismissed || undefined}>
      {days.map((day, index) => <button className={`activity-day ${day.count ? "has-applications" : ""}`}
        key={day.date} data-date={day.date} type="button" tabIndex={index === focusedDay ? 0 : -1}
        aria-label={`${dayLabel(day.date, true)}: ${day.count} ${day.count === 1 ? "application" : "applications"}${APPLICATION_STATUSES.filter((status) => day.statuses[status]).map((status) => `, ${status}: ${day.statuses[status]}`).join("")}`}
        onFocus={(event) => { activeDayRef.current = event.currentTarget; positionTooltip(event.currentTarget, barsRef.current);
          setFocusedDay(index); setTooltipDismissed(false); }}
        onMouseEnter={(event) => { activeDayRef.current = event.currentTarget; positionTooltip(event.currentTarget, barsRef.current); setTooltipDismissed(false); }}
        onKeyDown={(event) => {
          const next = event.key === "ArrowLeft" ? Math.max(0, index - 1)
            : event.key === "ArrowRight" ? Math.min(days.length - 1, index + 1)
              : event.key === "Home" ? 0 : event.key === "End" ? days.length - 1 : null;
          if (next === null) return;
          event.preventDefault();
          (barsRef.current?.children[next] as HTMLButtonElement | undefined)?.focus();
        }}>
        <span className="activity-bar" style={{ height: `${day.count ? day.count / maximum * 100 : 4}%` }} aria-hidden="true">
          {APPLICATION_STATUSES.filter((status) => day.statuses[status]).map((status) =>
            <span className="activity-segment" data-status={status} data-count={day.statuses[status]} key={status}
              style={{ flexGrow: day.statuses[status] }} />)}
        </span>
        <span className="activity-tooltip" aria-hidden="true"><strong>{dayLabel(day.date)}</strong>
          <span>{day.count} {day.count === 1 ? "application" : "applications"}</span>
          {day.count > 0 && <span className="activity-tooltip-statuses">{APPLICATION_STATUSES.map((status) =>
            <span key={status}><span className="activity-swatch" data-status={status} />{status}<b>{day.statuses[status]}</b></span>)}</span>}
        </span>
      </button>)}
    </div>
    {days.length > 0 && <div className="activity-axis" aria-hidden="true"><span>{dayLabel(days[0].date)}</span>
      <span>{dayLabel(days[Math.floor((days.length - 1) / 2)].date)}</span><span>Today</span></div>}
    <div className="activity-legend" aria-label="Current status">
      {APPLICATION_STATUSES.map((status) => <span key={status}><span className="activity-swatch" data-status={status} aria-hidden="true" />{status}</span>)}
    </div>
  </figure>;
}
