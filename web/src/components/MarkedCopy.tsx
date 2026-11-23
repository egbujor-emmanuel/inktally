import { useEffect, useMemo, useState } from 'react';
import { withLetterhead, type LetterheadInfo } from '../scan/letterhead';

type Props = { blob: Blob; pupil: string; letterhead?: LetterheadInfo };

const safeName = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'student';

/** Shows the marked copy with Download / Share / Print, so the teacher never re-marks the paper by hand. */
export function MarkedCopy({ blob: raw, pupil, letterhead }: Props) {
  // Compose the letterhead + comment onto the copy; fall back to the bare copy if that fails.
  const [blob, setBlob] = useState<Blob>(raw);
  const key = letterhead ? JSON.stringify(letterhead) : '';
  useEffect(() => {
    if (!letterhead) { setBlob(raw); return; }
    let alive = true;
    withLetterhead(raw, letterhead).then((b) => { if (alive) setBlob(b); }, () => { if (alive) setBlob(raw); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captures every letterhead field
  }, [raw, key]);
  // Create and revoke the object URL in the same effect so StrictMode re-mounts never leave a dead link.
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  const [shareError, setShareError] = useState<string | null>(null);
  const fileName = `${safeName(pupil)}-marked.png`;
  const file = useMemo(() => new File([blob], fileName, { type: 'image/png' }), [blob, fileName]);
  const canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  async function handleShare() {
    setShareError(null);
    if (canShare) {
      try { await navigator.share({ files: [file], title: `${pupil} — marked by InkTally` }); return; } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
  }

  /** Prints just the marked copy through a hidden iframe (no popup, no document.write). */
  function handlePrint() {
    if (!url) return;
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) { frame.remove(); return; }
    doc.title = pupil;
    const style = doc.createElement('style');
    style.textContent = '@page{margin:0}body{margin:0}img{width:100%}';
    doc.head.appendChild(style);
    const img = doc.createElement('img');
    img.alt = `Marked copy of ${pupil}`;
    img.onload = () => { frame.contentWindow?.print(); setTimeout(() => frame.remove(), 1000); };
    img.src = url;
    doc.body.appendChild(img);
  }

  if (!url) return null;
  // Same card as the Android marked copy: eyebrow, title, image, note, Share + Print.
  return (
    <section className="card card-pad mx-4" aria-labelledby="marked-copy">
      <p className="font-hand text-xl text-pen">ready to hand back</p>
      <h2 id="marked-copy" className="font-display text-[22px] font-bold">Marked copy for {pupil}</h2>
      <img src={url} alt={`Marked copy of ${pupil}'s work`} className="w-full" />
      <p className="text-sm text-ink-soft">The student’s own work with every tick, cross and score — print it or send it to the parent. On the original paper, just write the total.</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-pen" onClick={() => void handleShare()}>Share</button>
        <button type="button" className="btn-ghost" onClick={handlePrint}>Print</button>
      </div>
      {shareError && <p className="text-sm text-pen" role="alert">{shareError}</p>}
    </section>
  );
}
