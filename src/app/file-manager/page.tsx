// app/file-manager/page.tsx
"use client";
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
// Define interfaces for type safety
interface Document {
  id: number;
  name: string;
  type: string; // MIME type
  size: number; // Size in bytes
  url: string;  // Public URL
  version: number;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  folderId: number | null;
}
interface Folder {
  id: number;
  name: string;
  parentId: number | null;
  createdAt: string;
  updatedAt: string;
}
// Define view modes
const VIEW_MODES = {
  list: 'list',
  icon: 'icon',
  gallery: 'gallery',
} as const;

// Literal union of allowed view mode values
type ViewMode = (typeof VIEW_MODES)[keyof typeof VIEW_MODES]; // 'list' | 'icon' | 'gallery'
// --- Improved File Type Icons ---
const getFileIcon = (mimeType: string): { icon: string; color: string; bgColor: string } => {
  if (mimeType.includes('pdf')) return { icon: '📄', color: 'text-red-800', bgColor: 'bg-red-100' };
  if (mimeType.includes('word') || mimeType.includes('document')) return { icon: '📝', color: 'text-blue-800', bgColor: 'bg-blue-100' };
  if (mimeType.includes('excel') || mimeType.includes('sheet')) return { icon: '📊', color: 'text-green-800', bgColor: 'bg-green-100' };
  if (mimeType.includes('image/')) return { icon: '🖼️', color: 'text-purple-800', bgColor: 'bg-purple-100' };
  if (mimeType.includes('text')) return { icon: '📄', color: 'text-gray-800', bgColor: 'bg-gray-100' };
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return { icon: '📦', color: 'text-yellow-800', bgColor: 'bg-yellow-100' };
  if (mimeType.includes('audio/')) return { icon: '🎵', color: 'text-pink-800', bgColor: 'bg-pink-100' };
  if (mimeType.includes('video/')) return { icon: '🎬', color: 'text-indigo-800', bgColor: 'bg-indigo-100' };
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return { icon: '📽️', color: 'text-orange-800', bgColor: 'bg-orange-100' };
  if (mimeType.includes('csv')) return { icon: '📊', color: 'text-green-800', bgColor: 'bg-green-100' }; // Add CSV
  return { icon: '📁', color: 'text-gray-800', bgColor: 'bg-gray-200' }; // Default for folders or unknown
};
const getFolderIcon = (): { icon: string; color: string; bgColor: string } => {
  return { icon: '📁', color: 'text-blue-800', bgColor: 'bg-blue-100' };
};
// --- End Improved Icons ---
export default function FileManagerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // State management
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [currentFolderPath, setCurrentFolderPath] = useState<{ id: number | null; name: string }[]>([{ id: null, name: 'Root' }]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: 'document' | 'folder'; id: number; name: string } | null>(null);
  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // --- New API Loading States ---
  const [apiLoading, setApiLoading] = useState(false); // Tracks if any API call is running
  const [apiLoadingMessage, setApiLoadingMessage] = useState('กำลังโหลด...'); // Message for API loading
  // --- End New API Loading States ---

  // Get parameters from URL
  const urlFolderId = searchParams.get('folderId');
  const urlSearch = searchParams.get('search') || '';
  const urlViewModeParam = searchParams.get('view');
  // Update component state based on URL parameters
  useEffect(() => {
    const folderId = urlFolderId ? parseInt(urlFolderId, 10) : null;
    setCurrentFolderId(folderId);
    setSearchQuery(urlSearch);
    // Ensure view mode is valid
    if (urlViewModeParam === 'list' || urlViewModeParam === 'icon' || urlViewModeParam === 'gallery') {
      setViewMode(urlViewModeParam);
    } else {
      setViewMode('list'); // Default fallback
    }
  }, [urlFolderId, urlSearch, urlViewModeParam]);
  // Fetch data from the API
  const fetchData = useCallback(async () => {
    // --- Set API loading state ---
    setApiLoading(true);
    setApiLoadingMessage('กำลังโหลด...');
    // --- ---
    setLoading(true);
    setError(null);
    try {
      // --- 1. Fetch Contents (Documents and Folders) ---
      const queryParams = new URLSearchParams();
      if (currentFolderId !== null) {
        queryParams.append('folderId', currentFolderId.toString());
      }
      if (searchQuery) {
        queryParams.append('search', searchQuery);
      }
      const response = await fetch(`/api/file-manager?${queryParams.toString()}`);
      // --- Corrected Robust Error Handling ---
      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        // 1. Read the response body *once* as text
        let responseText = '';
        try {
          responseText = await response.text();
        } catch (readError) {
          console.error("Failed to read response body as text:", readError);
           // Ensure apiLoading is reset on error
          setApiLoading(false);
          throw new Error(`API Error (${response.status}): ${response.statusText || 'Unable to read response'}`);
        }
        // 2. If we got text, try to parse it as JSON
        if (responseText) {
          try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.error || `API Error: ${response.status} ${response.statusText}`;
          } catch (jsonParseError) {
            console.warn("Could not parse error response JSON:", jsonParseError);
            errorMessage = `API Error (${response.status}): Server returned non-JSON response. Snippet: ${responseText.substring(0, 100)}...`;
          }
        } else {
          errorMessage = `API Error (${response.status}): ${response.statusText || 'No response body'}`;
        }
        // Ensure apiLoading is reset on error
        setApiLoading(false);
        throw new Error(errorMessage);
      }
      // --- End Corrected Robust Error Handling ---
      const data = await response.json();
      // Update state with fetched data
      setDocuments(data.documents || []);
      setFolders(data.folders || []);
      // --- Fetch folder path for breadcrumbs (only if not searching and inside a folder) ---
      if (!searchQuery && currentFolderId !== null) {
         const pathResponse = await fetch(`/api/file-manager/path?folderId=${currentFolderId}`);
         if (pathResponse.ok) {
            const pathData = await pathResponse.json();
            setCurrentFolderPath(pathData.path || [{ id: null, name: 'Root' }]);
         } else {
            console.warn("Failed to fetch folder path, using fallback.");
            setCurrentFolderPath([
              { id: null, name: 'Root' },
              { id: currentFolderId, name: `Folder ${currentFolderId}` } // Fallback name
            ]);
         }
      } else if (!searchQuery) {
         // At root level, not searching
         setCurrentFolderPath([{ id: null, name: 'Root' }]);
      }
      // If searching, breadcrumbs are typically not shown or are different, handled in render
    } catch (err) {
      console.error("Error fetching file manager ", err);
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
       // --- Clear API loading state ---
      setApiLoading(false);
      // --- ---
    }
  }, [currentFolderId, searchQuery]); // Re-fetch if folder or search changes
  // Fetch data when dependencies change
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  // Handle navigation to a subfolder (update URL)
  const handleFolderClick = (folderId: number) => {
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set('folderId', folderId.toString());
    newParams.delete('search'); // Reset search when navigating folders
    // Preserve view mode
    if (viewMode !== 'list') newParams.set('view', viewMode);
    router.push(`/file-manager?${newParams.toString()}`);
  };
  // Handle navigating up to the parent/root (update URL)
  const handleNavigateUp = () => {
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.delete('folderId'); // Go to root
    newParams.delete('search');
    // Preserve view mode
    if (viewMode !== 'list') newParams.set('view', viewMode);
    router.push(`/file-manager?${newParams.toString()}`);
  };
  // Handle search form submission (update URL)
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const newParams = new URLSearchParams(searchParams.toString());
    if (searchQuery) {
      newParams.set('search', searchQuery);
    } else {
      newParams.delete('search');
    }
    // Preserve view mode and folder context if searching within a folder
    // Example: if (currentFolderId === null) newParams.delete('folderId');
    if (viewMode !== 'list') newParams.set('view', viewMode);
    router.push(`/file-manager?${newParams.toString()}`);
  };
  // Handle view mode change (update URL) - Fixed to correctly update state and URL
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode); // Update state immediately for UI feedback
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set('view', mode);
    router.push(`/file-manager?${newParams.toString()}`, { scroll: false }); // Prevent scroll jump
  };
  // --- New Functions for Actions ---
  // Handle View action - Navigate to WebViewer page
  const handleViewDocument = (documentUrl: string,fileType: string) => {
    let extension = "";
    if(fileType.toUpperCase().includes("PDF")){
        extension = "pdf";
    }
    else if(fileType.toUpperCase().includes("WORD")){
        extension = "docx";
    }
    else if(fileType.toUpperCase().includes("SHEET")){
        extension = "xlsx";
    }
    
    router.push(`/view?extension=${extension}&ossKey=${encodeURIComponent(documentUrl)}`);
  };
  const handleEditDocument = (documentUrl: string,fileType: string) => {
    let extension = "";
    if(fileType.toUpperCase().includes("PDF")){
        extension = "pdf";
    }
    else if(fileType.toUpperCase().includes("WORD")){
        extension = "docx";
    }
    else if(fileType.toUpperCase().includes("SHEET")){
        extension = "xlsx";
    }
    
    router.push(`/editor?extension=${extension}&ossKey=${encodeURIComponent(documentUrl)}`);
  };
  // Handle Share action (placeholder)
  const handleShareDocument = (doc: Document) => {
    alert(`Sharing functionality for '${doc.name}' would go here. Link: ${doc.url}`);
    console.log("Sharing document:", doc);
  };
  // --- Unified Delete Handlers ---
  // Handle Delete action for Documents - Open confirmation
  const handleDeleteDocumentClick = (doc: Document) => {
    setItemToDelete({ type: 'document', id: doc.id, name: doc.name });
    setIsDeleteConfirmOpen(true);
  };
  // Handle Delete action for Folders - Open confirmation
  const handleDeleteFolderClick = (folder: Folder) => {
    setItemToDelete({ type: 'folder', id: folder.id, name: folder.name });
    setIsDeleteConfirmOpen(true);
  };
  // Confirm and perform deletion
  const confirmDelete = async () => {
    if (!itemToDelete) return;

    // --- Set API loading state ---
    setApiLoading(true);
    setApiLoadingMessage(`กำลังลบ ${itemToDelete.type === 'folder' ? 'โฟลเดอร์' : 'ไฟล์'}...`);
    // --- ---

    try {
      let endpoint = '';
      if (itemToDelete.type === 'document') {
        endpoint = `/api/file-manager/documents/${itemToDelete.id}`;
      } else if (itemToDelete.type === 'folder') {
        endpoint = `/api/file-manager/folders/${itemToDelete.id}`;
      } else {
        // Ensure apiLoading is reset on error
        setApiLoading(false);
        throw new Error('Unknown item type for deletion');
      }
      const response = await fetch(endpoint, {
        method: 'DELETE',
        // Include authentication headers if needed by your API
        // headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (!response.ok) {
        let errorMsg = `Failed to delete: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch (parseErr) {
          console.warn("Could not parse delete error response:", parseErr);
        }
        // Ensure apiLoading is reset on error
        setApiLoading(false);
        throw new Error(errorMsg);
      }
      // On successful delete, refresh the file list
      await fetchData(); // Use await to ensure state is updated before clearing loading
      // Close confirmation
      setIsDeleteConfirmOpen(false);
      setItemToDelete(null);
      // Provide user feedback (optional)
      // alert(`Deleted '${itemToDelete.name}' successfully.`);
    } catch (err) {
      console.error(`Error deleting ${itemToDelete?.type}:`, err);
      alert(`Error deleting ${itemToDelete?.type}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      // Close confirmation even on error to allow retry
      setIsDeleteConfirmOpen(false);
      setItemToDelete(null);
    } finally {
        // --- Clear API loading state ---
        // Note: fetchData also clears it, but ensure it's cleared here too in case of early returns or errors before fetchData
        setApiLoading(false);
        // --- ---
    }
  };
  // Cancel deletion
  const cancelDelete = () => {
    setIsDeleteConfirmOpen(false);
    setItemToDelete(null);
  };
  // --- End Unified Delete Handlers ---
  // --- New Folder Handlers ---
  const openNewFolderModal = () => {
    setIsNewFolderModalOpen(true);
    setNewFolderName(''); // Reset input when opening
  };
  const closeNewFolderModal = () => {
    setIsNewFolderModalOpen(false);
    setNewFolderName('');
  };
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      alert('กรุณาใส่ชื่อโฟลเดอร์');
      return;
    }

     // --- Set API loading state ---
    setApiLoading(true);
    setApiLoadingMessage('กำลังสร้างโฟลเดอร์...');
    // --- ---

    try {
      const response = await fetch('/api/file-manager/folders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newFolderName.trim(),
          parentId: currentFolderId, // Pass current folder ID as parentId
        }),
      });
      if (!response.ok) {
        let errorMsg = `Failed to create folder: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch (parseErr) {
          console.warn("Could not parse create folder error response:", parseErr);
        }
        // Ensure apiLoading is reset on error
        setApiLoading(false);
        throw new Error(errorMsg);
      }
      const newFolder: Folder = await response.json();
      // Add the new folder to the local state to update the UI immediately
      setFolders(prevFolders => [...prevFolders, newFolder]);
      closeNewFolderModal();
      // Optionally, you could refetch data instead: fetchData();
    } catch (err) {
      console.error("Error creating folder:", err);
      alert(`Error creating folder: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
        // --- Clear API loading state ---
        setApiLoading(false);
        // --- ---
    }
  };
  // --- End New Folder Handlers ---
  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  // Memoize sorted data for performance
  const sortedDocuments = useMemo(() => {
    return [...documents].sort((a, b) => a.name.localeCompare(b.name, 'th'));
  }, [documents]);
  const sortedFolders = useMemo(() => {
    return [...folders].sort((a, b) => a.name.localeCompare(b.name, 'th'));
  }, [folders]);
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">ตัวจัดการเอกสาร</h1>
          <p className="mt-1 text-sm text-gray-600">
            จัดการเอกสารและโฟลเดอร์ของคุณ
          </p>
        </div>
        {/* Breadcrumbs */}
        {!searchQuery && currentFolderPath.length > 1 && (
          <nav className="flex mb-4" aria-label="Breadcrumb">
            <ol className="inline-flex items-center space-x-1 md:space-x-2 rtl:space-x-reverse">
              {currentFolderPath.map((crumb, index) => (
                <li key={crumb.id ?? 'root'} className="inline-flex items-center">
                  {index > 0 && (
                    <svg className="w-3 h-3 text-gray-400 mx-1" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 6 10">
                      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 9 4-4-4-4"/>
                    </svg>
                  )}
                  <button
                    onClick={() => {
                      const newParams = new URLSearchParams(searchParams.toString());
                      if (index === 0) {
                        newParams.delete('folderId');
                      } else {
                        newParams.set('folderId', crumb.id!.toString());
                      }
                      newParams.delete('search');
                      // Preserve view mode
                      if (viewMode !== 'list') newParams.set('view', viewMode);
                      router.push(`/file-manager?${newParams.toString()}`);
                    }}
                    className={`text-sm font-medium ${index === currentFolderPath.length - 1 ? 'text-gray-900' : 'text-blue-600 hover:text-blue-800'}`}
                    aria-current={index === currentFolderPath.length - 1 ? "page" : undefined}
                  >
                    {crumb.name}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        )}
        {/* Toolbar */}
        <div className="bg-white shadow rounded-lg p-4 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Search Bar */}
            <form onSubmit={handleSearch} className="flex-grow">
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ค้นหาไฟล์หรือโฟลเดอร์..."
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
                <div className="absolute inset-y-0 right-0 flex items-center">
                  <button
                    type="submit"
                    className="h-full py-2 px-3 rounded-r-md border border-transparent text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    ค้นหา
                  </button>
                </div>
              </div>
            </form>
            {/* View Mode Selector */}
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-700 hidden sm:inline">มุมมอง:</span>
              <div className="flex rounded-md shadow-sm" role="group">
                <button
                  type="button"
                  onClick={() => handleViewModeChange('list')}
                  className={`px-3 py-2 text-sm font-medium rounded-l-lg border ${
                    viewMode === 'list'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                  aria-label="มุมมองรายการ"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path>
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => handleViewModeChange('icon')}
                  className={`px-3 py-2 text-sm font-medium border-t border-b ${
                    viewMode === 'icon'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                  aria-label="มุมมองไอคอน"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path>
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => handleViewModeChange('gallery')}
                  className={`px-3 py-2 text-sm font-medium rounded-r-lg border ${
                    viewMode === 'gallery'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                  aria-label="มุมมองแกลเลอรี่"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path>
                  </svg>
                </button>
              </div>
            </div>
            {/* Action Buttons */}
            <div className="flex items-center space-x-2">
              <button
                onClick={openNewFolderModal}
                disabled={apiLoading} // Disable during API loading
                className={`inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
                  apiLoading ? 'bg-green-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
                } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500`}
              >
                <svg className="-ml-1 mr-1 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                <span className="hidden sm:inline">โฟลเดอร์ใหม่</span>
              </button>
              <Link href={{ pathname: '/file-manager/upload', query: currentFolderId ? { folderId: currentFolderId.toString() } : {} }} passHref>
                <button // Use button inside Link for disabling
                  disabled={apiLoading} // Disable during API loading
                  className={`inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
                    apiLoading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                  } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
                >
                  <svg className="-ml-1 mr-1 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="hidden sm:inline">อัปโหลด</span>
                </button>
              </Link>
            </div>
          </div>
        </div>
        {/* Main Content Area */}
        <main>
          {/* --- API Loading Overlay --- */}
          {apiLoading && (
            <div className="fixed inset-0 z-40 bg-black bg-opacity-20 flex items-center justify-center">
              <div className="bg-white rounded-lg p-6 shadow-xl flex flex-col items-center">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 mb-4"></div>
                <p className="text-gray-700">{apiLoadingMessage}</p>
              </div>
            </div>
          )}
          {/* --- End API Loading Overlay --- */}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-md">
              <div className="flex">
                <svg className="flex-shrink-0 h-5 w-5 text-red-400 mt-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div className="ml-3">
                  <h3 className="text-sm font-medium">เกิดข้อผิดพลาด</h3>
                  <div className="mt-1 text-sm break-words">{error}</div>
                  <button
                    onClick={fetchData}
                    disabled={apiLoading} // Disable during API loading
                    className={`mt-2 inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md ${
                      apiLoading ? 'text-red-500 bg-red-50 cursor-not-allowed' : 'text-red-700 bg-red-100 hover:bg-red-200'
                    } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500`}
                  >
                    ลองใหม่อีกครั้ง
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Loading Indicator */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
              <p className="text-gray-600">กำลังโหลดไฟล์และโฟลเดอร์...</p>
            </div>
          )}
          {/* File/Folder Contents */}
          {!loading && !error && (
            <div className="bg-white shadow rounded-lg overflow-hidden">
              {/* Folder Navigation (if not at root and not searching) */}
              {currentFolderId !== null && !searchQuery && (
                <div className="px-6 py-4 border-b border-gray-200 flex items-center">
                  <button
                    onClick={handleNavigateUp}
                    className="flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
                  >
                    <svg className="mr-1 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" />
                    </svg>
                    กลับไปยังโฟลเดอร์ก่อนหน้า
                  </button>
                </div>
              )}
              {/* Empty State */}
              {sortedFolders.length === 0 && sortedDocuments.length === 0 && (
                <div className="p-12 text-center">
                  <svg className="mx-auto h-12 w-12 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                  <h3 className="mt-2 text-sm font-medium text-gray-900">
                    {searchQuery ? 'ไม่พบผลการค้นหา' : 'ไม่มีไฟล์หรือโฟลเดอร์'}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {searchQuery
                      ? `ไม่พบไฟล์หรือโฟลเดอร์ที่ตรงกับ "${searchQuery}"`
                      : 'เริ่มต้นโดยการอัปโหลดไฟล์ใหม่'}
                  </p>
                  <div className="mt-6 flex justify-center space-x-4">
                    <button
                      onClick={openNewFolderModal}
                      disabled={apiLoading} // Disable during API loading
                      className={`inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white ${
                        apiLoading ? 'bg-green-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
                      } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500`}
                    >
                      <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                      สร้างโฟลเดอร์ใหม่
                    </button>
                    <Link href={{ pathname: '/file-manager/upload', query: currentFolderId ? { folderId: currentFolderId.toString() } : {} }} passHref>
                      <button
                        disabled={apiLoading} // Disable during API loading
                        className={`inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white ${
                          apiLoading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                        } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
                      >
                        <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        อัปโหลดไฟล์
                      </button>
                    </Link>
                  </div>
                </div>
              )}
              {/* Content Based on View Mode */}
              {viewMode === 'list' && (sortedFolders.length > 0 || sortedDocuments.length > 0) && (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-md font-medium text-gray-500 uppercase tracking-wider">ชื่อ</th>
                        <th scope="col" className="px-6 py-3 text-left text-md font-medium text-gray-500 uppercase tracking-wider">ขนาด</th>
                        <th scope="col" className="px-6 py-3 text-left text-md font-medium text-gray-500 uppercase tracking-wider">เวอร์ชัน</th>
                        <th scope="col" className="px-6 py-3 text-left text-md font-medium text-gray-500 uppercase tracking-wider">แก้ไขล่าสุด</th>
                        <th scope="col" className="px-6 py-3 text-right text-md font-medium text-gray-500 uppercase tracking-wider">การกระทำ</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {/* Folders */}
                      {sortedFolders.map((folder) => {
                        const iconInfo = getFolderIcon();
                        return (
                        <tr key={`folder-${folder.id}`} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className={`flex-shrink-0 h-10 w-10 rounded-md flex items-center justify-center text-xl ${iconInfo.bgColor} ${iconInfo.color}`}>
                                {iconInfo.icon}
                              </div>
                              <div className="ml-4">
                                <button
                                  onClick={() => handleFolderClick(folder.id)}
                                  className="text-sm font-medium text-blue-600 hover:text-blue-900 hover:underline"
                                >
                                  {folder.name}
                                </button>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(folder.updatedAt).toLocaleDateString('th-TH')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              onClick={() => handleFolderClick(folder.id)}
                              className="text-blue-600 hover:text-blue-900 mr-3"
                            >
                              เปิด
                            </button>
                            {/* <button className="text-gray-600 hover:text-gray-900 mr-3">แชร์</button> */}
                            <button
                              onClick={() => handleDeleteFolderClick(folder)}
                              className="text-red-600 hover:text-red-900"
                            >
                              ลบ
                            </button>
                          </td>
                        </tr>
                      );})}
                      {/* Documents */}
                      {sortedDocuments.map((doc) => {
                         const iconInfo = getFileIcon(doc.type);
                         return (
                        <tr key={`doc-${doc.id}`} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className={`flex-shrink-0 h-10 w-10 rounded-md flex items-center justify-center text-xl ${iconInfo.bgColor} ${iconInfo.color}`}>
                                {iconInfo.icon}
                              </div>
                              <div className="ml-4">
                                <button
                                  onClick={() => handleViewDocument(doc.url,doc.type)}
                                  className="text-sm font-medium text-blue-600 hover:text-blue-900 hover:underline"
                                >
                                  {doc.name}
                                </button>
                                <div className="text-sm text-gray-500">{doc.type.split('/')[1]?.toUpperCase() || 'FILE'}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatFileSize(doc.size)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">v{doc.version}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(doc.updatedAt).toLocaleDateString('th-TH')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              onClick={() => handleViewDocument(doc.url,doc.type)}
                              className="text-blue-600 hover:text-blue-900 mr-3"
                            >
                              เปิด
                            </button>
                            <button
                              onClick={() => handleEditDocument(doc.url,doc.type)}
                              className="text-blue-600 hover:text-blue-900 mr-3"
                            >
                              แก้ไข
                            </button>
                            <button
                               onClick={() => handleShareDocument(doc)}
                               className="text-gray-600 hover:text-gray-900 mr-3"
                            >
                              แชร์
                            </button>
                            <button
                               onClick={() => handleDeleteDocumentClick(doc)}
                               className="text-red-600 hover:text-red-900"
                            >
                              ลบ
                            </button>
                          </td>
                        </tr>
                      );})}
                    </tbody>
                  </table>
                </div>
              )}
              {viewMode === 'icon' && (sortedFolders.length > 0 || sortedDocuments.length > 0) && (
                <div className="p-6">
                  <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {/* Folders */}
                    {sortedFolders.map((folder) => {
                      const iconInfo = getFolderIcon();
                      return (
                      <li key={`folder-icon-${folder.id}`} className="col-span-1 flex flex-col text-center bg-gray-50 rounded-lg shadow divide-y divide-gray-200 hover:shadow-md transition-shadow">
                        <div className="flex-1 flex flex-col p-4">
                          <button
                            onClick={() => handleFolderClick(folder.id)}
                            className="flex-shrink-0 flex items-center justify-center h-24 text-4xl mx-auto"
                          >
                             <div className={`h-16 w-16 rounded-lg flex items-center justify-center ${iconInfo.bgColor} ${iconInfo.color}`}>
                               {iconInfo.icon}
                             </div>
                          </button>
                          <h3 className="mt-4 text-gray-900 text-sm font-medium truncate">{folder.name}</h3>
                        </div>
                        <div className="p-2">
                          <div className="flex space-x-2">
                             <button
                               onClick={() => handleFolderClick(folder.id)}
                               className="flex-1 text-xs py-1 px-2 bg-white rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
                             >
                               ดู
                             </button>
                            {/* <button className="flex-1 text-xs py-1 px-2 bg-white rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100">แชร์</button> */}
                            <button
                              onClick={() => handleDeleteFolderClick(folder)}
                              className="flex-1 text-xs py-1 px-2 bg-white rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
                            >
                              ลบ
                            </button>
                          </div>
                        </div>
                      </li>
                    );})}
                    {/* Documents */}
                    {sortedDocuments.map((doc) => {
                       const iconInfo = getFileIcon(doc.type);
                       return (
                      <li key={`doc-icon-${doc.id}`} className="col-span-1 flex flex-col text-center bg-white rounded-lg shadow divide-y divide-gray-200 hover:shadow-md transition-shadow">
                        <div className="flex-1 flex flex-col p-4">
                          <button
                            onClick={() => handleViewDocument(doc.url, doc.type)}
                            className="flex-shrink-0 flex items-center justify-center h-24 text-4xl mx-auto hover:opacity-90"
                          >
                             <div className={`h-16 w-16 rounded-lg flex items-center justify-center ${iconInfo.bgColor} ${iconInfo.color}`}>
                               {iconInfo.icon}
                             </div>
                          </button>
                          <h3 className="mt-4 text-gray-900 text-sm font-medium truncate">{doc.name}</h3>
                          <dl className="mt-1 flex-grow flex flex-col justify-between">
                            <dt className="sr-only">ขนาด</dt>
                            <dd className="text-gray-500 text-xs">{formatFileSize(doc.size)}</dd>
                            <dt className="sr-only">เวอร์ชัน</dt>
                            <dd className="text-gray-500 text-xs">v{doc.version}</dd>
                          </dl>
                        </div>
                        <div className="p-2">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleViewDocument(doc.url, doc.type)}
                              className="flex-1 text-xs py-1 px-2 bg-white rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100 text-center"
                            >
                              เปิด
                            </button>
                            <button
                              onClick={() => handleShareDocument(doc)}
                              className="flex-1 text-xs py-1 px-2 bg-white rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
                            >
                              แชร์
                            </button>
                            <button
                              onClick={() => handleDeleteDocumentClick(doc)}
                              className="flex-1 text-xs py-1 px-2 bg-white rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
                            >
                              ลบ
                            </button>
                          </div>
                        </div>
                      </li>
                    );})}
                  </ul>
                </div>
              )}
              {viewMode === 'gallery' && (sortedFolders.length > 0 || sortedDocuments.length > 0) && (
                <div className="p-6">
                  <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {/* Folders */}
                    {sortedFolders.map((folder) => {
                      const iconInfo = getFolderIcon();
                      return (
                      <li key={`folder-gallery-${folder.id}`} className="relative rounded-lg border border-gray-300 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                        <button
                          onClick={() => handleFolderClick(folder.id)}
                          className="block w-full h-full focus:outline-none"
                        >
                          <div className="flex items-center p-4">
                            <div className={`flex-shrink-0 flex items-center justify-center h-16 w-16 text-2xl rounded-lg ${iconInfo.bgColor} ${iconInfo.color}`}>
                              {iconInfo.icon}
                            </div>
                            <div className="ml-4">
                              <h3 className="text-base font-medium text-gray-900 truncate">{folder.name}</h3>
                              <p className="text-sm text-gray-500">โฟลเดอร์</p>
                            </div>
                          </div>
                        </button>
                      </li>
                    );})}
                    {/* Documents (Images get special treatment) */}
                    {sortedDocuments.map((doc) => {
                      const iconInfo = getFileIcon(doc.type);
                      return (
                      <li key={`doc-gallery-${doc.id}`} className="relative rounded-lg border border-gray-300 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                        <button
                          onClick={() => handleViewDocument(doc.url,doc.type)}
                          className="block w-full h-full focus:outline-none"
                        >
                          {doc.type.startsWith('image/') ? (
                            <div className="aspect-w-10 aspect-h-7 block w-full h-48 overflow-hidden bg-gray-100">
                              <div className="flex items-center justify-center h-full text-gray-500">
                                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                                </svg>
                                <span className="ml-2">พรีวิวรูปภาพ</span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center p-4">
                              <div className={`flex-shrink-0 flex items-center justify-center h-16 w-16 text-2xl rounded-lg ${iconInfo.bgColor} ${iconInfo.color}`}>
                                {iconInfo.icon}
                              </div>
                              <div className="ml-4">
                                <h3 className="text-base font-medium text-gray-900 truncate">{doc.name}</h3>
                                <p className="text-sm text-gray-500">{doc.type.split('/')[1]?.toUpperCase() || 'FILE'}</p>
                              </div>
                            </div>
                          )}
                          <div className="border-t border-gray-200 px-4 py-2 flex justify-between items-center">
                            <span className="text-xs text-gray-500">{formatFileSize(doc.size)}</span>
                            <span className="text-xs text-gray-500">v{doc.version}</span>
                          </div>
                        </button>
                        {/* Action buttons at the bottom of gallery card */}
                        <div className="p-2 bg-gray-50 flex justify-center space-x-2">
                             <button
                               onClick={(e) => { e.stopPropagation(); handleViewDocument(doc.url,doc.type); }}
                               className="flex-1 text-xs py-1 px-2 bg-white rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100 text-center"
                             >
                               เปิด
                             </button>
                             <button
                               onClick={(e) => { e.stopPropagation(); handleShareDocument(doc); }}
                               className="flex-1 text-xs py-1 px-2 bg-white rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
                             >
                               แชร์
                             </button>
                             <button
                               onClick={(e) => { e.stopPropagation(); handleDeleteDocumentClick(doc); }}
                               className="flex-1 text-xs py-1 px-2 bg-white rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
                             >
                               ลบ
                             </button>
                        </div>
                      </li>
                    );})}
                  </ul>
                </div>
              )}
            </div>
          )}
        </main>
        {/* --- Delete Confirmation Modal (Fixed z-index) --- */}
        {isDeleteConfirmOpen && itemToDelete && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
              {/* Background overlay - z-40, inside main container */}
              <div className="fixed inset-0 transition-opacity z-40" aria-hidden="true">
                <div
                  className="absolute inset-0 bg-gray-500 opacity-75"
                  onClick={cancelDelete}
                ></div>
              </div>
              {/* This element tricks the browser into centering the modal contents. */}
              <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
              {/* Modal panel - z-50, inside main container, comes AFTER overlay */}
              {/* Ensure this div has z-50 or higher than overlay within the same stacking context */}
              <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full z-50 relative"> {/* Added relative for good measure */}
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="sm:flex sm:items-start">
                    <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                      <svg className="h-6 w-6 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                      <h3 className="text-lg leading-6 font-medium text-gray-900">
                        ยืนยันการลบ
                      </h3>
                      <div className="mt-2">
                        <p className="text-sm text-gray-500">
                          คุณแน่ใจหรือไม่ว่าต้องการลบ <span className="font-medium">{itemToDelete.type === 'folder' ? 'โฟลเดอร์' : 'ไฟล์'}</span> <span className="font-semibold">{itemToDelete.name}</span>? การกระทำนี้ไม่สามารถยกเลิกได้
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="button"
                    onClick={confirmDelete}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    ลบ
                  </button>
                  <button
                    type="button"
                    onClick={cancelDelete}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* --- End Delete Confirmation Modal --- */}
        {/* --- New Folder Modal (Fixed z-index) --- */}
        {isNewFolderModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
              {/* Background overlay - z-40, inside main container */}
              <div className="fixed inset-0 transition-opacity z-40" aria-hidden="true">
                <div
                  className="absolute inset-0 bg-gray-500 opacity-75"
                  onClick={closeNewFolderModal}
                ></div>
              </div>
              {/* This element tricks the browser into centering the modal contents. */}
              <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
              {/* Modal panel - z-50, inside main container, comes AFTER overlay */}
              {/* Ensure this div has z-50 or higher than overlay within the same stacking context */}
              <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full z-50 relative"> {/* Added relative for good measure */}
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="sm:flex sm:items-start">
                    <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-green-100 sm:mx-0 sm:h-10 sm:w-10">
                      <svg className="h-6 w-6 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                      </svg>
                    </div>
                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                      <h3 className="text-lg leading-6 font-medium text-gray-900">
                        สร้างโฟลเดอร์ใหม่
                      </h3>
                      <div className="mt-4">
                        <label htmlFor="folder-name" className="block text-sm font-medium leading-6 text-gray-900">
                          ชื่อโฟลเดอร์
                        </label>
                        <div className="mt-2">
                          <input
                            type="text"
                            id="folder-name"
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                            placeholder="ชื่อโฟลเดอร์ใหม่"
                            autoFocus
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="button"
                    onClick={handleCreateFolder}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    สร้าง
                  </button>
                  <button
                    type="button"
                    onClick={closeNewFolderModal}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* --- End New Folder Modal --- */}
      </div>
    </div>
  );
}
