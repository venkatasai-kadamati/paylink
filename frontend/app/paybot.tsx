'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { EyeOff, X } from 'lucide-react';

const suggestions = [
  'Show my balances', 'Recent transfers', 'Totals this month',
  'Top counterparties', 'Look up a transfer', 'How do I export CSV?',
];

type AnswerDisplay = {
  heading?: string;
  rows: { label: string; value: string; detail?: string }[];
  note?: string;
  summary?: string;
};
type Message = { speaker: 'You' | 'PayBot'; text: string; display?: AnswerDisplay | null };

function Answer({display}: {display: AnswerDisplay}) {
  return <>
    {display.heading && <p>{display.heading}</p>}
    <dl className="paybot-rows">{display.rows.map(({label, value, detail}, index) =>
      <div key={index}><dt>{label}{detail && <small>{detail}</small>}</dt><dd>{value}</dd></div>)}</dl>
    {display.note && <p><small>{display.note}</small></p>}
    {display.summary && <p>{display.summary}</p>}
  </>;
}

export function PayBot({open, onClose, amountsHidden, onRevealAmounts}: {
  open: boolean; onClose: () => void; amountsHidden: boolean; onRevealAmounts: () => void;
}) {
  const panel = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = panel.current;
    if (!open || !element) return;
    element.showModal();
    input.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      element.close();
    };
  }, [open]);

  useEffect(() => {
    if (open && !amountsHidden) input.current?.focus();
  }, [open, amountsHidden]);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [open, messages, waiting, error]);

  async function ask(text: string) {
    text = text.trim();
    if (!text || waiting || amountsHidden) return;
    setMessages(items => items.at(-1)?.speaker === 'You' && items.at(-1)?.text === text
      ? items : [...items, {speaker: 'You', text}]);
    setQuestion('');
    setError('');
    setWaiting(true);
    try {
      const time_zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
      const response = await fetch('/api/paybot', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({question: text, time_zone}),
      });
      if (!response.ok) {
        setError(response.status === 429 ? 'Too many questions. Try again in a minute.' : 'Could not load an answer. Try asking again.');
        setQuestion(text);
        return;
      }
      const {answer, display} = await response.json() as {answer: string; display?: AnswerDisplay | null};
      setMessages(items => [...items, {speaker: 'PayBot', text: answer, display}]);
    } catch {
      setError('Could not reach PayBot. Check your connection and try again.');
      setQuestion(text);
    } finally {
      setWaiting(false);
    }
  }

  return <dialog ref={panel} className="paybot-panel" aria-labelledby="paybot-title"
    onCancel={event => {event.preventDefault(); onClose();}}>
    <header><div><h2 id="paybot-title">PayBot</h2><p>Ask about your accounts and transfers. PayBot can’t move money.</p></div>
      <button className="icon-button" aria-label="Close PayBot" onClick={onClose}><X size={18}/></button>
    </header>
    {amountsHidden ? <div className="paybot-log paybot-privacy" role="status">
      <EyeOff size={28} aria-hidden="true" />
      <h3>Your amounts are hidden</h3>
      <p>Show balances to view your conversation or ask about your accounts.</p>
      <button className="button secondary" onClick={onRevealAmounts}>Show balances</button>
    </div> : <>
    <div className="paybot-log" ref={log}>
      {!messages.length && <div className="paybot-prompts"><h3>Try a question</h3>
        {suggestions.map(prompt => <button key={prompt} onClick={() => {void ask(prompt); input.current?.focus();}}>{prompt}</button>)}
      </div>}
      <div role="log" aria-label="PayBot conversation" aria-live="polite">
        {messages.map(({speaker,text,display}, index) => <div className="paybot-message" key={index}><strong>{speaker}</strong>
          {display ? <Answer display={display}/> : <p>{text}</p>}
        </div>)}
      </div>
      {waiting && <p role="status">Looking up your answer…</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
    <form onSubmit={(event: FormEvent) => {event.preventDefault(); void ask(question);}}>
      <label htmlFor="paybot-question">Your question</label>
      <div><input id="paybot-question" ref={input} maxLength={350} value={question}
        onChange={event => setQuestion(event.target.value)}/>
        <button className="button primary" disabled={waiting || !question.trim()}>Ask</button></div>
    </form>
    </>}
  </dialog>;
}
