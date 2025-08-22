"use client";

import { useState, useRef, useMemo, ChangeEvent, DragEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CloudArrowUpIcon,
  TrashIcon,
  DocumentArrowUpIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowDownTrayIcon,
  BookOpenIcon,
  LanguageIcon,
  BeakerIcon,
} from '@heroicons/react/24/solid';

interface ImportedRow {
  romanization?: string;
  originalScript1?: string | null;
  originalScript2?: string | null;
  language?: string | null;
  wordType?: string | null;
  category?: string | null;
  transliteration1?: string | null;
  transliteration2?: string | null;
  meaning?: string | null;
  notes?: string | null;
  referenceCriteria?: string | null;
  publicationDate?: string | null;
}

export default function TransliterationUploadPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    message: string;
    created: number;
    skipped: number;
    errors: string[];
    importedRows?: ImportedRow[];
    rows?: ImportedRow[];
    items?: ImportedRow[];
    createdItems?: ImportedRow[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pathname = usePathname();

  const importedRows = useMemo<ImportedRow[] | null>(() => {
    if (!uploadResult) return null;
    return (
      uploadResult.importedRows ||
      uploadResult.rows ||
      uploadResult.createdItems ||
      uploadResult.items ||
      null
    );
  }, [uploadResult]);

  // รับเฉพาะไฟล์ .xlsx
  const allowedTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];
  const MAX_FILE_SIZE = 200 * 1024 * 1024;

  const validateFile = (file: File): boolean => {
    if (!allowedTypes.includes(file.type)) {
      setError('ไฟล์ไม่รองรับ กรุณาอัปโหลดไฟล์ .xlsx เท่านั้น');
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(`ไฟล์ ${file.name} มีขนาดใหญ่เกินไป (สูงสุด ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(2)} MB)`);
      return false;
    }
    return true;
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setUploadResult(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (validateFile(file)) {
      setSelectedFile(file);
    } else {
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setError(null);
    setUploadResult(null);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (validateFile(file)) {
      setSelectedFile(file);
    } else {
      setSelectedFile(null);
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    setError(null);
    setUploadResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDownloadSample = async () => {
    try {
      // Try to download from server-side file: src/sample-files/ตัวอย่าง คำทับศัพท์.xlsx
      const res = await fetch('/api/sample-files/transliteration-template');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ตัวอย่าง คำทับศัพท์.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      return;
    } catch (err) {
      console.warn('Template download via API failed, fallback to client-generated file:', err);
    }

    // Fallback: generate a sample workbook on the client
    try {
      const ExcelJS = (await import('exceljs')).default || (await import('exceljs'));
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Transliteration Template');
      ws.addRow([
        'romanization',
        'originalScript1',
        'originalScript2',
        'language',
        'wordType',
        'category',
        'transliteration1',
        'transliteration2',
        'meaning',
        'notes',
        'referenceCriteria',
        'publicationDate(YYYY-MM-DD)'
      ]);
      ws.addRow(['ice cream', 'アイスクリーム', '', 'ญี่ปุ่น', 'คำนาม', 'อาหาร', 'ไอศกรีม', '', 'ของหวานแช่แข็ง', '', 'หลักเกณฑ์การทับศัพท์ภาษาญี่ปุ่น พ.ศ. 2548', '2020-01-01']);
      ws.addRow(['Francisco', '', '', 'สเปน', 'ชื่อบุคคล', 'ชื่อบุคคลและนามสกุล', 'ฟรันซิสโก', '', 'ชื่อบุคคลชาย', '', '—', '']);
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'transliteration-import-template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error('Download sample fallback failed:', e);
      alert('ไม่สามารถดาวน์โหลดไฟล์ตัวอย่างได้');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('กรุณาเลือกไฟล์เพื่ออัปโหลด');
      return;
    }
    setUploading(true);
    setError(null);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const response = await fetch('/api/file-manager/upload-transliteration', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        let errorMsg = `การอัปโหลดล้มเหลว: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch {}
        throw new Error(errorMsg);
      }
      const result = await response.json();
      setUploadResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'การอัปโหลดล้มเหลว โปรดลองอีกครั้ง');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="page">
      <div
        className="w-full max-w-none px-4 lg:px-8 min-h-0 overflow-hidden flex flex-col"
        style={{
          ['--page-safe-gap' as any]: '24px',
          height: 'min(80vh, calc(100vh - var(--app-header) - var(--app-footer) - var(--page-safe-gap, 24px)))',
          maxHeight: 'min(80vh, calc(100vh - var(--app-header) - var(--app-footer) - var(--page-safe-gap, 24px)))'
        }}
      >
        {/* Upload Tabs */}
        <nav className="mb-4" aria-label="เมนูนําเข้าไฟล์">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/file-manager/upload-dictionary"
              className={`${pathname?.startsWith('/file-manager/upload-dictionary') ? 'btn-primary' : 'btn-secondary'} btn--sm`}
            >
              <BookOpenIcon className="h-5 w-5" aria-hidden="true" />
              นำเข้า พจนานุกรม
            </Link>
            <Link
              href="/file-manager/upload-transliteration"
              className={`${pathname?.startsWith('/file-manager/upload-transliteration') ? 'btn-primary' : 'btn-secondary'} btn--sm`}
            >
              <LanguageIcon className="h-5 w-5" aria-hidden="true" />
              นำเข้าคำทับศัพท์
            </Link>
            <Link
              href="/file-manager/upload-taxonomy"
              className={`${pathname?.startsWith('/file-manager/upload-taxonomy') ? 'btn-primary' : 'btn-secondary'} btn--sm`}
            >
              <BeakerIcon className="h-5 w-5" aria-hidden="true" />
              นำเข้า อนุกรมวิธาน
            </Link>
          </div>
        </nav>

        {/* Header */}
        <header className="page-header">
          <h1 className="page-title flex items-center gap-3">
            <DocumentArrowUpIcon className="h-7 w-7 text-[var(--brand-gold)]" aria-hidden="true" />
            นำเข้าคำทับศัพท์
          </h1>
          <p className="page-subtitle">
            อัปโหลดไฟล์ Excel (.xlsx) ที่มีข้อมูลคำทับศัพท์ (original term, คำทับศัพท์ ฯลฯ)
          </p>
        </header>

        {/* Two-column layout: left = import/uploader, right = results */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch overflow-hidden">
          {/* LEFT: Import / Uploader */}
          <section className="card overflow-hidden flex min-h-0 flex-col">
            <div className="card-body flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm text-gray-600">รองรับเฉพาะไฟล์ .xlsx (สูงสุด 200MB)</div>
                <button type="button" onClick={handleDownloadSample} className="btn-secondary btn--sm" title="ดาวน์โหลดไฟล์ตัวอย่าง">
                  <ArrowDownTrayIcon className="h-5 w-5" aria-hidden="true" />
                  ดาวน์โหลดไฟล์ตัวอย่าง
                </button>
              </div>

              {/* Hidden native input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".xlsx"
                className="sr-only"
                id="transliteration-file-upload"
              />

              {/* Dropzone */}
              <div
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInputRef.current?.click()}
                className="rounded-lg border-2 border-dashed border-[var(--brand-border)] bg-white/70 hover:bg-white/90 transition p-8 text-center cursor-pointer monogram-bg"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                aria-label="เลือกรายการไฟล์ .xlsx เพื่ออัปโหลด"
              >
                <CloudArrowUpIcon className="mx-auto h-10 w-10 text-[var(--brand-gold)]" aria-hidden="true" />
                <p className="mt-3 font-semibold">
                  {selectedFile ? `เลือกแล้ว: ${selectedFile.name}` : 'ลาก & วางไฟล์ .xlsx ที่นี่ หรือคลิกเพื่อเลือก'}
                </p>
              </div>

              {/* File chip + remove */}
              {selectedFile && (
                <div className="mt-4 flex items-center justify-between brand-chip">
                  <div className="flex items-center gap-2">
                    <span className="chip-icon">.XLSX</span>
                    <span className="text-sm">
                      {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                    </span>
                  </div>
                  <button onClick={removeFile} className="btn-ghost btn-icon" title="ลบไฟล์">
                    <TrashIcon className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              )}

              {/* Upload button */}
              <button
                onClick={handleUpload}
                disabled={uploading || !selectedFile}
                className="btn-primary w-full mt-4"
              >
                <CloudArrowUpIcon className="h-5 w-5" aria-hidden="true" />
                {uploading ? 'กำลังอัปโหลด...' : 'อัปโหลดไฟล์คำทับศัพท์'}
              </button>
            </div>
          </section>

          {/* RIGHT: Results & Imported list */}
          <section className="card overflow-hidden flex min-h-0 flex-col">
            <div className="card-body flex flex-col min-h-0">
              <h3 className="text-lg font-semibold mb-2">ผลการนำเข้า</h3>

              {/* Error / Result */}
              {error && (
                <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-3 text-red-700 flex items-start gap-2">
                  <ExclamationTriangleIcon className="h-5 w-5 mt-0.5" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              {uploadResult ? (
                <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircleIcon className="h-5 w-5" aria-hidden="true" />
                    <span>{uploadResult.message}</span>
                  </div>
                  <div className="mt-1 text-sm">
                    เพิ่มใหม่: {uploadResult.created}, ข้าม: {uploadResult.skipped}
                  </div>
                  {uploadResult.errors && uploadResult.errors.length > 0 && (
                    <details className="mt-2 text-left text-xs text-red-600">
                      <summary>รายละเอียดข้อผิดพลาด</summary>
                      <ul className="list-disc pl-5 mt-1">
                        {uploadResult.errors.map((err: string, i: number) => <li key={i}>{err}</li>)}
                      </ul>
                    </details>
                  )}
                </div>
              ) : (
                <div className="mt-2 text-sm text-gray-600">ยังไม่มีผลการนำเข้า แสดงผลลัพธ์ที่นี่หลังจากอัปโหลดไฟล์</div>
              )}

              {/* Imported rows table */}
              {Array.isArray(importedRows) && importedRows.length > 0 && (
                <div className="mt-4 flex-1 min-h-0 flex flex-col">
                  <h4 className="text-md font-semibold mb-2">รายการที่นำเข้าสำเร็จ ({importedRows.length.toLocaleString()})</h4>
                  <div className="flex-1 overflow-auto rounded-md border border-[var(--brand-border)] bg-white/70">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-[var(--brand-cream,#faf7ef)]">
                        <tr className="text-left">
                          <th className="px-3 py-2 border-b border-[var(--brand-border)]">#</th>
                          <th className="px-3 py-2 border-b border-[var(--brand-border)]">Romanization</th>
                          <th className="px-3 py-2 border-b border-[var(--brand-border)]">ต้นฉบับ</th>
                          <th className="px-3 py-2 border-b border-[var(--brand-border)]">คำทับศัพท์</th>
                          <th className="px-3 py-2 border-b border-[var(--brand-border)]">ภาษา</th>
                          <th className="px-3 py-2 border-b border-[var(--brand-border)]">ชนิดคำ</th>
                          <th className="px-3 py-2 border-b border-[var(--brand-border)]">หมวดหมู่</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importedRows.map((row, idx) => (
                          <tr key={idx} className="odd:bg-white/60 even:bg-white/30">
                            <td className="px-3 py-2 align-top border-t border-[var(--brand-border)]">{idx + 1}</td>
                            <td className="px-3 py-2 align-top border-t border-[var(--brand-border)]">{row.romanization || '-'}</td>
                            <td className="px-3 py-2 align-top border-t border-[var(--brand-border)]">{row.originalScript1 || row.originalScript2 || '-'}</td>
                            <td className="px-3 py-2 align-top border-t border-[var(--brand-border)]">{row.transliteration1 || row.transliteration2 || '-'}</td>
                            <td className="px-3 py-2 align-top border-t border-[var(--brand-border)]">{row.language || '-'}</td>
                            <td className="px-3 py-2 align-top border-t border-[var(--brand-border)]">{row.wordType || '-'}</td>
                            <td className="px-3 py-2 align-top border-t border-[var(--brand-border)]">{row.category || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}