// src/app/taxonomy/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

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
  const [rightOpen, setRightOpen] = useState(false);

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
                {/* Left controls: first / prev */}
                <div className="toolbar__section">
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

                {/* Right controls: info, page size, next / last */}
                <div className="toolbar__section toolbar__section--right">
                  <div className="toolbar__info">
                    {(pagination?.total ?? results.length)} รายการ • หน้า {pagination?.currentPage ?? 1}/{pagination?.totalPages ?? 1}
                  </div>
                  <label htmlFor="pageSize" className="sr-only">ต่อหน้า</label>
                  <div className="select-wrap">
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
          <style jsx>{`
            /* Bottom toolbar (sticky) */
            .bottom-toolbar{
              position: sticky;
              bottom: 0;
              background: #ffffffcc;
              backdrop-filter: saturate(1.2) blur(6px);
              border-top: 1px solid #e5e7eb;
              padding: 8px 0;
              z-index: 35;
            }
            .toolbar{
              display: grid;
              grid-template-columns: 1fr auto 1fr;
              align-items: center;
              gap: 12px;
            }
            @media (max-width: 640px){
              .toolbar{
                grid-template-columns: 1fr;
                row-gap: 10px;
              }
              .toolbar__section--right{
                justify-content: space-between;
              }
            }
            .toolbar__section{
              display: flex;
              align-items: center;
              gap: 6px;
            }
            .toolbar__section--right{
              justify-content: flex-end;
              gap: 10px;
            }
            .toolbar__pager{
              justify-content: center;
              flex-wrap: wrap;
              min-height: 40px;
            }
            .tsep{ color:#9ca3af; padding: 0 2px; }
            .tbtn{
              height: 36px;
              min-width: 36px;
              padding: 0 10px;
              border-radius: 10px;
              border: 1px solid #e5e7eb;
              background: #f9fafb;
              color: #374151;
              font-weight: 600;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              transition: background .15s ease, border-color .15s ease, color .15s ease, box-shadow .15s ease;
            }
            .tbtn:hover{ background:#f3f4f6; border-color:#d1d5db; color:#111827; }
            .tbtn:active{ transform: translateY(0.5px); }
            .tbtn[disabled]{ opacity:.45; cursor: not-allowed; }
            .tbtn-number{ min-width: 38px; padding: 0 12px; }
            .tbtn-number.is-active{
              background:#0c57d2; border-color:#0c57d2; color:#fff;
              box-shadow: 0 1px 4px rgba(12,87,210,.25);
            }
            .toolbar__info{
              font-size: .9rem;
              color:#6b7280;
              white-space: nowrap;
            }
            .select-wrap{
              display: inline-flex;
              align-items: center;
              gap: 6px;
              padding: 2px 8px;
              border: 1px solid #e5e7eb;
              border-radius: 10px;
              background:#fff;
            }
            .select-label{ font-size: .85rem; color:#6b7280; }
            .select--sm{
              height: 28px;
              padding: 2px 8px;
              font-size: .9rem;
              line-height: 1;
            }
            .sr-only{
              position: absolute;
              width: 1px; height: 1px;
              padding: 0; margin: -1px;
              overflow: hidden; clip: rect(0,0,0,0);
              white-space: nowrap; border: 0;
            }
            /* Layout */
            /* Make page full width on this screen */
            .fullpage { padding: 0; margin: 0; width: 100vw; }
            .a4-page { max-width: 100%; }
            /* Breadcrumbs */
            .breadcrumbs-bar {
              width: 100%;
              background: linear-gradient(180deg, #f9fafb, #f3f4f6);
              border-bottom: 1px solid #e5e7eb;
              position: sticky;
              top: 0;
              z-index: 10;
            }
            .bc-list {
              display: flex;
              align-items: center;
              gap: 8px;
              list-style: none;
              margin: 0;
              padding: 10px 0;
              font-size: .95rem;
              color: #475569;
              white-space: nowrap;           /* keep one line */
              flex-wrap: nowrap;             /* never wrap to next row */
              overflow-x: auto;              /* allow horizontal scroll when needed */
              overflow-y: hidden;
              -webkit-overflow-scrolling: touch;
            }
            .bc-list > * { flex: 0 0 auto; }
            .bc-item {
              display: inline-flex;
              align-items: center;
              gap: .5rem;
              padding: .35rem .65rem;
              border-radius: 999px;
              background: #fff;
              border: 1px solid #e5e7eb;
              color: #334155;
              font-weight: 700;
              white-space: nowrap;
            }
            .bc-item.bc-current {
              color: #111827;
              border-color: #c7d2fe;
              background: #eef2ff;
            }
            .bc-sep { color: #94a3b8; padding-inline: .25rem; flex: 0 0 auto; }


            .taxon-layout{
              display: grid;
              grid-template-columns:
                minmax(220px, 16%)              /* left index */
                minmax(0, 1fr)                  /* main column */
                clamp(240px, 22vw, 360px);      /* reserved right space */
              gap: 20px;
              align-items: start;
            }
            @media (max-width: 1280px){
              .taxon-layout{
                grid-template-columns:
                  minmax(200px, 20%)
                  1fr
                  clamp(160px, 16vw, 240px);
              }
            }
            @media (max-width: 1024px){
              .taxon-layout{ grid-template-columns: 1fr; }
              .taxon-aside--left,
              .taxon-aside--right{ display: none; }
            }
            .taxon-aside--right{
              position: sticky;
              top: 94px;
              max-height: calc(100vh - 120px);
              overflow: auto;
              background: #e5e7eb !important;
            }
            /* Reserved right column (kept blank) */
            .taxon-spacer-right{ background: transparent; min-height: 1px; }

            /* A4 responsive plate: no min-width, just cap max width & center */
            .taxon-card.taxon-card--a4{ width: min(100%, 900px); margin-inline: auto; }

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
              padding: 30px;
              box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
            }
            .taxon-header {
              display: grid;
              grid-template-columns: 1fr auto; /* headline + actions */
              gap: 16px;
              align-items: baseline;
              margin-bottom: 8px;
            }
            .taxon-headline { display: flex; align-items: baseline; gap: clamp(12px, 1.5vw, 18px); flex-wrap: wrap; }
            .taxon-sci { font-size: clamp(1.5rem, 1.5vw, 1.5rem); line-height: 1.2; color: #6b2a34; opacity: .9; }
            .taxon-actions { display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
            .btn-info {
              display: inline-flex; align-items: center; gap: 8px;
              background: #0c57d2; color: #fff; padding: 8px 12px; border-radius: 10px; border: 0; cursor: pointer;
            }
            .btn-info:hover { background: #0a4dbb; }
            .btn-info__label { font-weight: 600; }
            .taxon-title {
              font-size: clamp(2.5rem, 2.5vw, 2.5rem);
              line-height: 1.15;
              font-weight: 800;
              color: #50151d;
              margin: 0;
            }
            
            .taxon-sci em { font-style: italic; }
            .taxon-updated { font-size: 0.85rem; color: #6b7280; text-align: right; }
            .taxon-updated--bottom { padding-top: .5rem; margin-top: .5rem; border-top: 1px dashed var(--border, #e5e7eb); }
            .taxon-metaheader {
              display: grid;
              grid-template-columns: 4rem 1fr;
              column-gap: 14px;
              row-gap: 6px;
              margin: 12px 0 12px;
            }
            .taxon-metaheader .row { display: contents; }
            .taxon-metaheader dt { color: #111827; font-weight: 900; }
            .taxon-metaheader dd { margin: 0; color: #111827; }

            .taxon-shortdescription {
              margin: 1rem 0 1rem;
              font-size: 1rem;
              line-height: 1.5rem;
              color: #111827;
              background: #c1a58c;
              padding: 0.5rem 1rem 0.5rem 1rem;
              border-radius: 15px;
            }
            .taxon-shortdescription p { margin: 0; }

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
            .searchbar-wrap { width: 100%; max-width: 1100px; margin: 0 auto 1rem; }
            @media (max-width: 1024px) { .searchbar-wrap { max-width: 720px; } }

            .searchbar {
            display: grid;
            grid-template-columns: 24px 1fr auto auto;
            align-items: center;
            background: #fff;
            border: 1px solid var(--border, #e5e7eb);
            border-radius: 9999px;
            padding: 2px 10px;
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
              grid-template-columns: 4rem 1fr; /* narrower dt, wider dd */
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

            /* Slide-out panel and overlay */
            .slide-overlay {
              position: fixed;
              inset: 0;
              background: rgba(15,23,42,.25);
              backdrop-filter: blur(2px);
              opacity: 0;
              transition: opacity .25s ease;
              pointer-events: none;
              z-index: 40;
            }
            .slide-overlay.is-open { opacity: 1; pointer-events: auto; }

            .slide-panel {
              position: fixed;
              top: 0;
              right: 0;
              bottom: 0;
              width: 40vw;
              max-width: 720px;
              min-width: 320px;
              background: #fff;
              border-left: 1px solid #e5e7eb;
              box-shadow: -8px 0 24px rgba(15,23,42,.08);
              transform: translateX(100%);
              transition: transform .3s ease;
              z-index: 50;
              display: flex;
              flex-direction: column;
            }
            .slide-panel.is-open { transform: translateX(0); }
            .slide-panel__head {
              display: flex; align-items: center; justify-content: space-between;
              padding: 14px 16px; border-bottom: 1px solid #e5e7eb;
            }
            .slide-panel__title { margin: 0; font-size: 1.05rem; font-weight: 700; color: #111827; }
            .slide-panel__body { padding: 16px; overflow: auto; }
          `}</style>
        </section>
      </main>
    </div>
  );
}
            