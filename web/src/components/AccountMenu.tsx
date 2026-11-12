import { useState } from 'react';
import { signInWithGoogle, signOutToGuest, useAccount } from '../firebase/account';

const MESSAGES = {
  linked: 'Signed in. Your work is now saved to your account and appears on every device you sign in on.',
  switched: 'Signed in to your existing account. Work you did here as a guest stays in the guest space on this device.',
} as const;

/** Header control: guests are nudged to save their work; signed-in teachers see who they are. */
export function AccountMenu() {
  const { isGuest, label } = useAccount();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function handleSignIn() {
    setBusy(true); setNote(null);
    try {
      const result = await signInWithGoogle();
      if (result.kind !== 'cancelled') setNote(MESSAGES[result.kind]);
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      setNote(code === 'auth/operation-not-allowed' ? 'Google sign-in is not switched on for this project yet.' : `Could not sign in: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {isGuest ? (
        <button type="button" className="btn-ghost text-xs" onClick={() => void handleSignIn()} disabled={busy}
          title="You're a private guest. Sign in to keep your work and use it on your phone and laptop.">
          {busy ? 'Signing in…' : 'Save my work · Sign in with Google'}
        </button>
      ) : (
        <>
          <span className="inline-flex items-center gap-2 font-medium">
            <span aria-hidden className="grid size-7 place-items-center rounded-full bg-ink text-xs font-bold text-paper">{label.slice(0, 1).toUpperCase()}</span>
            {label}
          </span>
          <button type="button" className="text-xs text-ink-soft underline" onClick={() => void signOutToGuest()}>Sign out</button>
        </>
      )}
      {note && <p className="basis-full text-xs text-ink-soft" role="status">{note}</p>}
    </div>
  );
}
