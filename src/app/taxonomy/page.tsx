// src/app/taxonomy/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';

// === Types ===
type TaxonEntry = {
  id: number;
  taxonId: number;
  title: string | null;
  slug: string | null;
  orderIndex: number | null;
  contentHtml: string | null;
  contentText: string | null;
  updatedAt?: string;
  taxon?: { id: number; scientificName: string | null };
  // Highlighted fields returned by API when q is present
  titleMarked?: string | null;
  contentHtmlMarked?: string | null;
  contentTextMarked?: string | null;
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
function extractAuthorFromHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const cleaned = html.replace(/\uFFFD/g, '');
  const THAI_ANY = '[\\u0E00-\\u0E7F\\s\\u200B\\u200C\\u200D\\uFEFF]*';
  const re = new RegExp(
    `<strong>\\s*ผู้${THAI_ANY}เขียน\\s*(?:[:\\-–—])?\\s*([^<]+?)\\s*<\\/strong>`,
    'iu'
  );
  const m = cleaned.match(re);
  return m ? m[1].trim() : null;
}

// --- Summary extraction helpers ---
function sanitizeThai(s: string): string {
  return (s || '')
    .replace(/\uFFFD/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
}

function firstStrongBlock(html?: string | null): string | null {
  if (!html) return null;
  const m = html.match(/<strong>([\s\S]*?)<\/strong>/i);
  return m ? m[1] : null;
}

function extractThaiOfficialName(html?: string | null): string | null {
  const blk = firstStrongBlock(html || '');
  if (!blk) return null;
  const withoutTags = blk.replace(/<em>[\s\S]*?<\/em>/ig, '').replace(/\([^)]*\)/g, '');
  const t = sanitizeThai(withoutTags).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t || null;
}

function extractScientificName(html?: string | null): string | null {
  const m = (html || '').match(/<em>([^<]+)<\/em>/i);
  return m ? m[1].trim() : null;
}

function splitGenusSpecies(sci?: string | null): { genus: string | null; species: string | null } {
  if (!sci) return { genus: null, species: null };
  const parts = sci.split(/\s+/).filter(Boolean);
  return { genus: parts[0] || null, species: parts[1] || null };
}

function extractAuthorsShort(html?: string | null): string | null {
  const blk = firstStrongBlock(html || '');
  if (!blk) return null;
  const afterEm = blk.match(/<\/em>([^<]+)$/i);
  let s = afterEm ? afterEm[1] : blk;
  s = sanitizeThai(s).replace(/\s+/g, ' ').trim();
  s = s.replace(/^[\s\(\)\-–—:]+|[\s\(\)]+$/g, '');
  return s || null;
}

function extractOtherNames(html?: string | null): string | null {
  if (!html) return null;
  const cleaned = sanitizeThai(html);
  // Match the paragraph that begins with "<strong>ชื่ออื่น ๆ</strong>"
  const re = /<p>\s*<strong>\s*ชื่อ[\s\u200B-\u200D\uFEFF]*อื่[่น][\s\u200B-\u200D\uFEFF]*ๆ?\s*<\/strong>\s*([\s\S]*?)<\/p>/iu;
  const m = cleaned.match(re);
  if (m) return htmlToText(m[1]);
  return null;
}

function extractPlantAuthorsFull(html?: string | null): string | null {
  const cleaned = sanitizeThai(html || '');
  // explicit block "ชื่อผู้ตั้งพรรณพืช"
  const re = /<p>\s*<strong>\s*ชื่อ[\s\u200B-\u200D\uFEFF]*ผู้[\s\u200B-\u200D\uFEFF]*ตั้ง[\s\u200B-\u200D\uFEFF]*พรรณ[\s\u200B-\u200D\uFEFF]*พืช\s*<\/strong>\s*([\s\S]*?)<\/p>/iu;
  const m = cleaned.match(re);
  if (m) {
    // Keep line breaks
    return sanitizeThai(m[1])
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+\n/g, '\n')
      .replace(/\n\s+/g, '\n')
      .replace(/\s+/g, ' ')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => (s.startsWith('-') ? s : `- ${s}`))
      .join('\n');
  }
  return null;
}

