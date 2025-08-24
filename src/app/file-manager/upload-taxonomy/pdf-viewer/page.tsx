// src/app/file-manager/upload-taxonomy/pdf/page.tsx
"use client";

import { useState, useRef, ChangeEvent, DragEvent, useMemo, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

/** ----------------------------------------------------------------
 *  Types
 *  ---------------------------------------------------------------- */
interface UploadResult {
  message: string;
  filename: string;
  importedCount?: number;
  errors?: string[];
  warnings?: string[];
  savedTaxonomyId?: number;
  created?: Array<{ id: number; scientificName: string; entries?: number }>;
  stats?: {
    paragraphs: number;
    htmlLength: number;
    sections: number;
    domNodes: number;
    messages: number;
  };
  previewHtml?: string;
}

type HistoryRow = {
  id: string;
  filename: string;
  sizeMB: string;
  status: "SUCCESS" | "FAILED";
  message: string;
  importedCount?: number;
};

interface SpecializedDictionary {
  id: number;
  title: string;
  domain?: string | null;
  kingdom?: string | null;
  year_published?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

/** ----------------------------------------------------------------
 *  Small SVG icon helpers (no external deps)
 *  ---------------------------------------------------------------- */
const IconUpload = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...props}>
    <path d="M12 3l4 4h-3v6h-2V7H8l4-4zm-7 9h2v7h10v-7h2v9H5v-9z" />
  </svg>
);
const IconClose = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...props}>
    <path
      fillRule="evenodd"
      d="M6.225 4.811a1 1 0 0 1 1.414 0L12 9.172l4.361-4.361a1 1 0 0 1 1.415 1.414L13.415 10.586l4.361 4.361a1 1 0 1 1-1.415 1.414L12 12l-4.361 4.361a1 1 0 1 1-1.414-1.414l4.36-4.361-4.36-4.361a1 1 0 0 1 0-1.414z"
      clipRule="evenodd"
    />
  </svg>
);
const IconDownload = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...props}>
    <path
      fillRule="evenodd"
      d="M12 3a1 1 0 0 1 1 1v9.586l2.293-2.293a1 1 0 1 1 1.414 1.414l-4.007 4.007a1.5 1.5 0 0 1-2.121 0L4.572 12.707a1 1 0 0 1 1.414-1.414L8.28 13.586V4a1 1 0 0 1 1-1h2.72zM4 18a1 1 0 0 0 0 2h16a1 1 0 1 0 0-2H4z"
      clipRule="evenodd"
    />
  </svg>
);
const IconChevronLeft = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...props}>
    <path fillRule="evenodd" d="M15.707 4.293a1 1 0 0 1 0 1.414L9.414 12l6.293 6.293a1 1 0 0 1-1.414 1.414l-7-7a1 1 0 0 1 0-1.414l7-7a1 1 0 0 1 1.414 0z" clipRule="evenodd" />
  </svg>
);
const IconChevronRight = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...props}>
    <path fillRule="evenodd" d="M8.293 4.293a1 1 0 0 1 1.414 0l7 7a1 1 0 0 1 0 1.414l-7 7a1 1 0 0 1-1.414-1.414L14.586 12 8.293 5.707a1 1 0 0 1 0-1.414z" clipRule="evenodd" />
  </svg>
);
const IconSpinner = (props: React.SVGProps<SVGSVGElement>) => (
  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

/** ----------------------------------------------------------------
 *  Page Component
 *  ---------------------------------------------------------------- */
export default function UpdateDictionaryUploadPdfPage() {
  const router = useRouter();
  const pathname = usePathname();

  // SpecializedDictionary dropdown states
  const [specOptions, setSpecOptions] = useState<SpecializedDictionary[]>([]);
  const [specializedDictionaryId, setSpecializedDictionaryId] = useState<string>("");
  const [loadingSpecs, setLoadingSpecs] = useState<boolean>(false);
  const [specError, setSpecError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const loadSpecs = async () => {
      setLoadingSpecs(true);
      setSpecError(null);
      try {
        const r = await fetch("/api/admin/taxonomy?page=1&pageSize=1000");
        if (!r.ok) throw new Error(`โหลดรายการล้มเหลว (HTTP ${r.status})`);
        const j = await r.json();
        const list: SpecializedDictionary[] = Array.isArray(j?.items) ? j.items : (Array.isArray(j) ? j : []);
        if (!ignore) {
          setSpecOptions(list);
          if (list.length && !specializedDictionaryId) {
            setSpecializedDictionaryId(String(list[0].id));
          }
        }
      } catch (e: any) {
        if (!ignore) setSpecError(e?.message || "ไม่สามารถโหลดรายการอนุกรมวิธานได้");
      } finally {
        if (!ignore) setLoadingSpecs(false);
      }
    };
    loadSpecs();
    return () => { ignore = true; };
  }, []);

  /** UI states */
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number>(0);

  const [error, setError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  // --- NEW STATES FOR PDF PREVIEW AND EXTRACTION ---
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfInstance, setPdfInstance] = useState<any | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [extractedText, setExtractedText] = useState<string>('');
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const [extractedHtml, setExtractedHtml] = useState<string>(''); // NEW: State for extracted HTML

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- Constraints: .pdf only for this page ---
  const allowedTypes = ["application/pdf"];
  const allowedExt = [".pdf"];
  const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB

  const tabs = useMemo(
    () => [
      { name: "นำเข้าพจนานุกรม", href: "/file-manager/upload-dictionary" },
      { name: "นำเข้าคำทับศัพท์", href: "/file-manager/upload-transliteration" },
      { name: "นำเข้าอนุกรมวิธาน (DOCX)", href: "/file-manager/upload-taxonomy/docx" },
      { name: "นำเข้าอนุกรมวิธาน (PDF)", href: "/file-manager/upload-taxonomy/pdf" },
    ],
    []
  );

  const isActive = (href: string) => pathname?.startsWith(href);

  /** ----------------------- File handlers ----------------------- */
  const validateFile = (file: File): boolean => {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowedTypes.includes(file.type) && !allowedExt.includes(ext)) {
      setError("ไฟล์ไม่รองรับ กรุณาอัปโหลดไฟล์ .pdf เท่านั้น");
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(
        `ไฟล์ ${file.name} มีขนาดใหญ่เกินไป (สูงสุด ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)}MB)`
      );
      return false;
    }
    return true;
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setUploadResult(null);
    resetPdfStates();

    const f = e.target.files?.[0];
    if (!f) return;
    if (validateFile(f)) {
      setSelectedFile(f);
      if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
        const url = URL.createObjectURL(f);
        setPdfUrl(url);
        setIsPreviewing(true);
        loadPdfDocument(url);
      }
    } else {
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    setError(null);
    resetPdfStates();

    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (validateFile(f)) {
      setSelectedFile(f);
       if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
        const url = URL.createObjectURL(f);
        setPdfUrl(url);
        setIsPreviewing(true);
        loadPdfDocument(url);
      }
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    setUploadResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setProgress(0);
    resetPdfStates();
  };

  const resetPdfStates = () => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }
    setPdfInstance(null);
    setNumPages(null);
    setCurrentPage(1);
    setExtractedText('');
    setIsExtracting(false);
    setExtractionError(null);
    setIsPreviewing(false);
    setPdfLoadError(null);
    setExtractedHtml(''); // Reset extracted HTML
    const canvas = canvasRef.current;
    if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
  };

  // --- NEW: Function to dynamically load pdf.js from CDN ---
  const loadPdfJsFromCdn = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') {
        reject(new Error('This function should only be called in the browser.'));
        return;
      }

      const PDF_JS_VERSION = '5.4.54';
      const PDF_JS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDF_JS_VERSION}/pdf.min.mjs`;
      const WORKER_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDF_JS_VERSION}/pdf.worker.min.mjs`;

      const loadScript = async () => {
        try {
          const pdfjsLib = await import(/* webpackIgnore: true */ PDF_JS_CDN);
          console.log('[PDF Viewer] pdf.js loaded from CDN via dynamic import.');
          if (pdfjsLib && typeof pdfjsLib === 'object' && pdfjsLib.GlobalWorkerOptions) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_CDN;
            console.log('[PDF Viewer] Worker source set to CDN worker.');
            resolve(pdfjsLib);
          } else {
            console.warn('[PDF Viewer] pdfjsLib.GlobalWorkerOptions not found on imported module, checking window...');
            const globalPdfjsLib = (window as any)['pdfjsLib'] || (window as any)['pdfjs'];
            if (globalPdfjsLib && globalPdfjsLib.GlobalWorkerOptions) {
              globalPdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_CDN;
              console.log('[PDF Viewer] Worker source set to CDN worker (found on window).');
              resolve(globalPdfjsLib);
            } else {
              console.error('[PDF Viewer] Could not find pdfjsLib or GlobalWorkerOptions after dynamic import.');
              reject(new Error('Failed to initialize pdf.js from CDN: GlobalWorkerOptions not found.'));
            }
          }
        } catch (importErr) {
          console.error('[PDF Viewer] Error importing pdf.js from CDN:', importErr);
          reject(new Error(`Failed to load pdf.js from CDN: ${importErr instanceof Error ? importErr.message : 'Unknown error'}`));
        }
      };

      loadScript();
    });
  };

  // --- MODIFIED loadPdfDocument function to use CDN ---
  const loadPdfDocument = async (url: string) => {
    let pdfjsLib: any | null = null;
    try {
      pdfjsLib = await loadPdfJsFromCdn();
      console.log('[PDF Viewer] Using pdf.js version from CDN.');

      const loadingTask = pdfjsLib.getDocument(url);
      const pdf = await loadingTask.promise;
      setPdfInstance(pdf);
      setNumPages(pdf.numPages);
      console.log(`[PDF Viewer] Loaded PDF with ${pdf.numPages} pages.`);
      setIsPreviewing(false);
      setPdfLoadError(null);

      // --- NEW: Automatically extract text and HTML after loading ---
      await extractPdfTextAndHtml(pdf);
    } catch (err) {
      console.error("[PDF Viewer] Error loading PDF:", err);
      const errorMsg = `ไม่สามารถโหลด PDF สำหรับดูตัวอย่างได้: ${err instanceof Error ? err.message : 'Unknown error'}`;
      setError(errorMsg);
      setPdfLoadError(errorMsg);
      setPdfInstance(null);
      setNumPages(null);
      setIsPreviewing(false);
    }
  };

  // --- NEW: Function to extract text and HTML from the entire PDF ---
  // --- NEW: Function to extract text and HTML from the entire PDF ---
