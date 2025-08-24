"use client";
//src/app/file-manager/upload-taxonomy/page.tsx
import { useState, useRef, ChangeEvent, DragEvent, useMemo, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** ----------------------------------------------------------------
 *  Types
 *  ---------------------------------------------------------------- */
interface UploadResult {
  message: string;
  filename: string;
  importedCount?: number;
  errors?: string[];
  warnings?: string[]; // NEW: optional warnings from API
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
}

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

/** ----------------------------------------------------------------
 *  Page Component
 *  ---------------------------------------------------------------- */
export default function UpdateDictionaryUploadPage() {
  const pathname = usePathname();

  // SpecializedDictionary dropdown states
  const [specOptions, setSpecOptions] = useState<SpecializedDictionary[]>([]);
  const [specializedDictionaryId, setSpecializedDictionaryId] = useState<string>(""); // selected id
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Constraints: .html/.htm/.doc/.docx */
  const allowedTypes = [
    "text/html",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  const allowedExt = [".html", ".htm", ".docx", ".doc"];
  const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB

  const tabs = useMemo(
    () => [
      { name: "นำเข้าพจนานุกรม", href: "/file-manager/upload-dictionary" },
      { name: "นำเข้าคำทับศัพท์", href: "/file-manager/upload-transliteration" },
      { name: "นำเข้าอนุกรมวิธาน", href: "/file-manager/upload-taxonomy/docx" },
    ],
    []
  );

  const isActive = (href: string) => pathname?.startsWith(href);

  /** ----------------------- File handlers ----------------------- */
  const validateFile = (file: File): boolean => {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowedTypes.includes(file.type) && !allowedExt.includes(ext)) {
      setError("ไฟล์ไม่รองรับ กรุณาอัปโหลดไฟล์ .html, .htm, .docx หรือ .doc เท่านั้น");
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
    const f = e.target.files?.[0];
    if (!f) return;
    if (validateFile(f)) setSelectedFile(f);
    else {
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const onDragLeave = () => setIsDragOver(false);
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    setError(null);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (validateFile(f)) setSelectedFile(f);
  };

  const removeFile = () => {
    setSelectedFile(null);
    setUploadResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setProgress(0);
  };

  /** ----------------------- Upload action ----------------------- */
  const uploadFile = async () => {
    if (!selectedFile) {
      setError("กรุณาเลือกไฟล์เพื่ออัปโหลดก่อน");
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
        // Build API URL with commit flag and optional metadata
        const apiUrl = new URL("/api/file-manager/upload-taxonomy/docx", window.location.origin);
        apiUrl.searchParams.set("commit", "1");
        // Pass title/domain/kingdom based on selected taxonomy (if any)
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
            const percent = Math.round((ev.loaded / ev.total) * 80); // 0-80% for upload
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
            reject(new Error(`อัปโหลดล้มเหลว: ${xhr.status} ${xhr.statusText}`));
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

  /** ----------------------- Download sample (client-gen) ----------------------- */
  const downloadSample = async () => {
    const sample = [
      "<!doctype html>",
      "<html lang='th'>",
      "<head><meta charset='utf-8' /><title>ตัวอย่างพจนานุกรม (HTML)</title></head>",
      "<body>",
      "  <article class='entry' data-term='ทะเล'>",
      "    <h2>ทะเล</h2>",
      "    <div class='definition'>น. มหาสมุทร, อ่าว, แม่น้ำที่กว้างมาก</div>",
      "  </article>",
      "  <article class='entry' data-term='กรรเชียง'>",
      "    <h2>กรรเชียง</h2>",
      "    <div class='definition'>น. ไม้พายสำหรับเรือเล็ก</div>",
      "  </article>",
      "</body>",
      "</html>",
    ].join("\n");

    const blob = new Blob([sample], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ตัวอย่าง-พจนานุกรม.html";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  };

  /** ----------------------- Render ----------------------- */
  return (
    <div className="page bg-texture">
      
      {/* Page header */}
      <div className="container">
         {/* Top Tabs (product-like segmented nav) */}
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
            <h1 className="page-title">นำเข้าอนุกรมวิธาน</h1>
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
            <button onClick={downloadSample} className="btn-secondary btn--sm">
              <IconDownload />
              ดาวน์โหลดไฟล์ตัวอย่าง
            </button>
          </div>
        </div>

       
      </div>

      {/* Main content */}
      <div className="container">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
          {/* LEFT: Upload card */}
          <section className="brand-card flex flex-col overflow-hidden">
            <header className="card-header">
              <h2 className="section-title">อัปโหลดไฟล์</h2>
              <p className="text-md text-ink-500 mt-1">ลากไฟล์มาวางหรือเลือกจากเครื่องของคุณ</p>
            </header>

            <div className="card-body">
              <div
                className={`upload-dropzone ${isDragOver ? "is-dragover" : ""}`}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="พื้นที่วางไฟล์เพื่ออัปโหลด"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".html,.htm,text/html,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={onFileChange}
                />

                <div className="flex flex-col items-center justify-center text-center">
                  <div className="brand-icon-circle mb-3">
                    <IconUpload className="text-gray-600" />
                  </div>
                  <p className="text-base font-medium text-gray-800 mb-1">
                    {isDragOver ? "ปล่อยไฟล์ที่นี่" : "ลากวางไฟล์ที่นี่ หรือคลิกเพื่อเลือก"}
                  </p>
                  <p className="text-gray-500 text-sm">รองรับ .docx / .doc (สูงสุด 200MB)</p>
                  <p className="text-gray-400 text-sm mt-2">
                    {selectedFile ? `เลือกแล้ว: ${selectedFile.name}` : "ยังไม่ได้เลือกไฟล์"}
                  </p>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="card-body pt-0">
                <div className="alert alert--danger" role="alert">
                  <strong className="block mb-1">เกิดข้อผิดพลาด</strong>
                  <div className="text-sm break-words">{error}</div>
                </div>
              </div>
            )}

            {/* Actions & progress */}
            <div className="mt-auto px-5 py-4 border-t border-border bg-white/60">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {selectedFile ? (
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl">📰</span>
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
                        <svg className="animate-spin -ml-1 h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4A4 4 0 004 12z" />
                        </svg>
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

                  {/* Warnings (pretty + scrollable) */}
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

            <div className="card-body">
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

            {/* Tips / Help */}
            <div className="card-body text-sm text-gray-600">
              <ul className="list-disc pl-5 space-y-1">
                <li>รองรับไฟล์ .docx / .doc เท่านั้น</li>
                <li>ขนาดไฟล์สูงสุด 200MB</li>
                <li>ตรวจสอบโครงสร้างแท็ก <code>&lt;article class='entry'&gt;</code> ให้ถูกต้องก่อนอัปโหลด</li>
              </ul>
            </div>
          </section>
        </div>
      </div>
      <style jsx global>{`
        /* Code snippet size (kept from previous) */
        .page code { 
          font-size: 0.7rem;
        }

        /* ---------- Normalize all button heights on this page ---------- */
        /* Applies to primary/secondary buttons, generic .btn, and tab links */
        .page .btn-primary,
        .page .btn-secondary,
        .page .btn,
        .page .nav-link.tab,
        .page .tab {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;              /* space between icon and text */
          height: 44px;             /* unified height */
          padding: 0 14px;          /* consistent horizontal padding */
          line-height: 1;           /* avoid vertical misalignment */
          vertical-align: middle;
        }

        /* Ensure small variant also respects the unified height */
        .page .btn--sm {
          height: 44px !important;
          padding: 0 12px !important;
        }

        /* Icons inside buttons/tabs: keep a consistent size and not shrink */
        .page .btn-primary svg,
        .page .btn-secondary svg,
        .page .btn svg,
        .page .nav-link.tab svg,
        .page .tab svg {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
        }

        /* Tabs container fine-tuning so tabs align nicely and don't look cramped */
        .page .brand-subnav.brand-subnav--tabs .tab,
        .page .brand-subnav.brand-subnav--tabs .nav-link.tab {
          margin: 0 4px;
          border-radius: 10px; /* match global rounded style if any */
        }
        /* Warning alert look (matches brand tone) */
        .page .alert--warning {
          background: #FFF7E6;         /* soft amber */
          border: 1px solid #F3C77A;   /* amber border */
          color: #7A4E00;              /* readable brown */
        }
        .page .alert--warning svg {
          color: #B26B00;
        }
      `}</style>
    </div>
  );
}
