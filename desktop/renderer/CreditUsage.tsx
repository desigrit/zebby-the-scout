import { useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { formatCredits, onlineModel, type DailyCreditUsage, type Wallet } from "../../shared/online-models";

function dayLabel(date: string, year = false) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
}
function modelName(id: string) { try { return onlineModel(id).name; } catch { return "Online model"; } }

function ActivityBlocks({ days }: { days: DailyCreditUsage[] }) {
  const [chosen, setChosen] = useState(days.at(-1)?.date || "");
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const selected = days.find((day) => day.date === chosen) || days.at(-1)!;
  const offset = (new Date(`${days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const columns = Math.ceil((days.length + offset) / 7);
  const largest = Math.max(1, ...days.map((day) => day.cost));
  const months = days.flatMap((day, index) => !index || day.date.slice(0, 7) !== days[index - 1].date.slice(0, 7)
    ? [{ name: new Date(`${day.date}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" }), column: Math.floor((index + offset) / 7) + 1 }]
    : []);
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowLeft" ? index - 7 : event.key === "ArrowRight" ? index + 7
      : event.key === "ArrowUp" ? index - 1 : event.key === "ArrowDown" ? index + 1
      : event.key === "Home" ? 0 : event.key === "End" ? days.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    const target = days[Math.min(days.length - 1, Math.max(0, next))];
    setChosen(target.date); buttons.current.get(target.date)?.focus();
  }
  return <div className="credit-activity-blocks">
    <div className="credit-activity-heading"><span>Last 12 weeks</span><span>Daily credits · UTC</span></div>
    <div className="credit-activity-calendar" style={{ "--credit-weeks": columns } as CSSProperties}>
      <div className="credit-activity-months" aria-hidden="true">{months.map((month, index) => <span key={index} style={{ gridColumn: `${month.column} / span ${Math.min(2, columns - month.column + 1)}` }}>{month.name}</span>)}</div>
      <div className="credit-activity-weekdays" aria-hidden="true"><span>Mon</span><span>Wed</span><span>Fri</span></div>
      <div className="credit-activity-grid" role="group" aria-label="Daily credit usage">
        {days.map((day, index) => {
          const label = `${dayLabel(day.date, true)}: ${day.count} ${day.count === 1 ? "analysis" : "analyses"}, ${formatCredits(day.cost)} credits`;
          return <button key={day.date} ref={(element) => { if (element) buttons.current.set(day.date, element); else buttons.current.delete(day.date); }}
            type="button" className="credit-activity-day" data-level={day.count ? Math.max(1, Math.ceil(day.cost / largest * 4)) : 0}
            aria-label={label} aria-pressed={selected.date === day.date} title={label} tabIndex={selected.date === day.date ? 0 : -1}
            style={{ gridRow: (index + offset) % 7 + 1, gridColumn: Math.floor((index + offset) / 7) + 1 }}
            onClick={() => setChosen(day.date)} onKeyDown={(event) => move(event, index)} />;
        })}
      </div>
    </div>
    <div className="credit-activity-detail" aria-live="polite"><time dateTime={selected.date}>{dayLabel(selected.date)}</time>
      <span>{selected.count} {selected.count === 1 ? "analysis" : "analyses"} · {formatCredits(selected.cost)} credits</span></div>
  </div>;
}

export default function CreditUsage({ wallet }: { wallet: Wallet | null }) {
  return <section className="credit-history" aria-labelledby="credit-history-title">
    <div className="credit-manager-section-title"><h3 id="credit-history-title">Credit usage</h3></div>
    {wallet && <dl className="credit-history-totals"><div><dt>{wallet.completedAnalyses === undefined ? "Recent analyses" : "Total analyses"}</dt>
      <dd>{(wallet.completedAnalyses ?? wallet.recent.length).toLocaleString()}</dd></div>
      <div><dt>Total credits used</dt><dd>{formatCredits(wallet.used)}</dd></div></dl>}
    {!!wallet?.dailyUsage?.length && <ActivityBlocks days={wallet.dailyUsage} />}
    {wallet?.recent.length ? <><p className="credit-history-caption">Latest {wallet.recent.length === 1 ? "analysis" : `${wallet.recent.length} analyses`}</p>
      <ul aria-label="Credit usage history">{wallet.recent.map((item) => <li key={item.id}>
        <div className="credit-history-item"><div><strong>{item.kind === "plan" ? "Plan analysis" : "Resume match"}</strong><span>{formatCredits(item.cost)} credits</span></div>
          <small>{modelName(item.model)} · <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></small>
        </div></li>)}</ul></> : <p className="settings-help">Your analyses will appear here.</p>}
  </section>;
}
