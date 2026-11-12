import type { MarkEngine, MarkStatus, ReadSource } from '../domain/types';

const SOURCE: Record<ReadSource, { label: string; colour: string; title: string }> = {
  on_device: { label: 'On-device', colour: 'var(--color-device)', title: 'Read by Gemini Nano on this device — private, offline, free' },
  in_cloud: { label: 'Cloud', colour: 'var(--color-cloud)', title: 'Read by Gemini in the cloud via Firebase AI Logic' },
  teacher: { label: 'Teacher', colour: 'var(--color-ink)', title: 'Set by the teacher' },
};

const STATUS: Record<MarkStatus, { label: string; colour: string }> = {
  provisional: { label: 'Provisional', colour: 'var(--color-ink-soft)' },
  verified: { label: 'Verified', colour: 'var(--color-device)' },
  flagged: { label: 'Check this', colour: 'var(--color-flag)' },
  reviewed: { label: 'Reviewed', colour: 'var(--color-ink)' },
};

const pill = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide';

export function SourceBadge({ source }: { source: ReadSource }) {
  const s = SOURCE[source];
  return (
    <span className={pill} style={{ borderColor: s.colour, color: s.colour }} title={s.title}>
      <span className="size-1.5 rounded-full" style={{ background: s.colour }} aria-hidden />
      {s.label}
    </span>
  );
}

export function EngineBadge({ engine }: { engine: MarkEngine }) {
  const label = engine === 'code' ? 'Marked by code' : engine === 'ai-points' ? 'Point check' : engine === 'teacher' ? 'Teacher' : 'AI';
  return <span className={pill} style={{ borderColor: 'var(--color-code)', color: 'var(--color-code)' }}>{label}</span>;
}

export function StatusBadge({ status }: { status: MarkStatus }) {
  const s = STATUS[status];
  return <span className={pill} style={{ borderColor: s.colour, color: s.colour }}>{s.label}</span>;
}
