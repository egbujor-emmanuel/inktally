import { useEffect, useRef, useState } from 'react';
import { PHOTO_KEY, finishQueued, loadCrop, type Assignment, type Submission } from '../data/store';
import { markSubmission } from '../marking/markSubmission';
import { useOnline } from './useStatus';

export interface QueueState {
  /** Students saved offline and still waiting to be marked. */
  waiting: Submission[];
  /** The student being marked right now, if any. */
  current: Submission | null;
  /** Last failure, shown to the teacher; the student stays in the queue. */
  error: string | null;
}

/**
 * The offline queue: on a device without on-device AI, photos taken offline are saved (photo stays on this device)
 * and marked here automatically once the connection is back. Runs while the assignment is open.
 */
export function useMarkingQueue(assignment: Assignment | null | undefined, submissions: Submission[]): QueueState {
  const isOnline = useOnline();
  const [current, setCurrent] = useState<Submission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const waiting = submissions.filter((s) => s.queued);

  useEffect(() => {
    if (!assignment || !isOnline || running.current || !waiting.length) return;
    running.current = true;
    let cancelled = false;
    void (async () => {
      for (const s of waiting) {
        if (cancelled || !navigator.onLine) break;
        const photo = await loadCrop(s.id, PHOTO_KEY);
        if (!photo || !s.queued) continue; // photo is on another device: that device will mark it
        setCurrent(s);
        try {
          const outcome = await markSubmission(assignment, s.queued.mode, photo, s.queued.page, s.id, s.pupil);
          if (outcome.ok) { finishQueued(assignment.id, s.id, outcome.marks); setError(null); }
          else setError(`${s.pupil}: ${outcome.reason}`);
        } catch (e: unknown) {
          setError(`${s.pupil}: ${e instanceof Error ? e.message : String(e)}`);
          break; // likely the connection dropped again; try later
        }
      }
      setCurrent(null);
      running.current = false;
    })();
    return () => { cancelled = true; };
    // Re-run when connectivity returns or the waiting list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment?.id, isOnline, waiting.map((s) => s.id).join(',')]);

  return { waiting, current, error };
}
