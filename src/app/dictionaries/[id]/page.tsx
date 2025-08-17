// app/dictionaries/[id]/page.tsx (Updated version)
"use client";
import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useSearchParams, useRouter, useParams } from 'next/navigation';
// --- Import the new modal component ---
import EditEntryModal from './components/EditEntryModal';
// --- End Import modal component ---

// Map language names to country codes for flags (if needed)
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
};

// Interface for DictionaryEntry results from the API
interface DictionaryEntryResult {
  id: number;
  term_th: string | null;
  term_en: string | null;
  definition_html: string | null;
  specializedDictionaryId: number;
  SpecializedDictionary: {
    title: string;
    category: string;
    subcategory: string | null;
  };
  created_at: string;
  updated_at: string;
  // --- Added version field ---
  version: number;
  // --- End added fields ---
}

// Interface for the specific dictionary details (for breadcrumb)
interface SpecializedDictionaryDetails {
  id: number;
  title: string;
  category: string;
  subcategory: string | null;
}

export default function SearchDictionaryPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const dictionaryIdParam = params.id;
  const dictionaryId = dictionaryIdParam === '0' || isNaN(Number(dictionaryIdParam)) ? 0 : Number(dictionaryIdParam);
  const isAllDictionaries = dictionaryId === 0;
  const initialQuery = searchParams.get('q') || '';
  const initialLanguageFilter = searchParams.get('language') || 'all';
  const [query, setQuery] = useState(initialQuery);
  const [languageFilter, setLanguageFilter] = useState(initialLanguageFilter);
  const [results, setResults] = useState<DictionaryEntryResult[]>([]);
  const [pagination, setPagination] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dictionaryDetails, setDictionaryDetails] = useState<SpecializedDictionaryDetails | null>(null);
  const [dictLoading, setDictLoading] = useState(false);
  const [dictError, setDictError] = useState<string | null>(null);

  // --- State for Selected Row ---
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  // --- End Selected Row State ---

  // --- Modal State (Simplified) ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<DictionaryEntryResult | null>(null);
  // Removed editFormData, editorContent, saving, saveError, version states - managed by the modal component
  // --- End Simplified Modal State ---

  const fetchResults = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (!isAllDictionaries) {
        params.append('dictionaryId', dictionaryId.toString());
      }
      if (query.trim()) {
        params.append('q', query.trim());
      }
      if (languageFilter !== 'all') {
        params.append('language', languageFilter);
      }
      params.append('page', page.toString());
      const apiUrl = `/api/search-dictionary?${params.toString()}`;
      const response = await fetch(apiUrl);
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
      setPagination(data.pagination || null);
    } catch (err) {
      console.error("Search Dictionary error:", err);
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการค้นหาคำศัพท์ กรุณาลองใหม่อีกครั้ง');
      setResults([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchDictionaryDetails = async () => {
    if (isAllDictionaries || dictionaryId === 0) {
        setDictionaryDetails(null);
        return;
    }
    setDictLoading(true);
    setDictError(null);
    try {
        const response = await fetch(`/api/dictionaries?id=${dictionaryId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.length > 0) {
            setDictionaryDetails(data[0]);
        } else {
            setDictError('ไม่พบข้อมูลพจนานุกรมที่ระบุ');
            setDictionaryDetails(null);
        }
    } catch (err) {
        console.error("Fetch Dictionary Details error:", err);
        setDictError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูลพจนานุกรม');
        setDictionaryDetails(null);
    } finally {
        setDictLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const newParams = new URLSearchParams();
    if (query.trim()) newParams.set('q', query.trim());
    if (languageFilter !== 'all') newParams.set('language', languageFilter);
    router.push(`/dictionaries/${dictionaryId}?${newParams.toString()}`);
  };

  // --- Simplified Modal Functions ---
  const openEditModal = (entry: DictionaryEntryResult) => {
    setSelectedEntry(entry);
    // --- Set the clicked row as selected ---
    setSelectedRowId(entry.id);
    // ---
    setIsModalOpen(true);
  };

  const closeEditModal = () => {
    setIsModalOpen(false);
    setSelectedEntry(null);
    // --- Clear selected row when modal closes ---
    setSelectedRowId(null);
    // ---
  };

  // Function to handle successful update from the modal
  const handleUpdateSuccess = (updatedEntry: DictionaryEntryResult) => {
    // Update the results list optimistically
    setResults(prevResults =>
        prevResults.map(item =>
            item.id === updatedEntry.id ? { ...item, ...updatedEntry } : item
        )
    );
    // Optionally, update selectedEntry if it's the same one (though modal closes)
    // if (selectedEntry && selectedEntry.id === updatedEntry.id) {
    //   setSelectedEntry(updatedEntry);
    // }
  };
  // --- End Simplified Modal Functions ---

  useEffect(() => {
    setQuery(initialQuery);
    setLanguageFilter(initialLanguageFilter);
    fetchResults(1);
  }, [dictionaryIdParam, initialQuery, initialLanguageFilter]);

  useEffect(() => {
    fetchDictionaryDetails();
  }, [dictionaryId]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <meta charSet="UTF-8" />
        <title>
            {isAllDictionaries
              ? 'ค้นหาคำศัพท์ทั้งหมด'
              : (dictionaryDetails
                  ? `${dictionaryDetails.title} - ${dictionaryDetails.category}${dictionaryDetails.subcategory ? ` - ${dictionaryDetails.subcategory}` : ''}`
                  : `กำลังโหลดข้อมูล`)
            } - ระบบฐานข้อมูลคำศัพท์
        </title>
      </Head>
      <header className="bg-blue-600 text-white p-4 flex items-center justify-between">
        <div className="flex items-center">
          <img
            src="https://transliteration.orst.go.th/img/royin-logo2.c03c8949.png"
            alt="สำนักงานราชบัณฑิตยสภา"
            className="h-10 w-10 mr-2 bg-white"
          />
          <h1 className="text-xl font-bold">ระบบฐานข้อมูลคำศัพท์ของสำนักงานราชบัณฑิตยสภา</h1>
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
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="text-sm text-gray-500 mb-4">
          <Link href="/" className="hover:underline">หน้าหลัก</Link>{' '}
          <Link href="/dictionaries" className="hover:underline">พจนานุกรมเฉพาะสาขาวิชา</Link>{' '}
          {dictLoading ? (
            <span>กำลังโหลดข้อมูล</span>
          ) : dictError ? (
            <span className="text-red-500">ข้อผิดพลาด: {dictError}</span>
          ) : dictionaryDetails ? (
            <>
              <span className="font-medium text-gray-700">{dictionaryDetails.title}</span>{' '}
              <span className="font-medium text-gray-700">{dictionaryDetails.category}</span>
              {dictionaryDetails.subcategory && (
                <> <span className="font-medium text-gray-700">{dictionaryDetails.subcategory}</span></>
              )}
            </>
          ) : (
            <span>{isAllDictionaries ? 'ค้นหาทั้งหมด' : `กำลังโหลดข้อมูล`}</span>
          )}
        </nav>
        <h2 className="text-3xl font-bold mb-4 text-center">
          {isAllDictionaries
            ? 'ค้นหาคำศัพท์ทั้งหมด'
            : (dictLoading
                ? 'กำลังโหลดข้อมูล'
                : dictError
                    ? `ข้อผิดพลาด: ${dictError}`
                    : (dictionaryDetails
                        ? `${dictionaryDetails.title} (${dictionaryDetails.category}${dictionaryDetails.subcategory ? ` - ${dictionaryDetails.subcategory}` : ''})`
                        : `กำลังโหลดข้อมูล`)
               )
          }
        </h2>
        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex items-center border border-gray-300 rounded-full px-4 py-3 shadow-sm hover:shadow-md focus-within:shadow-md transition-shadow duration-200 ease-in-out max-w-3xl mx-auto">
            <div className="relative mr-2">
              <select
                value={languageFilter}
                onChange={(e) => setLanguageFilter(e.target.value)}
                className="bg-transparent border-none focus:ring-0 focus:outline-none text-md appearance-none pr-4 cursor-pointer"
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
            <div className="h-6 border-l border-gray-300 mr-3"></div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ระบุคำศัพท์"
              className="flex-grow border-none focus:ring-0 focus:outline-none text-base"
              aria-label="ช่องค้นหาคำศัพท์"
            />
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
        {loading && !error && (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 mb-4"></div>
            <p className="text-gray-600">กำลังโหลดข้อมูล</p>
          </div>
        )}
        {!loading && !error && (
          <div>
            {results.length > 0 ? (
              <div>
                {Object.entries(
                  results.reduce((acc, entry) => {
                    const key = (entry.term_en?.[0] || entry.term_th?.[0] || '').toUpperCase();
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(entry);
                    return acc;
                  }, {} as Record<string, typeof results>)
                )
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([letter, group]) => (
                  <section key={letter} className="mb-8">
                    <div className="flex items-center mb-2">
                      <span
                        className="font-bold"
                        style={{
                          fontSize: '2rem',
                          color: '#B3186D',
                          fontFamily: 'Tahoma, sans-serif'
                        }}
                      >
                        {letter}
                      </span>
                      <span
                        className="ml-4 font-bold"
                        style={{
                          fontSize: '1.3rem',
                          color: '#B3186D',
                          fontFamily: '"TH SarabunPSK", sans-serif'
                        }}
                      >
                        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                      </span>
                    </div>
                    {group.map((entry) => (
                      <div
                        key={entry.id}
                        // --- Apply base border and selected style ---
                        className={`mb-4 p-3 rounded transition-colors duration-150 relative cursor-pointer
                                   ${selectedRowId === entry.id
                                      ? 'border-2 border-blue-500 bg-blue-50' // Selected style
                                      : 'border border-transparent hover:border-gray-300' // Base + hover style
                                   }`}
                        // ---
                        onClick={() => openEditModal(entry)} // Open modal on click
                      >
                        {/* Breadcrumb for individual entry (if showing all dictionaries) */}
                        {isAllDictionaries && entry.SpecializedDictionary && (
                          <div className="text-xs text-gray-500 mb-1 text-right">
                            {entry.SpecializedDictionary.title} | {entry.SpecializedDictionary.category}
                            {entry.SpecializedDictionary.subcategory && ` | ${entry.SpecializedDictionary.subcategory}`}
                          </div>
                        )}
                        <div style={{ marginLeft: 30, textIndent: -30 }}>
                          <b>
                            <span
                              style={{
                                fontSize: '1.3rem',
                                color: '#B3186D',
                                fontFamily: '"TH SarabunPSK", sans-serif'
                              }}
                            >
                              {entry.term_en || ''}
                            </span>
                            &nbsp;&nbsp;
                            <span
                              style={{
                                fontSize: '1.3rem',
                                color: '#B3186D',
                                fontFamily: '"TH SarabunPSK", sans-serif'
                              }}
                            >
                              {entry.term_th || ''}
                            </span>
                          </b>
                        </div>
                        {entry.definition_html && (
                          <div
                            style={{ marginLeft: 43 }}
                            className="mt-1"
                            dangerouslySetInnerHTML={{ __html: entry.definition_html }}
                          />
                        )}
                        {/* Version and Updated Info - Bottom Right */}
                        {/* --- Updated display to include version and time --- */}
                        <div className="absolute bottom-1 right-2 text-xs text-gray-500">
                          เวอร์ชัน ({entry.version}) : แก้ไขล่าสุดเมื่อ {new Date(entry.updated_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}
                        </div>
                        {/* --- End updated display --- */}
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="mt-2 text-md font-bold text-gray-900">ไม่พบผลการค้นหา</h3>
                <p className="mt-1 text-md text-black-500">
                  {query
                    ? `ไม่พบคำศัพท์ที่ตรงกับ "${query}"${isAllDictionaries ? '' : ` ในพจนานุกรมนี้`}`
                    : `ไม่พบคำศัพท์${isAllDictionaries ? '' : ` ในพจนานุกรมนี้`}`}
                </p>
              </div>
            )}
          </div>
        )}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-800 px-4 py-3 rounded relative" role="alert">
            <strong className="font-bold">เกิดข้อผิดพลาด: </strong>
            <span className="block sm:inline">{error}</span>
          </div>
        )}
      </main>

      {/* --- Use the new EditEntryModal component --- */}
      <EditEntryModal
        isOpen={isModalOpen}
        onClose={closeEditModal}
        entry={selectedEntry}
        onUpdateSuccess={handleUpdateSuccess}
      />
      {/* --- End new EditEntryModal component --- */}
    </div>
  );
}