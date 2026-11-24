"use client";
import { FormEvent, useState } from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Landmark,
  MessageSquare,
  Users,
} from "lucide-react";

export function Auth({
  onLogin,
}: {
  onLogin: (user: { id: string; username: string; full_name: string }) => void;
}) {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [show, setShow] = useState(false);
  async function request(path: string, data: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/" + path, {
        signal: AbortSignal.timeout(60000),
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) {
        const b = await r.json();
        throw new Error(
          typeof b.detail === "string"
            ? b.detail
            : "Please check your details and try again.",
        );
      }
      onLogin(await r.json());
    } catch (e) {
      setError(
        (e as Error).name === "TimeoutError"
          ? "The server is taking longer to respond. Please try again."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    request(
      register ? "register" : "login",
      Object.fromEntries(new FormData(e.currentTarget)),
    );
  }
  return (
    <main className="auth-layout">
      <section className="auth-story" aria-label="About PayLink">
        <a className="logo" href="/">
          <span className="logo-mark">
            <ArrowLeftRight size={22} />
          </span>
          PayLink
        </a>
        <div className="story-copy">
          <span className="story-kicker">
            <span /> Your everyday banking workspace
          </span>
          <h2>
            Every account.
            <br />
            Every transfer.
            <br />
            <em>A clearer view.</em>
          </h2>
          <p>
            A considered space to manage your money, move it with confidence,
            and share an account on your terms.
          </p>
        </div>
        <div className="auth-illustration">
          <div>
            <span className="auth-feature-icon">
              <Landmark size={21} aria-hidden="true" />
            </span>
            <span>
              <strong>One view of your accounts</strong>
              <small>Personal balances. Shared possibilities.</small>
            </span>
          </div>
          <div>
            <span className="auth-feature-icon">
              <Users size={21} aria-hidden="true" />
            </span>
            <span>
              <strong>Better, together</strong>
              <small>Joint accounts, by invitation.</small>
            </span>
          </div>
          <div>
            <span className="auth-feature-icon">
              <MessageSquare size={21} aria-hidden="true" />
            </span>
            <span>
              <strong>A little help from PayBot</strong>
              <small>Answers from your own account activity.</small>
            </span>
          </div>
        </div>
        <footer>
          <LockKeyhole size={15} aria-hidden="true" />
          <span>A banking simulation. No real money moves.</span>
        </footer>
      </section>
      <section className="auth-entry">
        <div className="auth-top">
          <span className="auth-mobile-brand">PayLink</span>
          <span>
            <span className="auth-toggle-copy">
              {register ? "Already have an account?" : "New to PayLink?"}
            </span>{" "}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setRegister(!register);
                setError("");
                setShow(false);
              }}
            >
              {register ? "Sign in" : "Create account"} <ArrowRight size={14} />
            </button>
          </span>
        </div>
        <div className="auth-content">
          <div className="auth-title">
            <span className="eyebrow">
              {register ? "LET’S GET YOU SET UP" : "YOUR EVERYDAY MONEY SPACE"}
            </span>
            <h1>{register ? "Create your account" : "Welcome back"}</h1>
            <p>
              {register
                ? "Start with a profile and $200 in simulated funds. No real bank details needed."
                : "Sign in to your PayLink workspace."}
            </p>
          </div>
          <form
            onSubmit={submit}
            key={register ? "register" : "login"}
            aria-busy={busy}
          >
            {register && (
              <label>
                Full name
                <input
                  autoFocus
                  name="full_name"
                  required
                  maxLength={80}
                  autoComplete="name"
                  placeholder="Your full name"
                />
              </label>
            )}
            <div>
              <label>
                {register ? "Username" : "Username or email"}
                <input
                  autoFocus={!register}
                  name="username"
                  required
                  autoComplete="username"
                  aria-describedby={register ? "username-hint" : undefined}
                  minLength={register ? 3 : undefined}
                  maxLength={register ? 30 : undefined}
                  pattern={register ? "[a-z][a-z0-9_]{2,29}" : undefined}
                  placeholder={
                    register
                      ? "e.g. jordan_lee"
                      : "Enter your username or email"
                  }
                />
              </label>
              {register && (
                <span id="username-hint" className="field-hint">
                  3–30 lowercase letters, numbers, or underscores. Start with a
                  letter.
                </span>
              )}
            </div>
            {register && (
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </label>
            )}
            <label>
              Password
              <div className="password-field">
                <input
                  name="password"
                  type={show ? "text" : "password"}
                  minLength={register ? 10 : 1}
                  maxLength={128}
                  required
                  autoComplete={register ? "new-password" : "current-password"}
                  placeholder={
                    register ? "At least 10 characters" : "Enter your password"
                  }
                />
                <button
                  type="button"
                  aria-label={show ? "Hide password" : "Show password"}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {register && (
              <div className="registration-note">
                <span>
                  <Check size={15} /> $200 simulated opening balance
                </span>
                <span>
                  <Check size={15} /> No real bank details needed
                </span>
              </div>
            )}
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <button className="button primary full auth-submit" disabled={busy}>
              {busy ? (
                <>
                  <LoaderCircle className="spin" size={18} aria-hidden="true" />
                  <span>{register ? "Creating account…" : "Signing in…"}</span>
                </>
              ) : (
                <>
                  {register ? "Create account" : "Sign in"}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          {process.env.NEXT_PUBLIC_DEMO_ENABLED === "true" && !register && (
            <section className="auth-demos" aria-labelledby="demo-profiles">
              <div className="demo-divider">
                <span>Explore with a demo</span>
              </div>
              <div className="section-heading">
                <h3 id="demo-profiles">Demo profiles</h3>
                <span>No password needed</span>
              </div>
              <div className="demo-profile-grid">
                {[
                  { name: "Sai", username: "sai", initials: "SK" },
                  {
                    name: "Siddhardth",
                    username: "siddhardth",
                    initials: "SP",
                  },
                ].map((d) => (
                  <button
                    key={d.username}
                    disabled={busy}
                    aria-label={"Sign in as " + d.name}
                    onClick={() => request("demo", { username: d.username })}
                  >
                    <span className="avatar">{d.initials}</span>
                    <span>
                      <strong>{d.name}</strong>
                      <small>@{d.username}</small>
                    </span>
                    <ArrowRight size={16} />
                  </button>
                ))}
              </div>
            </section>
          )}
          <p className="auth-safety">
            <LockKeyhole size={15} aria-hidden="true" /> Banking simulation · No
            real money moves
          </p>
        </div>
        <footer className="auth-footer">
          <span>PayLink · Banking simulation</span>
          <span>No real money moves.</span>
        </footer>
      </section>
    </main>
  );
}
