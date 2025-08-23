// src/app/admin/taxonomy/[id]/preview/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

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

  // Highlighted fields
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
    .replace(/\uFFFD/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function AdminTaxonomyPreviewPage() {
  const params = useParams<{ id: string }>();
  const taxonomyId = Number(params?.id || 0);

  const [results, setResults] = useState<TaxonEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [pageSize, setPageSize] = useState<number>(10);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // selection state
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const fetchData = async (page = 1, size = pageSize) => {
    if (!taxonomyId) {
      setResults([]);
      setPagination(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(size));
      params.set('taxonomyId', String(taxonomyId)); // สำคัญ: filter ตาม taxonomy

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

  const total = pagination?.total ?? results.length;
  const pageSizeEff = pagination?.pageSize ?? pageSize;
  const rangeStart = pagination ? Math.min(total, (pagination.currentPage - 1) * pageSizeEff + 1) : 0;
  const rangeEnd = pagination ? Math.min(total, pagination.currentPage * pageSizeEff) : 0;

  const selected = useMemo(() => {
    if (!results.length) return null;
    return results.find((r) => r.id === selectedId) || results[0] || null;
  }, [results, selectedId]);

  // summary (ใช้เฉพาะ schema fields)
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

  const hasSynonyms = !!(selected?.synonymsMarked || selected?.synonyms);
  const hasFamily = !!(selected?.familyMarked || selected?.family);
  const hasOtherNames = !!(selected?.otherNames);

  return (
    <div className="reader-stage reader-stage--full">
      <main className="fullpage">
        <section className="a4-page">
          <div className="container">
            {err && (
              <div className="alert alert--danger" role="alert">
                <strong>เกิดข้อผิดพลาด:</strong> {err}
              </div>
            )}

            {/* Main content (centered) */}
            {!loading && !err && (
              results.length === 0 ? (
                <div className="brand-card p-6 text-center text-gray-600">ไม่พบผลการค้นหา</div>
              ) : (
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

                      {/* Meta header */}
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
                          __html: selected.contentHtmlMarked || selected.contentHtml || '',
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
                    {(pagination ? ( () => {
                      const { currentPage, totalPages } = pagination;
                      const out: (number | '…')[] = [];
                      const rng = (s: number, e: number) => { for (let i = s; i <= e; i++) out.push(i); };
                      if (totalPages <= 7) rng(1, totalPages);
                      else {
                        out.push(1);
                        if (currentPage > 4) out.push('…');
                        const s = Math.max(2, currentPage - 2);
                        const e = Math.min(totalPages - 1, currentPage + 2);
                        rng(s, e);
                        if (currentPage < totalPages - 3) out.push('…');
                        out.push(totalPages);
                      }
                      return out;
                    })() : []).map((p, idx) =>
                      p === '…' ? (
                        <span key={`${p}-${idx}`} className="tsep">…</span>
                      ) : (
                        <button
                          key={`${p}-${idx}`}
                          onClick={() => fetchData(p as number, pageSize)}
                          className={`tbtn tbtn-number ${p === pagination!.currentPage ? 'is-active' : ''}`}
                          aria-current={p === pagination!.currentPage ? 'page' : undefined}
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
          </div>

          {/* Styles */}
          <style jsx>{`
            /* Bottom toolbar (sticky) */
            .bottom-toolbar{
              position: sticky;
              bottom: 0;
              background: #ffffffcc;
              backdrop-filter: saturate(1.1) blur(6px);
              border-top: 1px solid #e5e7eb;
              padding: 8px 0;
              z-index: 35;
            }
            .toolbar{
              display: grid;
              grid-template-columns: auto 1fr auto;
              align-items: center;
              gap: 12px;
            }
            .toolbar__section{
              display: flex;
              align-items: center;
              gap: 8px;
              min-height: 40px;
            }
            .toolbar__section--left{ justify-content: flex-start; }
            .toolbar__pager{
              justify-content: center;
              flex-wrap: wrap;
            }
            .toolbar__section--right{
              justify-content: flex-end;
              gap: 8px;
            }
            @media (max-width: 640px){
              .toolbar{ grid-template-columns: 1fr auto; }
              .toolbar__pager{ display: none; }
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
            .toolbar__info{ font-size: .9rem; color:#6b7280; white-space: nowrap; }

            /* Layout & page styles */
            .fullpage { padding: 0; margin: 0; width: 100vw; }
            .a4-page { max-width: 100%; }
            .taxon-main { width: min(100%, 900px); margin: 0 auto; }

            .taxon-card {
              background: #fff;
              border: 1px solid var(--border, #e5e7eb);
              border-radius: 14px;
              padding: 30px;
              box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
            }
            .taxon-header {
              display: grid;
              grid-template-columns: 1fr auto;
              gap: 16px;
              align-items: baseline;
              margin-bottom: 8px;
            }
            .taxon-headline { display: flex; align-items: baseline; gap: clamp(12px, 1.5vw, 18px); flex-wrap: wrap; }
            .taxon-sci { font-size: clamp(1.5rem, 1.5vw, 1.5rem); line-height: 1.2; color: #6b2a34; opacity: .9; }
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

            .taxon-article { text-align: justify; }
            @media (min-width: 1024px) { .taxon-article { column-count: 2; column-gap: 36px; } }

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
          `}</style>
        </section>
      </main>
    </div>
  );
}