const extractPdfTextAndHtml = async (pdfInstanceToUse?: any) => {
  const pdfToUse = pdfInstanceToUse || pdfInstance;
  if (!pdfToUse) {
    setExtractionError("PDF ไม่ได้ถูกโหลด");
    return;
  }

  setIsExtracting(true);
  setExtractionError(null);
  setExtractedText('');
  setExtractedHtml('');

  // ฟังก์ชันทำความสะอาดข้อความ
  const cleanTextContent = (text: string): string => {
    // ลบสระหรือวรรณยุกต์ที่พิมพ์ซ้ำ
    let cleaned = text
      .replace(/([่-๋])\1+/g, '$1')  // วรรณยุกต์ซ้ำ
      .replace(/([ั-ู])\1+/g, '$1')  // สระซ้ำ
      .replace(/([็์])\1+/g, '$1')   // ไม้ไต่คู้/ไม้หันอากาศซ้ำ

    // ลบข้อความที่ไม่เกี่ยวข้อง
    cleaned = cleaned.replace(/_.*?indd.*?\d+\/\d+\/\d+.*?BE.*?\d+:\d+.*/g, '');

    // ลบอักขระแปลกและยุบช่องว่าง
    cleaned = cleaned
      .replace(/[^\x20-\x7E\u0E00-\u0E7F\n\r\t]/g, '') // ลบอักขระแปลก
      .replace(/\s+/g, ' ') // ยุบช่องว่าง
      .trim();

    return cleaned;
  };

  try {
    let fullText = '';
    let fullHtml = '';
    const numPgs = pdfToUse.numPages;

    // รวบรวมข้อความทั้งหมดจากทุกหน้า และทำความสะอาดทันที
    let allCleanedItems: any[] = [];
    for (let i = 1; i <= numPgs; i++) {
      const page = await pdfToUse.getPage(i);
      const content = await page.getTextContent();

      for (const item of content.items) {
        if (item && typeof item.str === 'string') {
          const cleanedText = cleanTextContent(item.str);
          // เก็บเฉพาะข้อความที่มีเนื้อหาหลังทำความสะอาด
          if (cleanedText.trim()) {
            allCleanedItems.push({
              ...item,
              originalText: item.str,
              cleanedText: cleanedText,
              pageNumber: i
            });
          }
        }
      }
    }

    // แบ่งรายการ (entries) ตามคำว่า "ผู้เขียน" ในข้อความที่ทำความสะอาดแล้ว
    const entries: any[][] = [[]]; // เริ่มต้นด้วยรายการว่าง
    let currentEntryIndex = 0;

    for (const item of allCleanedItems) {
      if (item.cleanedText.includes('ผู้เขียน')) {
        // ถ้าเจอคำว่า "ผู้เขียน" ให้เริ่มรายการใหม่
        // แต่ต้องแน่ใจว่ารายการปัจจุบันไม่ว่าง และรายการใหม่ยังไม่ถูกสร้าง
        if (entries[currentEntryIndex].length > 0) {
          entries.push([]); // สร้างรายการใหม่
          currentEntryIndex++;
        }
        entries[currentEntryIndex].push(item);
      } else {
        // เพิ่มรายการลงในรายการปัจจุบัน
        entries[currentEntryIndex].push(item);
      }
    }

    // ลบรายการว่างแรกหากมันยังว่างอยู่ (กรณีรายการแรกเริ่มด้วย "ผู้เขียน")
    // หรือหากไม่มีรายการอื่น
    if (entries.length > 0 && entries[0].length === 0 && entries.length > 1) {
        entries.shift();
    }

    // สร้าง HTML และ Text สำหรับแต่ละรายการ
    let entryHtml = '';
    let entryText = '';

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.length === 0) continue; // ข้ามรายการว่าง

      entryHtml += `<div class="pdf-entry"><h3>Entry ${i + 1}</h3>\n`;
      entryText += `Entry ${i + 1}\n`;

      // จัดกลุ่มข้อความตามบรรทัดภายในแต่ละรายการ
      const lines: any[] = [];
      let currentLine: any[] = [];
      let lastY = null;
      const Y_TOLERANCE = 5;

      for (const item of entry) {
        const y = item.transform ? item.transform[5] : 0;

        if (lastY === null || Math.abs(lastY - y) > Y_TOLERANCE) {
          if (currentLine.length > 0) {
            lines.push(currentLine);
          }
          currentLine = [item];
          lastY = y;
        } else {
          currentLine.push(item);
        }
      }

      if (currentLine.length > 0) {
        lines.push(currentLine);
      }

      // ประมวลผลแต่ละบรรทัด
      for (const line of lines) {
        let lineHtml = '<div class="pdf-line">';
        let lineText = '';

        for (const item of line) {
          const text = item.cleanedText || '';
          lineText += text;

          // ตรวจสอบฟอนต์สำหรับการจัดรูปแบบ
          let tag = 'span';
          const fontName = item.fontName || '';

          if (/bold|black/i.test(fontName)) {
            tag = 'strong';
          } else if (/italic|oblique/i.test(fontName)) {
            tag = 'em';
          }

          if (text.trim()) {
            lineHtml += `<${tag}>${text}</${tag}>`;
          }
        }

        lineHtml += '</div>';
        entryHtml += lineHtml + '\n';
        entryText += lineText + '\n';
      }

      entryHtml += '</div>\n\n';
      entryText += '\n\n';
    }

    fullText = entryText;
    fullHtml = entryHtml;

    setExtractedText(fullText);
    setExtractedHtml(fullHtml);
    console.log("[PDF Viewer] Finished extracting text and styled HTML by entries.");
  } catch (err) {
    console.error("[PDF Viewer] Error extracting text/HTML:", err);
    setExtractionError(`เกิดข้อผิดพลาดขณะดึงข้อความ/HTML: ${err instanceof Error ? err.message : 'Unknown error'}`);
  } finally {
    setIsExtracting(false);
  }
};

  // --- Effect to render PDF page when currentPage or pdfInstance changes ---
  useEffect(() => {
    const renderPage = async () => {
      if (!pdfInstance || !canvasRef.current) return;

      try {
        const page = await pdfInstance.getPage(currentPage);
        const viewport = page.getViewport({ scale: 1.5 });

        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Could not get canvas context');
        }

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };
        await page.render(renderContext).promise;
        console.log(`[PDF Viewer] Rendered page ${currentPage}`);
      } catch (err) {
        console.error(`[PDF Viewer] Error rendering page ${currentPage}:`, err);
        setError(`เกิดข้อผิดพลาดขณะแสดงหน้า PDF: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    };

    if (pdfInstance) {
      renderPage();
    }
  }, [pdfInstance, currentPage]);

  // --- NEW: Function to go to the next page ---
  const goToNextPage = () => {
    if (pdfInstance && currentPage < pdfInstance.numPages) {
      setCurrentPage(prev => prev + 1);
    }
  };

  // --- NEW: Function to go to the previous page ---
  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  /** ----------------------- Upload action ----------------------- */
  const uploadFile = async () => {
    if (!selectedFile) {
      setError("กรุณาเลือกไฟล์ PDF เพื่ออัปโหลดก่อน");
      return;
    }
    if (!specializedDictionaryId) {
      setError("กรุณาเลือกอนุกรมวิธานก่อนอัปโหลด");
      return;
    }
    setUploading(true);
    setError(null);
    setUploadResult(null);
    setProgress(8);

    try {
      await new Promise<UploadResult>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const apiUrl = new URL("/api/file-manager/upload-taxonomy", window.location.origin);
        apiUrl.searchParams.set("commit", "1");
        const sel = specOptions.find(o => String(o.id) === specializedDictionaryId);
        if (sel) {
          apiUrl.searchParams.set("title", sel.title);
          if (sel.domain) apiUrl.searchParams.set("domain", String(sel.domain));
          if (sel.kingdom) apiUrl.searchParams.set("kingdom", String(sel.kingdom));
        }
        xhr.open("POST", apiUrl.toString());
        xhr.responseType = "json";

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            const percent = Math.round((ev.loaded / ev.total) * 80);
            setProgress(Math.max(8, Math.min(80, percent)));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const json = xhr.response as UploadResult | null;
            if (!json) {
              resolve({ message: "อัปโหลดสำเร็จ", filename: selectedFile.name });
            } else {
              resolve(json);
            }
          } else {
            const resp = xhr.response as any;
            const serverMsg = resp && typeof resp === 'object' ? (resp.error || resp.message) : null;
            const hint = resp && typeof resp === 'object' && resp.hint ? `\nคำแนะนำ: ${resp.hint}` : '';
            reject(new Error(serverMsg ? `${serverMsg}${hint}` : `อัปโหลดล้มเหลว: ${xhr.status} ${xhr.statusText}`));
          }
        };
        xhr.onerror = () => reject(new Error("เกิดข้อผิดพลาดระหว่างอัปโหลดไฟล์"));
        xhr.onabort = () => reject(new Error("อัปโหลดถูกยกเลิก"));

        const fd = new FormData();
        fd.append("file", selectedFile);
        fd.append("taxonomyId", specializedDictionaryId);
        xhr.send(fd);
      }).then((res) => {
        setProgress(100);
        setUploadResult(res);
        setHistory((prev) => [
          {
            id: crypto.randomUUID(),
            filename: selectedFile.name,
            sizeMB: (selectedFile.size / (1024 * 1024)).toFixed(2),
            status: "SUCCESS",
            message: res.message,
            importedCount: res.importedCount,
          },
          ...prev,
        ]);
        resetPdfStates();
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "อัปโหลดล้มเหลว โปรดลองใหม่";
      setError(msg);
      setHistory((prev) => [
        {
          id: crypto.randomUUID(),
          filename: selectedFile?.name || "-",
          sizeMB: selectedFile ? (selectedFile.size / (1024 * 1024)).toFixed(2) : "-",
          status: "FAILED",
          message: msg,
        },
        ...prev,
      ]);
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(0), 800);
    }
  };

  /** ----------------------- Render ----------------------- */
  return (
    <div className="page bg-texture flex flex-col min-h-screen"> {/* Ensure full height */}

      {/* Page header */}
      <div className="container">
        <nav
          className="brand-subnav brand-subnav--tabs flex flex-wrap items-center justify-center gap-2 md:gap-3 mb-6"
          aria-label="นำเข้าคำศัพท์"
          role="tablist"
        >
          {tabs.map((t) => {
            const active = isActive(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                role="tab"
                aria-selected={active}
                className={`nav-link tab ${active ? "nav-link--active tab--active" : ""}`}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <path d="M4 4h10l6 6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm10 1.5V10h4.5" />
                </svg>
                <span>{t.name}</span>
              </Link>
            );
          })}
        </nav>
        {specError && (
          <div className="alert alert--danger mb-3" role="alert">
            <strong>เกิดข้อผิดพลาด:</strong> {specError}
          </div>
        )}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="page-title">นำเข้าอนุกรมวิธาน (PDF)</h1>
            <div className="mt-2 flex items-center gap-2">
              <label htmlFor="specSelect" className="sr-only">เลือกชุดอนุกรมวิธาน</label>
              <select
                id="specSelect"
                className="select"
                value={specializedDictionaryId}
                onChange={(e) => setSpecializedDictionaryId(e.target.value)}
                disabled={loadingSpecs || !specOptions.length}
                aria-label="เลือกชุดอนุกรมวิธาน"
              >
                {loadingSpecs && <option value="">กำลังโหลด...</option>}
                {!loadingSpecs && specOptions.length === 0 && <option value="">ไม่มีรายการ</option>}
                {specOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Optional: Add a download sample button if needed */}
          </div>
        </div>
      </div>

      {/* Main content - Flex column to push footer down */}
      <div className="flex-grow flex flex-col">
        <div className="container flex-grow">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
            {/* LEFT: Upload card */}
            <section className="brand-card flex flex-col overflow-hidden">
              <header className="card-header">
                <h2 className="section-title">อัปโหลดไฟล์ PDF</h2>
                <p className="text-md text-ink-500 mt-1">ลากไฟล์ PDF มาวางหรือเลือกจากเครื่องของคุณ</p>
              </header>

              <div className="card-body flex-grow">
                <div
                  className={`upload-dropzone ${isDragOver ? "is-dragover" : ""} flex-grow`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={onDrop}
                  role="button"
                  tabIndex={0}
                  aria-label="พื้นที่วางไฟล์ PDF เพื่ออัปโหลด"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={onFileChange}
                  />

                  <div className="flex flex-col items-center justify-center text-center h-full">
                    {pdfUrl && pdfInstance ? (
                      <div className="w-full h-full flex flex-col">
                        <h3 className="text-lg font-semibold mb-2">ดูตัวอย่าง PDF</h3>
                        <div className="border border-gray-300 rounded mb-2 overflow-auto max-h-[500px] flex justify-center items-center bg-gray-50 flex-grow">
                          {isPreviewing ? (
                            <div className="py-10 text-gray-500 flex flex-col items-center">
                              <IconSpinner className="animate-spin h-5 w-5 text-blue-500 mb-2" />
                              กำลังโหลด PDF...
                            </div>
                          ) : (
                            <canvas ref={canvasRef} className="block mx-auto shadow-sm" />
                          )}
                        </div>
                        <div className="flex justify-between items-center mb-2">
                          <button onClick={goToPrevPage} disabled={currentPage <= 1 || isPreviewing} className="btn-secondary btn--sm flex items-center">
                            <IconChevronLeft className="mr-1" /> ก่อนหน้า
                          </button>
                          <span>หน้า {currentPage} จาก {numPages}</span>
                          <button onClick={goToNextPage} disabled={currentPage >= (numPages || 1) || isPreviewing} className="btn-secondary btn--sm flex items-center">
                            ถัดไป <IconChevronRight className="ml-1" />
                          </button>
                        </div>
                        <div className="flex justify-center mb-2">
                          <button onClick={() => extractPdfTextAndHtml()} disabled={isExtracting || isPreviewing} className="btn-primary btn--sm flex items-center">
                            {isExtracting ? (
                              <>
                                <IconSpinner /> กำลังดึงข้อมูล...
                              </>
                            ) : (
                              'ดึงข้อมูลจาก PDF'
                            )}
                          </button>
                        </div>
                        {extractionError && (
                          <div className="alert alert--danger mb-2">
                            <strong>ข้อผิดพลาด:</strong> {extractionError}
                          </div>
                        )}
                        {extractedText && (
                          <div className="mt-2">
                            <h4 className="text-md font-medium mb-1">ข้อความที่ดึงได้:</h4>
                            <textarea
                              readOnly
                              value={extractedText}
                              className="w-full h-40 p-2 text-xs border border-gray-300 rounded overflow-auto font-mono"
                              aria-label="ข้อความที่ดึงได้จาก PDF"
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-center h-full">
                        <div className="brand-icon-circle mb-3">
                          <IconUpload className="text-gray-600" />
                        </div>
                        <p className="text-base font-medium text-gray-800 mb-1">
                          {isDragOver ? "ปล่อยไฟล์ที่นี่" : "ลากวางไฟล์ PDF ที่นี่ หรือคลิกเพื่อเลือก"}
                        </p>
                        <p className="text-gray-500 text-sm">รองรับ .pdf เท่านั้น (สูงสุด 200MB)</p>
                        <p className="text-gray-400 text-sm mt-2">
                          {selectedFile ? `เลือกแล้ว: ${selectedFile.name}` : "ยังไม่ได้เลือกไฟล์"}
                        </p>
                        {pdfLoadError && (
                          <div className="alert alert--danger mt-2 text-left max-w-md">
                            <strong>ข้อผิดพลาด PDF:</strong> {pdfLoadError}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {error && !pdfLoadError && (
                <div className="card-body pt-0">
                  <div className="alert alert--danger" role="alert">
                    <strong className="block mb-1">เกิดข้อผิดพลาด</strong>
                    <div className="text-sm break-words">{error}</div>
                  </div>
                </div>
              )}

              <div className="mt-auto px-5 py-4 border-t border-border bg-white/60">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {selectedFile ? (
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xl">📄</span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate max-w-[260px]" title={selectedFile.name}>
                          {selectedFile.name}
                        </div>
                        <div className="text-xs text-gray-500">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-600">ไม่ได้เลือกไฟล์</div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={removeFile}
                      disabled={uploading || !selectedFile}
                      className="btn-secondary btn--sm"
                    >
                      <IconClose />
                      ล้างไฟล์
                    </button>

                    <button
                      type="button"
                      onClick={uploadFile}
                      disabled={uploading || !selectedFile || !specializedDictionaryId}
                      className={`btn-primary ${uploading ? "is-loading" : ""}`}
                      aria-live="polite"
                    >
                      {uploading ? (
                        <>
                          <IconSpinner />
                          กำลังอัปโหลด...
                        </>
                      ) : (
                        <>
                          <IconUpload />
                          อัปโหลด
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {(uploading || progress > 0) && (
                  <div className="mt-4" aria-live="polite">
                    <div className="progress">
                      <div className="progress__bar" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="text-right text-xs text-ink-500 mt-1">{progress}%</div>
                  </div>
                )}

                {uploadResult && (
                  <div className="mt-4">
                    <div className="alert alert--success">
                      <strong className="block mb-1">อัปโหลดสำเร็จ</strong>
                      <div className="text-sm">
                        ไฟล์: <span className="font-semibold">{uploadResult.filename}</span>
                      </div>
                      <div className="text-sm">ข้อความ: {uploadResult.message}</div>
                      {typeof uploadResult.importedCount === "number" && (
                        <div className="text-sm">จำนวนที่นำเข้า: {uploadResult.importedCount.toLocaleString()}</div>
                      )}
                      {uploadResult.errors?.length ? (
                        <ul className="list-disc pl-5 text-sm mt-1">
                          {uploadResult.errors.map((er, i) => (
                            <li key={i}>{er}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>

                    {uploadResult.warnings?.length ? (
                      <div className="mt-3">
                        <div className="alert alert--warning" role="status" aria-live="polite">
                          <div className="flex items-start gap-2">
                            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                              <path fill="currentColor" d="M1 21h22L12 2 1 21zm12-3h-2v2h2v-2zm0-6h-2v5h2v-5z"/>
                            </svg>
                            <div className="min-w-0">
                              <strong className="block mb-1">
                                คำเตือน {uploadResult.warnings.length.toLocaleString()} รายการ
                              </strong>
                              <ul className="list-disc pl-5 text-sm mt-1 space-y-1 max-h-48 overflow-auto">
                                {uploadResult.warnings.map((w, i) => (
                                  <li key={i} className="break-words">{w}</li>
                                ))}
                              </ul>
                              <div className="text-xs text-ink-500 mt-2">
                                ระบบนำเข้าข้อมูลที่เหลือเรียบร้อยแล้ว โปรดตรวจสอบรายการที่แจ้งเตือน
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </section>

            {/* RIGHT: Results / History */}
            <section className="brand-card overflow-hidden flex flex-col">
              <header className="card-header">
                <h2 className="section-title">ผลการประมวลผล</h2>
                <p className="text-md text-ink-500 mt-1">สรุปผลการอัปโหลดล่าสุดและรายการที่นำเข้าสำเร็จ</p>
              </header>

              <div className="card-body flex-grow">
                {history.length === 0 ? (
                  <div className="text-sm text-gray-500 text-center py-10">
                    ยังไม่มีประวัติการอัปโหลด
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="brand-table">
                      <thead className="brand-table__head">
                        <tr>
                          <th scope="col" className="px-3 py-2 text-left text-xs font-semibold text-gray-600">ไฟล์</th>
                          <th scope="col" className="px-3 py-2 text-left text-xs font-semibold text-gray-600">ขนาด (MB)</th>
                          <th scope="col" className="px-3 py-2 text-left text-xs font-semibold text-gray-600">สถานะ</th>
                          <th scope="col" className="px-3 py-2 text-left text-xs font-semibold text-gray-600">ข้อความ</th>
                          <th scope="col" className="px-3 py-2 text-left text-xs font-semibold text-gray-600">นำเข้าสำเร็จ</th>
                        </tr>
                      </thead>
                      <tbody className="brand-table__body">
                        {history.map((h) => (
                          <tr key={h.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-sm text-gray-900">{h.filename}</td>
                            <td className="px-3 py-2 text-sm text-gray-600">{h.sizeMB}</td>
                            <td className="px-3 py-2 text-sm">
                              <span className={`badge ${h.status === "SUCCESS" ? "badge--success" : "badge--danger"}`}>
                                {h.status === "SUCCESS" ? "สำเร็จ" : "ล้มเหลว"}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-600">{h.message}</td>
                            <td className="px-3 py-2 text-sm text-gray-600">{h.importedCount ?? "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="card-body text-sm text-gray-600">
                <ul className="list-disc pl-5 space-y-1">
                  <li>รองรับไฟล์ .pdf เท่านั้น</li>
                  <li>ขนาดไฟล์สูงสุด 200MB</li>
                  <li>คุณสามารถดูตัวอย่าง PDF และดึงข้อความก่อนอัปโหลดได้</li>
                </ul>
              </div>
            </section>
          </div>
        </div>

        {/* NEW SECTION: HTML Preview at the bottom */}
        {/* Conditionally render the section only if extractedHtml exists */}
        {extractedHtml && (
          <div className="container mt-8 mb-4 flex-shrink-0"> {/* Added flex-shrink-0 */}
            <section className="brand-card overflow-hidden">
              <header className="card-header">
                <h2 className="section-title">ดูตัวอย่าง HTML จาก PDF</h2>
                <p className="text-md text-ink-500 mt-1">แสดงผล HTML ที่ดึงข้อมูลได้จากไฟล์ PDF</p>
              </header>
              <div className="card-body">
                <div className="border border-gray-300 rounded p-4 bg-gray-50 max-h-96 overflow-auto">
                  <div dangerouslySetInnerHTML={{ __html: extractedHtml }} />
                </div>
              </div>
            </section>
          </div>
        )}
      </div>

      <style jsx global>{`
        .page code { 
          font-size: 0.7rem;
        }

        .page .btn-primary,
        .page .btn-secondary,
        .page .btn,
        .page .nav-link.tab,
        .page .tab {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          height: 44px;
          padding: 0 14px;
          line-height: 1;
          vertical-align: middle;
        }

        .page .btn--sm {
          height: 44px !important;
          padding: 0 12px !important;
        }

        .page .btn-primary svg,
        .page .btn-secondary svg,
        .page .btn svg,
        .page .nav-link.tab svg,
        .page .tab svg {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
        }

        .page .brand-subnav.brand-subnav--tabs .tab,
        .page .brand-subnav.brand-subnav--tabs .nav-link.tab {
          margin: 0 4px;
          border-radius: 10px;
        }
        .page .alert--warning {
          background: #FFF7E6;
          border: 1px solid #F3C77A;
          color: #7A4E00;
        }
        .page .alert--warning svg {
          color: #B26B00;
        }
        /* Ensure the main content area takes available space */
        .page .container.flex-grow {
          flex: 1 0 auto; /* Grow to fill space, but don't shrink below its content size */
        }
        /* Style the PDF page dividers */
        .pdf-page {
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid #ddd;
        }
        .pdf-page:last-child {
          margin-bottom: 0;
          padding-bottom: 0;
          border-bottom: none;
        }
        .pdf-page h3 {
          font-size: 1rem;
          font-weight: bold;
          margin-bottom: 0.5rem;
        }
        .pdf-page p {
          font-size: 0.875rem; /* text-sm equivalent */
          line-height: 1.25; /* Adjust line height as needed */
        }
      `}</style>
    </div>
  );
}