function extractPlantAuthorsPeriod(html?: string | null): string | null {
  const cleaned = sanitizeThai(html || '');
  const re = /<p>\s*<strong>\s*ช่วง[\s\u200B-\u200D\uFEFF]*เวลา[\s\u200B-\u200D\uFEFF]*เกี่ยวกับ[\s\u200B-\u200D\uFEFF]*ผู้[\s\u200B-\u200D\uFEFF]*ตั้ง[\s\u200B-\u200D\uFEFF]*พรรณ[\s\u200B-\u200D\uFEFF]*พืช\s*<\/strong>\s*([\s\S]*?)<\/p>/iu;
  const m = cleaned.match(re);
  if (m) {
    return sanitizeThai(m[1])
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+\n/g, '\n')
      .replace(/\n\s+/g, '\n')
      .replace(/\s+/g, ' ')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => (s.startsWith('-') ? s : `- ${s}`))
      .join('\n');
  }
  return null;
}

export default function TaxonomyBrowserPage() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<TaxonEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [pageSize, setPageSize] = useState<number>(10);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // selection state
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const fetchData = async (page = 1, size = pageSize) => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      params.set('page', String(page));
      params.set('pageSize', String(size));

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

  useEffect(() => { fetchData(1); /* load initial */ }, []);

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

  const selected = useMemo(() => {
    if (!results.length) return null;
    return results.find((r) => r.id === selectedId) || results[0] || null;
  }, [results, selectedId]);

  const summary = useMemo(() => {
    if (!selected) return null;
    const html = selected.contentHtml || '';
    const text = html ? htmlToText(html) : (selected.contentText || '');
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;

    const authorDesc = extractAuthorFromHtml(html);
    const sci = extractScientificName(html) || selected.taxon?.scientificName || null;
    const { genus, species } = splitGenusSpecies(sci || '');
    const official = extractThaiOfficialName(html) || selected.title || null;
    const otherNames = extractOtherNames(html);
    const plantAuthorsFull = extractPlantAuthorsFull(html);
    const plantAuthorsShort = extractAuthorsShort(html);
    const plantAuthorsPeriod = extractPlantAuthorsPeriod(html);

    // authors display: prefer explicit block, otherwise short suffix after </em>
    const authorsDisplay = plantAuthorsFull || (plantAuthorsShort ? `- ${plantAuthorsShort}` : null);

    return {
      author: authorDesc || '-',
      updated: selected.updatedAt ? new Date(selected.updatedAt).toLocaleString('th-TH') : '-',
      chars: text.length,
      words,
      readMins: words ? Math.max(1, Math.round(words / 250)) : 0,
      order: selected.orderIndex ?? undefined,
      scientific: sci || '-',
      genus: genus || '-',
      species: species || '-',
      official: official || '-',
      otherNames: otherNames || '-',
      authorsDisplay: authorsDisplay || '-',
      authorsPeriod: plantAuthorsPeriod || '-',
    };
  }, [selected]);

  return (
    <div className="reader-stage reader-stage--full">
      <Head>
        <meta charSet="UTF-8" />
        <title>Taxonomy Browser</title>
      </Head>

      <main className="container py-8">
        <section className="a4-page">
          <h1 className="section-title text-center mb-6">สืบค้น TaxonEntry</h1>

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

          {/* Result Summary */}
          {!loading && !err && (
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">ผลการค้นหา</h2>
              <span className="text-sm text-gray-600">
                {(pagination?.total ?? results.length)} รายการ • หน้า {pagination?.currentPage ?? 1}/{pagination?.totalPages ?? 1}
              </span>
            </div>
          )}

          {/* 3-column reading layout */}
          {!loading && !err && (
            results.length === 0 ? (
              <div className="brand-card p-6 text-center text-gray-600">ไม่พบผลการค้นหา</div>
            ) : (
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
                          title={r.title || undefined}
                        >
                          <div
                            className="aside-link__title"
                            dangerouslySetInnerHTML={{ __html: r.titleMarked || r.title || `หัวข้อ #${r.id}` }}
                          />
                          {r.taxon?.scientificName && (
                            <div className="aside-link__sci">{r.taxon.scientificName}</div>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </aside>

                {/* Main content */}
                <section className="taxon-main">
                  {!!selected && (
                    <div className="taxon-card">
                      <div className="taxon-header">
                        <h3 className="taxon-title" dangerouslySetInnerHTML={{ __html: selected.titleMarked || selected.title || `หัวข้อ #${selected.id}` }} />
                        {selected.taxon?.scientificName ? (
                          <div className="taxon-sci"><em>{selected.taxon.scientificName}</em></div>
                        ) : <div className="taxon-sci" />}
                      </div>
                      {selected.updatedAt && (
                        <div className="taxon-updated">อัปเดตล่าสุด: {new Date(selected.updatedAt).toLocaleString('th-TH')}</div>
                      )}
                      <article
                        className="taxon-article prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: selected.contentHtmlMarked || selected.contentHtml || '' }}
                      />
                    </div>
                  )}
                </section>

                {/* Right panel: summary */}
                <aside className="taxon-aside taxon-aside--right">
                  {selected ? (
                    <div className="summary-box jumbotron" style={{ paddingTop: 32, paddingBottom: 32, marginBottom: 0 }}>
                      <div className="summary-grid">
                        <dl className="row">
                          <dt className="col-sm-3">ชื่อหลักหรือชื่อทางการ</dt>
                          <dd className="col-sm-9">{summary?.official}</dd>
                        </dl>

                        <dl className="row">
                          <dt className="col-sm-3">ชื่อวิทยาศาสตร์</dt>
                          <dd className="col-sm-9">
                            <b><i>{summary?.scientific}</i></b>
                          </dd>
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

                        <dl className="row">
                          <dt className="col-sm-3">ชื่ออื่น ๆ</dt>
                          <dd className="col-sm-9">{summary?.otherNames}</dd>
                        </dl>

                        <dl className="row">
                          <dt className="col-sm-3">ผู้เขียนคำอธิบาย</dt>
                          <dd className="col-sm-9">{summary?.author}</dd>
                        </dl>
                      </div>
                    </div>
                  ) : (
                    <div className="text-gray-500">เลือกหัวข้อจากด้านซ้ายเพื่อดูรายละเอียด</div>
                  )}
                </aside>
              </div>
            )
          )}

          {/* Pagination */}
          {!loading && !err && pagination && pagination.totalPages > 1 && (
            <nav className="pagination mt-8" role="navigation" aria-label="เลขหน้า">
              <button
                className="pagination__control"
                onClick={() => fetchData(pagination.prevPage || Math.max(1, pagination.currentPage - 1))}
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
                        onClick={() => fetchData(p as number)}
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
                onClick={() => fetchData(pagination.nextPage || Math.min(pagination.totalPages, pagination.currentPage + 1))}
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
            </nav>
          )}

          {/* Styles */}
          <style jsx>{`
            /* Layout */
            /* Make page full width on this screen */
            .a4-page { max-width: 100%; }
            /* Center the search bar and limit it to 60% of viewport width */
            .searchbar-wrap { width: 60vw; max-width: 60%; margin: 0 auto; }
            @media (max-width: 1024px) { .searchbar-wrap { width: 90vw; max-width: 100%; } }

            .taxon-layout {
              display: grid;
              grid-template-columns: minmax(180px, 15%) minmax(420px, 65%) minmax(240px, 20%);
              gap: 18px;
            }
            @media (max-width: 1200px) {
              .taxon-layout { grid-template-columns: 1fr; }
            }
            @media (max-width: 1023px) {
              .taxon-layout { grid-template-columns: 1fr; }
              .taxon-aside--left, .taxon-aside--right { position: static; top: auto; }
            }

            
            .taxon-aside {
              background: #fff;
              border: 1px solid var(--border, #e5e7eb);
              border-radius: 12px;
              padding: 14px;
              box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
              height: fit-content;
              position: sticky;
              top: 94px; /* stay visible while reading */
              max-height: calc(100vh - 120px);
              overflow: auto;
            }
            .aside-title { font-weight: 700; margin-bottom: 10px; }
            .aside-list { display: grid; gap: 6px; }
            .aside-link { width: 100%; text-align: left; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; transition: background .2s, border-color .2s; }
            .aside-link:hover { background: #f3f4f6; }
            .aside-link.is-active { background: #eef2ff; border-color: #c7d2fe; }
            .aside-link__title { font-weight: 600; line-height: 1.2; color: #111827; }
            .aside-link__sci { font-size: .85rem; color: #6b7280; margin-top: 2px; }

            .summary-card { background: #fff; border: 1px solid var(--border, #e5e7eb); border-radius: 12px; padding: 12px; }
            .summary-dl { display: grid; grid-template-columns: auto 1fr; column-gap: 10px; row-gap: 8px; }
            .summary-dl dt { color: #6b7280; }
            .summary-dl dd { color: #111827; }

            /* Card & header (main) */
            .taxon-card {
              background: #fff;
              border: 1px solid var(--border, #e5e7eb);
              border-radius: 14px;
              padding: 22px 22px 28px;
              box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
            }
            .taxon-header {
              display: grid;
              grid-template-columns: 1fr minmax(240px, 1fr);
              gap: 24px;
              align-items: end;
              margin-bottom: 8px;
            }
            .taxon-title {
              font-size: clamp(1.5rem, 2.2vw, 2.125rem);
              line-height: 1.15;
              font-weight: 800;
              color: #1f2937;
              margin: 0;
            }
            .taxon-sci { text-align: right; font-size: clamp(1rem, 1.4vw, 1.25rem); line-height: 1.25; color: #374151; }
            .taxon-sci em { font-style: italic; }
            .taxon-updated { font-size: 0.85rem; color: #6b7280; margin: 4px 0 14px; text-align: right; }

            /* Article: two-column layout on wide screens */
            .taxon-article { text-align: justify; }
            @media (min-width: 1024px) { .taxon-article { column-count: 2; column-gap: 36px; } }

            /* Paragraph with only a <strong> becomes a section label */
            .taxon-article p:has(> strong:only-child) {
              background: #f3eee6;
              padding: 10px 14px;
              border-radius: 10px;
              display: inline-block;
              margin: 6px 0 10px;
              color: #374151;
            }
            .taxon-article p > strong { color: #111827; }
            .taxon-article p { line-height: 1.85; }
            .taxon-article em { font-style: italic; }

            /* Searchbar */
            .searchbar-wrap { width: min(60vw, 960px); margin: 0 auto; }
            @media (max-width: 1024px) { .searchbar-wrap { width: min(90vw, 720px); } }

            .searchbar {
            display: grid;
            grid-template-columns: 24px 1fr auto auto;
            align-items: center;
            gap: 8px;
            background: #fff;
            border: 1px solid var(--border, #e5e7eb);
            border-radius: 9999px;
            padding: 10px 12px;
            box-shadow: 0 2px 8px rgba(15,23,42,.06);
            transition: box-shadow .2s ease;
            }
            .searchbar:focus-within { box-shadow: 0 4px 16px rgba(15,23,42,.08); }

            .searchbar__icon { width: 20px; height: 20px; color: #6b7280; }
            .searchbar__input {
            width: 100%;
            border: none;
            outline: none;
            font-size: 1rem;
            padding: 8px 0;
            background: transparent;
            }
            .searchbar__clear {
            border: 0;
            background: transparent;
            padding: 6px;
            border-radius: 9999px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            color: #6b7280;
            }
            .searchbar__clear:hover { background: #f3f4f6; color: #111827; }

            .searchbar__submit {
            border: 0;
            background: #0c57d2;
            color: #fff;
            padding: 8px 12px;
            border-radius: 9999px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            }
            .searchbar__submit svg { width: 20px; height: 20px; }

            /* Summary panel (right) */
            .summary-box.jumbotron {
              background: #fff;
              border: 1px solid var(--border, #e5e7eb);
              border-radius: 12px;
              padding: 24px;
              box-shadow: 0 2px 6px rgba(15,23,42,.04);
            }

            .summary-grid .row {
              display: grid;
              grid-template-columns: 9.5rem 1fr;
              column-gap: 12px;
              row-gap: 2px;
              margin: 0 0 12px 0;
            }

            .summary-grid .row:last-child { margin-bottom: 0; }

            .summary-grid .col-sm-3 {
              color: #6b7280;
              font-weight: 600;
            }

            .summary-grid .col-sm-9 {
              color: #111827;
              word-break: break-word;
            }
          `}</style>
        </section>
      </main>
    </div>
  );
}
            