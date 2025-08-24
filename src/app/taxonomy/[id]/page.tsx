// src/app/taxonomy/[id]/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { taxonomyStyles } from './taxonomyStyles';
import { Editor } from '@tinymce/tinymce-react';

const TINYMCE_KEY = process.env.NEXT_PUBLIC_TINYMCE_KEY || 'no-api-key';
const TINYMCE_SRC = `https://cdn.tiny.cloud/1/${TINYMCE_KEY}/tinymce/6/tinymce.min.js`;

// TinyMCE image helpers (base64 inline upload)
const tinymceBase64ImageUploadHandler = (blobInfo: any) => {
  return new Promise<string>((resolve, reject) => {
    try {
      const mime = blobInfo.blob()?.type || 'image/png';
      const base64 = blobInfo.base64();
      resolve(`data:${mime};base64,${base64}`);
    } catch (err: any) {
      reject(err?.message || 'Failed to read image');
    }
  });
};

const tinymceImagePicker = (cb: (url: string, meta?: Record<string, any>) => void) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => {
    const file = (input.files && input.files[0]) || null;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      cb(reader.result as string, { title: file.name });
    };
    reader.readAsDataURL(file);
  };
  input.click();
};

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
  version?: number;
  isPublished?: boolean;
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
  const searchParams = useSearchParams();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<TaxonEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [pageSize, setPageSize] = useState<number>(10);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // selection state
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rightOpen, setRightOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<TaxonEntry>>({});
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  // Clone modal state
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneForm, setCloneForm] = useState<Partial<TaxonEntry>>({});
  const [cloning, setCloning] = useState(false);
  const [cloneErr, setCloneErr] = useState<string | null>(null);

  // Versioning state for edit modal
  type EntryVersionRow = { version: number; changed_at?: string; updatedAt?: string; changed_by_user_id?: number | null };
  const [versions, setVersions] = useState<EntryVersionRow[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsErr, setVersionsErr] = useState<string | null>(null);
  const [selectedVersionNum, setSelectedVersionNum] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const fetchData = async (page = 1, size = pageSize, queryOverride?: string) => {
    if (!taxonomyId) { setResults([]); setPagination(null); return; }
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      const qEff = typeof queryOverride === 'string' ? queryOverride : q;
      if (qEff.trim()) params.set('q', qEff.trim());
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

  useEffect(() => {
    const qp = searchParams?.get('q') || '';
    if (qp) {
      if (qp !== q) setQ(qp);
      void fetchData(1, pageSize, qp);
    } else {
      void fetchData(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxonomyId, searchParams]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetchData(1);
  };

  const openEdit = async () => {
    if (!selected) return;

    setSaveErr(null);
    setEditOpen(true);

    const currVer = (selected as any).version ?? null;
    setSelectedVersionNum(currVer);

    if (selected?.id) void fetchVersionsList(selected.id);

    try {
      const res = await fetch(`/api/taxonomy/entry/${selected.id}`);
      if (res.ok) {
        const full = await res.json();
        setEditForm({
          id: full.id,
          taxonId: full.taxonId,
          title: full.title ?? '',
          officialNameTh: full.officialNameTh ?? '',
          scientificName: full.scientificName ?? '',
          genus: full.genus ?? '',
          species: full.species ?? '',
          family: full.family ?? '',
          authorsDisplay: full.authorsDisplay ?? '',
          authorsPeriod: full.authorsPeriod ?? '',
          otherNames: full.otherNames ?? '',
          synonyms: full.synonyms ?? '',
          author: full.author ?? '',
          shortDescription: full.shortDescription ?? '',
          contentHtml: full.contentHtml ?? '',
          slug: full.slug ?? '',
          orderIndex: full.orderIndex ?? null,
          version: (full as any).version ?? currVer ?? 0,
          isPublished: !!(full as any).isPublished,
        });
        return;
      }
    } catch {}

    setEditForm({
      id: selected.id,
      taxonId: selected.taxonId,
      title: selected.title ?? '',
      officialNameTh: selected.officialNameTh ?? '',
      scientificName: selected.scientificName ?? '',
      genus: selected.genus ?? '',
      species: selected.species ?? '',
      family: selected.family ?? '',
      authorsDisplay: selected.authorsDisplay ?? '',
      authorsPeriod: selected.authorsPeriod ?? '',
      otherNames: selected.otherNames ?? '',
      synonyms: selected.synonyms ?? '',
      author: selected.author ?? '',
      shortDescription: selected.shortDescription ?? '',
      contentHtml: selected.contentHtml ?? '',
      slug: selected.slug ?? '',
      orderIndex: selected.orderIndex ?? null,
      version: (selected as any).version ?? 0,
      isPublished: (selected as any).isPublished ?? false,
    });
  };

  const openClone = async () => {
    if (!selected) return;

    let src: any = selected;
    try {
      const res = await fetch(`/api/taxonomy/entry/${selected.id}`);
      if (res.ok) src = await res.json();
    } catch {}

    const baseTitle = src.title || src.officialNameTh || 'รายการใหม่';
    const suggestedTitle = `${baseTitle} (สำเนา)`;
    const suggestedSlug = src.slug ? `${src.slug}-copy` : '';

    setCloneForm({
      taxonId: src.taxonId,
      title: suggestedTitle,
      officialNameTh: src.officialNameTh ?? '',
      scientificName: src.scientificName ?? '',
      genus: src.genus ?? '',
      species: src.species ?? '',
      family: src.family ?? '',
      authorsDisplay: src.authorsDisplay ?? '',
      authorsPeriod: src.authorsPeriod ?? '',
      otherNames: src.otherNames ?? '',
      synonyms: src.synonyms ?? '',
      author: src.author ?? '',
      shortDescription: src.shortDescription ?? '',
      contentHtml: src.contentHtml ?? '',
      slug: suggestedSlug,
      orderIndex: src.orderIndex ?? null,
      isPublished: !!src.isPublished,
    });
    setCloneErr(null);
    setCloneOpen(true);
  };

  const setCloneField = (key: keyof TaxonEntry, value: any) => {
    setCloneForm((f) => ({ ...f, [key]: value }));
  };

  const handleCloneSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setCloning(true);
    setCloneErr(null);
    const payload: any = {
      ...cloneForm,
      orderIndex:
        typeof cloneForm.orderIndex === 'string'
          ? parseInt(cloneForm.orderIndex as any, 10)
          : cloneForm.orderIndex,
    };
    try {
      const res = await fetch(`/api/taxonomy/entry/${selected.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let m = `HTTP ${res.status}`;
        try { const j = await res.json(); m = j.error || m; } catch {}
        throw new Error(m);
      }
      const j = await res.json();
      const newId = j?.entry?.id || j?.id;
      await fetchData(pagination?.currentPage ?? 1);
      if (newId) setSelectedId(newId);
      setCloneOpen(false);
    } catch (e: any) {
      setCloneErr(e?.message || 'คัดลอกไม่สำเร็จ');
    } finally {
      setCloning(false);
    }
  };

  const setField = (key: keyof TaxonEntry, value: any) => {
    setEditForm((f) => ({ ...f, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    // Prevent saving when viewing non-latest version
    const latestVersion = latestVersionFromVersions;
    if (selectedVersionNum !== null && latestVersion !== null && selectedVersionNum !== latestVersion) {
      setSaveErr('ขณะนี้กำลังดูเวอร์ชันเก่า โปรดสลับเป็นเวอร์ชันล่าสุดก่อนบันทึก');
      setSaving(false);
      return;
    }
    setSaving(true);
    setSaveErr(null);
    const payload: any = {
      ...editForm,
      orderIndex:
        typeof editForm.orderIndex === 'string'
          ? parseInt(editForm.orderIndex as any, 10)
          : editForm.orderIndex,
      version: ((selected as any).version ?? 0) + 1,
    };
    try {
      const res = await fetch(`/api/taxonomy/entry/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let m = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          m = j.error || m;
        } catch {}
        throw new Error(m);
      }
      // refresh current page and close modal
      await fetchData(pagination?.currentPage ?? 1);
      setEditOpen(false);
    } catch (err: any) {
      setSaveErr(err?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  // Fetch list of versions for the selected entry
  const fetchVersionsList = async (entryId: number) => {
    setVersionsLoading(true);
    setVersionsErr(null);
    try {
      // primary endpoint (recommended)
      let res = await fetch(`/api/taxonomy/entry/${entryId}/versions`).catch(() => null as any);
      if (!res || !res.ok) {
        res = await fetch(`/api/taxonomy/entry/${entryId}?versions=1`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rows: EntryVersionRow[] = Array.isArray(data?.versions) ? data.versions : Array.isArray(data) ? data : [];
      // sort desc (latest first)
      rows.sort((a, b) => (b.version || 0) - (a.version || 0));
      setVersions(rows);
    } catch (e: any) {
      setVersions([]);
      setVersionsErr(e?.message || 'โหลดเวอร์ชันไม่สำเร็จ');
    } finally {
      setVersionsLoading(false);
    }
  };

  // Fetch snapshot of a specific version and load into form (read-only view)
  const fetchVersionSnapshot = async (entryId: number, version: number) => {
    try {
      if (version === latestVersionFromVersions) {
        const live = await fetch(`/api/taxonomy/entry/${entryId}`).catch(() => null as any);
        if (live && live.ok) {
          const full = await live.json();
          setEditForm((f) => ({
            ...f,
            id: full.id,
            taxonId: full.taxonId,
            title: full.title ?? '',
            officialNameTh: full.officialNameTh ?? '',
            scientificName: full.scientificName ?? '',
            genus: full.genus ?? '',
            species: full.species ?? '',
            family: full.family ?? '',
            authorsDisplay: full.authorsDisplay ?? '',
            authorsPeriod: full.authorsPeriod ?? '',
            otherNames: full.otherNames ?? '',
            synonyms: full.synonyms ?? '',
            author: full.author ?? '',
            shortDescription: full.shortDescription ?? '',
            contentHtml: full.contentHtml ?? '',
            slug: full.slug ?? '',
            orderIndex: full.orderIndex ?? null,
            isPublished: !!(full as any).isPublished,
          }));
          return;
        }
      }

      let res = await fetch(`/api/taxonomy/entry/${entryId}/versions/${version}`).catch(() => null as any);
      if (!res || !res.ok) {
        res = await fetch(`/api/taxonomy/entry/${entryId}?version=${version}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const snap = await res.json();
      const payload = snap?.entry || snap?.snapshot || snap;
      if (payload && typeof payload === 'object') {
        setEditForm((f) => ({
          ...f,
          id: (payload.taxonEntryId ?? payload.id ?? entryId) as any,
          taxonId: (payload.taxonId ?? (f as any).taxonId ?? null) as any,
          title: payload.title ?? '',
          officialNameTh: payload.officialNameTh ?? '',
          scientificName: payload.scientificName ?? '',
          genus: payload.genus ?? '',
          species: payload.species ?? '',
          family: payload.family ?? '',
          authorsDisplay: payload.authorsDisplay ?? '',
          authorsPeriod: payload.authorsPeriod ?? '',
          otherNames: payload.otherNames ?? '',
          synonyms: payload.synonyms ?? '',
          author: payload.author ?? '',
          shortDescription: payload.shortDescription ?? '',
          contentHtml: payload.contentHtml ?? '',
          slug: payload.slug ?? '',
          orderIndex: payload.orderIndex ?? null,
          isPublished: (payload.isPublished ?? (f as any).isPublished ?? false) as any,
        }));
      }
    } catch (e: any) {
      setSaveErr(e?.message || 'ไม่สามารถโหลดข้อมูลเวอร์ชัน');
    }
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

    // Determine latest version from versions list (fallback to selected.version)
    const latestVersionFromVersions = useMemo(() => {
      if (versions && versions.length) {
        return Math.max(...versions.map(v => v.version || 0));
      }
      return (selected as any)?.version ?? null;
    }, [versions, selected]);

    // Are we currently viewing an older (non-latest) version?
    const isViewingOldVersion = useMemo(() => {
      if (selectedVersionNum == null || latestVersionFromVersions == null) return false;
      return selectedVersionNum !== latestVersionFromVersions;
    }, [selectedVersionNum, latestVersionFromVersions]);

    // Default to the latest version when editor opens and versions are available
    useEffect(() => {
      if (!editOpen) return;
      if (selectedVersionNum == null && latestVersionFromVersions != null) {
        setSelectedVersionNum(latestVersionFromVersions);
      }
    }, [editOpen, latestVersionFromVersions]);

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

                          {/* Actions (visible when there is a selected record) */}
                          <div className="taxon-actions">
                            <button
                              type="button"
                              className="btn-info"
                              title="ทำสำเนา (Clone)"
                              aria-label="ทำสำเนา"
                              onClick={openClone}
                            >
                              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                                <path d="M7 7a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V7Zm-4 4a2 2 0 0 1 2-2h1v9a3 3 0 0 0 3 3h9v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9Z"/>
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="btn-info"
                              title="แก้ไขเนื้อหา"
                              aria-label="แก้ไขเนื้อหา"
                              onClick={openEdit}
                            >
                              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                                <path d="M3 17.25V21h3.75L18.81 8.94l-3.75-3.75L3 17.25Zm2.92 2.33h-.84v-.84l9.9-9.9.84.84-9.9 9.9ZM20.71 7.04a1 1 0 0 0 0-1.41L18.37 3.29a1 1 0 0 0-1.41 0l-1.59 1.59 3.75 3.75 1.59-1.59Z"/>
                              </svg>
                            </button>
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
          
          {/* Clone Modal */}
          {cloneOpen && (
            <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="cloneTitle">
              <div className="modal">
                <div className="modal-head">
                  <div className="modal-head__left">
                    <h4 id="cloneTitle">ทำสำเนา / สร้างรายการใหม่</h4>
                  </div>
                  <button className="btn-icon" aria-label="ปิด" onClick={() => setCloneOpen(false)}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M6.22 6.22a.75.75 0 0 1 1.06 0L12 10.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L13.06 12l4.72 4.72a.75.75 0 1 1-1.06 1.06L12 13.06l-4.72 4.72a.75.75 0 1 1-1.06-1.06L10.94 12 6.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>

                <form className="modal-body" onSubmit={handleCloneSave}>
                  <div className="form-grid">
                    <label>
                      <span>ชื่อทางการ (ไทย)</span>
                      <input type="text" value={(cloneForm.officialNameTh as any) ?? ''} onChange={(e) => setCloneField('officialNameTh', e.target.value)} />
                    </label>

                    <label>
                      <span>Title</span>
                      <input type="text" value={(cloneForm.title as any) ?? ''} onChange={(e) => setCloneField('title', e.target.value)} />
                    </label>

                    <label>
                      <span>ชื่อวิทยาศาสตร์</span>
                      <input type="text" value={(cloneForm.scientificName as any) ?? ''} onChange={(e) => setCloneField('scientificName', e.target.value)} />
                    </label>

                    <label>
                      <span>ชื่อสกุล (Genus)</span>
                      <input type="text" value={(cloneForm.genus as any) ?? ''} onChange={(e) => setCloneField('genus', e.target.value)} />
                    </label>

                    <label>
                      <span>คำระบุชนิด (Species)</span>
                      <input type="text" value={(cloneForm.species as any) ?? ''} onChange={(e) => setCloneField('species', e.target.value)} />
                    </label>

                    <label>
                      <span>วงศ์ (Family)</span>
                      <input type="text" value={(cloneForm.family as any) ?? ''} onChange={(e) => setCloneField('family', e.target.value)} />
                    </label>

                    <label className="span-2">
                      <span>ชื่อพ้อง (Synonyms)</span>
                      <textarea value={(cloneForm.synonyms as any) ?? ''} onChange={(e) => setCloneField('synonyms', e.target.value)} rows={3} />
                    </label>

                    <label className="span-2">
                      <span>ชื่ออื่น ๆ</span>
                      <input type="text" value={(cloneForm.otherNames as any) ?? ''} onChange={(e) => setCloneField('otherNames', e.target.value)} />
                    </label>

                    <label className="span-2">
                      <span>คำโปรย/คำอธิบายสั้น</span>
                      <div className="tinymce-wrap">
                        <Editor
                          key={`clone-shortdesc-${cloneOpen ? 'open' : 'closed'}`}
                          id="clone-shortdesc"
                          apiKey={TINYMCE_KEY}
                          tinymceScriptSrc={TINYMCE_SRC}
                          value={(cloneForm.shortDescription as any) ?? ''}
                          onEditorChange={(v: string) => setCloneField('shortDescription', v)}
                          init={{
                            height: 220,
                            menubar: false,
                            branding: false,
                            toolbar_mode: 'sliding',
                            plugins: 'lists link table code image paste',
                            toolbar: 'undo redo | bold italic underline | bullist numlist | alignleft aligncenter alignright | link image | removeformat | code',
                            content_style: 'body{font-family:"TH Sarabun PSK","TH Sarabun New",Tahoma,Arial,sans-serif;font-size:16px;line-height:1.7}',
                            statusbar: true,
                            // image upload (base64)
                            automatic_uploads: true,
                            paste_data_images: true,
                            file_picker_types: 'image',
                            file_picker_callback: (cb) => tinymceImagePicker(cb),
                            images_upload_handler: tinymceBase64ImageUploadHandler,
                            convert_urls: false,
                          }}
                        />
                      </div>
                    </label>

                    <label className="span-2">
                      <span>ผู้เขียนคำอธิบาย</span>
                      <input type="text" value={(cloneForm.author as any) ?? ''} onChange={(e) => setCloneField('author', e.target.value)} />
                    </label>

                    <label className="span-2">
                      <span>ผู้ตั้งพรรณพืช (แสดงผล)</span>
                      <textarea value={(cloneForm.authorsDisplay as any) ?? ''} onChange={(e) => setCloneField('authorsDisplay', e.target.value)} rows={2} />
                    </label>

                    <label className="span-2">
                      <span>ช่วงเวลาเกี่ยวกับผู้ตั้งพรรณพืช</span>
                      <textarea value={(cloneForm.authorsPeriod as any) ?? ''} onChange={(e) => setCloneField('authorsPeriod', e.target.value)} rows={2} />
                    </label>

                    <label>
                      <span>Slug</span>
                      <input type="text" value={(cloneForm.slug as any) ?? ''} onChange={(e) => setCloneField('slug', e.target.value)} />
                    </label>

                    <label>
                      <span>ลำดับ (orderIndex)</span>
                      <input type="number" value={cloneForm.orderIndex as any ?? ''} onChange={(e) => setCloneField('orderIndex', e.target.value)} />
                    </label>

                    <label>
                      <span>เผยแพร่ (isPublished)</span>
                      <input
                        type="checkbox"
                        checked={!!cloneForm.isPublished}
                        onChange={(e) => setCloneField('isPublished', e.target.checked)}
                        style={{ width: 'auto' }}
                      />
                    </label>

                    <label className="span-2">
                      <span>เนื้อหา (HTML)</span>
                      <div id="clone-content-toolbar" className="tinymce-toolbar-host" />
                      <div className="tinymce-wrap">
                        <Editor
                          key={`clone-content-${cloneOpen ? 'open' : 'closed'}`}
                          id="clone-contenthtml"
                          apiKey={TINYMCE_KEY}
                          tinymceScriptSrc={TINYMCE_SRC}
                          value={(cloneForm.contentHtml as any) ?? ''}
                          onEditorChange={(v: string) => setCloneField('contentHtml', v)}
                          init={{
                            height: 520,
                            menubar: 'file edit view insert format tools table help',
                            branding: false,
                            plugins: 'advlist autolink lists link image charmap preview anchor searchreplace visualblocks code fullscreen insertdatetime media table help wordcount paste',
                            toolbar: 'undo redo | blocks fontfamily fontsize | bold italic underline forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | table link image media | removeformat | code preview fullscreen',
                            toolbar_sticky: false,
                            toolbar_mode: 'sliding',
                            fixed_toolbar_container: '#clone-content-toolbar',
                            content_style: 'body{font-family:"TH Sarabun PSK","TH Sarabun New",Tahoma,Arial,sans-serif;font-size:16px;line-height:1.8}',
                            paste_data_images: true,
                            image_caption: true,
                            table_default_attributes: { border: '1' },
                            // image upload (base64)
                            automatic_uploads: true,
                            file_picker_types: 'image',
                            file_picker_callback: (cb) => tinymceImagePicker(cb),
                            images_upload_handler: tinymceBase64ImageUploadHandler,
                            convert_urls: false,
                          }}
                        />
                      </div>
                    </label>
                  </div>

                  {cloneErr && (
                    <div className="alert alert--danger" role="alert" style={{ marginTop: 8 }}>
                      <strong>ผิดพลาด:</strong> {cloneErr}
                    </div>
                  )}

                  <div className="modal-actions">
                    <button type="button" className="tbtn" onClick={() => setCloneOpen(false)}>ยกเลิก</button>
                    <button type="submit" className="tbtn tbtn-number is-active" disabled={cloning}>
                      {cloning ? 'กำลังสร้าง…' : 'สร้างใหม่'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
          
          {/* Edit Modal */}
          {editOpen && (
            <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="editTitle">
              <div className="modal">
                <div className="modal-head">
                  <div className="modal-head__left">
                    <h4 id="editTitle">แก้ไขข้อมูลรายการ</h4>
                    <div className="ver-switch" title="สลับดูเวอร์ชัน">
                      <label>
                        <span>เวอร์ชัน:</span>
                        <select
                          value={selectedVersionNum ?? ''}
                          onChange={async (e) => {
                            const v = e.target.value ? parseInt(e.target.value, 10) : NaN;
                            if (!selected) return;
                            if (!Number.isFinite(v)) return;
                            setSelectedVersionNum(v);
                            // when switching: if not latest → load snapshot and show read-only
                            await fetchVersionSnapshot(selected.id, v);
                          }}
                          className="ver-select"
                          disabled={versionsLoading || versions.length <= 1}
                        >
                          {(versions && versions.length > 0 ? versions : [{ version: (selected as any)?.version ?? 1 }])
                            .sort((a,b)=> (b.version||0)-(a.version||0))
                            .map((row) => {
                              const d = (row as any).updatedAt || (row as any).changed_at;
                              const when = d ? new Date(d as any).toLocaleString('th-TH') : '';
                              const isLatest = latestVersionFromVersions != null && row.version === latestVersionFromVersions;
                              return (
                                <option key={row.version} value={row.version}>
                                  {`v${row.version}${when ? ` – ${when}` : ''}`}{isLatest ? ' (ล่าสุด)' : ''}
                                </option>
                              );
                            })}
                        </select>
                      </label>
                      {isViewingOldVersion && (
                        <button
                          type="button"
                          className="tbtn"
                          onClick={async () => {
                            if (!selected) return;
                            const latest = latestVersionFromVersions;
                            if (latest != null) {
                              setSelectedVersionNum(latest);
                              await fetchVersionSnapshot(selected.id, latest);
                            }
                          }}
                          title="กลับไปยังเวอร์ชันล่าสุด"
                          style={{ marginLeft: 6 }}
                        >
                          กลับเวอร์ชันล่าสุด
                        </button>
                      )}
                      {versionsLoading && <span className="ver-hint">กำลังโหลดเวอร์ชัน…</span>}
                      {versionsErr && <span className="ver-hint ver-hint--err">{versionsErr}</span>}
                    </div>
                  </div>
                  <button className="btn-icon" aria-label="ปิด" onClick={() => setEditOpen(false)}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M6.22 6.22a.75.75 0 0 1 1.06 0L12 10.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L13.06 12l4.72 4.72a.75.75 0 1 1-1.06 1.06L12 13.06l-4.72 4.72a.75.75 0 1 1-1.06-1.06L10.94 12 6.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>

                <form className="modal-body" onSubmit={handleSave}>
                  {isViewingOldVersion && (
                    <div className="alert alert--warning" role="status" style={{ marginBottom: 12 }}>
                      ขณะนี้กำลังดู <strong>เวอร์ชัน v{selectedVersionNum}</strong> (ไม่ใช่เวอร์ชันล่าสุด) — ฟิลด์ถูกล็อกเพื่อการดูย้อนหลังเท่านั้น
                    </div>
                  )}
                  <div className="form-grid">
                    <label>
                      <span>ชื่อทางการ (ไทย)</span>
                      <input type="text" value={(editForm.officialNameTh as any) ?? ''} onChange={(e) => setField('officialNameTh', e.target.value)} readOnly={isViewingOldVersion} />
                    </label>

                    <label>
                      <span>Title</span>
                      <input type="text" value={(editForm.title as any) ?? ''} onChange={(e) => setField('title', e.target.value)} readOnly={isViewingOldVersion} />
                    </label>

                    <label>
                      <span>ชื่อวิทยาศาสตร์</span>
                      <input type="text" value={(editForm.scientificName as any) ?? ''} onChange={(e) => setField('scientificName', e.target.value)} readOnly={isViewingOldVersion} />
                    </label>

                    <label>
                      <span>ชื่อสกุล (Genus)</span>
                      <input type="text" value={(editForm.genus as any) ?? ''} onChange={(e) => setField('genus', e.target.value)} readOnly={isViewingOldVersion} />
                    </label>

                    <label>
                      <span>คำระบุชนิด (Species)</span>
                      <input type="text" value={(editForm.species as any) ?? ''} onChange={(e) => setField('species', e.target.value)} readOnly={isViewingOldVersion} />
                    </label>

                    <label>
                      <span>วงศ์ (Family)</span>
                      <input type="text" value={(editForm.family as any) ?? ''} onChange={(e) => setField('family', e.target.value)} readOnly={isViewingOldVersion} />
                    </label>

                    <label className="span-2">
                      <span>ชื่อพ้อง (Synonyms)</span>
                      <textarea value={(editForm.synonyms as any) ?? ''} onChange={(e) => setField('synonyms', e.target.value)} rows={3} readOnly={isViewingOldVersion} />
                    </label>

                    <label className="span-2">
                      <span>ชื่ออื่น ๆ</span>
                      <input type="text" value={(editForm.otherNames as any) ?? ''} onChange={(e) => setField('otherNames', e.target.value)} readOnly={isViewingOldVersion} />
                    </label>

                    <label className="span-2">
                      <span>คำโปรย/คำอธิบายสั้น</span>
                      <div className="tinymce-wrap">
                        <Editor
                          key={`edit-shortdesc-${editOpen ? 'open' : 'closed'}-v${selectedVersionNum ?? 'live'}`}
                          id="edit-shortdesc"
                          apiKey={TINYMCE_KEY}
                          tinymceScriptSrc={TINYMCE_SRC}
                          value={(editForm.shortDescription as any) ?? ''}
                          onEditorChange={(v: string) => setField('shortDescription', v)}
                          disabled={isViewingOldVersion}
                          init={{
                            height: 220,
                            menubar: false,
                            branding: false,
                            toolbar_mode: 'sliding',
                            plugins: 'lists link table code image paste',
                            toolbar: 'undo redo | bold italic underline | bullist numlist | alignleft aligncenter alignright | link image | removeformat | code',
                            content_style: 'body{font-family:"TH Sarabun PSK","TH Sarabun New",Tahoma,Arial,sans-serif;font-size:16px;line-height:1.7}',
                            statusbar: true,
                            // image upload (base64)
                            automatic_uploads: true,
                            paste_data_images: true,
                            file_picker_types: 'image',
                            file_picker_callback: (cb) => tinymceImagePicker(cb),
                            images_upload_handler: tinymceBase64ImageUploadHandler,
                            convert_urls: false,
                          }}
                        />
                      </div>
                    </label>

                    <label className="span-2">
                      <span>ผู้เขียนคำอธิบาย</span>
                      <input type="text" value={(editForm.author as any) ?? ''} onChange={(e) => setField('author', e.target.value)} readOnly={isViewingOldVersion} />
                    </label>

                    <label className="span-2">
                      <span>ผู้ตั้งพรรณพืช (แสดงผล)</span>
                      <textarea value={(editForm.authorsDisplay as any) ?? ''} onChange={(e) => setField('authorsDisplay', e.target.value)} rows={2} readOnly={isViewingOldVersion} />
                    </label>

                    <label className="span-2">
                      <span>ช่วงเวลาเกี่ยวกับผู้ตั้งพรรณพืช</span>
                      <textarea value={(editForm.authorsPeriod as any) ?? ''} onChange={(e) => setField('authorsPeriod', e.target.value)} rows={2} readOnly={isViewingOldVersion} />
                    </label>

                    <label>
                      <span>Slug</span>
                      <input type="text" value={(editForm.slug as any) ?? ''} onChange={(e) => setField('slug', e.target.value)} readOnly={isViewingOldVersion} />
                    </label>

                    <label>
                      <span>ลำดับ (orderIndex)</span>
                      <input type="number" value={editForm.orderIndex as any ?? ''} onChange={(e) => setField('orderIndex', e.target.value)} readOnly={isViewingOldVersion} />
                    </label>

                    <label>
                      <span>เผยแพร่ (isPublished)</span>
                      <input
                        type="checkbox"
                        checked={!!editForm.isPublished}
                        onChange={(e) => setField('isPublished', e.target.checked)}
                        disabled={isViewingOldVersion}
                        style={{ width: 'auto' }}
                      />
                    </label>
                    
                    <label className="span-2">
                      <span>เนื้อหา (HTML)</span>
                      <div id="edit-content-toolbar" className="tinymce-toolbar-host" />
                      <div className="tinymce-wrap">
                        <Editor
                          key={`edit-content-${editOpen ? 'open' : 'closed'}-v${selectedVersionNum ?? 'live'}`}
                          id="edit-contenthtml"
                          apiKey={TINYMCE_KEY}
                          tinymceScriptSrc={TINYMCE_SRC}
                          value={(editForm.contentHtml as any) ?? ''}
                          onEditorChange={(v: string) => setField('contentHtml', v)}
                          disabled={isViewingOldVersion}
                          init={{
                            height: 520,
                            menubar: 'file edit view insert format tools table help',
                            branding: false,
                            plugins: 'advlist autolink lists link image charmap preview anchor searchreplace visualblocks code fullscreen insertdatetime media table help wordcount paste',
                            toolbar: 'undo redo | blocks fontfamily fontsize | bold italic underline forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | table link image media | removeformat | code preview fullscreen',
                            toolbar_sticky: false,
                            toolbar_mode: 'sliding',
                            fixed_toolbar_container: '#edit-content-toolbar',
                            content_style: 'body{font-family:"TH Sarabun PSK","TH Sarabun New",Tahoma,Arial,sans-serif;font-size:16px;line-height:1.8}',
                            paste_data_images: true,
                            image_caption: true,
                            table_default_attributes: { border: '1' },
                            // image upload (base64)
                            automatic_uploads: true,
                            file_picker_types: 'image',
                            file_picker_callback: (cb) => tinymceImagePicker(cb),
                            images_upload_handler: tinymceBase64ImageUploadHandler,
                            convert_urls: false,
                          }}
                        />
                      </div>
                    </label>
                  </div>

                  {saveErr && (
                    <div className="alert alert--danger" role="alert" style={{ marginTop: 8 }}>
                      <strong>ผิดพลาด:</strong> {saveErr}
                    </div>
                  )}

                  <div className="modal-actions">
                    <button type="button" className="tbtn" onClick={() => setEditOpen(false)}>ยกเลิก</button>
                    <button type="submit" className="tbtn tbtn-number is-active" disabled={saving || isViewingOldVersion}>
                      {saving ? 'กำลังบันทึก…' : (isViewingOldVersion ? 'ดูย้อนหลัง' : 'บันทึก')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
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
          <style jsx>{taxonomyStyles}</style>
          <style jsx>{`
            .modal-overlay{
              position: fixed;
              inset: 0;
              background: rgba(15,23,42,.35);
              backdrop-filter: blur(2px);
              z-index: 60;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 16px;
            }
            .modal{
              width: min(1100px, 96vw);
              max-height: 92vh;
              overflow: auto;
              background: #fff;
              border: 1px solid #e5e7eb;
              border-radius: 12px;
              box-shadow: 0 20px 60px rgba(0,0,0,.22);
            }
            .modal-head{
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 8px;
              padding: 12px 14px;
              border-bottom: 1px solid #e5e7eb;
            }
            .modal-head h4{ margin: 0; font-weight: 800; color: #111827; }
            .modal-head__left{ display:flex; align-items:center; gap:12px; }
            .ver-switch{ display:flex; align-items:center; gap:6px; }
            .ver-switch label{ display:flex; align-items:center; gap:6px; font-size:.9rem; color:#374151; }
            .ver-select{ border:1px solid #e5e7eb; border-radius:8px; padding:6px 8px; background:#fff; }
            .ver-hint{ font-size:.8rem; color:#6b7280; margin-left:6px; }
            .ver-hint--err{ color:#b91c1c; }
            .modal-body{ padding: 14px; }
            .form-grid{
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;
            }
            .form-grid .span-2{ grid-column: span 2; }
            .form-grid label{ display: grid; gap: 6px; font-size: .95rem; color: #374151; }
            .form-grid input,
            .form-grid textarea{
              width: 100%;
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 8px 10px;
              font-size: 1rem;
              background: #fff;
              color: #111827;
            }
            .form-grid textarea{ resize: vertical; }
            .modal-actions{
              display: flex;
              justify-content: flex-end;
              gap: 8px;
              padding-top: 10px;
              margin-top: 6px;
              border-top: 1px dashed #e5e7eb;
            }
            .tinymce-wrap :global(.tox-tinymce){ width: 100%; border-radius: 8px; }
            .tinymce-wrap :global(.tox .tox-statusbar){ border-radius: 0 0 8px 8px; }
            .tinymce-toolbar-host{
              position: sticky;
              top: 0;
              z-index: 80; /* above editor content but below modal header */
              background: #fff;
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 4px 6px;
              margin-bottom: 6px;
            }
            /* Ensure TinyMCE dropdown panels appear above image/content inside modal */
            :global(.tox-tinymce-aux){
              z-index: 100000 !important;
            }
          `}</style>
        </section>
      </main>
    </div>
  );
}
            
          