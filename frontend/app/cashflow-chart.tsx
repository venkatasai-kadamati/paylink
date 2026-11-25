import { useId } from "react";

export type CashFlowSeries = "both" | "received" | "sent";
type Day = { day: string; received_cents: number; sent_cents: number };
const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const date = (day: string) =>
  new Date(day + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** The full period is always visible; a native select provides generous day targets. */
export function CashFlowChart({ daily, view, hidden, selected, onSelect }: {
  daily: Day[];
  view: CashFlowSeries;
  hidden: boolean;
  selected: string | null;
  onSelect: (day: string | null) => void;
}) {
  const id = useId();
  const maximum = Math.max(100, ...daily.map(d => Math.max(
    view === "sent" ? 0 : d.received_cents,
    view === "received" ? 0 : d.sent_cents,
  )));
  const amount = (value: number) => hidden ? "••••" : usd(value);
  const height = (value: number) => hidden || value === 0 ? 0 : Math.max(1, value / maximum * 180);
  const totals = daily.reduce((s, d) => ({
    received: s.received + d.received_cents, sent: s.sent + d.sent_cents,
  }), { received: 0, sent: 0 });
  const summary = view === "both"
    ? `${usd(totals.received)} received and ${usd(totals.sent)} sent`
    : view === "received" ? `${usd(totals.received)} received` : `${usd(totals.sent)} sent`;
  return <>
    <div className="cashflow-plot" role="img" aria-label={hidden
      ? "Daily cash flow. Amounts hidden."
      : `Daily cash flow: ${summary}. Exact daily values are available in Explore a day and Daily amounts.`}>
      <div className="cashflow-scale" aria-hidden="true">
        <span>{amount(maximum)}</span><span>{amount(0)}</span>
      </div>
      <div className="cashflow-chart" aria-hidden="true" style={{
        gridTemplateColumns: `repeat(${Math.max(1, daily.length)}, minmax(0, 1fr))`,
        columnGap: daily.length > 30 ? 1 : 3,
      }}>
        {daily.map((d, i) => <div key={d.day}
          className={"cashflow-day " + (selected === d.day ? "selected" : "")}>
          <span className="cashflow-pair" style={{ gap: daily.length > 30 ? 0 : 1 }}>
            {view !== "sent" && <i className="cashflow-in" style={{ height: height(d.received_cents) }} />}
            {view !== "received" && <i className="cashflow-out" style={{ height: height(d.sent_cents) }} />}
          </span>
          <small>{daily.length === 7
            ? new Date(d.day + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })
            : i === 0 || i === daily.length - 1 || i % Math.ceil(daily.length / 5) === 0
              ? new Date(d.day + "T12:00:00").getDate() : ""}</small>
        </div>)}
      </div>
      {hidden && <span className="cashflow-mask">Amounts hidden</span>}
    </div>
    <div className="cashflow-key">
      {view !== "sent" && <span><i className="in-dot" />Received</span>}
      {view !== "received" && <span><i className="out-dot" />Sent</span>}
      <span>USD · {daily.length} days</span>
    </div>
    <label className="cashflow-explorer" htmlFor={id}>
      <span>Explore a day</span>
      <select id={id} value={selected ?? ""} onChange={e => onSelect(e.target.value || null)}>
        <option value="">Choose a date</option>
        {daily.map(d => <option key={d.day} value={d.day}>{date(d.day)}</option>)}
      </select>
    </label>
  </>;
}
