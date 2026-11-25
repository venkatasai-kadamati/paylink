"use client";
import { useEffect, useRef, useState, useCallback, FormEvent } from "react";
import dynamic from "next/dynamic";
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
const InsightDashboard = dynamic(() => import("./insights"), {
  loading: () => (
    <div className="empty" role="status">
      Loading insights…
    </div>
  ),
});
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
type Workspace = {
  user: User;
  accounts: Account[];
  transfers: Transfer[];
  invitations: Invitation[];
  insights: Insights;
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
class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const r = await fetch("/api" + path, {
    signal: AbortSignal.timeout(options.method === "POST" ? 60000 : 15000),
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (!r.ok) {
    const b = await r.json().catch(() => ({
      detail: "Unable to reach the server. Please try again.",
    }));
    throw new ApiError(
      typeof b.detail === "string"
        ? b.detail
        : "Please check the fields and try again.",
      r.status,
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

function Modal({
  title,
  onClose,
  children,
  className = "",
  busy = false,
  focusKey,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  busy?: boolean;
  focusKey?: number;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const surface = dialog.current;
    surface?.showModal();
    return () => {
      surface?.close();
      document.body.style.overflow = prev;
      before?.focus();
    };
  }, []);
  useEffect(() => {
    const target = !busy && ref.current?.querySelector<HTMLElement>(
      "[data-autofocus]:not(:disabled)",
    );
    (target || heading.current)?.focus();
    ref.current?.scrollTo({ top: 0 });
  }, [title, focusKey, busy]);
  return (
    <dialog
      ref={dialog}
      className="modal-backdrop"
      aria-label={title}
      aria-modal="true"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const stops = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            "button,input,select,textarea,a[href],summary,[tabindex]",
          ) || [],
        ).filter((node) => node.tabIndex >= 0 && !node.matches(":disabled") && node.getClientRects().length > 0);
        const first = stops[0], last = stops[stops.length - 1];
        if (!first) {
          e.preventDefault();
          heading.current?.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }}
      onClick={(e) => {
        if (!busy && e.target === e.currentTarget) onClose();
      }}
    >
      <div className={"modal " + className} ref={ref}>
        <button
          className="icon-button close"
          aria-label="Close dialog"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <h2 ref={heading} tabIndex={-1}>
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}

export default function Home({ hasSession }: { hasSession: boolean }) {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(!hasSession),
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
  const [shareAccount, setShareAccount] = useState("");
  const [invitations, setInvitations] = useState<Invitation[]>([]),
    [selectedAccount, setSelectedAccount] = useState<Account | null>(null),
    [accountFilter, setAccountFilter] = useState(""),
    [startDate, setStartDate] = useState(""),
    [endDate, setEndDate] = useState("");
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const sessionVersion = useRef(0);
  const workspaceRequest = useRef<AbortController | null>(null);
  const logoutPending = useRef(false);
  const mobileToggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1021px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMobile(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  useEffect(() => {
    if (!mobile) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const controls = () =>
      Array.from(
        sidebar.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ) ?? [],
      );
    sidebar.current
      ?.querySelector<HTMLButtonElement>('button[aria-current="page"]')
      ?.focus();
    const handleKey = (event: KeyboardEvent) => {
      // A native PayBot dialog can sit above the navigation sheet.
      // Let that top-most dialog own its keyboard events.
      if (!sidebar.current?.contains(document.activeElement)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setMobile(false);
      }
      if (event.key !== "Tab") return;
      const items = controls(),
        first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      if (mobileToggle.current?.getClientRects().length)
        mobileToggle.current.focus();
    };
  }, [mobile]);
  const refresh = useCallback(async () => {
    const version = sessionVersion.current;
    workspaceRequest.current?.abort();
    const controller = new AbortController();
    workspaceRequest.current = controller;
    const current = () =>
      version === sessionVersion.current &&
      workspaceRequest.current === controller;
    setError("");
    setSessionError("");
    setLoading(true);
    try {
      const data = await api<Workspace>(
        "/workspace?time_zone=" +
          encodeURIComponent(
            Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
          ),
        {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(60000),
          ]),
          cache: "no-store",
        },
      );
      if (current()) {
        setUser(data.user);
        setAccounts(data.accounts);
        setTransfers(data.transfers);
        setInvitations(data.invitations);
        setInsights(data.insights);
        setReady(true);
      }
    } catch (e) {
      if (!current() || controller.signal.aborted) return;
      if (e instanceof ApiError && e.status === 401) {
        // Network/server failures are not evidence that a session expired.
        sessionVersion.current++;
        setUser(null);
        setAccounts([]);
        setTransfers([]);
        setInvitations([]);
        setInsights(null);
        setBot(false);
        setMobile(false);
        setTransferMode(null);
        setDetail(null);
        setLink(false);
        setShare(false);
        setSelectedAccount(null);
        setReady(true);
        setLoading(false);
      } else {
        const message =
          (e as Error).name === "TimeoutError"
            ? "We’re still trying to connect. Your session hasn’t been signed out. Please retry."
            : (e as Error).message;
        setSessionError(message);
        setError(message);
      }
    } finally {
      if (current()) setLoading(false);
    }
  }, []);
  useEffect(() => {
    // Cookie presence is only a server-rendered hint, not authentication.
    if (hasSession) refresh();
    return () => {
      sessionVersion.current++;
      workspaceRequest.current?.abort();
    };
  }, [hasSession, refresh]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (user) document.querySelector<HTMLElement>(".page-heading h1")?.focus();
  }, [tab, user?.id]);
  async function signOut() {
    if (logoutPending.current) return;
    logoutPending.current = true;
    setSigningOut(true);
    sessionVersion.current++;
    workspaceRequest.current?.abort();
    setLoading(false);
    try {
      // Clear the HttpOnly cookie locally, without waiting for the API/database.
      await api("/auth/logout", {
        ...post({}),
        signal: AbortSignal.timeout(10000),
      });
      setUser(null);
      setReady(true);
      setSessionError("");
      setError("");
      setMobile(false);
      setBot(false);
      setAccounts([]);
      setTransfers([]);
      setInsights(null);
      setTab("Overview");
      setSearch("");
      setFilter("All activity");
      setAccountFilter("");
      setStartDate("");
      setEndDate("");
      setTransferMode(null);
      setDetail(null);
      setSelectedAccount(null);
      setInvitations([]);
      setLink(false);
      setShare(false);
      setToast("");
      setHidden(false);
    } catch {
      const message = "We couldn’t sign you out. Please try again.";
      setSessionError(message);
      setError(message);
    } finally {
      logoutPending.current = false;
      setSigningOut(false);
    }
  }
  if (!user && !ready)
    return (
      <main className="session-layout">
        <header>
          <span className="logo">
            <span className="logo-mark">
              <ArrowLeftRight size={22} />
            </span>
            PayLink
          </span>
          <button
            className="button secondary"
            disabled={signingOut}
            onClick={signOut}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </header>
        <section className="session-content">
          <h1>Opening your workspace</h1>
          {sessionError ? (
            <div className="error" role="alert">
              <p>{sessionError}</p>
              <button
                className="button secondary"
                onClick={refresh}
                disabled={loading || signingOut}
              >
                Try again
              </button>
            </div>
          ) : (
            <p role="status">Restoring your secure session…</p>
          )}
          <div className="session-skeleton" aria-hidden="true">
            <div />
            <div />
            <div />
          </div>
        </section>
      </main>
    );
  if (!user)
    return (
      <Auth
        onLogin={(u) => {
          sessionVersion.current++;
          setReady(true);
          setSessionError("");
          setTab("Overview");
          setUser({ ...u, email: "", phone: null });
          refresh();
        }}
      />
    );
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
      `${t.counterparty} ${t.memo} ${t.source_label} ${t.destination_label} ${t.id}`
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
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      {mobile && (
        <div
          className="nav-scrim"
          aria-hidden="true"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        id="paylink-sidebar"
        ref={sidebar}
        role={mobile ? "dialog" : undefined}
        aria-modal={mobile ? true : undefined}
        aria-label="Workspace navigation"
        className={"sidebar " + (mobile ? "mobile-open" : "")}
      >
        <Logo />
        <button
          className="icon-button mobile-close"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        >
          <X size={21} />
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {[
            { name: "Overview", icon: LayoutDashboard },
            { name: "Activity", icon: ArrowLeftRight },
            { name: "Accounts", icon: Wallet },
            { name: "Balance", icon: Landmark },
            { name: "Insights", icon: ChartNoAxesColumnIncreasing },
          ].map(({ name, icon: Icon }) => (
            <button
              key={name}
              aria-label={name}
              aria-describedby={
                name === "Accounts" &&
                invitations.some(
                  (i) => i.status === "pending" && i.invitee_id === user.id,
                )
                  ? "pending-joint-requests"
                  : undefined
              }
              className={tab === name ? "active" : ""}
              onClick={() => nav(name)}
              aria-current={tab === name ? "page" : undefined}
            >
              <Icon size={19} />
              {name}
              {name === "Accounts" &&
                invitations.some(
                  (i) => i.status === "pending" && i.invitee_id === user.id,
                ) && (
                  <span className="nav-count" id="pending-joint-requests">
                    <span className="sr-only">
                      Pending joint account requests:{" "}
                    </span>
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
            <ArrowUpRight
              className="paybot-arrow"
              size={17}
              aria-hidden="true"
            />
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
              disabled={signingOut}
              onClick={signOut}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-wrap" inert={mobile}>
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            ref={mobileToggle}
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
              aria-label="View joint account requests"
              onClick={() => nav("Accounts")}
            >
              <Bell size={18} />
            </button>
            <span className="avatar">{initials(user.full_name)}</span>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="dashboard"
          data-page={tab}
        >
          <div className="page-heading">
            <div>
              <h1 tabIndex={-1}>
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
                    Overview: "Your accounts and recent activity, at a glance.",
                    Activity: "Find, filter, and export your transfers.",
                    Accounts: "Manage personal accounts and shared ownership.",
                    Balance: "A breakdown of your available simulated funds.",
                    Insights:
                      "Understand your incoming and outgoing transfers.",
                    Invitations:
                      "Review and manage shared account invitations.",
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
                        aria-pressed={hidden}
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
                                (hidden ? 0 : (Number(d.received) /
                                    Math.max(
                                      1,
                                      ...(insights?.weekly ?? []).map((x) =>
                                        Number(x.received),
                                      ),
                                    )) *
                                    27) + "px",
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
                        aria-pressed={hidden}
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
                            onClick={() => {
                              setShareAccount("");
                              setShare(true);
                            }}
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
                        {tab !== "Overview" && <span className="account-ownership">
                          {ownership(a.holder_count)}
                          {!a.active && " / Inactive"}
                        </span>}
                        <span className="account-balance">
                          <small>{tab === "Overview"
                            ? `${ownership(a.holder_count)} balance${a.active ? "" : " · Inactive"}`
                            : "Available balance"}</small>
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
              {tab === "Accounts" && (
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
                    onClick={() => nav("Accounts")}
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
                  {tab === "Activity" && <div className="activity-tools">
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
                      {search && (
                        <button
                          className="icon-button"
                          aria-label="Clear activity search"
                          onClick={() => setSearch("")}
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  </div>}
                  {tab === "Activity" && (
                    <details className="activity-filter-disclosure">
                      <summary><SlidersHorizontal size={16} aria-hidden="true" /> Filters
                        {[accountFilter, startDate, endDate].filter(Boolean).length > 0 &&
                          <span> · {[accountFilter, startDate, endDate].filter(Boolean).length} applied</span>}
                        <ChevronRight className="filter-chevron" size={16} aria-hidden="true" />
                      </summary>
                      <div className="activity-advanced">
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
                      {(accountFilter ||
                        startDate ||
                        endDate ||
                        search ||
                        filter !== "All activity") && (
                        <button
                          className="text-button"
                          onClick={() => {
                            setAccountFilter("");
                            setStartDate("");
                            setEndDate("");
                            setSearch("");
                            setFilter("All activity");
                          }}
                        >
                          Reset filters
                        </button>
                      )}
                      </div>
                    </details>
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
                        {(tab === "Overview" ? transfers : visible)
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
                                    <small className="mobile-transaction-date">
                                      {date(t.created_at)}
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
                        {search ||
                        accountFilter ||
                        startDate ||
                        endDate ||
                        filter !== "All activity"
                          ? "No matching activity."
                          : "No transfers yet."}
                      </h3>
                      <p>
                        {search ||
                        accountFilter ||
                        startDate ||
                        endDate ||
                        filter !== "All activity"
                          ? "Try another search or reset your filters to see more transfers."
                          : "Send to someone or move money between your accounts."}
                      </p>
                    </div>
                  )}
                  <div className="table-footer">
                    <span className="table-note">
                      {tab === "Overview"
                        ? "Your latest transfers"
                        : "Select a transfer to view its receipt"}
                    </span>
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
                <InsightDashboard
                  accounts={accounts}
                  hidden={hidden}
                  onActivity={(day, account) => {
                    nav("Activity");
                    setStartDate(day);
                    setEndDate(day);
                    setAccountFilter(account);
                    setFilter("All activity");
                    setSearch("");
                  }}
                />
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
          onCommitted={refresh}
          onDone={() => {
            setTransferMode(null);
            nav("Overview");
            setToast("Transfer completed.");
          }}
          onActivity={(id) => {
            setTransferMode(null);
            nav("Activity");
            setSearch(id || "");
            refresh();
          }}
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
              "Invitation sent. The new owner can review it in Accounts.",
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
        <Modal
          title="Transfer details"
          busy={receiptBusy}
          onClose={() => setDetail(null)}
        >
          <TransferReceipt
            key={detail.id}
            transfer={detail}
            accounts={accounts}
            hidden={hidden}
            onUpdated={refresh}
            onPendingChange={setReceiptBusy}
          />
        </Modal>
      )}
      <PayBot open={bot} onClose={() => setBot(false)} amountsHidden={hidden}
        onRevealAmounts={() => setHidden(false)} />
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
  onCommitted,
  onActivity,
}: {
  mode: "send" | "internal";
  accounts: Account[];
  onClose: () => void;
  onDone: () => void;
  onCommitted: () => void;
  onActivity: (id?: string) => void;
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
    [amountError, setAmountError] = useState(""),
    [unconfirmed, setUnconfirmed] = useState(false),
    [copied, setCopied] = useState(false),
    [searched, setSearched] = useState(false),
    [receipt, setReceipt] = useState<{
      id: string;
      created_at?: string;
    } | null>(null);
  const key = useRef<string>("");
  const sending = useRef(false);
  const searchVersion = useRef(0);
  const amountInput = useRef<HTMLInputElement>(null);
  const selected = accounts.find((a) => a.id === source);
  const amountCents = Math.round(Number(amount) * 100);
  const ownDest = accounts.find((a) => a.id === dest);
  const destination = mode === "send" ? recipient?.account_id : dest;
  const stages =
    mode === "send" ? ["Recipient", "Amount", "Review"] : ["Details", "Review"];
  const currentStage = mode === "send" ? step - 1 : step === 3 ? 1 : 0;
  async function search(e: FormEvent) {
    e.preventDefault();
    const version = ++searchVersion.current;
    setBusy(true);
    setError("");
    setRecipient(null);
    setResults([]);
    setSearched(false);
    try {
      const recipients = await api<Recipient[]>(
        "/recipients?q=" + encodeURIComponent(q.trim()),
      );
      if (version === searchVersion.current) {
        setResults(recipients);
        setSearched(true);
      }
    } catch (e) {
      if (version === searchVersion.current) setError((e as Error).message);
    } finally {
      if (version === searchVersion.current) setBusy(false);
    }
  }
  function review(e: FormEvent) {
    e.preventDefault();
    setError("");
    setAmountError("");
    if (
      !/^(?:\d+\.?\d{0,2}|\.\d{1,2})$/.test(amount.trim()) ||
      !Number.isSafeInteger(amountCents) ||
      amountCents < 1 ||
      amountCents > 100000000
    ) {
      setAmountError(
        "Enter an amount between $0.01 and $1,000,000, with at most two decimal places.",
      );
      amountInput.current?.focus();
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
      setAmountError(
        "This account does not have enough funds. Try a smaller amount.",
      );
      amountInput.current?.focus();
      return;
    }
    setAmount((amountCents / 100).toFixed(2));
    key.current = crypto.randomUUID();
    setStep(3);
  }
  async function send() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ id: string; created_at?: string }>(
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
      setUnconfirmed(false);
      setStep(4);
      onCommitted();
    } catch (e) {
      const unknown = !(e instanceof ApiError) || e.status >= 500;
      setUnconfirmed(unknown);
      setError(
        unknown
          ? "We couldn’t confirm the result yet. Retry confirmation to check the same transfer, or check Activity before starting another payment."
          : (e as Error).message,
      );
    } finally {
      sending.current = false;
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
      busy={busy && step === 3}
      focusKey={step}
    >
      {step < 4 && (
        <ol className="transfer-steps" aria-label="Transfer progress">
          {stages.map((label, i) => (
            <li
              key={label}
              aria-current={i === currentStage ? "step" : undefined}
              className={i < currentStage ? "complete" : ""}
            >
              <span aria-hidden="true">
                {i < currentStage ? <Check size={14} /> : i + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>
      )}
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
                  data-autofocus
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    searchVersion.current++;
                    setBusy(false);
                    setError("");
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
                aria-pressed={recipient?.account_id === r.account_id}
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
            onClick={() => {
              setError("");
              setStep(2);
            }}
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
                onClick={() => {
                  setError("");
                  setAmountError("");
                  setStep(1);
                }}
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
                setAmountError("");
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
            <div className={"amount-input" + (amountError ? " invalid" : "")}>
              <span>$</span>
              <input
                aria-label="Amount"
                aria-invalid={!!amountError}
                aria-describedby={
                  amountError ? "amount-error amount-hint" : "amount-hint"
                }
                ref={amountInput}
                data-autofocus
                inputMode="decimal"
                placeholder="0.00"
                required
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setAmountError("");
                }}
              />
              <small>USD</small>
            </div>
            <span className="field-hint" id="amount-hint">
              {money(selected?.balance_cents || 0)} available
            </span>
          </label>
          {amountError && (
            <p className="field-error" id="amount-error" role="alert">
              {amountError}
            </p>
          )}
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
              <dt>Estimated balance after</dt>
              <dd>{money((selected?.balance_cents || 0) - amountCents)}</dd>
            </div>
          </dl>
          <p className="transfer-confirm-note">
            {mode === "send"
              ? "Check the recipient and amount before confirming."
              : "Move money between your accounts with no change to your total balance."}
          </p>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button
            className="button primary full"
            disabled={busy}
            aria-busy={busy}
            onClick={send}
          >
            {busy ? (
              <>
                <Spinner />
                <span>Sending transfer…</span>
              </>
            ) : (
              <>
                <span>
                  {unconfirmed
                    ? "Retry confirmation"
                    : `Confirm & send ${money(amountCents)}`}
                </span>
                <ArrowUpRight size={17} />
              </>
            )}
          </button>
          {busy && (
            <p className="transfer-confirm-note" role="status">
              Waiting for confirmation. Your receipt will appear here.
            </p>
          )}
          <button
            className="button ghost full"
            disabled={busy}
            onClick={() => {
              if (unconfirmed) onActivity();
              else {
                setError("");
                setStep(mode === "internal" ? 1 : 2);
              }
            }}
          >
            {unconfirmed ? "Check Activity" : "Edit details"}
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
          {receipt?.created_at && (
            <p className="transfer-confirm-note">
              {new Date(receipt.created_at).toLocaleString()}
            </p>
          )}
          <button
            className="button secondary full"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(receipt!.id);
                setCopied(true);
                setError("");
              } catch {
                setError("Select the transfer ID above to copy it.");
              }
            }}
          >
            <Copy size={16} />
            {copied ? "Reference copied" : "Copy transfer ID"}
          </button>
          <span className="sr-only" role="status">
            {copied ? "Transfer reference copied to clipboard." : ""}
          </span>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button primary full"
            onClick={() => onActivity(receipt?.id)}
          >
            View in Activity
            <ArrowRight size={17} />
          </button>
          <button className="button ghost full" onClick={onDone}>
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
      onClose={onClose}
      busy={busy}
    >
      <p className="muted">Choose a simulated bank and name the account.</p>
      <form onSubmit={submit}>
        <fieldset className="pending-fields" disabled={busy}>
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
              Your opening balance will be <b>$200</b> in simulated funds. No
              bank credentials are needed. You can hold up to four accounts,
              including shared accounts.
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
              <>
                <Spinner />
                Creating account…
              </>
            ) : (
              <>
                Create simulated account
                <Plus size={17} />
              </>
            )}
          </button>
        </fieldset>
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
  initialAccount: string;
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
      onClose={onClose}
      busy={busy}
    >
      <p className="muted">
        Invite a registered user to share this account. They must accept before
        they can view or spend its balance.
      </p>
      <form onSubmit={submit}>
        <fieldset className="pending-fields" disabled={busy}>
          <label>
            Account to share
            <select
              name="account_id"
              required
              defaultValue={initialAccount || undefined}
            >
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
            Invitations expire in 7 days. You can cancel a pending invitation
            from Accounts.
          </p>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button className="button primary full" disabled={busy}>
            {busy ? (
              <>
                <Spinner />
                Sending invitation…
              </>
            ) : (
              "Send invitation"
            )}
          </button>
        </fieldset>
      </form>
    </Modal>
  );
}
