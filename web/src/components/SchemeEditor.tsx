import type { Question, QuestionType } from '../domain/types';

type Props = { questions: Question[]; onChange: (next: Question[]) => void };

const TYPE_LABEL: Record<QuestionType, string> = {
  objective: 'Objective (A–E)',
  numeric: 'Number answer',
  short: 'Word / phrase',
  points: 'Theory (marking points)',
};

const lines = (s: string) => s.split(/\n|;/).map((x) => x.trim()).filter(Boolean);

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

function AnswerField({ question, update }: { question: Question; update: (q: Question) => void }) {
  const field = 'mt-1 w-full rounded-lg border border-[oklch(82%_0.02_85)] bg-white px-3 py-2';
  switch (question.type) {
    case 'objective':
      return (
        <label className="block text-sm font-medium">Correct letter(s)
          <input className={field} value={question.correct.join(', ')}
            onChange={(e) => update({ ...question, correct: e.target.value.toUpperCase().split(/[,\s]+/).filter(Boolean) })} />
        </label>
      );
    case 'numeric':
      return (
        <label className="block text-sm font-medium">Accepted answer(s), separated by ;
          <input className={field} value={question.accept.join('; ')}
            onChange={(e) => update({ ...question, accept: lines(e.target.value).map((v) => Number(v.replace(/[,₦\s]/g, ''))).filter((n) => !Number.isNaN(n)) })} />
        </label>
      );
    case 'short':
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-sm font-medium">Accept (one per line)
            <textarea className={field} rows={2} value={question.accept.join('\n')} onChange={(e) => update({ ...question, accept: lines(e.target.value) })} />
          </label>
          <label className="block text-sm font-medium">Do not accept
            <textarea className={field} rows={2} value={(question.reject ?? []).join('\n')} onChange={(e) => update({ ...question, reject: lines(e.target.value) })} />
          </label>
        </div>
      );
    case 'points':
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-sm font-medium">Marking points — 1 mark each (one per line)
            <textarea className={field} rows={4} value={question.points.join('\n')} onChange={(e) => update({ ...question, points: lines(e.target.value) })} />
          </label>
          <label className="block text-sm font-medium">Do not accept
            <textarea className={field} rows={4} value={(question.reject ?? []).join('\n')} onChange={(e) => update({ ...question, reject: lines(e.target.value) })} />
          </label>
        </div>
      );
  }
}

export function SchemeEditor({ questions, onChange }: Props) {
  const update = (next: Question) => onChange(questions.map((q) => (q.q === next.q ? next : q)));
  const remove = (n: number) => onChange(questions.filter((q) => q.q !== n).map((q, i) => ({ ...q, q: i + 1 })));
  const add = () => onChange([...questions, { q: questions.length + 1, type: 'short', prompt: '', max: 1, accept: [''] }]);
  const field = 'mt-1 w-full rounded-lg border border-[oklch(82%_0.02_85)] bg-white px-3 py-2';

  return (
    <div className="grid gap-4">
      {questions.map((q) => (
        <fieldset key={q.q} className="paper-card grid gap-3 p-5">
          <legend className="sr-only">Question {q.q}</legend>
          <div className="flex flex-wrap items-end gap-3">
            <span className="font-hand text-4xl text-pen">{q.q}</span>
            <label className="min-w-48 flex-1 text-sm font-medium">Question
              <input className={field} value={q.prompt} onChange={(e) => update({ ...q, prompt: e.target.value })} />
            </label>
            <label className="text-sm font-medium">Type
              <select className={field} value={q.type} onChange={(e) => update(retype(q, e.target.value as QuestionType))}>
                {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </label>
            <label className="w-24 text-sm font-medium">Marks
              <input className={field} type="number" min={1} max={20} value={q.max}
                onChange={(e) => update({ ...q, max: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} />
            </label>
            <button type="button" className="text-sm text-ink-soft underline" onClick={() => remove(q.q)}>Remove</button>
          </div>
          <AnswerField question={q} update={update} />
        </fieldset>
      ))}
      <button type="button" className="btn-ghost justify-self-start" onClick={add}>+ Add question</button>
    </div>
  );
}
