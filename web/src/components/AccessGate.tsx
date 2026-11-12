import { useState, type FormEvent, type ReactNode } from 'react';

// Private-preview gate used until submission day. Obscurity only (not security): data access is
// enforced by Firestore rules + App Check. Remove by leaving VITE_ACCESS_CODE_SHA256 empty.
const EXPECTED = import.meta.env.VITE_ACCESS_CODE_SHA256;
const STORAGE_KEY = 'redpen-access';

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function remembered(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === EXPECTED; } catch { return false; }
}

export function AccessGate({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(() => !EXPECTED || remembered());
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if ((await sha256Hex(code.trim())) === EXPECTED) {
      try { localStorage.setItem(STORAGE_KEY, EXPECTED ?? ''); } catch { /* private window: ask again next time */ }
      setIsOpen(true);
    } else {
      setError('That code is not right.');
    }
  }

  if (isOpen) return <>{children}</>;
  return (
    <main className="ruled grid min-h-dvh place-items-center px-4">
      <form onSubmit={(e) => void handleSubmit(e)} className="paper-card grid w-full max-w-sm gap-4 p-8">
        <img src="/logo-mark.svg" alt="" width={56} height={56} className="size-14" />
        <h1 className="font-display text-3xl font-bold">REDPEN preview</h1>
        <label className="text-sm font-medium">Access code
          <input className="mt-1 w-full rounded-lg border border-[oklch(82%_0.02_85)] bg-white px-3 py-2" value={code}
            onChange={(e) => setCode(e.target.value)} autoComplete="off" autoFocus />
        </label>
        {error && <p className="text-sm text-pen" role="alert">{error}</p>}
        <button type="submit" className="btn-pen">Enter</button>
      </form>
    </main>
  );
}
