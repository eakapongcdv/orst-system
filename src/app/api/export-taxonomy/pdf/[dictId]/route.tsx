import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  DocumentArrowDownIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ArrowPathIcon
} from '@heroicons/react/24/solid';

// ... existing imports and code ...

// Helper to convert HTML to plain text (existing function)
function htmlToText(html: string) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  return tempDiv.textContent || tempDiv.innerText || '';
}

// --- Utility: Replace all <img> with base64 data URI (with progress) ---
async function replaceImagesWithBase64(htmlString: string, onProgress?: (completed: number, total: number) => void) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlString;
  const imgEls = Array.from(tempDiv.querySelectorAll('img'));
  const total = imgEls.length || 1;
  let completed = 0;

  for (const img of imgEls) {
    const src = img.getAttribute('src');
    if (!src || src.startsWith('data:')) {
      completed++;
      onProgress?.(completed, total);
      continue;
    }
    try {
      const res = await fetch(src);
      if (res.ok) {
        const blob = await res.blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        img.setAttribute('src', base64);
      }
    } catch {
      // ignore fetch/convert error for individual image
    } finally {
      completed++;
      onProgress?.(completed, total);
    }
  }
  return tempDiv.innerHTML;
}

export default function AdminTaxonomyPreviewPage() {
  const { id: taxonomyId } = useParams();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStage, setExportStage] = useState<'idle' | 'pdf' | 'doc'>('idle');
  const [zoom, setZoom] = useState(1);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // ... existing useEffect for fetchData ...
  useEffect(() => {
    fetchData(1);
  }, [taxonomyId]);

  useEffect(() => {
    if (wrapperRef.current) {
      wrapperRef.current.style.transformOrigin = 'top center';
      wrapperRef.current.style.transform = `scale(${zoom})`;
    }
  }, [zoom]);

  // --- PDF Export Handler ---
  const handleExportPdf = async () => {
    if (!previewContainerRef.current) {
      alert('Preview content is not ready for export.');
      return;
    }
    setIsExporting(true);
    setExportStage('pdf');
    setExportProgress(5);

    const targetEl = (previewContainerRef.current.querySelector('.taxon-card') as HTMLElement) || previewContainerRef.current;

    const origTransform = wrapperRef.current?.style.transform || '';
    const origTransformOrigin = wrapperRef.current?.style.transformOrigin || '';

    try {
      try {
        // @ts-ignore
        if (document.fonts && document.fonts.ready) await (document as any).fonts.ready;
      } catch {}

      await import('html2pdf.js').catch(() => null);
      const w: any = typeof window !== 'undefined' ? (window as any) : {};
      const html2canvas: any = w.html2canvas || (await import('html2canvas').then((m: any) => m.default).catch(() => null));
      if (!html2canvas) throw new Error('html2canvas is not available.');

      let jsPDFCtor: any = (w.jspdf && w.jspdf.jsPDF) || (w as any).jsPDF;
      if (!jsPDFCtor) {
        try {
          const jspdfMod: any = await import('jspdf');
          jsPDFCtor = jspdfMod.jsPDF || jspdfMod.default;
        } catch {
          jsPDFCtor = (w as any).jsPDF;
        }
      }
      if (!jsPDFCtor) throw new Error('jsPDF is not available.');

      if (wrapperRef.current) {
        wrapperRef.current.style.transform = 'none';
        wrapperRef.current.style.transformOrigin = 'top left';
      }
      const cleanup: Array<() => void> = [];
      const toHide = Array.from(document.querySelectorAll<HTMLElement>('.preview-toolbar'));
      toHide.forEach(el => {
        const prev = el.style.display;
        el.style.display = 'none';
        cleanup.push(() => { el.style.display = prev; });
      });

      const canvas = await html2canvas(targetEl, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      });

      const pdf: any = new jsPDFCtor({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const imgWidthPx = canvas.width;
      const imgHeightPx = canvas.height;
      const imgRatio = imgHeightPx / imgWidthPx;

      const imgWidthMm = pageWidth;
      const imgHeightMm = imgRatio * imgWidthMm;
      const pxPerMm = imgHeightPx / imgHeightMm;

      if (imgHeightMm <= pageHeight) {
        const imgData = canvas.toDataURL('image/jpeg', 1.0);
        pdf.addImage(imgData, 'JPEG', 0, 0, imgWidthMm, imgHeightMm, undefined, 'FAST');
      } else {
        const sliceHeightMm = pageHeight;
        const sliceHeightPx = Math.floor(sliceHeightMm * pxPerMm);

        let offsetPx = 0;
        let pageIndex = 0;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imgWidthPx;
        const tempCtx = tempCanvas.getContext('2d')!;

        while (offsetPx < imgHeightPx) {
          const remainingPx = imgHeightPx - offsetPx;
          const currentSlicePx = Math.min(sliceHeightPx, remainingPx);
          tempCanvas.height = currentSlicePx;
          tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
          tempCtx.drawImage(canvas, 0, offsetPx, tempCanvas.width, currentSlicePx, 0, 0, tempCanvas.width, currentSlicePx);
          const imgData = tempCanvas.toDataURL('image/jpeg', 1.0);
          if (pageIndex === 0) {
            pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
          } else {
            pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
          }
          pageIndex++;
          offsetPx += currentSlicePx;
          const pct = 5 + Math.round((offsetPx / imgHeightPx) * 90);
          setExportProgress(Math.min(95, pct));
        }
      }

      setExportProgress(98);
      pdf.save(`Taxonomy_${taxonomyId}.pdf`);
      setExportProgress(100);
      cleanup.forEach(fn => fn());
    } catch (err: any) {
      alert(`Failed to generate PDF: ${err?.message || 'An error occurred during PDF generation.'}`);
    } finally {
      if (wrapperRef.current) {
        wrapperRef.current.style.transformOrigin = origTransformOrigin;
        wrapperRef.current.style.transform = origTransform;
      }
      setIsExporting(false);
      setTimeout(() => { setExportStage('idle'); setExportProgress(0); }, 300);
    }
  };

  // --- DOC Export Handler ---
  const handleExportDocx = async () => {
    if (!previewContainerRef.current) {
      alert('Preview content is not ready for export.');
      return;
    }
    setIsExporting(true);
    setExportStage('doc');
    setExportProgress(5);

    const target = (previewContainerRef.current.querySelector('.taxon-card') as HTMLElement) || previewContainerRef.current;
    let htmlString = target.outerHTML;

    try {
      htmlString = await replaceImagesWithBase64(htmlString, (completed, total) => {
        const ratio = completed / Math.max(1, total);
        const pct = 5 + Math.round(ratio * 85);
        setExportProgress(pct);
      });

      setExportProgress(94);

      const fullHtml = `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8"/>\n<title>Taxonomy_${taxonomyId}</title>\n</head>\n<body>\n${htmlString}\n</body>\n</html>`;
      const blob = new Blob([fullHtml], { type: 'application/msword' });
      const fileName = `Taxonomy_${taxonomyId}.doc`;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);

      setExportProgress(98);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      setExportProgress(100);
    } catch (docErr: any) {
      alert(`Failed to generate DOC file: ${docErr?.message || 'An error occurred during file creation.'}`);
    } finally {
      setIsExporting(false);
      setTimeout(() => { setExportStage('idle'); setExportProgress(0); }, 300);
    }
  };

  return (
    <div className="container">
      {isExporting && (
        <div className="exporting-overlay" role="dialog" aria-live="polite" aria-label="กำลังส่งออกไฟล์">
          <div className="exporting-box">
            <div className="spinner" aria-hidden="true"></div>
            <div className="exporting-text">{exportStage === 'pdf' ? 'กำลังสร้าง PDF…' : 'กำลังสร้าง DOCX…'}</div>
            <div className="exporting-percent">{exportProgress}%</div>
            <div className="exporting-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={exportProgress}>
              <div className="bar" style={{ width: `${exportProgress}%` }} />
            </div>
          </div>
        </div>
      )}

      <div className="preview-toolbar">
        <div className="toolbar-group">
          <button
            onClick={handleExportDocx}
            disabled={loading || !!err || results.length === 0 || isExporting}
            className="btn-icon"
            title="ส่งออกเป็น DOCX"
            aria-label="ส่งออกเป็น DOCX"
          >
            {isExporting ? (
              <span className="spinner" aria-hidden="true" />
            ) : (
              <DocumentArrowDownIcon className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
          <button
            onClick={handleExportPdf}
            disabled={loading || !!err || results.length === 0 || isExporting}
            className="btn-icon"
            title="ส่งออกเป็น PDF"
            aria-label="ส่งออกเป็น PDF"
          >
            {isExporting ? (
              <span className="spinner" aria-hidden="true" />
            ) : (
              <ArrowDownTrayIcon className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
        <div className="toolbar-sep" aria-hidden="true"></div>
        <div className="toolbar-group">
          <button onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(2)))} className="btn-icon" title="ซูมออก" aria-label="ซูมออก">
            <MagnifyingGlassMinusIcon className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="zoom-label" aria-live="polite">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(1.8, +(z + 0.1).toFixed(2)))} className="btn-icon" title="ซูมเข้า" aria-label="ซูมเข้า">
            <MagnifyingGlassPlusIcon className="h-5 w-5" aria-hidden="true" />
          </button>
          <button onClick={() => setZoom(1)} className="btn-icon" title="รีเซ็ตขนาด" aria-label="รีเซ็ตขนาด">
            <ArrowPathIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div ref={previewContainerRef} className="preview-root">
        <div ref={wrapperRef} className="preview-wrapper">
          <section className="taxon-main">
            {/* existing content inside taxon-main */}
          </section>
        </div>
      </div>

      {/* existing JSX below */}

      <style jsx global>{`
        .preview-toolbar{
          position: sticky;
          top: 0;
          z-index: 5;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: .5rem;
          padding: .5rem .75rem;
          width: 100%;
          background: color-mix(in srgb, #ffffff 80%, rgba(255,255,255,.3));
          border-bottom: 1px solid var(--brand-border);
          backdrop-filter: blur(6px) saturate(1.05);
          -webkit-backdrop-filter: blur(6px) saturate(1.05);
        }
        .preview-toolbar .toolbar-group{ display: inline-flex; align-items: center; gap: .5rem; }
        .preview-toolbar .toolbar-sep{ width: 1px; height: 26px; background: color-mix(in srgb, var(--brand-gold) 45%, transparent); }
        .preview-toolbar .zoom-label{ min-width: 3.2ch; text-align: center; font-weight: 800; color: #1f2937; }

        .preview-root{ width: 100%; display: flex; justify-content: center; }
        .preview-wrapper{ will-change: transform; transform-origin: top center; }

        .exporting-overlay{ position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.55); backdrop-filter: blur(4px) saturate(1.05); -webkit-backdrop-filter: blur(4px) saturate(1.05); }
        .exporting-box{ display: flex; flex-direction: column; align-items: center; gap: .5rem; min-width: 280px; width: 360px; padding: 18px 22px; background: #fff; border: 1px solid var(--brand-border); border-radius: var(--radius-md); box-shadow: 0 10px 30px rgba(0,0,0,.15); }
        .exporting-text{ font-weight: 600; color: #1f2937; }
        .exporting-percent{ font-weight: 700; color: #111827; margin-top: -4px; }
        .exporting-progress{ width: 100%; height: 8px; background: #eef2f7; border: 1px solid var(--brand-border); border-radius: 999px; overflow: hidden; }
        .exporting-progress .bar{ height: 100%; width: 0%; background: linear-gradient(90deg, var(--brand-gold,#BD9425), #e3c35a); transition: width .2s ease; }
        .spinner{ width: 28px; height: 28px; border-radius: 50%; border: 3px solid #e5e7eb; border-top-color: var(--brand-gold,#BD9425); animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* existing style jsx block below */}

    </div>
  );
}