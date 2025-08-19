// app/search-transliteration/page.tsx
"use client";
import { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import * as FlagIcons from 'country-flag-icons/react/3x2';
import type { ComponentType, SVGProps, ChangeEvent } from 'react';

// === Types ===
interface TransliterationSearchResult {
  id: number;
  romanization: string;
  originalScript1: string | null;
  originalScript2: string | null;
  language: string | null;                // ex. "ญี่ปุ่น", "ฝรั่งเศส", "พม่า"
  wordType: string | null;
  category: string | null;
  transliteration1: string | null;
  transliteration2: string | null;
  otherFoundWords: string | null;
  meaning: string | null;
  notes: string | null;
  referenceCriteria: string | null;       // ≈ เกณฑ์อ้างอิง
  formattedPublicationDate: string | null;
  updatedAt?: string | null;
}

interface Pagination {
  currentPage: number;
  totalPages: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  prevPage?: number;
  nextPage?: number;
  pageSize?: number;
  total?: number; // total results
}

// Version snapshot returned by GET /api/transliteration/:id
interface TransliterationVersionSnapshot {
  version: number;
  changed_at?: string; // backend may use snake_case
  changedAt?: string;  // or camelCase
  updatedAt?: string;
  createdAt?: string;
  // snapshot fields (mirror main entry keys)
  romanization?: string | null;
  originalScript1?: string | null;
  originalScript2?: string | null;
  language?: string | null;
  wordType?: string | null;
  category?: string | null;
  transliteration1?: string | null;
  transliteration2?: string | null;
  meaning?: string | null;
  notes?: string | null;
  referenceCriteria?: string | null;
}

// Mapping language names to ISO country codes for flag display (UPPERCASE to match component names)
const languageToCountryCode: Record<string, string> = {
  'อังกฤษ': 'GB',
  'สหรัฐอเมริกา': 'US',
  'ฝรั่งเศส': 'FR',
  'เยอรมัน': 'DE',
  'รัสเซีย': 'RU',
  'อิตาลี': 'IT',
  'สเปน': 'ES',
  'โปรตุเกส': 'PT',
  'ญี่ปุ่น': 'JP',
  'จีน': 'CN',
  'เกาหลี': 'KR',
  'พม่า': 'MM',
  'อินโดนีเซีย': 'ID',
  'เวียดนาม': 'VN',
  'มลายู': 'MY',
  'อาหรับ': 'SA',
  'ฮินดี': 'IN',
  'ลาว': 'LA',
  'กัมพูชา': 'KH',
  // หมายเหตุ: บางรายการอย่าง "สหภาพยุโรป" อาจไม่มีในไลบรารีนี้ → ใช้ fallback กลมโลก
};
// Build edit form shape
type EditFormState = {
  language: string;
  wordType: string;
  romanization: string;
  transliteration1: string;
  transliteration2: string;
  category: string;
  originalScript1: string;
  originalScript2: string;
  meaning: string;
  notes: string;
  referenceCriteria: string;
};

const mapFromEntry = (e: Partial<TransliterationSearchResult>): EditFormState => ({
  language: e.language ?? '',
  wordType: e.wordType ?? '',
  romanization: e.romanization ?? '',
  transliteration1: e.transliteration1 ?? '',
  transliteration2: e.transliteration2 ?? '',
  category: e.category ?? '',
  originalScript1: e.originalScript1 ?? '',
  originalScript2: e.originalScript2 ?? '',
  meaning: e.meaning ?? '',
  notes: e.notes ?? '',
  referenceCriteria: e.referenceCriteria ?? '',
});

const mapFromVersion = (v?: TransliterationVersionSnapshot): EditFormState => ({
  language: v?.language ?? '',
  wordType: v?.wordType ?? '',
  romanization: v?.romanization ?? '',
  transliteration1: v?.transliteration1 ?? '',
  transliteration2: v?.transliteration2 ?? '',
  category: v?.category ?? '',
  originalScript1: v?.originalScript1 ?? '',
  originalScript2: v?.originalScript2 ?? '',
  meaning: v?.meaning ?? '',
  notes: v?.notes ?? '',
  referenceCriteria: v?.referenceCriteria ?? '',
});

// Helper: Thai date formatter (dd/MM/yyyy HH:mm:ss, B.E. year)
function formatThaiDate(input?: string | null): string {
  if (!input) return '-';
  const d = new Date(input);
  if (isNaN(d.getTime())) return input;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear() + 543;
  const HH = String(d.getHours()).padStart(2, '0');
  const MM = String(d.getMinutes()).padStart(2, '0');
  const SS = String(d.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${HH}:${MM}:${SS}`;
}

// ★ ADD: การ์ดผลลัพธ์ (ใช้ class จาก globals.css: result-card, meta-chip ฯลฯ)
function ResultCard({ data, onEdit, anchorId }: { data: TransliterationSearchResult, onEdit: (row: TransliterationSearchResult) => void, anchorId?: string }) {
  const title =
    (data.meaning || data.originalScript1 || data.originalScript2 || data.otherFoundWords || data.romanization || '').trim();

  const langLabel = data.language ? `ภาษา${data.language}` : '';
  const countryCode = data.language ? languageToCountryCode[data.language] : undefined;
  const FlagSvg: ComponentType<SVGProps<SVGSVGElement>> | undefined =
    countryCode ? (FlagIcons as any)[countryCode] : undefined;

  const handleOpen = () => onEdit(data);

  return (
    <article id={anchorId} className="result-card w-full" role="button" tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); handleOpen(); } }}>
      {/* หัวเรื่องพร้อมอัญประกาศ + (notes) ต่อท้าย */}
      <h3 className="result-card__title">
        <span dangerouslySetInnerHTML={{ __html: title }} />
        {data.notes ? <span> ({data.notes})</span> : null}
      </h3>

      {/* แถวผลลัพธ์หลักแบบ 2 คอลัมน์: ซ้าย = ธง, ขวา = ข้อความ */}
      <div className="result-grid">
        <div className="result-flag-col">
          {FlagSvg ? (
            <FlagSvg
              className="meta-flag meta-flag--lg"
              role="img"
              aria-label={langLabel || undefined}
            />
          ) : (
            <div className="meta-flag meta-flag--lg" aria-hidden="true">🌐</div>
          )}
        </div>
        <div className="result-main-col">
          {/* ป้ายภาษา */}
          {langLabel && <span className="meta-chip meta-chip--lang">{langLabel}</span>}

          {/* บรรทัดโรมัน/คำทับศัพท์ */}
          {(data.romanization || data.transliteration1) && (
            <p className="result-card__roman">
              {data.romanization}
              {data.transliteration1 ? (
                <>
                  {data.romanization ? ', ' : null}
                  <span dangerouslySetInnerHTML={{ __html: data.transliteration1 }} />
                </>
              ) : null}
              {' '}
              <span>( คำทับศัพท์ : {data.transliteration1 || data.transliteration2 || '-'} )</span>
            </p>
          )}
        </div>
      </div>

      {/* ส่วนล่าง: ซ้าย = หมวดหมู่; ขวา = เวลาแก้ไขล่าสุด */}
      <div className="result-card__footer--split">
        <span className="text-md text-gray-600"><span className="font-bold mr-2">หมวดหมู่</span>{(data.category && data.category.trim() !== '' ? data.category : '-')}
        </span>
        <span className="text-md text-gray-600"><span className="font-bold mr-2">แหล่งอ้างอิง</span>{(data.referenceCriteria && data.referenceCriteria.trim() !== '' ? data.referenceCriteria : '-')}
        </span>
        {(data.updatedAt || data.formattedPublicationDate) && (
          <span className="result-card__timestamp">แก้ไขล่าสุดเมื่อ : {formatThaiDate(data.updatedAt || data.formattedPublicationDate)}</span>
        )}
      </div>
    </article>
  );
}

export default function SearchTransliterationPage() {
  const [query, setQuery] = useState('');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [results, setResults] = useState<TransliterationSearchResult[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [pageSize, setPageSize] = useState<number>(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ==== Modal & versioning states ====
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<TransliterationSearchResult | null>(null);
  const [editBase, setEditBase] = useState<TransliterationSearchResult | null>(null); // latest from API
  const [versions, setVersions] = useState<TransliterationVersionSnapshot[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>('current'); // 'current' | version number string
  const [editForm, setEditForm] = useState<EditFormState>(mapFromEntry({}));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ==== Bottom toolbar (zoom) ====
  const [zoom, setZoom] = useState(1);

  // ==== Sidebar (TOC) states ====
  const [tocQuery, setTocQuery] = useState("");

  // Build TOC items from results
  const tocItems = useMemo(() => {
    const strip = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    return results.map((row) => {
      const rawTitle = (row.meaning || row.originalScript1 || row.originalScript2 || row.otherFoundWords || row.romanization || "").trim();
      const label = strip(rawTitle) || `ID ${row.id}`;
      return { id: row.id, anchorId: `tl-${row.id}`, label };
    });
  }, [results]);

  const filteredToc = useMemo(() => {
    const q = tocQuery.trim();
    if (!q) return tocItems;
    try {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      return tocItems.filter((it) => re.test(it.label));
    } catch {
      return tocItems;
    }
  }, [tocItems, tocQuery]);

  const scrollToAnchor = (aid: string) => {
    const el = document.getElementById(aid);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToTop = () => {
    const topEl = document.getElementById("top");
    if (topEl) topEl.scrollIntoView({ behavior: "smooth", block: "start" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  };


  useEffect(() => {
    loadResults();
  }, []);

  const fetchResults = async (page = 1, size: number = pageSize) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.append('q', query.trim());
      if (languageFilter !== 'all') params.append('language', languageFilter);
      params.append('page', page.toString());
      params.append('pageSize', String(size));

      const response = await fetch(`/api/search-transliteration?${params.toString()}`);
      if (!response.ok) {
        let errorMsg = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch {}
        throw new Error(errorMsg);
      }
      const data = await response.json();
      setResults(data.results || []);
      setPagination(data.pagination || null);
    } catch (err) {
      console.error('Search transliteration error:', err);
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการค้นหาคำศัพท์ กรุณาลองใหม่อีกครั้ง');
      setResults([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  };

  const loadResults = async (page = 1, size: number = pageSize) => {
    await fetchResults(page, size);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await loadResults(1);
  };

  // --- Toolbar handlers (same behavior as dictionaries page) ---
  const changePage = (p: number) => {
    const cur = pagination?.currentPage ?? 1;
    const max = pagination?.totalPages ?? 1;
    const next = Math.min(Math.max(1, p), max);
    if (next !== cur) {
      loadResults(next, pageSize);
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
    }
  };
  const handlePageSizeChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const size = parseInt(e.target.value, 10) || 10;
    setPageSize(size);
    loadResults(1, size);
  };
  const zoomOut = () => setZoom(z => Math.max(0.8, +(z - 0.1).toFixed(2)));
  const zoomIn  = () => setZoom(z => Math.min(1.5, +(z + 0.1).toFixed(2)));
  // --- End toolbar handlers ---

  // === Open modal & load versions ===
  const openEdit = async (row: TransliterationSearchResult) => {
    setEditRow(row);
    setEditOpen(true);
    setEditBase(row);
    setVersions([]);
    setSelectedVersion('current');
    setEditForm(mapFromEntry(row));

    try {
      const res = await fetch(`/api/transliteration/${row.id}`);
      if (res.ok) {
        const j = await res.json();
        const base: Partial<TransliterationSearchResult> = j.data || row;
        const vers: TransliterationVersionSnapshot[] = j.versions || [];
        setEditBase(base as TransliterationSearchResult);
        setEditForm(mapFromEntry(base));
        setVersions(vers);
      }
    } catch (e) {
      console.warn('Load versions failed', e);
    }
  };

  const closeEdit = () => { setEditOpen(false); setEditRow(null); setSaveError(null); };

  // Build page numbers: 1 ... (current-2) (current-1) current (current+1) (current+2) ... total
  const pageNumbers = useMemo(() => {
    if (!pagination) return [] as (number | '…')[];
    const { currentPage, totalPages } = pagination;
    const pages: (number | '…')[] = [];
    const add = (n: number | '…') => pages.push(n);
    const pushRange = (s: number, e: number) => { for (let i = s; i <= e; i++) add(i); };

    if (totalPages <= 7) {
      pushRange(1, totalPages);
    } else {
      add(1);
      if (currentPage > 4) add('…');
      const start = Math.max(2, currentPage - 2);
      const end = Math.min(totalPages - 1, currentPage + 2);
      pushRange(start, end);
      if (currentPage < totalPages - 3) add('…');
      add(totalPages);
    }
    return pages;
  }, [pagination]);

  const totalResults = pagination?.total ?? results.length;

  return (
    <div className="reader-stage reader-stage--full">
      <Head>
        <meta charSet="UTF-8" />
        <title>ระบบฐานข้อมูลคำทับศัพท์ - สำนักงานราชบัณฑิตยสภา</title>
      </Head>
      <main className="px-4 md:px-6 lg:px-8 py-6">
        <div id="top" />
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "16px", alignItems: "start" }}>
          {/* Left sidebar (TOC) - hidden on small screens via CSS */}
          <aside className="reader-aside">
            <div className="aside-title">สารบัญคำศัพท์</div>
            <div className="aside-actions">
              <input
                className="aside-search"
                type="search"
                placeholder="ค้นหาในสารบัญ"
                value={tocQuery}
                onChange={(e) => setTocQuery(e.target.value)}
                aria-label="ค้นหาในสารบัญ"
              />
              <button type="button" className="aside-top-btn" title="เลื่อนกลับด้านบน" aria-label="เลื่อนกลับด้านบน" onClick={scrollToTop}>↑</button>
            </div>
            <ul className="aside-list">
              {filteredToc.map((it) => (
                <li key={it.anchorId}>
                  <button type="button" className="aside-link" onClick={() => scrollToAnchor(it.anchorId)}>
                    {it.label}
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* Right column: A4 page content (with border like dictionaries page) */}
          <section className="w-full bg-white/95 border border-border rounded-xl p-6 shadow-sm">
          <div className="a4-zoom-wrap" style={{ ['--reader-zoom' as any]: zoom }}>
          {/* Breadcrumb */}
          <nav aria-label="breadcrumb" className="mb-4">
            <ol className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <li>
                <Link href="/dictionaries" className="hover:underline">คลังคำทับศัพท์</Link>
              </li>
              <li className="text-gray-300">•</li>
              <li className="font-extrabold" style={{ color: 'var(--brand-gold)' }} aria-current="page">
                ค้นหาคำทับศัพท์
              </li>
            </ol>
          </nav>
          {/* Title */}
          <h1 className="text-2xl font-bold mb-6 text-center">ค้นหาคำทับศัพท์</h1>
          {/* Search Bar – rounded style */}
          <form onSubmit={handleSearch} className="mb-8" role="search" aria-label="ค้นหาคำทับศัพท์">
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
                placeholder="ระบุคำทับศัพท์"
                className="flex-grow border-none focus:ring-0 focus:outline-none text-base"
                aria-label="ช่องค้นหาคำทับศัพท์"
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

          {/* State messages */}
          {loading && !error && (
            <div className="brand-card text-center py-12">
              <div className="spinner mx-auto mb-4" />
              <p>กำลังค้นหาคำศัพท์...</p>
            </div>
          )}

          {error && (
            <div className="alert alert--danger" role="alert">
              <strong>เกิดข้อผิดพลาด:</strong> {error}
            </div>
          )}

          {!loading && !error && (
            <section aria-label="ผลการค้นหา">
              {/* Summary header */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">ผลการค้นหาคำทับศัพท์</h2>
                <span className="text-sm text-gray-600">{totalResults} รายการ • {pagination?.currentPage ?? 1}/{pagination?.totalPages ?? 1} หน้า</span>
              </div>

              <section className="w-full space-y-6">
                {results.length === 0 ? (
                  <div className="brand-card p-6 text-center text-gray-600">ไม่พบผลการค้นหา</div>
                ) : (
                  results.map((row: TransliterationSearchResult) => (
                    <ResultCard key={row.id} anchorId={`tl-${row.id}`} data={row} onEdit={openEdit} />
                  ))
                )}
              </section>

              {/* Pagination */}
              {/* Pagination replaced by bottom toolbar */}
            </section>
          )}
          {/* Bottom Toolbar */}
          </div>
          <div className="a4-toolbar" role="toolbar" aria-label="เครื่องมือผลการค้นหา">
            <div className="toolbar-section toolbar-section--left">
              <button type="button" className="btn-icon" onClick={zoomOut} title="ย่อ (-)">
                <span aria-hidden="true">−</span>
              </button>
              <span className="zoom-value">{Math.round(zoom * 100)}%</span>
              <button type="button" className="btn-icon" onClick={zoomIn} title="ขยาย (+)">
                <span aria-hidden="true">+</span>
              </button>
            </div>

            <div className="toolbar-section toolbar-section--pager">
              <button
                type="button"
                className="btn-secondary btn--sm"
                onClick={() => changePage((pagination?.currentPage ?? 1) - 1)}
                disabled={!pagination?.hasPrevPage}
                title="หน้าก่อนหน้า"
              >
                ก่อนหน้า
              </button>
              <span className="mx-2 text-sm text-gray-600">
                หน้า {pagination?.currentPage ?? 1} / {pagination?.totalPages ?? '—'}
              </span>
              <button
                type="button"
                className="btn-secondary btn--sm"
                onClick={() => changePage((pagination?.currentPage ?? 1) + 1)}
                disabled={!pagination?.hasNextPage}
                title="หน้าถัดไป"
              >
                ถัดไป
              </button>
            </div>

            <div className="toolbar-section toolbar-section--right">
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
          </div>
    
        {editOpen && editRow && (
          <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="แก้ไขคำทับศัพท์">
            <div className="modal">
              <div className="modal__header">
                <h3 className="modal__title">แก้ไขข้อมูลคำทับศัพท์ (ID: {editRow.id})</h3>
                {/* Version dropdown */}
                <div className="flex items-center gap-2 ml-auto">
                  <label className="form-label" htmlFor="versionSelect">เวอร์ชัน</label>
                  <select
                    id="versionSelect"
                    className="select"
                    value={selectedVersion}
                    onChange={(e) => {
                      const val = e.target.value; // 'current' | version as string
                      setSelectedVersion(val);
                      if (val === 'current') {
                        setEditForm(mapFromEntry(editBase || editRow));
                      } else {
                        const vNum = Number(val);
                        const snap = versions.find(v => v.version === vNum);
                        setEditForm(mapFromVersion(snap));
                      }
                    }}
                  >
                    <option value="current">เวอร์ชันล่าสุด (ฐานข้อมูลปัจจุบัน)</option>
                    {versions.sort((a,b)=> b.version - a.version).map(v => {
                      const ts = v.changedAt || v.changed_at || v.updatedAt || v.createdAt || '';
                      return (
                        <option key={v.version} value={String(v.version)}>
                          รุ่น {v.version} • {formatThaiDate(ts)}
                        </option>
                      );
                    })}
                    </select>
                  <button className="btn-icon" aria-label="ปิด" onClick={closeEdit}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M6.22 6.22a.75.75 0 0 1 1.06 0L12 10.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L13.06 12l4.72 4.72a.75.75 0 1 1-1.06 1.06L12 13.06l-4.72 4.72a.75.75 0 1 1-1.06-1.06L10.94 12 6.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd"/></svg>
                </button>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if(!editRow) return;
                  setSaving(true); setSaveError(null);
                  try{
                    const payload = {
                      romanization: editForm.romanization,
                      originalScript1: editForm.originalScript1,
                      originalScript2: editForm.originalScript2,
                      language: editForm.language,
                      wordType: editForm.wordType,
                      category: editForm.category,
                      transliteration1: editForm.transliteration1,
                      transliteration2: editForm.transliteration2,
                      meaning: editForm.meaning,
                      notes: editForm.notes,
                      referenceCriteria: editForm.referenceCriteria,
                      createNewVersion: true,
                    };
                    const res = await fetch(`/api/transliteration/${editRow.id}`,{
                      method:'PUT', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload)
                    });
                    if(!res.ok){ let m = 'บันทึกไม่สำเร็จ'; try{ const j = await res.json(); m = j.error || m; }catch{} throw new Error(m); }
                    await loadResults(pagination?.currentPage || 1);
                    closeEdit();
                  }catch(err:any){ setSaveError(err.message || 'เกิดข้อผิดพลาดระหว่างบันทึก'); }
                  finally{ setSaving(false); }
                }}
              >
                <div className="modal__body">
                  <div className="form-grid">
                    <div>
                      <label className="form-label">ภาษา</label>
                      <input name="language" value={editForm.language} onChange={e=>setEditForm(p=>({...p, language:e.target.value}))} className="input" />
                    </div>
                    <div>
                      <label className="form-label">ชนิดคำ/Word Type</label>
                      <input name="wordType" value={editForm.wordType} onChange={e=>setEditForm(p=>({...p, wordType:e.target.value}))} className="input" />
                    </div>
                    <div>
                      <label className="form-label">Romanization</label>
                      <input name="romanization" value={editForm.romanization} onChange={e=>setEditForm(p=>({...p, romanization:e.target.value}))} className="input" />
                    </div>
                    <div>
                      <label className="form-label">คำทับศัพท์ 1</label>
                      <input name="transliteration1" value={editForm.transliteration1} onChange={e=>setEditForm(p=>({...p, transliteration1:e.target.value}))} className="input" />
                    </div>
                    <div>
                      <label className="form-label">คำทับศัพท์ 2</label>
                      <input name="transliteration2" value={editForm.transliteration2} onChange={e=>setEditForm(p=>({...p, transliteration2:e.target.value}))} className="input" />
                    </div>
                    <div>
                      <label className="form-label">หมวดหมู่</label>
                      <input name="category" value={editForm.category} onChange={e=>setEditForm(p=>({...p, category:e.target.value}))} className="input" />
                    </div>

                    <div>
                      <label className="form-label">ต้นฉบับ (สคริปต์ 1)</label>
                      <input name="originalScript1" value={editForm.originalScript1} onChange={e=>setEditForm(p=>({...p, originalScript1:e.target.value}))} className="input" />
                    </div>
                    <div>
                      <label className="form-label">ต้นฉบับ (สคริปต์ 2)</label>
                      <input name="originalScript2" value={editForm.originalScript2} onChange={e=>setEditForm(p=>({...p, originalScript2:e.target.value}))} className="input" />
                    </div>

                    <div className="col-span-2">
                      <label className="form-label">ความหมาย</label>
                      <textarea name="meaning" value={editForm.meaning} onChange={e=>setEditForm(p=>({...p, meaning:e.target.value}))} className="textarea" />
                    </div>
                    <div className="col-span-2">
                      <label className="form-label">หมายเหตุ</label>
                      <textarea name="notes" value={editForm.notes} onChange={e=>setEditForm(p=>({...p, notes:e.target.value}))} className="textarea" />
                    </div>
                    <div className="col-span-2">
                      <label className="form-label">เกณฑ์อ้างอิง (referenceCriteria)</label>
                      <input name="referenceCriteria" value={editForm.referenceCriteria} onChange={e=>setEditForm(p=>({...p, referenceCriteria:e.target.value}))} className="input" />
                    </div>
                  </div>
                  {saveError && <p className="mt-3 text-red-600">{saveError}</p>}
                </div>
                <div className="modal__footer">
                  <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'กำลังบันทึก…' : 'บันทึกเป็นเวอร์ชันใหม่'}</button>
                </div>
              </form>
            </div>
          </div> </div>
        )}
          </section>
        </div>{/* end grid (aside + sheet) */}
      </main>
      <style jsx global>{`
        .a4-zoom-wrap {
          transform: scale(var(--reader-zoom, 1));
          transform-origin: top center;
          transition: transform 160ms ease;
        }
        .a4-toolbar {
          position: sticky;
          bottom: 0;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
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
        .a4-toolbar .toolbar-section--left { justify-self: start; }
        .a4-toolbar .toolbar-section--pager { justify-self: center; }
        .a4-toolbar .toolbar-section--right { justify-self: end; }
        .a4-toolbar .btn-icon {
          width: 32px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #dcdcdc;
          border-radius: 8px;
          background: #fafafa;
          cursor: pointer;
        }
        .a4-toolbar .btn-icon:hover { background: #f3f3f3; }
        .a4-toolbar .zoom-value {
          min-width: 42px;
          text-align: center;
          font-variant-numeric: tabular-nums;
        }
      `}</style>
    </div>
  );
}