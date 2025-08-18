// src/app/dictionaries/page.tsx
"use client";
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/navigation';
import {
  EyeIcon,
  ArrowDownTrayIcon,
  BeakerIcon,
  ComputerDesktopIcon,
  ShieldExclamationIcon,
  ScaleIcon,
  LanguageIcon,
  BuildingLibraryIcon,
  GlobeAltIcon,
  PaintBrushIcon,
  ChartBarIcon,
  Squares2X2Icon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronDoubleDownIcon,
  ChevronDoubleUpIcon,
  ExclamationTriangleIcon,
  BookOpenIcon,
  BoltIcon,
  BugAntIcon,
  CalculatorIcon,
  CpuChipIcon,
  FolderOpenIcon,
} from '@heroicons/react/24/solid'

// Interface สำหรับ SpecializedDictionary จาก Prisma Schema พร้อมกับ entryCount จาก API
interface SpecializedDictionary {
  id: number;
  title: string; // ชื่อเล่ม เช่น พจนานุกรมศัพท์เคมี
  category: string; // สาขาวิชา เช่น วิทยาศาสตร์, คอมพิวเตอร์
  subcategory: string | null; // กลุ่มย่อย เช่น เคมี, ฟิสิกส์, ชีววิทยา
  year_published: number | null;
  created_at: string;
  updated_at: string;
  // เพิ่ม property สำหรับจำนวน entries ที่ได้จาก API
  entryCount: number;
}

// Interface สำหรับโครงสร้างข้อมูลที่ API ส่งกลับ (grouped)
// ตรงกับโครงสร้างที่ API route ส่งกลับ
interface APIDictionaryResponse {
  [category: string]: {
    [subcategory: string]: SpecializedDictionary[];
  };
}

// Interface สำหรับโครงสร้างข้อมูลที่จัดกลุ่มแล้วตาม Category > Subcategory > Title (สำหรับการแสดงผล)
// ปรับปรุงให้เหมาะสมกับการแสดงผลตามลำดับ Category > Subcategory > Dictionary
interface GroupedDictionaries {
  [category: string]: {
    subcategories: {
      [subcategory: string]: SpecializedDictionary[];
    };
  };
}

// Helper: icon per category name (Heroicons)
const iconForCategoryName = (name: string) => {
  const n = (name || '').toLowerCase();
  if (n.includes('วิทยาศาสตร์') || n.includes('science')) return <BeakerIcon className="h-5 w-5 text-brand-green" aria-hidden="true" />;
  if (n.includes('คอมพิวเตอร์') || n.includes('computer') || n.includes('เทคโนโลยีสารสนเทศ') || n.includes('information')) return <ComputerDesktopIcon className="h-5 w-5 text-brand-green" aria-hidden="true" />;
  if (n.includes('แพทย') || n.includes('medicine') || n.includes('สุขภาพ')) return <ShieldExclamationIcon className="h-5 w-5 text-brand-green" aria-hidden="true" />;
  if (n.includes('กฎหมาย') || n.includes('law')) return <ScaleIcon className="h-5 w-5 text-brand-green" aria-hidden="true" />;
  if (n.includes('ภาษา') || n.includes('ภาษาศาสตร์') || n.includes('lingu')) return <LanguageIcon className="h-5 w-5 text-brand-green" aria-hidden="true" />;
  if (n.includes('ประวัติ') || n.includes('history')) return <BuildingLibraryIcon className="h-5 w-5 text-brand-green" aria-hidden="true" />;
  if (n.includes('ภูมิศาสตร์') || n.includes('geography')) return <GlobeAltIcon className="h-5 w-5 text-brand-green" aria-hidden="true" />;
  if (n.includes('ศิลป์') || n.includes('ศิลปะ') || n.includes('arts')) return <PaintBrushIcon className="h-5 w-5 text-brand-green" aria-hidden="true" />;
  if (n.includes('เศรษฐ') || n.includes('econom')) return <ChartBarIcon className="h-5 w-5 text-brand-green" aria-hidden="true" />;
  return <Squares2X2Icon className="h-5 w-5 text-brand-green" aria-hidden="true" />;
};

