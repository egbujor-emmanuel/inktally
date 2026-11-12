// "Share PDF" for the printable answer sheets (the Android app shares the same PDF). jsPDF loads only on demand.

const PX_PER_MM = 5;

async function svgToJpeg(svg: SVGSVGElement): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', `${210 * PX_PER_MM}`);
  clone.setAttribute('height', `${297 * PX_PER_MM}`);
  clone.removeAttribute('style');
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 210 * PX_PER_MM;
    canvas.height = 297 * PX_PER_MM;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.92);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function sheetsToPdf(svgs: SVGSVGElement[]): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  for (let i = 0; i < svgs.length; i++) {
    if (i > 0) pdf.addPage();
    pdf.addImage(await svgToJpeg(svgs[i]), 'JPEG', 0, 0, 210, 297);
  }
  return pdf.output('blob');
}

/** Opens the share sheet where the browser supports sharing files; otherwise downloads the file. */
export async function shareOrDownload(blob: Blob, fileName: string, title: string): Promise<void> {
  const file = new File([blob], fileName, { type: blob.type });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return; } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
