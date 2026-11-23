// Geometry of a printed InkTally answer sheet, in millimetres on A4 portrait.
// The printer and the scanner both use this module, so boxes always line up.
import type { Question } from '../domain/types';

export const A4 = { width: 210, height: 297 } as const;
export const FIDUCIAL_SIZE_MM = 12;
const FIDUCIAL_INSET_MM = 10;
const half = FIDUCIAL_SIZE_MM / 2;

/** Centres of the four solid corner squares: TL, TR, BR, BL (clockwise). */
export const FIDUCIAL_CENTRES = [
  { x: FIDUCIAL_INSET_MM + half, y: FIDUCIAL_INSET_MM + half },
  { x: A4.width - FIDUCIAL_INSET_MM - half, y: FIDUCIAL_INSET_MM + half },
  { x: A4.width - FIDUCIAL_INSET_MM - half, y: A4.height - FIDUCIAL_INSET_MM - half },
  { x: FIDUCIAL_INSET_MM + half, y: A4.height - FIDUCIAL_INSET_MM - half },
] as const;

export interface BoxRect { q: number; x: number; y: number; w: number; h: number }

export interface SheetPage { page: number; boxes: BoxRect[] }

const CONTENT_LEFT = 32;
const CONTENT_RIGHT = A4.width - 18;
const FIRST_BOX_TOP = 62;
const LAST_BOX_BOTTOM = A4.height - 26;
const GAP = 5;

/** Writing space by question type: one line for short answers, more for theory points. */
export function boxHeightFor(question: Question): number {
  switch (question.type) {
    case 'objective': return 16;
    case 'numeric': return question.methodPoints?.length ? 34 : 18;
    case 'short': return 18;
    case 'points': return Math.min(70, 22 + question.max * 9);
  }
}

/** Lays questions out top-to-bottom, starting a new page when the next box would not fit. */
export function layoutSheet(questions: readonly Question[]): SheetPage[] {
  const pages: SheetPage[] = [];
  let current: BoxRect[] = [];
  let y = FIRST_BOX_TOP;
  for (const question of questions) {
    const h = boxHeightFor(question);
    if (y + h > LAST_BOX_BOTTOM && current.length > 0) {
      pages.push({ page: pages.length + 1, boxes: current });
      current = [];
      y = FIRST_BOX_TOP;
    }
    current.push({ q: question.q, x: CONTENT_LEFT, y, w: CONTENT_RIGHT - CONTENT_LEFT, h });
    y += h + GAP;
  }
  if (current.length > 0) pages.push({ page: pages.length + 1, boxes: current });
  return pages;
}
