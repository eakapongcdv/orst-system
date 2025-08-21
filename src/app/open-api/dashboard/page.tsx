'use client';
import { useEffect, useMemo, useState } from 'react';

// Robust JSON reader to avoid "Unexpected end of JSON input"
async function parseJSONSafe(r: Response): Promise<any> {
  const contentType = r.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try { return await r.json(); } catch { /* fall through */ }
  }
  const text = await r.text().catch(()=>''); // may be empty on 204/500
  try { return JSON.parse(text); } catch { return { ok: r.ok, status: r.status, text }; }
}

type KeyRow = {
  id: number;
  label: string;
  keyPrefix: string;
  maskedKey: string;
  scopes: string[];
  allowedOrigins: string[];
  createdAt: string;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  isActive: boolean;
};

export default function OpenApiDashboard() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<{label: string; scopes: string[]; allowedOrigins: string; expiresAt: string}>({
    label: '', scopes: [], allowedOrigins: '', expiresAt: ''
  });
  const [plainCreated, setPlainCreated] = useState<string | null>(null);
  const [test, setTest] = useState<{endpoint: string; method: string; query: string; body: string; apiKey: string; result?: string}>({
    endpoint: '/api/open-api/ping', method: 'GET', query: '', body: '', apiKey: ''
  });

  const scopeOptions = ['read:dictionary', 'read:transliteration', 'write:transliteration'];

  // --- Swagger-like documentation data ---
  type Param = { name: string; in: 'query' | 'path' | 'header' | 'body'; type: string; required?: boolean; description?: string; example?: any; };
  type Resp = { status: number | string; description: string; example?: any };
  type Doc = {
    tag: string;
    method: 'GET'|'POST'|'PUT'|'DELETE'|'PATCH';
    path: string;
    summary: string;
    description?: string;
    params?: Param[];
    responses?: Resp[];
    example?: { query?: string; body?: any; apiKey?: string; method?: 'GET'|'POST'|'PUT'|'DELETE'|'PATCH' };
  };

  const [openDocs, setOpenDocs] = useState<Record<string, boolean>>({});
  const toggleDoc = (k: string) => setOpenDocs(v => ({ ...v, [k]: !v[k] }));

  const docs: Doc[] = [
    {
      tag: 'Utility',
      method: 'GET',
      path: '/api/open-api/ping',
      summary: 'ทดสอบการเชื่อมต่อระบบ',
      description: 'คืนค่า ok:true พร้อมเวลาปัจจุบัน ใช้ตรวจสอบ API Key และ CORS',
      params: [],
      responses: [
        { status: 200, description: 'สำเร็จ', example: { ok: true, time: '2025-08-18T10:00:00Z' } }
      ],
      example: { method: 'GET' }
    },
    {
      tag: 'Dictionary',
      method: 'GET',
      path: '/api/search-dictionary',
      summary: 'ค้นหารายการคำศัพท์ในพจนานุกรมเฉพาะสาขา',
      description: 'รองรับการแบ่งหน้า และระบุพจนานุกรมที่ต้องการ (specializedDictionaryId)',
      params: [
        { name: 'q', in: 'query', type: 'string', required: false, description: 'คำค้นหา (รองรับ full-text)', example: 'ทะเล' },
        { name: 'page', in: 'query', type: 'number', required: false, description: 'หน้า (เริ่มที่ 1)', example: 1 },
        { name: 'pageSize', in: 'query', type: 'number', required: false, description: 'จำนวนต่อหน้า', example: 10 },
        { name: 'specializedDictionaryId', in: 'query', type: 'number', required: false, description: 'ระบุเลขเล่ม (เช่น 0 = ฉบับราชบัณฑิตยสภา, 3 = เคมี เป็นต้น)', example: 0 }
      ],
      responses: [
        { status: 200, description: 'รายการผลลัพธ์', example: { results: [{ id: 123, term_th: 'ทะเล', specializedDictionaryId: 0 }], pagination: { currentPage: 1, totalPages: 5, total: 42 } } }
      ],
      example: { method: 'GET', query: 'q=ทะเล&page=1&pageSize=10&specializedDictionaryId=0' }
    },
    {
      tag: 'Transliteration',
      method: 'GET',
      path: '/api/search-transliteration',
      summary: 'ค้นหาคำทับศัพท์',
      description: 'ค้นหาโดยคำหลักและ/หรือกรองตามภาษา',
      params: [
        { name: 'q', in: 'query', type: 'string', required: false, description: 'คำค้นหา', example: 'ice' },
        { name: 'language', in: 'query', type: 'string', required: false, description: 'ภาษาที่ต้องการ เช่น ญี่ปุ่น, ฝรั่งเศส, พม่า, อังกฤษ', example: 'ญี่ปุ่น' },
        { name: 'page', in: 'query', type: 'number', required: false, description: 'หน้า (เริ่มที่ 1)', example: 1 },
        { name: 'pageSize', in: 'query', type: 'number', required: false, description: 'จำนวนต่อหน้า', example: 10 }
      ],
      responses: [
        { status: 200, description: 'ผลการค้นหา', example: { results: [{ id: 110, romanization: 'tej', transliteration1: 'เตช' }], pagination: { currentPage: 1, totalPages: 1, total: 1 } } }
      ],
      example: { method: 'GET', query: 'q=ice&page=1&pageSize=10' }
    }
  ];

  const methodColor = (m: string) => {
    switch (m) {
      case 'GET': return 'method-GET';
      case 'POST': return 'method-POST';
      case 'PUT': return 'method-PUT';
      case 'DELETE': return 'method-DELETE';
      case 'PATCH': return 'method-PATCH';
      default: return 'method-GET';
    }
  };

  const loadIntoTester = (d: Doc) => {
    setTest(v => ({
      ...v,
      endpoint: d.path,
      method: d.example?.method || d.method,
      query: d.example?.query ? d.example.query.replace(/&amp;/g, '&') : '',
      body: d.example?.body ? JSON.stringify(d.example.body, null, 2) : '',
      apiKey: d.example?.apiKey || v.apiKey
    }));
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/open-api/keys', { cache: 'no-store' });
      const j = await parseJSONSafe(r);
      if (!r.ok) {
        console.warn('Load keys failed', j);
        setKeys([]);
      } else {
        setKeys(j.keys || []);
      }
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const createKey = async () => {
    setCreating(true);
    try {
      const payload = {
        label: newKey.label.trim(),
        scopes: newKey.scopes,
        allowedOrigins: newKey.allowedOrigins
          .split(',')
          .map(v => v.trim())
          .filter(Boolean),
        expiresAt: newKey.expiresAt || null
      };
      const r = await fetch('/api/open-api/keys', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const j = await parseJSONSafe(r);
      if (r.ok && j?.ok) {
        setPlainCreated(j.key?.plain);
        setNewKey({ label: '', scopes: [], allowedOrigins: '', expiresAt: '' });
        await load();
      } else {
        const msg = j?.error || j?.text || `สร้างคีย์ไม่สำเร็จ (HTTP ${r.status})`;
        alert(msg);
      }
    } finally { setCreating(false); }
  };

  const toggleActive = async (row: KeyRow) => {
    const r = await fetch(`/api/open-api/keys/${row.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ isActive: !row.isActive }) });
    const j = await parseJSONSafe(r);
    if (!r.ok || !j?.ok) alert(j?.error || j?.text || 'อัปเดตไม่สำเร็จ');
    await load();
  };

  const revoke = async (row: KeyRow) => {
    if (!confirm(`เพิกถอนคีย์ "${row.label}" ?`)) return;
    const r = await fetch(`/api/open-api/keys/${row.id}`, { method: 'DELETE' });
    const j = await parseJSONSafe(r);
    if (!r.ok || !j?.ok) alert(j?.error || j?.text || 'เพิกถอนไม่สำเร็จ');
    await load();
  };

  const runTest = async () => {
    const url = test.query ? `${test.endpoint}?${test.query}` : test.endpoint;
    const init: RequestInit = {
      method: test.method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': test.apiKey || ''
      }
    };
    if (test.body && test.method !== 'GET') {
      init.body = test.body;
    }

    let display = '';
    try {
      const r = await fetch(url, init);
      const ct = r.headers.get('content-type') || '';
      const data = await parseJSONSafe(r);

      let prettyBody: string;
      if (typeof data === 'string') {
        // Try to parse string as JSON; if fails, keep as plain text
        try {
          prettyBody = JSON.stringify(JSON.parse(data), null, 2);
        } catch {
          prettyBody = data;
        }
      } else {
        prettyBody = JSON.stringify(data, null, 2);
      }

      display = `HTTP ${r.status}${r.statusText ? ' ' + r.statusText : ''}\nContent-Type: ${ct}\n\n${prettyBody}`;
    } catch (e: any) {
      display = `Request failed: ${e?.message || String(e)}`;
    }

    setTest(prev => ({ ...prev, result: display }));
  };

  return (
    <main className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Open API Dashboard</h1>
      <p className="text-gray-600 mb-6">สร้าง/จัดการ API Key • ทดลองเรียก REST API • ดาวน์โหลด Postman collection</p>

      {/* Key Manager */}
      <section className="bg-white border rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold">API Keys</h2>
          <div className="flex items-center gap-2">
            <button className="btn-secondary btn--icon" onClick={load} title="รีเฟรชรายการคีย์" aria-label="รีเฟรชรายการคีย์">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                <path d="M4.5 12a7.5 7.5 0 0 1 12.6-5.3l1.7-1.7a.75.75 0 0 1 1.28.53V9.75a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1-.53-1.28l1.34-1.34A6 6 0 1 0 6 12H4.5z"></path>
              </svg>
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-5">
          <div>
            <label className="font-semibold">Label</label>
            <input className="input w-full" value={newKey.label} onChange={e=>setNewKey(v=>({...v, label:e.target.value}))} placeholder="เช่น External Partner A" />
          </div>
          <div>
            <label className="font-semibold">Expires At (ISO)</label>
            <input className="input w-full" value={newKey.expiresAt} onChange={e=>setNewKey(v=>({...v, expiresAt:e.target.value}))} placeholder="เช่น 2025-12-31T23:59:00Z" />
          </div>
          <div className="md:col-span-2">
            <label className="font-semibold">Scopes</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {scopeOptions.map(sc => (
                <label key={sc} className="inline-flex items-center gap-2 border rounded-md px-2 py-1">
                  <input
                    type="checkbox"
                    checked={newKey.scopes.includes(sc)}
                    onChange={(e) => {
                      setNewKey(v=>{
                        const next = new Set(v.scopes);
                        e.target.checked ? next.add(sc) : next.delete(sc);
                        return {...v, scopes: Array.from(next)};
                      });
                    }}
                  />
                  <span>{sc}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="font-semibold">Allowed Origins (comma separated)</label>
            <input className="input w-full" placeholder="https://partner.example.com, https://app.gov.th" value={newKey.allowedOrigins} onChange={e=>setNewKey(v=>({...v, allowedOrigins: e.target.value}))} />
          </div>
        </div>

        <button className="btn-primary" disabled={creating || !newKey.label.trim()} onClick={createKey}>
          <svg className="btn-ico" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 4a1 1 0 0 1 1 1v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V5a1 1 0 0 1 1-1z"/></svg>
          {creating ? 'กำลังสร้าง…' : 'สร้าง API Key'}
        </button>

        {plainCreated && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
            <div className="font-semibold mb-1">คัดลอกและเก็บรักษา API Key นี้ไว้ (แสดงครั้งเดียว):</div>
            <code className="break-all">{plainCreated}</code>
            <div className="mt-2">
              <button className="btn-secondary" onClick={()=>{ navigator.clipboard.writeText(plainCreated); }}>
                <svg className="btn-ico" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M16 1H6a2 2 0 0 0-2 2v12h2V3h10V1zm3 4H9a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H9V7h10v14z"/></svg>
                คัดลอก
              </button>
              <button className="btn-ghost ml-2" onClick={()=>setPlainCreated(null)}>
                <svg className="btn-ico" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 4.5a7.5 7.5 0 1 0 7.5 7.5A7.51 7.51 0 0 0 12 4.5zm0 13a5.5 5.5 0 1 1 5.5-5.5A5.51 5.51 0 0 1 12 17.5zm5.3-11.8a1 1 0 0 1 1.4 1.4l-13 13a1 1 0 0 1-1.4-1.4z"/></svg>
                ซ่อน
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-3">Label</th>
              <th className="py-2 pr-3">Key</th>
              <th className="py-2 pr-3">Scopes</th>
              <th className="py-2 pr-3">Expires</th>
              <th className="py-2 pr-3">Active</th>
              <th className="py-2 pr-3">Action</th>
            </tr>
            </thead>
            <tbody>
            {loading ? (
              <tr><td className="py-3" colSpan={6}>กำลังโหลด…</td></tr>
            ) : keys.length === 0 ? (
              <tr><td className="py-3" colSpan={6}>ยังไม่มีคีย์</td></tr>
            ) : keys.map(k => (
              <tr key={k.id} className="border-b">
                <td className="py-2 pr-3">{k.label}</td>
                <td className="py-2 pr-3 font-mono">{k.maskedKey}</td>
                <td className="py-2 pr-3">{k.scopes.join(', ') || '-'}</td>
                <td className="py-2 pr-3">{k.expiresAt ? new Date(k.expiresAt).toISOString() : '-'}</td>
                <td className="py-2 pr-3">
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={k.isActive} onChange={()=>toggleActive(k)} />
                    <span>{k.isActive ? 'on' : 'off'}</span>
                  </label>
                </td>
                <td className="py-2 pr-3">
                  <button className="btn-danger btn--sm" onClick={()=>revoke(k)} title="เพิกถอน">
                    <svg className="btn-ico" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M9 3a1 1 0 0 0-1 1v1H4a1 1 0 1 0 0 2h1v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7h1a1 1 0 1 0 0-2h-4V4a1 1 0 0 0-1-1H9zm2 4h2v10h-2V7zm-4 0h2v10H7V7zm10 0h-2v10h2V7z"/></svg>
                    เพิกถอน
                  </button>
                </td>
              </tr>
            ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Swagger-like Documentation */}
      <section className="bg-white border rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-bold">API Documentation</h2>
          <div className="flex items-center gap-2">
            <button
              className="btn-secondary"
              onClick={() => {
                const all: Record<string, boolean> = {};
                docs.forEach(d => { all[`${d.method} ${d.path}`] = true; });
                setOpenDocs(all);
              }}
            >
              <svg className="btn-ico" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 5l6 6H6l6-6zm0 14l-6-6h12l-6 6z"/></svg>
              Expand all
            </button>
            <button
              className="btn-secondary"
              onClick={() => setOpenDocs({})}
            >
              <svg className="btn-ico" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M6 9l6 6 6-6H6z"/></svg>
              Collapse all
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {docs.map(doc => {
            const key = `${doc.method} ${doc.path}`;
            const isOpen = !!openDocs[key];
            return (
              <div key={key} className="doc-card">
                <div className="doc-head" onClick={() => toggleDoc(key)} role="button" tabIndex={0}>
                  <span className={`method-badge ${methodColor(doc.method)}`}>{doc.method}</span>
                  <code className="route-path">{doc.path}</code>
                  <span className="doc-summary">{doc.summary}</span>
                  <svg className={`chev ${isOpen ? 'open' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08z" clipRule="evenodd"/>
                  </svg>
                </div>

                {isOpen && (
                  <div className="doc-body">
                    {doc.description && <p className="doc-desc">{doc.description}</p>}

                    {doc.params && doc.params.length > 0 && (
                      <>
                        <h3 className="doc-subtitle">Parameters</h3>
                        <table className="param-table">
                          <thead><tr><th>Name</th><th>In</th><th>Type</th><th>Required</th><th>Description</th><th>Example</th></tr></thead>
                          <tbody>
                          {doc.params.map(p => (
                            <tr key={p.name}>
                              <td><code>{p.name}</code></td>
                              <td>{p.in}</td>
                              <td>{p.type}</td>
                              <td>{p.required ? 'yes' : 'no'}</td>
                              <td>{p.description || '-'}</td>
                              <td>{typeof p.example === 'object' ? <code>{JSON.stringify(p.example)}</code> : String(p.example ?? '')}</td>
                            </tr>
                          ))}
                          </tbody>
                        </table>
                      </>
                    )}

                    {doc.responses && doc.responses.length > 0 && (
                      <>
                        <h3 className="doc-subtitle">Responses</h3>
                        <table className="param-table">
                          <thead><tr><th>Status</th><th>Description</th><th>Example</th></tr></thead>
                          <tbody>
                          {doc.responses.map((r, idx) => (
                            <tr key={String(r.status) + '-' + idx}>
                              <td><code>{r.status}</code></td>
                              <td>{r.description}</td>
                              <td>
                                {r.example ? (
                                  <pre className="pretty-json small">{JSON.stringify(r.example, null, 2)}</pre>
                                ) : '-'}
                              </td>
                            </tr>
                          ))}
                          </tbody>
                        </table>
                      </>
                    )}

                    {/* Examples */}
                    <div className="doc-examples">
                      <h3 className="doc-subtitle">Examples</h3>
                      <div className="example-grid">
                        <div>
                          <div className="example-title">cURL</div>
                          <pre className="pretty-json small">{`curl -X ${doc.example?.method || doc.method} "${doc.path}${doc.example?.query ? '?' + doc.example.query.replace(/&amp;/g, '&') : ''}" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: <YOUR_API_KEY>"${doc.example?.body ? ` \\
  -d '${JSON.stringify(doc.example.body)}'` : ''}`}</pre>
                        </div>
                        <div>
                          <div className="example-title">JavaScript (fetch)</div>
                          <pre className="pretty-json small">{`const r = await fetch("${doc.path}${doc.example?.query ? '?' + doc.example.query.replace(/&amp;/g, '&') : ''}", {
  method: "${doc.example?.method || doc.method}",
  headers: { "Content-Type": "application/json", "X-API-Key": "YOUR_API_KEY" }${doc.example?.body ? `,
  body: JSON.stringify(${JSON.stringify(doc.example.body, null, 2)})` : ''}
});
const data = await r.json();`}</pre>
                        </div>
                      </div>
                      <div className="mt-2">
                        <button className="btn-primary" onClick={() => loadIntoTester(doc)}>
                          <svg className="btn-ico" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7L8 5z"/></svg>
                          ทดลองเรียกด้วยค่าตัวอย่าง
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* REST Explorer / Tester */}
      <section className="bg-white border rounded-xl p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-bold">REST Explorer</h2>
          <a className="btn-secondary" href="/api/open-api/postman" download>
            <svg className="btn-ico" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 3a1 1 0 0 1 1 1v9.586l2.293-2.293a1 1 0 1 1 1.414 1.414l-4 4a1 1 0 0 1-1.414 0l-4-4A1 1 0 0 1 8.707 11.293L11 13.586V4a1 1 0 0 1 1-1zM5 19a1 1 0 0 0 1 1h12a1 1 0 1 0 0-2H6a1 1 0 0 0-1 1z"/></svg>
            ดาวน์โหลด Postman collection
          </a>
        </div>

        <div className="grid md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="font-semibold">Endpoint</label>
            <select className="select w-full" value={test.endpoint} onChange={e=>setTest(v=>({...v, endpoint:e.target.value}))}>
              <option value="/api/open-api/ping">/api/open-api/ping</option>
              <option value="/api/search-dictionary">/api/search-dictionary</option>
              <option value="/api/search-transliteration">/api/search-transliteration</option>
            </select>
          </div>
          <div>
            <label className="font-semibold">Method</label>
            <select className="select w-full" value={test.method} onChange={e=>setTest(v=>({...v, method:e.target.value}))}>
              <option>GET</option>
              <option>POST</option>
              <option>PUT</option>
              <option>DELETE</option>
              <option>PATCH</option>
            </select>
          </div>
          <div>
            <label className="font-semibold">API Key</label>
            <input className="input w-full" placeholder="sk_live_xxx" value={test.apiKey} onChange={e=>setTest(v=>({...v, apiKey:e.target.value}))} />
          </div>
          <div className="md:col-span-2">
            <label className="font-semibold">Query string</label>
            <input className="input w-full" placeholder="q=เคมี&page=1&pageSize=10" value={test.query} onChange={e=>setTest(v=>({...v, query:e.target.value}))} />
          </div>
          <div className="md:col-span-2">
            <label className="font-semibold">Body (JSON)</label>
            <textarea className="textarea w-full" rows={3} value={test.body} onChange={e=>setTest(v=>({...v, body:e.target.value}))}></textarea>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button className="btn-primary" onClick={runTest}>
            <svg className="btn-ico" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7L8 5z"/></svg>
            เรียกใช้งาน
          </button>
          <span className="text-gray-500 text-sm">จะส่งหัวข้อ <code>X-API-Key</code> ให้อัตโนมัติ</span>
        </div>

        {test.result && (
          <pre className="mt-3 p-3 bg-slate-50 border rounded overflow-auto max-h-96 text-xs pretty-json">{test.result}</pre>
        )}
      </section>

      <style jsx global>{`
        .input, .textarea, .select {
          border:1px solid #e5e7eb;
          border-radius:12px;
          padding:.55rem .85rem;
          background:#fff;
          transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
        }
        .input:focus, .textarea:focus, .select:focus {
          outline: none;
          border-color:#0a4376;
          box-shadow: 0 0 0 3px rgba(10, 67, 118, .15);
        }
        .select {
          appearance: none;
          background-image: linear-gradient(45deg, transparent 50%, #9ca3af 50%), linear-gradient(135deg, #9ca3af 50%, transparent 50%);
          background-position: calc(100% - 18px) calc(1.2em), calc(100% - 13px) calc(1.2em);
          background-size: 5px 5px, 5px 5px;
          background-repeat: no-repeat;
          padding-right: 2rem;
        }
        .btn-primary, .btn-secondary, .btn-ghost, .btn-danger {
          display:inline-flex; align-items:center; gap:.45rem;
          border-radius:12px;
          padding:.55rem .9rem;
          font-weight:600;
          transition: transform .06s ease, box-shadow .15s ease, background .15s ease, border-color .15s ease;
          will-change: transform;
        }
        .btn-primary { background:linear-gradient(180deg,#0b4a83,#0a4376); color:#fff; box-shadow: 0 2px 8px rgba(10,67,118,.25);}
        .btn-primary:hover { filter: brightness(1.05); box-shadow: 0 4px 14px rgba(10,67,118,.28);}
        .btn-primary:active { transform: translateY(1px); }
        .btn-secondary { background:#fff; border:1px solid #e5e7eb; color:#111827; }
        .btn-secondary:hover { background:#f9fafb; border-color:#d1d5db; }
        .btn-ghost { background:transparent; border:1px dashed #e5e7eb; color:#374151; }
        .btn-ghost:hover { background:#f9fafb; }
        .btn-danger { background:#fee2e2; border:1px solid #fecaca; color:#b91c1c; }
        .btn-danger:hover { background:#ffe4e6; border-color:#fca5a5; }
        .btn--sm { padding:.35rem .6rem; border-radius:10px; font-size:.9rem; }
        .btn--icon { padding:.4rem; width:2.25rem; height:2.25rem; display:inline-flex; align-items:center; justify-content:center; }
        .btn-ico { margin-right:.25rem; flex:0 0 auto; }
        .pretty-json {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          white-space: pre;
          tab-size: 2;
          line-height: 1.45;
        }
        .pretty-json::-webkit-scrollbar {
          height: 8px;
          width: 8px;
        }
        .pretty-json::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 8px;
        }
        /* --- Swagger-like styles --- */
        .doc-card { border:1px solid #e5e7eb; border-radius:12px; overflow:hidden; background:#fff; }
        .doc-head { display:flex; align-items:center; gap:.6rem; padding:.6rem .8rem; cursor:pointer; background: #f9fafb; }
        .doc-head:hover { background:#f3f4f6; }
        .method-badge { font-weight:700; font-size:.8rem; padding:.1rem .5rem; border-radius:6px; color:#fff; }
        .method-GET { background:#059669; }
        .method-POST { background:#2563eb; }
        .method-PUT { background:#7c3aed; }
        .method-DELETE { background:#dc2626; }
        .method-PATCH { background:#d97706; }
        .route-path { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background:#eef2ff; padding:.1rem .35rem; border-radius:6px; }
        .doc-summary { color:#374151; font-weight:600; }
        .chev { margin-left:auto; width:18px; height:18px; transition: transform .2s ease; }
        .chev.open { transform: rotate(180deg); }
        .doc-body { padding:.8rem; }
        .doc-desc { color:#4b5563; margin-bottom:.5rem; }
        .doc-subtitle { font-weight:700; margin:.6rem 0 .3rem; }
        .param-table { width:100%; border-collapse: collapse; font-size:.9rem; }
        .param-table th, .param-table td { border:1px solid #e5e7eb; padding:.4rem .5rem; vertical-align: top; }
        .param-table thead th { background:#f9fafb; }
        .doc-examples .example-grid { display:grid; grid-template-columns: 1fr; gap:.6rem; }
        @media (min-width: 768px) {
          .doc-examples .example-grid { grid-template-columns: 1fr 1fr; }
        }
        .example-title { font-weight:600; margin-bottom:.2rem; color:#374151; }
        .pretty-json.small { font-size:.8rem; max-height: 220px; }
      `}</style>
    </main>
  );
}