// app/search-transliteration/page.tsx
"use client";
import { useState, useEffect } from 'react';
import Head from 'next/head';

// Mapping language names to country codes for flag display
const languageToCountryCode: Record<string, string> = {
  'อาหรับ': 'SA',
  'พม่า': 'MM',
  'จีน': 'CN',
  'อังกฤษ': 'GB',
  'ฝรั่งเศส': 'FR',
  'เยอรมัน': 'DE',
  'ฮินดี': 'IN',
  'อินโดนีเซีย': 'ID',
  'อิตาลี': 'IT',
  'ญี่ปุ่น': 'JP',
  'เกาหลี': 'KR',
  'มลายู': 'MY',
  'รัสเซีย': 'RU',
  'สเปน': 'ES',
  'เวียดนาม': 'VN',
  // Add more mappings as needed
};

// Interface for search result items
// Fields marked for highlighting should contain HTML from the API
interface TransliterationSearchResult { // ✅ PascalCase for interface name
  id: number;
  romanization: string; // Highlighted HTML
  originalScript1: string | null; // Highlighted HTML
  originalScript2: string | null; // Highlighted HTML
  language: string | null;
  wordType: string | null;
  category: string | null;
  transliteration1: string | null; // Highlighted HTML
  transliteration2: string | null; // Highlighted HTML
  otherFoundWords: string | null;
  meaning: string | null; // Highlighted HTML
  notes: string | null; // Highlighted HTML
  referenceCriteria: string | null;
  formattedPublicationDate: string | null; // Formatted date string from API
}

