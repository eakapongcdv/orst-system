// src/app/dictionaries/page.tsx
"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import router from 'next/router';
import { useRouter } from 'next/navigation';

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

export default function DictionariesPage() {
  const [groupedDictionaries, setGroupedDictionaries] = useState<GroupedDictionaries>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter(); // 2. Call useRouter inside the component

  useEffect(() => {
    const fetchDictionaries = async () => {
      try {
        const response = await fetch('/api/dictionaries');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        // ปรับ type ของข้อมูลที่ได้รับให้ตรงกับโครงสร้างใหม่จาก API
        const apiData: APIDictionaryResponse = await response.json();
        // แปลงข้อมูลจาก API (grouped) เป็นโครงสร้างที่ component ใช้งาน
        // ในกรณีนี้ โครงสร้าง API ก็ใกล้เคียงกับที่เราต้องการอยู่แล้ว
        const groupedForComponent: GroupedDictionaries = {};
        Object.entries(apiData).forEach(([category, subcategoryDict]) => {
          groupedForComponent[category] = { subcategories: {} };
          Object.entries(subcategoryDict).forEach(([subcategory, dicts]) => {
            groupedForComponent[category].subcategories[subcategory] = dicts;
          });
        });
        setGroupedDictionaries(groupedForComponent);
      } catch (err) {
        console.error("Error fetching dictionaries:", err);
        setError('เกิดข้อผิดพลาดในการโหลดข้อมูลพจนานุกรม');
      } finally {
        setLoading(false);
      }
    };
    fetchDictionaries();
  }, []);

  const handlePreview = async (dictId: number) => {
    const previewPath = `/dictionaries/${dictId}/preview`;
    router.push(previewPath);
  };

  // ปรับให้เรียก API ที่มีการตั้งชื่อไฟล์ใน Header แล้ว
  const handleExportDocx = async (dictId: number) => {
    try {
      const response = await fetch(`/api/export-dictionary/docx/${dictId}/`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      // รับ blob จาก response
      const blob = await response.blob();
      // สร้าง URL สำหรับ blob
      const url = window.URL.createObjectURL(blob);
      // สร้าง element <a> สำหรับ download
      const a = document.createElement('a');
      a.href = url;
      // ลบบรรทัด a.download = ... ออก ให้ใช้ชื่อจาก Header แทน
      // a.download = `dictionary_${dictId}.docx`; // <-- ลบหรือ comment ออก
      document.body.appendChild(a);
      a.click();
      // ลบ element ทิ้งหลังใช้งาน
      document.body.removeChild(a);
      // ยกเลิก URL object
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error exporting DOCX:", err);
      alert(`เกิดข้อผิดพลาดในการส่งออก DOCX สำหรับ ID: ${dictId}`);
    }
  };

  const handleExportPdf = async (dictId: number) => {
    try {
      const response = await fetch(`/api/export-dictionary/pdf/${dictId}/`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/pdf',
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      // รับ blob จาก response
      const blob = await response.blob();
      // สร้าง URL สำหรับ blob
      const url = window.URL.createObjectURL(blob);
      // สร้าง element <a> สำหรับ download
      const a = document.createElement('a');
      a.href = url;
      // ลบบรรทัด a.download = ... ออก ให้ใช้ชื่อจาก Header แทน
      // a.download = `dictionary_${dictId}.pdf`; // <-- ลบหรือ comment ออก
      document.body.appendChild(a);
      a.click();
      // ลบ element ทิ้งหลังใช้งาน
      document.body.removeChild(a);
      // ยกเลิก URL object
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error exporting PDF:", err);
      alert(`เกิดข้อผิดพลาดในการส่งออก PDF สำหรับ ID: ${dictId}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <svg className="animate-spin h-10 w-10 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="mt-4 text-gray-600">กำลังโหลดข้อมูลพจนานุกรม...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-4 bg-red-50 rounded-lg max-w-md">
          <div className="flex justify-center">
            <svg className="h-12 w-12 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-medium text-red-800">เกิดข้อผิดพลาด</h3>
          <p className="mt-2 text-md text-red-700">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-md font-bold rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            ลองใหม่อีกครั้ง
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>พจนานุกรมเฉพาะสาขาวิชา - ระบบฐานข้อมูลคำศัพท์</title>
      </Head>

      {/*
      Header
      <header className="bg-blue-600 text-white p-4 flex items-center justify-between">
        <div className="flex items-center">
          <img
            src="https://transliteration.orst.go.th/img/royin-logo2.c03c8949.png"
            alt="สำนักงานราชบัณฑิตยสภา"
            className="h-10 w-10 mr-2 bg-white"
          />
          <h1 className="text-xl font-bold">ระบบฐานข้อมูลคำศัพท์ของสำนักงานราชบัณฑิตยสภา</h1>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Flag_of_the_United_Kingdom.svg/1280px-Flag_of_the_United_Kingdom.svg.png" alt="English Flag" className="h-6 w-6" />
            <span>English</span>
          </div>
          <div className="flex items-center space-x-2">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Flag_of_Thailand.svg/1280px-Flag_of_Thailand.svg.png" alt="Thai Flag" className="h-6 w-6" />
            <span>ภาษาไทย</span>
          </div>
          <div className="flex items-center space-x-2">
            <span>ขยาย</span>
            <button>-</button>
            <span>100%</span>
            <button>+</button>
          </div>
        </div>
      </header>
      */}

      {/* Main Content */}
      {/* ปรับ max-w และ px เพื่อรองรับ 2 columns */}
      <main className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-12 py-8">
        <div className="mb-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">คลังพจนานุกรม (35 เล่ม)</h2>
          <nav className="text-sm text-gray-500">
            <Link href="/" className="hover:underline">หน้าหลัก</Link> พจนานุกรมเฉพาะสาขาวิชา
          </nav>
        </div>

        {Object.keys(groupedDictionaries).length === 0 ? (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <h3 className="mt-2 text-md font-bold text-gray-900">ไม่พบพจนานุกรม</h3>
            <p className="mt-1 text-md text-black-500">ยังไม่มีข้อมูลพจนานุกรมเฉพาะสาขาวิชาในระบบ</p>
          </div>
        ) : (
          <div className="space-y-4 ml-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* วนลูปตาม Category (ระดับ 1) */}
            {Object.entries(groupedDictionaries).map(([category, { subcategories }]) => (
              <div key={category} className="bg-white shadow rounded-lg overflow-hidden">
                {/* Level 1: Category Header */}
                <div className="bg-blue-50 px-6 py-4 border-b border-gray-200">
                  <h3 className="text-xl font-bold text-blue-800 flex items-center">
                    <svg className="h-5 w-5 text-blue-600 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    {category}
                  </h3>
                </div>
                <div className="p-6">
                  {/* วนลูปตาม Subcategory (ระดับ 2) */}
                  {Object.entries(subcategories).map(([subcategory, dicts]) => (
                    <div key={subcategory} className="mb-6 last:mb-0">
                      {/* Level 2: Subcategory Header */}
                      {/* ซ่อน header ถ้า subcategory เป็น 'no_subcategory' หรือ 'ไม่มีกลุ่มย่อย' */}
                      {subcategory !== 'no_subcategory' && subcategory !== 'ไม่มีกลุ่มย่อย' && (
                         <h4 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                          <svg className="h-4 w-4 text-gray-400 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          {subcategory}
                        </h4>
                      )}
                      {/* Level 3: Dictionaries List */}
                      <div className="ml-6 space-y-3">
                        {dicts.map(dict => (
                          <div key={dict.id} className="flex items-start p-3 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors">
                            <svg className="h-5 w-5 text-purple-500 mr-3 mt-0.5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <div className="flex-1 min-w-0">
                              <Link href={`/dictionaries/${dict.id}`} className="text-md font-medium text-blue-600 hover:underline block">
                                {/* แสดง title ของ dictionary */}
                                {dict.title}
                              </Link>
                              <div className="flex flex-wrap items-center mt-1 gap-2">
                                {/* แสดงจำนวนรายการ */}
                                {dict.entryCount > 0 && (
                                  <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded">
                                    {dict.entryCount} รายการ
                                  </span>
                                )}
                                {/* แสดงปีที่เผยแพร่ */}
                                {dict.year_published && (
                                  <span className="text-xs text-gray-500">
                                    ปี {dict.year_published}
                                  </span>
                                )}
                              </div>
                              {/* ปุ่ม Export สำหรับแต่ละเล่ม */}
                              {
                                dict.entryCount > 0 && 
                                <div className="flex flex-wrap gap-2 mt-2">
                                  <button
                                    // ส่ง dict object แทน dict.id
                                    onClick={() => handlePreview(dict.id)}
                                    className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-blue-500"
                                    // ปิดการใช้งานปุ่มถ้าไม่มีรายการ
                                    disabled={dict.entryCount <= 0}
                                  >
                                    <svg className="mr-1 h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                      <path d="M18.808 2H5.192A2.192 2.192 0 0 0 3 4.192v15.616A2.192 2.192 0 0 0 5.192 22h13.616A2.192 2.192 0 0 0 21 19.808V4.192A2.192 2.192 0 0 0 18.808 2zM5.192 4h13.616c.107 0 .192.085.192.192v8.616L16.616 15H7.384L5 12.808V4.192C5 4.085 5.085 4 5.192 4z"/>
                                      <path d="M16.5 16.5h-9a.5.5 0 0 0-.5.5v2a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-2a.5.5 0 0 0-.5-.5z"/>
                                      <path d="M10 8h4a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-1v1h1a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1h1v-1h-1a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/>
                                    </svg>
                                    Preview
                                  </button>
                                  {/*
                                  <button
                                    // ส่ง dict object แทน dict.id
                                    onClick={() => handleExportDocx(dict.id)}
                                    className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-blue-500"
                                    // ปิดการใช้งานปุ่มถ้าไม่มีรายการ
                                    disabled={dict.entryCount <= 0}
                                  >
                                    <svg className="mr-1 h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                      <path d="M18.808 2H5.192A2.192 2.192 0 0 0 3 4.192v15.616A2.192 2.192 0 0 0 5.192 22h13.616A2.192 2.192 0 0 0 21 19.808V4.192A2.192 2.192 0 0 0 18.808 2zM5.192 4h13.616c.107 0 .192.085.192.192v8.616L16.616 15H7.384L5 12.808V4.192C5 4.085 5.085 4 5.192 4z"/>
                                      <path d="M16.5 16.5h-9a.5.5 0 0 0-.5.5v2a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-2a.5.5 0 0 0-.5-.5z"/>
                                      <path d="M10 8h4a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-1v1h1a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1h1v-1h-1a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/>
                                    </svg>
                                    DOCX
                                  </button>
                                  */}
                                  <button
                                    // ส่ง dict object แทน dict.id
                                    onClick={() => handleExportPdf(dict.id)}
                                    className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-red-500"
                                    // ปิดการใช้งานปุ่มถ้าไม่มีรายการ
                                    disabled={dict.entryCount <= 0}
                                  >
                                    <svg className="mr-1 h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                      <path d="M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 2v4h8V4H8zm0 6v2h8v-2H8zm0 4v6h8v-6H8z"/>
                                    </svg>
                                    PDF
                                  </button>
                                  
                                </div>
                              }
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}