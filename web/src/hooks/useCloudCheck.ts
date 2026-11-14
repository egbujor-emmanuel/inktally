import { useCallback, useEffect, useRef, useState } from 'react';
import type { Assignment, Submission } from '../data/store';
import { cloudCheck, needsCheck, type CheckSummary } from '../marking/cloudCheck';
import { useOnline } from './useStatus';

export interface CloudCheckState {
  progress: { done: number; total: number } | null;
  error: string | null;
  /** Result of the last finished check, shown as "8 on-device marks confirmed, 1 needs you". */
  summary: CheckSummary | null;
  run: () => Promise<void>;
}

/**
 * Verifies on-device marks automatically as soon as the device is online, on whichever tab is open.
 * Each provisional mark is tried once per connection; going offline and back online tries again.
 */
export function useCloudCheck(assignment: Assignment | null | undefined, submissions: Submission[]): CloudCheckState {
  const isOnline = useOnline();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CheckSummary | null>(null);
  const [runs, setRuns] = useState(0);
  const running = useRef(false);
  const tried = useRef(new Set<string>());
  const latest = useRef(submissions);
  latest.current = submissions;

  const run = useCallback(async () => {
    if (!assignment || running.current) return;
    running.current = true;
    setError(null);
    for (const s of latest.current) for (const m of s.marks) if (needsCheck(m)) tried.current.add(`${s.id}:${m.q}`);
    try {
      const result = await cloudCheck(assignment, latest.current, {
        latest: () => latest.current,
        onProgress: (done, total) => setProgress({ done, total }),
        onError: setError,
      });
      if (result.checked) setSummary(result);
    } finally {
      running.current = false;
      setProgress(null);
      setRuns((n) => n + 1); // re-check: marks may have arrived while this run was busy
    }
  }, [assignment]);

  useEffect(() => { if (!isOnline) tried.current.clear(); }, [isOnline]);

  const untried = submissions.flatMap((s) => (s.queued ? [] : s.marks
    .filter((m) => m.status === 'provisional' && !tried.current.has(`${s.id}:${m.q}`))
    .map((m) => `${s.id}:${m.q}`)));
  const key = untried.join(',');
  useEffect(() => {
    if (isOnline && key && !running.current) void run();
  }, [isOnline, key, run, runs]);

  return { progress, error, summary, run };
}