export default function SearchTransliterationPage() { // ✅ PascalCase for component name
  const [query, setQuery] = useState('');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [results, setResults] = useState<TransliterationSearchResult[]>([]);
  const [pagination, setPagination] = useState<any | null>(null); // Consider defining a specific type for pagination data
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load initial results on component mount
  useEffect(() => {
    loadResults();
  }, []);

  // Function to fetch search results from the API
  const fetchResults = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) {
        params.append('q', query.trim());
      }
      if (languageFilter !== 'all') {
        params.append('language', languageFilter);
      }
      params.append('page', page.toString());

      const response = await fetch(`/api/search-transliteration?${params.toString()}`);
      if (!response.ok) {
        let errorMsg = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch (e) {
          // Ignore JSON parse error for error message
        }
        throw new Error(errorMsg);
      }
      const data = await response.json();
      setResults(data.results || []);
      setPagination(data.pagination || null); // Store pagination data
    } catch (err) {
      console.error("Search transliteration error:", err);
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการค้นหาคำศัพท์ กรุณาลองใหม่อีกครั้ง');
      setResults([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  };

  // Wrapper function to load results, defaulting to page 1
  const loadResults = async (page = 1) => {
    await fetchResults(page);
  };

  // Handle form submission for search
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    // Reset to first page on new search
    await loadResults(1);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <meta charSet="UTF-8" />
        <title>ระบบฐานข้อมูลคำทับศัพท์ - สำนักงานราชบัณฑิตยสภา</title>
      </Head>

      {/* Header */}
      <header className="bg-blue-600 text-white p-4 flex items-center justify-between">
        <div className="flex items-center">
          <img
            src="https://transliteration.orst.go.th/img/royin-logo2.c03c8949.png"
            alt="สำนักงานราชบัณฑิตยสภา"
            // style={{ backgroundColor: 'white' }} // Not typically needed for logos
            className="h-10 w-10 mr-2 bg-white" // Moved background color to className
          />
          <h1 className="text-xl font-bold">ระบบฐานข้อมูลคำทับศัพท์ของสำนักงานราชบัณฑิตยสภา</h1>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Flag_of_the_United_Kingdom.svg/1280px-Flag_of_the_United_Kingdom.svg.png" alt="English Flag" className="h-6 w-6" />
            <span>English</span>
          </div>
          <div className="flex items-center space-x-2">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Flag_of_Thailand.svg/1280px-Flag_of_Thailand.svg.png" alt="Thai Flag" className="h-6 w-6" />
            <span>ภาษาไทย</span>
          </div>
          <div className="flex items-center space-x-2">
            <span>ขยาย</span>
            <button>-</button>
            <span>100%</span>
            <button>+</button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        <h2 className="text-3xl font-bold mb-4 text-center">ค้นหาคำทับศัพท์ (Transliteration)</h2>

        {/* Google-like Search Form */}
        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex items-center border border-gray-300 rounded-full px-4 py-3 shadow-sm hover:shadow-md focus-within:shadow-md transition-shadow duration-200 ease-in-out max-w-3xl mx-auto">
            {/* Language Dropdown - Integrated inside the search bar */}
            <div className="relative mr-2">
              <select
                value={languageFilter}
                onChange={(e) => setLanguageFilter(e.target.value)}
                className="bg-transparent border-none focus:ring-0 focus:outline-none text-md appearance-none pr-4 cursor-pointer"
                // Style the select to remove default browser styling
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' strokeLinecap='round' strokeLinejoin='round' strokeWidth='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.5rem center',
                  backgroundSize: '16px 16px',
                }}
              >
                <option value="all">ทุกภาษา</option>
                <option value="อาหรับ">อาหรับ</option>
                <option value="พม่า">พม่า</option>
                <option value="จีน">จีน</option>
                <option value="อังกฤษ">อังกฤษ</option>
                <option value="ฝรั่งเศส">ฝรั่งเศส</option>
                <option value="เยอรมัน">เยอรมัน</option>
                <option value="ฮินดี">ฮินดี</option>
                <option value="อินโดนีเซีย">อินโดนีเซีย</option>
                <option value="อิตาลี">อิตาลี</option>
                <option value="ญี่ปุ่น">ญี่ปุ่น</option>
                <option value="เกาหลี">เกาหลี</option>
                <option value="มลายู">มลายู</option>
                <option value="รัสเซีย">รัสเซีย</option>
                <option value="สเปน">สเปน</option>
                <option value="เวียดนาม">เวียดนาม</option>
              </select>
            </div>

            {/* Divider Line */}
            <div className="h-6 border-l border-gray-300 mr-3"></div>

            {/* Search Input */}
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ระบุคำทับศัพท์"
              className="flex-grow border-none focus:ring-0 focus:outline-none text-base"
              aria-label="ช่องค้นหาคำศัพท์"
            />

            {/* Search Button */}
            <button
              type="submit"
              className="ml-2 p-1 text-gray-500 hover:text-blue-500 focus:outline-none"
              aria-label="ค้นหา"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                <path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5ZM2.25 10.5a8.25 8.25 0 1 1 14.59 5.28l4.69 4.69a.75.75 0 1 1-1.06 1.06l-4.69-4.69A8.25 8.25 0 0 1 2.25 10.5Z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </form>

        {/* Loading Indicator */}
        {loading && !error && (
          <div className="flex flex-col justify-center items-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 mb-4"></div>
            <p className="text-gray-600">กำลังค้นหาคำศัพท์...</p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-800 px-4 py-3 rounded relative" role="alert">
            <strong className="font-bold">เกิดข้อผิดพลาด:</strong> {error}
          </div>
        )}

        {/* Results Display */}
        {!loading && !error && (
          <div>
            {results.length > 0 ? (
              <div>
                <h3 className="text-lg font-bold mb-4">ผลการค้นหาคำทับศัพท์</h3>
                <div className="space-y-4">
                  {results.map((result) => (
                    <div key={result.id} className="border p-4 rounded shadow hover:shadow-md transition-shadow">
                      {/* Display language with flag */}
                      <div className="flex items-center mb-1">
                        {result.language && (
                          <>
                            {/* Attempt to get country code, fallback to generic globe icon if not found */}
                            {languageToCountryCode[result.language] ? (
                              <span className={`fi fi-${languageToCountryCode[result.language]?.toLowerCase()} mr-2 text-sm`}></span>
                            ) : (
                              <span className="mr-2 text-sm">🌐</span>
                            )}
                            <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded">
                              {result.language}
                            </span>
                          </>
                        )}
                        {result.wordType && (
                          <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded ml-2">
                            {result.wordType}
                          </span>
                        )}
                        {result.category && (
                          <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded ml-2">
                            {result.category}
                          </span>
                        )}
                      </div>

                      {/* Display Original Script (Highlighted) */}
                      {result.originalScript1 && (
                        <div
                          className="text-xl font-bold mb-1"
                          // ✅ Use dangerouslySetInnerHTML for highlighted text
                          dangerouslySetInnerHTML={{ __html: result.originalScript1 }}
                        />
                      )}

                      {/* Display Romanization */}
                      {result.romanization && (
                        <p className="text-base font-medium text-gray-800 mb-1">{result.romanization}</p>
                      )}

                      {/* Display Transliteration (Highlighted) */}
                      {result.transliteration1 && (
                        <div
                          className="text-base text-gray-700 mb-1"
                          // ✅ Use dangerouslySetInnerHTML for highlighted text
                          dangerouslySetInnerHTML={{ __html: result.transliteration1 }}
                        />
                      )}

                      {/* Display Meaning (Highlighted) */}
                      {result.meaning && (
                        <div
                          className="text-base text-gray-900 mb-2"
                          // ✅ Use dangerouslySetInnerHTML for highlighted text
                          dangerouslySetInnerHTML={{ __html: result.meaning }}
                        />
                      )}

                      {/* Display Notes (Highlighted) */}
                      {result.notes && (
                        <div
                          className="text-sm text-gray-600 italic"
                          // ✅ Use dangerouslySetInnerHTML for highlighted text
                          dangerouslySetInnerHTML={{ __html: result.notes }}
                        />
                      )}

                      {/* Display Other Found Words */}
                      {result.otherFoundWords && (
                        <p className="text-xs text-gray-500 mt-2">
                          <span className="font-medium">พบเพิ่มเติม:</span> {result.otherFoundWords}
                        </p>
                      )}

                      {/* Display Reference Criteria */}
                      {result.referenceCriteria && (
                        <p className="text-xs text-gray-500 mt-1">
                          <span className="font-medium">เกณฑ์อ้างอิง:</span> {result.referenceCriteria}
                        </p>
                      )}

                      {/* Display Formatted Publication Date */}
                      {result.formattedPublicationDate && (
                        <p className="text-xs text-gray-500 mt-1">
                          <span className="font-medium">วันที่ประกาศ:</span> {result.formattedPublicationDate}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* TODO: Implement Pagination Controls */}
                {/* Example placeholder for pagination (requires API support) */}
                {/* {pagination && (
                  <div className="flex justify-between items-center mt-6">
                    <button
                      onClick={() => loadResults(pagination.prevPage)}
                      disabled={!pagination.hasPrevPage}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded disabled:opacity-50"
                    >
                      ก่อนหน้า
                    </button>
                    <span className="text-sm text-gray-600">
                      หน้า {pagination.currentPage} จาก {pagination.totalPages}
                    </span>
                    <button
                      onClick={() => loadResults(pagination.nextPage)}
                      disabled={!pagination.hasNextPage}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded disabled:opacity-50"
                    >
                      ถัดไป
                    </button>
                  </div>
                )} */}
              </div>
            ) : (
              // No Results Found State
              <div className="p-12 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="mt-2 text-md font-bold text-gray-900">ไม่พบผลการค้นหา</h3>
                <p className="mt-1 text-md text-gray-500"> {/* ✅ Changed text-black-500 to text-gray-500 */}
                  ไม่พบคำศัพท์ที่ตรงกับเงื่อนไขการค้นหาของคุณ
                  {query && (
                    <>
                      {" \""}
                      <span className="font-semibold">{query}</span>
                      {"\""}
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}