import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { ReactLenis, type LenisRef } from 'lenis/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ensureUser, refreshRemoteConfig } from './firebase/app';
import { refreshDeviceCapability } from './ai/models';
import { WRITE_ERROR_EVENT } from './data/store';
import { StatusBar } from './components/StatusBar';
import { AccountMenu } from './components/AccountMenu';
import { useReducedMotion } from './hooks/useStatus';
import { Home } from './pages/Home';
const NewAssignment = lazy(() => import('./pages/NewAssignment').then((m) => ({ default: m.NewAssignment })));
const QuickMark = lazy(() => import('./pages/QuickMark').then((m) => ({ default: m.QuickMark })));
const School = lazy(() => import('./pages/School').then((m) => ({ default: m.School })));
const AssignmentPage = lazy(() => import('./pages/AssignmentPage').then((m) => ({ default: m.AssignmentPage })));

gsap.registerPlugin(ScrollTrigger);

type Boot = { state: 'loading' } | { state: 'ready' } | { state: 'error'; message: string };

/** Turns Firebase start-up errors into something a teacher can act on. */
function friendlyStartError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'auth/network-request-failed') return 'You seem to be offline and this device has not signed in before. Connect once to set up REDPEN.';
  if (code === 'auth/configuration-not-found' || code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
    return 'Sign-in is not switched on for this REDPEN project yet (Firebase Authentication > Anonymous).';
  }
  return e instanceof Error ? e.message : 'Could not start';
}

export function App() {
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });
  const lenisRef = useRef<LenisRef>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    let alive = true;
    Promise.all([ensureUser(), refreshRemoteConfig(), refreshDeviceCapability()])
      .then(() => { if (alive) setBoot({ state: 'ready' }); })
      .catch((e: unknown) => { if (alive) setBoot({ state: 'error', message: friendlyStartError(e) }); });
    return () => { alive = false; };
  }, []);

  const [writeError, setWriteError] = useState<string | null>(null);
  useEffect(() => {
    const onError = (e: Event) => setWriteError((e as CustomEvent<string>).detail);
    window.addEventListener(WRITE_ERROR_EVENT, onError);
    return () => window.removeEventListener(WRITE_ERROR_EVENT, onError);
  }, []);

  // Drive Lenis from GSAP's ticker so ScrollTrigger and smooth scroll share one clock.
  useEffect(() => {
    if (reduced) return;
    const update = (time: number) => lenisRef.current?.lenis?.raf(time * 1000);
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);
    const lenis = lenisRef.current?.lenis;
    lenis?.on('scroll', ScrollTrigger.update);
    return () => { gsap.ticker.remove(update); lenis?.off('scroll', ScrollTrigger.update); };
  }, [reduced]);

  const content = (
    <div className="min-h-dvh">
      <header className="z-20 border-b sm:sticky sm:top-0 border-[oklch(88%_0.02_85)] bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <Link to="/" className="flex shrink-0 items-center gap-2.5 font-display text-2xl font-bold tracking-tight" aria-label="REDPEN home">
              <img src="/logo-mark.svg" alt="" width={36} height={36} className="size-9" />
              <span>RED<span className="text-pen">PEN</span></span>
            </Link>
            <nav className="flex w-full items-center gap-2 sm:w-auto" aria-label="Main">
              <Link to="/quick" className="btn-ghost flex-1 whitespace-nowrap text-center text-sm sm:flex-none">Quick mark</Link>
              <Link to="/new" className="btn-pen flex-1 whitespace-nowrap text-center text-sm sm:flex-none">New assignment</Link>
            </nav>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <StatusBar />
            {boot.state === 'ready' && (
              <div className="flex items-start gap-3">
                <Link to="/school" className="pt-1 text-xs font-medium underline decoration-pen/40 underline-offset-4 hover:decoration-pen">School details</Link>
                <AccountMenu />
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        {writeError && (
          <p className="mt-4 rounded-lg border border-pen bg-white p-3 text-pen" role="alert">
            A change could not be saved: {writeError}{' '}
            <button type="button" className="underline" onClick={() => setWriteError(null)}>Dismiss</button>
          </p>
        )}
        {boot.state === 'loading' && <p className="py-20 text-center font-hand text-3xl text-ink-soft">Getting your desk ready…</p>}
        {boot.state === 'error' && (
          <p className="py-20 text-center text-pen" role="alert">REDPEN could not start: {boot.message}</p>
        )}
        {boot.state === 'ready' && (
          <Suspense fallback={<p className="py-20 text-center font-hand text-3xl text-ink-soft">Opening…</p>}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/new" element={<NewAssignment />} />
              <Route path="/quick" element={<QuickMark />} />
              <Route path="/school" element={<School />} />
              <Route path="/a/:id/*" element={<AssignmentPage />} />
            </Routes>
          </Suspense>
        )}
      </main>
    </div>
  );

  if (reduced) return content;
  return <ReactLenis root ref={lenisRef} options={{ autoRaf: false, lerp: 0.12 }}>{content}</ReactLenis>;
}
