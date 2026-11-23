// Core domain types for InkTally. Shared by the marking engine, AI layer, storage and UI.

/** Where the reading of a pupil's handwriting came from. */
export type ReadSource = 'on_device' | 'in_cloud' | 'teacher';

/** Who decided the mark. Code is deterministic; ai-points means per-point yes/no checks. */
export type MarkEngine = 'code' | 'ai-points' | 'ai-page' | 'teacher';

/**
 * provisional: read on-device, not yet verified.
 * verified:    read (or re-read) by the cloud model and marked by code/points.
 * flagged:     the app is unsure; a teacher must look.
 * reviewed:    the teacher confirmed or changed it (final).
 */
export type MarkStatus = 'provisional' | 'verified' | 'flagged' | 'reviewed';

export type QuestionType = 'objective' | 'numeric' | 'short' | 'points';

interface QuestionBase {
  /** Question number in order (1-based); sub-parts are numbered on too. */
  q: number;
  /** The question's label as printed, when it is not just the number: "6(a)", "6(b)(ii)" (WAEC-style sub-parts). */
  label?: string;
  /** The question text (used only for cloud scheme drafting and teacher display, never for on-device reading). */
  prompt: string;
  max: number;
}

export interface ObjectiveQuestion extends QuestionBase {
  type: 'objective';
  /** Correct option letters, e.g. ["B"]. */
  correct: string[];
}

export interface NumericQuestion extends QuestionBase {
  type: 'numeric';
  /** Accepted final values. */
  accept: number[];
  /** Absolute tolerance for decimals. Defaults to 1e-9. */
  tolerance?: number;
  /** Optional method points checked by AI when the final answer is wrong (partial credit). */
  methodPoints?: string[];
}

export interface ShortQuestion extends QuestionBase {
  type: 'short';
  /** Accepted answers (one is enough). */
  accept: string[];
  /** Explicitly rejected answers. */
  reject?: string[];
  /** Ignore minor spelling mistakes (default true). */
  spellingTolerant?: boolean;
}

export interface PointsQuestion extends QuestionBase {
  type: 'points';
  /** Marking points; each present point earns one mark, capped at max. */
  points: string[];
  /** Statements that must NOT earn credit (e.g. "fights disease" for red blood cells). */
  reject?: string[];
}

export type Question = ObjectiveQuestion | NumericQuestion | ShortQuestion | PointsQuestion;

export interface MarkingScheme {
  subject: string;
  level: string;
  questions: Question[];
}

export interface Mark {
  q: number;
  /** The question's printed label ("6(a)"), copied from the question when marked. */
  label?: string;
  /** What the model (or teacher) read from the pupil's answer box. */
  read: string;
  readSource: ReadSource;
  awarded: number;
  max: number;
  engine: MarkEngine;
  status: MarkStatus;
  /** Human-readable reasons, shown to the teacher. */
  reasons: string[];
  /** Marking points that were found (points questions / method marks). */
  pointsFound?: string[];
}

/** How a question is shown to people: its printed label ("6(a)") or else its number. */
export const qLabel = (x: { q: number; label?: string }): string => x.label?.trim() || String(x.q);
