// app/dictionaries/[id]/page.tsx
"use client";
import { useState, useEffect, useMemo, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useSearchParams, useRouter, useParams } from 'next/navigation';
// --- Import the new modal component ---
import EditEntryModal from './components/EditEntryModal';
// --- End Import modal component ---

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

interface PopularQueryItem {
  queryOriginal: string;
  queryNormalized: string;
  count: number;
}


// Helper: extract a single dictionary by id from either an array result or grouped object result
function extractDictionaryDetails(data: any, targetId: number): SpecializedDictionaryDetails | null {
  if (!data) return null;

  // Case 1: API returned an array of dictionaries
  if (Array.isArray(data)) {
    const found = data.find((d: any) => Number(d?.id) === targetId);
    if (found) {
      return {
        id: Number(found.id),
        title: String(found.title),
        category: String(found.category),
        subcategory: found.subcategory ?? null,
      };
    }
    // If array has exactly 1 item and ids don't match, still allow using that record
    if (data.length === 1) {
      const only = data[0];
      if (only) {
        return {
          id: Number(only.id),
          title: String(only.title),
          category: String(only.category),
          subcategory: only.subcategory ?? null,
        };
      }
    }
    return null;
  }

  // Case 2: API returned a grouped object: { [category]: { [subcategoryKey]: Array<dict> } }
  if (typeof data === 'object') {
    for (const catKey of Object.keys(data)) {
      const subObj = (data as any)[catKey];
      if (subObj && typeof subObj === 'object') {
        for (const subKey of Object.keys(subObj)) {
          const arr = subObj[subKey];
          if (Array.isArray(arr)) {
            for (const item of arr) {
              if (Number(item?.id) === targetId) {
                return {
                  id: Number(item.id),
                  title: String(item.title),
                  category: String(item.category),
                  subcategory: item.subcategory ?? null,
                };
              }
            }
          }
        }
      }
    }
  }

  return null;
}

// --- Helper: render only <mark> highlights, escape the rest ---
function renderMarkOnly(input: string | null): string {
  if (!input) return '';
  let s = String(input);
  // 1) Convert encoded mark tags to real tags
  s = s.replace(/&lt;mark&gt;/gi, '<mark>')
       .replace(/&lt;\/mark&gt;/gi, '</mark>');

  // 2) Temporarily protect <mark> tags
  const tokens: string[] = [];
  s = s.replace(/<\/?mark>/gi, (m) => {
    const idx = tokens.push(m.toLowerCase()) - 1;
    return `__MARK_TOKEN_${idx}__`;
  });

  // 3) Escape everything else
  s = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 4) Restore the <mark> tags and add a styling class
  tokens.forEach((tok, i) => {
    const restored = tok === '<mark>' ? '<mark class="highlight-mark">' : tok;
    s = s.replace(`__MARK_TOKEN_${i}__`, restored);
  });

  return s;
}

// --- End helper ---

// === Thai alphabet filter (for dictionaryId === 0) ===
const THAI_CONSONANTS: string[] = [
  'ก','ข','ฃ','ค','ฅ','ฆ','ง','จ','ฉ','ช','ซ','ฌ','ญ','ฎ','ฏ','ฐ','ฑ','ฒ','ณ',
  'ด','ต','ถ','ท','ธ','น','บ','ป','ผ','ฝ','พ','ฟ','ภ','ม','ย','ร','ล','ว','ศ','ษ','ส','ห','ฬ','อ','ฮ'
];

function getThaiInitial(s?: string | null): string {
  if (!s) return '';
  const t = String(s).trim();
  return t ? t[0] : '';
}

// === Result Row Components (split by dictionary type) ===
interface ResultRowProps {
  entry: DictionaryEntryResult;
  isSelected: boolean;
  selectMode: boolean;
  selectedIds: number[];
  isAllDictionaries: boolean;
  onToggleSelect: (id: number) => void;
  onOpen: (entry: DictionaryEntryResult) => void;
}

