import { useEffect, useRef, useState } from 'react';
import { PHOTO_KEY, deleteCrop, finishQueued, loadCrop, type Assignment, type Submission } from '../data/store';
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

const RETRY_AFTER_MS = 30_000;
/** Students this tab has already finished, until the database update arrives (never mark twice). */
const finishedHere = new Set<string>();

/** Runs `fn` while holding a per-student lock so two tabs never mark the same student. Skips if another tab holds it. */
async function withStudentLock(id: string, fn: () => Promise<void>): Promise<void> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks) { await fn(); return; }
  await locks.request(`redpen-mark-${id}`, { ifAvailable: true }, async (lock) => { if (lock) await fn(); });
}

/**
 * The offline queue: on a device without on-device AI, photos taken offline are saved (photo stays on this device)
 * and marked here automatically once the connection is back. Runs while the assignment is open (any tab).
 * Always works from the latest waiting list, keeps going until it is empty, and leaves a student queued if
 * marking fails (e.g. the connection drops again) so it is retried later.
 */
export function useMarkingQueue(assignment: Assignment | null | undefined, submissions: Submission[]): QueueState {
  const isOnline = useOnline();
  const [current, setCurrent] = useState<Submission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const running = useRef(false);
  const latest = useRef<Submission[]>([]);
  const assignmentRef = useRef(assignment);
  const waiting = submissions.filter((s) => s.queued);
  latest.current = submissions;
  assignmentRef.current = assignment;

  useEffect(() => {
    if (!assignment || !isOnline || running.current || !waiting.length) return;
    running.current = true;
    const done = new Set<string>();
    let failed = false;
    let progressed = false;
    void (async () => {
      try {
        for (;;) {
          const a = assignmentRef.current;
          if (!a || !navigator.onLine) break;
          // Re-read the newest list every time: students finished by us (or another device) drop out.
          const next = latest.current.find((s) => s.queued && !done.has(s.id) && !finishedHere.has(s.id));
          if (!next?.queued) break;
          done.add(next.id);
          const photo = await loadCrop(next.id, PHOTO_KEY);
          if (!photo) continue; // photo is on another device: that device will mark it
          const queued = next.queued;
          await withStudentLock(next.id, async () => {
            setCurrent(next);
            try {
              const outcome = await markSubmission(a, queued.mode, photo, queued.page, next.id, next.pupil, undefined, true);
              if (outcome.ok) {
                finishedHere.add(next.id);
                finishQueued(a.id, next.id, outcome.marks);
                await deleteCrop(next.id, PHOTO_KEY); // crops + marked copy are saved; the original photo is no longer needed
                setError(null); progressed = true;
              }
              else setError(`${next.pupil}: ${outcome.reason}`);
            } catch (e: unknown) {
              setError(`${next.pupil}: ${e instanceof Error ? e.message : String(e)}`);
              failed = true;
            }
          });
          if (failed) break; // connection or cloud trouble: stop and retry the rest later
        }
      } finally {
        setCurrent(null);
        running.current = false;
        // Retry automatically after a failure; after progress, re-check once in case new students arrived meanwhile.
        if (failed) setTimeout(() => setTick((t) => t + 1), RETRY_AFTER_MS);
        else if (progressed) setTick((t) => t + 1);
      }
    })();
    // Re-run when connectivity returns, the waiting list changes, or a run finishes (tick).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment?.id, isOnline, waiting.map((s) => s.id).join(','), tick]);

  return { waiting, current, error };
}
