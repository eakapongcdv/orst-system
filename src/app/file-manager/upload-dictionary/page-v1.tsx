"use client";

import { useState, useRef, ChangeEvent, DragEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

// กำหนด type ของผลลัพธ์หลัง upload (เปลี่ยนตาม API จริง)
interface UploadResult {
  message: string;
  filename: string;
  // อาจเพิ่ม field อื่นได้
}

export default function HtmlUploadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const folderIdParam = searchParams.get("folderId");
  const folderId = folderIdParam ? parseInt(folderIdParam, 10) : null;

  // Accept only .html files
  const allowedTypes = ["text/html"];
  const allowedExt = [".html", ".htm"];
  const MAX_FILE_SIZE = 200 * 1024 * 1024; // 20 MB

  const validateFile = (file: File): boolean => {
    // Check MIME type and extension
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowedTypes.includes(file.type) && !allowedExt.includes(ext)) {
      setError("ไฟล์ไม่รองรับ กรุณาอัปโหลดไฟล์ .html เท่านั้น");
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(
        `ไฟล์ ${file.name} มีขนาดใหญ่เกินไป ขนาดสูงสุดคือ ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(2)} MB.`
      );
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
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    setError(null);
    setUploadResult(null);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (validateFile(file)) setSelectedFile(file);
    else setSelectedFile(null);
  };

  const removeFile = () => {
    setSelectedFile(null);
    setError(null);
    setUploadResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const triggerFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError("กรุณาเลือกไฟล์เพื่ออัปโหลด");
      return;
    }
    setUploading(true);
    setError(null);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("specializedDictionaryId", "0");

      // ใส่ folderId ถ้าต้องการ (comment ไว้)
      // if (folderId !== null && !isNaN(folderId)) {
      //   formData.append("folderId", folderId.toString());
      // }

      const response = await fetch("/api/file-manager/upload-dictionary", {
        method: "POST",
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
      const displayError =
        err instanceof Error ? err.message : "การอัปโหลดล้มเหลว โปรดลองอีกครั้ง";
      setError(displayError);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">นำเข้าคำศัพท์</h1>
          <p className="mt-1 text-md text-gray-600">
            อัปโหลดไฟล์
          </p>
        </div>
        {/* Upload Section */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
          <div
            className={`p-8 text-center cursor-pointer transition-colors ${
              isDragOver
                ? "bg-blue-50 border-2 border-dashed border-blue-500"
                : "bg-gray-50 border-2 border-dashed border-gray-300 hover:border-gray-400"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={triggerFileInput}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".html"
              className="hidden"
              id="html-file-upload"
            />
            <div className="flex flex-col items-center justify-center">
              <div className="bg-gray-200 rounded-full p-3 mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-8 w-8 text-gray-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 17v1a3 3 0 01-3 3H7a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1M8 12h8m0 0l-3-3m3 3l-3 3"
                  />
                </svg>
              </div>
              <p className="text-lg font-medium text-gray-700 mb-1">
                {isDragOver
                  ? "วางไฟล์ที่นี่"
                  : "ลาก & วางไฟล์ ที่นี่ หรือคลิกเพื่อเลือก"}
              </p>
              <p className="text-black-500 text-sm">
                รองรับ (สูงสุด 20MB)
              </p>
              <p className="text-gray-400 text-md mt-2">
                {selectedFile
                  ? `เลือกแล้ว: ${selectedFile.name}`
                  : "ยังไม่ได้เลือกไฟล์"}
              </p>
            </div>
          </div>

          {/* Messages */}
          {error && (
            <div className="mt-4 px-6 pb-4">
              <div className="p-3 bg-red-50 text-red-700 rounded-md border border-red-200">
                <div className="flex">
                  <svg
                    className="flex-shrink-0 h-5 w-5 text-red-400 mt-0.5"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div className="ml-3">
                    <h3 className="text-md font-bold">เกิดข้อผิดพลาด</h3>
                    <div className="mt-1 text-md break-words">{error}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {uploadResult && (
            <div className="mt-4 px-6 pb-4">
              <div className="p-3 bg-green-50 text-green-700 rounded-md border border-green-200">
                <div className="flex">
                  <svg
                    className="flex-shrink-0 h-5 w-5 text-green-400 mt-0.5"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div className="ml-3">
                    <h3 className="text-md font-bold">อัปโหลดสำเร็จ!</h3>
                    <div className="mt-1 text-md">{uploadResult.message}</div>
                    <div className="mt-1 text-md">
                      ไฟล์ที่อัปโหลด: <span className="font-semibold">{uploadResult.filename}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedFile && (
            <div className="px-6 pb-6">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center">
                  <span className="text-xl mr-3">📰</span>
                  <div>
                    <p className="text-md font-bold text-gray-900">{selectedFile.name}</p>
                    <p className="text-sm text-gray-500">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={removeFile}
                    disabled={uploading}
                    className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    ลบ
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className={`inline-flex items-center px-4 py-2 border border-transparent text-md font-bold rounded-md shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                      uploading
                        ? "bg-blue-400 cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700"
                    }`}
                  >
                    {uploading ? (
                      <>
                        <svg
                          className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        กำลังอัปโหลด...
                      </>
                    ) : (
                      "อัปโหลดไฟล์ HTML"
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ผลลัพธ์/ข้อความเพิ่มเติม */}
        {!selectedFile && !uploadResult && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden p-8 text-center text-gray-500">
            <p>ยังไม่มีไฟล์ที่เลือก กรุณาเลือกหรืออัปโหลดไฟล์ .html</p>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-6 flex justify-center">
          <Link href={`/file-manager${folderId !== null ? `?folderId=${folderId}` : ""}`}>
            <button className="inline-flex items-center px-4 py-2 border border-gray-300 text-md font-bold rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
              <svg
                className="-ml-1 mr-2 h-5 w-5"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z"
                  clipRule="evenodd"
                />
              </svg>
              กลับไปยังตัวจัดการไฟล์
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
