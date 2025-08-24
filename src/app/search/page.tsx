// app/search/page.tsx
"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Head from 'next/head'; // Import Head component

interface SearchResult {
  id: number;
  name: string; // This will contain highlighted HTML from the API
  type: string;
  size: number;
  url: string; // This will be the proxy URL from the API, e.g., 
  description: string;
  updatedAt: string;
  // Fields from the updated API
  contentPreview?: string; // This will contain highlighted HTML snippet from the API
  // searchKeywords?: string[]; // Not used here as highlighting is done by the API
}

export default function SearchPage() {
  const [query, setQuery] = useState(''); // Initially empty for default load
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Load initial data ---
  useEffect(() => {
    const loadInitialResults = async () => {
      setLoading(true);
      setError(null);
      setShowResults(false); // Hide previous results while loading initial data
      try {
        const response = await fetch(`/api/search?q=`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setResults(Array.isArray(data.results) ? data.results : []);
        setShowResults(true);
      } catch (err) {
        console.error("Failed to load initial results:", err);
        setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดเอกสาร');
        setResults([]);
        setShowResults(false); // Ensure results area is hidden on initial load error
      } finally {
        setLoading(false);
      }
    };

    loadInitialResults();
  }, []);
  // --- End useEffect ---

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

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
    if (mimeType.includes('csv')) return { icon: '📊', color: 'text-green-800', bgColor: 'bg-green-100' };
    return { icon: '📁', color: 'text-gray-800', bgColor: 'bg-gray-200' };
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    // Allow empty query submission to reload the default list
    setLoading(true);
    setError(null);
    // setShowResults(false); // Optional: keep previous results visible while loading
    try {
      const searchQuery = query ? encodeURIComponent(query) : '';
      const response = await fetch(`/api/search?q=${searchQuery}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setResults(Array.isArray(data.results) ? data.results : []);
      setShowResults(true);
    } catch (err) {
      console.error("Search error:", err);
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการค้นหา กรุณาลองใหม่อีกครั้ง');
      setResults([]);
      setShowResults(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Explicitly set UTF-8 for this page */}
      <Head>
        <meta charSet="UTF-8" />
        {/* Optionally, you can also add a title specific to the search page if needed */}
        {/* <title>ค้นหาเอกสาร - ระบบฐานข้อมูล...</title> */}
      </Head>

      <div className="max-w-3xl mx-auto px-4 py-5">
        {/* Header Section */}
        <div className="text-center mb-5">
          <div className="flex justify-center mb-4">
            <img
              src="https://transliteration.orst.go.th/img/royin-logo2.c03c8949.png"
              alt="สำนักงานราชบัณฑิตยสภา"
              className="h-16 w-auto"
            />
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 mb-2">
            ระบบฐานข้อมูลของสำนักงานราชบัณฑิตยสภา
          </h1>
          <p className="text-gray-600">
            สืบค้นข้อมูลแบบข้อความภาษาไทยและภาษาอังกฤษ (full text search)
          </p>
        </div>

        {/* Search Form */}
        <div className="bg-white rounded-lg shadow-md p-2 mb-5">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
            <div className="flex-grow">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ป้อนคำค้นหา..."
                className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
                aria-label="ช่องค้นหา"
              />
            </div>
            <button
              type="submit"
              className={`px-2 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors whitespace-nowrap ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  กำลังค้นหา...
                </span>
              ) : (
                'ค้นหา'
              )}
            </button>
          </form>
        </div>

        {/* Main Content Area */}
        <main>
          {/* Error Message */}
          {error && (
            <div className="mb-6 p-2 bg-red-50 border border-red-200 text-red-700 rounded-md">
              <div className="flex">
                <svg className="flex-shrink-0 h-5 w-5 text-red-400 mt-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div className="ml-3">
                  <h3 className="text-md font-bold">เกิดข้อผิดพลาด</h3>
                  <div className="mt-1 text-sm">{error}</div>
                </div>
              </div>
            </div>
          )}

          {/* Loading Indicator */}
          {loading && !error && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
              <p className="text-gray-600">กำลังค้นหาเอกสาร...</p>
            </div>
          )}

          {/* Search Results */}
          {/* Show results if showResults is true OR if loading (to keep layout stable) */}
          {(showResults || loading) && !error && (
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              {/* Results Header */}
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-base font-medium text-gray-800">
                  {query.trim() ? (
                    <>
                      ผลการค้นหา: <span className="font-semibold">{results.length}</span> รายการ สำหรับ &quot;<span className="font-semibold">{query}</span>&quot;
                    </>
                  ) : (
                    <>
                      เอกสารล่าสุด: <span className="font-semibold">{results.length}</span> รายการ
                    </>
                  )}
                </h2>
              </div>

              {/* Results List */}
              <div className="divide-y divide-gray-100">
                {loading ? (
                  <div className="p-8 flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500"></div>
                  </div>
                ) : results.length > 0 ? (
                  results.map((result) => {
                    const iconInfo = getFileIcon(result.type);
                    // Construct the viewer URL, passing the proxy URL (result.url) as a parameter
                    const viewerUrl = `/view?ossKey=${encodeURIComponent(result.url)}`;
                  
                    return (
                      <div key={result.id} className="p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start">
                          {/* File Icon */}
                          <div className={`flex-shrink-0 h-10 w-10 rounded-md flex items-center justify-center text-lg mr-4 ${iconInfo.bgColor} ${iconInfo.color}`}>
                            {iconInfo.icon}
                          </div>
                          <div className="flex-grow min-w-0">
                            {/* --- Document Title as Link to Viewer (Google-like) --- */}
                            <a
                              href={viewerUrl} // Link to viewer page, passing the proxy URL
                              className="text-xl font-medium text-blue-600 hover:text-blue-800 hover:underline block truncate"
                              title={result.name.replace(/<[^>]*>?/gm, '')} // Tooltip without HTML
                              dangerouslySetInnerHTML={{
                                __html: result.name // Use highlighted name from API
                              }}
                            />
                            {/* --- Content Preview/Snippet (Google-like styling) --- */}
                            {result.contentPreview && (
                              <p
                                className="mt-1 text-gray-700 text-sm line-clamp-5" // Smaller text, spacing, line limit
                                dangerouslySetInnerHTML={{ __html: result.contentPreview.replace(/\uFFFD/g, '').replace(/\n\n/g, ' ') }} // Use highlighted snippet from API
                              />
                            )}
                            {/* --- Document Meta Information --- */}
                            <p className="mt-1 text-xs text-gray-500">
                              {formatFileSize(result.size)} • {new Date(result.updatedAt).toLocaleDateString('th-TH')}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  // No Results Found
                  <div className="p-12 text-center">
                    <svg className="mx-auto h-12 w-12 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 className="mt-2 text-md font-bold text-gray-900">
                      {query.trim() ? 'ไม่พบผลการค้นหา' : 'ไม่พบเอกสาร'}
                    </h3>
                    <p className="mt-1 text-md text-black-500">
                      {query.trim()
                        ? `ไม่พบเอกสารที่ตรงกับคำค้นหาของคุณ "${query}"`
                        : 'ไม่มีเอกสารในระบบในขณะนี้'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}