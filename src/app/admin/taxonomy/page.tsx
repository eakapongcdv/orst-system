'use client';

import { useEffect, useMemo, useRef, useState, Fragment } from 'react';

const DOMAIN_OPTIONS = ['Bacteria', 'Archaea', 'Eukarya'];
const KINGDOM_OPTIONS = ['Animalia', 'Plantae', 'Fungi', 'Protista', 'Monera'];

type Taxonomy = {
  id: number;
  title: string;
  domain: string;
  kingdom: string;
  createdAt?: string;
  updatedAt?: string;
  _entryCount?: number; // NEW: count of TaxonEntry
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type SortBy = 'id' | 'title' | 'domain' | 'kingdom' | 'updatedAt' | 'entryCount';
type SortDir = 'asc' | 'desc';

export default function AdminTaxonomyPage() {
  const [q, setQ] = useState('');
  const [list, setList] = useState<Taxonomy[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState<Pagination | null>(null);

  const [sortBy, setSortBy] = useState<SortBy>('id');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Taxonomy | null>(null);
  const [form, setForm] = useState<{ title: string; domain: string; kingdom: string }>({ title: '', domain: '', kingdom: '' });
  const submitBtnRef = useRef<HTMLButtonElement | null>(null);

  const fetchData = async (_page = page, _pageSize = pageSize, _q = q, _sortBy = sortBy, _sortDir = sortDir) => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(_page));
      params.set('pageSize', String(_pageSize));
      params.set('sortBy', String(_sortBy));
      params.set('sortDir', String(_sortDir));
      if (_q.trim()) params.set('q', _q.trim());
      const r = await fetch(`/api/admin/taxonomy?${params.toString()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const items: Taxonomy[] = j.items || [];
      setList(items);
      setPagination(j.pagination || null);
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

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', domain: DOMAIN_OPTIONS[2], kingdom: KINGDOM_OPTIONS[1] });
    setModalOpen(true);
  };

  const openEdit = (row: Taxonomy) => {
    setEditing(row);
    setForm({ title: row.title, domain: row.domain, kingdom: (row as any).kingdom || '' });
    setModalOpen(true);
  };

  const onSave = async () => {
    try {
      submitBtnRef.current?.setAttribute('disabled', 'true');
      const payload = { title: form.title?.trim(), domain: form.domain?.trim(), kingdom: form.kingdom?.trim() };
      if (!payload.title) throw new Error('กรุณาระบุชื่อชุดอนุกรมวิธาน');
      if (!payload.domain) throw new Error('กรุณาเลือกโดเมน');
      if (!payload.kingdom) throw new Error('กรุณาเลือกอาณาจักร');

      let r: Response;
      if (editing) {
        r = await fetch(`/api/admin/taxonomy/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        r = await fetch('/api/admin/taxonomy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setModalOpen(false);
      await fetchData(page, pageSize, q, sortBy, sortDir);
    } catch (e: any) {
      alert(e?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      submitBtnRef.current?.removeAttribute('disabled');
    }
  };

  const onDelete = async (row: Taxonomy) => {
    if (!confirm(`ลบ "${row.title}"?`)) return;
    try {
      const r = await fetch(`/api/admin/taxonomy/${row.id}`, { method: 'DELETE' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      await fetchData(page, pageSize, q, sortBy, sortDir);
    } catch (e: any) {
      alert(e?.message || 'ลบไม่สำเร็จ (อาจมีข้อมูลที่เกี่ยวข้องอยู่)');
    }
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

  // Group: level 1 by domain, level 2 by kingdom (preserve order within inners)
  type DomainGroup = { domain: string; groups: Array<{ kingdom: string; items: Taxonomy[] }> };
  const grouped = useMemo<DomainGroup[]>(() => {
    const out: Record<string, Record<string, Taxonomy[]>> = {};
    for (const it of list) {
      const d = it.domain || 'ไม่ระบุโดเมน';
      const k = it.kingdom || 'ไม่ระบุ Kingdom';
      if (!out[d]) out[d] = {};
      if (!out[d][k]) out[d][k] = [];
      out[d][k].push(it);
    }
    const domains = Object.keys(out).sort((a, b) => a.localeCompare(b, 'th'));
    return domains.map((domain) => {
      const kingdoms = Object.keys(out[domain]).sort((a, b) => a.localeCompare(b, 'th'));
      return { domain, groups: kingdoms.map((kingdom) => ({ kingdom, items: out[domain][kingdom] })) };
    });
  }, [list]);

  // Sorting handler
  const applySort = (col: SortBy) => {
    let dir: SortDir = 'asc';
    if (sortBy === col) {
      dir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      dir = (col === 'updatedAt' || col === 'entryCount') ? 'desc' : 'asc';
    }
    setSortBy(col);
    setSortDir(dir);
    fetchData(1, pageSize, q, col, dir);
  };

  const sortIcon = (col: SortBy) => {
    if (sortBy !== col) return <span className="sort-caret">↕</span>;
    return <span className="sort-caret active">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="adm-wrap">
      <header className="adm-head">
        <h1>จัดการอนุกรมวิธาน (Taxonomy)</h1>
        <div className="head-actions">
          <button className="btn btn-primary" onClick={openCreate} title="เพิ่ม">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M11 5a1 1 0 1 1 2 0v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V5Z"/></svg>
            เพิ่ม
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
              placeholder="ค้นหาชื่อ / Domain / Kingdom"
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
                    <button type="button" className="th-sort" onClick={() => applySort('title')}>ชื่ออนุกรมวิธาน {sortIcon('title')}</button>
                  </th>
                  <th style={{width: 200}}>
                    <button type="button" className="th-sort" onClick={() => applySort('kingdom')}>อาณาจักร {sortIcon('kingdom')}</button>
                  </th>
                  <th style={{width: 120}}>
                    <button type="button" className="th-sort" onClick={() => applySort('entryCount')}>จำนวนข้อมูล {sortIcon('entryCount')}</button>
                  </th>
                  <th style={{width: 200}}>
                    <button type="button" className="th-sort" onClick={() => applySort('updatedAt')}>อัปเดตล่าสุด {sortIcon('updatedAt')}</button>
                  </th>
                  <th style={{width: 160}}></th>
                </tr>
              </thead>
              <tbody>
                {grouped.length === 0 && (
                  <tr><td colSpan={7} style={{textAlign:'center', color:'#777'}}>ไม่พบข้อมูล</td></tr>
                )}
                {grouped.map((dg) => (
                  <Fragment key={`domain-${dg.domain}`}>
                    <tr className="domain-row">
                      <td colSpan={7}>
                        <div className="group-tab group-tab--domain">
                          <span className="group-tab__label">โดเมน</span>
                          <span className="group-tab__text">{dg.domain}</span>
                        </div>
                      </td>
                    </tr>
                    {dg.groups.map((kg) => (
                      <Fragment key={`kg-${dg.domain}::${kg.kingdom}`}>
                        <tr className="kingdom-row">
                          <td colSpan={7}>
                            <div className="group-tab group-tab--kingdom">
                              <span className="group-tab__label">อาณาจักร</span>
                              <span className="group-tab__text">{kg.kingdom}</span>
                            </div>
                          </td>
                        </tr>
                        {kg.items.map((it) => (
                          <tr key={it.id}>
                            <td>#{it.id}</td>
                            <td>{it.title}</td>
                            <td>{it.kingdom}</td>
                            <td>{it._entryCount ?? 0}</td>
                            <td>{new Date(it.updatedAt ?? it.createdAt ?? Date.now()).toLocaleString('th-TH')}</td>
                            <td className="row-actions">
                              <button className="btn btn-ghost" title="แก้ไข" onClick={() => openEdit(it)}>
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M5 18.25V21h2.75l8.1-8.1-2.75-2.75L5 18.25Zm13.71-10.21a1.003 1.003 0 0 0 0-1.42l-1.33-1.33a1.003 1.003 0 0 0-1.42 0l-1.12 1.12 2.75 2.75 1.12-1.12Z"/></svg>
                              </button>
                              <button className="btn btn-ghost danger" title="ลบ" onClick={() => onDelete(it)}>
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M9 3a1 1 0 0 0-1 1v1H4a1 1 0 1 0 0 2h.8l.86 12.09A2 2 0 0 0 7.65 21h8.7a2 2 0 0 0 1.99-1.91L19.2 7H20a1 1 0 1 0 0-2h-4V4a1 1 0 0 0-1-1H9Zm2 3h2v-.5h-2V6Z"/></svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Toolbar-style pagination bottom */}
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
      </section>

      {/* Modal */}
      {modalOpen && (
        <>
          <div className="overlay" onClick={() => setModalOpen(false)} />
          <div className="modal">
            <div className="modal-head">
              <h3>{editing ? 'แก้ไขอนุกรมวิธาน' : 'เพิ่มอนุกรมวิธาน'}</h3>
              <button className="icon-btn" onClick={() => setModalOpen(false)} title="ปิด">✕</button>
            </div>
            <div className="modal-body">
              <label className="fld">
                <span>ชื่ออนุกรมวิธาน</span>
                <input
                  value={form.title}
                  onChange={(e) => setForm(v => ({ ...v, title: e.target.value }))}
                  placeholder="เช่น อนุกรมวิธานพืช"
                />
              </label>
              <label className="fld">
                <span>โดเมน (Domain)</span>
                <select
                  value={form.domain}
                  onChange={(e) => setForm(v => ({ ...v, domain: e.target.value }))}
                  aria-label="เลือกโดเมน"
                >
                  {DOMAIN_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </label>
              <label className="fld">
                <span>อาณาจักร (Kingdom)</span>
                <select
                  value={form.kingdom}
                  onChange={(e) => setForm(v => ({ ...v, kingdom: e.target.value }))}
                  aria-label="เลือก Kingdom"
                >
                  {KINGDOM_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setModalOpen(false)}>ยกเลิก</button>
              <button ref={submitBtnRef} className="btn btn-primary" onClick={onSave}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M5 12.5 9.5 17 19 7.5l-1.5-1.5-8 8-3-3-1.5 1.5Z"/></svg>
                บันทึก
              </button>
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        .adm-wrap{padding:24px; max-width:1200px; margin:0 auto;}
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
        .tbl th, .tbl td{border-bottom:1px solid #eee; padding:10px;}
        .tbl thead th{background:#f9fafb; text-align:left; font-weight:700; font-size:.92rem;}
        .row-actions{display:flex; gap:6px; justify-content:flex-end;}

        .th-sort{display:inline-flex; align-items:center; gap:6px; background:transparent; border:0; font-weight:700; cursor:pointer; color:#111827;}
        .sort-caret{opacity:.4;}
        .sort-caret.active{opacity:1;}

        .domain-row td,
        .kingdom-row td{
          background:transparent;
          border-bottom:none;
          padding:8px 10px;
        }

        .btn{display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer;}
        .btn:hover{background:#f8fafc;}
        .btn-primary{background:#0c57d2; color:#fff; border-color:#0c57d2;}
        .btn-primary svg{fill:#fff;}
        .btn-secondary{background:#111827; color:#fff; border-color:#111827;}
        .btn-ghost{background:transparent; border-color:transparent; color:#374151;}
        .btn-ghost.danger{color:#b91c1c;}
        .icon-btn{height:36px; width:36px; display:inline-flex; align-items:center; justify-content:center; border:1px solid #e5e7eb; border-radius:8px; background:#fff; cursor:pointer;}
        .icon-btn:disabled{opacity:.5; cursor:not-allowed;}

        .alert.error{background:#fef2f2; color:#991b1b; border:1px solid #fecaca; padding:10px; border-radius:8px; margin:10px 0;}

        .pager{position:sticky; bottom:0; left:0; right:0; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 12px; margin-top:10px; border-top:1px solid #eee; background:#fff; box-shadow: 0 -6px 16px rgba(15,23,42,.04); z-index: 5;}
        .pager-left,.pager-right{display:flex; align-items:center; gap:6px;}
        .pager-mid{display:flex; align-items:center; gap:4px; flex-wrap:wrap; justify-content:center;}
        .page-num{min-width:36px; height:36px; border:1px solid #e5e7eb; border-radius:8px; background:#fff; cursor:pointer;}
        .page-num.active{background:#0c57d2; border-color:#0c57d2; color:#fff;}
        .ellipsis{padding:0 6px; color:#6b7280;}

        .pager-info{color:#6b7280; font-size:.9rem; margin-right:8px;}
        .sr-only{position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0;}

        .overlay{position:fixed; inset:0; background:rgba(15,23,42,.35); backdrop-filter: blur(2px); z-index:30;}
        .modal{
          position:fixed;
          top:50%;
          left:50%;
          transform:translate(-50%, -50%);
          width:min(560px, 92vw);
          max-height:85vh;
          background:#fff;
          border:1px solid #e5e7eb;
          border-radius:14px;
          padding:0;
          z-index:40;
          box-shadow:0 12px 40px rgba(15,23,42,.15);
          display:flex;
          flex-direction:column;
        }
        .modal-head{
          display:flex; align-items:center; justify-content:space-between;
          padding:12px 16px; border-bottom:1px solid #e5e7eb;
        }
        .modal-head h3{margin:0; font-weight:800;}
        .modal-body{
          padding:16px; display:grid; gap:12px;
          overflow:auto; flex:1;
        }
        .fld{display:grid; gap:6px;}
        .fld input{border:1px solid #e5e7eb; border-radius:10px; padding:10px;}
        .fld select{border:1px solid #e5e7eb; border-radius:10px; padding:10px; background:#fff;}
        .modal-foot{
          display:flex; justify-content:flex-end; gap:8px;
          padding:12px 16px; border-top:1px solid #e5e7eb;
        }

        .group-tab{
          display:flex; align-items:center; gap:10px;
          padding:10px 12px;
          border-radius:12px;
          border:1px solid #e5e7eb;
        }
        .group-tab__label{
          font-weight:800;
          border-radius:999px;
          padding:6px 10px;
          line-height:1;
          color:#fff;
        }
        .group-tab__text{
          font-weight:700; color:#111827;
        }
        .group-tab--domain{
          background:#F4F7FF;
          border-left:4px solid #0c57d2;
        }
        .group-tab--domain .group-tab__label{
          background:#0c57d2;
        }
        .group-tab--kingdom{
          background:#F2FEF6;
          border-left:4px solid #16a34a;
        }
        .group-tab--kingdom .group-tab__label{
          background:#16a34a;
        }
      `}</style>
    </div>
  );
}