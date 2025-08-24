'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { PDFDocumentProxy } from 'pdfjs-dist';

const Document = dynamic(() => import('react-pdf').then(mod => mod.Document), { ssr: false });
const Page = dynamic(() => import('react-pdf').then(mod => mod.Page), { ssr: false });

// --- Pin pdf.js version on CDN to avoid runtime mismatches ---
const PDF_JS_VERSION = '5.4.54'; // 使用固定版本以保证一致性
const PDF_JS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDF_JS_VERSION}/pdf.min.mjs`;
const WORKER_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDF_JS_VERSION}/pdf.worker.min.mjs`;
// If your environment needs classic workers instead of module workers, you may switch to:
// const WORKER_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDF_JS_VERSION}/pdf.worker.min.js`;

// ---------------- Thai-friendly helpers ----------------
const collapseDuplicateThaiVowels = (s: string): string =>
  s.replace(/([\u0E31\u0E34-\u0E3A\u0E47-\u0E4D\u0E48-\u0E4B\u0E30\u0E32\u0E33])\1+/g, '$1');

const normThai = (s: string) =>
  collapseDuplicateThaiVowels(
    (s || '')
      .normalize('NFC')
      .replace(/\u00A0/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\uFFFD/g, '?')
      .replace(/\s+/g, ' ')
      .trim()
  );

const escapeHtml = (s: string) =>
  (s || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));

