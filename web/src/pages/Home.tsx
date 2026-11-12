import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { createAssignment, watchAssignments, type Assignment } from '../data/store';
import { SAMPLES } from '../data/samples';
import { MarkGlyph } from '../components/MarkGlyph';
import { useReducedMotion } from '../hooks/useStatus';
import { friendlyCloudError } from '../ai/errors';

const STEPS = [
  { n: '1', title: 'Questions in', body: 'Snap the question paper. The cloud drafts the marking scheme — it never sees a student.' },
  { n: '2', title: 'Marks out, offline', body: 'Photograph each answer sheet. Gemini Nano reads the handwriting on your device; code does the marking.' },
  { n: '3', title: 'Checked when online', body: 'Back on data, every on-device mark is double-checked in the cloud. Disagreements come to you.' },
];

export function Home() {
  const [items, setItems] = useState<Assignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [show, setShow] = useState<'active' | 'finished'>('active');
  const navigate = useNavigate();
  const hero = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => watchAssignments(setItems, (e) => setError(e.message)), []);

  useGSAP(() => {
    if (reduced) return;
    gsap.from('[data-rise]', { y: 28, opacity: 0, duration: 0.8, ease: 'expo.out', stagger: 0.08 });
  }, { scope: hero, dependencies: [reduced] });

  async function handleSample(index: number) {
    const sample = SAMPLES[index];
    setCreating(sample.title);
    try {
      const id = await createAssignment(sample);
      navigate(`/a/${id}/print`);
    } catch (e: unknown) {
      setError(friendlyCloudError(e).message);
    } finally {
      setCreating(null);
    }
  }

  return (
    <>
      <section ref={hero} className="ruled -mx-4 px-4 pb-16 pt-14 sm:-mx-6 sm:px-6 sm:pl-20" aria-labelledby="hero-title">
        <p data-rise className="font-hand text-2xl text-pen">for anyone with a stack of scripts to mark tonight</p>
        <h1 id="hero-title" data-rise className="mt-2 max-w-4xl font-display text-[length:var(--text-hero)] font-bold leading-[0.95] tracking-tight">
          A stack of classwork, marked in minutes. <span className="text-pen">Even offline.</span>
        </h1>
        <p data-rise className="mt-6 max-w-2xl text-lg text-ink-soft">
          REDPEN reads students’ handwriting with the AI already on your device and marks it against <em>your</em> marking scheme.
          Students’ work stays with you. When you’re back online, the cloud double-checks every mark.
        </p>
        <p data-rise className="mt-3 max-w-2xl text-sm text-ink-soft">
          Any subject, any level — if you have a marking guide, REDPEN can use it: primary and secondary schools, colleges and
          universities, exam centres, training and certification courses, and private tutors.
        </p>
        <div data-rise className="mt-8 flex flex-wrap gap-3">
          <Link to="/quick" className="btn-pen">Quick mark a page</Link>
          <Link to="/new" className="btn-ghost">Set up an assignment</Link>
          <a href="#samples" className="btn-ghost">Try a sample</a>
        </div>
      </section>

      <section className="mt-12 grid gap-4 md:grid-cols-3" aria-label="How REDPEN works">
        {STEPS.map((s, i) => (
          <article key={s.n} className="paper-card relative p-6" style={{ transform: `rotate(${(i - 1) * 0.6}deg)` }}>
            <span className="font-hand text-5xl text-pen">{s.n}</span>
            <h2 className="mt-1 font-display text-xl font-bold">{s.title}</h2>
            <p className="mt-2 text-ink-soft">{s.body}</p>
          </article>
        ))}
      </section>

      <section className="mt-16" aria-labelledby="mine">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="mine" className="font-display text-3xl font-bold">Your assignments</h2>
          <div role="tablist" aria-label="Filter assignments" className="flex gap-1 rounded-full border border-[oklch(85%_0.02_85)] p-1 text-sm">
            {(['active', 'finished'] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={show === k} onClick={() => setShow(k)}
                className={`rounded-full px-4 py-1.5 font-semibold ${show === k ? 'bg-ink text-paper' : 'text-ink-soft'}`}>
                {k === 'active' ? 'Active' : 'Finished'} ({items?.filter((a) => (a.status ?? 'active') === k).length ?? 0})
              </button>
            ))}
          </div>
        </div>
        {error && <p className="mt-3 text-pen" role="alert">{error}</p>}
        {items === null && !error && <p className="mt-4 text-ink-soft">Loading…</p>}
        {items?.length === 0 && <p className="mt-4 text-ink-soft">Nothing yet — start one, or try a sample below.</p>}
        {items && items.length > 0 && !items.some((a) => (a.status ?? 'active') === show) && <p className="mt-4 text-ink-soft">{show === 'finished' ? 'No finished assignments yet.' : 'No active assignments — everything is finished.'}</p>}
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {items?.filter((a) => (a.status ?? 'active') === show).map((a) => (
            <li key={a.id}>
              <Link to={`/a/${a.id}/mark`} className="paper-card flex items-center justify-between gap-4 p-5 transition-transform hover:-translate-y-0.5">
                <span>
                  <span className="block font-display text-lg font-bold">{a.title}</span>
                  <span className="text-sm text-ink-soft">{a.className} · {a.scheme.subject} · {a.scheme.questions.length} questions</span>
                </span>
                <MarkGlyph kind="tick" size={32} label="Open" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section id="samples" className="mt-16" aria-labelledby="samples-title">
        <h2 id="samples-title" className="font-display text-3xl font-bold">Try it with a sample</h2>
        <p className="mt-2 text-ink-soft">Each sample comes with its marking scheme and printable answer sheets.</p>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {SAMPLES.map((s, i) => (
            <button key={s.title} type="button" onClick={() => void handleSample(i)} disabled={creating !== null}
              className="paper-card p-5 text-left transition-transform hover:-translate-y-0.5 disabled:opacity-60">
              <span className="block font-display text-lg font-bold">{s.title}</span>
              <span className="text-sm text-ink-soft">{s.className} · {s.scheme.subject}</span>
              <span className="mt-3 block font-hand text-xl text-pen">{creating === s.title ? 'Setting up…' : 'Use this →'}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
