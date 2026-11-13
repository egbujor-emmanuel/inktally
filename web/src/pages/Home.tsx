import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { createAssignment, watchAssignments, type Assignment } from '../data/store';
import { SAMPLES } from '../data/samples';
import { useReducedMotion } from '../hooks/useStatus';
import { friendlyCloudError } from '../ai/errors';
import { ErrorText } from '../ui/Kit';

// Same copy and order as the Android HomeScreen.
const STEPS = [
  { n: '1', title: 'Questions in', body: 'Snap the question paper. The cloud drafts the marking scheme — it never sees a student.' },
  { n: '2', title: 'Marks out, offline', body: 'Photograph each answer sheet. Gemini Nano reads the handwriting on this device; code does the marking.' },
  { n: '3', title: 'Checked when online', body: 'Back on data, every on-device mark is double-checked in the cloud. Disagreements come to you.' },
];

function Tick() {
  return (
    <svg viewBox="0 0 56 56" className="size-[30px] flex-none" aria-hidden>
      <path d="M6 30 L20 44 L50 10" fill="none" stroke="var(--color-pen)" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

function PaperCard({ onClick, children, tick = false, disabled = false }: { onClick: () => void; children: React.ReactNode; tick?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="mx-4 flex items-center rounded-[14px] border border-border bg-paper p-[18px] text-left shadow-[0_2px_6px_rgb(31_42_68/0.12)] transition hover:-translate-y-0.5 disabled:opacity-60">
      <span className="grid flex-1 gap-[3px]">{children}</span>
      {tick && <Tick />}
    </button>
  );
}

export function Home({ signedIn = true }: { signedIn?: boolean }) {
  const [items, setItems] = useState<Assignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [shelf, setShelf] = useState<'active' | 'finished'>('active');
  const navigate = useNavigate();
  const hero = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => (signedIn ? watchAssignments(setItems, (e) => setError(e.message)) : undefined), [signedIn]);

  useGSAP(() => {
    if (reduced) return;
    gsap.from('[data-rise]', { y: 28, opacity: 0, duration: 0.8, ease: 'expo.out', stagger: 0.08 });
  }, { scope: hero, dependencies: [reduced] });

  async function handleSample(index: number) {
    const sample = SAMPLES[index];
    setCreating(sample.title);
    try {
      navigate(`/a/${await createAssignment(sample)}/print`);
    } catch (e: unknown) {
      setError(friendlyCloudError(e).message);
    } finally {
      setCreating(null);
    }
  }

  const active = (items ?? []).filter((a) => (a.status ?? 'active') === 'active');
  const finished = (items ?? []).filter((a) => a.status === 'finished');
  const shown = shelf === 'active' ? active : finished;

  return (
    <div className="grid gap-[14px] pb-7">
      <section ref={hero} className="ruled pt-7 pr-4 pb-7 pl-[52px]" aria-labelledby="hero-title">
        <p data-rise className="font-hand text-[22px] leading-tight text-pen">for anyone with a stack of scripts to mark tonight</p>
        <h1 id="hero-title" data-rise className="mt-1 font-display text-[38px] font-bold leading-[40px] text-ink sm:text-[length:var(--text-hero)] sm:leading-[1.02]">
          A stack of classwork, marked in minutes. <span className="text-pen">Even offline.</span>
        </h1>
        <p data-rise className="mt-3.5 text-base leading-6 text-ink-soft">
          REDPEN reads students’ handwriting with the AI on your device and marks it against your marking scheme.
          Students’ work stays with you; the cloud double-checks every mark when you’re back online.
        </p>
        <p data-rise className="mt-2 text-[13px] leading-[19px] text-ink-soft">
          Any subject, any level — schools, colleges and universities, exam centres, training courses and tutors.
        </p>
        <div data-rise className="mt-[18px] grid gap-2 sm:max-w-md">
          <Link to="/quick" className="btn-pen">Quick mark a page</Link>
          <Link to="/new" className="btn-ghost">Set up an assignment</Link>
        </div>
      </section>

      <div className="hscroll gap-3 px-4" role="region" aria-label="How REDPEN works" tabIndex={0}>
        {STEPS.map((s) => (
          <article key={s.n} className="w-[250px] flex-none rounded-[14px] border border-border bg-paper p-[18px] shadow-[0_3px_8px_rgb(31_42_68/0.12)]">
            <span className="font-hand text-[40px] leading-none text-pen">{s.n}</span>
            <h2 className="font-display text-[19px] font-semibold">{s.title}</h2>
            <p className="mt-1 text-sm leading-5 text-ink-soft">{s.body}</p>
          </article>
        ))}
      </div>

      <h2 className="px-4 pt-3.5 font-display text-[26px] font-bold">Your assignments</h2>
      <div className="tabs mx-4" role="tablist" aria-label="Assignments">
        <button type="button" role="tab" aria-selected={shelf === 'active'} className="tab flex-1" onClick={() => setShelf('active')}>Active ({active.length})</button>
        <button type="button" role="tab" aria-selected={shelf === 'finished'} className="tab flex-1" onClick={() => setShelf('finished')}>Finished ({finished.length})</button>
      </div>
      {items === null && <p className="px-4 text-ink-soft">Loading…</p>}
      {items !== null && shown.length === 0 && (
        <p className="px-4 text-ink-soft">
          {shelf === 'active' ? 'Nothing yet — quick mark a page, set up an assignment, or try a sample below.' : 'Finished assignments stay saved here.'}
        </p>
      )}
      {shown.map((a) => (
        <PaperCard key={a.id} tick onClick={() => navigate(`/a/${a.id}/print`)}>
          <span className="font-display text-lg font-semibold">{a.title}</span>
          <span className="text-sm text-ink-soft">{a.className} · {a.scheme.subject} · {a.scheme.questions.length} questions</span>
        </PaperCard>
      ))}

      <h2 className="px-4 pt-3.5 font-display text-[26px] font-bold">Try it with a sample</h2>
      <ErrorText message={error} />
      <div id="samples" className="grid gap-[14px]">
        {SAMPLES.map((s, i) => (
          <PaperCard key={s.title} onClick={() => void handleSample(i)} disabled={creating !== null || !signedIn}>
            <span className="font-display text-lg font-semibold">{s.title}</span>
            <span className="text-sm text-ink-soft">{s.className} · {s.scheme.subject}</span>
            <span className="mt-1 font-hand text-[22px] text-pen">{creating === s.title ? 'Opening…' : 'Use this →'}</span>
          </PaperCard>
        ))}
      </div>
    </div>
  );
}
