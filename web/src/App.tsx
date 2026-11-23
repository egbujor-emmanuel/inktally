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
  if (code === 'auth/network-request-failed') return 'You seem to be offline and this device has not signed in before. Connect once to set up InkTally.';
  if (code === 'auth/configuration-not-found' || code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
    return 'Sign-in is not switched on for this InkTally project yet (Firebase Authentication > Anonymous).';
  }
  return e instanceof Error ? e.message : 'Could not start';
}

function WhenReady({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  return ready ? <>{children}</> : <p className="py-20 text-center font-hand text-3xl text-ink-soft">Getting your desk ready…</p>;
}

export function App() {
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });
  const lenisRef = useRef<LenisRef>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    let alive = true;
    // Only sign-in blocks the first screen. Remote Config (built-in defaults until it arrives) and the
    // on-device AI check run in the background, so the page paints seconds sooner on slow connections.
    void refreshRemoteConfig();
    void refreshDeviceCapability();
    ensureUser()
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
      {/* Same header as the Android app: logo + account, two big buttons, one swipeable status line. */}
      <header className="z-20 border-b border-border bg-paper sm:sticky sm:top-0">
        <div className="mx-auto max-w-3xl lg:max-w-5xl">
          <div className="flex items-center px-4 pt-2.5 lg:gap-3">
            <Link to="/" className="flex items-center gap-2 font-display text-2xl font-bold" aria-label="InkTally home">
              <img src="/logo-mark.svg" alt="" width={36} height={36} className="size-9" />
              <span>Ink<span className="text-pen">Tally</span></span>
            </Link>
            <span className="flex-1" />
            {/* Desktop: the two main actions sit in the header row instead of two full-width buttons. */}
            {boot.state === 'ready' && (
              <nav className="hidden gap-2 lg:flex" aria-label="Main">
                <Link to="/quick" className="btn-ghost px-6">Quick mark</Link>
                <Link to="/new" className="btn-pen px-6">New assignment</Link>
              </nav>
            )}
            {boot.state === 'ready' && <AccountMenu />}
          </div>
          {boot.state === 'ready' && (
            <nav className="grid grid-cols-2 gap-2 px-4 py-1.5 lg:hidden" aria-label="Main">
              <Link to="/quick" className="btn-ghost">Quick mark</Link>
              <Link to="/new" className="btn-pen">New assignment</Link>
            </nav>
          )}
          <StatusBar trailing={boot.state === 'ready' && (
            <Link to="/school" className="px-1.5 text-[13px] font-medium whitespace-nowrap text-ink underline">School details</Link>
          )} />
        </div>
      </header>
      <main className="mx-auto max-w-3xl pb-24 lg:max-w-5xl">
        {writeError && (
          <p className="m-3 bg-white p-3 text-[13px] text-pen" role="alert">
            A change could not be saved: {writeError}{' '}
            <button type="button" className="underline" onClick={() => setWriteError(null)}>Dismiss</button>
          </p>
        )}
        {boot.state === 'error' && (
          <p className="py-20 text-center text-pen" role="alert">InkTally could not start: {boot.message}</p>
        )}
        {/* The home page paints immediately; screens that read or save data wait for sign-in. */}
        {boot.state !== 'error' && (
          <Suspense fallback={<p className="py-20 text-center font-hand text-3xl text-ink-soft">Opening…</p>}>
            <Routes>
              <Route path="/" element={<Home signedIn={boot.state === 'ready'} />} />
              <Route path="/new" element={<NewAssignment />} />
              <Route path="/quick" element={<QuickMark />} />
              <Route path="/school" element={<WhenReady ready={boot.state === 'ready'}><School /></WhenReady>} />
              <Route path="/a/:id/*" element={<WhenReady ready={boot.state === 'ready'}><AssignmentPage /></WhenReady>} />
            </Routes>
          </Suspense>
        )}
      </main>
    </div>
  );

  if (reduced) return content;
  return <ReactLenis root ref={lenisRef} options={{ autoRaf: false, lerp: 0.12 }}>{content}</ReactLenis>;
}
