// app/search/page.tsx — Universal Full Text Search (TaxonEntry, DictionaryEntry, TransliterationEntry)
"use client";

import { useState, useEffect, useRef } from 'react';
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
  const [dictGeneralHits, setDictGeneralHits] = useState<UniversalHit[]>([]);
  const [dictSpecialHits, setDictSpecialHits] = useState<UniversalHit[]>([]);
  const [translitHits, setTranslitHits] = useState<UniversalHit[]>([]);

  // Popular searches
  const [popular, setPopular] = useState<PopularItem[]>([]);

  // Track whether user has executed a search (to differentiate "no results" vs initial state)
  const [hasSearched, setHasSearched] = useState(false);

  // Voice Search & TTS supports
  const [recSupported, setRecSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recRef = useRef<any>(null);

  const [ttsSupported, setTtsSupported] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null); // `${kind}-${id}`

  const anyResults = taxonHits.length + dictGeneralHits.length + dictSpecialHits.length + translitHits.length > 0;

  // --- Utils ---
  const stripTags = (html: string) => html.replace(/<[^>]+>/g, ' ');
  const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  // Remove only <mark> tags (keep the text), then strip any leftover HTML and compress spaces
  const stripMarks = (s: string) => (typeof s === 'string' ? s.replace(/<\/?mark[^>]*>/gi, '') : '');
  const compactSpaces = (s: string) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
  const toQueryParam = (s: string) => encodeURIComponent(compactSpaces(stripTags(stripMarks(s || ''))));

  // --- Popular search helpers ---
  function normQuery(s: string){
    return s.trim().toLowerCase().replace(/\s+/g,' ');
  }

  function loadPopularFromLocal(): PopularItem[] {
    //localStorage.removeItem('popular:universal');
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

  function dedupePopular(items: PopularItem[]): PopularItem[] {
    const map = new Map<string, PopularItem>();
    for (const it of items || []) {
      const key = (it.query || '').trim().toLowerCase();
      if (!key) continue;
      const prev = map.get(key);
      if (!prev || (it.count || 0) > (prev.count || 0)) {
        map.set(key, { query: it.query, count: it.count });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .slice(0, 12);
  }

  async function loadPopular(){
    // Try API first
    const data = await fetchJson('/api/search/popular?limit=12');
    if (data && Array.isArray(data.items)){
      setPopular(dedupePopular(data.items as PopularItem[]));
    } else {
      // Fallback to localStorage if API is not available
      setPopular(dedupePopular(loadPopularFromLocal()));
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

  // Detect browser support for SpeechRecognition and SpeechSynthesis
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w: any = window as any;
    const SR = w.webkitSpeechRecognition || w.SpeechRecognition;
    setRecSupported(!!SR);
    setTtsSupported(!!w.speechSynthesis && !!w.SpeechSynthesisUtterance);
  }, []);

  // Start/stop voice search (SpeechRecognition)
  function startVoiceSearch() {
    if (typeof window === 'undefined') return;
    const w: any = window as any;
    const SR = w.webkitSpeechRecognition || w.SpeechRecognition;
    if (!SR) return;
    try {
      const rec = new SR();
      rec.lang = 'th-TH'; // Thai by default
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onstart = () => setIsListening(true);
      rec.onerror = () => setIsListening(false);
      rec.onend = () => setIsListening(false);
      rec.onresult = (ev: any) => {
        const transcript =
          (ev.results && ev.results[0] && ev.results[0][0] && ev.results[0][0].transcript) || '';
        if (transcript) {
          setQ(transcript);
          void runSearch(transcript);
        }
      };
      recRef.current = rec;
      rec.start();
    } catch {
      setIsListening(false);
    }
  }
  function stopVoiceSearch() {
    try { recRef.current?.stop?.(); } catch {}
    setIsListening(false);
  }

  // Close listening modal on Escape
  useEffect(() => {
    if (!isListening) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        try { recRef.current?.stop?.(); } catch {}
        stopVoiceSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isListening]);

  // Build plain text for TTS from a hit
  const toSpeechText = (hit: UniversalHit) => {
    const title = compactSpaces(stripTags(stripMarks(hit.titleHtml)));
    const snippet = compactSpaces(stripTags(stripMarks(hit.snippetHtml || '')));
    return snippet ? `${title}. ${snippet}` : title;
  };

  // Speak / stop one hit
  function speakHit(hit: UniversalHit) {
    if (typeof window === 'undefined') return;
    const w: any = window as any;
    if (!w.speechSynthesis || !w.SpeechSynthesisUtterance) return;
    const targetId = `${hit.kind}-${hit.id}`;

    // If already speaking this one → cancel
    if (speakingId === targetId && w.speechSynthesis.speaking) {
      w.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }

    // Cancel current, then speak
    try { w.speechSynthesis.cancel(); } catch {}
    const text = toSpeechText(hit);
    const u = new w.SpeechSynthesisUtterance(text);
    u.lang = /[\u0E00-\u0E7F]/.test(text) ? 'th-TH' : 'en-US';
    u.rate = 1;
    u.pitch = 1;
    u.onend = () => setSpeakingId(null);
    setSpeakingId(targetId);
    w.speechSynthesis.speak(u);
  }

  // Stop all speech on unmount
  useEffect(() => {
    return () => {
      try { (window as any).speechSynthesis?.cancel?.(); } catch {}
    };
  }, []);

  async function runSearch(query: string){
    const finalQ = query.trim();
    if (!finalQ){
      setHasSearched(false);
      setTaxonHits([]); setDictGeneralHits([]); setDictSpecialHits([]); setTranslitHits([]);
      return;
    }
    setLoading(true);
    setError(null);
    setTaxonHits([]);
    setDictGeneralHits([]);
    setDictSpecialHits([]);
    setTranslitHits([]);
    setHasSearched(true);

    try {
      // stop any ongoing reading before new results
      try { (window as any).speechSynthesis?.cancel?.(); } catch {}
      setSpeakingId(null);
      // 1) TaxonEntry — try global taxonomy search (no taxonomyId)
      const taxonUrl = `/api/taxonomy/search?q=${encodeURIComponent(finalQ)}&page=1&pageSize=20`;
      // 2) DictionaryEntry — แยกเป็น 2 แหล่ง
      const dictGeneralUrl = `/api/search-dictionary?dictionaryId=0&q=${encodeURIComponent(finalQ)}&page=1&pageSize=20`;
      const dictSpecialUrl = `/api/search-dictionary?dictionaryId=3&q=${encodeURIComponent(finalQ)}&page=1&pageSize=20`;
      // 3) TransliterationEntry
      const translitUrl = `/api/admin/transliteration?q=${encodeURIComponent(finalQ)}&take=20`;

      const [taxonData, dictGeneralData, dictSpecialData, translitData] = await Promise.all([
        fetchJson(taxonUrl),
        fetchJson(dictGeneralUrl),
        fetchJson(dictSpecialUrl),
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

          const qText = it.officialNameThMarked || it.officialNameTh || it.titleMarked || it.title || '';
          const url = `/taxonomy/${encodeURIComponent(it.taxonomyId || 9)}?q=${toQueryParam(qText)}`;
          const meta: string = it.scientificName || it?.taxon?.scientificName || '';
          return { kind: 'taxon', id: it.id, titleHtml, snippetHtml, url, meta };
        });
        setTaxonHits(hits);
      }

      // --- Build DictionaryEntry hits: พจนานุกรม (dictionaryId=0) ---
      if (dictGeneralData) {
        const arr0: any[] = Array.isArray(dictGeneralData?.items)
          ? dictGeneralData.items
          : Array.isArray(dictGeneralData?.results)
          ? dictGeneralData.results
          : Array.isArray(dictGeneralData)
          ? dictGeneralData
          : [];

        const hits0: UniversalHit[] = arr0.slice(0, 5).map((it: any) => {
          const termTH = it.term_th || '';
          const termEN = ''; //it.term_en || '';
          const titleHtml = (termTH || termEN)
            ? `${termTH}${termTH && termEN ? ' / ' : ''}${termEN}`
            : `คำศัพท์ #${it.id}`;
          const defHtml = typeof it.definition_html === 'string' && it.definition_html
            ? it.definition_html
            : (it.definition || '');
          const snippetHtml = truncate(stripTags(defHtml || ''), 320);
          const qText0 = termTH || termEN || titleHtml || '';
          const url = `/dictionaries/${it.specializedDictionaryId ?? 0}?q=${toQueryParam(termTH)}`;
          const meta = 'พจนานุกรมฉบับราชบัณฑิตยสถาน';
          return { kind: 'dict', id: it.id, titleHtml, snippetHtml, url, meta };
        });
        setDictGeneralHits(hits0);
      }

      // --- Build DictionaryEntry hits: พจนานุกรมเฉพาะสาขาวิชา (dictionaryId=3) ---
      if (dictSpecialData) {
        const arr3: any[] = Array.isArray(dictSpecialData?.items)
          ? dictSpecialData.items
          : Array.isArray(dictSpecialData?.results)
          ? dictSpecialData.results
          : Array.isArray(dictSpecialData)
          ? dictSpecialData
          : [];

        const hits3: UniversalHit[] = arr3.slice(0, 5).map((it: any) => {
          const termTH = it.term_th || '';
          const termEN = it.term_en || '';
          const titleHtml = (termTH || termEN)
            ? `${termTH}${termTH && termEN ? ' / ' : ''}${termEN}`
            : `คำศัพท์ #${it.id}`;
          const defHtml = typeof it.definition_html === 'string' && it.definition_html
            ? it.definition_html
            : (it.definition || '');
          const snippetHtml = truncate(stripTags(defHtml || ''), 320);
          const url = `/dictionaries/${it.specializedDictionaryId ?? 3}?q=${toQueryParam(termTH)}`;
          const meta = it.specializedDictionaryTitle || (it.SpecializedDictionary?.title) || 'พจนานุกรมศัพท์เคมี';
          return { kind: 'dict', id: it.id, titleHtml, snippetHtml, url, meta };
        });
        setDictSpecialHits(hits3);
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
          const url = `/search-transliteration?q=${toQueryParam(it.transliteration1 || it.romanization || '')}`;
          const meta = it.category || it.wordType || '';
          return { kind: 'translit', id: it.id, titleHtml, snippetHtml, url, meta };
        });
        setTranslitHits(hits);
      }

      if (!taxonData && !dictGeneralData && !dictSpecialData && !translitData) {
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

                <button
                  type="button"
                  onClick={() => ttsSupported ? speakHit(h) : undefined}
                  disabled={!ttsSupported}
                  aria-pressed={speakingId === `${h.kind}-${h.id}`}
                  aria-label={
                    !ttsSupported
                      ? 'เบราว์เซอร์ไม่รองรับการอ่านออกเสียง'
                      : (speakingId === `${h.kind}-${h.id}` ? 'หยุดอ่านผลลัพธ์นี้' : 'อ่านข้อความผลลัพธ์นี้')
                  }
                  title={!ttsSupported ? 'เบราว์เซอร์ไม่รองรับการอ่านออกเสียง' : (speakingId === `${h.kind}-${h.id}` ? 'หยุดอ่าน' : 'อ่านข้อความนี้')}
                  className={`inline-flex items-center justify-center h-8 w-8 rounded border focus:outline-none focus:ring-2 focus:ring-blue-500
                    ${speakingId === `${h.kind}-${h.id}`
                      ? 'border-blue-500 bg-blue-50 text-blue-600 hover:bg-blue-100'
                      : 'border-gray-300 bg-white hover:bg-gray-50 text-gray-700'
                    }
                    ${!ttsSupported ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {
                    speakingId === `${h.kind}-${h.id}`
                      ? (
                        // Pause icon (active/reading)
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                          <path d="M6 4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H6Zm9 0a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-3Z"/>
                        </svg>
                      )
                      : (
                        // Speaker icon (idle)
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                          <path d="M5 9H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2l3.29 2.47A1 1 0 0 0 10 17V7a1 1 0 0 0-1.71-.77L5 9Zm10.59-2.91a1 1 0 0 0-1.41 1.41A4 4 0 0 1 16 12a4 4 0 0 1-1.82 3.5 1 1 0 0 0 1.11 1.66A6 6 0 0 0 18 12a6 6 0 0 0-2.41-4.91Zm3.98-2.26a1 1 0 1 0-1.32 1.5A9 9 0 0 1 21 12a9 9 0 0 1-1.75 5.33 1 1 0 0 0 1.64 1.14A11 11 0 0 0 23 12a11 11 0 0 0-3.43-8.17Z"/>
                        </svg>
                      )
                  }
                  <span className="sr-only">{speakingId === `${h.kind}-${h.id}` ? 'หยุดอ่าน' : 'อ่านข้อความ'}</span>
                </button>

                {/*<span className="truncate text-gray-900">{h.url}</span>*/}
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
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 mb-2">ระบบฐานข้อมูลของสำนักงานราชบัณฑิตยสภา</h1>
          <p className="text-gray-600">สืบค้นข้อมูลแบบข้อความภาษาไทยและภาษาอังกฤษ (full text search)</p>
        </div>

        {/* Search Bar */}
        <div className="bg-white rounded-lg shadow-md p-3 mb-5">
          <form onSubmit={onSearch} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={q}
              onChange={(e) => {
                const v = e.target.value;
                setQ(v);
                // If user is editing after a search that returned no results,
                // revert UI to initial stage until they submit again.
                if (!loading && hasSearched && !(
                  (taxonHits && taxonHits.length) ||
                  (dictGeneralHits && dictGeneralHits.length) ||
                  (dictSpecialHits && dictSpecialHits.length) ||
                  (translitHits && translitHits.length)
                )) {
                  setHasSearched(false);
                  setError(null);
                  setTaxonHits([]);
                  setDictGeneralHits([]);
                  setDictSpecialHits([]);
                  setTranslitHits([]);
                }
              }}
              placeholder="พิมพ์คำค้น แล้วกด Enter"
              className="flex-1 px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="ช่องค้นหา"
            />
            <button
              type="button"
              onClick={() => (isListening ? stopVoiceSearch() : startVoiceSearch())}
              disabled={!recSupported || loading}
              aria-pressed={isListening}
              aria-label={isListening ? 'หยุดฟังเสียง' : (recSupported ? 'ค้นหาด้วยเสียง' : 'เบราว์เซอร์ไม่รองรับการค้นหาด้วยเสียง')}
              title={recSupported ? (isListening ? 'หยุดฟังเสียง' : 'ค้นหาด้วยเสียง') : 'เบราว์เซอร์ไม่รองรับ'}
              className={`px-4 py-3 border border-gray-300 rounded-md bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 ${(!recSupported || loading) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {/* Mic icon */}
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm-7-3a1 1 0 1 1 2 0 5 5 0 1 0 10 0 1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V21h3a1 1 0 1 1 0 2H10a1 1 0 1 1 0-2h3v-3.07A7 7 0 0 1 5 11Z"/>
              </svg>
            </button>
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
                {popular.map((p, idx) => (
                  <button
                    key={`${p.query}-${idx}`}
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
              { key: 'dict-general', title: 'พจนานุกรม', badge: 'พจนานุกรม', hits: dictGeneralHits },
              { key: 'dict-special', title: 'พจนานุกรมเฉพาะสาขา', badge: 'พจนานุกรมเฉพาะสาขา', hits: dictSpecialHits },
              { key: 'translit', title: 'คำทับศัพท์', badge: 'คำทับศัพท์', hits: translitHits },
            ]
              .filter(sec => sec.hits && sec.hits.length > 0)
              .sort((a,b) => b.hits.length - a.hits.length)
              .map(sec => (
                <Section key={sec.key} title={sec.title} badge={sec.badge} hits={sec.hits} />
              ))}
          </div>
        )}

        {!loading && !error && !anyResults && (
          hasSearched ? (
            <div className="text-center text-gray-700 py-12" role="status" aria-live="polite">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center">
                {/* Magnifier with X icon */}
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true" className="text-gray-500">
                  <path d="M10.5 3a7.5 7.5 0 1 1 4.98 13.23l3.64 3.65a1 1 0 0 1-1.42 1.41l-3.64-3.64A7.5 7.5 0 0 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Zm-1.53 3.97a1 1 0 0 1 1.41 0l1.12 1.12 1.12-1.12a1 1 0 1 1 1.41 1.41L12.91 11.5l1.12 1.12a1 1 0 0 1-1.41 1.41l-1.12-1.12-1.12 1.12a1 1 0 1 1-1.41-1.41l1.12-1.12-1.12-1.12a1 1 0 0 1 0-1.41Z"/>
                </svg>
              </div>
              <div className="text-lg font-semibold">ไม่พบข้อมูลตามคำค้น</div>
              <div className="mt-1 text-sm text-gray-600">
                โปรดเปลี่ยนคำค้นหาใหม่อีกครั้ง{q ? <> สำหรับคำว่า “{q}”</> : null}
              </div>
            </div>
          ) : (
            <div className="text-center text-black py-10" role="status" aria-live="polite">
              พิมพ์คำค้นแล้วกด Enter เพื่อค้นหา
            </div>
          )
        )}
      </div>
      {/* Voice Listening Modal */}
      {isListening && (
        <div role="dialog" aria-modal="true" aria-label="กำลังฟังคำค้น" className="fixed inset-0 z-[9999]">
          <div className="absolute inset-0 bg-black/40" onClick={stopVoiceSearch} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="mx-auto w-[min(92vw,360px)] rounded-xl shadow-2xl bg-white border border-gray-200 p-5 text-center">
              <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true" className="animate-pulse text-blue-600">
                  <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm-7-3a1 1 0 1 1 2 0 5 5 0 1 0 10 0 1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V21h3a1 1 0 1 1 0 2H10a1 1 0 1 1 0-2h3v-3.07A7 7 0 0 1 5 11Z"/>
                </svg>
              </div>
              <div className="font-semibold text-gray-900">กำลังฟัง…</div>
              <div className="mt-1 text-sm text-gray-600">พูดคำค้นของคุณได้เลย แล้วหยุดพูดเพื่อสิ้นสุด</div>
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={stopVoiceSearch}
                  className="px-3 py-1.5 rounded-md border border-gray-300 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="หยุดฟัง"
                  title="หยุดฟัง"
                >
                  หยุดฟัง
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}