//dictionaries/[id]/preview/pages.tsx
"use client";

import { useEffect, useState, useRef, useLayoutEffect } from "react";
import {
  DocumentArrowDownIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ArrowPathIcon
} from '@heroicons/react/24/solid';
import { useRouter } from "next/navigation";

// --- Utility: Replace all <img> with base64 data URI ---
async function replaceImagesWithBase64(htmlString: string) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlString;
  const imgEls = tempDiv.querySelectorAll('img');
  await Promise.all(Array.from(imgEls).map(async (img) => {
    const src = img.getAttribute('src');
    if (!src || src.startsWith('data:')) return;
    try {
      const res = await fetch(src);
      if (!res.ok) return;
      const blob = await res.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      img.setAttribute('src', base64);
    } catch (err) {
      // ถ้าโหลดรูปไม่ได้ จะข้ามไปเฉย ๆ
    }
  }));
  return tempDiv.innerHTML;
}

function isMeaningfulText(node: ChildNode) {
  return node.nodeType === Node.TEXT_NODE && node.textContent && node.textContent.trim().length > 0;
}

const DictionaryPreviewPage = ({ params }: { params: Promise<{ id: string }> }) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [dictId, setDictId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // --- Effect to unwrap params and set dictId ---
  useEffect(() => {
    let isMounted = true;
    const resolveParams = async () => {
      try {
        const resolvedParams = await params;
        if (isMounted) {
          setDictId(resolvedParams.id);
          if (!resolvedParams.id) {
            setIsLoading(false);
            setError("Dictionary ID is missing.");
          }
        }
      } catch (err) {
        if (isMounted) {
          setError("Failed to load dictionary ID.");
          setIsLoading(false);
        }
      }
    };
    resolveParams();
    return () => {
      isMounted = false;
    };
  }, [params]);

  // Fetch the HTML preview content
  useEffect(() => {
    if (!dictId) return;
    const fetchPreview = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const apiUrl = `/api/export-dictionary/preview/${encodeURIComponent(dictId)}`;
        const response = await fetch(apiUrl);
        if (!response.ok) {
          if (response.status === 404) throw new Error("Dictionary not found.");
          else if (response.status === 503) throw new Error("Preview service is temporarily unavailable.");
          else {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
          }
        }
        const htmlText = await response.text();
        setHtmlContent(htmlText);
      } catch (err: any) {
        setError(err.message || "Failed to load preview.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchPreview();
  }, [dictId]);

  // Render paginated A4 pages
  useEffect(() => {
    if (!htmlContent || !previewContainerRef.current) return;

    const host = previewContainerRef.current as HTMLDivElement;
    // Reset container
    host.innerHTML = "";
    host.classList.add("preview-shell");
    host.style.overflow = 'auto';

    // Wrapper to center pages and add gaps
    const wrapper = document.createElement("div");
    wrapper.className = "a4-wrapper";
    host.appendChild(wrapper);
    wrapperRef.current = wrapper;
    // initial zoom transform
    wrapper.style.transformOrigin = 'top center';
    wrapper.style.transform = `scale(${zoom})`;

    // Helper to create a new page
    let pageIndex = 0;
    const newPage = () => {
      const page = document.createElement("div");
      page.className = "a4-page";

      const content = document.createElement("div");
      content.className = "a4-content";
      page.appendChild(content);

      const footer = document.createElement("div");
      footer.className = "a4-footer";
      footer.textContent = ""; // will set after pagination complete
      page.appendChild(footer);

      wrapper.appendChild(page);
      return { page, content, footer };
    };

    const { content: firstContent } = newPage();
    let currentContent = firstContent;

    // Parse incoming HTML into nodes
    const temp = document.createElement("div");
    temp.innerHTML = htmlContent;

    // Determine max content height in px from styled A4 content box
    // Force layout by reading clientHeight (A4 height minus footer/padding set in CSS)
    const getMax = () => currentContent.clientHeight;

    const appendOrPaginate = (node: ChildNode) => {
      // Normalize text nodes into <p> for better flow
      let toAppend: Node = node;
      if (isMeaningfulText(node)) {
        const p = document.createElement("p");
        p.textContent = (node.textContent || "").trim();
        toAppend = p;
      }

      currentContent.appendChild(toAppend);

      // If overflow, move node to a new page
      const overflowed = currentContent.scrollHeight > currentContent.clientHeight;
      if (overflowed) {
        currentContent.removeChild(toAppend);

        // Insert page separator between pages
        const sep = document.createElement("hr");
        sep.className = "page-sep";
        wrapper.appendChild(sep);

        const { content: nextContent } = newPage();
        currentContent = nextContent;
        currentContent.appendChild(toAppend);

        // If a single element is taller than a page, allow overflow (edge case)
        if (currentContent.scrollHeight > getMax()) {
          currentContent.style.overflow = "hidden"; // visually contained
        }
      }
    };

    Array.from(temp.childNodes).forEach(appendOrPaginate);

    // Set page numbers
    const pages = wrapper.querySelectorAll<HTMLDivElement>(".a4-page");
    pages.forEach((page, idx) => {
      const footer = page.querySelector<HTMLDivElement>(".a4-footer");
      if (footer) footer.textContent = `หน้า ${idx + 1}`;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [htmlContent]);

  // Effect to apply zoom transform to wrapper when zoom changes
  useEffect(() => {
    if (wrapperRef.current) {
      wrapperRef.current.style.transformOrigin = 'top center';
      wrapperRef.current.style.transform = `scale(${zoom})`;
    }
  }, [zoom]);

  // --- PDF Export Handler ---
  const handleExportPdf = async () => {
    if (!previewContainerRef.current || !dictId) {
      alert("Preview content is not ready for export.");
      return;
    }
    setIsExporting(true);

    try {
      // Wait for any styles/fonts/layout to finish rendering
      await new Promise((res) => setTimeout(res, 400));
      const html2pdfModule = await import("html2pdf.js");
      const html2pdfLib = html2pdfModule.default || html2pdfModule;

      const pdfOptions = {
        margin: 10,
        filename: `Dictionary_${dictId}.pdf`,
        image: { type: "png", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          /**
           * html2canvas clones the DOM. Here we sanitize CSS that uses modern color() / color-mix()
           * which the library cannot parse, and simplify backgrounds for reliability.
           */
          onclone: (doc: Document) => {
            // Hide interactive UI in the clone
            doc.querySelectorAll('.preview-toolbar').forEach(el => {
              (el as HTMLElement).style.display = 'none';
            });
            // Hide page separators in export
            doc.querySelectorAll('.page-sep').forEach(el => {
              (el as HTMLElement).style.display = 'none';
            });
            // Neutralize complex backgrounds that might use color-mix()/color()
            doc.querySelectorAll<HTMLElement>('.preview-shell, .a4-wrapper, .a4-page, .a4-content').forEach(el => {
              el.style.background = '#ffffff';
              el.style.backgroundImage = 'none';
              el.style.backdropFilter = 'none';
              (el.style as any)['-webkit-backdrop-filter'] = 'none';
            });
            // Sanitize <style> tags which include color-mix() or color()
            doc.querySelectorAll('style').forEach(st => {
              const t = st.textContent || '';
              if (t.includes('color-mix(') || t.includes('color(')) {
                st.textContent = t
                  .replace(/color-mix\([^)]*\)/g, '#e5e7eb')
                  .replace(/color\([^)]*\)/g, '#e5e7eb');
              }
            });
          }
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      } as const;

      await html2pdfLib().set(pdfOptions).from(previewContainerRef.current).save();
    } catch (pdfError: any) {
      alert(`Failed to generate PDF: ${pdfError.message || "An error occurred during PDF generation."}`);
    } finally {
      setIsExporting(false);
    }
  };

  // --- DOCX Export Handler (Now with image base64 support) ---
  const handleExportDocx = async () => {
    if (!previewContainerRef.current || !dictId) {
      alert("Preview content is not ready for export.");
      return;
    }
    setIsExporting(true);
    const element = previewContainerRef.current;
    let htmlString = element.innerHTML;

    try {
      // เปลี่ยนทุก <img> เป็น base64 ก่อน
      htmlString = await replaceImagesWithBase64(htmlString);

      const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <title>Dictionary_${dictId}</title>
      </head>
      <body>
      ${htmlString}
      </body>
      </html>
      `;
      const blob = new Blob([fullHtml], { type: "application/msword" });
      const fileName = `Dictionary_${dictId}.doc`;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (docxError: any) {
      alert(`Failed to generate DOCX file: ${docxError.message || "An error occurred during file creation."}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="preview-page">
      {isExporting && (
        <div className="exporting-overlay" role="status" aria-live="polite">
          <div className="exporting-box">
            <div className="spinner" aria-hidden="true"></div>
            <div className="exporting-text">กำลังสร้างไฟล์…</div>
          </div>
        </div>
      )}
      <div className="preview-toolbar">
        <div className="toolbar-group">
          <button
            onClick={handleExportDocx}
            disabled={isLoading || !!error || !dictId || isExporting}
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
            disabled={isLoading || !!error || !dictId || isExporting}
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
      {isLoading && (
        <div style={{ textAlign: "center", margin: "40px 0" }}>
          <p>Loading preview...</p>
        </div>
      )}
      {error && (
        <div style={{ textAlign: "center", margin: "40px 0" }}>
          <p style={{ color: "red" }}>Error: {error}</p>
          <button onClick={() => window.location.reload()} className="btn-secondary">Retry</button>{" "}
          <button onClick={() => router.back()} className="btn-ghost">Go Back</button>
        </div>
      )}
      {!isLoading && !error && (
        <div ref={previewContainerRef} />
      )}

      {/* Page-specific global styles */}
      <style jsx global>{`
        /* Leather-green background like login-pane--left for the preview shell */
        .preview-shell{
          min-height: calc(100dvh - var(--header-h, 0px) - var(--footer-h, 0px));
          width: 100%;
          padding: 0; /* full width, no outer margin/padding */
          display: flex;
          flex-direction: column;
          align-items: center;
          background-blend-mode: overlay, overlay, overlay, soft-light, multiply, normal;
          background-repeat: no-repeat;
          background-size: cover;
          background-position: center;
          overflow: auto; /* allow scrolling when zoomed */
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
          border-bottom: 1px solid var(--brand-border);
          backdrop-filter: blur(6px) saturate(1.05);
          -webkit-backdrop-filter: blur(6px) saturate(1.05);
        }
        .preview-toolbar .toolbar-group{ display: inline-flex; align-items: center; gap: .5rem; }
        .preview-toolbar .toolbar-sep{
          width: 1px; height: 26px;
          background: color-mix(in srgb, var(--brand-gold) 45%, transparent);
        }
        .preview-toolbar .zoom-label{
          min-width: 3.2ch;
          text-align: center;
          font-weight: 800;
          color: #1f2937;
        }

        /* Center and separate pages */
        .a4-wrapper{
          width: 100%;
          max-width: calc(210mm + 24px);
          display: flex; flex-direction: column; align-items: center; gap: 8mm;
          will-change: transform;
          padding-top:30px;
        }

        /* A4 page box */
        .a4-page{
          position: relative;
          width: 210mm;
          min-height: 297mm;
          background: #fff;
          border-radius: var(--radius-md);
          box-shadow: 0 10px 30px rgba(0,0,0,.35);
          overflow: hidden;
        }

        /* Content area inside page; fixed height to measure overflow, with padding */
        .a4-content{
          position: relative;
          height: calc(297mm - 18mm); /* reserve space for footer visually */
          padding: 14mm 14mm 22mm 14mm; /* bottom padding so text won't overlap footer */
          overflow: hidden; /* we control pagination in JS */
          color: var(--brand-ink);
        }

        /* Page footer with page number (bottom-right) */
        .a4-footer{
          position: absolute;
          bottom: 8mm;
          right: 12mm;
          font-size: .9rem;
          color: #374151;
        }

        /* Separator (hr) between pages */
        .page-sep{
          height: 2px;
          width: 210mm;
          border: 0;
          margin: 0;
          background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--brand-gold) 65%, transparent), transparent);
          opacity: .9;
        }

        /* Print styles: remove shadows/background, force page breaks */
        @media print{
          body { background: #fff !important; }
          .preview-shell { background: #fff !important; padding: 0; }
          .a4-wrapper{ gap: 0; }
          .a4-page{ box-shadow: none; page-break-after: always; border-radius: 0; width: 210mm; min-height: 297mm; }
          .page-sep{ display: none; }
          .a4-content{ height: auto; overflow: visible; }
        }
      `}</style>
      <style jsx global>{`
        /* Exporting overlay */
        .exporting-overlay{
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,.55);
          backdrop-filter: blur(4px) saturate(1.05);
          -webkit-backdrop-filter: blur(4px) saturate(1.05);
        }
        .exporting-box{
          display: flex; flex-direction: column; align-items: center; gap: .75rem;
          min-width: 220px; padding: 18px 22px;
          background: #fff; border: 1px solid var(--brand-border);
          border-radius: var(--radius-md); box-shadow: 0 10px 30px rgba(0,0,0,.15);
        }
        .exporting-text{ font-weight: 600; color: #1f2937; }
        .spinner{
          width: 28px; height: 28px; border-radius: 50%;
          border: 3px solid #e5e7eb; border-top-color: var(--brand-gold,#BD9425);
          animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default DictionaryPreviewPage;
