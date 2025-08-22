// src/app/api/file-manager/upload-taxonomy/route.tsx
import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';

export const runtime = 'nodejs';

function bytesToHuman(n: number) {
  if (!Number.isFinite(n)) return `${n}`;
  const mb = n / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

async function getPrismaSafe() {
  try {
    // Adjust the import path to your project setup if needed
    const mod = await import('@/lib/prisma');
    return (mod as any).prisma as any;
  } catch {
    try {
      const mod = await import('../../../lib/prisma');
      return (mod as any).prisma as any;
    } catch {
      return null;
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const commit = searchParams.get('commit') === '1';
    const taxonomyTitle = searchParams.get('title') || 'อนุกรมวิธานพืช (อัปโหลดจาก DOCX)';
    const taxonomyDomain = searchParams.get('domain') || 'พืช';

    const form = await req.formData();
    const f = form.get('file');
    if (!f || !(f instanceof File)) {
      return NextResponse.json({ ok: false, error: 'ไม่พบไฟล์สำหรับอัปโหลด (field: file)' }, { status: 400 });
    }

    // Validate file
    const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
    if (f.size > MAX_FILE_SIZE) {
      return NextResponse.json({ ok: false, error: `ไฟล์มีขนาดใหญ่เกิน ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)} MB` }, { status: 400 });
    }
    const okExt = /\.docx$/i.test(f.name);
    const okMime = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream',
      ''
    ].includes(f.type);
    if (!okExt && !okMime) {
      return NextResponse.json({ ok: false, error: 'รองรับเฉพาะไฟล์ .docx (Microsoft Word)' }, { status: 400 });
    }

    // Convert to HTML via mammoth
    const buffer = Buffer.from(await f.arrayBuffer());

    const styleMap = [
      "p[style-name='Title'] => h1:fresh",
      "p[style-name='Heading 1'] => h2:fresh",
      "p[style-name='Heading 2'] => h3:fresh",
      "p[style-name='Heading 3'] => h4:fresh",
      // Keep tables, lists & inline formats by default
    ];

    const { value: html, messages } = await mammoth.convertToHtml({ buffer }, { styleMap });
    const { value: rawText } = await mammoth.extractRawText({ buffer });

    const htmlOut = html || '';
    const rawOut = (rawText || '').trim();

    // For demo: import as a single Taxon, using file name as the scientific name
    const sections = [
      {
        title: f.name.replace(/\.docx$/i, ''),
        html: htmlOut,
        text: rawOut,
      },
    ];

    let savedTaxonomyId: number | null = null;
    const created: Array<{ id: number; scientificName: string }> = [];
    let saveError: string | null = null;

    if (commit) {
      const prisma = await getPrismaSafe();
      if (!prisma) {
        saveError = 'Prisma client ไม่พร้อมใช้งานในสภาพแวดล้อมนี้';
      } else {
        try {
          // Ensure a taxonomy record exists
          let taxonomy = await prisma.taxonomy.findFirst({ where: { title: taxonomyTitle } });
          if (!taxonomy) {
            // Some schemas require a non-null domain
            taxonomy = await prisma.taxonomy.create({ data: { title: taxonomyTitle, domain: taxonomyDomain } });
          }
          savedTaxonomyId = taxonomy.id;

          for (const sec of sections) {
            // Build minimal taxon payload
            const base: any = {
              taxonomyId: taxonomy.id,
              scientificName: sec.title,
            };
            // Try to set rank if enum exists
            try { base.rank = 'UNRANKED'; } catch {}

            // We want to store HTML — try common field names defensively.
            const htmlFieldCandidates = ['contentHtml', 'descriptionHtml', 'content_html', 'html'];
            let createdTaxon = null;
            for (let i = 0; i < htmlFieldCandidates.length; i++) {
              const field = htmlFieldCandidates[i];
              try {
                const dataTry: any = { ...base, [field]: sec.html };
                createdTaxon = await prisma.taxon.create({ data: dataTry });
                break; // success
              } catch (e: any) {
                // Unknown argument – try next field name
                if (i === htmlFieldCandidates.length - 1) throw e;
              }
            }
            if (!createdTaxon) {
              // As a last resort, create without the HTML field
              createdTaxon = await prisma.taxon.create({ data: base });
              // and then try to update with an HTML field name
              const htmlFieldCandidates2 = ['contentHtml', 'descriptionHtml', 'content_html', 'html'];
              for (const fName of htmlFieldCandidates2) {
                try {
                  await prisma.taxon.update({ where: { id: createdTaxon.id }, data: { [fName]: sec.html } as any });
                  break;
                } catch {/* ignore and try next */}
              }
            }
            created.push({ id: createdTaxon.id, scientificName: createdTaxon.scientificName });
          }
        } catch (e: any) {
          saveError = e?.message || 'ไม่สามารถบันทึกลงฐานข้อมูลได้';
        }
      }
    }

    const excerpt = htmlOut.length > 4000 ? htmlOut.slice(0, 4000) + '\n<!-- …truncated… -->' : htmlOut;

    return NextResponse.json({
      ok: true,
      message: commit
        ? (saveError ? 'อัปโหลดสำเร็จ แต่บันทึกฐานข้อมูลไม่สำเร็จ' : 'อัปโหลดและบันทึกสำเร็จ')
        : 'อัปโหลดสำเร็จ (ยังไม่ได้บันทึกลงฐานข้อมูล — ส่ง commit=1 เพื่อบันทึก)',
      file: {
        name: f.name,
        size: f.size,
        sizeHuman: bytesToHuman(f.size),
        type: f.type || 'unknown',
      },
      stats: {
        paragraphs: (rawOut.match(/\n\n/g) || []).length + 1,
        htmlLength: htmlOut.length,
        sections: sections.length,
        messages: messages?.length || 0,
      },
      previewHtml: excerpt,
      commit,
      savedTaxonomyId,
      created,
      error: saveError || undefined,
    });
  } catch (err: any) {
    console.error('Upload taxonomy error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'Unexpected error' }, { status: 500 });
  }
}

// src/app/file-manager/upload-taxonomy/page.tsx
'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

type ApiResult = {
  ok?: boolean;
  message?: string;
  error?: string;
  count?: number;
  details?: any;
};

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB

export default function UploadTaxonomyPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const humanSize = useMemo(() => {
    if (!file) return '';
    const mb = file.size / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  }, [file]);

  const onPick = (f?: File) => {
    setResult(null);
    setError(null);
    setProgress(0);
    if (!f) return;
    setFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onPick(f);
  };

  const onBrowseClick = () => inputRef.current?.click();

  const validateFile = useCallback((f: File) => {
    if (f.size > MAX_FILE_SIZE) {
      return `ไฟล์มีขนาดใหญ่เกิน ${ (MAX_FILE_SIZE / (1024*1024)).toFixed(0) } MB`;
    }
    // allow common docx mime + empty (some browsers)
    const okExt = /\.docx$/i.test(f.name);
    const okMime = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream',
      ''
    ].includes(f.type);
    if (!okExt && !okMime) return 'กรุณาอัปโหลดไฟล์ .docx (Microsoft Word)';
    return null;
  }, []);

  const uploadWithProgress = useCallback(async (f: File) => {
    const err = validateFile(f);
    if (err) {
      setError(err);
      return;
    }
    const fd = new FormData();
    fd.append('file', f);
    // หมายเหตุ: endpoint ฝั่งเซิร์ฟเวอร์จะจัดการ schema taxonomy เอง
    // ถ้าจำเป็นต้องส่งพารามิเตอร์อื่น ๆ สามารถเพิ่มลงใน form-data ได้ที่นี่

    setUploading(true);
    setProgress(0);
    setError(null);
    setResult(null);

    await new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/file-manager/upload-taxonomy?commit=1');
      xhr.responseType = 'json';
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const p = Math.round((e.loaded / e.total) * 100);
          setProgress(p);
        }
      };
      xhr.onload = () => {
        try {
          const data = xhr.response ?? JSON.parse(xhr.responseText ?? '{}');
          setResult(data);
          if (!data || data.error) setError(data?.error || 'ไม่สามารถประมวลผลไฟล์ได้');
        } catch {
          setError('การอัปโหลดสำเร็จ แต่ไม่สามารถอ่านผลลัพธ์ได้');
        } finally {
          setUploading(false);
          resolve();
        }
      };
      xhr.onerror = () => {
        setError('อัปโหลดล้มเหลว กรุณาลองใหม่');
        setUploading(false);
        resolve();
      };
      xhr.send(fd);
    });
  }, [validateFile]);

  return (
    <div className="page-shell fullwidth">
      <header className="section-header">
        <h1 className="section-title">นำเข้า “อนุกรมวิธาน (Taxonomy)”</h1>
        <p className="section-subtitle">
          รองรับไฟล์ Microsoft Word (.docx) ขนาดไม่เกิน 200MB — ระบบจะอ่านโครงสร้างเพื่อนำเข้าข้อมูลลงสคีมา Taxonomy
        </p>
      </header>

      <section className="brand-card p-6 mb-6">
        <div
          className={`uploader ${dragOver ? 'is-dragover' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          role="button"
          aria-label="อัปโหลดไฟล์อนุกรมวิธาน (.docx)"
          tabIndex={0}
        >
          <div className="uploader-cta">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 16a1 1 0 0 1-1-1V9.41l-1.3 1.3a1 1 0 1 1-1.4-1.42l3-3a1 1 0 0 1 1.4 0l3 3a1 1 0 1 1-1.4 1.42L13 9.4V15a1 1 0 0 1-1 1Z"/>
              <path d="M5 20a3 3 0 0 1-3-3v-1a1 1 0 1 1 2 0v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1a1 1 0 1 1 2 0v1a3 3 0 0 1-3 3H5Z"/>
            </svg>
            <div className="mt-2">
              <strong>ลากไฟล์ .docx มาวาง</strong> หรือ{' '}
              <button type="button" className="link" onClick={onBrowseClick}>เลือกไฟล์จากเครื่อง</button>
            </div>
            <div className="text-sm text-gray-600 mt-1">
              รองรับ .docx เท่านั้น • สูงสุด 200MB
            </div>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            onChange={(e) => onPick(e.target.files?.[0] || null)}
          />
        </div>

        {file && (
          <div className="mt-4 flex items-center justify-between rounded-md border border-border bg-white p-3">
            <div>
              <div className="font-medium">{file.name}</div>
              <div className="text-sm text-gray-600">{humanSize} • {file.type || 'unknown/—'}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="btn-secondary btn--sm"
                onClick={() => { setFile(null); setResult(null); setError(null); setProgress(0); }}
                disabled={uploading}
              >
                ลบไฟล์
              </button>
              <button
                className="btn-primary btn--sm"
                onClick={() => file && uploadWithProgress(file)}
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <svg className="spin h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Zm7.07 3.93a1 1 0 0 1 0 1.41l-1.42 1.42a1 1 0 0 1-1.41-1.41l1.41-1.42a1 1 0 0 1 1.42 0ZM21 11a1 1 0 1 1 0 2h-2a1 1 0 1 1 0-2h2ZM6.76 5.34a1 1 0 0 1 1.41 0l1.42 1.41A1 1 0 1 1 8.17 8.17L6.76 6.76a1 1 0 0 1 0-1.42ZM4 11a1 1 0 1 1 0 2H2a1 1 0 1 1 0-2h2Zm2.76 8.66a1 1 0 0 1-1.41 0l-1.42-1.41A1 1 0 1 1 5.34 16.83l1.41 1.42a1 1 0 0 1 0 1.41ZM12 19a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0v-2a1 1 0 0 1 1-1Zm8.24-1.76a1 1 0 0 1-1.41 1.41l-1.42-1.41a1 1 0 0 1 1.41-1.41l1.42 1.41Z"/></svg>
                    &nbsp;กำลังอัปโหลด…
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M5 20a3 3 0 0 1-3-3v-1a1 1 0 1 1 2 0v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1a1 1 0 1 1 2 0v1a3 3 0 0 1-3 3H5Zm6-4a1 1 0 0 1-1-1V9.41l-1.3 1.3a1 1 0 1 1-1.4-1.42l3-3a1 1 0 0 1 1.4 0l3 3a1 1 0 1 1-1.4 1.42L13 9.4V15a1 1 0 0 1-1 1Z"/></svg>
                    &nbsp;อัปโหลดไฟล์
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {uploading && (
          <div className="mt-4">
            <div className="progress">
              <div className="progress__bar" style={{ width: `${progress}%` }} />
            </div>
            <div className="text-center text-sm mt-1">{progress}%</div>
          </div>
        )}

        {error && (
          <div className="alert alert--danger mt-4" role="alert">
            <strong>ผิดพลาด:</strong> {error}
          </div>
        )}
      </section>

      {/* ผลลัพธ์จาก API */}
      <section className="brand-card p-6">
        <h2 className="text-lg font-bold mb-3">ผลการประมวลผล</h2>
        {!result && <p className="text-gray-600">อัปโหลดไฟล์เพื่อดูผลลัพธ์ที่นี่</p>}
        {result && (
          <>
            {result.message && <p className="mb-2">{result.message}</p>}
            {typeof result.count === 'number' && (
              <p className="text-sm text-gray-700 mb-3">จำนวนที่นำเข้าได้: <strong>{result.count}</strong></p>
            )}
            <div className="code-scroll">
              <pre className="code-pre">{JSON.stringify(result, null, 2)}</pre>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/* --- lightweight page styles (rely on globals.css tokens) --- */
