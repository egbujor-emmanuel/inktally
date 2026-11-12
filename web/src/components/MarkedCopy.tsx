import { useEffect, useMemo, useState } from 'react';

type Props = { blob: Blob; pupil: string };

const safeName = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'pupil';

/** Shows the marked copy with Download / Share / Print, so the teacher never re-marks the paper by hand. */
export function MarkedCopy({ blob, pupil }: Props) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const [shareError, setShareError] = useState<string | null>(null);
  const fileName = `${safeName(pupil)}-marked.png`;
  const file = useMemo(() => new File([blob], fileName, { type: 'image/png' }), [blob, fileName]);
  const canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  async function handleShare() {
    setShareError(null);
    try { await navigator.share({ files: [file], title: `${pupil} — marked by REDPEN` }); } catch (e: unknown) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setShareError('Sharing is not available here — use Download instead.');
    }
  }

  function handlePrint() {
    const w = window.open('', '_blank', 'noopener=no');
    if (!w) return;
    w.document.write(`<title>${pupil}</title><style>@page{margin:0}body{margin:0}img{width:100%}</style><img src="${url}" onload="setTimeout(()=>print(),200)">`);
    w.document.close();
  }

  return (
    <section className="paper-card grid gap-4 p-5 lg:grid-cols-[minmax(0,22rem)_1fr]" aria-labelledby="marked-copy">
      <img src={url} alt={`Marked copy of ${pupil}'s work`} className="w-full rounded-md border border-[oklch(88%_0.02_85)]" />
      <div className="grid content-start gap-3">
        <p className="font-hand text-2xl text-pen">no second round of marking</p>
        <h2 id="marked-copy" className="font-display text-2xl font-bold">Marked copy for {pupil}</h2>
        <p className="text-ink-soft">The pupil’s own work with every tick, cross and score — print it or send it to the parent. On the original paper, just write the total.</p>
        <div className="flex flex-wrap gap-2">
          <a href={url} download={fileName} className="btn-pen">Download</a>
          {canShare && <button type="button" className="btn-ghost" onClick={() => void handleShare()}>Share</button>}
          <button type="button" className="btn-ghost" onClick={handlePrint}>Print</button>
        </div>
        {shareError && <p className="text-sm text-pen" role="alert">{shareError}</p>}
      </div>
    </section>
  );
}
