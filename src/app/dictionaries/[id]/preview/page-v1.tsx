"use client";

import { useEffect, useState, useRef } from "react";
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

const DictionaryPreviewPage = ({ params }: { params: Promise<{ id: string }> }) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [dictId, setDictId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const previewContainerRef = useRef<HTMLDivElement>(null);

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

  // Inject the HTML content
  useEffect(() => {
    if (htmlContent && previewContainerRef.current) {
      previewContainerRef.current.innerHTML = htmlContent;
    }
  }, [htmlContent]);

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
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      };

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
    <div>
      <div style={{ display: "flex", gap: "8px", marginBottom: 16 }}>
        <button
          onClick={handleExportDocx}
          disabled={isLoading || !!error || !dictId || isExporting}
          style={{ padding: "8px 16px", borderRadius: 4, border: "none", background: "#28a745", color: "white", fontWeight: "bold" }}
        >
          {isExporting ? "Exporting..." : "Export DOCX"}
        </button>
        <button
          onClick={handleExportPdf}
          disabled={isLoading || !!error || !dictId || isExporting}
          style={{ padding: "8px 16px", borderRadius: 4, border: "none", background: "#dc3545", color: "white", fontWeight: "bold" }}
        >
          {isExporting ? "Exporting..." : "Export PDF"}
        </button>
      </div>
      {isLoading && (
        <div style={{ textAlign: "center", margin: "40px 0" }}>
          <p>Loading preview...</p>
        </div>
      )}
      {error && (
        <div style={{ textAlign: "center", margin: "40px 0" }}>
          <p style={{ color: "red" }}>Error: {error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>{" "}
          <button onClick={() => router.back()}>Go Back</button>
        </div>
      )}
      {!isLoading && !error && (
        <div ref={previewContainerRef} />
      )}
    </div>
  );
};

export default DictionaryPreviewPage;
