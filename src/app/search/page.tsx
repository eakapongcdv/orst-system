// app/search/page.tsx — Universal Full Text Search (TaxonEntry, DictionaryEntry, TransliterationEntry)
"use client";

import { useState, useEffect } from 'react';
import Head from 'next/head';

// --- Types ---
interface UniversalHit {
  kind: 'taxon' | 'dict' | 'translit';
  id: number;
  titleHtml: string; // already-highlighted or plain HTML-safe title
  snippetHtml?: string; // highlighted snippet if available
  url: string; // target page url
  meta?: string; // small gray meta text
}

// Popular item type
interface PopularItem { query: string; count: number }

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [taxonHits, setTaxonHits] = useState<UniversalHit[]>([]);
  const [dictHits, setDictHits] = useState<UniversalHit[]>([]);
  const [translitHits, setTranslitHits] = useState<UniversalHit[]>([]);

  // Popular searches
  const [popular, setPopular] = useState<PopularItem[]>([]);

  const anyResults = taxonHits.length + dictHits.length + translitHits.length > 0;

  // --- Utils ---
  const stripTags = (html: string) => html.replace(/<[^>]+>/g, ' ');
  const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  // --- Popular search helpers ---
  function normQuery(s: string){
    return s.trim().toLowerCase().replace(/\s+/g,' ');
  }

  function loadPopularFromLocal(): PopularItem[] {
    if (typeof window === 'undefined') return [];
    try{
      const raw = localStorage.getItem('popular:universal');
      if (!raw) return [];
      const obj = JSON.parse(raw) as Record<string, number>;
      return Object.entries(obj)
        .map(([query, count]) => ({ query, count }))
        .sort((a,b)=> b.count - a.count)
        .slice(0, 12);
    }catch{ return []; }
  }
  function savePopularToLocal(map: Record<string, number>){
    if (typeof window === 'undefined') return;
    localStorage.setItem('popular:universal', JSON.stringify(map));
  }
  function updateLocalPopular(query: string){
    const qn = normQuery(query);
    if (!qn) return;
    const raw = (typeof window !== 'undefined' ? localStorage.getItem('popular:universal') : null) || '{}';
    let map: Record<string, number> = {};
    try{ map = JSON.parse(raw as string) || {}; }catch{}
    map[qn] = (map[qn] || 0) + 1;
    savePopularToLocal(map);
  }

  async function loadPopular(){
    // Try API first
    const data = await fetchJson('/api/search/popular?limit=12');
    if (data && Array.isArray(data.items)){
      setPopular(data.items as PopularItem[]);
    } else {
      // Fallback to localStorage if API is not available
      setPopular(loadPopularFromLocal());
    }
  }

  async function logPopular(query: string){
    const qn = normQuery(query);
    if (!qn) return;
    try{
      await fetch('/api/search/popular', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ query: qn })
      });
    }catch{
      // swallow
    }
    // Always update local as a best-effort client cache
    updateLocalPopular(qn);
    // Refresh list (best-effort)
    void loadPopular();
  }

  // On mount, load popular
  useEffect(()=>{ void loadPopular(); },[]);

  async function runSearch(query: string){
    const finalQ = query.trim();
    if (!finalQ){ setTaxonHits([]); setDictHits([]); setTranslitHits([]); return; }
    setLoading(true);
    setError(null);
    setTaxonHits([]);
    setDictHits([]);
    setTranslitHits([]);

    try {
      // 1) TaxonEntry — try global taxonomy search (no taxonomyId)
      const taxonUrl = `/api/taxonomy/search?q=${encodeURIComponent(finalQ)}&page=1&pageSize=5`;
      // 2) DictionaryEntry — try a few likely endpoints, pick the first that returns data
      const dictCandidates = [
        `/api/admin/dictionary/entries/search?q=${encodeURIComponent(finalQ)}&take=5`,
        `/api/admin/dictionary/entries?q=${encodeURIComponent(finalQ)}&take=5`,
        `/api/admin/dictionary?q=${encodeURIComponent(finalQ)}&mode=entries&take=5`,
      ];
      // 3) TransliterationEntry
      const translitUrl = `/api/admin/transliteration?q=${encodeURIComponent(finalQ)}&take=5`;

      const [taxonData, dictData, translitData] = await Promise.all([
        fetchJson(taxonUrl),
        (async () => {
          for (const u of dictCandidates) {
            const j = await fetchJson(u);
            if (j) return j;
          }
          return null;
        })(),
        fetchJson(translitUrl),
      ]);

      // --- Build TaxonEntry hits ---
      if (taxonData && Array.isArray(taxonData.results)) {
        const hits: UniversalHit[] = taxonData.results.map((it: any) => {
          const titleHtml =
            it.officialNameThMarked ||
            it.officialNameTh ||
            it.titleMarked ||
            it.title ||
            `หัวข้อ #${it.id}`;

          let snippetHtml: string | undefined;
          if (it.shortDescriptionMarked) snippetHtml = it.shortDescriptionMarked;
          else if (it.contentHtmlMarked) snippetHtml = it.contentHtmlMarked;
          else if (typeof it.contentText === 'string') snippetHtml = truncate(stripTags(it.contentText), 320);

          const url = `/taxonomy/${encodeURIComponent(it.taxonId)}?entry=${encodeURIComponent(it.id)}`;
          const meta: string = it.scientificName || it?.taxon?.scientificName || '';
          return { kind: 'taxon', id: it.id, titleHtml, snippetHtml, url, meta };
        });
        setTaxonHits(hits);
      }

      // --- Build DictionaryEntry hits ---
      if (dictData) {
        const arr: any[] = Array.isArray(dictData?.items)
          ? dictData.items
          : Array.isArray(dictData?.results)
          ? dictData.results
          : Array.isArray(dictData)
          ? dictData
          : [];

        const hits: UniversalHit[] = arr.slice(0, 5).map((it: any) => {
          const termTH = it.term_th || '';
          const termEN = it.term_en || '';
          const titleHtml = (termTH || termEN) ? `${termTH}${termTH && termEN ? ' / ' : ''}${termEN}` : `คำศัพท์ #${it.id}`;
          const defHtml = typeof it.definition_html === 'string' && it.definition_html
            ? it.definition_html
            : (it.definition || '');
          const snippetHtml = truncate(stripTags(defHtml || ''), 320);
          const url = `/admin/dictionary?entryId=${encodeURIComponent(it.id)}`;
          const meta = it.specializedDictionaryTitle || (it.SpecializedDictionary?.title) || `พจนานุกรมเฉพาะสาขา #${it.specializedDictionaryId ?? ''}`;
          return { kind: 'dict', id: it.id, titleHtml, snippetHtml, url, meta };
        });
        setDictHits(hits);
      }

      // --- Build TransliterationEntry hits ---
      if (translitData) {
        const arr: any[] = Array.isArray(translitData?.items)
          ? translitData.items
          : Array.isArray(translitData?.results)
          ? translitData.results
          : Array.isArray(translitData)
          ? translitData
          : [];
        const hits: UniversalHit[] = arr.slice(0, 5).map((it: any) => {
          const titleHtml = [it.romanization, it.transliteration1, it.language]
            .filter(Boolean)
            .join(' • ');
          const raw = it.meaning || it.notes || '';
          const snippetHtml = truncate(stripTags(String(raw)), 320);
          const url = `/search-transliteration?q=${encodeURIComponent(it.transliteration1)}`;
          const meta = it.category || it.wordType || '';
          return { kind: 'translit', id: it.id, titleHtml, snippetHtml, url, meta };
        });
        setTranslitHits(hits);
      }

      if (!taxonData && !dictData && !translitData) {
        setError('ไม่สามารถติดต่อแหล่งข้อมูลได้');
      }

      // Log query to popular storage (API + local fallback)
      void logPopular(finalQ);
    } catch (e: any) {
      setError(e?.message || 'เกิดข้อผิดพลาดในการค้นหา');
    } finally {
      setLoading(false);
    }
  }

  async function fetchJson(url: string) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  const onSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await runSearch(q);
  };

  const Section = ({ title, badge, hits }: { title: string; badge: string; hits: UniversalHit[] }) => (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h2 className="text-base font-medium text-gray-800">{title}</h2>
      </div>
      <div className="divide-y divide-gray-100">
        {hits.length === 0 ? (
          <div className="p-5 text-black">ไม่พบผลลัพธ์</div>
        ) : (
          hits.map((h) => (
            <div key={`${h.kind}-${h.id}`} className="p-4 hover:bg-gray-50 transition-colors">
              <a href={h.url} className="text-2xl font-medium text-blue-600 hover:text-blue-800 hover:underline block" dangerouslySetInnerHTML={{ __html: h.titleHtml }} />
              {h.meta && <div className="text-md text-black mt-0.5">{h.meta}</div>}
              {h.snippetHtml && (
                <p className="mt-1 text-black text-md" dangerouslySetInnerHTML={{ __html: h.snippetHtml }} />
              )}
              <div className="mt-1 text-md inline-flex items-center gap-2 text-black">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-black">{badge}</span>
                <span className="truncate text-gray-900">{h.url}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <meta charSet="UTF-8" />
        <title>ค้นหา (รวมทุกคลังข้อมูล)</title>
      </Head>

      <div className="max-w-4xl mx-auto px-4 py-5">
        {/* Header */}
        <div className="text-center mb-5">
          <div className="flex justify-center mb-4">
            <img
              src="https://transliteration.orst.go.th/img/royin-logo2.c03c8949.png"
              alt="สำนักงานราชบัณฑิตยสภา"
              className="h-16 w-auto"
            />
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 mb-2">ค้นหาข้อมูลแบบรวมทุกคลัง</h1>
          <p className="text-gray-600">ค้นหา TaxonEntry, DictionaryEntry, TransliterationEntry พร้อมตัวอย่างเนื้อหา</p>
        </div>

        {/* Search Bar */}
        <div className="bg-white rounded-lg shadow-md p-3 mb-5">
          <form onSubmit={onSearch} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="พิมพ์คำค้น แล้วกด Enter"
              className="flex-1 px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="ช่องค้นหา"
            />
            <button
              type="submit"
              className={`px-4 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={loading}
            >
              {loading ? 'กำลังค้นหา…' : 'ค้นหา'}
            </button>
          </form>
          {popular && popular.length > 0 && (
            <div className="mt-2">
              <div className="text-md text-black mb-1">คำค้นหายอดนิยม:</div>
              <div className="flex flex-wrap gap-2">
                {popular.map((p) => (
                  <button
                    key={p.query}
                    type="button"
                    className="px-2.5 py-1 rounded-full bg-gray-100 text-black text-md hover:bg-gray-200"
                    onClick={() => { setQ(p.query); void runSearch(p.query); }}
                    title={`${p.count} ครั้ง`}
                  >
                    {p.query}
                    <span className="ml-1 text-[10px] text-black">{p.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-5 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md">{error}</div>
        )}

        {/* Results */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
            <p className="text-gray-600">กำลังค้นหา…</p>
          </div>
        )}

        {!loading && anyResults && (
          <div className="grid grid-cols-1 gap-5">
            {[
              { key: 'taxon', title: 'อนุกรมวิธาน', badge: 'อนุกรมวิธาน', hits: taxonHits },
              { key: 'dict', title: 'พจนานุกรม/พจนานุกรมเฉพาะสาขาวิชา', badge: 'พจนานุกรม', hits: dictHits },
              { key: 'translit', title: 'คำทับศัพท์', badge: 'คำทับศัพท์', hits: translitHits },
            ]
              .sort((a,b) => b.hits.length - a.hits.length)
              .map(sec => (
                <Section key={sec.key} title={sec.title} badge={sec.badge} hits={sec.hits} />
              ))}
          </div>
        )}

        {!loading && !error && !anyResults && (
          <div className="text-center text-black py-10">พิมพ์คำค้นแล้วกด Enter เพื่อค้นหา</div>
        )}
      </div>
    </div>
  );
}