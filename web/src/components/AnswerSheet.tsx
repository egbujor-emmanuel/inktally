import type { Question } from '../domain/types';
import type { Profile } from '../data/profile';
import { A4, FIDUCIAL_CENTRES, FIDUCIAL_SIZE_MM, layoutSheet } from '../scan/layout';

type Props = { title: string; className: string; questions: Question[]; profile?: Profile };

/** Header text must stay between the top fiducials; squeeze long lines instead of overflowing. */
const HEADER_WIDTH_MM = 150;
const fit = (text: string, fontSize: number) => (text.length * fontSize * 0.5 > HEADER_WIDTH_MM ? { textLength: HEADER_WIDTH_MM, lengthAdjust: 'spacingAndGlyphs' as const } : {});

const HINT: Record<Question['type'], string> = {
  objective: 'Write ONE letter',
  numeric: 'Answer =',
  short: 'Answer',
  points: 'Write your answer',
};

/** Printable A4 answer sheets. Geometry comes from scan/layout.ts, the same module the scanner uses. */
export function AnswerSheet({ title, className, questions, profile }: Props) {
  const pages = layoutSheet(questions);
  const byQ = new Map(questions.map((q) => [q.q, q]));
  return (
    <div className="print-area flex flex-col items-center gap-6">
      {pages.map((page) => (
        <svg
          key={page.page}
          className="sheet-page bg-white shadow-xl"
          viewBox={`0 0 ${A4.width} ${A4.height}`}
          width={`${A4.width}mm`}
          height={`${A4.height}mm`}
          role="img"
          aria-label={`Answer sheet page ${page.page} of ${pages.length}`}
          style={{ maxWidth: '100%', height: 'auto' }}
        >
          {FIDUCIAL_CENTRES.map((c) => (
            <rect key={`${c.x}-${c.y}`} x={c.x - FIDUCIAL_SIZE_MM / 2} y={c.y - FIDUCIAL_SIZE_MM / 2} width={FIDUCIAL_SIZE_MM} height={FIDUCIAL_SIZE_MM} fill="#000" />
          ))}
          {profile?.institution && (
            <text x={32} y={13.5} fontFamily="Inter Tight, sans-serif" fontSize={3.8} fontWeight={700} letterSpacing={0.2} fill="#c8102e" {...fit(profile.institution.toUpperCase(), 3.8)}>
              {profile.institution.toUpperCase()}
            </text>
          )}
          <text x={32} y={21} fontFamily="Fraunces, serif" fontSize={7} fontWeight={700} fill="#1f2a44" {...fit(title, 7)}>{title}</text>
          <text x={32} y={28} fontFamily="Inter Tight, sans-serif" fontSize={3.6} fill="#555">
            {className?.trim() ? `${className} · ` : ''}Page {page.page} of {pages.length} · Keep the four black squares in the photo
          </text>
          {profile?.details && (
            <text x={32} y={34} fontFamily="Inter Tight, sans-serif" fontSize={3} fill="#777" {...fit(profile.details, 3)}>{profile.details}</text>
          )}
          <text x={32} y={41} fontFamily="Inter Tight, sans-serif" fontSize={4.2} fill="#1f2a44">Name</text>
          <line x1={46} y1={41.5} x2={130} y2={41.5} stroke="#1f2a44" strokeWidth={0.3} />
          <text x={136} y={41} fontFamily="Inter Tight, sans-serif" fontSize={4.2} fill="#1f2a44">No.</text>
          <line x1={146} y1={41.5} x2={192} y2={41.5} stroke="#1f2a44" strokeWidth={0.3} />
          <text x={32} y={52} fontFamily="Inter Tight, sans-serif" fontSize={3.2} fill="#777">
            Write each answer inside its box. Do not write on the black squares. Marked by REDPEN.
          </text>
          {page.boxes.map((box) => {
            const q = byQ.get(box.q);
            return (
              <g key={box.q}>
                <text x={box.x - 3} y={box.y + 6} textAnchor="end" fontFamily="Fraunces, serif" fontSize={5} fontWeight={700} fill="#1f2a44">{box.q}</text>
                <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="none" stroke="#1f2a44" strokeWidth={0.35} rx={1.2} />
                {/* Hint sits ABOVE the box so it is never inside the scanned crop. */}
                <text x={box.x + box.w} y={box.y - 1} textAnchor="end" fontFamily="Inter Tight, sans-serif" fontSize={2.6} fill="#99a">
                  {q ? `${HINT[q.type]} · ${q.max} mark${q.max > 1 ? 's' : ''}` : ''}
                </text>
              </g>
            );
          })}
        </svg>
      ))}
    </div>
  );
}
