// src/app/admin/taxonomy/[id]/preview/page.tsx
'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { DocumentArrowDownIcon, ArrowDownTrayIcon, MagnifyingGlassPlusIcon, MagnifyingGlassMinusIcon, ArrowPathIcon } from '@heroicons/react/24/solid';

// === Types ===
type TaxonEntry = {
  id: number;
  taxonId: number;
  title: string | null;
  slug: string | null;
  orderIndex: number | null;
  contentHtml: string | null;
  contentText: string | null;
  shortDescription?: string | null;

  // NEW meta fields from schema
  official?: string | null;
  officialNameTh?: string | null;
  scientificName?: string | null;
  genus?: string | null;
  species?: string | null;
  family?: string | null;
  authorsDisplay?: string | null;
  authorsPeriod?: string | null;
  otherNames?: string | null;
  synonyms?: string | null;
  author?: string | null;

  // Highlighted fields
  titleMarked?: string | null;
  contentHtmlMarked?: string | null;
  contentTextMarked?: string | null;
  shortDescriptionMarked?: string | null;
  officialNameThMarked?: string | null;
  familyMarked?: string | null;
  synonymsMarked?: string | null;

  updatedAt?: string;
  taxon?: { id: number; scientificName: string | null };
};

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
      // ignore per-image error
    } finally {
      completed++;
      onProgress?.(completed, total);
    }
  }
  return tempDiv.innerHTML;
}