/** Generic shared row content */
function ResultRowBase({
  entry,
  isSelected,
  selectMode,
  selectedIds,
  isAllDictionaries,
  onToggleSelect,
  onOpen,
  rowClassName = '',
}: ResultRowProps & { rowClassName?: string }) {
  return (
    <div
      id={`entry-${entry.id}`}
      className={`entry-row mb-4 p-3 rounded transition-colors duration-150 relative cursor-pointer ${isSelected ? 'border-2 border-blue-500 bg-blue-50' : 'border border-transparent hover:border-gray-300'} ${selectMode ? 'has-select' : ''} ${rowClassName}`}
      onClick={() => {
        if (selectMode) {
          onToggleSelect(entry.id);
        } else {
          onOpen(entry);
        }
      }}
    >
      {selectMode && (
        <input
          type="checkbox"
          className="select-checkbox"
          checked={selectedIds.includes(entry.id)}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            onToggleSelect(entry.id);
          }}
          aria-label="เลือกแถวนี้"
        />
      )}

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
            className="dict-accent"
            style={{ fontSize: '1.3rem', fontFamily: '"TH SarabunPSK", sans-serif' }}
            dangerouslySetInnerHTML={{ __html: renderMarkOnly(entry.term_en || '') }}
          />
          &nbsp;&nbsp;
          <span
            className="dict-accent"
            style={{ fontSize: '1.3rem', fontFamily: '"TH SarabunPSK", sans-serif' }}
            dangerouslySetInnerHTML={{ __html: renderMarkOnly(entry.term_th || '') }}
          />
        </b>
      </div>

      {entry.definition_html && (
        <div
          style={{ marginLeft: 43 }}
          className="mt-1"
          dangerouslySetInnerHTML={{ __html: entry.definition_html }}
        />
      )}

      {/* Version and Updated Info */}
      <div className="row-meta text-xs text-gray-500">
        เวอร์ชัน ({entry.version}) : แก้ไขล่าสุดเมื่อ {new Date(entry.updated_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}
      </div>
    </div>
  );
}

/** Row for dictionaryId === 0 (ราชบัณฑิตยสภา) – title and definition in two columns */
function DictionaryResultRow({
  entry,
  isSelected,
  selectMode,
  selectedIds,
  isAllDictionaries,
  onToggleSelect,
  onOpen,
}: ResultRowProps) {
  return (
    <div
      id={`entry-${entry.id}`}
      className={`entry-row mb-4 p-3 rounded transition-colors duration-150 relative cursor-pointer ${isSelected ? 'border-2 border-blue-500 bg-blue-50' : 'border border-transparent hover:border-gray-300'} ${selectMode ? 'has-select' : ''} entry-row--dict`}
      onClick={() => {
        if (selectMode) {
          onToggleSelect(entry.id);
        } else {
          onOpen(entry);
        }
      }}
    >
      {selectMode && (
        <input
          type="checkbox"
          className="select-checkbox"
          checked={selectedIds.includes(entry.id)}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { e.stopPropagation(); onToggleSelect(entry.id); }}
          aria-label="เลือกแถวนี้"
        />
      )}

      {/* Breadcrumb for individual entry (if showing all dictionaries) */}
      {isAllDictionaries && entry.SpecializedDictionary && (
        <div className="text-xs text-gray-500 mb-1 text-right">
          {entry.SpecializedDictionary.title} | {entry.SpecializedDictionary.category}
          {entry.SpecializedDictionary.subcategory && ` | ${entry.SpecializedDictionary.subcategory}`}
        </div>
      )}

      {/* Title | Definition in two columns */}
      <div className="dict-row-grid">
        <div className="dict-row-head">
          <div style={{ marginLeft: 30, textIndent: -30 }}>
            <b>
              <span
                className="dict-accent"
                style={{ fontSize: '1.3rem', fontFamily: '"TH SarabunPSK", sans-serif' }}
                dangerouslySetInnerHTML={{ __html: renderMarkOnly(entry.term_th || '') }}
              />
            </b>
          </div>
        </div>
        {entry.definition_html && (
          <div
            className="dict-row-def"
            // keep original HTML for definition; it may contain markup/marks
            dangerouslySetInnerHTML={{ __html: entry.definition_html }}
          />
        )}
      </div>

      {/* Version and Updated Info - Meta block, right aligned, spaced below */}
      <div className="row-meta text-xs text-gray-500">
        เวอร์ชัน ({entry.version}) : แก้ไขล่าสุดเมื่อ {new Date(entry.updated_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}
      </div>
    </div>
  );
}

/** Row for dictionaryId === 3 (เล่มพิเศษ/เคมี) */
function SpecializedDictionaryResultRow(props: ResultRowProps) {
  return (
    <ResultRowBase
      {...props}
      rowClassName="entry-row--spec"
    />
  );
}
// === End Result Row Components ===

