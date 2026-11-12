import type { ReactNode } from 'react';
import type { Mark } from '../domain/types';
import { MarkGlyph, type GlyphKind } from './MarkGlyph';
import { EngineBadge, SourceBadge, StatusBadge } from './SourceBadge';

type Props = { mark: Mark; cropUrl?: string; index?: number; actions?: ReactNode };

function glyphFor(mark: Mark): GlyphKind {
  if (mark.status === 'flagged') return 'query';
  if (mark.awarded === mark.max) return 'tick';
  return mark.awarded > 0 ? 'half' : 'cross';
}

/** One marked answer: the pupil's real handwriting beside what the AI read, so misreads are obvious. */
export function MarkRow({ mark, cropUrl, index = 0, actions }: Props) {
  const glyph = glyphFor(mark);
  return (
    <li className={`paper-card grid gap-3 p-4 sm:items-center ${cropUrl ? 'sm:grid-cols-[3rem_minmax(0,1fr)_minmax(0,1.2fr)_auto]' : 'sm:grid-cols-[3rem_minmax(0,1fr)_auto]'}`}>
      <span className="font-display text-2xl font-bold">Q{mark.q}</span>
      {cropUrl && (
        <div className="min-h-12 overflow-hidden rounded-md border border-[oklch(88%_0.02_85)] bg-white">
          <img src={cropUrl} alt={`Student's handwriting for question ${mark.q}`} className="max-h-24 w-full object-contain" />
        </div>
      )}
      <div className="grid gap-1.5">
        <p className="text-sm text-ink-soft">AI read: <span className="font-medium text-ink">“{mark.read || '—'}”</span></p>
        <div className="flex flex-wrap gap-1.5">
          <SourceBadge source={mark.readSource} />
          <EngineBadge engine={mark.engine} />
          <StatusBadge status={mark.status} />
        </div>
        <p className="text-sm">{mark.reasons.join(' ')}</p>
        {actions}
      </div>
      <div className="flex items-center gap-2 justify-self-end">
        <MarkGlyph kind={glyph} size={44} delay={index * 0.08} label={glyph === 'query' ? 'Needs checking' : `${mark.awarded} of ${mark.max}`} />
        <span className="font-hand text-4xl text-pen">{mark.awarded}/{mark.max}</span>
      </div>
    </li>
  );
}
