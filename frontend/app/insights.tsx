"use client";
import { useEffect, useState } from "react";
import { CashFlowChart, type CashFlowSeries } from "./cashflow-chart";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  Download,
  TrendingUp,
  CalendarDays,
  ArrowLeftRight,
} from "lucide-react";

type Totals = {
  sent_cents: number;
  received_cents: number;
  transfer_count: number;
};
type Day = Totals & { day: string };
type Report = {
  period: { start: string; end: string; days: number };
  summary: Totals;
  previous: Totals;
  daily: Day[];
  counterparties: {
    name: string;
    direction: string;
    transfer_count: number;
    amount_cents: number;
  }[];
};
const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n / 100,
  );
const dayLabel = (day: string) =>
  new Date(day + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

export default function InsightDashboard({
  accounts,
  hidden,
  onActivity,
}: {
  accounts: { id: string; label: string }[];
  hidden: boolean;
  onActivity: (day: string, account: string) => void;
}) {
  const [days, setDays] = useState(30),
    [account, setAccount] = useState(""),
    [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [selected, setSelected] = useState<string | null>(null),
    [view, setView] = useState<CashFlowSeries>("both");
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setReport(null);
    setError("");
    setSelected(null);
    const params = new URLSearchParams({
      days: String(days),
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    });
    if (account) params.set("account_id", account);
    fetch("/api/insights/report?" + params, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok)
          throw new Error("Unable to load transfer insights. Please retry.");
        return r.json();
      })
      .then((data) => {
        if (!controller.signal.aborted) setReport(data);
      })
      .catch((e) => {
        if (!disposed)
          setError(
            controller.signal.aborted
              ? "Insights are taking longer to load. Please retry."
              : e.message,
          );
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      disposed = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [days, account, retry]);
  const amount = (n: number) => (hidden ? "••••••" : usd(n));
  function exportReport() {
    if (!report) return;
    const csv = [
      "Date,Received USD,Sent USD,Net USD,Transfers",
      ...report.daily.map(
        (d) =>
          `${d.day},${(d.received_cents / 100).toFixed(2)},${(d.sent_cents / 100).toFixed(2)},${((d.received_cents - d.sent_cents) / 100).toFixed(2)},${d.transfer_count}`,
      ),
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `paylink-insights-${report.period.start}-${report.period.end}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const s = report?.summary,
    p = report?.previous,
    active = report?.daily.filter((d) => d.transfer_count).length || 0;
  const picked = report?.daily.find((d) => d.day === selected);
  const busiest = report?.daily.reduce<Day | null>(
    (best, d) =>
      !best ||
      d.sent_cents + d.received_cents > best.sent_cents + best.received_cents
        ? d
        : best,
    null,
  );
  const comparison = (now: number, before: number) =>
    before
      ? `${Math.abs(((now - before) / before) * 100).toFixed(0)}% ${now >= before ? "more" : "less"} than prior ${days} days`
      : now
        ? "No transfers in the prior period"
        : "No change from the prior period";
  return (
    <div className="insight-workspace">
      <section className="insight-toolbar" aria-label="Insight filters">
        <div className="chart-range" role="group" aria-label="Date range">
          {[7, 30, 90].map((n) => (
            <button
              key={n}
              aria-pressed={days === n}
              onClick={() => setDays(n)}
            >
              {n} days
            </button>
          ))}
        </div>
        <label>
          Account
          <select value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">All my accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button secondary small"
          disabled={!report}
          onClick={exportReport}
        >
          <Download size={17} /> Export report
        </button>
      </section>
      {error ? (
        <div className="error" role="alert">
          {error}
          <button
            className="text-button"
            onClick={() => setRetry((n) => n + 1)}
          >
            Retry insights
          </button>
        </div>
      ) : !report ? (
        <div className="insight-loading" role="status">
          <span className="skeleton-line" />
          <span className="skeleton-line" />
          Preparing your transfer insights…
        </div>
      ) : (
        <>
          <div className="insight-period">
            <CalendarDays size={16} />
            {dayLabel(report.period.start)} – {dayLabel(report.period.end)}
            <span>Compared with the previous {days} days</span>
          </div>
          <section className="insight-metrics" aria-label="Cash flow summary">
            {[
              {
                label: "Money in",
                value: s!.received_cents,
                previous: p!.received_cents,
                icon: ArrowDownLeft,
                tone: "in",
              },
              {
                label: "Money out",
                value: s!.sent_cents,
                previous: p!.sent_cents,
                icon: ArrowUpRight,
                tone: "out",
              },
              {
                label: "Net cash flow",
                value: s!.received_cents - s!.sent_cents,
                previous: p!.received_cents - p!.sent_cents,
                icon: TrendingUp,
                tone: "net",
              },
            ].map((m) => (
              <article className={"insight-metric " + m.tone} key={m.label}>
                <span>
                  <m.icon size={18} />
                  {m.label}
                </span>
                <strong>{amount(m.value)}</strong>
                <small>
                  {m.tone === "net"
                    ? `Previously ${amount(m.previous)}`
                    : hidden
                      ? "Comparison hidden"
                      : comparison(m.value, m.previous)}
                </small>
              </article>
            ))}
          </section>
          <section className="cashflow-panel">
            <div className="section-heading">
              <div>
                <h2>Cash flow over time</h2>
                <p className="muted">Select a day to explore the details.</p>
              </div>
              <div className="chart-range" role="group" aria-label="Chart series">
                {([
                  ["both", "Both"],
                  ["received", "Money in"],
                  ["sent", "Money out"],
                ] as const).map(([v, label]) => (
                  <button
                    key={v}
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <CashFlowChart daily={report.daily} view={view} hidden={hidden}
              selected={selected} onSelect={setSelected} />
            {picked && (
              <div className="cashflow-selection" role="status">
                <strong>{dayLabel(picked.day)}</strong>
                <span>
                  {amount(picked.received_cents)} in ·{" "}
                  {amount(picked.sent_cents)} out
                </span>
                <button
                  className="text-button"
                  onClick={() => onActivity(picked.day, account)}
                >
                  View activity <ArrowRight size={15} />
                </button>
              </div>
            )}
            {!s!.transfer_count && (
              <p className="insight-empty">
                No external transfers in this period. Try another period or
                account.
              </p>
            )}
          </section>
          <div className="insight-detail-grid">
            <section className="insight-detail">
              <h2>Transfer snapshot</h2>
              <div className="insight-facts">
                <div>
                  <ArrowLeftRight size={19} />
                  <strong>{s!.transfer_count}</strong>
                  <span>Transfers</span>
                </div>
                <div>
                  <CalendarDays size={19} />
                  <strong>{active}</strong>
                  <span>Active days</span>
                </div>
                <div>
                  <TrendingUp size={19} />
                  <strong>
                    {amount(
                      s!.transfer_count
                        ? (s!.sent_cents + s!.received_cents) /
                            s!.transfer_count
                        : 0,
                    )}
                  </strong>
                  <span>Average transfer</span>
                </div>
              </div>
              <p className="insight-observation">
                {busiest && s!.transfer_count ? (
                  <>
                    Most active by value: <b>{dayLabel(busiest.day)}</b> ·{" "}
                    {amount(busiest.sent_cents + busiest.received_cents)} moved.
                  </>
                ) : (
                  "Your transfer patterns will appear here as you use PayLink."
                )}
              </p>
              <div
                className="flow-ratio"
                aria-hidden="true"
                style={{ background: hidden || !s!.transfer_count ? "var(--line)" : "var(--accent)" }}
              >
                <i
                  style={{
                    width: `${hidden ? 0 : s!.received_cents + s!.sent_cents ? (s!.received_cents / (s!.received_cents + s!.sent_cents)) * 100 : 0}%`,
                  }}
                />
              </div>
              <p className="muted">
                {hidden
                  ? "Split hidden"
                  : `${s!.received_cents + s!.sent_cents ? Math.round((s!.received_cents / (s!.received_cents + s!.sent_cents)) * 100) : 0}% incoming · ${s!.received_cents + s!.sent_cents ? Math.round((s!.sent_cents / (s!.received_cents + s!.sent_cents)) * 100) : 0}% outgoing`}
              </p>
            </section>
            <section className="insight-detail">
              <h2>Top transfer connections</h2>
              <p className="muted">
                Account totals by direction, ranked by value.
              </p>
              {report.counterparties.length ? (
                report.counterparties.map((c, i) => (
                  <div className="connection-row" key={i}>
                    <span className={"connection-icon " + c.direction}>
                      {c.direction === "received" ? (
                        <ArrowDownLeft size={17} />
                      ) : (
                        <ArrowUpRight size={17} />
                      )}
                    </span>
                    <span>
                      <strong>{c.name}</strong>
                      <small>
                        {c.transfer_count} transfer
                        {c.transfer_count === 1 ? "" : "s"} ·{" "}
                        {c.direction === "received" ? "received" : "sent"}
                      </small>
                    </span>
                    <b>{amount(c.amount_cents)}</b>
                  </div>
                ))
              ) : (
                <p className="insight-empty">
                  No connections for this selection.
                </p>
              )}
            </section>
          </div>
          <details className="chart-data insight-detail">
            <summary>View daily amounts</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Received</th>
                    <th>Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {report.daily.map((d) => (
                    <tr key={d.day}>
                      <td>{dayLabel(d.day)}</td>
                      <td>{amount(d.received_cents)}</td>
                      <td>{amount(d.sent_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <p className="insight-footnote">
            Based on completed external transfers in your local time zone. Moves
            between your own accounts are excluded. Returns appear on their
            return date. Simulated funds only.
          </p>
        </>
      )}
    </div>
  );
}
