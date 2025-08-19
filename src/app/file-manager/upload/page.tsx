// app/file-manager/upload/page.tsx
"use client";
import { useState, useRef, ChangeEvent, DragEvent, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

// --- Updated Interfaces ---
// Interface for data received from the new API endpoint for preview
interface ProcessedFileData {
  id: number; // DB ID
  name: string;
  type: string;
  size: number;
  url: string; // This will now be the SIGNED URL
  contentPreview?: string; // New field from backend
  uploadedAt: string; // ISO string
  folderId: number | null;
  ossKey: string; // New field from backend
  documentId: number; // New field from backend (same as id)
}

// Interface for files in the preview list (client-side state)
interface PreviewFile {
  file: File;
  previewUrl: string; // Empty string if no preview (e.g., for PDFs)
  id: string; // Unique ID for React list keys and removal
  // --- Added fields for processing state ---
  isProcessed?: boolean; // Flag to indicate if backend processing is done
  processedData?: ProcessedFileData; // Data received from backend
  processingError?: string | null; // Error message if processing failed
}

// Interface for documents in the final list (after successful upload/processing)
// Can be the same as ProcessedFileData or use a common base if needed elsewhere
// For simplicity, we'll use ProcessedFileData directly in the list
// type UploadedDocument = ProcessedFileData;
// --- End Updated Interfaces ---

export default function FileManagerUploadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // --- Updated State ---
  const [selectedFiles, setSelectedFiles] = useState<PreviewFile[]>([]);
  const [uploading, setUploading] = useState(false);
  // Use the new interface for the list
  const [uploadedDocuments, setUploadedDocuments] = useState<ProcessedFileData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // --- End Updated State ---

  const folderIdParam = searchParams.get('folderId');
  const folderId = folderIdParam ? parseInt(folderIdParam, 10) : null;

  const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB in bytes
  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/msword', // .doc
    'application/vnd.ms-excel', // .xls
    'text/csv' // Add CSV support
  ];

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType: string): string => {
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('sheet')) return '📊';
    if (mimeType.includes('image/')) return '🖼️';
    if (mimeType.includes('text')) return '📄';
    if (mimeType.includes('zip') || mimeType.includes('compressed')) return '📦';
    if (mimeType.includes('audio/')) return '🎵';
    if (mimeType.includes('video/')) return '🎬';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📽️';
    return '📁'; // Default for folders or unknown types
  };

  const validateFiles = (files: FileList): File[] => {
    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!allowedTypes.includes(file.type)) {
        setError(`File ${file.name} has unsupported format. Only PDF, DOC, DOCX, XLS, XLSX, CSV are allowed.`);
        console.warn(`Unsupported file type rejected: ${file.name} (${file.type})`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        const errorMsg = `File ${file.name} is too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.`;
        setError(errorMsg);
        console.warn(errorMsg);
        continue;
      }
      validFiles.push(file);
    }
    return validFiles;
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = e.target.files;
    if (!files) return;
    const validFiles = validateFiles(files);
    addFilesToPreview(validFiles);
  };

  const addFilesToPreview = (files: File[]) => {
    const newPreviewFiles: PreviewFile[] = [];
    files.forEach(file => {
      let previewUrl = '';
      if (file.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(file);
      }
      newPreviewFiles.push({
        file,
        previewUrl,
        id: Math.random().toString(36).substring(2, 9),
        // Initialize new fields
        isProcessed: false,
        processingError: null,
      });
    });
    setSelectedFiles(prev => [...prev, ...newPreviewFiles]);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    setError(null);
    const files = e.dataTransfer.files;
    if (!files) return;
    const validFiles = validateFiles(files);
    addFilesToPreview(validFiles);
  };

  const removeFile = (id: string) => {
    setSelectedFiles(prev => {
      const fileToRemove = prev.find(file => file.id === id);
      if (fileToRemove && fileToRemove.previewUrl) {
        URL.revokeObjectURL(fileToRemove.previewUrl);
      }
      return prev.filter(file => file.id !== id);
    });
  };

  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // --- MODIFIED HANDLE UPLOAD ---
  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      setError('Please select files to upload');
      return;
    }

    setUploading(true);
    setError(null);

    // Reset processing state for files in preview
    setSelectedFiles(prev => prev.map(f => ({ ...f, isProcessed: false, processingError: null, processedData: undefined })));

    try {
      const formData = new FormData();
      selectedFiles.forEach(({ file }) => {
        formData.append('files', file);
      });
      if (folderId !== null && !isNaN(folderId)) {
        formData.append('folderId', folderId.toString());
      }

      // --- Call the upload endpoint ---
      const response = await fetch('/api/file-manager/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorMsg = `Processing failed: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch (parseErr) {
          console.warn("Could not parse processing error response JSON:", parseErr);
        }
        throw new Error(errorMsg);
      }

      const result = await response.json();
      console.log("Processing successful:", result);

      // --- Update preview state with processed data ---
      // Assuming the order of files sent matches the order in result.processedFiles
      // A more robust way is to match by name or use a unique ID from backend
      const updatedPreviewFiles = selectedFiles.map((previewFile, index) => {
        const processedData = result.processedFiles[index];
        if (processedData) {
          return {
            ...previewFile,
            isProcessed: true,
            processedData: processedData,
            processingError: null
          };
        } else {
            // Should not happen if backend is consistent
            return {
                ...previewFile,
                isProcessed: true,
                processingError: 'Processing data not found for this file.'
            };
        }
      });
      setSelectedFiles(updatedPreviewFiles);

      // --- Update the list of uploaded documents ---
      // Use the data returned from the backend
      const newDocuments: ProcessedFileData[] = result.processedFiles; // Already in the correct format
      setUploadedDocuments(prev => [...newDocuments, ...prev]); // Prepend new ones

      // --- Clear the selected files preview list (as before) ---
      selectedFiles.forEach(file => {
        if (file.previewUrl) {
          URL.revokeObjectURL(file.previewUrl);
        }
      });
      setSelectedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // alert(`Successfully processed and uploaded ${result.processedFiles.length} file(s)!`);
    } catch (err) {
      console.error("Processing/Upload error:", err);
      const displayError = err instanceof Error ? err.message : 'Processing failed. Please try again.';
      setError(displayError);

      // Update preview files state to show error
      setSelectedFiles(prev =>
        prev.map(f => ({
          ...f,
          isProcessed: true, // Mark as processed even if it failed
          processingError: displayError
        }))
      );
    } finally {
      setUploading(false);
    }
  };
  // --- END MODIFIED HANDLE UPLOAD ---

  useEffect(() => {
    return () => {
      selectedFiles.forEach(file => {
        if (file.previewUrl) {
          URL.revokeObjectURL(file.previewUrl);
        }
      });
    };
  }, [selectedFiles]);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">นำเข้าเอกสาร</h1>
          <p className="mt-1 text-md text-gray-600">
            อัปโหลดไฟล์ไปยังโฟลเดอร์ปัจจุบัน
            {folderId !== null && (
              <span className="ml-1 font-medium"> (ID: {folderId})</span>
            )}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
          <div
            className={`p-8 text-center cursor-pointer transition-colors ${
              isDragOver
                ? 'bg-blue-50 border-2 border-dashed border-blue-500'
                : 'bg-gray-50 border-2 border-dashed border-gray-300 hover:border-gray-400'
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
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv"
              className="hidden"
              id="file-upload"
            />
            <div className="flex flex-col items-center justify-center">
              <div className="bg-gray-200 rounded-full p-3 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-lg font-medium text-gray-700 mb-1">
                {isDragOver
                  ? 'วางไฟล์ที่นี่'
                  : 'ลาก & วางไฟล์ที่นี่ หรือคลิกเพื่อเลือก'}
              </p>
              <p className="text-black-500 text-sm">
                PDF, DOC, DOCX, XLS, XLSX, CSV (สูงสุด 200MB ต่อไฟล์)
              </p>
              <p className="text-gray-400 text-md mt-2">
                {selectedFiles.length > 0 ? `เลือกแล้ว ${selectedFiles.length} ไฟล์` : 'ยังไม่ได้เลือกไฟล์'}
              </p>
            </div>
          </div>
          {error && (
            <div className="mt-4 px-2 pb-4">
              <div className="p-3 bg-red-50 text-red-700 rounded-md border border-red-200">
                <div className="flex">
                  <svg className="flex-shrink-0 h-5 w-5 text-red-400 mt-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div className="ml-3">
                    <h3 className="text-md font-bold">เกิดข้อผิดพลาด</h3>
                    <div className="mt-1 text-md break-words">{error}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* --- MODIFIED File Preview Section --- */}
          {selectedFiles.length > 0 && (
            <div className="px-2 pb-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-medium text-gray-700">ไฟล์ที่เลือก ({selectedFiles.length})</h3>
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className={`inline-flex items-center px-4 py-2 border border-transparent text-md font-bold rounded-md shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                    uploading
                      ? 'bg-blue-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {uploading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      กำลังประมวลผล...
                    </>
                  ) : (
                    'ประมวลผลและอัปโหลดไฟล์'
                  )}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {selectedFiles.map(({ file, previewUrl, id, isProcessed, processedData, processingError }) => (
                  <div
                    key={id}
                    className="border rounded-lg p-3 flex flex-col bg-white relative shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-center mb-2">
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt={file.name}
                          className="h-20 w-20 object-cover rounded"
                        />
                      ) : (
                        <div className="h-20 w-20 flex items-center justify-center text-2xl">
                          {getFileIcon(file.type)}
                        </div>
                      )}
                    </div>
                    <div className="flex-grow min-w-0">
                      <p className="text-md font-bold text-gray-900 truncate">{file.name}</p>
                      <p className="text-xs text-black-500 mt-1">
                        {file.type.split('/')[1]?.toUpperCase() || 'FILE'}
                      </p>
                      <p className="text-xs text-black-500">{formatFileSize(file.size)}</p>
                      {/* --- ADDED: Show Processing State or Preview --- */}
                      {processingError && (
                         <p className="text-xs text-red-500 mt-1">Error: {processingError}</p>
                      )}
                      {!isProcessed && uploading && (
                         <p className="text-xs text-gray-500 mt-1">กำลังประมวลผล...</p>
                      )}
                      {isProcessed && processedData?.contentPreview && (
                        <div className="mt-2">
                          <p className="text-xs text-gray-500 font-medium">ตัวอย่างเนื้อหา:</p>
                          <p className="text-xs text-gray-700 truncate">{processedData.contentPreview}</p>
                          {processedData.url && (
                             <a
                              href={processedData.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                            >
                              ดูตัวอย่าง (Signed URL)
                            </a>
                          )}
                        </div>
                      )}
                      {/* --- END ADDED --- */}
                    </div>
                    <button
                      onClick={() => removeFile(id)}
                      disabled={uploading}
                      className="absolute top-1 right-1 text-gray-400 hover:text-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label={`ลบ ${file.name}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* --- END MODIFIED File Preview Section --- */}
        </div>
        {/* --- MODIFIED Uploaded Documents List --- */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="px-2 py-5 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">เอกสารที่อัปโหลด</h2>
          </div>
          <div className="px-2 py-4">
            {uploadedDocuments.length === 0 ? (
              <div className="text-center py-8 text-black-500">
                <p>ยังไม่มีเอกสารที่ถูกอัปโหลด</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-2 py-3 text-left text-md font-medium text-black-500 uppercase tracking-wider">เอกสาร</th>
                      <th scope="col" className="px-2 py-3 text-left text-md font-medium text-black-500 uppercase tracking-wider">ประเภท</th>
                      <th scope="col" className="px-2 py-3 text-left text-md font-medium text-black-500 uppercase tracking-wider">ขนาด</th>
                      <th scope="col" className="px-2 py-3 text-left text-md font-medium text-black-500 uppercase tracking-wider">อัปโหลดเมื่อ</th>
                      <th scope="col" className="px-2 py-3 text-left text-md font-medium text-black-500 uppercase tracking-wider">การกระทำ</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {uploadedDocuments.map((document) => (
                      <tr key={document.id} className="hover:bg-gray-50">
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            <span className="text-xl mr-3">{getFileIcon(document.type)}</span>
                            <div>
                              <div className="text-md font-bold text-gray-900">{document.name}</div>
                              {/* Show content preview in the list */}
                              {document.contentPreview && (
                                <div className="text-xs text-gray-500 truncate max-w-xs mt-1">
                                  ตัวอย่าง: {document.contentPreview}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-md text-black-500">
                          {document.type.split('/')[1]?.toUpperCase() || 'FILE'}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-md text-black-500">
                          {formatFileSize(document.size)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-md text-black-500">
                          {new Date(document.uploadedAt).toLocaleDateString('th-TH')}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-md font-bold">
                          {/* Use the signed URL for opening/viewing */}
                          <a
                            href={"/view?ossKey=" + encodeURIComponent(document.url)} 
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-900 mr-3"
                          >
                            เปิด
                          </a>
                          <a
                            href={"/editor?ossKey=" + encodeURIComponent(document.url)} 
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-green-600 hover:text-blue-900 mr-3"
                          >
                            แก้ไข
                          </a>
                          <button
                            onClick={() => {
                              // Implement delete functionality if needed
                              alert(`Delete functionality for document ID ${document.id} would go here.`);
                            }}
                            className="text-red-600 hover:text-red-900"
                          >
                            ลบ
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        {/* --- END MODIFIED Uploaded Documents List --- */}
        <div className="mt-6 flex justify-center">
          <Link href={`/file-manager${folderId !== null ? `?folderId=${folderId}` : ''}`}>
            <button className="inline-flex items-center px-4 py-2 border border-gray-300 text-md font-bold rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
              <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
              กลับไปยังตัวจัดการไฟล์
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}