import { useState } from 'react';
import type { Question } from '../domain/types';
import { Field, GhostButton } from '../ui/Kit';

type Props = { questions: Question[]; onChange: (questions: Question[]) => void };
type QuestionType = Question['type'];

// Same labels and order as the Android SchemeEditor.
const TYPES: [QuestionType, string][] = [['objective', 'Multiple choice'], ['numeric', 'Number'], ['short', 'Word / phrase'], ['points', 'Theory (points)']];

const lines = (s: string) => s.split(/\n|;/).map((x) => x.trim()).filter(Boolean);
const numberOf = (s: string) => { const n = Number(s.replace(/[,₦$£€\s]/g, '')); return Number.isNaN(n) || s.trim() === '' ? null : n; };

/** Converts a question to another type, keeping number, prompt and marks. */
function retype(q: Question, type: QuestionType): Question {
  const base = { q: q.q, prompt: q.prompt, max: q.max };
  switch (type) {
    case 'objective': return { ...base, type, correct: ['A'] };
    case 'numeric': return { ...base, type, accept: [0] };
    case 'short': return { ...base, type, accept: [''] };
    case 'points': return { ...base, type, points: [''] };
  }
}

/** Keeps the raw text while typing (so "27," is not reformatted mid-word) and reports parsed values. */
function ListField({ initial, label, multiline, rows, onParsed }: { initial: string; label: string; multiline?: boolean; rows?: number; onParsed: (raw: string) => void }) {
  const [raw, setRaw] = useState(initial);
  return <Field label={label} value={raw} multiline={multiline} rows={rows} maxLength={5000} onChange={(v) => { setRaw(v); onParsed(v); }} />;
}

export function SchemeEditor({ questions, onChange }: Props) {
  const update = (next: Question) => onChange(questions.map((q) => (q.q === next.q ? next : q)));
  const remove = (n: number) => onChange(questions.filter((q) => q.q !== n).map((q, i) => ({ ...q, q: i + 1 })));
  const add = () => onChange([...questions, { q: questions.length + 1, type: 'short', prompt: '', max: 1, accept: [''] }]);
  const k = (q: Question, part: string) => `${part}-${q.q}-${q.type}-${questions.length}`;

  return (
    <div className="grid gap-3">
      {questions.map((q) => (
        <fieldset key={k(q, 'card')} className="card card-pad mx-4">
          <legend className="sr-only">Question {q.q}</legend>
          <div className="flex items-center">
            <span className="w-10 flex-none font-hand text-4xl text-pen">{q.q}</span>
            <ListField key={k(q, 'p')} initial={q.prompt} label="Question" onParsed={(v) => update({ ...q, prompt: v })} />
          </div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Question ${q.q} type`}>
            {TYPES.map(([t, label]) => (
              <button key={t} type="button" role="radio" aria-checked={q.type === t} onClick={() => { if (q.type !== t) update(retype(q, t)); }}
                className={`rounded-lg border px-3.5 py-1.5 text-[13px] font-semibold ${q.type === t ? 'border-ink bg-ink text-white' : 'border-ink-soft bg-white text-ink'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">Marks</span>
            <button type="button" className="btn-text !text-xl" aria-label="Fewer marks" onClick={() => update({ ...q, max: Math.max(1, q.max - 1) })}>–</button>
            <input type="number" readOnly value={q.max} aria-label={`Marks for question ${q.q}`}
              className="w-8 appearance-none bg-transparent text-center font-hand text-[28px] text-pen [&::-webkit-inner-spin-button]:appearance-none" />
            <button type="button" className="btn-text !text-xl" aria-label="More marks" onClick={() => update({ ...q, max: Math.min(20, q.max + 1) })}>+</button>
            <span className="flex-1" />
            <button type="button" className="btn-text !text-ink-soft" onClick={() => remove(q.q)}>Remove</button>
          </div>
          {q.type === 'objective' && (
            <ListField key={k(q, 'o')} initial={q.correct.join(', ')} label="Correct letter(s)"
              onParsed={(v) => update({ ...q, correct: v.toUpperCase().split(/[,\s]+/).filter(Boolean) })} />
          )}
          {q.type === 'numeric' && (
            <ListField key={k(q, 'n')} initial={q.accept.join('; ')} label="Accepted answer(s), separated by ;"
              onParsed={(v) => update({ ...q, accept: lines(v).map(numberOf).filter((n): n is number => n !== null) })} />
          )}
          {q.type === 'short' && (
            <>
              <ListField key={k(q, 'sa')} initial={q.accept.join('\n')} label="Accept (one per line)" multiline rows={2} onParsed={(v) => update({ ...q, accept: lines(v) })} />
              <ListField key={k(q, 'sr')} initial={(q.reject ?? []).join('\n')} label="Do not accept" multiline rows={2} onParsed={(v) => update({ ...q, reject: lines(v) })} />
            </>
          )}
          {q.type === 'points' && (
            <>
              <ListField key={k(q, 'pp')} initial={q.points.join('\n')} label="Marking points — 1 mark each (one per line)" multiline rows={3} onParsed={(v) => update({ ...q, points: lines(v) })} />
              <ListField key={k(q, 'pr')} initial={(q.reject ?? []).join('\n')} label="Do not accept" multiline rows={2} onParsed={(v) => update({ ...q, reject: lines(v) })} />
            </>
          )}
        </fieldset>
      ))}
      <div className="px-4"><GhostButton onClick={add}>+ Add question</GhostButton></div>
    </div>
  );
}

/** A question is usable once it has at least one answer to mark against (same rule as Android). */
export function isComplete(q: Question): boolean {
  switch (q.type) {
    case 'objective': return q.correct.length > 0;
    case 'numeric': return q.accept.length > 0;
    case 'short': return q.accept.some((a) => a.trim() !== '');
    case 'points': return q.points.some((p) => p.trim() !== '');
  }
}
