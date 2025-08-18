// app/search-transliteration/page.tsx
"use client";
import { useState, useEffect, useMemo, useRef } from 'react';
import Head from 'next/head';
import * as FlagIcons from 'country-flag-icons/react/3x2';

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
function ResultCard({ data, onEdit }: { data: TransliterationSearchResult, onEdit: (row: TransliterationSearchResult) => void }) {
  const title =
    (data.meaning || data.originalScript1 || data.originalScript2 || data.otherFoundWords || data.romanization || '').trim();

  const langLabel = data.language ? `ภาษา${data.language}` : '';
  const countryCode = data.language ? languageToCountryCode[data.language] : undefined;
  const FlagSvg: React.ComponentType<React.SVGProps<SVGSVGElement>> | undefined =
    countryCode ? (FlagIcons as any)[countryCode] : undefined;

  const handleOpen = () => onEdit(data);

  return (
    <article className="result-card mx-auto max-w-5xl" role="button" tabIndex={0}
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
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<TransliterationSearchResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Language dropdown state & ref
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadResults();
  }, []);

  // Close lang panel on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!langRef.current) return;
      if (!langRef.current.contains(e.target as Node)) setLangOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Language options for dropdown
  const LANG_OPTIONS: { value: string; label: string; code?: string }[] = [
    { value: 'all', label: 'ทุกภาษา' },
    { value: 'อาหรับ', label: 'ภาษาอาหรับ', code: 'SA' },
    { value: 'พม่า', label: 'ภาษาพม่า', code: 'MM' },
    { value: 'จีน', label: 'ภาษาจีน', code: 'CN' },
    { value: 'อังกฤษ', label: 'ภาษาอังกฤษ', code: 'GB' },
    { value: 'ฝรั่งเศส', label: 'ภาษาฝรั่งเศส', code: 'FR' },
    { value: 'เยอรมัน', label: 'ภาษาเยอรมัน', code: 'DE' },
    { value: 'ฮินดี', label: 'ภาษาฮินดี', code: 'IN' },
    { value: 'อินโดนีเซีย', label: 'ภาษาอินโดนีเซีย', code: 'ID' },
    { value: 'อิตาลี', label: 'ภาษาอิตาลี', code: 'IT' },
    { value: 'ญี่ปุ่น', label: 'ภาษาญี่ปุ่น', code: 'JP' },
    { value: 'เกาหลี', label: 'ภาษาเกาหลี', code: 'KR' },
    { value: 'มลายู', label: 'ภาษามลายู', code: 'MY' },
    { value: 'รัสเซีย', label: 'ภาษารัสเซีย', code: 'RU' },
    { value: 'สเปน', label: 'ภาษาสเปน', code: 'ES' },
    { value: 'เวียดนาม', label: 'ภาษาเวียดนาม', code: 'VN' },
  ];

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

  const openEdit = (row: TransliterationSearchResult) => { setEditRow(row); setEditOpen(true); };
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
    <div className="a4-shell bg-brand-pattern-light">
      <Head>
        <meta charSet="UTF-8" />
        <title>ระบบฐานข้อมูลคำทับศัพท์ - สำนักงานราชบัณฑิตยสภา</title>
      </Head>
      <main className="a4-container py-8">
        <div className="a4-sheet">
          {/* Title */}
          <h1 className="section-title text-center mb-6">ค้นหาคำทับศัพท์</h1>

          {/* Search Bar – V layout (button | input | icons) */}
          <form onSubmit={handleSearch} className="mb-8" role="search" aria-label="ค้นหาคำทับศัพท์">
            <div className="searchbar-v searchbar-v--tight searchbar-v--neo">
              {/* Language button + panel */}
              <div className="searchbar-v__lang" ref={langRef}>
                <button
                  type="button"
                  className="lang-btn-v"
                  aria-haspopup="listbox"
                  aria-expanded={langOpen}
                  onClick={() => setLangOpen(v => !v)}
                >
                  {(() => {
                    const active = LANG_OPTIONS.find(o => o.value === languageFilter);
                    const code = active?.code;
                    const ActiveFlag = code ? (FlagIcons as any)[code] : undefined;
                    return (
                      <>
                        {ActiveFlag ? <ActiveFlag className="flag" aria-hidden="true" /> : <span className="flag" aria-hidden="true">🌐</span>}
                        <span>{active?.label || 'ทุกภาษา'}</span>
                        <svg className="caret" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08z" clipRule="evenodd" />
                        </svg>
                      </>
                    );
                  })()}
                </button>

                {langOpen && (
                  <div className="searchbar__panel" role="listbox" aria-label="เลือกภาษา">
                    {LANG_OPTIONS.map(opt => {
                      const code = opt.code;
                      const OptFlag = code ? (FlagIcons as any)[code] : undefined;
                      const active = languageFilter === opt.value;
                      return (
                        <div
                          key={opt.value}
                          role="option"
                          aria-selected={active}
                          className={`lang-option ${active ? 'is-active' : ''}`}
                          onClick={() => { setLanguageFilter(opt.value); setLangOpen(false); }}
                        >
                          {OptFlag ? <OptFlag className="flag" aria-hidden="true" /> : <span className="flag" aria-hidden="true">🌐</span>}
                          <span>{opt.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Input (wrapped so we can place clear icon inside without gaps) */}
              <div className="searchbar-v__inputwrap">
                <input
                  ref={inputRef}
                  id="search"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ระบุคำทับศัพท์"
                  autoFocus
                  autoComplete="off"
                  aria-label="ช่องค้นหาคำทับศัพท์"
                  className="searchbar-v__input"
                />
                {query && (
                  <button
                    type="button"
                    aria-label="ล้างคำค้นหา"
                    className="searchbar-v__clear"
                    onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
                      <path fillRule="evenodd" d="M6.22 6.22a.75.75 0 0 1 1.06 0L12 10.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L13.06 12l4.72 4.72a.75.75 0 1 1-1.06 1.06L12 13.06l-4.72 4.72a.75.75 0 1 1-1.06-1.06L10.94 12 6.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Submit button as the last column (no internal gap) */}
              <button
                type="submit"
                className="searchbar-v__submit"
                aria-label="ค้นหา"
                disabled={!query.trim()}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22" aria-hidden="true">
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

              <section className="mx-auto max-w-5xl space-y-6">
                {results.length === 0 ? (
                  <div className="brand-card p-6 text-center text-gray-600">ไม่พบผลการค้นหา</div>
                ) : (
                  results.map((row: TransliterationSearchResult) => <ResultCard key={row.id} data={row} onEdit={openEdit} />)
                )}
              </section>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <nav className="pagination" role="navigation" aria-label="เลขหน้า">
                  <button
                    className="pagination__control"
                    onClick={() => loadResults(pagination.prevPage || Math.max(1, (pagination.currentPage - 1)))}
                    disabled={!pagination.hasPrevPage}
                    aria-label="ก่อนหน้า"
                  >
                    ←
                  </button>

                  <ul className="pagination__list" role="list">
                    {pageNumbers.map((p, idx) => (
                      <li key={`${p}-${idx}`}>
                        {p === '…' ? (
                          <span className="pagination__ellipsis">…</span>
                        ) : (
                          <button
                            onClick={() => loadResults(p as number)}
                            className={`pagination__item ${p === pagination.currentPage ? 'is-active' : ''}`}
                            aria-current={p === pagination.currentPage ? 'page' : undefined}
                          >
                            {p}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>

                  <button
                    className="pagination__control"
                    onClick={() => loadResults(pagination.nextPage || Math.min(pagination.totalPages, (pagination.currentPage + 1)))}
                    disabled={!pagination.hasNextPage}
                    aria-label="ถัดไป"
                  >
                    →
                  </button>

                  <div className="pagination__size">
                    <label htmlFor="pageSize">ต่อหน้า</label>
                    <select
                      id="pageSize"
                      className="select"
                      value={pageSize}
                      onChange={(e) => { const s = parseInt(e.target.value, 10); setPageSize(s); loadResults(1, s); }}
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                </nav>
              )}
            </section>
          )}
        {/* Modal for editing */}
        {editOpen && editRow && (
          <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="แก้ไขคำทับศัพท์">
            <div className="modal">
              <div className="modal__header">
                <h3 className="modal__title">แก้ไขข้อมูลคำทับศัพท์ (ID: {editRow.id})</h3>
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
                      romanization: (e.currentTarget as any).romanization.value,
                      originalScript1: (e.currentTarget as any).originalScript1.value,
                      originalScript2: (e.currentTarget as any).originalScript2.value,
                      language: (e.currentTarget as any).language.value,
                      wordType: (e.currentTarget as any).wordType.value,
                      category: (e.currentTarget as any).category.value,
                      transliteration1: (e.currentTarget as any).transliteration1.value,
                      transliteration2: (e.currentTarget as any).transliteration2.value,
                      meaning: (e.currentTarget as any).meaning.value,
                      notes: (e.currentTarget as any).notes.value,
                      referenceCriteria: (e.currentTarget as any).referenceCriteria.value,
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
                      <input name="language" defaultValue={editRow.language || ''} className="input" />
                    </div>
                    <div>
                      <label className="form-label">ชนิดคำ/Word Type</label>
                      <input name="wordType" defaultValue={editRow.wordType || ''} className="input" />
                    </div>
                    <div>
                      <label className="form-label">Romanization</label>
                      <input name="romanization" defaultValue={editRow.romanization || ''} className="input" />
                    </div>
                    <div>
                      <label className="form-label">คำทับศัพท์ 1</label>
                      <input name="transliteration1" defaultValue={editRow.transliteration1 || ''} className="input" />
                    </div>
                    <div>
                      <label className="form-label">คำทับศัพท์ 2</label>
                      <input name="transliteration2" defaultValue={editRow.transliteration2 || ''} className="input" />
                    </div>
                    <div>
                      <label className="form-label">หมวดหมู่</label>
                      <input name="category" defaultValue={editRow.category || ''} className="input" />
                    </div>

                    <div>
                      <label className="form-label">ต้นฉบับ (สคริปต์ 1)</label>
                      <input name="originalScript1" defaultValue={editRow.originalScript1 || ''} className="input" />
                    </div>
                    <div>
                      <label className="form-label">ต้นฉบับ (สคริปต์ 2)</label>
                      <input name="originalScript2" defaultValue={editRow.originalScript2 || ''} className="input" />
                    </div>

                    <div className="col-span-2">
                      <label className="form-label">ความหมาย</label>
                      <textarea name="meaning" defaultValue={editRow.meaning || ''} className="textarea" />
                    </div>
                    <div className="col-span-2">
                      <label className="form-label">หมายเหตุ</label>
                      <textarea name="notes" defaultValue={editRow.notes || ''} className="textarea" />
                    </div>
                    <div className="col-span-2">
                      <label className="form-label">เกณฑ์อ้างอิง (referenceCriteria)</label>
                      <input name="referenceCriteria" defaultValue={editRow.referenceCriteria || ''} className="input" />
                    </div>
                  </div>
                  {saveError && <p className="mt-3 text-red-600">{saveError}</p>}
                </div>
                <div className="modal__footer">
                  <button type="button" className="btn-ghost" onClick={closeEdit}>ยกเลิก</button>
                  <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'กำลังบันทึก…' : 'บันทึกเป็นเวอร์ชันใหม่'}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  </div>
  );
}