"use client";
import { useEffect, useRef, useState, useCallback, FormEvent } from "react";
import {
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  ChevronRight,
  Plus,
  X,
  Search,
  LayoutDashboard,
  MessageSquare,
  Wallet,
  ChartNoAxesColumnIncreasing,
  LogOut,
  ShieldCheck,
  Check,
  Download,
  Landmark,
  LoaderCircle,
  Copy,
  Menu,
  Eye,
  EyeOff,
} from "lucide-react";
import { PayBot } from "./paybot";
import { Auth } from "./auth";
import {
  AccountDetails,
  InvitationCenter,
  TransferReceipt,
  type Invitation,
} from "./product";
import { Users, Bell, SlidersHorizontal } from "lucide-react";

type User = {
  id: string;
  username: string;
  full_name: string;
  email: string;
  phone: string | null;
};
type Account = {
  id: string;
  label: string;
  account_type: string;
  balance_cents: number;
  active: boolean;
  last4: string;
  bank_name: string;
  holder_count: number;
};
type Transfer = {
  id: string;
  amount_cents: number;
  memo: string;
  created_at: string;
  direction: "sent" | "received" | "internal";
  source_account_id: string;
  destination_account_id: string;
  source_label: string;
  destination_label: string;
  counterparty: string;
};
type Recipient = {
  id: string;
  username: string;
  full_name: string;
  account_id: string;
  bank_name: string;
  last4: string;
  account_type?: string;
  holder_count?: number;
};
type DailyVolume = { day: string; sent: number; received: number };
type Insights = {
  monthly: {
    transfer_count: number;
    sent_cents: number;
    received_cents: number;
  };
  weekly: DailyVolume[];
};
const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n / 100,
  );
const date = (s: string) =>
  new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const initials = (s: string) =>
  s
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const r = await fetch("/api" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (!r.ok) {
    const b = await r.json().catch(() => ({
      detail: "Unable to reach the server. Please try again.",
    }));
    throw new Error(
      typeof b.detail === "string"
        ? b.detail
        : "Please check the fields and try again.",
    );
  }
  return r.json();
}
const post = (data: unknown) => ({
  method: "POST",
  body: JSON.stringify(data),
});
function Logo() {
  return (
    <div className="logo">
      <span className="logo-mark">
        <ArrowLeftRight size={21} />
      </span>
      PayLink
    </div>
  );
}
const ownership = (count: number) => (count > 1 ? "Joint" : "Personal");
function AccountTag({ count }: { count: number }) {
  return (
    <span className={"ownership-tag " + (count > 1 ? "joint" : "personal")}>
      {ownership(count)}
    </span>
  );
}
function Spinner() {
  return <LoaderCircle size={18} className="spin" aria-label="Loading" />;
}

