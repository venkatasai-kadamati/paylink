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
  MoveUpRight,
} from "lucide-react";

export function Auth({ onLogin }: { onLogin: () => void }) {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [show, setShow] = useState(false);
  async function request(path: string, data: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/" + path, {
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
      onLogin();
    } catch (e) {
      setError((e as Error).message);
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
          paylink<span className="brand-period">.</span>
        </a>
        <div className="story-copy">
          <span className="story-kicker">
            <span /> A little more connected
          </span>
          <h1>
            Your money.
            <br />
            Your people.
            <br />
            <em>One place.</em>
          </h1>
          <p>
            Move money, share an account, and keep the whole picture in view.
          </p>
        </div>
        <div className="auth-art" aria-hidden="true">
          <div className="art-orbit" />
          <div className="art-orbit second" />
          <div className="art-account">
            <span className="art-symbol">
              <ArrowLeftRight size={32} />
            </span>
            <span>Everyday, together.</span>
            <strong>
              Make room for
              <br />
              what matters.
            </strong>
            <div className="art-account-foot">
              <span>Personal + joint accounts</span>
              <MoveUpRight size={23} />
            </div>
          </div>
          <div className="art-confirm">
            <span>
              <Check size={18} />
            </span>
            <div>
              Right where it belongs.<small>Instant simulated transfers</small>
            </div>
          </div>
        </div>
        <footer>
          <span>Built for everyday connections.</span>
          <span>01 — PayLink</span>
        </footer>
      </section>
      <section className="auth-entry">
        <div className="auth-top">
          <span className="auth-mobile-brand">paylink.</span>
          <span>
            {register ? "Already a member?" : "New around here?"}{" "}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setRegister(!register);
                setError("");
                setShow(false);
              }}
            >
              {register ? "Sign in" : "Create an account"}{" "}
              <ArrowRight size={14} />
            </button>
          </span>
        </div>
        <div className="auth-content">
          <div className="auth-title">
            <span className="eyebrow">
              {register ? "LET’S GET YOU SET UP" : "YOUR EVERYDAY MONEY SPACE"}
            </span>
            <h2>{register ? "A fresh start." : "Good to see you."}</h2>
            <p>
              {register
                ? "Create your PayLink profile. Your first simulated account is on us."
                : "Sign in to pick up where you left off."}
            </p>
          </div>
          <form onSubmit={submit} key={register ? "register" : "login"}>
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
            <label>
              {register ? "Username" : "Username or email"}
              <input
                autoFocus={!register}
                name="username"
                required
                autoComplete="username"
                minLength={register ? 3 : undefined}
                maxLength={register ? 30 : undefined}
                pattern={register ? "[a-z][a-z0-9_]{2,29}" : undefined}
                placeholder={
                  register ? "e.g. jordan_lee" : "Enter your username or email"
                }
              />
              {register && (
                <span className="field-hint">
                  3–30 lowercase letters, numbers, or underscores. Start with a
                  letter.
                </span>
              )}
            </label>
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
                <LoaderCircle className="spin" size={18} />
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
                <span>Or take a look around</span>
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
            <LockKeyhole size={13} /> Simulated funds. Real peace of mind.
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
