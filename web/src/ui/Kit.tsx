// Web twins of the Android app's building blocks (android/.../ui/Kit.kt + Components.kt), so every screen
// is laid out and labelled identically on both platforms.
import { useEffect, useId, useRef, type ChangeEvent, type ReactNode } from 'react';

type ButtonProps = { children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string; type?: 'button' | 'submit' };

export function PenButton({ children, onClick, disabled, className = '', type = 'button' }: ButtonProps) {
  return <button type={type} className={`btn-pen ${className}`} onClick={onClick} disabled={disabled}>{children}</button>;
}

export function GhostButton({ children, onClick, disabled, className = '', type = 'button' }: ButtonProps) {
  return <button type={type} className={`btn-ghost ${className}`} onClick={onClick} disabled={disabled}>{children}</button>;
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  onBlur?: () => void;
  type?: string;
  className?: string;
};

/** Outlined field with the label sitting in the border once filled (Android OutlinedTextField). */
export function Field({ label, value, onChange, placeholder, multiline, rows = 3, maxLength = 2000, disabled, onBlur, type = 'text', className = '' }: FieldProps) {
  const id = useId();
  const common = {
    id, value, maxLength, disabled, onBlur, placeholder: placeholder ?? ' ', 'aria-label': label,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
  };
  return (
    <label className={`ofield ${className}`} htmlFor={id}>
      {multiline ? <textarea {...common} rows={rows} /> : <input {...common} type={type} />}
      <span>{label}</span>
    </label>
  );
}

/** Hand-written eyebrow + serif title + intro, as on every app screen. */
export function PageTitle({ eyebrow, title, intro }: { eyebrow: string; title: string; intro?: ReactNode }) {
  return (
    <header className="px-4 pt-[18px]">
      <p className="font-hand text-[22px] leading-tight text-pen">{eyebrow}</p>
      <h1 className="font-display text-[32px] font-bold leading-[36px] text-ink">{title}</h1>
      {intro && <p className="mt-1.5 text-[15px] leading-[22px] text-ink-soft">{intro}</p>}
    </header>
  );
}

/** White card with the app's border, radius and elevation (Android Paper). */
export function Card({ children, className = '', flag = false, labelledBy }: { children: ReactNode; className?: string; flag?: boolean; labelledBy?: string }) {
  return (
    <section aria-labelledby={labelledBy} className={`card card-pad mx-4 ${flag ? '!border-flag' : ''} ${className}`}>
      {children}
    </section>
  );
}

export function ErrorText({ message }: { message: string | null | undefined }) {
  return message ? <p className="px-4 text-sm text-pen" role="alert">{message}</p> : null;
}

export function Busy({ children }: { children: ReactNode }) {
  return <p className="px-4 py-2 font-hand text-[26px] text-ink-soft" aria-live="polite">{children}</p>;
}

/** Camera OR gallery, two buttons side by side (Android PhotoButtons). */
export function PhotoButtons({ takeLabel, onPhoto, disabled, multiple = false }: {
  takeLabel: string; onPhoto: (files: File[]) => void; disabled?: boolean; multiple?: boolean;
}) {
  const take = useRef<HTMLInputElement>(null);
  const choose = useRef<HTMLInputElement>(null);
  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length) onPhoto(files);
  };
  return (
    <div className="grid grid-cols-[1.3fr_1fr] gap-2">
      <button type="button" className="btn-pen" disabled={disabled} onClick={() => take.current?.click()}>{takeLabel}</button>
      <button type="button" className="btn-ghost" disabled={disabled} onClick={() => choose.current?.click()}>Choose photo</button>
      <input ref={take} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={handle} />
      <input ref={choose} type="file" accept="image/*" multiple={multiple} className="sr-only" tabIndex={-1} aria-label="Choose photo from gallery" onChange={handle} />
    </div>
  );
}

/** Free-text level with quick-pick chips from common systems (Android LevelField). */
export const LEVEL_SUGGESTIONS = ['Grade 6', 'Year 7', 'Primary 5', 'JSS 2', 'SS 2', 'Form 3', 'Class 8', 'Basic 8', 'University Year 1', 'Certificate course'];

export function LevelField({ level, onChange }: { level: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-1">
      <Field label="Class / level" value={level} onChange={onChange} placeholder="e.g. Grade 5, Year 7, JSS 2, University Year 1" />
      <div className="hscroll pt-1" role="group" aria-label="Level suggestions">
        {LEVEL_SUGGESTIONS.map((l) => <button key={l} type="button" className="assist-chip" onClick={() => onChange(l)}>{l}</button>)}
      </div>
    </div>
  );
}

export function Pill({ children, color }: { children: ReactNode; color: string }) {
  return <span className="pill" style={{ color }}>{children}</span>;
}

/** Simple modal dialog (Android AlertDialog). Closes on Escape and backdrop click. */
export function Dialog({ title, children, onClose, actions }: { title: string; children: ReactNode; onClose: () => void; actions: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input,textarea,button')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-6" onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="grid w-full max-w-md gap-4 rounded-[28px] bg-[#F3EEF6] p-6 shadow-xl">
        <h2 className="text-2xl text-ink">{title}</h2>
        <div className="text-ink-soft">{children}</div>
        <div className="flex justify-end gap-2">{actions}</div>
      </div>
    </div>
  );
}
