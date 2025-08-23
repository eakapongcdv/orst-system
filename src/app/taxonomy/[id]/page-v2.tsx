// src/app/taxonomy/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toolbarStyles } from './toolbarStyles';

// === Types ===
type TaxonEntry = {
  id: number;
  taxonId: number;
  title: string | null;
  slug: string | null;
  orderIndex: number | null;
  contentHtml: string | null;
  contentText: string | null;
  shortDescription?: string | null;

  // NEW meta fields from schema
  official?: string | null;
  officialNameTh?: string | null;
  scientificName?: string | null;
  genus?: string | null;
  species?: string | null;
  family?: string | null;
  authorsDisplay?: string | null;
  authorsPeriod?: string | null;
  otherNames?: string | null;
  synonyms?: string | null;
  author?: string | null;

  // Highlighted fields returned by API when q is present
  titleMarked?: string | null;
  contentHtmlMarked?: string | null;
  contentTextMarked?: string | null;
  shortDescriptionMarked?: string | null;
  officialNameThMarked?: string | null;
  familyMarked?: string | null;
  synonymsMarked?: string | null;

  updatedAt?: string;
  taxon?: { id: number; scientificName: string | null };
};

type Pagination = {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  total: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  prevPage?: number;
  nextPage?: number;
};

// === Helpers ===
function htmlToText(html: string): string {
  return html
    .replace(/\uFFFD/g, '') // remove replacement char if any
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract author from \n<strong>ผู้…เขียน …</strong>\nAllow corrupted Thai glyphs / zero-width joiners etc.

// --- Summary extraction helpers ---









export default function TaxonomyBrowserPage() {
  const params = useParams<{ id: string }>();
  const taxonomyId = Number(params?.id || 0);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<TaxonEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [pageSize, setPageSize] = useState<number>(10);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // selection state
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rightOpen, setRightOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const fetchData = async (page = 1, size = pageSize) => {
    if (!taxonomyId) { setResults([]); setPagination(null); return; }
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      params.set('page', String(page));
      params.set('pageSize', String(size));
      params.set('taxonomyId', String(taxonomyId));

      const r = await fetch(`/api/taxonomy/search?${params.toString()}`);
      if (!r.ok) {
        let m = `HTTP ${r.status}`;
        try { const j = await r.json(); m = j.error || m; } catch {}
        throw new Error(m);
      }
      const j = await r.json();
      const arr: TaxonEntry[] = Array.isArray(j.results) ? j.results : [];
      setResults(arr);
      setPagination(j.pagination || null);

      // auto select first item if nothing selected or selected item not in page
      if (arr.length) {
        const exists = arr.some((x) => x.id === selectedId);
        if (!exists) setSelectedId(arr[0].id);
      } else {
        setSelectedId(null);
      }
    } catch (e: any) {
      setErr(e?.message || 'เกิดข้อผิดพลาด');
      setResults([]);
      setPagination(null);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(1); }, [taxonomyId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetchData(1);
  };

  const pageNumbers = useMemo(() => {
    if (!pagination) return [] as (number | '…')[];
    const { currentPage, totalPages } = pagination;
    const out: (number | '…')[] = [];
    const rng = (s: number, e: number) => { for (let i = s; i <= e; i++) out.push(i); };
    if (totalPages <= 7) {
      rng(1, totalPages);
    } else {
      out.push(1);
      if (currentPage > 4) out.push('…');
      const s = Math.max(2, currentPage - 2);
      const e = Math.min(totalPages - 1, currentPage + 2);
      rng(s, e);
      if (currentPage < totalPages - 3) out.push('…');
      out.push(totalPages);
    }
    return out;
  }, [pagination]);

  const total = pagination?.total ?? results.length;
  const pageSizeEff = pagination?.pageSize ?? pageSize;
  const rangeStart = pagination ? Math.min(total, (pagination.currentPage - 1) * pageSizeEff + 1) : 0;
  const rangeEnd = pagination ? Math.min(total, pagination.currentPage * pageSizeEff) : 0;

  const selected = useMemo(() => {
    if (!results.length) return null;
    return results.find((r) => r.id === selectedId) || results[0] || null;
  }, [results, selectedId]);

  // summary: schema-first, only schema fields (no HTML extraction fallbacks)
  const summary = useMemo(() => {
    if (!selected) return null;
    const html = selected.contentHtml || '';
    const text = html ? htmlToText(html) : (selected.contentText || '');
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;

    const sci =
      selected.scientificName ||
      selected.taxon?.scientificName ||
      null;

    return {
      author: selected.author || '-',
      updated: selected.updatedAt ? new Date(selected.updatedAt).toLocaleString('th-TH') : '-',
      chars: text.length,
      words,
      readMins: words ? Math.max(1, Math.round(words / 250)) : 0,
      order: selected.orderIndex ?? undefined,

      scientific: sci || '-',
      genus: selected.genus || '-',
      species: selected.species || '-',
      official: selected.officialNameTh || selected.title || '-',
      otherNames: selected.otherNames || '-',
      synonyms: selected.synonyms || '-',
      authorsDisplay: selected.authorsDisplay || '-',
      authorsPeriod: selected.authorsPeriod || '-',
      family: selected.family || '-',
    };
  }, [selected]);

  // Determine visibility of meta rows (hide if empty)
  const hasSynonyms = !!(selected?.synonymsMarked || selected?.synonyms);
  const hasFamily = !!(selected?.familyMarked || selected?.family);
  const hasOtherNames = !!(selected?.otherNames);

  return (
    <div className="reader-stage reader-stage--full">
      <Head>
        <meta charSet="UTF-8" />
        <title>Taxonomy Browser</title>
      </Head>

      <main className="fullpage">
        
        <section className="a4-page">
          <div className="container">
          {/* Breadcrumb */}
        <nav aria-label="breadcrumb" className="mb-4">
          <ol className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <li>
              <Link href="/dictionaries" className="hover:underline">สารานุกรม และ อนุกรมวิธาน</Link>
            </li>
            <li className="text-gray-300">•</li>
            <li className="font-extrabold" style={{ color: 'var(--brand-gold)' }} aria-current="page">
              อนุกรมวิธาน
            </li>
            <li className="text-gray-300">•</li>
            <li className="font-extrabold" style={{ color: 'var(--brand-gold)' }} aria-current="page">
              อนุกรมวิธานพืช ต
            </li>
          </ol>
        </nav>
            {/* Search Bar */}
            <form onSubmit={onSubmit} className="mb-8" role="search" aria-label="ค้นหา TaxonEntry">
                <div className="searchbar-wrap">
                    <div className="searchbar">
                    <svg className="searchbar__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path
                        fillRule="evenodd"
                        d="M10.5 3.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5ZM2.25 10.5a8.25 8.25 0 1 1 14.59 5.28l4.69 4.69a.75.75 0 1 1-1.06 1.06l-4.69-4.69A8.25 8.25 0 0 1 2.25 10.5Z"
                        clipRule="evenodd"
                        />
                    </svg>

                    <input
                        ref={inputRef}
                        type="text"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="ระบุคำศัพท์"
                        autoComplete="off"
                        autoFocus
                        className="searchbar__input"
                        aria-label="ช่องค้นหาคำศัพท์"
                    />

                    {q && (
                        <button
                        type="button"
                        className="searchbar__clear"
                        aria-label="ล้างคำค้นหา"
                        onClick={() => { setQ(''); inputRef.current?.focus(); }}
                        >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                            <path
                            fillRule="evenodd"
                            d="M6.22 6.22a.75.75 0 0 1 1.06 0L12 10.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L13.06 12l4.72 4.72a.75.75 0 1 1-1.06 1.06L12 13.06l-4.72 4.72a.75.75 0 1 1-1.06-1.06L10.94 12 6.22 7.28a.75.75 0 0 1 0-1.06Z"
                            clipRule="evenodd"
                            />
                        </svg>
                        </button>
                    )}

                    <button type="submit" className="searchbar__submit" aria-label="ค้นหา">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                        <path
                            fillRule="evenodd"
                            d="M10.5 3.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5ZM2.25 10.5a8.25 8.25 0 1 1 14.59 5.28l4.69 4.69a.75.75 0 1 1-1.06 1.06l-4.69-4.69A8.25 8.25 0 0 1 2.25 10.5Z"
                            clipRule="evenodd"
                        />
                        </svg>
                    </button>
                    </div>
                </div>
            </form>

          {/* Status */}
          {loading && (
            <div className="brand-card p-6 text-center">
              <div className="spinner mx-auto mb-3" />
              <div>กำลังค้นหา…</div>
            </div>
          )}
          {err && (
            <div className="alert alert--danger" role="alert">
              <strong>เกิดข้อผิดพลาด:</strong> {err}
            </div>
          )}

        {/* 3-column reading layout */}
            {!loading && !err && (
            results.length === 0 ? (
                <div className="brand-card p-6 text-center text-gray-600">ไม่พบผลการค้นหา</div>
            ) : (
                <>
                <div className="taxon-layout">
                    {/* Left panel: list of titles */}
                    <aside className="taxon-aside taxon-aside--left">
                      <div className="aside-title">สารบัญ</div>
                      <ul className="aside-list" role="list">
                        {results.map((r) => (
                          <li key={r.id}>
                            <button
                              type="button"
                              className={`aside-link ${selected?.id === r.id ? 'is-active' : ''}`}
                              onClick={() => setSelectedId(r.id)}
                              title={r.officialNameTh || r.official || undefined}
                            >
                              <div
                                className="aside-link__title"
                                dangerouslySetInnerHTML={{
                                  __html:
                                    r.officialNameThMarked ||
                                    r.officialNameTh ||
                                    r.titleMarked ||
                                    r.title ||
                                    `หัวข้อ #${r.id}`,
                                }}
                              />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </aside>

                    {/* Main content */}
                    <section className="taxon-main">
                    {!!selected && (
                        <div className="taxon-card taxon-card--a4">
                        <div className="taxon-header">
                          {/* Headline (title + scientific name inline, flexible) */}
                          <div className="taxon-headline">
                            <h3
                              className="taxon-title"
                              dangerouslySetInnerHTML={{
                                __html:
                                  selected.officialNameThMarked ||
                                  selected.officialNameTh ||
                                  selected.titleMarked ||
                                  selected.title ||
                                  `หัวข้อ #${selected.id}`,
                              }}
                            />
                            {(selected.scientificName || selected.taxon?.scientificName) ? (
                              <div className="taxon-sci">
                                <em>{selected.scientificName || selected.taxon?.scientificName}</em>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        {/* NEW: meta header (placed before updatedAt) */}
                        <div className="taxon-metaheader">
                          {hasSynonyms && (
                            <dl className="row">
                              <dt>ชื่อพ้อง</dt>
                              <dd>
                                <i
                                  dangerouslySetInnerHTML={{
                                    __html: (selected.synonymsMarked ?? selected.synonyms) as string,
                                  }}
                                />
                              </dd>
                            </dl>
                          )}
                          {hasFamily && (
                            <dl className="row">
                              <dt>วงศ์</dt>
                              <dd>
                                <i
                                  dangerouslySetInnerHTML={{
                                    __html: (selected.familyMarked ?? selected.family) as string,
                                  }}
                                />
                              </dd>
                            </dl>
                          )}
                          {hasOtherNames && (
                            <dl className="row">
                              <dt>ชื่ออื่น ๆ</dt>
                              <dd>{selected.otherNames}</dd>
                            </dl>
                          )}
                        </div>

                        {(selected.shortDescriptionMarked || selected.shortDescription) && (
                          <div
                            className="taxon-shortdescription"
                            dangerouslySetInnerHTML={{ __html: selected.shortDescriptionMarked || selected.shortDescription || '' }}
                          />
                        )}

                        <article
                            className="taxon-article prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={{
                            __html:
                                selected.contentHtmlMarked ||
                                selected.contentHtml ||
                                '',
                            }}
                        />
                        {selected.updatedAt && (
                          <div className="taxon-updated taxon-updated--bottom">
                            อัปเดตล่าสุด: {new Date(selected.updatedAt).toLocaleString('th-TH')}
                          </div>
                        )}
                        </div>
                    )}
                    </section>
                    {/* Right side bar meta (visible on desktop), slide-panel still available on mobile */}
                    <aside className="taxon-aside taxon-aside--right">
                      <div className="aside-title" style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px'}}>
                        <span>-</span>
                        <button
                          type="button"
                          className="btn-icon"
                          title="แสดงแบบขยาย"
                          aria-label="แสดงแบบขยาย"
                          onClick={() => setRightOpen(true)}
                        >
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M4 7a3 3 0 0 1 3-3h4a1 1 0 1 1 0 2H7a1 1 0 0 0-1 1v4a1 1 0 1 1-2 0V7Zm14 10a3 3 0 0 1-3 3h-4a1 1 0 1 1 0-2h4a1 1 0 0 0 1-1v-4a1 1 0 1 1 2 0v4Z"/></svg>
                        </button>
                      </div>
                      {selected ? (
                        <div className="summary-grid">
                          <dl className="row">
                            <dt className="col-sm-3">ชื่อหลักหรือชื่อทางการ</dt>
                            <dd className="col-sm-9">{summary?.official}</dd>
                          </dl>

                          <dl className="row">
                            <dt className="col-sm-3">ชื่อวิทยาศาสตร์</dt>
                            <dd className="col-sm-9"><b><i>{summary?.scientific}</i></b></dd>
                          </dl>

                          <dl className="row">
                            <dt className="col-sm-3">ชื่อสกุล</dt>
                            <dd className="col-sm-9"><i>{summary?.genus}</i></dd>
                          </dl>

                          <dl className="row">
                            <dt className="col-sm-3">คำระบุชนิด</dt>
                            <dd className="col-sm-9"><i>{summary?.species}</i></dd>
                          </dl>

                          <dl className="row">
                            <dt className="col-sm-3">ชื่อผู้ตั้งพรรณพืช</dt>
                            <dd className="col-sm-9">
                              {summary?.authorsDisplay && typeof summary.authorsDisplay === 'string'
                                ? (<div dangerouslySetInnerHTML={{ __html: summary.authorsDisplay.replace(/\n/g, '<br>') }} />)
                                : '-'}
                            </dd>
                          </dl>

                          <dl className="row">
                            <dt className="col-sm-3">ช่วงเวลาเกี่ยวกับผู้ตั้งพรรณพืช</dt>
                            <dd className="col-sm-9">
                              {summary?.authorsPeriod && typeof summary.authorsPeriod === 'string'
                                ? (<div dangerouslySetInnerHTML={{ __html: summary.authorsPeriod.replace(/\n/g, '<br>') }} />)
                                : '-'}
                            </dd>
                          </dl>

                          {hasOtherNames && (
                            <dl className="row">
                              <dt className="col-sm-3">ชื่ออื่น ๆ</dt>
                              <dd className="col-sm-9">{selected?.otherNames}</dd>
                            </dl>
                          )}

                          <dl className="row">
                            <dt className="col-sm-3">ผู้เขียนคำอธิบาย</dt>
                            <dd className="col-sm-9">{summary?.author}</dd>
                          </dl>
                        </div>
                      ) : (
                        <div className="text-gray-500">เลือกหัวข้อจากรายการเพื่อดูสรุป</div>
                      )}
                    </aside>
                </div>

                {/* Slide overlay & panel */}
                <div
                    className={`slide-overlay ${rightOpen ? 'is-open' : ''}`}
                    onClick={() => setRightOpen(false)}
                />
                <aside
                    className={`slide-panel ${rightOpen ? 'is-open' : ''}`}
                    aria-hidden={!rightOpen}
                >
                    <div className="slide-panel__head">
                    <h4 className="slide-panel__title">สรุป/เมตา</h4>
                    <button
                        className="btn-icon"
                        aria-label="ปิด"
                        onClick={() => setRightOpen(false)}
                    >
                        <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="currentColor"
                        aria-hidden="true"
                        >
                        <path
                            fillRule="evenodd"
                            d="M6.22 6.22a.75.75 0 0 1 1.06 0L12 10.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L13.06 12l4.72 4.72a.75.75 0 1 1-1.06 1.06L12 13.06l-4.72 4.72a.75.75 0 1 1-1.06-1.06L10.94 12 6.22 7.28a.75.75 0 0 1 0-1.06Z"
                            clipRule="evenodd"
                        />
                        </svg>
                    </button>
                    </div>

                    <div className="slide-panel__body">
                    {selected ? (
                        <div className="summary-grid">
                          <dl className="row">
                            <dt className="col-sm-3">ชื่อหลักหรือชื่อทางการ</dt>
                            <dd className="col-sm-9">{summary?.official}</dd>
                          </dl>

                          <dl className="row">
                            <dt className="col-sm-3">ชื่อวิทยาศาสตร์</dt>
                            <dd className="col-sm-9">
                              <b>
                                <i>{summary?.scientific}</i>
                              </b>
                            </dd>
                          </dl>

                          <dl className="row">
                            <dt className="col-sm-3">ชื่อสกุล</dt>
                            <dd className="col-sm-9">
                              <i>{summary?.genus}</i>
                            </dd>
                          </dl>

                          <dl className="row">
                            <dt className="col-sm-3">คำระบุชนิด</dt>
                            <dd className="col-sm-9">
                              <i>{summary?.species}</i>
                            </dd>
                          </dl>

                          {hasFamily && (
                            <dl className="row">
                              <dt className="col-sm-3">วงศ์</dt>
                              <dd className="col-sm-9">
                                <span
                                  dangerouslySetInnerHTML={{
                                    __html: (selected?.familyMarked ?? selected?.family) as string,
                                  }}
                                />
                              </dd>
                            </dl>
                          )}
                          {hasSynonyms && (
                            <dl className="row">
                              <dt className="col-sm-3">ชื่อพ้อง</dt>
                              <dd className="col-sm-9">
                                <span
                                  dangerouslySetInnerHTML={{
                                    __html: (selected?.synonymsMarked ?? selected?.synonyms) as string,
                                  }}
                                />
                              </dd>
                            </dl>
                          )}

                          <dl className="row">
                            <dt className="col-sm-3">ชื่อผู้ตั้งพรรณพืช</dt>
                            <dd className="col-sm-9">
                              {summary?.authorsDisplay &&
                              typeof summary.authorsDisplay === 'string' ? (
                                <div
                                  dangerouslySetInnerHTML={{
                                    __html: summary.authorsDisplay.replace(
                                      /\n/g,
                                      '<br>'
                                    ),
                                  }}
                                />
                              ) : (
                                '-'
                              )}
                            </dd>
                          </dl>

                          <dl className="row">
                            <dt className="col-sm-3">ช่วงเวลาเกี่ยวกับผู้ตั้งพรรณพืช</dt>
                            <dd className="col-sm-9">
                              {summary?.authorsPeriod &&
                              typeof summary.authorsPeriod === 'string' ? (
                                <div
                                  dangerouslySetInnerHTML={{
                                    __html: summary.authorsPeriod.replace(/\n/g, '<br>'),
                                  }}
                                />
                              ) : (
                                '-'
                              )}
                            </dd>
                          </dl>

                          {hasOtherNames && (
                            <dl className="row">
                              <dt className="col-sm-3">ชื่ออื่น ๆ</dt>
                              <dd className="col-sm-9">{selected?.otherNames}</dd>
                            </dl>
                          )}

                          <dl className="row">
                            <dt className="col-sm-3">ผู้เขียนคำอธิบาย</dt>
                            <dd className="col-sm-9">{summary?.author}</dd>
                          </dl>
                        </div>
                    ) : (
                        <div className="text-gray-500">
                        เลือกหัวข้อจากรายการเพื่อดูสรุป
                        </div>
                    )}
                    </div>
                </aside>
                </>
            )
            )}
            
          {/* Bottom toolbar (pagination) */}
          {!loading && !err && pagination && pagination.totalPages > 1 && (
            <footer className="bottom-toolbar" role="navigation" aria-label="เลขหน้า">
              <div className="toolbar">
                {/* Left: page size selector */}
                <div className="toolbar__section toolbar__section--left">
                  <label htmlFor="pageSize" className="sr-only">ต่อหน้า</label>
                  <div className="select-wrap" title="จำนวนรายการต่อหน้า">
                    <span className="select-label">ต่อหน้า</span>
                    <select
                      id="pageSize"
                      className="select select--sm"
                      value={pageSize}
                      onChange={(e) => {
                        const s = parseInt(e.target.value, 10);
                        setPageSize(s);
                        fetchData(1, s);
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                </div>

                {/* Center: page numbers */}
                <div className="toolbar__section toolbar__pager" aria-live="polite">
                  {pageNumbers.map((p, idx) =>
                    p === '…' ? (
                      <span key={`${p}-${idx}`} className="tsep">…</span>
                    ) : (
                      <button
                        key={`${p}-${idx}`}
                        onClick={() => fetchData(p as number, pageSize)}
                        className={`tbtn tbtn-number ${p === pagination.currentPage ? 'is-active' : ''}`}
                        aria-current={p === pagination.currentPage ? 'page' : undefined}
                        aria-label={`ไปหน้า ${p}`}
                        title={`ไปหน้า ${p}`}
                      >
                        {p}
                      </button>
                    )
                  )}
                </div>

                {/* Right: range info + nav controls */}
                <div className="toolbar__section toolbar__section--right">
                  <div className="toolbar__info">
                    {rangeStart}&ndash;{rangeEnd} จาก {total} • หน้า {pagination?.currentPage ?? 1}/{pagination?.totalPages ?? 1}
                  </div>

                  <button
                    className="tbtn"
                    onClick={() => fetchData(1, pageSize)}
                    disabled={!pagination.hasPrevPage}
                    aria-label="หน้าแรก"
                    title="หน้าแรก"
                  >
                    <span aria-hidden="true">«</span>
                  </button>
                  <button
                    className="tbtn"
                    onClick={() =>
                      fetchData(pagination.prevPage || Math.max(1, pagination.currentPage - 1), pageSize)
                    }
                    disabled={!pagination.hasPrevPage}
                    aria-label="ก่อนหน้า"
                    title="ก่อนหน้า"
                  >
                    <span aria-hidden="true">‹</span>
                  </button>
                  <button
                    className="tbtn"
                    onClick={() =>
                      fetchData(pagination.nextPage || Math.min(pagination.totalPages, pagination.currentPage + 1), pageSize)
                    }
                    disabled={!pagination.hasNextPage}
                    aria-label="ถัดไป"
                    title="ถัดไป"
                  >
                    <span aria-hidden="true">›</span>
                  </button>
                  <button
                    className="tbtn"
                    onClick={() => fetchData(pagination.totalPages, pageSize)}
                    disabled={!pagination.hasNextPage}
                    aria-label="หน้าสุดท้าย"
                    title="หน้าสุดท้าย"
                  >
                    <span aria-hidden="true">»</span>
                  </button>
                </div>
              </div>
            </footer>
          )}

          {/* Styles */}
          </div>
          <style jsx>{toolbarStyles}</style>
        </section>
      </main>
    </div>
  );
}
            