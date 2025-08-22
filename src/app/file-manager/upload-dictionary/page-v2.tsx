"use client";

import { useState, useRef, ChangeEvent, DragEvent, useMemo } from "react";
import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";

/** ----------------------------------------------------------------
 *  Types
 *  ---------------------------------------------------------------- */
interface UploadResult {
  message: string;
  filename: string;
  // (optional) API of your uploader can return more fields (e.g., importedCount)
  importedCount?: number;
  errors?: string[];
}

type HistoryRow = {
  id: string;
  filename: string;
  sizeMB: string;
  status: "SUCCESS" | "FAILED";
  message: string;
  importedCount?: number;
}

/** ----------------------------------------------------------------
 *  Page Component
 *  ---------------------------------------------------------------- */
export default function UpdateDictionaryUploadPage() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // dictionary id can be passed via query (?specializedDictionaryId=0)
  const dictIdParam = searchParams.get("specializedDictionaryId");
  const specializedDictionaryId = dictIdParam ? dictIdParam : "0";

  /** UI states */
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number>(0);

  const [error, setError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Constraints: Only .html */
  const allowedTypes = ["text/html"];
  const allowedExt = [".html", ".htm"];
  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

  const tabs = useMemo(
    () => ([
      { name: "นำเข้า พจนานุกรม", href: "/file-manager/upload-dictionary" },
      { name: "อัปเดตพจนานุกรม (HTML)", href: "/file-manager/update-dictionary" }, // current page
      { name: "นำเข้าคำทับศัพท์", href: "/file-manager/upload-transliteration" },
      { name: "นำเข้า อนุกรมวิธาน", href: "/file-manager/upload-taxonomy" },
    ]),
    []
  );

  const isActive = (href: string) => pathname?.startsWith(href);

  /** ----------------------- File handlers ----------------------- */
  const validateFile = (file: File): boolean => {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowedTypes.includes(file.type) && !allowedExt.includes(ext)) {
      setError("ไฟล์ไม่รองรับ กรุณาอัปโหลดไฟล์ .html หรือ .htm เท่านั้น");
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(`ไฟล์ ${file.name} มีขนาดใหญ่เกินไป (สูงสุด ${(MAX_FILE_SIZE/(1024*1024)).toFixed(0)}MB)`);
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
    setUploading(true);
    setError(null);
    setUploadResult(null);
    setProgress(8);

    try {
      // Use XHR to track % progress (fetch() cannot track upload progress natively)
      await new Promise<UploadResult>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/file-manager/upload-dictionary"); // ใช้ API ตัวเดียวกับหน้า upload เดิม
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
        fd.append("specializedDictionaryId", specializedDictionaryId); // ค่าดีฟอลต์ 0
        xhr.send(fd);
      }).then((res) => {
        // finalize % to 100
        setProgress(100);
        setUploadResult(res);
        // append to history
        setHistory((prev) => [
          {
            id: crypto.randomUUID(),
            filename: selectedFile.name,
            sizeMB: (selectedFile.size / (1024*1024)).toFixed(2),
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
          sizeMB: selectedFile ? (selectedFile.size / (1024*1024)).toFixed(2) : "-",
          status: "FAILED",
          message: msg,
        },
        ...prev,
      ]);
    } finally {
      setUploading(false);
      // keep file preview to allow re-try; do not auto-clear
      setTimeout(() => setProgress(0), 800);
    }
  };

  /** ----------------------- Download sample (client-gen) ----------------------- */
  const downloadSample = async () => {
    // ตัวอย่างไฟล์ HTML สำหรับพจนานุกรมฉบับราชบัณฑิตยสภา (minimal template)
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
    <div className="min-h-[calc(100vh-120px)] bg-gray-50 py-6">
      {/* Top Tabs */}
      <div className="max-w-6xl mx-auto px-4">
        <nav className="flex flex-wrap gap-2 mb-4" aria-label="นำเข้าไฟล์">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-semibold transition ${
                isActive(t.href)
                  ? "bg-brand-700 text-white border-brand-700 shadow-sm"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {/* Icon (simple inline svg) */}
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                <path d="M4 4h10l6 6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm10 1.5V10h4.5" />
              </svg>
              <span>{t.name}</span>
            </Link>
          ))}
        </nav>
      </div>

      {/* Two columns: Left (upload) | Right (result/history) */}
      <div className="max-w-6xl mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* LEFT: Upload box */}
          <section className="bg-white rounded-lg shadow-md overflow-hidden">
            <header className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold text-gray-900">อัปเดตพจนานุกรม (HTML)</h1>
                <p className="text-sm text-gray-500 mt-1">
                  เลือกไฟล์ .html / .htm เพื่ออัปเดตข้อมูลสำหรับพจนานุกรม (ID: {specializedDictionaryId})
                </p>
              </div>
              <button
                onClick={downloadSample}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-brand-700 text-brand-700 hover:bg-brand-50 text-sm font-semibold"
              >
                {/* download icon */}
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M12 3a1 1 0 0 1 1 1v9.586l2.293-2.293a1 1 0 1 1 1.414 1.414l-4.007 4.007a1.5 1.5 0 0 1-2.121 0L4.572 12.707a1 1 0 0 1 1.414-1.414L8.28 13.586V4a1 1 0 0 1 1-1h2.72zM4 18a1 1 0 0 0 0 2h16a1 1 0 1 0 0-2H4z" clipRule="evenodd"/>
                </svg>
                ดาวน์โหลดไฟล์ตัวอย่าง
              </button>
            </header>

            <div
              className={`p-8 text-center cursor-pointer transition-colors ${
                isDragOver
                  ? "bg-blue-50 border-2 border-dashed border-blue-500"
                  : "bg-gray-50 border-2 border-dashed border-gray-300 hover:border-gray-400"
              }`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm,text/html"
                className="hidden"
                onChange={onFileChange}
              />
              <div className="flex flex-col items-center justify-center">
                <div className="bg-gray-200 rounded-full p-3 mb-4">
                  {/* upload icon */}
                  <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" className="text-gray-600">
                    <path d="M12 3l4 4h-3v6h-2V7H8l4-4zm-7 9h2v7h10v-7h2v9H5v-9z" />
                  </svg>
                </div>
                <p className="text-base font-medium text-gray-700 mb-1">
                  {isDragOver ? "ปล่อยไฟล์ที่นี่" : "ลาก &amp; วางไฟล์ที่นี่ หรือคลิกเพื่อเลือก"}
                </p>
                <p className="text-gray-500 text-sm">รองรับ .html / .htm (สูงสุด 20MB)</p>
                <p className="text-gray-400 text-sm mt-2">
                  {selectedFile ? `เลือกแล้ว: ${selectedFile.name}` : "ยังไม่ได้เลือกไฟล์"}
                </p>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="px-5 pb-4">
                <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-md border border-red-200">
                  <strong className="block mb-1">เกิดข้อผิดพลาด</strong>
                  <div className="text-sm break-words">{error}</div>
                </div>
              </div>
            )}

            {/* Selected file actions */}
            {selectedFile && (
              <div className="px-5 pb-5">
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📰</span>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{selectedFile.name}</div>
                      <div className="text-xs text-gray-500">{(selectedFile.size/(1024*1024)).toFixed(2)} MB</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={removeFile}
                      disabled={uploading}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 bg-white text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-50"
                    >
                      {/* X icon */}
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M6.225 4.811a1 1 0 0 1 1.414 0L12 9.172l4.361-4.361a1 1 0 0 1 1.415 1.414L13.415 10.586l4.361 4.361a1 1 0 0 1-1.415 1.414L12 12l-4.361 4.361a1 1 0 1 1-1.414-1.414l4.36-4.361-4.36-4.361a1 1 0 0 1 0-1.414z" clipRule="evenodd"/>
                      </svg>
                      ลบไฟล์
                    </button>

                    <button
                      type="button"
                      onClick={uploadFile}
                      disabled={uploading}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-white text-sm font-semibold shadow-sm focus:outline-none ${
                        uploading ? "bg-brand-400 cursor-not-allowed" : "bg-brand-600 hover:bg-brand-700"
                      }`}
                    >
                      {uploading ? (
                        <>
                          <svg className="animate-spin -ml-1 h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4A4 4 0 004 12z"/>
                          </svg>
                          กำลังอัปโหลด...
                        </>
                      ) : (
                        <>
                          {/* upload icon */}
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                            <path d="M12 3l4 4h-3v6h-2V7H8l4-4zm-7 9h2v7h10v-7h2v9H5v-9z" />
                          </svg>
                          อัปโหลด
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                {uploading || progress > 0 ? (
                  <div className="mt-4">
                    <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-2 bg-brand-600 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="text-right text-xs text-gray-500 mt-1">{progress}%</div>
                  </div>
                ) : null}
              </div>
            )}

            {/* Success message */}
            {uploadResult && (
              <div className="px-5 pb-5">
                <div className="mt-4 p-3 bg-green-50 text-green-700 rounded-md border border-green-200">
                  <strong className="block mb-1">อัปโหลดสำเร็จ</strong>
                  <div className="text-sm">ไฟล์: <span className="font-semibold">{uploadResult.filename}</span></div>
                  <div className="text-sm">ข้อความ: {uploadResult.message}</div>
                  {typeof uploadResult.importedCount === "number" && (
                    <div className="text-sm">จำนวนที่นำเข้า: {uploadResult.importedCount.toLocaleString()}</div>
                  )}
                  {uploadResult.errors?.length ? (
                    <ul className="list-disc pl-5 text-sm mt-1">
                      {uploadResult.errors.map((er, i) => (<li key={i}>{er}</li>))}
                    </ul>
                  ) : null}
                </div>
              </div>
            )}
          </section>

          {/* RIGHT: Results / Import history */}
          <section className="bg-white rounded-lg shadow-md overflow-hidden">
            <header className="px-5 py-4 border-b border-gray-200">
              <h2 className="text-base font-bold text-gray-900">ผลการประมวลผล / ประวัติการอัปโหลด</h2>
              <p className="text-sm text-gray-500 mt-1">
                แสดงผลการอัปโหลดล่าสุด และรายการที่นำเข้าสำเร็จ
              </p>
            </header>

            <div className="p-5">
              {history.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-8">
                  ยังไม่มีประวัติการอัปโหลด
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-3 py-2 text-left text-xs font-semibold text-gray-600">ไฟล์</th>
                        <th scope="col" className="px-3 py-2 text-left text-xs font-semibold text-gray-600">ขนาด (MB)</th>
                        <th scope="col" className="px-3 py-2 text-left text-xs font-semibold text-gray-600">สถานะ</th>
                        <th scope="col" className="px-3 py-2 text-left text-xs font-semibold text-gray-600">ข้อความ</th>
                        <th scope="col" className="px-3 py-2 text-left text-xs font-semibold text-gray-600">นำเข้าสำเร็จ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {history.map((h) => (
                        <tr key={h.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-sm text-gray-900">{h.filename}</td>
                          <td className="px-3 py-2 text-sm text-gray-600">{h.sizeMB}</td>
                          <td className="px-3 py-2 text-sm">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                              h.status === "SUCCESS" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                            }`}>
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
          </section>
        </div>
      </div>
    </div>
  );
}
