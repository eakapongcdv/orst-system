"use client";

import { useState, useRef, ChangeEvent, DragEvent } from 'react';
import Link from 'next/link';
import {
  CloudArrowUpIcon,
  TrashIcon,
  DocumentArrowUpIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/solid';

interface TransliterationEntry {
  id?: number;
  original_term: string;
  transliterated: string;
  language_source?: string | null;
  pronunciation?: string | null;
  created_at?: string;
  updated_at?: string;
}

export default function TransliterationUploadPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ message: string; created: number; skipped: number; errors: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      <div className="max-w-4xl mx-auto px-4">
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

        {/* Card */}
        <section className="card overflow-hidden">
          <div className="card-body">
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
              <p className="text-sm opacity-80 mt-1">รองรับเฉพาะไฟล์ .xlsx (สูงสุด 200MB)</p>
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

            {/* Error / Result */}
            {error && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-red-700 flex items-start gap-2">
                <ExclamationTriangleIcon className="h-5 w-5 mt-0.5" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}
            {uploadResult && (
              <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
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
            )}
          </div>
        </section>

        {/* Back link */}
        <div className="mt-6 flex justify-center">
          <Link href={`/file-manager`} className="btn-secondary">
            กลับไปยังตัวจัดการไฟล์
          </Link>
        </div>
      </div>
    </div>
  );
}
