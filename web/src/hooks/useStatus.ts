import { useCallback, useEffect, useState } from 'react';
import { onDeviceAvailability, warmUpOnDevice, type DeviceAvailability } from '../ai/models';
import { onInference } from '../ai/telemetry';
import type { ReadSource } from '../domain/types';

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return online;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}

export interface DeviceAI {
  availability: DeviceAvailability | 'checking';
  progress: number | null;
  error: string | null;
  /** Must be called from a click (Chrome requires a user gesture to download the model). */
  enable: () => Promise<void>;
}

export function useDeviceAI(): DeviceAI {
  const [availability, setAvailability] = useState<DeviceAvailability | 'checking'>('checking');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void onDeviceAvailability().then((a) => { if (alive) setAvailability(a); });
    return () => { alive = false; };
  }, []);

  const enable = useCallback(async () => {
    setError(null);
    setProgress(0);
    try {
      await warmUpOnDevice((fraction) => setProgress(fraction));
      setAvailability(await onDeviceAvailability());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not start the on-device model');
    } finally {
      setProgress(null);
    }
  }, []);

  return { availability, progress, error, enable };
}

export type InferenceCounts = Record<ReadSource, number>;

/** Live session counters: how many inferences ran on-device vs in the cloud. */
export function useInferenceCounts(): InferenceCounts {
  const [counts, setCounts] = useState<InferenceCounts>({ on_device: 0, in_cloud: 0, teacher: 0 });
  useEffect(() => onInference((e) => setCounts((c) => ({ ...c, [e.source]: c[e.source] + 1 }))), []);
  return counts;
}
