// The Firebase console's AI monitoring does not show on-device inference, so REDPEN records
// where each inference ran (and how long it took) in Firestore: one counter doc per teacher per day.
import { doc, increment, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/app';
import type { ReadSource } from '../domain/types';

export type InferenceKind = 'read' | 'points' | 'verify' | 'author';

export interface InferenceEvent { kind: InferenceKind; source: ReadSource; ms: number }

const listeners = new Set<(event: InferenceEvent) => void>();

/** UI can subscribe to show live on-device / cloud counters. */
export function onInference(listener: (event: InferenceEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function recordInference(event: InferenceEvent): void {
  listeners.forEach((l) => l(event));
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const day = new Date().toISOString().slice(0, 10);
  // Fire-and-forget: Firestore queues this offline and syncs later.
  void setDoc(doc(db, 'users', uid, 'telemetry', day), {
    [`${event.source}_${event.kind}`]: increment(1),
    [`${event.source}_ms`]: increment(event.ms),
    updatedAt: serverTimestamp(),
  }, { merge: true }).catch(() => { /* telemetry must never break marking */ });
}
