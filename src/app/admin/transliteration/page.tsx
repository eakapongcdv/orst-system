// src/app/admin/transliteration/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

export type TransliterationRow = {
  id: number;
  romanization: string;
  originalScript1?: string | null;
  originalScript2?: string | null;
  language?: string | null;
  wordType?: string | null;
  category?: string | null;
  transliteration1?: string | null;
  transliteration2?: string | null;
  version?: number;
  updatedAt?: string;
  createdAt?: string;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type SortBy = 'id' | 'romanization' | 'language' | 'version' | 'updatedAt';
type SortDir = 'asc' | 'desc';

export default function AdminTransliterationPage() {
  const [q, setQ] = useState('');
  const [list, setList] = useState<TransliterationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState<Pagination | null>(null);

  const [sortBy, setSortBy] = useState<SortBy>('id');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Delete-all modal state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [deleteInfo, setDeleteInfo] = useState<string | null>(null);

  const exportHref = useMemo(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set('q', q.trim());
    if (sortBy) sp.set('sortBy', String(sortBy));
    if (sortDir) sp.set('sortDir', String(sortDir));
    return `/api/admin/transliteration/all/export.xlsx?${sp.toString()}`;
  }, [q, sortBy, sortDir]);

  const fetchData = async (
    _page = page,
    _pageSize = pageSize,
    _q = q,
    _sortBy = sortBy,
    _sortDir = sortDir
  ) => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(_page));
      params.set('pageSize', String(_pageSize));
      params.set('sortBy', String(_sortBy));
      params.set('sortDir', String(_sortDir));
      if (_q.trim()) params.set('q', _q.trim());

      // NOTE: คาดหวังให้มี API นี้: GET /api/admin/transliteration
      // ส่งกลับ { items: TransliterationRow[], pagination }
      const r = await fetch(`/api/admin/transliteration?${params.toString()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const items: TransliterationRow[] = j.items || [];
      setList(items);
      setPagination(j.pagination || null);
      setPage(j.pagination?.page || _page);
      setPageSize(j.pagination?.pageSize || _pageSize);
    } catch (e: any) {
      setErr(e?.message || 'โหลดข้อมูลไม่สำเร็จ');
      setList([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(1); }, []);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData(1, pageSize, q, sortBy, sortDir);
  };

  const pageNumbers = useMemo(() => {
    const p = pagination;
    if (!p) return [] as (number | '…')[];
    const { page, totalPages } = p;
    const out: (number | '…')[] = [];
    const rng = (s: number, e: number) => { for (let i = s; i <= e; i++) out.push(i); };
    if (totalPages <= 7) {
      rng(1, totalPages);
    } else {
      out.push(1);
      if (page > 4) out.push('…');
      const s = Math.max(2, page - 2);
      const e = Math.min(totalPages - 1, page + 2);
      rng(s, e);
      if (page < totalPages - 3) out.push('…');
      out.push(totalPages);
    }
    return out;
  }, [pagination]);

  const applySort = (col: SortBy) => {
    let dir: SortDir = 'asc';
    if (sortBy === col) {
      dir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      dir = (col === 'updatedAt' || col === 'version') ? 'desc' : 'asc';
    }
    setSortBy(col);
    setSortDir(dir);
    fetchData(1, pageSize, q, col, dir);
  };

  const sortIcon = (col: SortBy) => {
    if (sortBy !== col) return <span className="sort-caret">↕</span>;
    return <span className="sort-caret active">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const deleteAllTransliterations = async () => {
    setDeletingAll(true);
    setDeleteErr(null);
    setDeleteInfo(null);
    try {
      // Try RESTful nested route first
      let res = await fetch('/api/admin/transliteration/all', { method: 'DELETE', cache: 'no-store' });
      if (!res.ok) {
        // Fallback: query param toggler
        res = await fetch('/api/admin/transliteration?all=1', { method: 'DELETE', cache: 'no-store' });
      }
      if (!res.ok) {
        // Fallback: same path with JSON body
        res = await fetch('/api/admin/transliteration', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ all: true }),
          cache: 'no-store',
        });
      }
      if (!res.ok) {
        let m = `HTTP ${res.status}`;
        try { const j = await res.json(); m = j.error || m; } catch {}
        throw new Error(m);
      }
      const j = await res.json().catch(() => ({}));
      const count = j?.deleted ?? j?.count ?? undefined;
      setDeleteInfo(
        typeof count === 'number' ? `ลบสำเร็จ ${count} รายการ` : 'ลบสำเร็จ'
      );
      // Refresh list
      await fetchData(1, pageSize, q, sortBy, sortDir);
      setDeleteOpen(false);
    } catch (e: any) {
      setDeleteErr(e?.message || 'ลบไม่สำเร็จ');
    } finally {
      setDeletingAll(false);
    }
  };

  return (
    <div className="adm-wrap">
      <header className="adm-head">
        <h1>จัดการคำทับศัพท์ (TransliterationEntry)</h1>
        <div className="head-actions">
          {/* เผื่อปุ่มไปหน้าอัปโหลด/นำเข้าภายหลัง */}
          <Link
            href="/file-manager/upload-transliteration"
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
            title="นำเข้าข้อมูล (ตัวเลือก)"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d="M12 3a1 1 0 0 1 .7.29l4 4a1 1 0 1 1-1.4 1.42L13 6.41V14a1 1 0 1 1-2 0V6.41L8.7 8.71A1 1 0 1 1 7.3 7.29l4-4A1 1 0 0 1 12 3Z"/>
              <path d="M4 13a1 1 0 0 1 1 1v5h14v-5a1 1 0 1 1 2 0v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5a1 1 0 0 1 1-1Z"/>
            </svg>
            นำเข้า
          </Link>
          <a
            href={exportHref}
            className="btn btn-primary"
            title="ส่งออกเป็น XLSX"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d="M12 3a1 1 0 0 1 1 1v9.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42L11 13.59V4a1 1 0 0 1 1-1Z"/>
              <path d="M4 19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3a1 1 0 1 0-2 0v3H6v-3a1 1 0 1 0-2 0v3Z"/>
            </svg>
            ส่งออก XLSX
          </a>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => { setDeleteErr(null); setDeleteInfo(null); setDeleteOpen(true); }}
            title="ลบคำทับศัพท์ทั้งหมด"
            aria-label="ลบคำทับศัพท์ทั้งหมด"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d="M9 3a1 1 0 0 0-1 1v1H5a1 1 0 1 0 0 2h14a1 1 0 1 0 0-2h-3V4a1 1 0 0 0-1-1H9Zm2 5a1 1 0 0 0-1 1v8a1 1 0 1 0 2 0V9a1 1 0 0 0-1-1Zm4 0a1 1 0 0 0-1 1v8a1 1 0 1 0 2 0V9a1 1 0 0 0-1-1Zm-8 0a1 1 0 0 0-1 1v8a1 1 0 1 0 2 0V9a1 1 0 0 0-1-1Z"/>
            </svg>
            ลบทั้งหมด
          </button>
        </div>
      </header>

      <section className="adm-card">
        <form className="toolbar" onSubmit={onSearch}>
          <div className="search">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M10.5 3.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5ZM2.25 10.5a8.25 8.25 0 1 1 14.59 5.28l4.69 4.69a.75.75 0 1 1-1.06 1.06l-4.69-4.69A8.25 8.25 0 0 1 2.25 10.5Z"/></svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาคำทับศัพท์ หรือภาษา/หมวดหมู่/ประเภทคำ"
            />
          </div>
          <div className="toolbar-right">
            <button className="btn btn-secondary" type="submit" title="ค้นหา">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M10.5 3.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5ZM2.25 10.5a8.25 8.25 0 1 1 14.59 5.28l4.69 4.69a.75.75 0 1 1-1.06 1.06l-4.69-4.69A8.25 8.25 0 0 1 2.25 10.5Z"/></svg>
              ค้นหา
            </button>
          </div>
        </form>

        {err && <div className="alert error">เกิดข้อผิดพลาด: {err}</div>}
        {loading ? (
          <div className="loading-row"><div className="spinner" /> กำลังโหลด…</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{width: 72}}>
                    <button type="button" className="th-sort" onClick={() => applySort('id')}>ID {sortIcon('id')}</button>
                  </th>
                  <th>
                    <button type="button" className="th-sort" onClick={() => applySort('romanization')}>คำทับศัพท์ (Romanization) {sortIcon('romanization')}</button>
                  </th>
                  <th style={{width: 140}}>
                    <button type="button" className="th-sort" onClick={() => applySort('language')}>ภาษา {sortIcon('language')}</button>
                  </th>
                  <th style={{width: 160}}>ประเภทคำ</th>
                  <th style={{width: 200}}>หมวดหมู่</th>
                  <th style={{width: 120}}>
                    <button type="button" className="th-sort" onClick={() => applySort('version')}>เวอร์ชัน {sortIcon('version')}</button>
                  </th>
                  <th style={{width: 200}}>
                    <button type="button" className="th-sort" onClick={() => applySort('updatedAt')}>อัปเดตล่าสุด {sortIcon('updatedAt')}</button>
                  </th>
                  <th style={{width: 120}}></th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && (
                  <tr><td colSpan={8} style={{textAlign:'center', color:'#777'}}>ไม่พบข้อมูล</td></tr>
                )}
                {list.map((it) => (
                  <tr key={it.id}>
                    <td>#{it.id}</td>
                    <td>
                      <div style={{fontWeight: 700}}>{it.romanization}</div>
                      {(it.transliteration1 || it.transliteration2) && (
                        <div style={{color:'#6b7280', fontSize:'.9rem'}}>
                          {it.transliteration1 || ''}{it.transliteration1 && it.transliteration2 ? ' • ' : ''}{it.transliteration2 || ''}
                        </div>
                      )}
                      {(it.originalScript1 || it.originalScript2) && (
                        <div style={{color:'#6b7280', fontSize:'.9rem'}}>
                          {it.originalScript1 || ''}{it.originalScript1 && it.originalScript2 ? ' • ' : ''}{it.originalScript2 || ''}
                        </div>
                      )}
                    </td>
                    <td>{it.language || '-'}</td>
                    <td>{it.wordType || '-'}</td>
                    <td>{it.category || '-'}</td>
                    <td>{it.version ?? 1}</td>
                    <td>{new Date(it.updatedAt ?? it.createdAt ?? Date.now()).toLocaleString('th-TH')}</td>
                    <td className="row-actions">
                      {/* ปุ่มไปหน้า public/preview ถ้ามี */}
                      <Link
                        href={`/search-transliteration?q=${encodeURIComponent(it.romanization)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-ghost"
                        title="ดูตัวอย่าง"
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                          <path d="M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-8a3 3 0 1 0 .001 6.001A3 3 0 0 0 12 9Z"/>
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="pager" role="toolbar" aria-label="เปลี่ยนหน้า">
            <div className="pager-left">
              <button
                className="icon-btn"
                disabled={pagination.page <= 1}
                onClick={() => { setPage(1); fetchData(1, pageSize, q, sortBy, sortDir); }}
                title="หน้าแรก"
                aria-label="หน้าแรก"
              >
                «
              </button>
              <button
                className="icon-btn"
                disabled={pagination.page <= 1}
                onClick={() => { const p = Math.max(1, pagination.page - 1); setPage(p); fetchData(p, pageSize, q, sortBy, sortDir); }}
                title="ก่อนหน้า"
                aria-label="ก่อนหน้า"
              >
                ‹
              </button>
            </div>

            <div className="pager-mid" aria-label="เลือกหน้า">
              {pageNumbers.map((p, i) => p === '…'
                ? <span key={i} className="ellipsis">…</span>
                : <button
                    key={i}
                    className={`page-num ${p === pagination.page ? 'active' : ''}`}
                    onClick={() => { setPage(p as number); fetchData(p as number, pageSize, q, sortBy, sortDir); }}
                    aria-current={p === pagination.page ? 'page' : undefined}
                  >{p}</button>
              )}
            </div>

            <div className="pager-right">
              <span className="pager-info">หน้า {pagination.page}/{pagination.totalPages} • รวม {pagination.total} รายการ</span>
              <label htmlFor="pageSize" className="sr-only">ต่อหน้า</label>
              <select
                id="pageSize"
                value={pageSize}
                onChange={(e) => { const s = parseInt(e.target.value, 10); setPageSize(s); fetchData(1, s, q, sortBy, sortDir); }}
                title="ต่อหน้า"
                aria-label="จำนวนต่อหน้า"
              >
                <option value={10}>10/หน้า</option>
                <option value={20}>20/หน้า</option>
                <option value={50}>50/หน้า</option>
              </select>
              <button
                className="icon-btn"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => { const p = Math.min(pagination.totalPages, pagination.page + 1); setPage(p); fetchData(p, pageSize, q, sortBy, sortDir); }}
                title="ถัดไป"
                aria-label="ถัดไป"
              >
                ›
              </button>
              <button
                className="icon-btn"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => { const p = pagination.totalPages; setPage(p); fetchData(p, pageSize, q, sortBy, sortDir); }}
                title="หน้าสุดท้าย"
                aria-label="หน้าสุดท้าย"
              >
                »
              </button>
            </div>
          </div>
        )}
      {/* Delete-all modal */}
      {deleteOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="delTitle">
          <div className="modal">
            <div className="modal-head">
              <h4 id="delTitle">ยืนยันการลบคำทับศัพท์ทั้งหมด</h4>
              <button className="icon-btn" aria-label="ปิด" onClick={() => setDeleteOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{marginTop: 0}}>
                การลบนี้จะลบ <strong>คำทับศัพท์</strong> ทั้งหมดออกจากระบบ ไม่สามารถกู้คืนได้ คุณแน่ใจหรือไม่?
              </p>
              {deleteErr && <div className="alert error">ผิดพลาด: {deleteErr}</div>}
              {deleteInfo && <div className="alert" style={{background:'#ecfeff', border:'1px solid #a5f3fc', color:'#0e7490'}}> {deleteInfo} </div>}
              <div className="modal-actions">
                <button className="btn" type="button" onClick={() => setDeleteOpen(false)} disabled={deletingAll}>ยกเลิก</button>
                <button className="btn btn-danger" type="button" onClick={deleteAllTransliterations} disabled={deletingAll}>
                  {deletingAll ? 'กำลังลบ…' : 'ยืนยันลบทั้งหมด'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </section>

      <style jsx>{`
        .adm-wrap{padding:24px; max-width:1400px; margin:0 auto;}
        .adm-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;}
        .adm-head h1{font-weight:800; font-size:1.35rem; margin:0;}
        .head-actions{display:flex; gap:8px;}

        .adm-card{background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:16px;}
        .toolbar{display:flex; gap:12px; align-items:center; justify-content:space-between; margin-bottom:12px;}
        .search{display:flex; align-items:center; gap:8px; background:#fff; border:1px solid #e5e7eb; border-radius:999px; padding:6px 10px; width:min(520px, 100%);}
        .search input{border:none; outline:none; width:100%;}
        .toolbar-right{display:flex; gap:8px;}

        .table-wrap{overflow:auto;}
        .tbl{width:100%; border-collapse:collapse;}
        .tbl th, .tbl td{border-bottom:1px solid #eee; padding:10px; vertical-align:top;}
        .tbl thead th{background:#f9fafb; text-align:left; font-weight:700; font-size:.92rem;}
        .row-actions{display:flex; gap:6px; justify-content:flex-end;}

        .th-sort{display:inline-flex; align-items:center; gap:6px; background:transparent; border:0; font-weight:700; cursor:pointer; color:#111827;}
        .sort-caret{opacity:.4;}
        .sort-caret.active{opacity:1;}

        .btn{display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer;}
        .btn:hover{background:#f8fafc;}
        .btn-primary{background:#0c57d2; color:#fff; border-color:#0c57d2;}
        .btn-primary svg{fill:#fff;}
        .btn-secondary{background:#111827; color:#fff; border-color:#111827;}
        .btn-ghost{background:transparent; border-color:transparent; color:#374151;}
        .btn-danger{background:#dc2626; color:#fff; border-color:#dc2626;}
        .btn-danger svg{fill:#fff;}
        .icon-btn{height:36px; width:36px; display:inline-flex; align-items:center; justify-content:center; border:1px solid #e5e7eb; border-radius:8px; background:#fff; cursor:pointer;}
        .icon-btn:disabled{opacity:.5; cursor:not-allowed;}

        .alert.error{background:#fef2f2; color:#991b1b; border:1px solid #fecaca; padding:10px; border-radius:8px; margin:10px 0;}

        .modal-overlay{position:fixed; inset:0; background:rgba(15,23,42,.45); display:flex; align-items:center; justify-content:center; padding:16px; z-index:60;}
        .modal{width:min(640px,96vw); background:#fff; border:1px solid #e5e7eb; border-radius:12px; box-shadow:0 20px 60px rgba(0,0,0,.22);}
        .modal-head{display:flex; align-items:center; justify-content:space-between; gap:8px; padding:12px 14px; border-bottom:1px solid #e5e7eb;}
        .modal-head h4{margin:0; font-weight:800; color:#111827;}
        .modal-body{padding:14px;}
        .modal-actions{display:flex; justify-content:flex-end; gap:8px; margin-top:12px;}

        .loading-row{display:flex; align-items:center; gap:8px; padding:12px; color:#374151;}
        .spinner{width:16px; height:16px; border-radius:999px; border:2px solid #cbd5e1; border-top-color:#111827; animation:spin 1s linear infinite;}
        @keyframes spin{to{transform:rotate(360deg)}}

        .pager{position:sticky; bottom:0; left:0; right:0; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 12px; margin-top:10px; border-top:1px solid #eee; background:#fff; box-shadow: 0 -6px 16px rgba(15,23,42,.04); z-index: 5;}
        .pager-left,.pager-right{display:flex; align-items:center; gap:6px;}
        .pager-mid{display:flex; align-items:center; gap:4px; flex-wrap:wrap; justify-content:center;}
        .page-num{min-width:36px; height:36px; border:1px solid #e5e7eb; border-radius:8px; background:#fff; cursor:pointer;}
        .page-num.active{background:#0c57d2; border-color:#0c57d2; color:#fff;}
        .ellipsis{padding:0 6px; color:#6b7280;}

        .pager-info{color:#6b7280; font-size:.9rem; margin-right:8px;}
        .sr-only{position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0;}
      `}</style>
    </div>
  );
}