function localDay(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function InsightChart({
  insights,
  transfers,
}: {
  insights: Insights | null;
  transfers: Transfer[];
}) {
  const [range, setRange] = useState<7 | 30>(7);
  const weekly = insights?.weekly ?? [];
  const older: DailyVolume[] = [];
  const today = weekly.at(-1)?.day;
  if (range === 30 && today) {
    const buckets = new Map<string, DailyVolume>();
    for (let offset = 29; offset >= 7; offset--) {
      const value = new Date(today + "T12:00:00");
      value.setDate(value.getDate() - offset);
      const day = localDay(value),
        bucket = { day, sent: 0, received: 0 };
      buckets.set(day, bucket);
      older.push(bucket);
    }
    for (const transfer of transfers) {
      const day = buckets.get(localDay(new Date(transfer.created_at)));
      if (!day) continue;
      if (transfer.direction !== "received")
        day.sent += Number(transfer.amount_cents);
      if (transfer.direction !== "sent")
        day.received += Number(transfer.amount_cents);
    }
  }
  const days = [...older, ...weekly];
  const oldest = transfers.at(-1);
  const limited =
    range === 30 &&
    transfers.length === 200 &&
    oldest &&
    older.length > 0 &&
    localDay(new Date(oldest.created_at)) >= older[0].day;
  const covered = limited
    ? days.filter(
        (d) =>
          d.day >= weekly[0].day ||
          d.day > localDay(new Date(oldest.created_at)),
      )
    : days;
  const active = covered.filter((d) => Number(d.sent) || Number(d.received));
  const max = Math.max(
    1,
    ...covered.flatMap((d) => [Number(d.sent), Number(d.received)]),
  );
  const showChart = active.length > 1 && !limited;
  return (
    <section className="insights-grid">
      <div className="panel chart-panel">
        <div className="section-heading">
          <h2>Daily transfer volume</h2>
          <div className="chart-range" role="group" aria-label="Transfer range">
            {([7, 30] as const).map((value) => (
              <button
                key={value}
                aria-pressed={range === value}
                onClick={() => setRange(value)}
              >
                {value} days
              </button>
            ))}
          </div>
        </div>
        {insights && (
          <>
            {showChart ? (
              <>
                <div className="chart-legend">
                  <span>
                    <i className="in" />
                    Received
                  </span>
                  <span>
                    <i className="out" />
                    Sent
                  </span>
                </div>
                <div className="bar-chart" aria-hidden="true">
                  {days.map((d, index) => (
                    <div className="chart-day" key={d.day}>
                      <div className="bars">
                        {(["received", "sent"] as const).map((direction) => (
                          <div
                            key={direction}
                            className={`bar ${direction}`}
                            style={{
                              height: `${(Number(d[direction]) / max) * 110}px`,
                            }}
                            title={`${direction === "received" ? "Received" : "Sent"} ${money(d[direction])}`}
                          />
                        ))}
                      </div>
                      <span>
                        {range === 7
                          ? new Date(d.day + "T12:00:00").toLocaleDateString(
                              "en-US",
                              { weekday: "short" },
                            )
                          : index % 7 === 3
                            ? date(d.day + "T12:00:00")
                            : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="chart-empty" role="status">
                <strong>
                  {limited
                    ? "Part of this range is unavailable"
                    : active.length
                      ? "Transfers on one day"
                      : "No transfers in this period"}
                </strong>
                <p>
                  {limited
                    ? "The 30-day view uses your latest 200 transfers. Daily amounts show only complete days."
                    : active.length
                      ? `On ${date(active[0].day + "T12:00:00")}: ${money(active[0].received)} received · ${money(active[0].sent)} sent.`
                      : range === 7
                        ? "Try the 30-day view for older activity."
                        : "Completed transfers will appear here."}
                </p>
              </div>
            )}
            <p className="chart-note">
              Transfers between your accounts appear in both daily amounts and
              do not count toward monthly sent or received totals.
            </p>
            <details className="chart-data">
              <summary>View daily amounts</summary>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Received</th>
                    <th scope="col">Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {covered.map((d) => (
                    <tr key={d.day}>
                      <td>{date(d.day + "T12:00:00")}</td>
                      <td>{money(d.received)}</td>
                      <td>{money(d.sent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
      </div>
      <section className="monthly-flow">
        <h2>This month</h2>
        <dl>
          <div>
            <dt>Received</dt>
            <dd>{money(Number(insights?.monthly.received_cents || 0))}</dd>
          </div>
          <div>
            <dt>Sent</dt>
            <dd>{money(Number(insights?.monthly.sent_cents || 0))}</dd>
          </div>
        </dl>
      </section>
    </section>
  );
}
function Modal({
  title,
  eyebrow,
  onClose,
  children,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    ref.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      before?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={"modal " + className}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Tab") {
            const els = ref.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input,select,a[href],textarea",
            );
            if (!els?.length) return;
            const first = els[0],
              last = els[els.length - 1];
            if (
              e.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === ref.current)
            ) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <button
          className="icon-button close"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [accounts, setAccounts] = useState<Account[]>([]),
    [transfers, setTransfers] = useState<Transfer[]>([]),
    [insights, setInsights] = useState<Insights | null>(null);
  const [tab, setTab] = useState("Overview"),
    [mobile, setMobile] = useState(false),
    [transferMode, setTransferMode] = useState<"send" | "internal" | null>(
      null,
    ),
    [link, setLink] = useState(false),
    [detail, setDetail] = useState<Transfer | null>(null),
    [share, setShare] = useState(false),
    [bot, setBot] = useState(false),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [hidden, setHidden] = useState(false);
  const [filter, setFilter] = useState("All activity"),
    [search, setSearch] = useState("");
  const [shareAccount,setShareAccount]=useState("");
  const [invitations, setInvitations] = useState<Invitation[]>([]),
    [selectedAccount, setSelectedAccount] = useState<Account | null>(null),
    [accountFilter, setAccountFilter] = useState(""),
    [startDate, setStartDate] = useState(""),
    [endDate, setEndDate] = useState("");
  const refresh = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [a, t, invites, i] = await Promise.all([
        api<Account[]>("/accounts"),
        api<Transfer[]>("/transfers"),
        api<Invitation[]>("/account-invitations"),
        api<Insights>(
          "/insights?time_zone=" +
            encodeURIComponent(
              Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
            ),
        ),
      ]);
      setInvitations(invites);
      setAccounts(a);
      setTransfers(t);
      setInsights(i);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  async function init() {
    try {
      const u = await api<User>("/me");
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }
  useEffect(() => {
    init();
  }, []);
  useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  if (!ready)
    return (
      <div className="loading-screen">
        <Logo />
        <Spinner />
      </div>
    );
  if (!user) return <Auth onLogin={init} />;
  const [personalBalance, jointBalance] = accounts.reduce<[number, number]>(
    ([personal, joint], a) =>
      a.holder_count > 1
        ? [personal, joint + Number(a.balance_cents)]
        : [personal + Number(a.balance_cents), joint],
    [0, 0],
  );
  const balance = personalBalance + jointBalance;
  const visible = transfers.filter(
    (t) =>
      (!accountFilter ||
        t.source_account_id === accountFilter ||
        t.destination_account_id === accountFilter) &&
      (!startDate || localDay(new Date(t.created_at)) >= startDate) &&
      (!endDate || localDay(new Date(t.created_at)) <= endDate) &&
      (filter === "All activity" ||
        t.direction ===
          {
            Sent: "sent",
            Received: "received",
            "Between accounts": "internal",
          }[filter]) &&
      `${t.counterparty} ${t.memo} ${t.source_label} ${t.destination_label}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  function nav(name: string) {
    setTab(name);
    setMobile(false);
    setSearch("");
    setFilter("All activity");
    setAccountFilter("");
    setStartDate("");
    setEndDate("");
  }
  function done() {
    setTransferMode(null);
    setLink(false);
    refresh();
    setToast("Your accounts are up to date.");
  }
  return (
    <div className="app-shell">
      <aside
        id="paylink-sidebar"
        className={"sidebar " + (mobile ? "mobile-open" : "")}
      >
        <Logo />
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {[
            { name: "Overview", icon: LayoutDashboard },
            { name: "Activity", icon: ArrowLeftRight },
            { name: "Accounts", icon: Wallet },
            { name: "Balance", icon: Landmark },
            { name: "Insights", icon: ChartNoAxesColumnIncreasing },
            { name: "Invitations", icon: Users },
          ].map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={tab === name ? "active" : ""}
              onClick={() => nav(name)}
              aria-current={tab === name ? "page" : undefined}
            >
              <Icon size={19} />
              {name}
              {name === "Invitations" &&
                invitations.some(
                  (i) => i.status === "pending" && i.invitee_id === user.id,
                ) && (
                  <span className="nav-count">
                    {
                      invitations.filter(
                        (i) =>
                          i.status === "pending" && i.invitee_id === user.id,
                      ).length
                    }
                  </span>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="paybot-trigger"
            aria-haspopup="dialog"
            onClick={() => setBot(true)}
          >
            <MessageSquare size={18} /> PayBot
          </button>
          <div className="simulation-note">Simulated funds only</div>
          <div className="profile">
            <span className="avatar">{initials(user.full_name)}</span>
            <div>
              <strong>{user.full_name}</strong>
              <small>@{user.username}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={async () => {
                await api("/auth/logout", post({}));
                setUser(null);
                setBot(false);
                setAccounts([]);
                setTransfers([]);
                setInsights(null);
                setTab("Overview");
                setSearch("");
                setFilter("All activity");
                setDetail(null);
                setSelectedAccount(null);
                setInvitations([]);
                setHidden(false);
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Toggle navigation"
            aria-expanded={mobile}
            aria-controls="paylink-sidebar"
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={21} />
          </button>
          <Logo />
          <span className="workspace-breadcrumb">
            Personal workspace <ChevronRight size={13} />
            <b>{tab}</b>
          </span>
          <div className="topbar-right">
            <span className="today-date">
              {new Date().toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
            <button
              className="icon-button"
              aria-label="View invitations"
              onClick={() => nav("Invitations")}
            >
              <Bell size={18} />
            </button>
            <span className="avatar">{initials(user.full_name)}</span>
          </div>
        </header>
        <main className="dashboard" data-page={tab}>
          <div className="page-heading">
            <div>
              <h1>
                {tab === "Overview"
                  ? `Hello, ${user.full_name.split(" ")[0]}.`
                  : tab === "Activity"
                    ? "Transaction history"
                    : tab === "Accounts"
                      ? "Your accounts"
                      : tab === "Balance"
                        ? "Balances"
                        : tab === "Invitations"
                          ? "Invitations"
                          : "Transfer insights"}
              </h1>
              <p className="page-subtitle">
                {
                  {
                    Overview: "Here’s where things stand with your money.",
                    Activity: "Every move, all in one place.",
                    Accounts: "A home for your everyday and shared money.",
                    Balance: "Your complete picture, down to the cent.",
                    Insights: "A closer look at how your money moves.",
                    Invitations: "Bring your people into the picture.",
                  }[tab]
                }
              </p>
            </div>
            {tab === "Overview" && (
              <button
                className="button primary"
                onClick={() => setTransferMode("send")}
              >
                Send money
                <ArrowUpRight size={17} aria-hidden="true" />
              </button>
            )}
          </div>
          {error && (
            <div className="error" role="alert">
              {error} <button onClick={refresh}>Retry</button>
            </div>
          )}
          {loading && accounts.length === 0 ? (
            <div className="empty">
              <Spinner />
              <p>Loading accounts and transfers…</p>
            </div>
          ) : (
            <>
              {tab === "Overview" && (
                <section className="overview-grid">
                  <div className="total-balance-card">
                    <div className="card-eyebrow">
                      Total available balance
                      <button
                        className="icon-button"
                        aria-label={hidden ? "Show balance" : "Hide balance"}
                        onClick={() => setHidden(!hidden)}
                      >
                        {hidden ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                      <span className="currency-label">USD</span>
                    </div>
                    <strong className="hero-balance">
                      {hidden ? "••••••" : money(balance)}
                    </strong>
                    <span className="balance-caption">
                      Across {accounts.length} personal & joint accounts
                    </span>
                    <div className="balance-card-bottom">
                      <span>
                        <ShieldCheck size={15} />
                        Simulated funds only
                      </span>
                      <button onClick={() => nav("Balance")}>
                        Balance details
                        <ArrowUpRight size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="flow-card">
                    <div className="section-heading">
                      <h2>This month</h2>
                      <button
                        className="icon-button"
                        aria-label="View transfer insights"
                        onClick={() => nav("Insights")}
                      >
                        <ArrowUpRight size={18} />
                      </button>
                    </div>
                    <div className="flow-stat">
                      <span className="flow-icon">
                        <ArrowDownLeft size={18} />
                      </span>
                      <div>
                        <small>Money in</small>
                        <strong>
                          {hidden
                            ? "••••••"
                            : money(
                                Number(insights?.monthly.received_cents || 0),
                              )}
                        </strong>
                      </div>
                      <div className="flow-bars" aria-hidden="true">
                        {(insights?.weekly ?? []).map((d) => (
                          <i
                            key={d.day}
                            style={{
                              height:
                                Math.max(
                                  3,
                                  (Number(d.received) /
                                    Math.max(
                                      1,
                                      ...(insights?.weekly ?? []).map((x) =>
                                        Number(x.received),
                                      ),
                                    )) *
                                    27,
                                ) + "px",
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flow-stat">
                      <span className="flow-icon outgoing">
                        <ArrowUpRight size={18} />
                      </span>
                      <div>
                        <small>Money out</small>
                        <strong>
                          {hidden
                            ? "••••••"
                            : money(Number(insights?.monthly.sent_cents || 0))}
                        </strong>
                      </div>
                      <span className="flow-period">This calendar month</span>
                    </div>
                    <p>Between-account transfers excluded.</p>
                  </div>
                </section>
              )}
              {tab === "Balance" && (
                <section
                  className="summary-grid"
                  aria-label="Balance breakdown"
                >
                  <div className="balance-panel">
                    <div className="card-eyebrow">
                      Total balance{" "}
                      <button
                        className="icon-button"
                        aria-label={hidden ? "Show balance" : "Hide balance"}
                        onClick={() => setHidden(!hidden)}
                      >
                        {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    <div className="balance-value">
                      {hidden ? "••••••" : money(balance)}
                    </div>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">Personal accounts</span>
                    <strong>
                      {hidden ? "••••••" : money(personalBalance)}
                    </strong>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">Joint accounts</span>
                    <strong>{hidden ? "••••••" : money(jointBalance)}</strong>
                  </div>
                </section>
              )}
              {tab === "Overview" && (
                <section className="quick-actions">
                  <button onClick={() => setTransferMode("internal")}>
                    <span className="action-icon">
                      <ArrowLeftRight size={18} />
                    </span>
                    Move between accounts
                  </button>
                  <button onClick={() => setLink(true)}>
                    <span className="action-icon">
                      <Plus size={18} />
                    </span>
                    Link a bank account
                  </button>
                </section>
              )}
              {(tab === "Overview" ||
                tab === "Accounts" ||
                tab === "Balance") && (
                <section className="accounts-section">
                  <div className="section-heading">
                    <div>
                      {tab === "Overview" && <h2>Accounts</h2>}
                      {tab === "Accounts" && (
                        <p>
                          {accounts.length}{" "}
                          {accounts.length === 1 ? "account" : "accounts"}
                        </p>
                      )}
                      {tab === "Balance" && (
                        <>
                          <h2>Balances by account</h2>
                          <p>
                            Each joint account is counted once. All owners share
                            its balance.
                          </p>
                        </>
                      )}
                    </div>
                    {tab === "Overview" && (
                      <button
                        className="text-button"
                        onClick={() => nav("Accounts")}
                      >
                        Manage accounts
                      </button>
                    )}
                    {tab === "Accounts" && (
                      <div className="section-actions">
                        {accounts.some((a) => a.active) && (
                          <button
                            className="button secondary small"
                            onClick={() => {setShareAccount("");setShare(true);}}
                          >
                            Add joint owner
                          </button>
                        )}
                        <button
                          className="text-button"
                          onClick={() => setLink(true)}
                        >
                          <Plus size={15} />
                          Link account
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="account-list">
                    {accounts.map((a) => (
                      <button
                        className="account-row"
                        key={a.id}
                        onClick={() => setSelectedAccount(a)}
                        title={`View account details for ${a.label}`}
                      >
                        <span className="bank-monogram">
                          <Landmark size={21} />
                        </span>
                        <span className="account-info">
                          <strong className="account-name">{a.label}</strong>
                          <small>
                            {a.bank_name} ·{" "}
                            <span className="account-type">
                              {a.account_type}
                            </span>{" "}
                            ••{a.last4}
                          </small>
                        </span>
                        <span className="account-ownership">
                          {ownership(a.holder_count)}
                          {!a.active && " / Inactive"}
                        </span>
                        <span className="account-balance">
                          <small>Available balance</small>
                          <strong>
                            {hidden ? "••••••" : money(a.balance_cents)}
                          </strong>
                        </span>
                      </button>
                    ))}
                    {tab === "Accounts" &&
                      accounts.length > 0 &&
                      accounts.length < 4 && (
                        <button
                          className="add-account-card"
                          onClick={() => setLink(true)}
                        >
                          <span>
                            <Plus size={22} />
                          </span>
                          <strong>Make room for more</strong>
                          <small>Open another simulated account</small>
                        </button>
                      )}
                    {accounts.length === 0 && (
                      <div className="empty accounts-empty">
                        <Landmark size={28} />
                        <h3>No accounts yet</h3>
                        <p>Create an account with $200 in simulated funds.</p>
                        <button
                          className="button primary"
                          onClick={() => setLink(true)}
                        >
                          <Plus size={16} /> Link an account
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              )}
              {tab === "Invitations" && (
                <InvitationCenter
                  items={invitations}
                  userId={user.id}
                  onRefresh={refresh}
                />
              )}
              {tab === "Overview" &&
                invitations.some(
                  (i) => i.status === "pending" && i.invitee_id === user.id,
                ) && (
                  <button
                    className="invitation-banner"
                    onClick={() => nav("Invitations")}
                  >
                    <Users size={20} />
                    <span>
                      You have an account invitation waiting.
                      <small>Review it before joining a shared account.</small>
                    </span>
                    <ArrowRight size={18} />
                  </button>
                )}
              {(tab === "Overview" || tab === "Activity") && (
                <section className="activity-panel">
                  <div className="section-heading">
                    {tab === "Overview" && <h2>Recent activity</h2>}
                    {tab === "Overview" ? (
                      <button
                        className="text-button"
                        onClick={() => nav("Activity")}
                      >
                        View all activity
                      </button>
                    ) : (
                      <a
                        href="/api/activity.csv"
                        className="button secondary small"
                      >
                        <Download size={16} />
                        Export CSV
                      </a>
                    )}
                  </div>
                  <div className="activity-tools">
                    <div className="filters">
                      {[
                        "All activity",
                        "Sent",
                        "Received",
                        "Between accounts",
                      ].map((f) => (
                        <button
                          key={f}
                          className={filter === f ? "selected" : ""}
                          aria-pressed={filter === f}
                          onClick={() => setFilter(f)}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                    <div className="search-box">
                      <Search size={16} />
                      <input
                        aria-label="Search activity"
                        placeholder="Search activity"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  {tab === "Activity" && (
                    <div className="activity-advanced">
                      <span>
                        <SlidersHorizontal size={15} />
                        Refine activity
                      </span>
                      <label>
                        <span className="sr-only">Filter by account</span>
                        <select
                          aria-label="Filter by account"
                          value={accountFilter}
                          onChange={(e) => setAccountFilter(e.target.value)}
                        >
                          <option value="">All accounts</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.label} · ••{a.last4}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        From
                        <input
                          aria-label="From date"
                          type="date"
                          value={startDate}
                          max={endDate || undefined}
                          onChange={(e) => setStartDate(e.target.value)}
                        />
                      </label>
                      <label>
                        To
                        <input
                          aria-label="To date"
                          type="date"
                          value={endDate}
                          min={startDate || undefined}
                          onChange={(e) => setEndDate(e.target.value)}
                        />
                      </label>
                      {(accountFilter || startDate || endDate) && (
                        <button
                          className="text-button"
                          onClick={() => {
                            setAccountFilter("");
                            setStartDate("");
                            setEndDate("");
                          }}
                        >
                          Reset filters
                        </button>
                      )}
                    </div>
                  )}
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Transaction</th>
                          <th>Date</th>
                          <th>Status</th>
                          <th className="amount-th">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible
                          .slice(0, tab === "Overview" ? 5 : 200)
                          .map((t) => (
                            <tr key={t.id} onClick={() => setDetail(t)}>
                              <td>
                                <button
                                  className="transaction-name"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDetail(t);
                                  }}
                                >
                                  <span
                                    className={
                                      "transaction-avatar " + t.direction
                                    }
                                  >
                                    {t.direction === "internal" ? (
                                      <ArrowLeftRight size={18} />
                                    ) : (
                                      initials(t.counterparty)
                                    )}
                                  </span>
                                  <span>
                                    <strong>
                                      {t.direction === "internal"
                                        ? "Between your accounts"
                                        : t.counterparty}
                                    </strong>
                                    <small>
                                      {t.memo ||
                                        `${t.direction === "sent" ? "Sent from" : "Received to"} ${t.direction === "sent" ? t.source_label : t.destination_label}`}
                                    </small>
                                  </span>
                                </button>
                              </td>
                              <td className="date-cell">
                                {date(t.created_at)}
                                <small>
                                  {new Date(t.created_at).toLocaleTimeString(
                                    "en-US",
                                    { hour: "numeric", minute: "2-digit" },
                                  )}
                                </small>
                              </td>
                              <td>
                                <span className="completed">
                                  <span />
                                  Completed
                                </span>
                              </td>
                              <td className={"amount " + t.direction}>
                                {t.direction === "received"
                                  ? "+"
                                  : t.direction === "sent"
                                    ? "−"
                                    : ""}
                                {hidden ? "••••••" : money(t.amount_cents)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {visible.length === 0 && (
                    <div className="empty">
                      <ArrowLeftRight size={25} />
                      <h3>
                        {search || filter !== "All activity"
                          ? "No matching activity."
                          : "No transfers yet."}
                      </h3>
                      <p>
                        {search
                          ? "Try a different name or note."
                          : "Send to someone or move money between your accounts."}
                      </p>
                    </div>
                  )}
                  <div className="table-footer">
                    <span>
                      {visible.length === 0
                        ? "0"
                        : `1–${Math.min(visible.length, tab === "Overview" ? 5 : 200)}`}{" "}
                      of {visible.length}
                      {transfers.length === 200 ? " (latest 200)" : ""}
                    </span>
                  </div>
                </section>
              )}
              {tab === "Insights" && (
                <InsightChart insights={insights} transfers={transfers} />
              )}
            </>
          )}
        </main>
      </div>
      {transferMode && (
        <TransferModal
          mode={transferMode}
          accounts={accounts}
          onClose={() => setTransferMode(null)}
          onDone={done}
        />
      )}
      {share && (
        <ShareModal
          initialAccount={shareAccount}
          accounts={accounts}
          onClose={() => setShare(false)}
          onDone={() => {
            setShare(false);
            refresh();
            setToast(
              "Invitation sent. The new owner can accept it in Invitations.",
            );
          }}
        />
      )}
      {link && <LinkModal onClose={() => setLink(false)} onDone={done} />}
      {selectedAccount && (
        <Modal
          title={selectedAccount.label}
          onClose={() => setSelectedAccount(null)}
        >
          <AccountDetails
            account={selectedAccount}
            hidden={hidden}
            onActivity={() => {
              nav("Activity");
              setAccountFilter(selectedAccount.id);
              setSelectedAccount(null);
            }}
            onShare={() => {
              setShareAccount(selectedAccount.id);
              setSelectedAccount(null);
              setShare(true);
            }}
          />
        </Modal>
      )}
      {detail && (
        <Modal title="Transfer details" onClose={() => setDetail(null)}>
          <TransferReceipt
            key={detail.id}
            transfer={detail}
            accounts={accounts}
            hidden={hidden}
            onUpdated={refresh}
          />
        </Modal>
      )}
      <PayBot open={bot} onClose={() => setBot(false)} />
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function TransferModal({
  mode,
  accounts,
  onClose,
  onDone,
}: {
  mode: "send" | "internal";
  accounts: Account[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState(1),
    [q, setQ] = useState(""),
    [results, setResults] = useState<Recipient[]>([]),
    [recipient, setRecipient] = useState<Recipient | null>(null),
    [source, setSource] = useState(accounts.find((a) => a.active)?.id || ""),
    [dest, setDest] = useState(""),
    [amount, setAmount] = useState(""),
    [memo, setMemo] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [searched, setSearched] = useState(false),
    [receipt, setReceipt] = useState<{ id: string } | null>(null);
  const key = useRef<string>("");
  const selected = accounts.find((a) => a.id === source);
  const amountCents = Math.round(Number(amount) * 100);
  const ownDest = accounts.find((a) => a.id === dest);
  const destination = mode === "send" ? recipient?.account_id : dest;
  async function search(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setRecipient(null);
    try {
      setResults(
        await api<Recipient[]>("/recipients?q=" + encodeURIComponent(q)),
      );
      setSearched(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function review(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (
      !/^\d+(\.\d{1,2})?$/.test(amount) ||
      !Number.isSafeInteger(amountCents) ||
      amountCents < 1 ||
      amountCents > 100000000
    ) {
      setError(
        "Enter an amount between $0.01 and $1,000,000, with at most two decimal places.",
      );
      return;
    }
    if (!destination || !source) {
      setError("Choose both accounts.");
      return;
    }
    if (destination === source) {
      setError("Choose a different destination account.");
      return;
    }
    if (amountCents > Number(selected?.balance_cents || 0)) {
      setError(
        "This account does not have enough funds. Try a smaller amount.",
      );
      return;
    }
    key.current = crypto.randomUUID();
    setStep(3);
  }
  async function send() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ id: string }>(
        "/transfers",
        post({
          source_account_id: source,
          destination_account_id: destination,
          amount_cents: amountCents,
          memo,
          idempotency_key: key.current,
        }),
      );
      setReceipt(r);
      setStep(4);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        step === 4
          ? "Transfer completed"
          : step === 3
            ? "Review your transfer"
            : mode === "send"
              ? "Send money"
              : "Transfer between accounts"
      }
      onClose={step === 4 ? onDone : onClose}
      className="transfer-modal"
    >
      {step === 1 && mode === "send" ? (
        <>
          <p className="muted">
            Find someone you know by their exact username, email, or phone.
          </p>
          <form onSubmit={search}>
            <label>
              Username, email, or phone
              <div className="input-search">
                <Search size={17} />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setSearched(false);
                    setRecipient(null);
                    setResults([]);
                  }}
                  placeholder="e.g. siddhardth"
                  required
                  minLength={2}
                />
                <button className="button primary small" disabled={busy}>
                  {busy ? <Spinner /> : "Find"}
                </button>
              </div>
            </label>
          </form>
          {searched && results.length === 0 && (
            <div className="empty compact">
              No active recipient found. Use an exact username, email, or phone.
            </div>
          )}
          <div className="recipient-list">
            {results.map((r) => (
              <button
                key={r.account_id}
                className={
                  recipient?.account_id === r.account_id ? "chosen" : ""
                }
                onClick={() => setRecipient(r)}
              >
                <span className="avatar">{initials(r.full_name)}</span>
                <div>
                  <strong>{r.full_name}</strong>
                  <small>
                    @{r.username} · {r.bank_name} ••{r.last4}
                  </small>
                  <span className="recipient-meta">
                    {r.account_type && <span>{r.account_type}</span>}
                    {typeof r.holder_count === "number" && (
                      <AccountTag count={r.holder_count} />
                    )}
                  </span>
                </div>
                {recipient?.account_id === r.account_id ? (
                  <Check size={18} />
                ) : (
                  <ChevronRight size={17} />
                )}
              </button>
            ))}
          </div>
          <button
            className="button primary full"
            disabled={!recipient}
            onClick={() => setStep(2)}
          >
            Continue
            <ArrowRight size={17} />
          </button>
        </>
      ) : null}
      {(step === 2 || (step === 1 && mode === "internal")) && (
        <form onSubmit={review}>
          {recipient && (
            <div className="recipient-summary">
              <span className="avatar">{initials(recipient.full_name)}</span>
              <div>
                Sending to<strong>{recipient.full_name}</strong>
                <small>
                  @{recipient.username} · {recipient.bank_name} ••
                  {recipient.last4}
                </small>
              </div>
              <button
                type="button"
                className="text-button"
                onClick={() => setStep(1)}
              >
                Change
              </button>
            </div>
          )}
          <label>
            From account
            <select
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                if (dest === e.target.value) setDest("");
              }}
              required
            >
              <option value="" disabled>
                Select an account
              </option>
              {accounts
                .filter((a) => a.active)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} · {ownership(a.holder_count)} · ••{a.last4} ·{" "}
                    {money(a.balance_cents)}
                  </option>
                ))}
            </select>
          </label>
          {selected && (
            <div className="transfer-account-detail">
              <span className="transfer-account-icon">
                <Landmark size={18} />
              </span>
              <div>
                <strong>
                  {selected.label} <AccountTag count={selected.holder_count} />
                </strong>
                <small>
                  {selected.bank_name} · {selected.account_type} ••
                  {selected.last4}
                </small>
              </div>
              <div className="transfer-available">
                <small>Available</small>
                <strong>{money(selected.balance_cents)}</strong>
              </div>
            </div>
          )}
          {selected?.holder_count && selected.holder_count > 1 ? (
            <p className="shared-account-note">
              Joint account: all owners share this balance and can make
              transfers.
            </p>
          ) : null}
          {mode === "internal" && (
            <label>
              To account
              <select
                value={dest}
                onChange={(e) => setDest(e.target.value)}
                required
              >
                <option value="">Choose destination</option>
                {accounts
                  .filter((a) => a.active && a.id !== source)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label} · {ownership(a.holder_count)} · ••{a.last4}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {mode === "internal" && ownDest && (
            <div className="transfer-destination-detail">
              <span>Receiving account</span>
              <strong>
                {ownDest.bank_name} · {ownDest.account_type} ••{ownDest.last4}
              </strong>
              <AccountTag count={ownDest.holder_count} />
            </div>
          )}
          <label>
            Amount
            <div className="amount-input">
              <span>$</span>
              <input
                aria-label="Amount"
                inputMode="decimal"
                placeholder="0.00"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <small>USD</small>
            </div>
            <span className="field-hint">
              {money(selected?.balance_cents || 0)} available
            </span>
          </label>
          <label>
            Note <span className="optional">Optional</span>
            <input
              placeholder="e.g. Lunch"
              maxLength={140}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </label>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button className="button primary full" type="submit">
            Review transfer
            <ArrowRight size={17} />
          </button>
        </form>
      )}
      {step === 3 && (
        <>
          <div className="review-amount">{money(amountCents)}</div>
          <div className="review-to">
            to {recipient?.full_name || ownDest?.label}
          </div>
          <dl className="receipt-list">
            <div>
              <dt>From</dt>
              <dd>
                {selected?.label} · ••{selected?.last4}{" "}
                {selected && <AccountTag count={selected.holder_count} />}
              </dd>
            </div>
            <div>
              <dt>To</dt>
              <dd>
                {mode === "send"
                  ? `${recipient?.bank_name} · ••${recipient?.last4}`
                  : `${ownDest?.label} · ••${ownDest?.last4}`}
                {mode === "send" &&
                  typeof recipient?.holder_count === "number" && (
                    <AccountTag count={recipient.holder_count} />
                  )}
                {mode === "internal" && ownDest && (
                  <AccountTag count={ownDest.holder_count} />
                )}
              </dd>
            </div>
            <div>
              <dt>Note</dt>
              <dd>{memo || "No note added"}</dd>
            </div>
            <div>
              <dt>Payment type</dt>
              <dd>
                {mode === "send" ? "Person to person" : "Between your accounts"}
              </dd>
            </div>
            <div>
              <dt>Transfer fee</dt>
              <dd>$0.00</dd>
            </div>
            <div>
              <dt>Available after transfer</dt>
              <dd>{money((selected?.balance_cents || 0) - amountCents)}</dd>
            </div>
          </dl>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button
            className="button primary full"
            disabled={busy}
            onClick={send}
          >
            {busy ? (
              <Spinner />
            ) : (
              <>
                Confirm & send
                <ArrowUpRight size={17} />
              </>
            )}
          </button>
          <button
            className="button ghost full"
            disabled={busy}
            onClick={() => setStep(mode === "internal" ? 1 : 2)}
          >
            Edit details
          </button>
        </>
      )}
      {step === 4 && (
        <>
          <div className="success-circle">
            <Check size={30} />
          </div>
          <div className="review-amount">{money(amountCents)}</div>
          <p className="success-copy">
            Sent to <b>{recipient?.full_name || ownDest?.label}</b>.<br />
            Both account balances have been updated.
          </p>
          <div className="receipt-mini">
            Transfer ID<span className="mono">{receipt?.id}</span>
          </div>
          <button className="button primary full" onClick={onDone}>
            Back to overview
            <ArrowRight size={17} />
          </button>
        </>
      )}
      {step === 1 && mode === "send" && error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </Modal>
  );
}
function LinkModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [banks, setBanks] = useState<{ id: string; name: string }[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    api<{ id: string; name: string }[]>("/banks")
      .then(setBanks)
      .catch((e) => setError(e.message));
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        "/accounts",
        post(Object.fromEntries(new FormData(e.currentTarget))),
      );
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Open an account"
      eyebrow="LINK A SIMULATED ACCOUNT"
      onClose={onClose}
    >
      <p className="muted">Choose a simulated bank and name the account.</p>
      <form onSubmit={submit}>
        <label>
          Bank
          <select name="bank_id" required defaultValue="">
            <option value="" disabled>
              Select a simulated bank
            </option>
            {banks.map((b) => (
              <option value={b.id} key={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Account type
          <select name="account_type">
            <option value="checking">Checking</option>
            <option value="savings">Savings</option>
          </select>
        </label>
        <label>
          Give it a name
          <input
            name="label"
            placeholder="e.g. Weekend adventures"
            minLength={1}
            maxLength={60}
            required
          />
        </label>
        <div className="info-note">
          <Landmark size={20} />
          <span>
            Your opening balance will be <b>$200</b> in simulated funds. No bank
            credentials are needed. You can hold up to four accounts, including
            shared accounts.
          </span>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button
          className="button primary full"
          disabled={busy || banks.length === 0}
        >
          {busy ? (
            <Spinner />
          ) : (
            <>
              Create simulated account
              <Plus size={17} />
            </>
          )}
        </button>
      </form>
    </Modal>
  );
}

function ShareModal({
  initialAccount,
  accounts,
  onClose,
  onDone,
}: {
  initialAccount:string;
  accounts: Account[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api(
        "/accounts/" + data.get("account_id") + "/invitations",
        post({ username: data.get("username") }),
      );
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Invite a joint owner"
      eyebrow="SIMULATED JOINT OWNERSHIP"
      onClose={onClose}
    >
      <p className="muted">
        Invite a registered user to share this account. They must accept before
        they can view or spend its balance.
      </p>
      <form onSubmit={submit}>
        <label>
          Account to share
          <select name="account_id" required defaultValue={initialAccount||undefined}>
            {accounts
              .filter((a) => a.active)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} · ••{a.last4}
                </option>
              ))}
          </select>
        </label>
        <label>
          New owner's username
          <input
            name="username"
            required
            pattern="[a-z][a-z0-9_]{2,29}"
            placeholder="Exact registered username"
          />
        </label>
        <p className="form-footnote">
          Invitations expire in 7 days. You can cancel a pending invitation from
          Invitations.
        </p>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? <Spinner /> : "Send invitation"}
        </button>
      </form>
    </Modal>
  );
}
