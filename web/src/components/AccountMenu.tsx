import { useState } from 'react';
import { signInWithGoogle, signOutToGuest, useAccount } from '../firebase/account';

/** Same as the Android AccountChip: guests see "Save my work"; signed-in teachers see who they are. */
export function AccountMenu() {
  const { isGuest, label } = useAccount();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function handleSignIn() {
    setBusy(true); setNote(null);
    try {
      const result = await signInWithGoogle();
      if (result.kind === 'linked') setNote('Saved to your Google account');
      if (result.kind === 'switched') setNote('Signed in to your account');
    } catch (e: unknown) {
      setNote(`Sign-in failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="grid justify-items-end gap-0.5">
      {isGuest ? (
        <button type="button" className="btn-ghost !min-h-10 !border-border !px-5 !py-2 text-[13px] !font-medium" onClick={() => void handleSignIn()} disabled={busy}
          title="You're a private guest. Sign in with Google to keep your work and use it on your phone and laptop.">
          {busy ? 'Signing in…' : 'Save my work'}
        </button>
      ) : (
        <>
          <span className="text-[13px] font-medium text-ink">{label}</span>
          <button type="button" className="text-xs text-ink-soft" onClick={() => void signOutToGuest()}>Sign out</button>
        </>
      )}
      {note && <p className="text-[11px] text-ink-soft" role="status">{note}</p>}
    </div>
  );
}
