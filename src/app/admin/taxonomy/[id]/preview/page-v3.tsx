// src/app/admin/taxonomy/[id]/preview/page.tsx
'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
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

type Pagination = {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  total: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  prevPage?: number;
  nextPage?: number;
};

// === Helpers ===
function htmlToText(html: string): string {
  return html
    .replace(/\uFFFD/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  const params = useParams<{ id: string }>();
  const taxonomyId = Number(params?.id || 0);

  const [results, setResults] = useState<TaxonEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [pageSize, setPageSize] = useState<number>(10);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // selection state
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Preview/export refs & states
  const previewRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStage, setExportStage] = useState<'idle' | 'pdf' | 'doc'>('idle');
  const [zoom, setZoom] = useState(1);

  const fetchData = async (page = 1, size = pageSize) => {
    if (!taxonomyId) {
      setResults([]);
      setPagination(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(size));
      params.set('taxonomyId', String(taxonomyId)); // สำคัญ: filter ตาม taxonomy

      const r = await fetch(`/api/taxonomy/search?${params.toString()}`);
      if (!r.ok) {
        let m = `HTTP ${r.status}`;
        try { const j = await r.json(); m = j.error || m; } catch {}
        throw new Error(m);
      }
      const j = await r.json();
      const arr: TaxonEntry[] = Array.isArray(j.results) ? j.results : [];
      setResults(arr);
      setPagination(j.pagination || null);

      if (arr.length) {
        const exists = arr.some((x) => x.id === selectedId);
        if (!exists) setSelectedId(arr[0].id);
      } else {
        setSelectedId(null);
      }
    } catch (e: any) {
      setErr(e?.message || 'เกิดข้อผิดพลาด');
      setResults([]);
      setPagination(null);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(1); }, [taxonomyId]);

  const total = pagination?.total ?? results.length;
  const pageSizeEff = pagination?.pageSize ?? pageSize;
  const rangeStart = pagination ? Math.min(total, (pagination.currentPage - 1) * pageSizeEff + 1) : 0;
  const rangeEnd = pagination ? Math.min(total, pagination.currentPage * pageSizeEff) : 0;

  const selected = useMemo(() => {
    if (!results.length) return null;
    return results.find((r) => r.id === selectedId) || results[0] || null;
  }, [results, selectedId]);

  const hasSynonyms = !!(selected?.synonymsMarked || selected?.synonyms);
  const hasFamily = !!(selected?.familyMarked || selected?.family);
  const hasOtherNames = !!(selected?.otherNames);

  // Apply zoom transform to wrapper when zoom changes
  useEffect(() => {
    if (wrapperRef.current) {
      wrapperRef.current.style.transformOrigin = 'top center';
      wrapperRef.current.style.transform = `scale(${zoom})`;
    }
  }, [zoom]);

  // --- PDF Export Handler ---
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
      // Load libraries lazily
      const html2canvasMod: any = await import('html2canvas').then(m => m.default || m).catch(() => null);
      if (!html2canvasMod) throw new Error('html2canvas is not available.');
      const { jsPDF }: any = await import('jspdf').catch(() => ({ jsPDF: (window as any).jsPDF }));
      if (!jsPDF) throw new Error('jsPDF is not available.');

      // Temporarily neutralize transforms/effects that can confuse rasterization
      wrapperRef.current.style.transform = 'none';
      wrapperRef.current.style.transformOrigin = 'top left';

      // Hide toolbar during capture
      const toolbar = document.querySelector<HTMLElement>('.preview-toolbar');
      const prevToolbarDisplay = toolbar?.style.display || '';
      if (toolbar) toolbar.style.display = 'none';

      const targetEl = wrapperRef.current;
      const canvas = await html2canvasMod(targetEl, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight; // move up for the next slice
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
        heightLeft -= pageHeight;
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

            {/* Main content (centered) */}
            {!loading && !err && (
              results.length === 0 ? (
                <div className="brand-card p-6 text-center text-gray-600">ไม่พบผลการค้นหา</div>
              ) : (
                <div className="preview-shell" ref={previewRef}>
                  <div className="a4-wrapper" ref={wrapperRef}>
                    <section className="taxon-main">
                      {!!selected && (
                        <div className="taxon-card taxon-card--a4">
                          <div className="taxon-header">
                            {/* Headline (title + scientific name inline, flexible) */}
                            <div className="taxon-headline">
                              <h3
                                className="taxon-title"
                                dangerouslySetInnerHTML={{
                                  __html:
                                    selected.officialNameThMarked ||
                                    selected.officialNameTh ||
                                    selected.titleMarked ||
                                    selected.title ||
                                    `หัวข้อ #${selected.id}`,
                                }}
                              />
                              {(selected.scientificName || selected.taxon?.scientificName) ? (
                                <div className="taxon-sci">
                                  <em>{selected.scientificName || selected.taxon?.scientificName}</em>
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
                                      __html: (selected.synonymsMarked ?? selected.synonyms) as string,
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
                                      __html: (selected.familyMarked ?? selected.family) as string,
                                    }}
                                  />
                                </dd>
                              </dl>
                            )}
                            {hasOtherNames && (
                              <dl className="row">
                                <dt>ชื่ออื่น ๆ</dt>
                                <dd>{selected.otherNames}</dd>
                              </dl>
                            )}
                          </div>

                          {(selected.shortDescriptionMarked || selected.shortDescription) && (
                            <div
                              className="taxon-shortdescription"
                              dangerouslySetInnerHTML={{ __html: selected.shortDescriptionMarked || selected.shortDescription || '' }}
                            />
                          )}

                          <article
                            className="taxon-article prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={{
                              __html: selected.contentHtmlMarked || selected.contentHtml || '',
                            }}
                          />
                          {selected.updatedAt && (
                            <div className="taxon-updated taxon-updated--bottom">
                              อัปเดตล่าสุด: {new Date(selected.updatedAt).toLocaleString('th-TH')}
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                  </div>
                </div>
              )
            )}

          </div>

          {/* Styles */}
          <style jsx>{`
            /* Bottom toolbar (sticky) */
            .bottom-toolbar{
              position: sticky;
              bottom: 0;
              background: #ffffffcc;
              backdrop-filter: saturate(1.1) blur(6px);
              border-top: 1px solid #e5e7eb;
              padding: 8px 0;
              z-index: 35;
            }
            .toolbar{
              display: grid;
              grid-template-columns: auto 1fr auto;
              align-items: center;
              gap: 12px;
            }
            .toolbar__section{
              display: flex;
              align-items: center;
              gap: 8px;
              min-height: 40px;
            }
            .toolbar__section--left{ justify-content: flex-start; }
            .toolbar__pager{
              justify-content: center;
              flex-wrap: wrap;
            }
            .toolbar__section--right{
              justify-content: flex-end;
              gap: 8px;
            }
            @media (max-width: 640px){
              .toolbar{ grid-template-columns: 1fr auto; }
              .toolbar__pager{ display: none; }
            }
            .tsep{ color:#9ca3af; padding: 0 2px; }
            .tbtn{
              height: 36px;
              min-width: 36px;
              padding: 0 10px;
              border-radius: 10px;
              border: 1px solid #e5e7eb;
              background: #f9fafb;
              color: #374151;
              font-weight: 600;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              transition: background .15s ease, border-color .15s ease, color .15s ease, box-shadow .15s ease;
            }
            .tbtn:hover{ background:#f3f4f6; border-color:#d1d5db; color:#111827; }
            .tbtn:active{ transform: translateY(0.5px); }
            .tbtn[disabled]{ opacity:.45; cursor: not-allowed; }
            .tbtn-number{ min-width: 38px; padding: 0 12px; }
            .tbtn-number.is-active{
              background:#0c57d2; border-color:#0c57d2; color:#fff;
              box-shadow: 0 1px 4px rgba(12,87,210,.25);
            }
            .toolbar__info{ font-size: .9rem; color:#6b7280; white-space: nowrap; }

            /* Layout & page styles */
            .fullpage { padding: 0; margin: 0; width: 100vw; }
            .a4-page { max-width: 100%; }
            .taxon-main { width: min(100%, 900px); margin: 0 auto; }

            .taxon-card {
              background: #fff;
              border: 1px solid var(--border, #e5e7eb);
              border-radius: 14px;
              padding: 30px;
              box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
            }
            .taxon-header {
              display: grid;
              grid-template-columns: 1fr auto;
              gap: 16px;
              align-items: baseline;
              margin-bottom: 8px;
            }
            .taxon-headline { display: flex; align-items: baseline; gap: clamp(12px, 1.5vw, 18px); flex-wrap: wrap; }
            .taxon-sci { font-size: clamp(1.5rem, 1.5vw, 1.5rem); line-height: 1.2; color: #6b2a34; opacity: .9; }
            .taxon-title {
              font-size: clamp(2.5rem, 2.5vw, 2.5rem);
              line-height: 1.15;
              font-weight: 800;
              color: #50151d;
              margin: 0;
            }
            .taxon-sci em { font-style: italic; }
            .taxon-updated { font-size: 0.85rem; color: #6b7280; text-align: right; }
            .taxon-updated--bottom { padding-top: .5rem; margin-top: .5rem; border-top: 1px dashed var(--border, #e5e7eb); }

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
              border-radius: 15px;
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

            .preview-shell{ width: 100%; display: flex; flex-direction: column; align-items: center; }
            .a4-wrapper{ width: 100%; max-width: calc(900px + 24px); display: flex; flex-direction: column; align-items: center; gap: 16px; will-change: transform; }

            /* Exporting overlay */
            .exporting-overlay{ position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.55); backdrop-filter: blur(4px) saturate(1.05); -webkit-backdrop-filter: blur(4px) saturate(1.05); }
            .exporting-box{ display: flex; flex-direction: column; align-items: center; gap: .5rem; min-width: 280px; width: 360px; padding: 18px 22px; background: #fff; border: 1px solid var(--brand-border, #e5e7eb); border-radius: var(--radius-md, 10px); box-shadow: 0 10px 30px rgba(0,0,0,.15); }
            .exporting-text{ font-weight: 600; color: #1f2937; }
            .exporting-percent{ font-weight: 700; color: #111827; margin-top: -4px; }
            .exporting-progress{ width: 100%; height: 8px; background: #eef2f7; border: 1px solid var(--brand-border, #e5e7eb); border-radius: 999px; overflow: hidden; }
            .exporting-progress .bar{ height: 100%; width: 0%; background: linear-gradient(90deg, var(--brand-gold,#BD9425), #e3c35a); transition: width .2s ease; }
            .spinner{ width: 28px; height: 28px; border-radius: 50%; border: 3px solid #e5e7eb; border-top-color: var(--brand-gold,#BD9425); animation: spin 1s linear infinite; }
            @keyframes spin { to { transform: rotate(360deg); } }
          `}</style>
        </section>
      </main>
    </div>
  );
}