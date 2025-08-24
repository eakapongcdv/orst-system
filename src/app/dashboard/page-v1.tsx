// app/dashboard/page.tsx
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string; // e.g., 'USER', 'ADMIN'
}

// --- Updated Interface ---
interface DocumentStats {
  totalDocuments: number;
  totalSize: number; // in bytes
  recentActivityCount: number;
  sharedDocuments: number;
  totalVocabularyEntries: number; // Added this field
  // --- Added new stats based on schema ---
  totalDictionaries: number;
  totalEncyclopedias: number;
  totalTaxonomies: number;
  totalGazetteerEntries: number;
}

interface RecentDocument {
  id: number;
  name: string;
  type: string;
  size: number; // in bytes
  url: string;
  description: string;
  updatedAt: string;
}

// --- Interface for Specialized Dictionaries ---
interface SpecializedDictionary {
  id: number;
  title: string;
  category: string;
  subcategory: string | null;
  year_published: number | null;
  created_at: string;
  updated_at: string;
}

// --- Interface for grouped dictionaries ---
interface DictionaryCategory {
  name: string;
  subcategories: {
    name: string | null;
    dictionaries: SpecializedDictionary[];
  }[];
}

// --- Popular search item (from /api/search/popular) ---
interface PopularItem { query: string; count: number }

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<DocumentStats | null>(null);
  const [recentDocuments, setRecentDocuments] = useState<RecentDocument[]>([]);
  // --- State for Specialized Dictionaries ---
  const [dictionaries, setDictionaries] = useState<SpecializedDictionary[]>([]);
  // --- State for grouped dictionaries ---
  const [groupedDictionaries, setGroupedDictionaries] = useState<DictionaryCategory[]>([]);
  // --- Stats for vocabulary by type ---
  const [entryCounts, setEntryCounts] = useState<{ dict: number; translit: number; taxon: number }>({ dict: 0, translit: 0, taxon: 0 });
  // --- Popular searches per dictionary group ---
  const [popularDict0, setPopularDict0] = useState<PopularItem[]>([]);
  const [popularDict3, setPopularDict3] = useState<PopularItem[]>([]);
  const [popularUniversal, setPopularUniversal] = useState<PopularItem[]>([]);
  // --- State to track which panel to show ---
  const [activePanel, setActivePanel] = useState<'recent' | 'all'>('recent'); // Default to 'recent'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // --- JSON fetch helper (robust) ---
  async function fetchJson(url: string) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  // Normalize popular search list payload into PopularItem[]
  function normalizePopularList(raw: any): PopularItem[] {
    if (!raw) return [];
    const arr = Array.isArray(raw?.items) ? raw.items : (Array.isArray(raw) ? raw : []);
    return arr.map((x: any) => ({
      query: x?.query ?? x?.queryOriginal ?? x?.queryNormalized ?? '',
      count: Number(x?.count ?? x?.value ?? 0),
    })).filter((x: PopularItem) => x.query);
  }

  useEffect(() => {
    // Load counts for each vocabulary type
    const loadEntryCounts = async (dictCountFromStats: number) => {
      try {
        // 1) Dictionary entries count: from stats provided
        let dictCount = dictCountFromStats || 0;

        // 2) TransliterationEntry count
        let translitCount = 0;
        const tl = await fetchJson('/api/admin/transliteration?take=1');
        translitCount = tl?.total ?? tl?.pagination?.total ?? tl?.count ?? 0;

        // 3) TaxonEntry count (global search with pageSize=1 to get pagination meta)
        let taxonCount = 0;
        const tx = await fetchJson('/api/taxonomy/search?page=1&pageSize=1');
        taxonCount = tx?.pagination?.total ?? tx?.total ?? 0;

        setEntryCounts({ dict: Number(dictCount) || 0, translit: Number(translitCount) || 0, taxon: Number(taxonCount) || 0 });
      } catch {
        // best-effort
      }
    };

    // Load popular searches per dictionary group (0: general, 3: specialized)
    const loadPopularByGroup = async () => {
      // try grouped first
      const p0 = await fetchJson('/api/search/popular?dictionaryId=0&limit=10');
      const p3 = await fetchJson('/api/search/popular?dictionaryId=3&limit=10');

      const list0 = normalizePopularList(p0);
      const list3 = normalizePopularList(p3);

      // If API doesn't provide grouped, fallback to universal
      if (list0.length === 0 && list3.length === 0) {
        const pu = await fetchJson('/api/search/popular?limit=12');
        setPopularUniversal(normalizePopularList(pu).slice(0, 10));
      } else {
        setPopularDict0(list0);
        setPopularDict3(list3);
      }
    };

    const fetchDashboardData = async () => {
      try {
        // Check if user is logged in
        const userData = localStorage.getItem("user");
        if (!userData) {
          console.warn("No user data in localStorage, redirecting to login");
          router.push("/login");
          return;
        }
        let parsedUser: User;
        try {
          parsedUser = JSON.parse(userData);
        } catch (parseError) {
          console.error("Error parsing user data from localStorage:", parseError);
          router.push("/login");
          return;
        }
        setUser(parsedUser);

        // --- Fetch dashboard data from API ---
        const response = await fetch('/api/dashboard');
        if (!response.ok) {
          let errorMessage = `HTTP error! status: ${response.status}`;
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || `API Error: ${response.status} ${response.statusText}`;
          } catch (jsonError) {
            console.warn("Could not parse error response JSON:", jsonError);
          }
          throw new Error(errorMessage);
        }
        const data = await response.json();
        setStats(data.stats);
        setRecentDocuments(data.recentDocuments);
        setError(null);
        // Kick off dependent loads (best-effort)
        void loadEntryCounts(data?.stats?.totalVocabularyEntries || 0);
        void loadPopularByGroup();
      } catch (err) {
        console.error("Error fetching dashboard ", err);
        const displayMessage = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูลแดชบอร์ด';
        setError(displayMessage);
      } finally {
        setLoading(false);
      }
    };

    // --- Fetch Specialized Dictionaries separately ---
    const fetchDictionaries = async () => {
      try {
        const res = await fetch('/api/dictionaries'); // Fetch all dictionaries
        if (!res.ok) {
          console.error("Failed to fetch dictionaries", res.status, res.statusText);
          return;
        }

        // Normalize payload to an array shape before grouping
        const raw: unknown = await res.json();
        const dictArray: SpecializedDictionary[] = Array.isArray(raw)
          ? raw as SpecializedDictionary[]
          : Array.isArray((raw as any)?.data)
            ? (raw as any).data as SpecializedDictionary[]
            : Array.isArray((raw as any)?.items)
              ? (raw as any).items as SpecializedDictionary[]
              : [];

        if (dictArray.length === 0 && raw && !Array.isArray(raw)) {
          console.warn('Unexpected /api/dictionaries payload shape; expected array. Got:', raw);
        }

        setDictionaries(dictArray);

        // --- Group dictionaries by category and subcategory with safe fallbacks ---
        const grouped: Record<string, Record<string, SpecializedDictionary[]>> = {};

        dictArray.forEach((dict) => {
          const categoryKey = (dict.category ?? 'ไม่ระบุหมวด') as string;
          const subcategoryKey = (dict.subcategory ?? 'Uncategorized') as string;

          if (!grouped[categoryKey]) {
            grouped[categoryKey] = {};
          }
          if (!grouped[categoryKey][subcategoryKey]) {
            grouped[categoryKey][subcategoryKey] = [];
          }
          grouped[categoryKey][subcategoryKey].push(dict);
        });

        // Convert grouped object to array structure for easier rendering
        const groupedArray: DictionaryCategory[] = Object.entries(grouped).map(([categoryName, subcats]) => ({
          name: categoryName,
          subcategories: Object.entries(subcats).map(([subcatName, dicts]) => ({
            name: subcatName === 'Uncategorized' && !dicts[0]?.subcategory ? null : subcatName,
            dictionaries: dicts
          }))
        }));

        setGroupedDictionaries(groupedArray);
      } catch (err) {
        console.error("Error fetching dictionaries:", err);
      }
    };

    fetchDashboardData();
    fetchDictionaries();
  }, [router]);

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // --- Function to handle panel change ---
  const handlePanelChange = (panel: 'recent' | 'all') => {
    setActivePanel(panel);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <svg className="animate-spin h-10 w-10 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="mt-4 text-gray-600">กำลังโหลดข้อมูลแดชบอร์ด...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-6 bg-red-50 rounded-lg max-w-md">
          <div className="flex justify-center">
            <svg className="h-12 w-12 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-medium text-red-800">เกิดข้อผิดพลาด</h3>
          <p className="mt-2 text-md text-red-700 break-words">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-md font-bold rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            ลองใหม่อีกครั้ง
          </button>
        </div>
      </div>
    );
  }

  if (!user || !stats) {
     return null;
  }

  return (
    <div className="min-h-screen page page--dashboard">
      <div className="max-w-7xl mx-auto px-4 sm:px-2 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8 page-header">
          <h1 className="page-title">แดชบอร์ด</h1>
          <p className="page-subtitle">
            สวัสดี, {user.firstName} {user.lastName} • บทบาท: {user.role === "ADMIN" ? "ผู้ดูแลระบบ" : "ผู้ใช้งาน"}
          </p>
        </div>

        {/* Stats Cards - Updated Grid Layout and Added New Cards */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
  
          {/* Vocabulary Entries Card - New Card Added */}
          <div className="card overflow-hidden">
            <div className="card-body">
              <div className="flex items-center">
                <div className="flex-shrink-0 brand-chip">
                  <svg className="h-6 w-6 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-md font-bold text-gray-600 truncate">คำศัพท์ทั้งหมด</dt>
                    <dd className="flex items-baseline">
                      <div className="text-2xl font-semibold text-gray-900">{stats.totalVocabularyEntries}</div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

           {/* Dictionaries Card - New Card Added */}
           <div className="card overflow-hidden">
            <div className="card-body">
              <div className="flex items-center">
                <div className="flex-shrink-0 brand-chip">
                  <svg className="h-6 w-6 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <Link href="/admin/dictionary">
                    <dl>
                      <dt className="text-md font-bold text-gray-600 truncate">พจนานุกรม</dt>
                      <dd className="flex items-baseline">
                        <div className="text-2xl font-semibold text-gray-900">{stats.totalDictionaries}</div>
                      </dd>
                    </dl>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Encyclopedias Card - New Card Added */}
          <div className="card overflow-hidden">
            <div className="card-body">
              <div className="flex items-center">
                <div className="flex-shrink-0 brand-chip">
                  <svg className="h-6 w-6 text-teal-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <Link href="/admin/taxonomy">
                    <dl>
                      <dt className="text-md font-bold text-gray-600 truncate">สารานุกรม</dt>
                      <dd className="flex items-baseline">
                        <div className="text-2xl font-semibold text-gray-900">{stats.totalEncyclopedias}</div>
                      </dd>
                    </dl>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Taxonomies Card - New Card Added */}
          <div className="card overflow-hidden">
            <div className="card-body">
              <div className="flex items-center">
                <div className="flex-shrink-0 brand-chip">
                  <svg className="h-6 w-6 text-pink-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <Link href="/admin/taxonomy">
                    <dl>
                      <dt className="text-md font-bold text-gray-600 truncate">อนุกรมวิธาน</dt>
                      <dd className="flex items-baseline">
                        <div className="text-2xl font-semibold text-gray-900">{stats.totalTaxonomies}</div>
                      </dd>
                    </dl>
                  </Link>
                </div>
              </div>
            </div>
          </div>

               {/* Taxonomies Card - New Card Added */}
          <div className="card overflow-hidden">
            <div className="card-body">
              <div className="flex items-center">
                <div className="flex-shrink-0 brand-chip">
                  <svg className="h-6 w-6 text-pink-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <Link href="/admin/taxonomy">
                    <dl>
                      <dt className="text-md font-bold text-gray-600 truncate">คำทับศัพท์</dt>
                      <dd className="flex items-baseline">
                        <div className="text-2xl font-semibold text-gray-900">{stats.totalTaxonomies}</div>
                      </dd>
                    </dl>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Gazetteer Entries Card - New Card Added */}
          <div className="card overflow-hidden">
            <div className="card-body">
              <div className="flex items-center">
                <div className="flex-shrink-0 brand-chip">
                  <svg className="h-6 w-6 text-orange-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <Link href="/admin/gazetteer">
                    <dl>
                      <dt className="text-md font-bold text-gray-600 truncate">อักษรานุกรมภูมิศาสตร์</dt>
                      <dd className="flex items-baseline">
                        <div className="text-2xl font-semibold text-gray-900">{stats.totalGazetteerEntries}</div>
                      </dd>
                    </dl>
                  </Link>
                </div>
              </div>
            </div>
          </div>

         

          {/* Shared Documents Card */}
          <div className="card overflow-hidden">
            <div className="card-body">
              <div className="flex items-center">
                <div className="flex-shrink-0 brand-chip">
                  <svg className="h-6 w-6 text-yellow-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <Link href="/open-api/dashboard">
                    <dl>
                      <dt className="text-md font-bold text-gray-600 truncate">Open APIs</dt>
                      <dd className="flex items-baseline">
                        <div className="text-2xl font-semibold text-gray-900">{stats.sharedDocuments}</div>
                      </dd>
                    </dl>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Storage Card */}
          <div className="card overflow-hidden">
            <div className="card-body">
              <div className="flex items-center">
                <div className="flex-shrink-0 brand-chip">
                  <svg className="h-6 w-6 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-md font-bold text-gray-600 truncate">พื้นที่จัดเก็บ</dt>
                    <dd className="flex items-baseline">
                      <div className="text-2xl font-semibold text-gray-900">{formatFileSize(stats.totalSize)}</div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Documents / Dictionaries Panel */}
          <div className="lg:col-span-2">
            <div className="card overflow-hidden">
              {/* Panel Header with Tabs */}
              <div className="card-header">
                <div className="flex space-x-4">
                  <button
                    onClick={() => handlePanelChange('recent')}
                    className={`btn-secondary btn--sm ${activePanel === 'recent' ? 'btn-primary' : ''}`}
                  >
                    สถิติคำศัพท์
                  </button>
                  <button
                    onClick={() => handlePanelChange('all')}
                    className={`btn-secondary btn--sm ${activePanel === 'all' ? 'btn-primary' : ''}`}
                  >
                    พจนานุกรม (35 เล่ม)
                  </button>
                </div>
              </div>

              <div className="card-body">
                {/* Conditional Rendering based on activePanel */}
                {activePanel === 'recent' ? (
                  // --- Vocabulary Overview & Popular Searches ---
                  <>
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">ภาพรวมคำศัพท์ &amp; คำค้นหายอดนิยม</h3>

                    {/* Simple Bar Chart (CSS-based) */}
                    <div className="mb-6">
                      <div className="text-md font-bold text-gray-800 mb-2">จำนวนคำศัพท์ตามประเภท</div>
                      {(() => {
                        const items = [
                          { label: 'พจนานุกรม', key: 'dict', value: entryCounts.dict, color: 'bg-blue-500' },
                          { label: 'คำทับศัพท์', key: 'translit', value: entryCounts.translit, color: 'bg-green-500' },
                          { label: 'อนุกรมวิธาน', key: 'taxon', value: entryCounts.taxon, color: 'bg-purple-500' },
                        ];
                        const maxVal = Math.max(1, ...items.map(i => i.value || 0));
                        return (
                          <div className="space-y-3">
                            {items.map((it) => {
                              const pct = Math.round(((it.value || 0) / maxVal) * 100);
                              return (
                                <div key={it.key}>
                                  <div className="flex justify-between text-md text-gray-700 mb-1">
                                    <span>{it.label}</span>
                                    <span className="font-bold text-gray-900">{(it.value || 0).toLocaleString()}</span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                                    <div className={`${it.color} h-3`} style={{ width: `${pct}%` }} aria-label={`${it.label} ${it.value} รายการ`} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Popular Searches */}
                    <div>
                      <div className="text-md font-bold text-gray-800 mb-2">คำค้นหายอดนิยม</div>
                      {/* If grouped lists are available, show two columns; otherwise show a single universal column */}
                      {(popularDict0.length > 0 || popularDict3.length > 0) ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {popularDict0.length > 0 && (
                            <div className="border border-gray-200 rounded-md p-3">
                              <div className="font-semibold text-gray-700 mb-2">พจนานุกรม (ทั่วไป)</div>
                              <ol className="list-decimal list-inside space-y-1">
                                {popularDict0.map((p) => (
                                  <li key={`p0-${p.query}`} className="flex justify-between text-md">
                                    <span className="truncate mr-2">{p.query}</span>
                                    <span className="text-gray-600">{p.count}</span>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}
                          {popularDict3.length > 0 && (
                            <div className="border border-gray-200 rounded-md p-3">
                              <div className="font-semibold text-gray-700 mb-2">พจนานุกรม (เฉพาะสาขา)</div>
                              <ol className="list-decimal list-inside space-y-1">
                                {popularDict3.map((p) => (
                                  <li key={`p3-${p.query}`} className="flex justify-between text-md">
                                    <span className="truncate mr-2">{p.query}</span>
                                    <span className="text-gray-600">{p.count}</span>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="border border-gray-200 rounded-md p-3">
                          <div className="font-semibold text-gray-700 mb-2">รวม</div>
                          {popularUniversal.length === 0 ? (
                            <div className="text-black">ยังไม่มีข้อมูลคำค้นหายอดนิยม</div>
                          ) : (
                            <ol className="list-decimal list-inside space-y-1">
                              {popularUniversal.map((p) => (
                                <li key={`pu-${p.query}`} className="flex justify-between text-md">
                                  <span className="truncate mr-2">{p.query}</span>
                                  <span className="text-gray-600">{p.count}</span>
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  // --- All Dictionaries Panel ---
                  <>
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">พจนานุกรมเฉพาะสาขาวิชาทั้งหมด</h3>
                    {groupedDictionaries.length === 0 ? (
                      <div className="text-center py-8">
                        <svg className="mx-auto h-12 w-12 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        <h3 className="mt-2 text-md font-bold text-gray-900">ยังไม่มีพจนานุกรม</h3>
                        <p className="mt-1 text-md text-black-500">ข้อมูลพจนานุกรมจะแสดงที่นี่</p>
                        <div className="mt-6">
                          <Link href="/dictionaries">
                            <button className="btn-primary">
                              <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                              </svg>
                              ดูพจนานุกรมทั้งหมด
                            </button>
                          </Link>
                        </div>
                      </div>
                    ) : (
                      // --- Render grouped dictionaries as a directory structure ---
                      <div className="space-y-6">
                         {groupedDictionaries.map((category) => (
                          <div key={category.name} className="border border-gray-200 rounded-md">
                            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                              <h4 className="text-md font-bold text-gray-800">{category.name}</h4>
                            </div>
                            <div className="p-4 space-y-4">
                              {category.subcategories.map((subcat) => (
                                 <div key={subcat.name || 'no-subcategory'}>
                                    {subcat.name && ( // Only show subcategory header if it exists
                                       <h5 className="text-md font-semibold text-gray-700 mb-2">{subcat.name}</h5>
                                    )}
                                    <ul className="space-y-2 ml-4"> {/* Indent list items */}
                                      {subcat.dictionaries.map((dict) => (
                                        <li key={dict.id} className="flex items-start">
                                          <svg className="h-5 w-5 text-purple-500 mr-2 mt-0.5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                          </svg>
                                          <span className="text-md">
                                            <Link href={`/dictionaries/${dict.id}`} className="text-blue-600 hover:underline">
                                              {dict.title}
                                            </Link>
                                            {dict.year_published && (
                                              <span className="text-gray-500"> ({dict.year_published})</span>
                                            )}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                               ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions & System Info */}
          <div>
            {/* Quick Actions */}
            <div className="card overflow-hidden">
              <div className="card-header">
                <h3 className="text-lg leading-6 font-medium text-gray-900">ดำเนินการด่วน</h3>
              </div>
              <div className="card-body">
                <div className="space-y-4">
                  <Link href="/file-manager" className="block">
                    <div className="list-tile">
                      <div className="flex-shrink-0 h-10 w-10 rounded-md bg-blue-100 flex items-center justify-center">
                        <svg className="h-6 w-6 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <div className="ml-4">
                        <h4 className="text-md font-bold text-gray-900">นำเข้าเอกสาร</h4>
                        <p className="text-md text-black-500">เพิ่มเอกสารใหม่</p>
                      </div>
                    </div>
                  </Link>
                  <Link href="/search" className="block">
                    <div className="list-tile">
                      <div className="flex-shrink-0 h-10 w-10 rounded-md bg-green-100 flex items-center justify-center">
                        <svg className="h-6 w-6 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <div className="ml-4">
                        <h4 className="text-md font-bold text-gray-900">ค้นหาเอกสาร</h4>
                        <p className="text-md text-black-500">ค้นหาในคลังเอกสาร</p>
                      </div>
                    </div>
                  </Link>
                  <Link href="/dictionaries" className="block">
                    <div className="list-tile">
                      <div className="flex-shrink-0 h-10 w-10 rounded-md bg-purple-100 flex items-center justify-center">
                        <svg className="h-6 w-6 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                      </div>
                      <div className="ml-4">
                        <h4 className="text-md font-bold text-gray-900">พจนานุกรม</h4>
                        <p className="text-md text-black-500">ดูพจนานุกรมทั้งหมด</p>
                      </div>
                    </div>
                  </Link>
                  <Link href="/settings" className="block">
                    <div className="list-tile">
                      <div className="flex-shrink-0 h-10 w-10 rounded-md bg-yellow-100 flex items-center justify-center">
                        <svg className="h-6 w-6 text-yellow-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-1.543.94-3.31-.826-2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <div className="ml-4">
                        <h4 className="text-md font-bold text-gray-900">การตั้งค่า</h4>
                        <p className="text-md text-black-500">จัดการบัญชีของคุณ</p>
                      </div>
                    </div>
                  </Link>
                </div>
              </div>
            </div>

            {/* System Info - Added Vocabulary Count and new counts */}
            <div className="mt-8 card overflow-hidden">
              <div className="card-header">
                <h3 className="text-lg leading-6 font-medium text-gray-900">ข้อมูลระบบ</h3>
              </div>
              <div className="card-body">
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-md text-black-500">สถานะระบบ</span>
                    <span className="badge badge--success">
                      ทำงานปกติ
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-md text-black-500">เวอร์ชัน</span>
                    <span className="text-md font-bold text-gray-900">1.0.0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-md text-black-500">พื้นที่จัดเก็บทั้งหมด</span>
                    <span className="text-md font-bold text-gray-900">{formatFileSize(stats.totalSize)} / 1,000 GB</span>
                  </div>
                  {/* Added Vocabulary Entry Count to System Info */}
                  <div className="flex justify-between">
                    <span className="text-md text-black-500">จำนวนคำศัพท์ทั้งหมด</span>
                    <span className="text-md font-bold text-gray-900">{stats.totalVocabularyEntries}</span>
                  </div>
                  {/* Added Dictionary Count to System Info */}
                  <div className="flex justify-between">
                    <span className="text-md text-black-500">จำนวนพจนานุกรม</span>
                    <span className="text-md font-bold text-gray-900">{stats.totalDictionaries}</span>
                  </div>
                  {/* Added Encyclopedia Count to System Info */}
                  <div className="flex justify-between">
                    <span className="text-md text-black-500">จำนวนสารานุกรม</span>
                    <span className="text-md font-bold text-gray-900">{stats.totalEncyclopedias}</span>
                  </div>
                  {/* Added Taxonomy Count to System Info */}
                  <div className="flex justify-between">
                    <span className="text-md text-black-500">จำนวนอนุกรมวิธาน</span>
                    <span className="text-md font-bold text-gray-900">{stats.totalTaxonomies}</span>
                  </div>
                  {/* Added Gazetteer Entry Count to System Info */}
                  <div className="flex justify-between">
                    <span className="text-md text-black-500">จำนวนรายการภูมิศาสตร์</span>
                    <span className="text-md font-bold text-gray-900">{stats.totalGazetteerEntries}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}