const textToHtmlParagraphs = (text: string): string => {
  const parts = (text || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((p) => normThai(p))
    .filter(Boolean);
  return parts.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n');
};

export default function UploadTaxonomyPdfPreviewPage() {
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { pdfjs } = await import('react-pdf');
        if (!mounted) return;
        pdfjs.GlobalWorkerOptions.workerSrc = WORKER_CDN; // use pinned CDN worker
      } catch (e) {
        console.error('[react-pdf] worker init failed:', e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);

  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [extractedHtml, setExtractedHtml] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);

  // Create & revoke object URL when file changes
  useEffect(() => {
    if (!file) {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
      setFileUrl(null);
      setNumPages(0);
      setPageNumber(1);
      setExtractedText('');
      setExtractedHtml('');
      setExtractError(null);
      setProgress(0);
      return;
    }
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const onPickFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (!f) return;
    if (!(f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))) {
      alert('กรุณาเลือกไฟล์ .pdf เท่านั้น');
      e.currentTarget.value = '';
      return;
    }
    setFile(f);
  }, []);

  const onLoadSuccess = useCallback(async (pdf: PDFDocumentProxy) => {
    setNumPages(pdf.numPages);
    setPageNumber(1);

    // Auto-extract when PDF is ready
    setExtracting(true);
    setExtractError(null);
    setExtractedText('');
    setExtractedHtml('');
    setProgress(5);

    try {
      let full = '';
      const total = pdf.numPages;
      for (let i = 1; i <= total; i++) {
        setProgress(Math.max(5, Math.min(95, Math.round((i / total) * 90))));
        const page = await pdf.getPage(i);
        const content: any = await page.getTextContent();
        const pageText = (content.items || [])
          .map((it: any) => (typeof it?.str === 'string' ? it.str : ''))
          .filter(Boolean)
          .join(' ');
        full += pageText + '\n\n';
      }
      const norm = normThai(full);
      setExtractedText(norm);
      setExtractedHtml(textToHtmlParagraphs(norm));
      setProgress(100);
    } catch (err: any) {
      console.error('[PDF] Extract error:', err);
      setExtractError(err?.message || 'เกิดข้อผิดพลาดขณะดึงข้อความจาก PDF');
    } finally {
      setExtracting(false);
      setTimeout(() => setProgress(0), 800);
    }
  }, []);

  const zoomIn = () => setScale((s) => Math.min(3, +((s + 0.2).toFixed(2))));
  const zoomOut = () => setScale((s) => Math.max(0.5, +((s - 0.2).toFixed(2))));
  const goPrev = () => setPageNumber((p) => Math.max(1, p - 1));
  const goNext = () => setPageNumber((p) => Math.min(numPages || 1, p + 1));

  return (
    <div className="pdf-page">
      <div className="container">
        <header className="topbar">
          <div>
            <h1 className="title">นำเข้า &amp; ดูตัวอย่าง PDF (react-pdf)</h1>
            <p className="subtitle">อัปโหลด .pdf เพื่อแสดงตัวอย่าง และดู HTML ที่สกัดจากข้อความ (รองรับภาษาไทย) — ยังไม่บันทึกฐานข้อมูล</p>
          </div>
          <div className="actions">
            <label className="btn btn-primary">
              เลือกไฟล์ PDF
              <input type="file" accept="application/pdf,.pdf" onChange={onPickFile} className="hidden-input" />
            </label>
            <button className="btn" onClick={() => setFile(null)} disabled={!file}>
              ล้างไฟล์
            </button>
          </div>
        </header>

        {!fileUrl ? (
          <section className="placeholder">
            <div className="card">
              <p className="lead">ยังไม่ได้เลือกไฟล์</p>
              <p className="hint">รองรับเฉพาะไฟล์ .pdf • ใช้ไลบรารี react-pdf เท่านั้น</p>
            </div>
          </section>
        ) : (
          <section className="grid">
            <div className="panel">
              <div className="panel-head">
                <h2 className="panel-title">ตัวอย่างเอกสาร</h2>
                <div className="right-hint">หน้า {pageNumber} / {numPages || 1}</div>
              </div>

              <div className="toolbar">
                <button className="btn" onClick={goPrev} disabled={pageNumber <= 1}>ก่อนหน้า</button>
                <div className="sep" />
                <button className="btn" onClick={zoomOut}>ซูมออก</button>
                <span className="zoom">{Math.round(scale * 100)}%</span>
                <button className="btn" onClick={zoomIn}>ซูมเข้า</button>
                <div className="sep" />
                <button className="btn" onClick={goNext} disabled={pageNumber >= (numPages || 1)}>ถัดไป</button>
              </div>

              <div className="viewer-wrap">
                <Document file={fileUrl} onLoadSuccess={onLoadSuccess} loading={<div className="loading">กำลังโหลด PDF…</div>}>
                  <Page pageNumber={pageNumber} scale={scale} renderTextLayer renderAnnotationLayer />
                </Document>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h2 className="panel-title">HTML ที่สกัดได้</h2>
                <div className="right-hint">{extracting ? 'กำลังสกัดข้อความ…' : extractError ? 'ผิดพลาด' : extractedHtml ? 'สำเร็จ' : '—'}</div>
              </div>

              {progress > 0 && (
                <div className="progress"><div className="bar" style={{ width: `${progress}%` }} /></div>
              )}

              {extractError ? (
                <div className="alert alert-danger">{extractError}</div>
              ) : extractedHtml ? (
                <div className="html-preview" dangerouslySetInnerHTML={{ __html: extractedHtml }} />
              ) : (
                <div className="blank">—</div>
              )}

              {!!extractedText && (
                <details className="text-dump">
                  <summary>ดูข้อความดิบ (text)</summary>
                  <textarea readOnly value={extractedText} />
                </details>
              )}
            </div>
          </section>
        )}
      </div>

      <style jsx>{`
        .container { max-width: 1200px; margin: 0 auto; padding: 16px; }
        .topbar { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
        .title { margin: 0 0 4px 0; font-size: 1.4rem; font-weight: 800; color: #111827; }
        .subtitle { margin: 0; color: #4b5563; font-size: .95rem; }
        .actions { display: flex; gap: 8px; }
        .btn { display: inline-flex; align-items: center; justify-content: center; gap: .5rem; height: 40px; padding: 0 14px; border-radius: 10px; border: 1px solid #e5e7eb; background: #fff; color: #111827; font-weight: 600; cursor: pointer; }
        .btn-primary { background: #111827; color: #fff; border-color: #111827; }
        .btn:disabled { opacity: .5; cursor: not-allowed; }
        .hidden-input { position: absolute; inset: 0; opacity: 0; width: 0; height: 0; pointer-events: none; }
        .placeholder .card { border: 1px dashed #d1d5db; border-radius: 12px; padding: 36px; text-align: center; background: #fafafa; }
        .placeholder .lead { font-weight: 700; color: #111827; margin: 0 0 6px 0; }
        .placeholder .hint { margin: 0; color: #6b7280; font-size: .9rem; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .panel { display: flex; flex-direction: column; min-height: 60vh; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; background: #fff; }
        .panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; background: #fbfbfb; }
        .panel-title { margin: 0; font-size: 1rem; font-weight: 800; color: #111827; }
        .right-hint { font-size: .85rem; color: #6b7280; }
        .toolbar { display: flex; gap: 8px; align-items: center; padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
        .sep { width: 1px; height: 28px; background: #e5e7eb; }
        .zoom { min-width: 52px; text-align: center; color: #374151; font-weight: 700; }
        .viewer-wrap { height: calc(100vh - 250px); min-height: 420px; overflow: auto; display: grid; place-items: center; background: #f8fafc; }
        .loading { color: #6b7280; padding: 24px; }
        .progress { height: 6px; background: #f3f4f6; border-radius: 999px; overflow: hidden; margin: 8px 12px; }
        .bar { height: 100%; background: #111827; width: 0%; transition: width .2s ease; }
        .alert-danger { margin: 12px; padding: 10px 12px; border-radius: 10px; border: 1px solid #fecaca; background: #fff1f2; color: #991b1b; font-size: .9rem; }
        .html-preview { padding: 12px; overflow: auto; height: calc(100% - 74px); }
        .html-preview p { margin: 0 0 .7em 0; line-height: 1.75; font-size: 1rem; color: #111827; font-family: "TH Sarabun New", "TH Sarabun PSK", Tahoma, Arial, sans-serif; }
        .blank { color: #9ca3af; padding: 12px; }
        .text-dump { margin: 8px 12px 12px; border-top: 1px dashed #e5e7eb; padding-top: 8px; }
        .text-dump summary { cursor: pointer; color: #374151; font-weight: 600; margin-bottom: 6px; }
        .text-dump textarea { width: 100%; min-height: 140px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; color: #111827; background: #fff; }
        @media (max-width: 1100px) { .grid { grid-template-columns: 1fr; } .viewer-wrap { height: 70vh; } }
      `}</style>
    </div>
  );
}