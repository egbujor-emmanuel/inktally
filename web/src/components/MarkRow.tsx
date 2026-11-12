import type { ReactNode } from 'react';
import type { Mark } from '../domain/types';
import { MarkGlyph, type GlyphKind } from './MarkGlyph';
import { Pill } from '../ui/Kit';

type Props = { mark: Mark; cropUrl?: string; index?: number; actions?: ReactNode };

function glyphFor(mark: Mark): GlyphKind {
  if (mark.status === 'flagged') return 'query';
  if (mark.awarded === mark.max) return 'tick';
  return mark.awarded > 0 ? 'half' : 'cross';
}

const SOURCE: Record<Mark['readSource'], [string, string]> = {
  on_device: ['On-device', 'var(--color-device)'], in_cloud: ['Cloud', 'var(--color-cloud)'], teacher: ['Teacher', 'var(--color-ink)'],
};
const STATUS: Record<Mark['status'], [string, string]> = {
  provisional: ['Provisional', 'var(--color-ink-soft)'], verified: ['Verified', 'var(--color-device)'],
  flagged: ['Check this', 'var(--color-flag)'], reviewed: ['Reviewed', 'var(--color-ink)'],
};
const ENGINE = (e: Mark['engine']) => (e === 'code' ? 'Marked by code' : e === 'ai-points' ? 'Point check' : e === 'teacher' ? 'Teacher' : 'Page read');

/** One marked answer, laid out exactly like the Android MarkCard: the student's handwriting beside what the AI read. */
export function MarkRow({ mark, cropUrl, index = 0, actions }: Props) {
  const glyph = glyphFor(mark);
  const [sourceLabel, sourceColor] = SOURCE[mark.readSource];
  const [statusLabel, statusColor] = STATUS[mark.status];
  return (
    <li className="grid list-none gap-2 rounded-[12px] border border-border bg-paper p-3.5">
      <div className="flex items-center">
        <span className="font-display text-[22px] font-bold">Q{mark.q}</span>
        <span className="flex-1" />
        <MarkGlyph kind={glyph} size={40} delay={index * 0.08} label={glyph === 'query' ? 'Needs checking' : `${mark.awarded} of ${mark.max}`} />
        <span className="font-hand text-[30px] text-pen">{mark.awarded}/{mark.max}</span>
      </div>
      {cropUrl && <img src={cropUrl} alt={`Student's handwriting for question ${mark.q}`} className="h-[60px] w-full bg-white object-contain" />}
      <p className="text-sm text-ink-soft">AI read: “{mark.read || '—'}”</p>
      <div className="flex flex-wrap gap-1.5">
        <Pill color={sourceColor}>{sourceLabel}</Pill>
        <Pill color="var(--color-ink-soft)">{ENGINE(mark.engine)}</Pill>
        <Pill color={statusColor}>{statusLabel}</Pill>
      </div>
      <p className="text-sm">{mark.reasons.join(' ')}</p>
      {actions}
    </li>
  );
}