// Helper: icon per subcategory name (Heroicons)
const iconForSubcategoryName = (name: string) => {
  const n = (name || '').toLowerCase();
  if (n.includes('เคมี') || n.includes('chem')) return <BeakerIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />;
  if (n.includes('ฟิสิกส์') || n.includes('phys')) return <BoltIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />;
  if (n.includes('ชีว') || n.includes('bio')) return <BugAntIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />;
  if (n.includes('คณิต') || n.includes('math')) return <CalculatorIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />;
  if (n.includes('ภูมิศาสตร์') || n.includes('geograph')) return <GlobeAltIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />;
  if (n.includes('นิติ') || n.includes('law')) return <ScaleIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />;
  if (n.includes('คอมพิวเตอร์') || n.includes('computer')) return <CpuChipIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />;
  return <FolderOpenIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />;
};

export default function DictionariesPage() {
  const [groupedDictionaries, setGroupedDictionaries] = useState<GroupedDictionaries>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // state สำหรับ collapse/expand
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});
  const [expandedSubs, setExpandedSubs] = useState<Record<string, Record<string, boolean>>>({});

  useEffect(() => {
    const fetchDictionaries = async () => {
      try {
        const response = await fetch('/api/dictionaries');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const apiData: APIDictionaryResponse = await response.json();

        const groupedForComponent: GroupedDictionaries = {};
        Object.entries(apiData).forEach(([category, subcategoryDict]) => {
          groupedForComponent[category] = { subcategories: {} };
          Object.entries(subcategoryDict).forEach(([subcategory, dicts]) => {
            groupedForComponent[category].subcategories[subcategory] = dicts;
          });
        });
        setGroupedDictionaries(groupedForComponent);

        // เปิดทุกหมวดไว้ก่อน (สามารถกดปิดได้ภายหลัง)
        const catInit: Record<string, boolean> = {};
        const subsInit: Record<string, Record<string, boolean>> = {};
        Object.keys(groupedForComponent).forEach((cat) => {
          catInit[cat] = true;
          subsInit[cat] = {};
          Object.keys(groupedForComponent[cat].subcategories).forEach((sub) => {
            subsInit[cat][sub] = true;
          });
        });
        setExpandedCats(catInit);
        setExpandedSubs(subsInit);
      } catch (err) {
        console.error('Error fetching dictionaries:', err);
        setError('เกิดข้อผิดพลาดในการโหลดข้อมูลพจนานุกรม');
      } finally {
        setLoading(false);
      }
    };
    fetchDictionaries();
  }, []);

  const handlePreview = (dictId: number) => {
    router.push(`/dictionaries/${dictId}/preview`);
  };

  const handleExportPdf = async (dictId: number) => {
    try {
      const response = await fetch(`/api/export-dictionary/pdf/${dictId}/`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/pdf' },
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting PDF:', err);
      alert(`เกิดข้อผิดพลาดในการส่งออก PDF สำหรับ ID: ${dictId}`);
    }
  };

  // helper: นับจำนวนเล่ม/entries ต่อหมวด/กลุ่มย่อย
  const counts = useMemo(() => {
    const result: Record<string, { totalDicts: number; totalEntries: number; subs: Record<string, { dicts: number; entries: number }> }> = {};
    Object.entries(groupedDictionaries).forEach(([cat, { subcategories }]) => {
      let totalDicts = 0;
      let totalEntries = 0;
      const subs: Record<string, { dicts: number; entries: number }> = {};
      Object.entries(subcategories).forEach(([sub, dicts]) => {
        const dictsCount = dicts.length;
        const entriesCount = dicts.reduce((acc, d) => acc + (d.entryCount || 0), 0);
        subs[sub] = { dicts: dictsCount, entries: entriesCount };
        totalDicts += dictsCount;
        totalEntries += entriesCount;
      });
      result[cat] = { totalDicts, totalEntries, subs };
    });
    return result;
  }, [groupedDictionaries]);

  const sortedCategories = useMemo(() => {
    const entries = Object.entries(groupedDictionaries);
    return entries.sort(([catA], [catB]) => {
      const a = counts[catA] || { totalDicts: 0, totalEntries: 0 };
      const b = counts[catB] || { totalDicts: 0, totalEntries: 0 };
      // Primary: total entries (desc), Secondary: total dictionaries (desc)
      if (b.totalEntries !== a.totalEntries) return b.totalEntries - a.totalEntries;
      return b.totalDicts - a.totalDicts;
    });
  }, [groupedDictionaries, counts]);

  // Helper to sort dictionaries:
  // 1) SpecializedDictionary ที่ id === 0 ต้องขึ้นก่อนเสมอ
  // 2) จากนั้นเรียงตามจำนวนรายการ (entryCount) มาก→น้อย
  // 3) สุดท้ายเรียงตามชื่อเรื่อง (localeCompare ภาษาไทย)
  const sortDicts = (dicts: SpecializedDictionary[]) => {
    return [...dicts].sort((a, b) => {
      if (a.id === 0 && b.id !== 0) return -1;
      if (b.id === 0 && a.id !== 0) return 1;
      const eb = b.entryCount || 0;
      const ea = a.entryCount || 0;
      if (eb !== ea) return eb - ea;
      const ta = (a.title || '').toLowerCase();
      const tb = (b.title || '').toLowerCase();
      return ta.localeCompare(tb, 'th');
    });
  };

  const expandAll = () => {
    const cats: Record<string, boolean> = {};
    const subs: Record<string, Record<string, boolean>> = {};
    Object.entries(groupedDictionaries).forEach(([cat, { subcategories }]) => {
      cats[cat] = true;
      subs[cat] = {};
      Object.keys(subcategories).forEach((sub) => (subs[cat][sub] = true));
    });
    setExpandedCats(cats);
    setExpandedSubs(subs);
  };

  const collapseAll = () => {
    const cats: Record<string, boolean> = {};
    const subs: Record<string, Record<string, boolean>> = {};
    Object.entries(groupedDictionaries).forEach(([cat, { subcategories }]) => {
      cats[cat] = false;
      subs[cat] = {};
      Object.keys(subcategories).forEach((sub) => (subs[cat][sub] = false));
    });
    setExpandedCats(cats);
    setExpandedSubs(subs);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-texture">
        <div className="text-center">
          <svg className="animate-spin h-10 w-10 text-brand-green mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="mt-4 text-muted-ink">กำลังโหลดข้อมูลพจนานุกรม...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-texture">
        <div className="text-center p-4 card max-w-md">
          <div className="flex justify-center">
            <ExclamationTriangleIcon className="h-8 w-8 text-red-600" aria-hidden="true" />
          </div>
          <h3 className="mt-4 h2">เกิดข้อผิดพลาด</h3>
          <p className="mt-2 text-lead">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 btn-secondary"
          >
            ลองใหม่อีกครั้ง
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-texture">
      <Head>
        <title>พจนานุกรมเฉพาะสาขาวิชา - ระบบฐานข้อมูลคำศัพท์</title>
      </Head>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header Area */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="h2 text-foreground">คลังพจนานุกรม</h2>
            <p className="text-lead">สำรวจพจนานุกรมเฉพาะสาขาวิชา พร้อมตัวเลือกดูตัวอย่างและส่งออกเอกสาร</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={expandAll} className="btn-secondary" title="ขยายทั้งหมด">
              <ChevronDoubleDownIcon className="h-5 w-5" aria-hidden="true" />
              <span className="sr-only">ขยายทั้งหมด</span>
            </button>
            <button onClick={collapseAll} className="btn-primary" title="ยุบทั้งหมด">
              <ChevronDoubleUpIcon className="h-5 w-5" aria-hidden="true" />
              <span className="sr-only">ยุบทั้งหมด</span>
            </button>
          </div>
        </div>

        {/* Category Accordion (Compact) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sortedCategories.map(([category, { subcategories }]) => {
            const catCount = counts[category]?.totalDicts || 0;
            const catEntries = counts[category]?.totalEntries || 0;
            const isCatOpen = !!expandedCats[category];
            return (
              <section key={category} className="card overflow-hidden h-full">
                {/* Category Header (button) */}
                <button
                  type="button"
                  onClick={() =>
                    setExpandedCats((prev) => ({ ...prev, [category]: !prev[category] }))
                  }
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                  aria-expanded={isCatOpen}
                  aria-controls={`cat-panel-${category}`}
                >
                  <div className="flex items-center gap-3 text-left">
                    <span className="inline-flex items-center justify-center">{iconForCategoryName(category)}</span>
                    <span className="font-extrabold text-gray-900 text-lg">{category}</span>
                    <span className="text-xs font-bold text-white bg-brand-green px-2 py-0.5 rounded-full">
                      {catCount} เล่ม
                    </span>
                    {catEntries > 0 && (
                      <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">
                        {catEntries.toLocaleString()} รายการ
                      </span>
                    )}
                  </div>
                  {isCatOpen ? (
                    <ChevronUpIcon className="h-5 w-5 text-muted-ink" aria-hidden="true" />
                  ) : (
                    <ChevronDownIcon className="h-5 w-5 text-muted-ink" aria-hidden="true" />
                  )}
                </button>

                {/* Category Panel */}
                {isCatOpen && (
                  <div id={`cat-panel-${category}`} className="border-t border-border">
                    <div className="divide-y divide-border">
                      {Object.entries(subcategories).map(([subcategory, dicts]) => {
                        const isSubOpen = !!expandedSubs[category]?.[subcategory];
                        const subCount = counts[category]?.subs?.[subcategory]?.dicts || 0;
                        const subEntries = counts[category]?.subs?.[subcategory]?.entries || 0;
                        return (
                          <div key={subcategory}>
                            {/* Subcategory Header */}
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedSubs((prev) => ({
                                  ...prev,
                                  [category]: {
                                    ...(prev[category] || {}),
                                    [subcategory]: !prev[category]?.[subcategory],
                                  },
                                }))
                              }
                              className="w-full flex items-center justify-between px-4 py-2 bg-white hover:bg-gray-50"
                              aria-expanded={isSubOpen}
                              aria-controls={`sub-panel-${category}-${subcategory}`}
                            >
                              <div className="flex items-center gap-2 text-left">
                                <span className="inline-flex items-center justify-center">{iconForSubcategoryName(subcategory)}</span>
                                <span className="font-bold text-gray-800 ">
                                  {subcategory === 'no_subcategory' || subcategory === 'ไม่มีกลุ่มย่อย' ? 'ทั่วไป' : subcategory}
                                </span>
                                <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">
                                  {subCount} เล่ม
                                </span>
                                {subEntries > 0 && (
                                  <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">
                                    {subEntries.toLocaleString()} รายการ
                                  </span>
                                )}
                              </div>
                              {isSubOpen ? (
                                <ChevronUpIcon className="h-5 w-5 text-muted-ink" aria-hidden="true" />
                              ) : (
                                <ChevronDownIcon className="h-5 w-5 text-muted-ink" aria-hidden="true" />
                              )}
                            </button>

                            {isSubOpen && (
                              <div id={`sub-panel-${category}-${subcategory}`} className="px-4 py-3 bg-gray-50">
                                <ul className="grid grid-cols-1 sm:grid-cols-1 gap-3">
                                  {sortDicts(dicts).map((dict) => (
                                    <li key={dict.id} className="border border-border rounded-md bg-white p-3 hover:shadow-sm transition">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                          <Link
                                            href={`/dictionaries/${dict.id}`}
                                            className="text-sm font-semibold text-brand-green hover:underline block truncate"
                                          >
                                            <BookOpenIcon className="h-4 w-4 text-muted-ink mr-2 inline-block" aria-hidden="true" />
                                            {dict.title}
                                          </Link>
                                          <div className="mt-1 flex flex-wrap items-center gap-2">
                                            {dict.entryCount > 0 && (
                                              <span className=" font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                                                {dict.entryCount} รายการ
                                              </span>
                                            )}
                                            {dict.year_published && (
                                              <span className=" text-gray-600">ปี {dict.year_published}</span>
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                          <button
                                            onClick={() => handlePreview(dict.id)}
                                            className="btn-secondary px-2 py-1  flex items-center gap-1"
                                            disabled={dict.entryCount <= 0}
                                            title="ดูตัวอย่าง"
                                          >
                                            <EyeIcon className="h-4 w-4 text-brand-white" aria-hidden="true" />
                                            <span className="sr-only sm:not-sr-only sm:inline">Preview</span>
                                          </button>
                                          <button
                                            onClick={() => handleExportPdf(dict.id)}
                                            className="btn-primary px-2 py-1  flex items-center gap-1"
                                            disabled={dict.entryCount <= 0}
                                            title="ส่งออกเป็น PDF"
                                          >
                                            <ArrowDownTrayIcon className="h-4 w-4 text-brand-white" aria-hidden="true" />
                                            <span className="sr-only sm:not-sr-only sm:inline">PDF</span>
                                          </button>
                                        </div>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}