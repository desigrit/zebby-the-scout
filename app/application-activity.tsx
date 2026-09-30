"use client";

import { useRef, useState } from "react";
import type { ApplicationDay } from "../lib/application-activity";

function dayLabel(date: string, long = false) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", ...(long ? { year: "numeric" } : {}) })
    .format(new Date(`${date}T12:00:00`));
}

export default function ApplicationActivity({ days }: { days: ApplicationDay[] }) {
  const [focusedDay, setFocusedDay] = useState(29);
  const barsRef = useRef<HTMLDivElement>(null);
  const maximum = Math.max(1, ...days.map((day) => day.count));
  const total = days.reduce((sum, day) => sum + day.count, 0);

  return <figure className="application-activity" aria-label="Applications per day over the last 30 days">
    <figcaption className="activity-caption"><span>Application activity</span>
      <span>{total} {total === 1 ? "application" : "applications"} <span className="activity-period">in the last 30 days</span></span>
    </figcaption>
    <div className="activity-bars" ref={barsRef}>
      {days.map((day, index) => <button className={`activity-day ${day.count ? "has-applications" : ""}`}
        key={day.date} type="button" tabIndex={index === focusedDay ? 0 : -1}
        aria-label={`${dayLabel(day.date, true)}: ${day.count} ${day.count === 1 ? "application" : "applications"}`}
        onFocus={() => setFocusedDay(index)}
        onKeyDown={(event) => {
          const next = event.key === "ArrowLeft" ? Math.max(0, index - 1)
            : event.key === "ArrowRight" ? Math.min(29, index + 1)
              : event.key === "Home" ? 0 : event.key === "End" ? 29 : null;
          if (next === null) return;
          event.preventDefault();
          (barsRef.current?.children[next] as HTMLButtonElement | undefined)?.focus();
        }}>
        <span className="activity-bar" style={{ height: `${day.count ? Math.max(10, day.count / maximum * 100) : 4}%` }} aria-hidden="true" />
        <span className="activity-tooltip" aria-hidden="true"><strong>{day.count} {day.count === 1 ? "application" : "applications"}</strong>{dayLabel(day.date)}</span>
      </button>)}
    </div>
    <div className="activity-axis" aria-hidden="true"><span>{dayLabel(days[0].date)}</span>
      <span>{dayLabel(days[14].date)}</span><span>Today</span></div>
  </figure>;
}
