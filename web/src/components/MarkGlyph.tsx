import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useReducedMotion } from '../hooks/useStatus';

gsap.registerPlugin(useGSAP);

export type GlyphKind = 'tick' | 'cross' | 'half' | 'query';

const PATHS: Record<GlyphKind, string[]> = {
  tick: ['M6 30 L20 44 L50 10'],
  cross: ['M10 10 L46 46', 'M46 10 L10 46'],
  half: ['M6 30 L20 44 L50 10', 'M30 44 L44 30'],
  query: ['M18 18 C18 6 40 6 40 18 C40 28 28 28 28 36', 'M28 46 L28 47'],
};

interface MarkGlyphProps { kind: GlyphKind; size?: number; delay?: number; label: string }

/** A red-pen tick/cross that draws itself, like a teacher marking a book. */
export function MarkGlyph({ kind, size = 40, delay = 0, label }: MarkGlyphProps) {
  const ref = useRef<SVGSVGElement>(null);
  const reduced = useReducedMotion();

  useGSAP(() => {
    if (reduced || !ref.current) return;
    const paths = ref.current.querySelectorAll('path');
    paths.forEach((p) => {
      const length = p.getTotalLength();
      gsap.set(p, { strokeDasharray: length, strokeDashoffset: length });
    });
    gsap.to(paths, { strokeDashoffset: 0, duration: 0.45, ease: 'power2.out', stagger: 0.12, delay });
  }, { scope: ref, dependencies: [kind, reduced] });

  const colour = kind === 'query' ? 'var(--color-flag)' : 'var(--color-tick)';
  return (
    <svg ref={ref} viewBox="0 0 56 56" width={size} height={size} role="img" aria-label={label} className="shrink-0">
      {PATHS[kind].map((d) => (
        <path key={d} d={d} fill="none" stroke={colour} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
