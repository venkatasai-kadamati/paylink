"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  Check,
  Copy,
  Inbox,
  Landmark,
  LoaderCircle,
  RotateCcw,
  Users,
} from "lucide-react";

export type Invitation = {
  id: string;
  account_id: string;
  account_label: string;
  bank_name: string;
  inviter_id: string;
  invitee_id: string;
  inviter_name: string;
  inviter_username: string;
  invitee_name: string;
  invitee_username: string;
  status: string;
  expires_at: string;
  created_at: string;
};
type Account = {
  id: string;
  label: string;
  bank_name: string;
  account_type: string;
  last4: string;
  holder_count: number;
  balance_cents: number;
  active: boolean;
};
type Transfer = {
  id: string;
  amount_cents: number;
  memo: string;
  created_at: string;
  direction: string;
  source_label: string;
  destination_label: string;
  counterparty: string;
};
type Ledger = {
  transfer_id: string;
  postings: { side: string; account_id: string; delta_cents: number }[];
  reversal: {
    original_transfer_id: string;
    reversing_transfer_id: string;
    reason: string;
  } | null;
};
const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n / 100,
  );
async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(
    "/api" + path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  if (!r.ok) {
    const b = await r
      .json()
      .catch(() => ({ detail: "Could not connect. Try again." }));
    throw new Error(
      typeof b.detail === "string" ? b.detail : "Please check your details.",
    );
  }
  return r.json();
}

