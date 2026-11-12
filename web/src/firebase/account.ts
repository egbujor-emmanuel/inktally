// Optional accounts. Every teacher starts as a private guest (anonymous) so REDPEN works instantly.
// "Sign in with Google" LINKS the guest account: same user id, so all existing work is kept, and the
// same assignments then appear on every device (web + Android) where she signs in.
import { useEffect, useState } from 'react';
import {
  GoogleAuthProvider, linkWithPopup, onAuthStateChanged, signInAnonymously, signInWithCredential, signOut, type User,
} from 'firebase/auth';
import { auth } from './app';

export interface Account { user: User | null; isGuest: boolean; label: string }

export function useAccount(): Account {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  const isGuest = !user || user.isAnonymous;
  return { user, isGuest, label: isGuest ? 'Guest' : (user?.displayName || user?.email || 'Signed in') };
}

export type SignInResult = { kind: 'linked' } | { kind: 'switched' } | { kind: 'cancelled' };

/**
 * Upgrades the guest account to Google. If that Google account already exists (e.g. created on another
 * device), we sign into it instead; work made as a guest on THIS device stays with the guest account.
 */
export async function signInWithGoogle(): Promise<SignInResult> {
  const current = auth.currentUser;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    if (current?.isAnonymous) {
      await linkWithPopup(current, provider);
      return { kind: 'linked' };
    }
    throw new Error('Already signed in');
  } catch (error: unknown) {
    const code = (error as { code?: string }).code;
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return { kind: 'cancelled' };
    if (code === 'auth/credential-already-in-use') {
      const credential = GoogleAuthProvider.credentialFromError(error as Parameters<typeof GoogleAuthProvider.credentialFromError>[0]);
      if (!credential) throw error instanceof Error ? error : new Error('Sign-in failed');
      await signInWithCredential(auth, credential);
      return { kind: 'switched' };
    }
    throw error instanceof Error ? error : new Error('Sign-in failed');
  }
}

/** Signs out and continues as a fresh private guest. */
export async function signOutToGuest(): Promise<void> {
  await signOut(auth);
  await signInAnonymously(auth);
}