// --- Helpers: wait for web fonts to load before rasterization (html2canvas) ---
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
async function waitForWebFonts(root?: HTMLElement | null, timeoutMs = 7000) {
  try {
    const start = Date.now();
    // 1) Await document.fonts.ready if available (best effort, time-bounded)
    const fontsObj: any = (document as any).fonts;
    if (fontsObj?.ready) {
      await Promise.race([
        fontsObj.ready,
        new Promise((_resolve, reject) => setTimeout(() => reject(new Error('fonts.ready timeout')), timeoutMs)),
      ]).catch(() => {});
    }
    // Preload the target Thai family explicitly (common weights) so html2canvas uses it
    if (fontsObj?.load) {
      try {
        await Promise.race([
          Promise.allSettled([
            fontsObj.load(`400 16px "TH Sarabun PSK"`),
            fontsObj.load(`700 16px "TH Sarabun PSK"`),
            fontsObj.load(`400 16px "TH Sarabun New"`),
            fontsObj.load(`700 16px "TH Sarabun New"`),
          ]),
          sleep(Math.max(500, Math.floor(timeoutMs / 2)))
        ]).catch(() => {});
      } catch {}
    }
    // 2) Explicitly request loads for font families observed inside the root tree (first 150 elements to cap cost)
    if (root && fontsObj?.load) {
      const els = Array.from(root.querySelectorAll<HTMLElement>('*')).slice(0, 150);
      const loads: Promise<any>[] = [];
      const seen = new Set<string>();
      for (const el of els) {
        const cs = getComputedStyle(el);
        const famRaw = cs.fontFamily || '';
        const fam = famRaw.split(',')[0]?.replace(/["']/g, '').trim();
        const weight = cs.fontWeight || '400';
        const size = cs.fontSize || '16px';
        const key = `${weight}|${size}|${fam}`;
        if (fam && !seen.has(key)) {
          seen.add(key);
          try { loads.push(fontsObj.load(`${weight} ${size} ${fam}`)); } catch { /* ignore individual load errors */ }
        }
      }
      if (loads.length) {
        const timeLeft = Math.max(500, timeoutMs - (Date.now() - start));
        await Promise.race([Promise.allSettled(loads), sleep(timeLeft)]).catch(() => {});
      }
    }
    // Short settle
    await sleep(120);
  } catch {
    /* noop */
  }
}

export default function AdminTaxonomyPreviewPage() {
  const params = useParams<{ id: string }>();
  const taxonomyId = Number(params?.id || 0);

  const [results, setResults] = useState<TaxonEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Preview/export refs & states
  const previewRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStage, setExportStage] = useState<'idle' | 'pdf' | 'doc'>('idle');
  const [zoom, setZoom] = useState(1);

  // Fetch ALL entries for the taxonomy (no pagination)
  const fetchAll = async () => {
    if (!taxonomyId) { setResults([]); return; }
    setLoading(true);
    setErr(null);
    try {
      const pageSize = 50; // API maximum
      const all: TaxonEntry[] = [];
      let page = 1;
      // loop until no next page
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const sp = new URLSearchParams();
        sp.set('page', String(page));
        sp.set('pageSize', String(pageSize));
        sp.set('taxonomyId', String(taxonomyId));
        const r = await fetch(`/api/taxonomy/search?${sp.toString()}`);
        if (!r.ok) {
          let m = `HTTP ${r.status}`;
          try { const j = await r.json(); m = j.error || m; } catch {}
          throw new Error(m);
        }
        const j = await r.json();
        const chunk: TaxonEntry[] = Array.isArray(j.results) ? j.results : [];
        all.push(...chunk);
        if (!j.pagination?.hasNextPage) break;
        page = (j.pagination?.nextPage || (page + 1));
      }

      // Always sort by orderIndex ascending; missing orderIndex goes last, tie-break by id
      all.sort((a, b) => {
        const A = typeof a.orderIndex === 'number' ? a.orderIndex : Number.MAX_SAFE_INTEGER;
        const B = typeof b.orderIndex === 'number' ? b.orderIndex : Number.MAX_SAFE_INTEGER;
        if (A !== B) return A - B;
        return (a.id ?? 0) - (b.id ?? 0);
      });

      setResults(all);
    } catch (e: any) {
      setErr(e?.message || 'เกิดข้อผิดพลาด');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); /* load all entries once */ }, [taxonomyId]);

  // Apply zoom transform to wrapper when zoom changes
  useEffect(() => {
    if (wrapperRef.current) {
      wrapperRef.current.style.transformOrigin = 'top center';
      wrapperRef.current.style.transform = `scale(${zoom})`;
    }
  }, [zoom]);

  // --- PDF Export Handler: render each A4 page individually ---
  const handleExportPdf = async () => {
    if (!wrapperRef.current) {
      alert('Preview content is not ready for export.');
      return;
    }
    setIsExporting(true);
    setExportStage('pdf');
    setExportProgress(5);

    const originalTransform = wrapperRef.current.style.transform;
    const originalTransformOrigin = wrapperRef.current.style.transformOrigin;

    try {
      const html2canvasMod: any = await import('html2canvas').then(m => m.default || m).catch(() => null);
      if (!html2canvasMod) throw new Error('html2canvas is not available.');
      const { jsPDF }: any = await import('jspdf').catch(() => ({ jsPDF: (window as any).jsPDF }));
      if (!jsPDF) throw new Error('jsPDF is not available.');

      // Neutralize transforms & hide toolbar during capture
      wrapperRef.current.style.transform = 'none';
      wrapperRef.current.style.transformOrigin = 'top left';
      const toolbar = document.querySelector<HTMLElement>('.preview-toolbar');
      const prevToolbarDisplay = toolbar?.style.display || '';
      if (toolbar) toolbar.style.display = 'none';

      // Ensure web fonts are fully loaded before capturing
      await waitForWebFonts(wrapperRef.current, 7000);

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const pages = Array.from(wrapperRef.current.querySelectorAll<HTMLElement>('.a4-page'));
      if (pages.length === 0) throw new Error('No pages to export.');

      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i];
        pageEl.scrollIntoView({ block: 'center' });
        // Double-check fonts for this page (defensive, in case of late subfont splits)
        await waitForWebFonts(pageEl, 4000);
        const canvas = await html2canvasMod(pageEl, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
        const imgData = canvas.toDataURL('image/jpeg', 1.0);

        if (i === 0) {
          pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
        } else {
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
        }
        // progress (allocate ~90% here)
        const pct = 5 + Math.round(((i + 1) / pages.length) * 90);
        setExportProgress(pct);
      }

      setExportProgress(98);
      const fileName = `Taxonomy_${taxonomyId || ''}.pdf`;
      pdf.save(fileName);
      setExportProgress(100);

      if (toolbar) toolbar.style.display = prevToolbarDisplay;
    } catch (err: any) {
      alert(`Failed to generate PDF: ${err?.message || 'An error occurred during PDF generation.'}`);
    } finally {
      if (wrapperRef.current) {
        wrapperRef.current.style.transformOrigin = originalTransformOrigin;
        wrapperRef.current.style.transform = originalTransform;
      }
      setIsExporting(false);
      setTimeout(() => { setExportStage('idle'); setExportProgress(0); }, 300);
    }
  };

  // --- DOC Export Handler ---
  const handleExportDocx = async () => {
    if (!previewRef.current) {
      alert('Preview content is not ready for export.');
      return;
    }
    setIsExporting(true);
    setExportStage('doc');
    setExportProgress(5);

    let htmlString = previewRef.current.innerHTML;
    try {
      htmlString = await replaceImagesWithBase64(htmlString, (completed, total) => {
        const ratio = completed / Math.max(1, total);
        const pct = 5 + Math.round(ratio * 85);
        setExportProgress(pct);
      });

      setExportProgress(94);

      const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Taxonomy_${taxonomyId || ''}</title></head><body>${htmlString}</body></html>`;
      const blob = new Blob([fullHtml], { type: 'application/msword' });
      const fileName = `Taxonomy_${taxonomyId || ''}.doc`;
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
    } catch (docxError: any) {
      alert(`Failed to generate DOC file: ${docxError?.message || 'An error occurred during file creation.'}`);
    } finally {
      setIsExporting(false);
      setTimeout(() => { setExportStage('idle'); setExportProgress(0); }, 300);
    }
  };

  return (
    <div className="reader-stage reader-stage--full">
      <main className="fullpage">
        <section className="a4-page">
          <div className="container">
            {isExporting && (
              <div className="exporting-overlay" role="dialog" aria-live="polite" aria-label="กำลังส่งออกไฟล์">
                <div className="exporting-box">
                  <div className="spinner" aria-hidden="true"></div>
                  <div className="exporting-text">{exportStage === 'pdf' ? 'กำลังสร้าง PDF…' : 'กำลังสร้าง DOC…'}</div>
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
                  disabled={loading || !!err || isExporting || results.length === 0}
                  className="btn-icon"
                  title="ส่งออกเป็น DOC"
                  aria-label="ส่งออกเป็น DOC"
                >
                  {isExporting ? (
                    <span className="spinner" aria-hidden="true" />
                  ) : (
                    <DocumentArrowDownIcon className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
                <button
                  onClick={handleExportPdf}
                  disabled={loading || !!err || isExporting || results.length === 0}
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
                <button
                  onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(2)))}
                  className="btn-icon"
                  title="ซูมออก"
                  aria-label="ซูมออก"
                >
                  <MagnifyingGlassMinusIcon className="h-5 w-5" aria-hidden="true" />
                </button>
                <span className="zoom-label" aria-live="polite">{Math.round(zoom * 100)}%</span>
                <button
                  onClick={() => setZoom((z) => Math.min(1.8, +(z + 0.1).toFixed(2)))}
                  className="btn-icon"
                  title="ซูมเข้า"
                  aria-label="ซูมเข้า"
                >
                  <MagnifyingGlassPlusIcon className="h-5 w-5" aria-hidden="true" />
                </button>
                <button
                  onClick={() => setZoom(1)}
                  className="btn-icon"
                  title="รีเซ็ตขนาด"
                  aria-label="รีเซ็ตขนาด"
                >
                  <ArrowPathIcon className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>

            {err && (
              <div className="alert alert--danger" role="alert">
                <strong>เกิดข้อผิดพลาด:</strong> {err}
              </div>
            )}

            {/* Main content: ALL entries, one A4 page per entry, separated by hr */}
            {!loading && !err && (
              results.length === 0 ? (
                <div className="brand-card p-6 text-center text-gray-600">ไม่พบผลการค้นหา</div>
              ) : (
                <div className="preview-shell" ref={previewRef}>
                  <div className="a4-wrapper" ref={wrapperRef}>
                    {results.map((r, idx) => {
                      const hasSynonyms = !!(r.synonymsMarked || r.synonyms);
                      const hasFamily = !!(r.familyMarked || r.family);
                      const hasOtherNames = !!(r.otherNames);
                      return (
                        <div key={r.id} style={{ width: '100%' }}>
                          <div className="a4-page">
                            <div className="a4-content">
                              <section className="taxon-main">
                                <div className="taxon-header">
                                  <div className="taxon-headline">
                                    <h3
                                      className="taxon-title"
                                      dangerouslySetInnerHTML={{
                                        __html:
                                          r.officialNameThMarked ||
                                          r.officialNameTh ||
                                          r.titleMarked ||
                                          r.title ||
                                          `หัวข้อ #${r.id}`,
                                      }}
                                    />
                                    {(r.scientificName || r.taxon?.scientificName) ? (
                                      <div className="taxon-sci">
                                        <em>{r.scientificName || r.taxon?.scientificName}</em>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>

                                {/* Meta header */}
                                <div className="taxon-metaheader">
                                  {hasSynonyms && (
                                    <dl className="row">
                                      <dt>ชื่อพ้อง</dt>
                                      <dd>
                                        <i
                                          dangerouslySetInnerHTML={{
                                            __html: (r.synonymsMarked ?? r.synonyms) as string,
                                          }}
                                        />
                                      </dd>
                                    </dl>
                                  )}
                                  {hasFamily && (
                                    <dl className="row">
                                      <dt>วงศ์</dt>
                                      <dd>
                                        <i
                                          dangerouslySetInnerHTML={{
                                            __html: (r.familyMarked ?? r.family) as string,
                                          }}
                                        />
                                      </dd>
                                    </dl>
                                  )}
                                  {hasOtherNames && (
                                    <dl className="row">
                                      <dt>ชื่ออื่น ๆ</dt>
                                      <dd>{r.otherNames}</dd>
                                    </dl>
                                  )}
                                </div>

                                {(r.shortDescriptionMarked || r.shortDescription) && (
                                  <div
                                    className="taxon-shortdescription"
                                    dangerouslySetInnerHTML={{ __html: r.shortDescriptionMarked || r.shortDescription || '' }}
                                  />
                                )}

                                <article
                                  className="taxon-article prose prose-sm max-w-none"
                                  dangerouslySetInnerHTML={{
                                    __html: r.contentHtmlMarked || r.contentHtml || '',
                                  }}
                                />
                              </section>
                            </div>
                            {/* Footer shows page number */}
                            <div className="a4-footer">หน้า {idx + 1}</div>
                          </div>
                          {idx < results.length - 1 && <hr className="page-sep" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            )}

          </div>

          {/* Styles */}
          <style jsx>{`
            /* Layout & page styles */
            .fullpage { padding: 0; margin: 0; width: 100vw; }
            .a4-page { max-width: 100%; }

            .preview-shell{ width: 100%; display: flex; flex-direction: column; align-items: center; }
            .a4-wrapper{
              width: 100%;
              max-width: calc(210mm + 24px);
              display: flex; flex-direction: column; align-items: center; gap: 8mm;
              will-change: transform;
              padding-top: 10px;
            }

            .a4-page{
              position: relative;
              width: 210mm;
              min-height: 297mm;
              background: #fff;
              border-radius: 12px;
              box-shadow: 0 10px 30px rgba(0,0,0,.10);
              overflow: hidden;
              border: 1px solid #e5e7eb;
            }
            .a4-content{
              position: relative;
              height: calc(297mm - 18mm);
              padding: 14mm 14mm 22mm 14mm; /* bottom padding so text won't overlap footer */
              overflow: hidden; /* avoid overflow across pages */
              color: #111827;
              /* Default Thai font for A4 content and export */
              font-family: "TH Sarabun PSK","TH Sarabun New",Sarabun,"Tahoma","Leelawadee UI","Leelawadee",sans-serif;
              -webkit-font-smoothing: antialiased;
              -moz-osx-font-smoothing: grayscale;
              text-rendering: optimizeLegibility;
            }
            /* Ensure all descendants use the same Thai font (screen & PDF) */
            .a4-content *{
              font-family: "TH Sarabun PSK","TH Sarabun New",Sarabun,"Tahoma","Leelawadee UI","Leelawadee",sans-serif !important;
            }
            /* Force <p> and text descendants to always use TH Sarabun PSK in screen & PDF */
            .a4-content p,
            .a4-content p *,
            .a4-content .prose p,
            .a4-content .prose p *{
              font-family: "TH Sarabun PSK","TH Sarabun New",Sarabun,"Tahoma","Leelawadee UI","Leelawadee",sans-serif !important;
            }
            /* Override any inline font-family coming from pasted HTML */
            .a4-content [style*="font-family"]{
              font-family: "TH Sarabun PSK","TH Sarabun New",Sarabun,"Tahoma","Leelawadee UI","Leelawadee",sans-serif !important;
            }
            .a4-footer{
              position: absolute;
              bottom: 8mm;
              right: 12mm;
              font-size: .9rem;
              color: #374151;
              font-family: "TH Sarabun PSK","TH Sarabun New",Sarabun,"Tahoma","Leelawadee UI","Leelawadee",sans-serif;
            }
            .page-sep{
              height: 2px;
              width: 210mm;
              border: 0;
              margin: 6mm 0 0;
              background: linear-gradient(90deg, transparent, rgba(189,148,37,.65), transparent);
              opacity: .9;
            }

            /* Typography blocks inside page */
            .taxon-main { width: 100%; margin: 0 auto; }
            .taxon-header {
              display: grid;
              grid-template-columns: 1fr auto;
              gap: 16px;
              align-items: baseline;
              margin-bottom: 8px;
            }
            .taxon-headline { display: flex; align-items: baseline; gap: clamp(12px, 1.5vw, 18px); flex-wrap: wrap; }
            .taxon-sci { font-size: clamp(1.5rem, 1.5vw, 1.5rem); line-height: 1.2; color: #6b2a34; opacity: .9; }
            .taxon-title { font-size: clamp(2.1rem, 2.2vw, 2.6rem); line-height: 1.15; font-weight: 800; color: #50151d; margin: 0; }
            .taxon-sci em { font-style: italic; }

            .taxon-metaheader {
              display: grid;
              grid-template-columns: 4rem 1fr;
              column-gap: 14px;
              row-gap: 6px;
              margin: 12px 0 12px;
            }
            .taxon-metaheader .row { display: contents; }
            .taxon-metaheader dt { color: #111827; font-weight: 900; }
            .taxon-metaheader dd { margin: 0; color: #111827; }

            .taxon-shortdescription {
              margin: 1rem 0 1rem;
              font-size: 1rem;
              line-height: 1.5rem;
              color: #111827;
              background: #c1a58c;
              padding: 0.5rem 1rem 0.5rem 1rem;
              border-radius: 12px;
            }
            .taxon-shortdescription p { margin: 0; }

            .taxon-article { text-align: justify; }
            @media (min-width: 1024px) { .taxon-article { column-count: 2; column-gap: 36px; } }
            .taxon-article p:has(> strong:only-child) {
              background: #f3eee6;
              padding: 10px 14px;
              border-radius: 10px;
              display: inline-block;
              margin: 6px 0 10px;
              color: #374151;
            }
            .taxon-article p > strong { color: #111827; }
            .taxon-article p { line-height: 1.85; }
            .taxon-article em { font-style: italic; }
          `}</style>
          <style jsx global>{`
            /* Prefer local Thai government fonts if installed; fall back to Sarabun webfont */
            @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&amp;display=swap');
            @font-face{
              font-family: "TH Sarabun PSK";
              src: local("TH Sarabun PSK"), local("THSarabunPSK");
              font-style: normal;
              font-weight: 400 700;
              font-display: swap;
            }
            @font-face{
              font-family: "TH Sarabun New";
              src: local("TH Sarabun New"), local("THSarabunNew");
              font-style: normal;
              font-weight: 400 700;
              font-display: swap;
            }
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
              border-bottom: 1px solid var(--brand-border, #e5e7eb);
              backdrop-filter: blur(6px) saturate(1.05);
              -webkit-backdrop-filter: blur(6px) saturate(1.05);
            }
            .preview-toolbar .toolbar-group{ display: inline-flex; align-items: center; gap: .5rem; }
            .preview-toolbar .toolbar-sep{ width: 1px; height: 26px; background: color-mix(in srgb, var(--brand-gold, #BD9425) 45%, transparent); }
            .preview-toolbar .zoom-label{ min-width: 3.2ch; text-align: center; font-weight: 800; color: #1f2937; }

            /* Force Thai fonts for all A4 content (screen, export, and dynamic HTML) */
            .a4-content,
            .a4-content *,
            .a4-content p,
            .a4-content p *,
            .a4-content .prose p,
            .a4-content .prose p *,
            .a4-content [style*="font-family"],
            .taxon-shortdescription,
            .taxon-shortdescription *,
            .taxon-article,
            .taxon-article *,
            .a4-footer{
              font-family: "TH Sarabun PSK","TH Sarabun New",Sarabun,"Tahoma","Leelawadee UI","Leelawadee",sans-serif !important;
            }
            /* Extra override for Tailwind Typography and common inline elements */
            .a4-content .prose,
            .a4-content .prose *,
            .a4-content p,
            .a4-content p *,
            .a4-content em,
            .a4-content strong,
            .a4-content i,
            .a4-content b {
              font-family: "TH Sarabun PSK","TH Sarabun New",Sarabun,"Tahoma","Leelawadee UI","Leelawadee",sans-serif !important;
            }

            /* Exporting overlay */
            .exporting-overlay{ position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.55); backdrop-filter: blur(4px) saturate(1.05); -webkit-backdrop-filter: blur(4px) saturate(1.05); }
            .exporting-box{ display: flex; flex-direction: column; align-items: center; gap: .5rem; min-width: 280px; width: 360px; padding: 18px 22px; background: #fff; border: 1px solid var(--brand-border, #e5e7eb); border-radius: var(--radius-md, 10px); box-shadow: 0 10px 30px rgba(0,0,0,.15); }
            .exporting-text{ font-weight: 600; color: #1f2937; }
            .exporting-percent{ font-weight: 700; color: #111827; margin-top: -4px; }
            .exporting-progress{ width: 100%; height: 8px; background: #eef2f7; border: 1px solid var(--brand-border, #e5e7eb); border-radius: 999px; overflow: hidden; }
            .exporting-progress .bar{ height: 100%; width: 0%; background: linear-gradient(90deg, var(--brand-gold,#BD9425), #e3c35a); transition: width .2s ease; }
            .spinner{ width: 28px; height: 28px; border-radius: 50%; border: 3px solid #e5e7eb; border-top-color: var(--brand-gold,#BD9425); animation: spin 1s linear infinite; }
            @keyframes spin { to { transform: rotate(360deg); } }

            /* Print styles */
            @media print{
              body { background: #fff !important; }
              .preview-toolbar { display: none !important; }
              .a4-wrapper{ gap: 0; }
              .a4-page{ box-shadow: none; page-break-after: always; border-radius: 0; width: 210mm; min-height: 297mm; }
              .page-sep{ display: none; }
              .a4-content{ height: auto; overflow: visible; }
            }
          `}</style>
        </section>
      </main>
    </div>
  );
}