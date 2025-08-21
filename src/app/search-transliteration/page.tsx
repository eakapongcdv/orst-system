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

// อนุญาตเฉพาะ <mark>...</mark> ที่เหลือ escape ทั้งหมด (กัน XSS)
function allowMark(input?: string | null): string {
  if (input == null) return '';
  const s = String(input);
  const escaped = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .replace(/&lt;mark&gt;/gi, '<mark>')
    .replace(/&lt;\/mark&gt;/gi, '</mark>');
}
// ตัวช่วยสำหรับ JSX
const MarkHTML = ({ text }: { text?: string | null }) => (
  <span dangerouslySetInnerHTML={{ __html: allowMark(text) }} />
);

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
        <MarkHTML text={title} />
        {data.notes ? (
          <span dangerouslySetInnerHTML={{ __html: ` (${allowMark(data.notes)})` }} />
        ) : null}
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
              <MarkHTML text={data.romanization || ''} />
              {data.transliteration1 ? (
                <>
                  {data.romanization ? ', ' : null}
                  <span dangerouslySetInnerHTML={{ __html: allowMark(data.transliteration1 || '') }} />
                </>
              ) : null}
              {' '}
              <span
                dangerouslySetInnerHTML={{
                  __html: `( คำทับศัพท์ : ${allowMark(data.transliteration1 || data.transliteration2 || '-')})`,
                }}
              />
            </p>
          )}
        </div>
      </div>

      {/* ส่วนล่าง: ซ้าย = หมวดหมู่; ขวา = เวลาแก้ไขล่าสุด */}
      <div className="result-card__footer--split">
        <span className="text-md text-gray-600">
          <span className="font-bold mr-2">หมวดหมู่</span>
          <MarkHTML text={(data.category && data.category.trim() !== '' ? data.category : '-')} />
        </span>
        <span className="text-md text-gray-600">
          <span className="font-bold mr-2">แหล่งอ้างอิง</span>
          <MarkHTML text={(data.referenceCriteria && data.referenceCriteria.trim() !== '' ? data.referenceCriteria : '-')} />
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

  // ==== Bottom toolbar (font size) ====
  const [fontScale, setFontScale] = useState(1);

  // ==== Sidebar (TOC) states ====
  const [tocQuery, setTocQuery] = useState("");

  // ==== Sidebar toggle & font scale ====
  const [asideOpen, setAsideOpen] = useState(true);

  // Popular searches
  const [popular, setPopular] = useState<{ term: string; count: number }[]>([]);

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


  // --- Popular search helpers (API with localStorage fallback) ---
  const POP_KEY = 'tl_popular_terms';
  const readLocalPopular = (): Record<string, number> => {
    try { return JSON.parse(localStorage.getItem(POP_KEY) || '{}'); } catch { return {}; }
  };
  const writeLocalPopular = (obj: Record<string, number>) => {
    try { localStorage.setItem(POP_KEY, JSON.stringify(obj)); } catch {}
  };
  const loadPopular = async () => {
    // Try API first
    try {
      const r = await fetch('/api/search-transliteration/popular', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        const arr: { term: string; count: number }[] =
          Array.isArray(j?.popular) ? j.popular :
          Array.isArray(j) ? j :
          [];
        if (arr.length) { setPopular(arr.slice(0, 10)); return; }
      }
    } catch {}
    // Fallback to local
    const obj = readLocalPopular();
    const arr = Object.entries(obj).map(([term, count]) => ({ term, count: Number(count) }))
      .sort((a,b) => b.count - a.count)
      .slice(0, 10);
    setPopular(arr);
  };
  const trackSearch = async (term: string) => {
    const q = term.trim();
    if (!q) return;
    try {
      await fetch('/api/search-transliteration/popular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: q })
      });
    } catch {}
    const obj = readLocalPopular();
    obj[q] = (obj[q] || 0) + 1;
    writeLocalPopular(obj);
  };

  useEffect(() => {
    loadResults();
    try { loadPopular(); } catch {}
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
    trackSearch(query);
    loadPopular();
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
  const fontDown = () => setFontScale(s => Math.max(0.9, +(s - 0.1).toFixed(2)));
  const fontUp   = () => setFontScale(s => Math.min(1.4, +(s + 0.1).toFixed(2)));
  const fontReset = () => setFontScale(1);
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
        <div
          className="reader-layout"
          style={{
            ['--aside-w' as any]: asideOpen ? '260px' : '48px',
            ['--reader-font-scale' as any]: fontScale,
          }}
        >
          {/* Left sidebar (TOC) - hidden on small screens via CSS */}
          <aside className={`reader-aside ${asideOpen ? 'is-open' : 'is-collapsed'}`}>
            <div className="aside-header">
              <div className="aside-title">สารบัญคำศัพท์</div>
              <button
                type="button"
                className="aside-toggle"
                aria-label={asideOpen ? 'พับแถบสารบัญ' : 'ขยายแถบสารบัญ'}
                aria-expanded={asideOpen}
                onClick={() => setAsideOpen(o => !o)}
                title={asideOpen ? 'พับ' : 'ขยาย'}
              >
                {asideOpen ? '«' : '»'}
              </button>
            </div>
            <div className="aside-body">
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
            </div>
          </aside>

          {/* Right column: A4 page content (with border like dictionaries page) */}
          <section className="w-full bg-white/95 border border-border rounded-xl p-6 shadow-sm">
          <div className="content-scale">
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
          {/* Popular searches */}
          {popular.length > 0 && (
            <div className="popular-wrap">
              <div className="popular-title">คำค้นหายอดนิยม</div>
              <div className="popular-list">
                {popular.map((p) => (
                  <button
                    key={p.term}
                    type="button"
                    className="popular-chip"
                    onClick={() => { setQuery(p.term); loadResults(1); }}
                    title={`${p.term} (${p.count})`}
                  >
                    {p.term}
                  </button>
                ))}
              </div>
            </div>
          )}

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
            {/* Left: font size controls */}
            <div className="toolbar-section toolbar-section--left">
              <button
                type="button"
                className="btn-icon"
                onClick={fontDown}
                title="ลดขนาดตัวอักษร"
                aria-label="ลดขนาดตัวอักษร"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <path d="M5 12.75a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H5.75a.75.75 0 0 1-.75-.75z"></path>
                </svg>
              </button>

              <span className="zoom-badge" aria-live="polite">{Math.round(fontScale * 100)}%</span>

              <button
                type="button"
                className="btn-icon"
                onClick={fontUp}
                title="เพิ่มขนาดตัวอักษร"
                aria-label="เพิ่มขนาดตัวอักษร"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <path d="M11.25 5a.75.75 0 0 1 1.5 0v5.25H18a.75.75 0 0 1 0 1.5h-5.25V17a.75.75 0 0 1-1.5 0v-5.25H6a.75.75 0 0 1 0-1.5h5.25V5Z"></path>
                </svg>
              </button>

              <button
                type="button"
                className="btn-icon btn-icon--ghost"
                onClick={fontReset}
                title="รีเซ็ตขนาดตัวอักษร (100%)"
                aria-label="รีเซ็ตขนาดตัวอักษร"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M12 4.5a7.5 7.5 0 1 0 6.59 11.13.75.75 0 1 1 1.29.74A9 9 0 1 1 12 3v1.5Zm0 0a.75.75 0 0 1 0-1.5h6a.75.75 0 0 1 .75.75v6a.75.75 0 0 1-1.5 0V5.56l-3.97 3.97a.75.75 0 1 1-1.06-1.06L16.19 4.5H12Z" clipRule="evenodd"/>
                </svg>
              </button>
            </div>

            {/* Middle: pager */}
            <div className="toolbar-section toolbar-section--pager">
              <button
                type="button"
                className="btn-icon"
                onClick={() => changePage(1)}
                disabled={!pagination?.hasPrevPage}
                title="หน้าแรก"
                aria-label="หน้าแรก"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <path d="M16.47 12.53a.75.75 0 0 1 0-1.06l4.22-4.22a.75.75 0 0 1 1.28.53v8.44a.75.75 0 0 1-1.28.53l-4.22-4.22Z"></path>
                  <path d="M11.47 12.53a.75.75 0 0 1 0-1.06l6.22-6.22a.75.75 0 0 1 1.28.53v12.38a.75.75 0 0 1-1.28.53l-6.22-6.22Z"></path>
                </svg>
              </button>
              <button
                type="button"
                className="btn-icon"
                onClick={() => changePage((pagination?.currentPage ?? 1) - 1)}
                disabled={!pagination?.hasPrevPage}
                title="หน้าก่อนหน้า"
                aria-label="หน้าก่อนหน้า"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <path d="M15.78 5.72a.75.75 0 0 1 0 1.06L10.56 12l5.22 5.22a.75.75 0 0 1-1.06 1.06l-5.75-5.75a.75.75 0 0 1 0-1.06l5.75-5.75a.75.75 0 0 1 1.06 0Z"></path>
                </svg>
              </button>

              <span className="page-indicator" aria-live="polite">
                {pagination?.currentPage ?? 1} / {pagination?.totalPages ?? '—'}
              </span>

              <button
                type="button"
                className="btn-icon"
                onClick={() => changePage((pagination?.currentPage ?? 1) + 1)}
                disabled={!pagination?.hasNextPage}
                title="หน้าถัดไป"
                aria-label="หน้าถัดไป"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <path d="M8.22 18.28a.75.75 0 0 1 0-1.06L13.44 12 8.22 6.78a.75.75 0 1 1 1.06-1.06l5.75 5.75a.75.75 0 0 1 0 1.06l-5.75 5.75a.75.75 0 0 1-1.06 0Z"></path>
                </svg>
              </button>
              <button
                type="button"
                className="btn-icon"
                onClick={() => changePage(pagination?.totalPages || 1)}
                disabled={!pagination?.hasNextPage}
                title="หน้าสุดท้าย"
                aria-label="หน้าสุดท้าย"
              >
                
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <path d="M7.53 11.47a.75.75 0 0 1 0 1.06l-4.22 4.22a.75.75 0 0 1-1.28-.53V7.78a.75.75 0 0 1 1.28-.53l4.22 4.22Z"></path>
                  <path d="M12.53 11.47a.75.75 0 0 1 0 1.06l-6.22 6.22a.75.75 0 0 1-1.28-.53V5.78a.75.75 0 0 1 1.28-.53l6.22 6.22Z"></path>
                </svg>
              </button>
            </div>

            {/* Right: page size */}
            <div className="toolbar-section toolbar-section--right">
              <div className="select-wrap" title="จำนวนรายการต่อหน้า">
                <svg className="select-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
                  <path d="M4 6.75A.75.75 0 0 1 4.75 6h14.5a.75.75 0 0 1 0 1.5H4.75A.75.75 0 0 1 4 6.75Zm0 5A.75.75 0 0 1 4.75 11h10.5a.75.75 0 0 1 0 1.5H4.75A.75.75 0 0 1 4 11.75Zm0 5A.75.75 0 0 1 4.75 16h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 4 16.75Z"></path>
                </svg>
                <select
                  className="select-compact"
                  value={pageSize}
                  onChange={handlePageSizeChange}
                  aria-label="จำนวนรายการต่อหน้า"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
          </div>
    
        {editOpen && editRow && (
          <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="แก้ไขคำทับศัพท์">
            <div className="modal modal--lg">
              <div className="modal__header">
                <div className="modal__titles">
                  <h3 className="modal__title">แก้ไขคำทับศัพท์</h3>
                  <p className="modal__subtitle">
                    ID: {editRow.id}
                    {editRow.language ? <><span className="dot">•</span>ภาษา{editRow.language}</> : null}
                    {editRow.wordType ? <><span className="dot">•</span>{editRow.wordType}</> : null}
                  </p>
                </div>

                <div className="modal__actions">
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

                  <button className="btn-icon btn-icon--ghost" aria-label="ปิด" onClick={closeEdit}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M6.22 6.22a.75.75 0 0 1 1.06 0L12 10.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L13.06 12l4.72 4.72a.75.75 0 1 1-1.06 1.06L12 13.06l-4.72 4.72a.75.75 0 1 1-1.06-1.06L10.94 12 6.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd"/>
                    </svg>
                  </button>
                </div>
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
                  {/* Section: ภาษาและหมวดหมู่ */}
                  <div className="form-section">
                    <h4 className="form-section__title">ภาษาและหมวดหมู่</h4>
                    <div className="form-grid">
                      <div>
                        <label className="form-label">ภาษา</label>
                        <input name="language" value={editForm.language} onChange={e=>setEditForm(p=>({...p, language:e.target.value}))} className="input" />
                      </div>
                      <div>
                        <label className="form-label">ชนิดคำ (Word Type)</label>
                        <input name="wordType" value={editForm.wordType} onChange={e=>setEditForm(p=>({...p, wordType:e.target.value}))} className="input" />
                      </div>
                      <div className="col-span-2">
                        <label className="form-label">หมวดหมู่</label>
                        <input name="category" value={editForm.category} onChange={e=>setEditForm(p=>({...p, category:e.target.value}))} className="input" />
                      </div>
                    </div>
                  </div>

                  {/* Section: การทับศัพท์ */}
                  <div className="form-section">
                    <h4 className="form-section__title">การทับศัพท์</h4>
                    <div className="form-grid">
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
                      <div className="col-span-2">
                        <label className="form-label">เกณฑ์อ้างอิง (referenceCriteria)</label>
                        <input name="referenceCriteria" value={editForm.referenceCriteria} onChange={e=>setEditForm(p=>({...p, referenceCriteria:e.target.value}))} className="input" />
                      </div>
                    </div>
                  </div>

                  {/* Section: ต้นฉบับ (สคริปต์) */}
                  <div className="form-section">
                    <h4 className="form-section__title">ต้นฉบับ (สคริปต์)</h4>
                    <div className="form-grid">
                      <div>
                        <label className="form-label">ต้นฉบับ (สคริปต์ 1)</label>
                        <input name="originalScript1" value={editForm.originalScript1} onChange={e=>setEditForm(p=>({...p, originalScript1:e.target.value}))} className="input" />
                      </div>
                      <div>
                        <label className="form-label">ต้นฉบับ (สคริปต์ 2)</label>
                        <input name="originalScript2" value={editForm.originalScript2} onChange={e=>setEditForm(p=>({...p, originalScript2:e.target.value}))} className="input" />
                      </div>
                    </div>
                  </div>

                  {/* Section: รายละเอียด */}
                  <div className="form-section">
                    <h4 className="form-section__title">รายละเอียด</h4>
                    <div className="form-grid">
                      <div className="col-span-2">
                        <label className="form-label">ความหมาย</label>
                        <textarea name="meaning" value={editForm.meaning} onChange={e=>setEditForm(p=>({...p, meaning:e.target.value}))} className="textarea" rows={2} />
                      </div>
                      <div className="col-span-2">
                        <label className="form-label">หมายเหตุ</label>
                        <textarea name="notes" value={editForm.notes} onChange={e=>setEditForm(p=>({...p, notes:e.target.value}))} className="textarea" rows={2} />
                      </div>
                    </div>
                  </div>

                  {saveError && <p className="mt-3 text-red-600">{saveError}</p>}
                </div>

                <div className="modal__footer">
                  <button type="button" className="btn-secondary" onClick={closeEdit}>ยกเลิก</button>
                  <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'กำลังบันทึก…' : 'บันทึกเป็นเวอร์ชันใหม่'}</button>
                </div>
              </form>
            </div>
          </div>
        )}
          </section>
        </div>{/* end grid (aside + sheet) */}
      </main>
      <style jsx global>{`
        .content-scale,
        .reader-aside{
          font-size: calc(1rem * var(--reader-font-scale, 1));
          line-height: 1.6;
        }
        .content-scale .result-card__title{ font-size: 1.15em; }
        /* Responsive reader layout with collapsible aside */
        .reader-layout{
          display: grid;
          grid-template-columns: var(--aside-w, 260px) 1fr;
          gap: 16px;
          align-items: start;
        }
        @media (max-width: 1024px){
          .reader-layout{ grid-template-columns: 1fr; }
          .reader-aside{ display: none; }
        }
        .reader-aside{
          position: sticky;
          top: 10px;
          align-self: start;
          height: calc(100vh - 20px);
          border: 1px solid var(--brand-border);
          border-radius: 12px;
          background: #fff;
          padding: 10px;
          overflow: hidden;
        }
        .reader-aside .aside-header{
          display: flex; align-items: center; justify-content: space-between;
          gap: 8px; margin-bottom: 8px;
        }
        .reader-aside .aside-title{ font-weight: 800; color: #0a4376; }
        .reader-aside .aside-toggle{
          width: 28px; height: 28px; border: 1px solid var(--brand-border);
          border-radius: 8px; background: #fafafa; cursor: pointer;
        }
        .reader-aside .aside-actions{ display:flex; gap:8px; }
        .reader-aside .aside-search{
          flex:1; border:1px solid var(--brand-border); border-radius:10px; padding:.4rem .6rem;
        }
        .reader-aside .aside-top-btn{
          width:32px; height:32px; border:1px solid var(--brand-border); border-radius:8px; background:#fff;
        }
        .reader-aside .aside-list{
          margin-top:8px; overflow:auto; height: calc(100% - 84px); padding-right:4px;
        }
        .reader-aside .aside-link{
          display:block; width:100%; text-align:left; padding:.35rem .5rem; border-radius:8px; border:1px solid transparent;
        }
        .reader-aside .aside-link:hover{ background:#f9fafb; border-color: var(--brand-border); }

        .reader-aside.is-collapsed{ width: 48px !important; padding: 8px; }
        .reader-aside.is-collapsed .aside-title,
        .reader-aside.is-collapsed .aside-body{ display:none; }

        /* Popular searches under search bar */
        .popular-wrap{
          display:flex; flex-direction:column; align-items:center; gap:.5rem;
          margin-top:-.5rem; margin-bottom:1rem;
        }
        .popular-title{ font-size:.9rem; color: var(--muted-ink); font-weight:700; }
        .popular-list{ display:flex; flex-wrap:wrap; gap:.5rem; justify-content:center; }
        .popular-chip{
          font-size: .9rem;
          padding:.3rem .6rem; border-radius:999px; border:1px solid var(--brand-border);
          background:#fff; box-shadow: 0 1px 0 rgba(0,0,0,.02); cursor:pointer;
        }
        .popular-chip:hover{ background: color-mix(in srgb, var(--brand-gold) 10%, #fff); }
        .a4-toolbar {
          position: sticky;
          bottom: 0;
          z-index: 20;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          margin-top: 10px;
          background: color-mix(in srgb, #fff 86%, rgba(255,255,255,.35));
          backdrop-filter: saturate(1.15) blur(8px);
          -webkit-backdrop-filter: saturate(1.15) blur(8px);
          border: 1px solid var(--brand-border);
          border-top: 3px solid var(--brand-gold);
          border-radius: 12px;
          box-shadow: 0 -6px 18px rgba(0,0,0,0.06);
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

        /* Icon button */
        .a4-toolbar .btn-icon{
          width: 36px;
          height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid color-mix(in srgb, var(--brand-gold) 35%, #dcdcdc);
          border-radius: 10px;
          background: linear-gradient(180deg, #ffffff, #f6f7f9);
          box-shadow: 0 1px 0 rgba(255,255,255,.7), 0 1px 4px rgba(0,0,0,.06);
          cursor: pointer;
          transition: transform .06s ease, box-shadow .15s ease, background .15s ease, border-color .15s ease;
          color: #334155;
        }
        .a4-toolbar .btn-icon:hover{
          background: linear-gradient(180deg, #fffefd, #f0f4f8);
          box-shadow: 0 2px 10px rgba(0,0,0,.08);
          transform: translateY(-1px);
          border-color: color-mix(in srgb, var(--brand-gold) 55%, #cfcfcf);
        }
        .a4-toolbar .btn-icon:active{ transform: translateY(0); }
        .a4-toolbar .btn-icon[disabled],
        .a4-toolbar .btn-icon[disabled]:hover{
          opacity: .45;
          cursor: default;
          transform: none;
          box-shadow: 0 1px 0 rgba(255,255,255,.6), 0 1px 3px rgba(0,0,0,.04);
          background: #f5f5f5;
        }
        .a4-toolbar .btn-icon--ghost{
          background: #ffffff;
          border-color: #e6e6e6;
        }
        .a4-toolbar .btn-icon--ghost:hover{
          background: #fafafa;
          border-color: color-mix(in srgb, var(--brand-gold) 35%, #ddd);
        }

        /* Badges */
        .a4-toolbar .zoom-badge,
        .a4-toolbar .page-indicator{
          min-width: 64px;
          padding: .25rem .6rem;
          border-radius: 999px;
          background: color-mix(in srgb, var(--brand-gold) 10%, #fff);
          border: 1px solid color-mix(in srgb, var(--brand-gold) 45%, transparent);
          font-variant-numeric: tabular-nums;
          text-align: center;
          font-weight: 800;
          color: #334155;
        }
        .a4-toolbar .page-indicator{ min-width: 88px; }

        /* Compact select with icon */
        .a4-toolbar .select-wrap{
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px;
          border: 1px solid color-mix(in srgb, var(--brand-gold) 35%, #dcdcdc);
          border-radius: 999px;
          background: #fff;
          box-shadow: 0 1px 0 rgba(255,255,255,.7);
        }
        .a4-toolbar .select-icon{ opacity: .8; }
        .a4-toolbar .select-compact{
          border: none;
          background: transparent;
          outline: none;
          padding: 4px 4px 4px 0;
          font-weight: 700;
          color: #111827;
        }
        .a4-toolbar .select-compact:focus{
          outline: 2px solid color-mix(in srgb, var(--brand-gold) 45%, transparent);
          outline-offset: 2px;
          border-radius: 6px;
        }

        /* ---- Modal enhanced styling ---- */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(10, 67, 118, 0.35);
          backdrop-filter: blur(5px) saturate(1.15);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          z-index: 60;
        }
        .modal {
          width: min(100%, 920px);
          max-height: 90vh;
          background: #fff;
          border: 1px solid #e6e6e6;
          border-radius: 16px;
          box-shadow: 0 10px 30px rgba(0,0,0,.15);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .modal--lg { width: min(100%, 980px); }
        .modal__header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 18px;
          border-bottom: 1px solid #efefef;
          background: linear-gradient(180deg, #fafafa, #fff);
        }
        .modal__titles {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .modal__title {
          margin: 0;
          font-size: 1.125rem;
          font-weight: 800;
          color: #0a4376;
        }
        .modal__subtitle {
          margin: 0;
          font-size: .85rem;
          color: #667084;
        }
        .modal__subtitle .dot {
          display: inline-block;
          margin: 0 .5ch;
          color: #c0c4cc;
        }
        .modal__actions {
          margin-left: auto;
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }
        .btn-icon--ghost {
          background: transparent !important;
          border-color: transparent !important;
        }
        .modal__body {
          padding: 16px 18px;
          overflow: auto;
          flex: 1;
          background: #fff;
        }
        .modal__footer {
          padding: 12px 18px;
          border-top: 1px solid #efefef;
          background: #fafafa;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }

        /* ---- Form sections ---- */
        .form-section { 
          margin-bottom: 18px; 
          padding-bottom: 8px; 
          border-bottom: 1px dashed #eee; 
        }
        .form-section__title {
          margin: 0 0 10px 0;
          font-weight: 700;
          font-size: .95rem;
          color: #0a4376;
        }
        .form-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }
        .form-grid .col-span-2 { grid-column: 1 / -1; }
        @media (min-width: 768px) {
          .form-grid { grid-template-columns: 1fr 1fr; }
        }
        /* Compact inputs */
        .input, .textarea, .select, .form-select {
          width: 100%;
        }
        /* Highlight style for &lt;mark&gt; */
        mark{
          background: #fff2a8;
          border-radius: .2em;
        }
      `}</style>
    </div>
  );
}
       