export default function SearchDictionaryPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const dictionaryIdParam = params.id;
  const dictionaryId = dictionaryIdParam === '0' || isNaN(Number(dictionaryIdParam)) ? 0 : Number(dictionaryIdParam);
  const themeClass = dictionaryId === 0 ? 'dict-theme-0' : dictionaryId === 3 ? 'dict-theme-3' : 'dict-theme-other';
  const isAllDictionaries = false;
  const initialQuery = searchParams.get('q') || '';
  const initialLanguageFilter = searchParams.get('language') || 'all';
  const [query, setQuery] = useState(initialQuery);
  const [languageFilter, setLanguageFilter] = useState(initialLanguageFilter);
  const [results, setResults] = useState<DictionaryEntryResult[]>([]);
  const [popular, setPopular] = useState<PopularQueryItem[]>([]);
  const [pagination, setPagination] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dictionaryDetails, setDictionaryDetails] = useState<SpecializedDictionaryDetails | null>(null);
  const [dictLoading, setDictLoading] = useState(false);
  const [dictError, setDictError] = useState<string | null>(null);
  // --- Paging / Zoom / Selection ---
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [zoom, setZoom] = useState(1);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  // --- End Paging / Zoom / Selection ---

  // --- State for Selected Row ---
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  // --- End Selected Row State ---

  // --- Modal State (Simplified) ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<DictionaryEntryResult | null>(null);
  // --- Sidebar: สารบัญ/ค้นหา/เลื่อนบน ---
  const [sidebarQuery, setSidebarQuery] = useState('');
  // Thai alphabet filter (for ราชบัณฑิตยสภา, id=0)
  const [alphaFilter, setAlphaFilter] = useState<string>('');
  
  // Results filtered by Thai alphabet (only for dictionaryId === 0)
  const filteredResults = useMemo(() => {
    if (dictionaryId === 0 && alphaFilter) {
      return results.filter((e) => getThaiInitial(e.term_th) === alphaFilter);
    }
    return results;
  }, [results, dictionaryId, alphaFilter]);

  // จัดกลุ่มสารบัญ: ตัวอักษร ➜ คำแต่ละตัว (ใช้ filteredResults และ Thai-first-letter สำหรับ dictionaryId 0)
  const sidebarGroups = useMemo(() => {
    const map: Record<string, { id: number; label: string; anchor: string }[]> = {};
    filteredResults.forEach((entry) => {
      const letter =
        dictionaryId === 0
          ? (getThaiInitial(entry.term_th) || '#')
          : ((entry.term_en?.[0] || entry.term_th?.[0] || '#').toUpperCase());
      const label = (entry.term_th || entry.term_en || '').trim();
      if (!label) return;
      if (!map[letter]) map[letter] = [];
      map[letter].push({ id: entry.id, label, anchor: `entry-${entry.id}` });
    });
    Object.keys(map).forEach((k) => map[k].sort((a, b) => a.label.localeCompare(b.label, 'th')));
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b, 'th'))
      .map(([letter, items]) => ({ letter, items }));
  }, [filteredResults, dictionaryId]);

  const filteredSidebarGroups = useMemo(() => {
    const q = sidebarQuery.trim().toLowerCase();
    if (!q) return sidebarGroups;
    return sidebarGroups
      .map((g) => ({
        ...g,
        items: g.items.filter((it) => it.label.toLowerCase().includes(q) || g.letter.toLowerCase().includes(q)),
      }))
      .filter((g) => g.items.length > 0);
  }, [sidebarGroups, sidebarQuery]);
  
  // เลื่อนกลับด้านบน
  const scrollPageTop = useCallback(() => {
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      window.scrollTo(0, 0);
    }
  }, []);
  
  // เลื่อนไปยังหัวข้อ (anchor) ที่เลือก
  const scrollToAnchor = useCallback((anchorId: string) => {
    const el = document.getElementById(anchorId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  // --- End Sidebar ---
  // Removed editFormData, editorContent, saving, saveError, version states - managed by the modal component
  // --- End Simplified Modal State ---

  const fetchResults = async (pageArg = 1, sizeArg = pageSize) => {
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
      params.append('page', pageArg.toString());
      params.append('pageSize', sizeArg.toString());
      const apiUrl = `/api/search-dictionary?${params.toString()}`;
      const response = await fetch(apiUrl);
      if (!response.ok) {
        let errorMsg = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch (e) {
          // ignore
        }
        throw new Error(errorMsg);
      }
      const data = await response.json();
      setPopular(data.popular || []);
      setResults(data.results || []);
      setPagination(data.pagination || null);
      setPage(data.pagination?.page ?? pageArg);
      setPageSize(data.pagination?.pageSize ?? sizeArg);
    } catch (err) {
      console.error("Search Dictionary error:", err);
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการค้นหาคำศัพท์ กรุณาลองใหม่อีกครั้ง');
      setResults([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  };
  // --- Toolbar handlers ---
  const changePage = (p: number) => {
    if (!Number.isFinite(p) || p < 1) return;
    const max = pagination?.totalPages ?? Number.POSITIVE_INFINITY;
    const next = Math.min(p, max);
    fetchResults(next, pageSize);
    // Scroll top of the page
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
  };
  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const size = parseInt(e.target.value, 10) || 10;
    setPageSize(size);
    fetchResults(1, size);
  };
  const zoomOut = () => setZoom(z => Math.max(0.8, +(z - 0.1).toFixed(2)));
  const zoomIn  = () => setZoom(z => Math.min(1.5, +(z + 0.1).toFixed(2)));
  // --- End Toolbar handlers ---

  const fetchDictionaryDetails = async () => {
    if (isAllDictionaries) {
      setDictionaryDetails(null);
      return;
    }
    setDictLoading(true);
    setDictError(null);
    try {
      // Try the primary parameter first
      let response = await fetch(`/api/dictionaries?specializedDictionaryId=${dictionaryId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      let data: any = await response.json();
      let details = extractDictionaryDetails(data, dictionaryId);
      if (details) {
        setDictionaryDetails(details);
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
    newParams.set('pageSize', String(pageSize));
    router.push(`/dictionaries/${dictionaryId}?${newParams.toString()}`);
    // Fetch immediately to reflect changes
    fetchResults(1, pageSize);
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
    fetchResults(1, pageSize);
  }, [dictionaryIdParam, initialQuery, initialLanguageFilter]);

  useEffect(() => {
    fetchDictionaryDetails();
  }, [dictionaryId]);

  return (
    <div className={`reader-stage reader-stage--full ${themeClass}`}>
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
      <main className="a4-container">
        {/* Sidebar: สารบัญเฉพาะหัวข้อ */}
        <aside className="reader-aside" aria-label="สารบัญคำศัพท์ (เฉพาะหัวข้อ)">
          <div className="aside-title">สารบัญคำศัพท์</div>

          <div className="aside-actions">
            <label htmlFor="toc-search" className="sr-only">ค้นหาในสารบัญ</label>
            <input
              id="toc-search"
              type="search"
              className="aside-search"
              placeholder="ค้นหาในสารบัญ"
              value={sidebarQuery}
              onChange={(e) => setSidebarQuery(e.target.value)}
              autoComplete="off"
              aria-label="ค้นหาในสารบัญ"
            />
            <button
              type="button"
              className="aside-top-btn"
              onClick={scrollPageTop}
              title="เลื่อนกลับด้านบน"
              aria-label="เลื่อนกลับด้านบน"
            >
              ↑
            </button>
          </div>

          <ul className="aside-list toc-groups">
            {filteredSidebarGroups.map((group) => (
              <li key={group.letter} className="toc-group">
                <div className="toc-letter">{group.letter}</div>
                <ul className="toc-items">
                  {group.items.map((it) => (
                    <li key={it.id} className="toc-item">
                      <button
                        type="button"
                        className="aside-link toc-link"
                        onClick={() => scrollToAnchor(it.anchor)}
                        title={`ไปยังคำว่า ${it.label}`}
                        aria-label={`ไปยังคำว่า ${it.label}`}
                      >
                        {it.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </aside>
        <section className="a4-page">
        <div className="a4-zoom-wrap" style={{ ['--reader-zoom' as any]: zoom }}>
        {/* Breadcrumb */}
        <nav aria-label="breadcrumb" className="mb-4">
          {dictLoading ? (
            <span className="text-sm text-gray-500">กำลังโหลดข้อมูล…</span>
          ) : dictError ? (
            <span className="text-sm text-red-500">ข้อผิดพลาด: {dictError}</span>
          ) : (
            <ol className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <li>
                <Link href="/dictionaries" className="hover:underline">คลังพจนานุกรม</Link>
              </li>

              {dictionaryDetails ? (
                <>
                  <li className="text-gray-300">•</li>
                  <li className="text-gray-700">{dictionaryDetails.category}</li>

                  {dictionaryDetails.subcategory && (
                    <>
                      <li className="text-gray-300">•</li>
                      <li className="text-gray-700">{dictionaryDetails.subcategory}</li>
                    </>
                  )}

                  <li className="text-gray-300">•</li>
                  <li className="font-extrabold" style={{ color: 'var(--brand-gold)' }} aria-current="page">
                    {dictionaryDetails.title}
                  </li>
                </>
              ) : (
                <>
                  <li className="text-gray-300">•</li>
                  <li className="font-extrabold" style={{ color: 'var(--brand-gold)' }} aria-current="page">
                    {isAllDictionaries ? 'ค้นหาทั้งหมด' : 'กำลังโหลดข้อมูล'}
                  </li>
                </>
              )}
            </ol>
          )}
        </nav>
        <h2 className="text-2xl font-bold mb-6 text-center">
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
        {/* Thai alphabet filter (ก-ฮ) – only for ราชบัณฑิตยสภา (id=0) */}
        {dictionaryId === 0 && (
          <div className="alphabet-bar" role="toolbar" aria-label="กรองตามพยัญชนะ">
            <button
              type="button"
              className={`alpha-btn ${alphaFilter === '' ? 'is-active' : ''}`}
              onClick={() => { setAlphaFilter(''); try{ window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {} }}
              title="ทั้งหมด"
              aria-pressed={alphaFilter === ''}
            >
              ทั้งหมด
            </button>
            {THAI_CONSONANTS.map((ch) => (
              <button
                key={ch}
                type="button"
                className={`alpha-btn ${alphaFilter === ch ? 'is-active' : ''}`}
                onClick={() => { setAlphaFilter(ch); try{ window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {} }}
                title={`ตัวอักษร ${ch}`}
                aria-pressed={alphaFilter === ch}
              >
                {ch}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex items-center border border-gray-300 rounded-full px-4 py-1 shadow-sm hover:shadow-md focus-within:shadow-md transition-shadow duration-200 ease-in-out max-w-3xl mx-auto">
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
        {/* Popular search queries */}
        {popular && popular.length > 0 && (
          <div className="popular-queries" role="list" aria-label="คำค้นหายอดนิยม">
            <div className="popular-title">คำค้นหายอดนิยม</div>
            <div className="popular-chips">
              {popular.map((p) => (
                <button
                  key={p.queryNormalized}
                  type="button"
                  className="popular-chip"
                  role="listitem"
                  onClick={() => {
                    setQuery(p.queryOriginal);
                    fetchResults(1, pageSize);
                  }}
                  title={`${p.queryOriginal} • ${p.count} ครั้ง`}
                  aria-label={`${p.queryOriginal} ถูกค้นหา ${p.count} ครั้ง`}
                >
                  <span className="popular-chip__text">{p.queryOriginal}</span>
                  <span className="popular-chip__count">{p.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && !error && (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 mb-4"></div>
            <p className="text-gray-600">กำลังโหลดข้อมูล</p>
          </div>
        )}

        {!loading && !error && (
          <div>
            {filteredResults.length > 0 ? (
              <div>
                {Object.entries(
                  filteredResults.reduce((acc, entry) => {
                    const key = dictionaryId === 0
                      ? (getThaiInitial(entry.term_th) || '#')
                      : ((entry.term_en?.[0] || entry.term_th?.[0] || '#').toUpperCase());
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(entry);
                    return acc;
                  }, {} as Record<string, typeof filteredResults>)
                )
                  .sort(([a], [b]) => a.localeCompare(b, 'th'))
                  .map(([letter, group]) => (
                    <section key={letter} id={`section-${letter}`} className="mb-8">
                      <div className="flex items-center mb-2">
                        <span
                          className="font-bold dict-accent"
                          style={{
                            fontSize: '2rem',
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
                        (() => {
                          const RowComponent = entry.specializedDictionaryId === 0
                            ? DictionaryResultRow
                            : SpecializedDictionaryResultRow;

                          return (
                            <RowComponent
                              key={entry.id}
                              entry={entry}
                              isSelected={selectedRowId === entry.id}
                              selectMode={selectMode}
                              selectedIds={selectedIds}
                              isAllDictionaries={isAllDictionaries}
                              onToggleSelect={(id) => {
                                setSelectedIds((prev) =>
                                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                                );
                              }}
                              onOpen={openEditModal}
                            />
                          );
                        })()
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
        </div>
        {/* Bottom Toolbar */}
        <div className="a4-toolbar" role="toolbar" aria-label="เครื่องมือผลการค้นหา">
          <div className="toolbar-section">
            <button type="button" className="btn-icon" onClick={zoomOut} title="ย่อ (-)">
              <span aria-hidden="true">−</span>
            </button>
            <span className="zoom-value">{Math.round(zoom * 100)}%</span>
            <button type="button" className="btn-icon" onClick={zoomIn} title="ขยาย (+)">
              <span aria-hidden="true">+</span>
            </button>
          </div>
          <div className="toolbar-section">
            <button
              type="button"
              className="btn-secondary btn--sm"
              onClick={() => changePage((pagination?.page ?? page) - 1)}
              disabled={(pagination?.page ?? page) <= 1}
              title="หน้าก่อนหน้า"
            >
              ก่อนหน้า
            </button>
            <span className="mx-2 text-sm text-gray-600">
              หน้า {pagination?.page ?? page} / {pagination?.totalPages ?? '—'}
            </span>
            <button
              type="button"
              className="btn-secondary btn--sm"
              onClick={() => changePage((pagination?.page ?? page) + 1)}
              disabled={pagination ? (pagination.page >= (pagination.totalPages ?? 1)) : false}
              title="หน้าถัดไป"
            >
              ถัดไป
            </button>
            <label className="ml-4 text-sm text-gray-700">
              แสดงต่อหน้า
              <select
                className="ml-2 form-select form-select--sm"
                value={pageSize}
                onChange={handlePageSizeChange}
                aria-label="จำนวนรายการต่อหน้า"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </label>
          </div>
          <div className="toolbar-section">
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selectMode}
                onChange={(e) => setSelectMode(e.target.checked)}
              />
              พร้อมเลือก
            </label>
          </div>
        </div>
        </section>
      </main>

      {/* --- Use the new EditEntryModal component --- */}
      <EditEntryModal
        isOpen={isModalOpen}
        onClose={closeEditModal}
        entry={selectedEntry}
        onUpdateSuccess={handleUpdateSuccess}
      />
      {/* --- End new EditEntryModal component --- */}
      <style jsx global>{`
        /* Thai alphabet toolbar */
        .alphabet-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          justify-content: center;
          margin: 6px 0 12px;
        }
        .alpha-btn {
          width: 36px;
          height: 36px;
          border-radius: 9999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #dcdcdc;
          background: #fff;
          cursor: pointer;
          font-weight: 800;
          line-height: 1;
          transition: background .15s ease, box-shadow .15s ease, border-color .15s ease, color .15s ease;
        }
        .alpha-btn:hover { background: #fafafa; }
        .alpha-btn.is-active {
          background: color-mix(in oklab, var(--dict-color) 12%, #fff);
          border-color: var(--dict-color);
          color: var(--dict-color);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--dict-color) 22%, transparent);
        }
        /* === Layout tweaks for dictionaryId === 0 rows === */
        .entry-row--dict .dict-row-grid {
          display: grid;
          grid-template-columns: max-content 1fr;
          column-gap: 36px;
          align-items: baseline; /* keep definition baseline-aligned with the title */
        }
        .entry-row--dict .dict-row-def {
          /* ensure definition text flows nicely */
          min-width: 0;
        }
        /* Space meta about ~2 lines below the content and right aligned */
        .entry-row .row-meta {
          margin-top: 2em; /* about two lines */
          text-align: right;
        }
        /* Stack columns on small screens */
        @media (max-width: 640px) {
          .entry-row--dict .dict-row-grid {
            grid-template-columns: 1fr;
            row-gap: 4px;
          }
          .entry-row--dict .dict-row-def {
            margin-left: 30px; /* align with hanging indent */
          }
        }
        /* Dictionary color templates */
        .dict-theme-0 { --dict-color: #0a4376; }
        .dict-theme-3 { --dict-color: #B3186D; }
        .dict-theme-other { --dict-color: #04470c; }

        /* Helper class to color text using current dictionary theme */
        .dict-accent { color: var(--dict-color); }

        /* Optional: emphasized highlight color inside <mark> to match theme */
        .highlight-mark {
          background: color-mix(in oklab, var(--dict-color) 20%, #fff);
          padding: 0 .15em;
          border-radius: 2px;
        }
        /* --- A4 reader stage styles --- */
        .reader-stage {
          min-height: 100svh;
          /* subtle textured stage behind the page */
          background:
            radial-gradient(1200px 600px at 10% -10%, rgba(255,255,255,0.45), transparent 60%),
            radial-gradient(1200px 600px at 110% 30%, rgba(255,255,255,0.35), transparent 60%),
            linear-gradient(180deg, #eef2f3 0%, #e6ebee 100%);
          padding: clamp(12px, 3vw, 32px);
        }
        .a4-container {
          max-width: 100%;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 260px 1fr;
          align-items: start;
          gap: clamp(12px, 2vw, 28px);
        }
        .a4-page {
          background: #ffffff;
          width: 100%;
          max-width: none;
          border-radius: 12px;
          box-shadow:
            0 12px 24px rgba(0,0,0,0.08),
            0 2px 6px rgba(0,0,0,0.06);
          padding: clamp(16px, 2.5vw, 32px);
          border: 1px solid #e6e6e6;
        }
        /* Zoom wrapper for page content */
        .a4-zoom-wrap {
          transform: scale(var(--reader-zoom, 1));
          transform-origin: top center;
          transition: transform 160ms ease;
        }

        /* Sticky bottom toolbar inside the page */
        .a4-toolbar {
          position: sticky;
          bottom: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          margin-top: 10px;
          background: #fff;
          border-top: 1px solid #e6e6e6;
          border-radius: 0 0 12px 12px;
          box-shadow: 0 -2px 8px rgba(0,0,0,0.03);
        }
        .a4-toolbar .toolbar-section {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .a4-toolbar .btn-icon {
          width: 32px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #dcdcdc;
          border-radius: 8px;
          background: #fafafa;
        }
        .a4-toolbar .btn-icon:hover { background: #f3f3f3; }
        .a4-toolbar .zoom-value { min-width: 42px; text-align: center; font-variant-numeric: tabular-nums; }

        /* Selection checkbox inside rows */
        .entry-row.has-select { padding-left: 2.25rem; }
        .entry-row .select-checkbox {
          position: absolute;
          left: 0.5rem;
          top: 0.75rem;
          width: 18px;
          height: 18px;
        }
        /* Tighter content rhythm inside the sheet */
        .a4-page h2 { margin-top: 0.2rem; margin-bottom: 1rem; }
        .a4-page nav[aria-label="breadcrumb"] { margin-bottom: 0.75rem; }
        .a4-page form { margin-bottom: 1rem; }
        .a4-page section { padding-bottom: 0.75rem; margin-bottom: 0.75rem; border-bottom: 1px dashed #e9edf0; }
        .a4-page section:last-of-type { border-bottom: 0; margin-bottom: 0; padding-bottom: 0; }
        /* Search bar fits the page edge-to-edge */
        .a4-page form .flex {
          border-radius: 9999px;
          background: #fff;
        }
        /* Responsive fallback for smaller screens: use nearly full width */
        @media (max-width: 1024px) {
          .a4-container { grid-template-columns: 1fr; }
        }
        @media (max-width: 640px) {
          .a4-page { width: 100%; border-radius: 10px; padding: 14px; }
        }
        /* A11y utility */
        .sr-only {
          position: absolute !important;
          width: 1px !important;
          height: 1px !important;
          padding: 0 !important;
          margin: -1px !important;
          overflow: hidden !important;
          clip: rect(0, 0, 0, 0) !important;
          white-space: nowrap !important;
          border: 0 !important;
        }

        /* Sidebar (ซ้ายมือ) */
        .reader-aside {
          position: sticky;
          top: 90px; /* ใต้ header */
          align-self: flex-start;
          width: 260px;
          max-height: calc(100svh - 110px);
          overflow: auto;
          background: #ffffff;
          border: 1px solid #e6e6e6;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,.04);
          padding: 10px 10px 12px;
        }
        /* TOC nested list */
        .toc-groups { list-style: none; margin: 0; padding: 0; }
        .toc-group + .toc-group { margin-top: 6px; }
        .toc-letter {
          font-weight: 900;
          color: var(--dict-color);
          padding: 6px 8px;
          margin: 4px 2px 4px;
        }
        .toc-items { list-style: none; margin: 0 0 6px 0; padding: 0 0 0 6px; }
        .toc-item + .toc-item { margin-top: 2px; }
        .toc-link { display:block; width:100%; text-align:left; padding:6px 8px; border-radius:8px; border:1px solid transparent; background:transparent; cursor:pointer; font-weight:700; line-height:1.15; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .toc-link:hover { background:#f9fafb; border-color:#eef2f4; }

        .reader-aside .aside-title {
          font-weight: 800;
          margin: 4px 4px 10px;
          color: var(--dict-color);
        }

        /* แผงค้นหา + ปุ่มกลับบน */
        .reader-aside .aside-actions {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
          align-items: center;
          margin-bottom: 8px;
        }
        .reader-aside .aside-search {
          width: 100%;
          height: 34px;
          padding: 6px 10px;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
          font-size: .9rem;
          outline: none;
          background: #fff;
        }
        .reader-aside .aside-search:focus {
          border-color: color-mix(in oklab, var(--dict-color) 35%, #e5e7eb);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--dict-color) 20%, transparent);
        }
        .reader-aside .aside-top-btn {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
          background: #fafafa;
          cursor: pointer;
          font-weight: 700;
          line-height: 1;
        }
        .reader-aside .aside-top-btn:hover {
          background: #f3f4f6;
          border-color: #d1d5db;
        }

        /* รายการสารบัญ */
        .reader-aside .aside-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .reader-aside .aside-list li + li {
          margin-top: 4px;
        }
        .reader-aside .aside-link {
          width: 100%;
          text-align: left;
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid transparent;
          background: transparent;
          cursor: pointer;
          font-weight: 600;
        }
        .reader-aside .aside-link:hover {
          background: #f9fafb;
          border-color: #eef2f4;
        }

        /* ซ่อน sidebar บนจอเล็ก */
        @media (max-width: 1024px) {
          .reader-aside { display: none; }
        }
        /* ===== Modal (Edit) – blur overlay & polished card ===== */
        :root {
          --modal-overlay-base: rgba(255,255,255,0.35);
          --modal-overlay-tint: color-mix(in oklab, var(--dict-color, #0a4376) 10%, rgba(12,18,14,0.12));
        }
        /* Overlay/Backdrop: replace dark overlay with a subtle blur + tint */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: grid;
          place-items: center;
          padding: clamp(12px, 3vw, 28px);
          background:
            radial-gradient(1200px 800px at 10% -10%, rgba(255,255,255,0.45), transparent 55%),
            radial-gradient(1200px 800px at 110% 30%, rgba(255,255,255,0.35), transparent 55%),
            var(--modal-overlay-base);
          backdrop-filter: blur(5px) saturate(1.15);
          -webkit-backdrop-filter: blur(5px) saturate(1.15);
        }
        /* Force-override any inline black overlay some implementations add */
        .modal-backdrop[style] { background: var(--modal-overlay-base) !important; }

        /* Modal panel: clean card look */
        .modal {
          width: min(880px, 96vw);
          max-height: min(86svh, 860px);
          overflow: auto;
          border-radius: 14px;
          border: 1px solid #e6e6e6;
          background: #ffffff;
          box-shadow: 0 24px 64px rgba(0,0,0,.12), 0 6px 18px rgba(0,0,0,.08);
        }
        .modal__header {
          position: sticky; top: 0;
          display: flex; align-items: center; gap: 10px;
          padding: 12px 14px;
          background: linear-gradient(180deg, #fbfbfb, #f6f7f9);
          border-bottom: 1px solid #ececec;
          z-index: 1;
        }
        .modal__title { font-weight: 800; font-size: 1rem; color: #0f172a; }
        .modal__body { padding: 16px; }
        .modal__footer {
          position: sticky; bottom: 0;
          display: flex; justify-content: flex-end; gap: 8px;
          padding: 12px 14px;
          background: #fafafa;
          border-top: 1px solid #ececec;
        }
        /* Icon button used inside header */
        .btn-icon {
          width: 32px; height: 32px;
          display: inline-flex; align-items: center; justify-content: center;
          border-radius: 8px; border: 1px solid #dcdcdc; background: #fafafa;
        }
        .btn-icon:hover { background: #f3f3f3; }
      /* Popular queries under search bar */
      .popular-queries {
        max-width: 840px;
        margin: -4px auto 10px;
        padding: 0 4px;
      }
      .popular-queries .popular-title {
        font-size: .9rem;
        color: #6b7280;
        margin: 2px 6px 6px;
        font-weight: 700;
      }
      .popular-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .popular-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: 1px solid #e5e7eb;
        background: #fff;
        border-radius: 9999px;
        padding: 6px 10px;
        font-size: .9rem;
        cursor: pointer;
        transition: background .15s ease, border-color .15s ease, box-shadow .15s ease;
      }
      .popular-chip:hover {
        background: #f9fafb;
        border-color: #d1d5db;
        box-shadow: 0 0 0 3px color-mix(in oklab, var(--dict-color) 18%, transparent);
      }
      .popular-chip__text { font-weight: 700; }
      .popular-chip__count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 22px;
        height: 22px;
        padding: 0 6px;
        font-variant-numeric: tabular-nums;
        border-radius: 9999px;
        background: color-mix(in oklab, var(--dict-color) 12%, #f1f5f9);
        color: var(--dict-color);
        border: 1px solid color-mix(in oklab, var(--dict-color) 30%, #e5e7eb);
      }
      `}</style>
    </div>
  );
}