export function InvitationCenter({
  items,
  userId,
  onRefresh,
}: {
  items: Invitation[];
  userId: string;
  onRefresh: () => void;
}) {
  const [history, setHistory] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const visible = items.filter((i) =>
    history ? i.status !== "pending" : i.status === "pending",
  );
  async function decide(id: string, decision: string) {
    setBusy(id);
    setError("");
    try {
      await api("/account-invitations/" + id + "/decision", { decision });
      onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="invitations-panel">
      <div className="section-heading">
        <div>
          <h2>Joint account requests</h2>
          <p className="muted">
            An account becomes joint only after an invitation is accepted.
          </p>
        </div>
        <div className="filters">
          <button
            className={!history ? "selected" : ""}
            aria-pressed={!history}
            onClick={() => setHistory(false)}
          >
            Pending{" "}
            <span>{items.filter((i) => i.status === "pending").length}</span>
          </button>
          <button
            className={history ? "selected" : ""}
            aria-pressed={history}
            onClick={() => setHistory(true)}
          >
            History
          </button>
        </div>
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      <div className="invitation-list">
        {visible.map((i) => {
          const incoming = i.invitee_id === userId;
          return (
            <article className="invitation-card" key={i.id}>
              <span className="invitation-icon">
                <Users size={23} />
              </span>
              <div className="invitation-copy">
                <div className="invitation-title">
                  <h3>{i.account_label}</h3>
                  <span className={"invitation-status " + i.status}>
                    {i.status}
                  </span>
                </div>
                <p>
                  {incoming
                    ? `${i.inviter_name} (@${i.inviter_username}) invited you`
                    : `Invitation to ${i.invitee_name} (@${i.invitee_username})`}
                </p>
                <small>
                  {i.bank_name} · {i.status === "pending" ? "Expires" : "Sent"}{" "}
                  {new Date(
                    i.status === "pending" ? i.expires_at : i.created_at,
                  ).toLocaleDateString()}
                </small>
              </div>
              {i.status === "pending" && (
                <div className="invitation-actions">
                  {incoming ? (
                    <>
                      <button
                        className="button secondary small"
                        disabled={!!busy}
                        onClick={() => decide(i.id, "declined")}
                      >
                        Decline
                      </button>
                      <button
                        className="button primary small"
                        disabled={!!busy}
                        onClick={() => decide(i.id, "accepted")}
                      >
                        {busy === i.id ? (
                          <LoaderCircle className="spin" size={16} />
                        ) : (
                          <Check size={16} />
                        )}
                        Accept invitation
                      </button>
                    </>
                  ) : (
                    <button
                      className="text-button"
                      disabled={!!busy}
                      onClick={() => decide(i.id, "cancelled")}
                    >
                      Cancel invitation
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
        {!visible.length && (
          <div className="empty invitation-empty">
            <Inbox size={32} />
            <h3>{history ? "No past invitations" : "You’re all caught up."}</h3>
            <p>
              {history
                ? "Accepted, declined and cancelled invitations appear here."
                : "New account invitations will appear here. Invite someone from Accounts to get started."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

export function TransferReceipt({
  transfer,
  accounts,
  hidden,
  onUpdated,
  onPendingChange,
}: {
  transfer: Transfer;
  accounts: Account[];
  hidden: boolean;
  onUpdated: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const [ledger, setLedger] = useState<Ledger | null>(null),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false),
    [returning, setReturning] = useState(false),
    [returnCompleted, setReturnCompleted] = useState(false),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0);
  const key = useRef("");
  const submitting = useRef(false);
  const copyButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let cancelled = false;
    setError("");
    api<Ledger>("/transfers/" + transfer.id + "/detail")
      .then((v) => {
        if (!cancelled) setLedger(v);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [transfer.id, version]);
  const received = ledger?.postings?.find((p) => p.side === "credit");
  const canReturn =
    !!received &&
    accounts.some((a) => a.id === received.account_id && a.active) &&
    !ledger?.reversal && !returnCompleted;
  async function reverse() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    onPendingChange(true);
    setError("");
    if (!key.current) key.current = crypto.randomUUID();
    try {
      await api("/transfers/" + transfer.id + "/reversal", {
        reason,
        idempotency_key: key.current,
      });
      setReturnCompleted(true);
      setReturning(false);
      setVersion((v) => v + 1);
      onUpdated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
      onPendingChange(false);
    }
  }
  return (
    <>
      <div className="receipt-hero">
        <span className="receipt-seal">
          <Check size={26} />
        </span>
        <span className="muted" role="status">
          {ledger?.reversal || returnCompleted ? "Returned transfer" : "Completed transfer"}
        </span>
        <div className="receipt-amount">
          {hidden ? "••••••" : money(transfer.amount_cents)}
        </div>
        <p>
          {transfer.direction === "received"
            ? `From ${transfer.counterparty}`
            : transfer.direction === "internal"
              ? "Between your accounts"
              : `To ${transfer.counterparty}`}
        </p>
      </div>
      <dl className="receipt-list">
        <div>
          <dt>From</dt>
          <dd>{transfer.source_label}</dd>
        </div>
        <div>
          <dt>To</dt>
          <dd>{transfer.destination_label}</dd>
        </div>
        <div>
          <dt>Date</dt>
          <dd>{new Date(transfer.created_at).toLocaleString()}</dd>
        </div>
        <div>
          <dt>Note</dt>
          <dd>{transfer.memo || "No note added"}</dd>
        </div>
        <div>
          <dt>Reference</dt>
          <dd className="mono">{transfer.id}</dd>
        </div>
      </dl>
      {ledger && (
        <details className="ledger-detail">
          <summary>
            Account entries <span>Balanced record</span>
          </summary>
          <p>Equal and opposite entries keep this transfer balanced.</p>
          <dl>
            {(ledger.postings ?? []).map((p) => (
              <div key={p.side}>
                <dt>
                  {p.side === "debit"
                    ? transfer.source_label
                    : transfer.destination_label}
                  <small>{p.side === "debit" ? "Debited" : "Credited"}</small>
                </dt>
                <dd>
                  {hidden
                    ? "••••••"
                    : `${p.delta_cents > 0 ? "+" : "−"}${money(Math.abs(p.delta_cents))}`}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {ledger?.reversal && (
        <div className="info-note">
          <RotateCcw size={18} />
          <span>
            {ledger.reversal.original_transfer_id === transfer.id
              ? "This payment was returned."
              : "This is the return payment."}
            <br />
            Reason: {ledger.reversal.reason}
            <small className="mono">
              Linked reference:{" "}
              {ledger.reversal.original_transfer_id === transfer.id
                ? ledger.reversal.reversing_transfer_id
                : ledger.reversal.original_transfer_id}
            </small>
          </span>
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
          {!ledger && (
            <button onClick={() => setVersion((v) => v + 1)}> Retry</button>
          )}
        </div>
      )}
      <button
        ref={copyButton}
        className="button secondary full"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(transfer.id);
            setCopied(true);
          } catch {
            setError("Select the reference above to copy it.");
          }
        }}
      >
        <Copy size={16} />
        {copied ? "Reference copied" : "Copy transfer ID"}
      </button>
      <span className="sr-only" role="status">
        {copied ? "Transfer reference copied to clipboard." : ""}
      </span>
      {canReturn && !returning && (
        <button
          className="button ghost full return-trigger"
          onClick={() => setReturning(true)}
        >
          <RotateCcw size={16} />
          Return this payment
        </button>
      )}
      {returning && (
        <form
          className="return-form"
          onSubmit={(e) => {
            e.preventDefault();
            reverse();
          }}
        >
          <h3>
            Return {hidden ? "this amount" : money(transfer.amount_cents)}?
          </h3>
          <p>
            This sends the full amount back to the original account. The
            original transfer stays in your history.
          </p>
          <label>
            Reason
            <input
              autoFocus
              data-autofocus
              value={reason}
              disabled={busy}
              onChange={(e) => {
                setReason(e.target.value);
                key.current = "";
              }}
              required
              minLength={1}
              maxLength={140}
              placeholder="e.g. Duplicate payment"
            />
          </label>
          <div className="section-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setReturning(false);
                copyButton.current?.focus();
              }}
            >
              Keep payment
            </button>
            <button
              className="button primary"
              disabled={busy || !reason.trim()}
            >
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <ArrowDownLeft size={16} />
              )}
              {busy ? "Returning payment…" : "Confirm return"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}

export function AccountDetails({
  account,
  hidden,
  onActivity,
  onShare,
}: {
  account: Account;
  hidden: boolean;
  onActivity: () => void;
  onShare: () => void;
}) {
  const [owners, setOwners] = useState<
      { full_name: string; username: string; joined_at: string }[]
    >([]),
    [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    api<typeof owners>("/accounts/" + account.id + "/holders")
      .then((v) => {
        if (!cancelled) setOwners(v);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [account.id]);
  return (
    <>
      <div className="account-detail-hero">
        <Landmark size={29} />
        <span>
          {account.bank_name} · {account.account_type}
        </span>
        <strong>{hidden ? "••••••" : money(account.balance_cents)}</strong>
        <small>Available balance · ••{account.last4}</small>
      </div>
      <div className="section-heading">
        <h3>Account owners</h3>
        <span className="pill">
          {account.holder_count > 1 ? "Joint account" : "Personal account"}
        </span>
      </div>
      <p className="muted owners-note">
        Every owner can view activity and use the shared balance.
      </p>
      {owners.map((o) => (
        <div className="owner-row" key={o.username}>
          <span className="avatar">
            {o.full_name
              .split(" ")
              .map((w) => w[0])
              .slice(0, 2)
              .join("")}
          </span>
          <div>
            <strong>{o.full_name}</strong>
            <small>@{o.username}</small>
          </div>
          <span className="pill">Owner</span>
        </div>
      ))}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="button primary full" onClick={onActivity}>
        View account activity
        <ArrowRight size={17} />
      </button>
      {account.active && (
        <button className="button ghost full" onClick={onShare}>
          <Users size={17} />
          Invite a joint owner
        </button>
      )}
    </>
  );
}
