"use client";

import { useState, useRef, ChangeEvent, DragEvent } from 'react';
import Link from 'next/link';

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
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-xl mx-auto px-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">นำเข้าคำทับศัพท์</h1>
          <p className="mt-1  text-gray-600">
            อัปโหลดไฟล์ Excel (.xlsx) ที่มีข้อมูลคำทับศัพท์ (original term, คำทับศัพท์ ฯลฯ)
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-md mb-8 p-8 text-center">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".xlsx"
            className="hidden"
            id="transliteration-file-upload"
          />
          <div
            className="p-4 border-2 border-dashed border-gray-300 rounded cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <p className="text-lg font-medium text-gray-700 mb-1">
              {selectedFile ? `เลือกแล้ว: ${selectedFile.name}` : 'ลาก & วางไฟล์ .xlsx ที่นี่ หรือคลิกเพื่อเลือก'}
            </p>
            <p className="text-black-500 text-sm">รองรับเฉพาะไฟล์ .xlsx (สูงสุด 200MB)</p>
          </div>
          {selectedFile && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm">{selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)</span>
              <button onClick={removeFile} className="text-red-500 text-sm px-2 py-1 rounded hover:bg-red-100">ลบไฟล์</button>
            </div>
          )}
          <button
            onClick={handleUpload}
            disabled={uploading || !selectedFile}
            className={`mt-4 w-full inline-flex items-center justify-center px-4 py-2 border border-transparent  font-bold rounded-md shadow-sm text-white ${
              uploading || !selectedFile ? 'bg-blue-300' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {uploading ? 'กำลังอัปโหลด...' : 'อัปโหลดไฟล์คำทับศัพท์'}
          </button>
          {error && (
            <div className="mt-4 text-red-600">{error}</div>
          )}
          {uploadResult && (
            <div className="mt-4 text-green-700">
              <div>{uploadResult.message}</div>
              <div>เพิ่มใหม่: {uploadResult.created}, ข้าม: {uploadResult.skipped}</div>
              {uploadResult.errors && uploadResult.errors.length > 0 && (
                <details className="mt-2 text-left text-xs text-red-600">
                  <summary>รายละเอียด error</summary>
                  <ul>
                    {uploadResult.errors.map((err: string, i: number) => <li key={i}>{err}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-center">
          <Link href={`/file-manager`}>
            <button className="inline-flex items-center px-4 py-2 border border-gray-300  font-bold rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none">
              กลับไปยังตัวจัดการไฟล์
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
