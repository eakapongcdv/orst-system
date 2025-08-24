// src/app/api/file-manager/upload-taxonomy/route.tsx
import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';
import { PrismaClient } from '@prisma/client';
import { JSDOM } from 'jsdom';
import { createRequire } from 'module';

const prisma = new PrismaClient();
export const runtime = 'nodejs';

class ModuleMissingError extends Error {
  status: number;
  code: string;
  module?: string;
  constructor(moduleName: string, message: string, status = 400) {
    super(message);
    this.name = 'ModuleMissingError';
    this.code = 'MODULE_MISSING';
    this.status = status;
    this.module = moduleName;
  }
}

function bytesToHuman(n: number) {
  if (!Number.isFinite(n)) return `${n}`;
  const mb = n / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

function isBlobLike(x: any): x is { arrayBuffer: () => Promise<ArrayBuffer>; type?: string; size?: number; name?: string } {
  return x && typeof x === 'object' && typeof (x as any).arrayBuffer === 'function';
}

function collapseDuplicateThaiVowels(s: string): string {
  // บีบเครื่องหมายสระและวรรณยุกต์ไทยที่ซ้ำกันให้เหลือ 1 ตัว
  // ครอบคลุม: ิ ี ึ ื ุ ู ั ็ ่ ้ ๊ ๋ ์ ํ ะ า ำ
  return s.replace(/([\u0E31\u0E34-\u0E3A\u0E47-\u0E4D\u0E48-\u0E4B\u0E30\u0E32\u0E33])\1+/g, '$1');
}

// --- เพิ่ม mapping สำหรับ clean text ---
const THAI_GLYPH_CLEANUP_MAP: [RegExp, string | ((...args: string[]) => string)][] = [
  // แทนที่ "ชื่?อพ้?อง" ด้วย "ชื่อพ้อง"
  [/ชื่(.)อพ(.)ง/u, () => 'ชื่อพ้อง'],
  // แทนที่ "ผู้?เขียน" ด้วย "ผู้เขียน"
  [/ผู(.)เขียน/u, () => 'ผู้เขียน'],
  // แทนที่ "วงศ์?" ด้วย "วงศ์" (กรณี ? อยู่ท้าย)
  [/วงศ์(.)/u, () => 'วงศ์'],
  // แทนที่ "ชื่?ออ่?น" ด้วย "ชื่ออื่น"
  [/ชื่(.)ออ่(.)/u, () => 'ชื่ออื่น'],
  // แทนที่ "ตอ่งเข้?ม้" ด้วย "ตอ่งเข้ม้"
  [/ตอ่งเข้(.)/u, () => 'ตอ่งเข้ม้'],
  // แทนที่ "ลี้?าจา" ด้วย "ลี้าจา"
  [/ลี้(.)/u, () => 'ลี้าจา'],
  // แทนที่ "ไม้?ม้ี" ด้วย "ไม่มี"
  [/ไม้(.)/u, () => 'ไม่มี'],
  // แทนที่ "ด้านลี้?าง" ด้วย "ด้านล่าง"
  [/ลี้(.)/u, (match, p1) => {
    // ป้องกันการแทนที่ผิด เช่น "ลี้้ม" -> "ล่าง้"
    // สมมุติว่าถ้าตัวถัดไปเป็น "า" ให้แทนที่ "ลี้" -> "ล่าง"
    // หรือจะ hardcode ตาม context ที่พบ
    // ตัวอย่างง่าย: ถ้า match "ลี้า" ให้เปลี่ยนเป็น "ล่างา"
    // แต่เพื่อความปลอดภัย ควร hardcode ชุดที่พบ
    // สมมุติว่า "ด้านลี้า" เป็น "ด้านล่างา" ซึ่งไม่ถูกต้อง
    // ดังนั้นควร map ทั้ง "ด้านลี้า" -> "ด้านล่างา" หรือ "ด้านลี้าง" -> "ด้านล่าง"
    // ลอง map แบบเฉพาะเจาะจง
    if (match.includes('ลี้าง')) return match.replace('ลี้าง', 'ล่าง');
    // หรือ map ทั่วไป ถ้า context ไม่ชัดเจน
    return 'ล่าง'; // อาจไม่ถูกต้องเสมอไป ควรปรับเพิ่มเติมตามข้อมูล
  }],
  // เพิ่ม mapping อื่นๆ ตามที่พบใน PDF ได้
  // ตัวอย่าง: แก้ไข "ต้นข้าวต?ม้" -> "ต้นข้าวต้ม้"
  [/ต้นข้าวต(.)ม้/u, () => 'ต้นข้าวต้ม้'],
  // แก้ไข "ม้ี" -> "มี" (กรณีทั่วไป)
  [/ม(.)ี/u, (match, p1) => {
    if (p1 === '้') return 'มี';
    return match; // ถ้าไม่ใช่ ้ ให้คืนค่าเดิม
  }],
  // แก้ไข "สูี" -> "สี"
  [/สู(.)ี/u, (match, p1) => {
    if (p1 === '้') return 'สี';
    return match;
  }],
  // แก้ไข "ข้้าง" -> "ข้าง"
  [/ข(.)้าง/u, (match, p1) => {
    if (p1 === '้') return 'ข้าง';
    return match;
  }],
  // แก้ไข "เข้ียว" -> "เขียว"
  [/เข(.)ียว/u, (match, p1) => {
    if (p1 === '้') return 'เขียว';
    return match;
  }],
  // แก้ไข "อ่อ่น" -> "อ่อน" (กรณีที่  แทน ่ และ  แทน ่ หรือ ้)
  // ใช้ regex ที่กว้างขึ้นเพื่อจับรูปแบบ
  [/([ก-ฮ])่(.)อ([ก-ฮ])/u, (match, c1, p1, c2) => {
    // สมมุติว่า ่ +  แทน ่ + ้ หรือ ่ + ่
    // ตัวอย่างง่าย: ถ้าเจอ ่ + อ ให้เปลี่ยนเป็น ่ + อ
    // แต่ถ้า p1 เป็นอักขระแปลก ให้สมมุติว่าเป็น ่ + ้
    // เพื่อความปลอดภัย ควร map ชุดที่พบ
    // สมมุติ "อ่อ" เป็น "่อ้" หรือ "่อ่"
    // ลอง hardcode ชุดที่พบ
    // ตัวอย่าง: "อ่อ" -> "่อ้"
    // แต่ regex นี้ไม่ดีพอ ควรใช้ string replace แทน
    // ดังนั้น ใช้ string replace ด้านล่างแทน regex นี้
    return match; // ยกเลิก regex นี้ ใช้ string replace แทน
  }],
  // เพิ่มเติม: ใช้ string replace สำหรับรูปแบบที่พบบ่อย
];

// --- ปรับปรุง normThaiBasic ---
function normThaiBasic(s: string): string {
  // console.log('[DEBUG] normThaiBasic - Input:', s?.slice(0, 100)); // ปิด log นี้เพื่อไม่ให้ verbose
  // 1. Normalize
  let result = (s || '').normalize('NFC');

  // 2. แทนที่ Non-breaking space
  result = result.replace(/\u00A0/g, ' ');

  // 3. ลบ zero-width characters
  result = result.replace(/[\u200B-\u200D\uFEFF]/g, '');

  // 4. ลบ U+FFFD (แทนที่ด้วย placeholder ชั่วคราวเพื่อ clean หรือจะลบเลยก็ได้)
  // ถ้าเลือกลบเลย: result = result.replace(/\uFFFD/g, '');
  // ถ้าเลือกแทนที่ชั่วคราวเพื่อ clean:
  result = result.replace(/\uFFFD/g, '?');

  // 5. --- เพิ่มขั้นตอน CLEAN UP ข้อความที่มี ? ---
  // ใช้ string replace แทน regex เพื่อความแม่นยำ
  // แทนที่ "อ่อ" -> "่อ้" (ตัวอย่าง)
  result = result.replace(/อ่\?อ/g, '่อ้');
  result = result.replace(/อ่\?น/g, '่อน');
  result = result.replace(/เ\?็/g, '็');
  result = result.replace(/เ\?ิ/g, 'ิ');
  result = result.replace(/เ\?ี/g, 'ี');
  result = result.replace(/เ\?ื/g, 'ื');
  result = result.replace(/เ\?ุ/g, 'ุ');
  result = result.replace(/เ\?ู/g, 'ู');
  result = result.replace(/เ\?า/g, 'า');
  result = result.replace(/เ\?ำ/g, 'ำ');
  result = result.replace(/เ\?็/g, '็');
  result = result.replace(/เ\?้/g, '้');
  result = result.replace(/เ\?่/g, '่');
  result = result.replace(/เ\?๊/g, '๊');
  result = result.replace(/เ\?๋/g, '๋');
  result = result.replace(/เ\?์/g, '์');
  result = result.replace(/เ\?ํ/g, 'ํ');
  result = result.replace(/เ\?ะ/g, 'ะ');

  // แทนที่ "ชื่?อ" -> "ชื่อ"
  result = result.replace(/ชื่\?อ/g, 'ชื่อ');
  // แทนที่ "พ้?อง" -> "พ้อง"
  result = result.replace(/พ้\?อง/g, 'พ้อง');
  // แทนที่ "ผู้?เขียน" -> "ผู้เขียน"
  result = result.replace(/ผู้\?เขียน/g, 'ผู้เขียน');
  // แทนที่ "วงศ์?" -> "วงศ์"
  result = result.replace(/วงศ์\?/g, 'วงศ์');
  // แทนที่ "ชื่?ออ่?น" -> "ชื่ออื่น"
  result = result.replace(/ชื่\?ออ่\?น/g, 'ชื่ออื่น');
  // แทนที่ "ตอ่งเข้?ม้" -> "ตอ่งเข้ม้"
  result = result.replace(/ตอ่งเข้\?ม้/g, 'ตอ่งเข้ม้');
  // แทนที่ "ลี้?าจา" -> "ลี้าจา"
  result = result.replace(/ลี้\?าจา/g, 'ลี้าจา');
  // แทนที่ "ไม้?ม้ี" -> "ไม่มี"
  result = result.replace(/ไม้\?ม/g, 'ไม่ม'); // แก้ไขบางส่วน
  result = result.replace(/ม\?ี/g, 'มี');
  // แทนที่ "ด้านลี้?าง" -> "ด้านล่าง"
  result = result.replace(/ด้านลี้\?าง/g, 'ด้านล่าง');
  // แทนที่ "ต้นข้าวต?ม้" -> "ต้นข้าวต้ม้"
  result = result.replace(/ต้นข้าวต\?ม้/g, 'ต้นข้าวต้ม้');
  // แทนที่ "สู?ี" -> "สี"
  result = result.replace(/สู\?ี/g, 'สี');
  // แทนที่ "ข้?าง" -> "ข้าง"
  result = result.replace(/ข้\?าง/g, 'ข้าง');
  // แทนที่ "เข้?ยว" -> "เขียว"
  result = result.replace(/เข้\?ยว/g, 'เขียว');
  // แทนที่ "อ่?อ" -> "่อ้"
  result = result.replace(/อ่\?อ/g, '่อ้');
  // แทนที่ "อ่?น" -> "่อน"
  result = result.replace(/อ่\?น/g, '่อน');
  // แทนที่ "อ่?ม" -> "่อม"
  result = result.replace(/อ่\?ม/g, '่อม');
  // แทนที่ "เ?็" -> "็"
  result = result.replace(/เ\?็/g, '็');
  // แทนที่ "เ?ิ" -> "ิ"
  result = result.replace(/เ\?ิ/g, 'ิ');
  // แทนที่ "เ?ี" -> "ี"
  result = result.replace(/เ\?ี/g, 'ี');
  // แทนที่ "เ?ื" -> "ื"
  result = result.replace(/เ\?ื/g, 'ื');
  // แทนที่ "เ?ุ" -> "ุ"
  result = result.replace(/เ\?ุ/g, 'ุ');
  // แทนที่ "เ?ู" -> "ู"
  result = result.replace(/เ\?ู/g, 'ู');
  // แทนที่ "เ?า" -> "า"
  result = result.replace(/เ\?า/g, 'า');
  // แทนที่ "เ?ำ" -> "ำ"
  result = result.replace(/เ\?ำ/g, 'ำ');
  // แทนที่ "เ?้" -> "้"
  result = result.replace(/เ\?้/g, '้');
  // แทนที่ "เ?่" -> "่"
  result = result.replace(/เ\?่/g, '่');
  // แทนที่ "เ?๊" -> "๊"
  result = result.replace(/เ\?๊/g, '๊');
  // แทนที่ "เ?๋" -> "๋"
  result = result.replace(/เ\?๋/g, '๋');
  // แทนที่ "เ?์" -> "์"
  result = result.replace(/เ\?์/g, '์');
  // แทนที่ "เ?ํ" -> "ํ"
  result = result.replace(/เ\?ํ/g, 'ํ');
  // แทนที่ "เ?ะ" -> "ะ"
  result = result.replace(/เ\?ะ/g, 'ะ');
  // แทนที่ "เ?็" -> "็"
  result = result.replace(/เ\?็/g, '็');
  // แทนที่ "เ?ิ" -> "ิ"
  result = result.replace(/เ\?ิ/g, 'ิ');
  // แทนที่ "เ?ี" -> "ี"
  result = result.replace(/เ\?ี/g, 'ี');
  // แทนที่ "เ?ื" -> "ื"
  result = result.replace(/เ\?ื/g, 'ื');
  // แทนที่ "เ?ุ" -> "ุ"
  result = result.replace(/เ\?ุ/g, 'ุ');
  // แทนที่ "เ?ู" -> "ู"
  result = result.replace(/เ\?ู/g, 'ู');
  // แทนที่ "เ?า" -> "า"
  result = result.replace(/เ\?า/g, 'า');
  // แทนที่ "เ?ำ" -> "ำ"
  result = result.replace(/เ\?ำ/g, 'ำ');
  // แทนที่ "เ?้" -> "้"
  result = result.replace(/เ\?้/g, '้');
  // แทนที่ "เ?่" -> "่"
  result = result.replace(/เ\?่/g, '่');
  // แทนที่ "เ?๊" -> "๊"
  result = result.replace(/เ\?๊/g, '๊');
  // แทนที่ "เ?๋" -> "๋"
  result = result.replace(/เ\?๋/g, '๋');
  // แทนที่ "เ?์" -> "์"
  result = result.replace(/เ\?์/g, '์');
  // แทนที่ "เ?ํ" -> "ํ"
  result = result.replace(/เ\?ํ/g, 'ํ');
  // แทนที่ "เ?ะ" -> "ะ"
  result = result.replace(/เ\?ะ/g, 'ะ');

  // ลูปผ่าน THAI_GLYPH_CLEANUP_MAP สำหรับ regex ที่ซับซ้อนกว่า
  for (const [pattern, replacement] of THAI_GLYPH_CLEANUP_MAP) {
    if (typeof replacement === 'function') {
      result = result.replace(pattern, replacement);
    } else {
      result = result.replace(pattern, replacement);
    }
  }
  // --- สิ้นสุดการ clean up ---

  // 6. ลบ space ซ้ำ
  result = result.replace(/\s+/g, ' ');

  // 7. trim
  result = result.trim();

  // 8. บีบสระซ้ำ (ควรทำหลังสุด)
  result = collapseDuplicateThaiVowels(result);

  // console.log('[DEBUG] normThaiBasic - Output:', result?.slice(0, 100));
  return result;
}


function stripHtmlToText(html: string): string {
  try {
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
    return dom.window.document.body.textContent?.replace(/\s+/g, ' ').trim() || '';
  } catch {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

function escapeHtml(s: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '<', '>': '>', '"': '&quot;', "'": '&#39;' };
  return (s || '').replace(/[&<>"']/g, (ch) => map[ch]);
}

function textToHtmlParagraphs(text: string): string {
  const parts = (text || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n');
}

// Convert plain text extracted from PDF into a more structured HTML
function pdfTextToHtmlAdvanced(raw: string): string {
  console.log('[DEBUG] pdfTextToHtmlAdvanced - Input raw text length:', raw.length);
  const src = (raw || '').replace(/\r\n?/g, '\n');
  const lines = src.split('\n').map((l) => normThaiBasic(l));
  const blocks: Array<{ type: 'p' | 'ul' | 'ol' | 'label'; text?: string; items?: string[]; label?: string; value?: string }> = [];
  const isBlank = (s: string) => !s || !s.trim();
  const BULLET_RE = /^\s*[•\-–—▪●]\s+(.*)$/u;
  const ORDERED_RE = /^\s*(\d+|[๐-๙]+)[\.)]\s+(.*)$/u;

  const LABEL_PATTERNS: Array<{ label: string; re: RegExp }> = [
    { label: 'ชื่อวิทยาศาสตร์', re: /^\s*ชื่อ\s*วิทยาศาสตร์\s*[:\-–—]?\s*(.+)$/u },
    { label: 'ชื่อสกุล', re: /^\s*ชื่อ\s*สกุล\s*[:\-–—]?\s*(.+)$/u },
    { label: 'คำระบุชนิด', re: /^\s*คำ\s*ระบุ\s*ชนิด\s*[:\-–—]?\s*(.+)$/u },
    { label: 'ชื่อพ้อง', re: /^\s*ชื่อ\s*พ้อง\s*[:\-–—]?\s*(.+)$/u },
    { label: 'ชื่ออื่น ๆ', re: /^\s*ชื่อ\s*อื่น(?:\s*ๆ)?\s*[:\-–—]?\s*(.+)$/u },
    { label: 'วงศ์', re: /^\s*วงศ์\s*[:\-–—]?\s*(.+)$/u },
    { label: 'ผู้เขียนคำอธิบาย', re: /^\s*ผู้\s*เขียน\s*คำ\s*อธิบาย\s*[:\-–—]?\s*(.+)$/u },
    { label: 'ชื่อผู้ตั้งพรรณพืช', re: /^\s*ชื่อ\s*ผู้\s*ตั้ง\s*พรรณ\s*พืช\s*[:\-–—]?\s*(.+)$/u },
    { label: 'ช่วงเวลาเกี่ยวกับผู้ตั้งพรรณพืช', re: /^\s*ช่วง\s*เวลา\s*เกี่ยวกับ\s*ผู้\s*ตั้ง\s*พรรณ\s*พืช\s*[:\-–—]?\s*(.+)$/u },
  ];

  const matchLabel = (line: string): { label: string; value: string } | null => {
    for (const p of LABEL_PATTERNS) {
      const m = line.match(p.re);
      if (m) return { label: p.label, value: m[1] || '' };
    }
    return null;
  };

  let i = 0;
  while (i < lines.length) {
    if (isBlank(lines[i])) { i++; continue; }

    // Bullet list block
    if (BULLET_RE.test(lines[i])) {
      const items: string[] = [];
      while (i < lines.length && BULLET_RE.test(lines[i])) {
        items.push(lines[i].replace(BULLET_RE, '$1').trim());
        i++;
      }
      if (items.length) blocks.push({ type: 'ul', items });
      continue;
    }

    // Ordered list block
    if (ORDERED_RE.test(lines[i])) {
      const items: string[] = [];
      while (i < lines.length && ORDERED_RE.test(lines[i])) {
        items.push(lines[i].replace(ORDERED_RE, '$2').trim());
        i++;
      }
      if (items.length) blocks.push({ type: 'ol', items });
      continue;
    }

    // Labeled paragraph
    const ml = matchLabel(lines[i]);
    if (ml) {
      let val = ml.value.trim();
      let j = i + 1;
      while (
        j < lines.length &&
        !isBlank(lines[j]) &&
        !BULLET_RE.test(lines[j]) &&
        !ORDERED_RE.test(lines[j]) &&
        !matchLabel(lines[j])
      ) {
        val += ' ' + lines[j].trim();
        j++;
      }
      blocks.push({ type: 'label', label: ml.label, value: val });
      i = j;
      continue;
    }

    // Regular paragraph
    let para = lines[i].trim();
    let j = i + 1;
    while (
      j < lines.length &&
      !isBlank(lines[j]) &&
      !BULLET_RE.test(lines[j]) &&
      !ORDERED_RE.test(lines[j]) &&
      !matchLabel(lines[j])
    ) {
      para += ' ' + lines[j].trim();
      j++;
    }
    blocks.push({ type: 'p', text: para });
    i = j;
  }

  // Render blocks to HTML
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === 'p') out.push(`<p>${escapeHtml(b.text || '')}</p>`);
    else if (b.type === 'label') out.push(`<p><strong>${escapeHtml(b.label || '')}</strong> ${escapeHtml(b.value || '')}</p>`);
    else if (b.type === 'ul') out.push(`<ul>${(b.items || []).map(it => `<li>${escapeHtml(it)}</li>`).join('')}</ul>`);
    else if (b.type === 'ol') out.push(`<ol>${(b.items || []).map(it => `<li>${escapeHtml(it)}</li>`).join('')}</ol>`);
  }

  const resultHtml = out.join('\n');
  console.log('[DEBUG] pdfTextToHtmlAdvanced - Generated HTML length:', resultHtml.length);
  console.log('[DEBUG] pdfTextToHtmlAdvanced - Number of blocks:', blocks.length);
  console.log('[DEBUG] pdfTextToHtmlAdvanced - First 3 blocks:', JSON.stringify(blocks.slice(0, 3), null, 2));

  // Fallback: หากไม่มี block ใดเลย ให้ใส่ข้อความดิบเป็น <p>
  if (out.length === 0) {
    const fallbackText = normThaiBasic(raw).slice(0, 500);
    if (fallbackText.trim()) {
      out.push(`<p>[ไม่สามารถวิเคราะห์โครงสร้างได้]</p>`);
      out.push(`<p>${escapeHtml(fallbackText)}</p>`);
    } else {
      out.push(`<p>[ไม่มีเนื้อหา]</p>`);
    }
  }

  return out.join('\n');
}

async function persistTaxonHtml(taxonId: number, html: string): Promise<string | null> {
  if (!html || !html.trim()) return null;
  // Try the most likely field first, then fallbacks
  const candidates = ['contentHtml', 'descriptionHtml', 'content_html', 'html'];
  for (const f of candidates) {
    try {
      await prisma.taxon.update({
        where: { id: taxonId },
        data: { [f]: html } as any, // <-- แก้ไข: เพิ่ม 'data:' ตรงนี้
      });
      return f; // success – this field exists and is now populated
    } catch {
      // ignore and try next field name
    }
  }
  return null; // none matched this schema
}

async function loadPdfJs(): Promise<any> {
  let pdfjsLib: any = null;
  const errs: any[] = [];
  try {
    pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch (e1) {
    errs.push(e1);
    try { pdfjsLib = await import('pdfjs-dist/build/pdf.mjs'); } catch (e2) {
      errs.push(e2);
      try { pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js'); } catch (e3) {
        errs.push(e3);
        try { pdfjsLib = await import('pdfjs-dist'); } catch (e4) { errs.push(e4); }
      }
    }
  }
  if (!pdfjsLib) {
    console.error('[upload-taxonomy] pdfjs-dist load failed:', ...errs);
    throw new ModuleMissingError(
      'pdfjs-dist',
      'การนำเข้า PDF ต้องติดตั้งไลบรารี pdfjs-dist (เช่น npm i pdfjs-dist)',
      400
    );
  }

  // Try to resolve worker path for Node; fall back to CDN if not found or on error
  try {
    const req = createRequire(import.meta.url);
    let workerPath: string | null = null;
    try { workerPath = req.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'); } catch {}
    if (!workerPath) { try { workerPath = req.resolve('pdfjs-dist/legacy/build/pdf.worker.js'); } catch {} }
    if (!workerPath) { try { workerPath = req.resolve('pdfjs-dist/build/pdf.worker.mjs'); } catch {} }
    if (!workerPath) { try { workerPath = req.resolve('pdfjs-dist/build/pdf.worker.js'); } catch {} }
    if (workerPath) {
      // pdf.js expects a string URL/path for Node worker
      if (pdfjsLib?.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;
      }
    } else {
      // Fallback to CDN
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
      console.warn('[upload-taxonomy] pdfjs-dist worker path not found locally, falling back to CDN.');
    }
  } catch (ew) {
    // In Node, PDF.js can still run without explicitly setting workerSrc in many builds; fallback to CDN.
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
    console.warn('[upload-taxonomy] pdfjs-dist worker setup error, falling back to CDN.', ew);
  }

  return pdfjsLib;
}

async function extractFromPdfWithPdfjs(buffer: Buffer): Promise<{ html: string; text: string }> {
  console.log('[DEBUG] extractFromPdfWithPdfjs - Starting PDF extraction with pdfjs');
  const pdfjsLib: any = await loadPdfJs();
  // แก้ไขปัญหา: ส่ง Uint8Array แทน Buffer ให้ pdfjs
  const uint8Array = new Uint8Array(buffer);
  const task = pdfjsLib.getDocument({ data: uint8Array });
  const pdf = await task.promise;
  let textRaw = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content: any = await page.getTextContent();
    // Join glyph strings with spaces; add a blank line between pages
    const line = (content.items || [])
      .map((it: any) => {
        const str = (it && typeof it.str === 'string') ? it.str : '';
        return str.trim();
      })
      .filter(Boolean)
      .join(' ');
    textRaw += line + '\n';
  }
  console.log('[DEBUG] extractFromPdfWithPdfjs - Raw extracted text length:', textRaw.length);
  console.log('[DEBUG] extractFromPdfWithPdfjs - First 500 chars of raw text:', textRaw.slice(0, 500));

  const text = normThaiBasic(textRaw);
  console.log('[DEBUG] extractFromPdfWithPdfjs - Text after normThaiBasic length:', text.length);
  console.log('[DEBUG] extractFromPdfWithPdfjs - First 500 chars after normThaiBasic:', text.slice(0, 500));

  const html = pdfTextToHtmlAdvanced(text);
  console.log('[DEBUG] extractFromPdfWithPdfjs - Final HTML length:', html.length);
  return { html, text };
}

async function loadPdfParse(): Promise<(buf: Buffer) => Promise<{ text: string }>> {
  try {
    const m: any = await import('pdf-parse');
    return (m?.default || m) as any;
  } catch (e1) {
    try {
      const m2: any = await import('pdf-parse/lib/pdf-parse.js');
      return (m2?.default || m2) as any;
    } catch (e2) {
      try {
        const req = createRequire(import.meta.url);
        const m3: any = req('pdf-parse');
        return (m3?.default || m3) as any;
      } catch (e3) {
        console.error('[upload-taxonomy] pdf-parse load failed (ESM, path, CJS):', e1, e2, e3);
        throw new ModuleMissingError(
          'pdf-parse',
          'การนำเข้า PDF ต้องติดตั้งไลบรารี pdf-parse (เช่น npm i pdf-parse)',
          400
        );
      }
    }
  }
}

async function extractFromPdf(buffer: Buffer): Promise<{ html: string; text: string }> {
  try {
    return await extractFromPdfWithPdfjs(buffer);
  } catch (e1: any) {
    const msg = String(e1?.message || '');
    const isModuleMissing = (e1 && typeof e1 === 'object' && (e1 as any).code === 'MODULE_MISSING');
    if (!isModuleMissing) {
      console.warn('[upload-taxonomy] pdfjs-dist parse failed, trying pdf-parse fallback:', msg);
    } else {
      console.warn('[upload-taxonomy] pdfjs-dist missing; falling back to pdf-parse.');
    }
  }

  try {
    const pdfParseFn: any = await loadPdfParse();
    const data = await pdfParseFn(buffer);
    const textRaw: string = (data?.text || '').toString();
    const text = normThaiBasic(textRaw);
    const html = pdfTextToHtmlAdvanced(text);
    return { html, text };
  } catch (e2) {
    console.error('[upload-taxonomy] pdf parsing failed (both engines):', e2);
    throw new Error('ไม่สามารถอ่านเนื้อหา PDF ได้: โปรดติดตั้ง pdfjs-dist หรือ pdf-parse และลองใหม่');
  }
}

function normThaiNoSpace(s: string): string {
  return normThaiBasic(s).replace(/\s+/g, '');
}

function thaiKey(s: string): string {
  return normThaiBasic(s).replace(/[\u0E31\u0E34-\u0E4E]/g, '').replace(/\s+/g, '');
}

function extractFirstParagraphHtml(html: string): string | undefined {
  try {
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
    const firstP = dom.window.document.querySelector('p');
    if (!firstP) return undefined;
    return (firstP as any).outerHTML || undefined;
  } catch {
    const m = html.match(/<p>[\s\S]*?<\/p>/i);
    if (m) return m[0];
    const m2 = html.match(/<p[\s\S]*?<\/p>/i);
    return m2 ? m2[0] : undefined;
  }
}

function removeFirstParagraph(html: string): string {
  try {
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
    const { document } = dom.window;
    const firstP = document.querySelector('p');
    if (firstP) firstP.remove();
    return document.body.innerHTML;
  } catch {
    let out = html.replace(/<p[\s\S]*?<\/p>/i, '');
    out = out.replace(/<p>[\s\S]*?<\/p>/i, '');
    return out;
  }
}

function sanitizeEntryContent(
  html: string,
  meta?: { official?: string | null; scientific?: string | null }
): { html: string; text: string } {
  try {
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
    const { document } = dom.window;
    const body = document.body;
    const targetSci = meta?.scientific ? normThaiNoSpace(meta.scientific) : '';
    const targetOfficial = meta?.official ? normThaiNoSpace(meta.official) : '';

    let headerRemoved = false;
    if (targetSci) {
      const headerEl = Array.from(body.children).find((el) => {
        const em = el.querySelector('em');
        if (!em) return false;
        const emNorm = normThaiNoSpace(em.textContent || '');
        const allNorm = normThaiNoSpace(el.textContent || '');
        return (
          emNorm &&
          (targetSci.includes(emNorm) || emNorm.includes(targetSci) || allNorm.includes(targetSci))
        );
      });
      if (headerEl) {
        headerEl.remove();
        headerRemoved = true;
      }
    }

    if (!headerRemoved && targetOfficial) {
      const headerEl2 = Array.from(body.children).find((el) => {
        const st = el.querySelector('strong');
        if (!st) return false;
        const stNorm = normThaiNoSpace(st.textContent || '');
        return !!stNorm && targetOfficial && (stNorm.includes(targetOfficial) || targetOfficial.includes(stNorm));
      });
      if (headerEl2) headerEl2.remove();
    }

    for (const p of Array.from(body.querySelectorAll('p'))) {
      const strong = p.querySelector('strong');
      if (!strong) continue;
      const labelKey = thaiKey(strong.textContent || '');
      const KEY = {
        synonyms: thaiKey('ชื่อพ้อง'),
        other:    thaiKey('ชื่ออื่น'),
        scientific: thaiKey('ชื่อวิทยาศาสตร์'),
        family:   thaiKey('วงศ์'),
      };
      const isSynonymsLabel   = labelKey.startsWith(KEY.synonyms);
      const isOtherNamesLabel = labelKey.startsWith(KEY.other);
      const isScientificLabel = labelKey.startsWith(KEY.scientific);
      const isFamilyLabel     = labelKey.startsWith(KEY.family);
      if (isScientificLabel || isOtherNamesLabel || isFamilyLabel || isSynonymsLabel) {
        p.remove();
        continue;
      }
    }

    const cleanedHtml = body.innerHTML;
    const cleanedText = stripHtmlToText(cleanedHtml);
    return { html: cleanedHtml, text: cleanedText };
  } catch {
    let out = html;
    out = out.replace(/<p>\s*<strong>[\s\S]*?ชื่อ\s*วิทยาศาสตร์[\s\S]*?<\/strong>[\s\S]*?<\/p>/giu, '');
    out = out.replace(/<p>\s*<strong>\s*ชื่อ\s*พ้อง\s*<\/strong>[\s\S]*?<\/p>/giu, '');
    out = out.replace(/<p>\s*<strong>[\s\S]*?ชื่อ\s*อื่น(?:\s*ๆ)?[\s\S]*?<\/strong>[\s\S]*?<\/p>/giu, '');
    out = out.replace(/<p>\s*<strong>[\s\S]*?วงศ์[\s\S]*?<\/strong>[\s\S]*?<\/p>/giu, '');
    out = out.replace(/<p>[\s\S]*?<strong>[\s\S]*?(ชื่อ\s*วิทยาศาสตร์|ชื่อ\s*พ้อง|ชื่อ\s*อื่น(?:\s*ๆ)?|วงศ์)[\s\S]*?<\/strong>[\s\S]*?<\/p>/giu, '');
    return { html: out, text: stripHtmlToText(out) };
  }
}

// ปรับปรุง cleanImportedHtml
function cleanImportedHtml(html: string): string {
  console.log('[DEBUG] cleanImportedHtml - Input HTML length:', html.length);
  try {
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
    const { document } = dom.window;
    const paras = Array.from(document.querySelectorAll('p'));
    for (const p of paras) {
      const text = (p.textContent || '')
        .normalize('NFC')
        .replace(/\u00A0/g, ' ')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\uFFFD/g, '?') // แทนที่ด้วย ? เพื่อให้ regex ทำงานได้
        .replace(/\s+/g, ' ')
        .trim();

      // Pattern 1: lines containing ".indd" often followed by a date/time stamp
      if (/\.indd\b/i.test(text)) {
        p.remove();
        continue;
      }

      // Pattern 2: page number like "<p><strong>12 </strong></p>" (only number in strong)
      if (/^\s*<strong>\s*\d+\s*<\/strong>\s*$/i.test(p.innerHTML)) {
        p.remove();
        continue;
      }
      
      // Pattern 3: lines that are mostly "?" after cleaning (likely corrupted)
      const nonQuestionMarkChars = text.replace(/\?/g, '').length;
      if (text.length > 5 && nonQuestionMarkChars < text.length * 0.3) { // ถ้า > 70% เป็น ?
         p.remove();
         continue;
      }
    }
    const result = document.body.innerHTML;
    console.log('[DEBUG] cleanImportedHtml - Output HTML length:', result.length);
    return result;
  } catch (err) {
    console.error('[DEBUG] cleanImportedHtml - Error, using fallback regex:', err);
    // Fallback: regex remove obvious patterns if DOM parsing fails
    let result = html
      // remove <p><strong>12</strong></p> - only digits in strong
      .replace(/<p>\s*<strong>\s*\d+\s*<\/strong>\s*<\/p>/gi, '')
      .replace(/<p>\s*<strong>\s*\d+\s*<\/strong>\s*<\/p>/gi, '')
      // remove .indd lines
      .replace(/<p>[^<]*\.indd[^<]*<\/p>/gi, '')
      // remove lines that are mostly "?"
      .replace(/<p>([^<]*\?[^<]*){5,}<\/p>/gi, ''); // ถ้ามี ? มากกว่า 5 ตัวใน <p>
      
    console.log('[DEBUG] cleanImportedHtml - Output HTML length (fallback regex):', result.length);
    return result;
  }
}

function elementContainsStrongAuthor(el: Element): boolean {
  const THAI_ANY = '[\\u0E00-\\u0E7F\\s\\u200B\\u200C\\u200D\\uFEFF\\uFFFD]*';
  const STRONG_AUTHOR_RE = new RegExp(
    `^ผู้${THAI_ANY}เขียน(?:\\s*[:\\-–—])?\\s+\\S+`,
    'u'
  );
  const strongNodes: Element[] =
    el.tagName === 'STRONG' ? [el] : Array.from(el.querySelectorAll('strong'));
  for (const s of strongNodes) {
    const text = (s.textContent || '')
      .normalize('NFC')
      .replace(/\u00A0/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\uFFFD/g, '?')
      .replace(/\s+/g, ' ')
      .trim();
    if (STRONG_AUTHOR_RE.test(text)) return true;
  }
  return false;
}

function pickTitleFromChunk(nodes: Element[]): string {
  const isSynonymsLabelEl = (el: Element): boolean => {
    const strong = el.querySelector('strong');
    if (!strong) return false;
    const labelKey = thaiKey(strong.textContent || '');
    return labelKey.startsWith(thaiKey('ชื่อพ้อง'));
  };

  const cutAt = nodes.findIndex(isSynonymsLabelEl);
  const scan = cutAt >= 0 ? nodes.slice(0, cutAt) : nodes;

  const heading = scan.find(n => /H[1-6]/.test(n.tagName));
  if (heading) {
    const t = heading.textContent?.trim();
    if (t) return t;
  }

  for (const n of scan) {
    const st = n.querySelector('strong');
    const t = (st?.textContent || '').trim();
    if (t) return t;
  }

  for (const n of scan) {
    const t = (n.textContent || '').trim();
    if (t) return t.slice(0, 200);
  }

  if (scan.length) {
    const html = serializeNodes(scan);
    const text = stripHtmlToText(html);
    if (text) return text.slice(0, 200);
  }

  return 'หัวข้อ';
}

function serializeNodes(nodes: Element[]): string {
  return nodes.map(n => (n as any).outerHTML || '').join('');
}

// ฟังก์ชันแยก regex สำหรับ family, synonyms, other names, author
function extractFamilyByRegex(html: string): string | undefined {
  const cleaned = normThaiBasic(html);
  // ปรับ regex ให้ทนต่อช่องว่างและอักขระแปลก
  const re = /<p>\s*<strong>\s*วงศ์[^\s<>{}/\\\[\]()]*\s*<\/strong>\s*([\s\S]*?)<\/p>/iu;
  const m = cleaned.match(re);
  if (m) {
    const dom = new JSDOM(`<!doctype html><html><body>${m[1]}</body></html>`);
    const txt = dom.window.document.body.textContent || '';
    const t = normThaiBasic(txt);
    return t || undefined;
  }
  return undefined;
}

function extractSynonymsByRegex(html: string): string | undefined {
  const cleaned = normThaiBasic(html);
  // ปรับ regex ให้ทนต่อช่องว่างและอักขระแปลก
  const re = /<p>\s*<strong>\s*ชื่อ\s*พ้อง\s*<\/strong>\s*([\s\S]*?)<\/p>/iu;
  const m = cleaned.match(re);
  if (m) {
    const dom = new JSDOM(`<!doctype html><html><body>${m[1]}</body></html>`);
    const txt = dom.window.document.body.textContent || '';
    const t = normThaiBasic(txt);
    return t || undefined;
  }
  return undefined;
}

function extractOtherNamesByRegex(html: string): string | undefined {
  const cleaned = normThaiBasic(html);
  // ปรับ regex ให้ทนต่อช่องว่างและอักขระแปลก
  const re = /<p>\s*<strong>\s*ชื่อ\s*อื่น(?:\s*ๆ)?\s*<\/strong>\s*([\s\S]*?)<\/p>/iu;
  const m = cleaned.match(re);
  if (m) {
    const dom = new JSDOM(`<!doctype html><html><body>${m[1]}</body></html>`);
    const txt = dom.window.document.body.textContent || '';
    const t = normThaiBasic(txt);
    return t || undefined;
  }
  return undefined;
}

function extractAuthorByRegex(html: string): string | undefined {
  const cleaned = normThaiBasic(html);
  // Pattern A: the author value is INSIDE the <strong> tag after the label
  const reInside = /<p>\s*<strong>\s*ผู้[^\s<>{}/\\\[\]()]*เขียน\s+([\s\S]*?)\s*<\/strong>\s*<\/p>/iu;
  let m = cleaned.match(reInside);
  if (m && m[1]) {
    const dom = new JSDOM(`<!doctype html><html><body>${m[1]}</body></html>`);
    const txt = dom.window.document.body.textContent || '';
    const t = normThaiBasic(txt);
    if (t) return t;
  }
  // Pattern B: the author value is AFTER the </strong>
  const reAfter = /<p>\s*<strong>\s*ผู้[^\s<>{}/\\\[\]()]*เขียน\s*<\/strong>\s*([\s\S]*?)<\/p>/iu;
  m = cleaned.match(reAfter);
  if (m && m[1]) {
    const dom = new JSDOM(`<!doctype html><html><body>${m[1]}</body></html>`);
    const txt = dom.window.document.body.textContent || '';
    const t = normThaiBasic(txt);
    if (t) return t;
  }
  // Pattern C: fallback – find a <p> whose first <strong> starts with ผู้…เขียน, then strip the label and take the rest of text
  try {
    const dom = new JSDOM(`<!doctype html><html><body>${cleaned}</body></html>`);
    const ps = Array.from(dom.window.document.querySelectorAll('p'));
    for (const p of ps) {
      const st = p.querySelector('strong');
      if (!st) continue;
      const label = thaiKey(st.textContent || '');
      const isAuthorLabel = label.startsWith(thaiKey('ผู้เขียน'));
      if (isAuthorLabel) {
        // remove the label portion from the full text
        const full = normThaiBasic(p.textContent || '');
        const lab = normThaiBasic(st.textContent || '');
        const val = normThaiBasic(full.replace(lab, ''));
        if (val) return val;
      }
    }
  } catch { /* ignore */ }
  return undefined;
}

function parseMetaFromHtml(html: string): {
  official?: string;
  scientific?: string;
  genus?: string;
  species?: string;
  authorsDisplay?: string;
  authorsPeriod?: string;
  otherNames?: string;
  author?: string;
  synonyms?: string;
  family?: string;
  synonymsLabelPresent?: boolean;
} {
  console.log('[DEBUG] parseMetaFromHtml - Starting meta parsing, HTML length:', html.length);
  const out: any = {};
  let foundSynonymsLabel = false;

  const norm = (s: string) =>
    collapseDuplicateThaiVowels(
      (s || '')
        .normalize('NFC')
        .replace(/\u00A0/g, ' ')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\uFFFD/g, '?')
        .replace(/\s+/g, ' ')
        .trim()
    );

  try {
    const fam = extractFamilyByRegex(html);
    if (fam) out.family = fam;
  } catch { /* ignore */ }

  try {
    const cleaned = normThaiBasic(html);
    if (/<p>\s*<strong>\s*ชื่อ\s*พ้อง\s*<\/strong>[\s\S]*?<\/p>/iu.test(cleaned)) {
      foundSynonymsLabel = true;
    }
    const syn = extractSynonymsByRegex(html);
    if (syn && !out.synonyms) out.synonyms = syn;
  } catch { /* ignore */ }

  try {
    const other = extractOtherNamesByRegex(html);
    if (other && !out.otherNames) out.otherNames = other;
  } catch { /* ignore */ }

  try {
    const authorVal = extractAuthorByRegex(html);
    if (authorVal && !out.author) out.author = authorVal;
  } catch { /* ignore */ }

  try {
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
    const doc = dom.window.document;
    let host: Element | null = doc.querySelector('strong em')?.parentElement || null;
    if (!host) host = doc.querySelector('em')?.parentElement || null;
    if (host) {
      const em = host.querySelector('em');
      const hostText = norm(host.textContent || '');
      const emText = norm(em?.textContent || '');
      if (emText) {
        const parts = emText.split(/\s+/);
        if (parts[0]) out.genus = parts[0];
        if (parts[1]) out.species = parts[1];
        let tail = '';
        if (em) {
          let seen = false;
          for (const n of Array.from(host.childNodes)) {
            if (n === em) { seen = true; continue; }
            if (!seen) continue;
            tail += n.textContent || '';
          }
        }
        const sci = norm(`${emText} ${tail}`);
        if (sci) out.scientific = sci;
      }
      if (hostText) {
        const emTxt = norm(host.querySelector('em')?.textContent || '');
        if (emTxt && hostText.includes(emTxt)) {
          const before = hostText.split(emTxt)[0];
          const th = norm(before).replace(/[^\u0E00-\u0E7F\s]/g, '').trim();
          if (th) { out.official = th; }
        }
      }
      if (out.scientific) {
        const after = hostText.split(norm(host.querySelector('em')?.textContent || ''))[1] || '';
        const auth = norm(after);
        if (auth) out.authorsDisplay = auth;
      }
    }

    const ps = Array.from(doc.querySelectorAll('p'));
    for (const p of ps) {
      const strong = p.querySelector('strong');
      if (!strong) continue;
      const { base: label, noTone: labelNoTone } = makeLabels(strong.textContent || '');
      const contentText = norm(p.textContent || '').replace(norm(strong.textContent || ''), '').trim();
      const emText = norm(p.querySelector('em')?.textContent || '');
      if (!label) continue;

      if ((/^ชื่อวิทยาศาสตร์$/.test(labelNoTone) || labelNoTone.startsWith('ชื่อวิทยาศาสตร์')) && (emText || contentText)) {
        out.scientific = emText || contentText;
        const parts = (emText || contentText).split(/\s+/);
        if (parts[0]) out.genus = out.genus || parts[0];
        if (parts[1]) out.species = out.species || parts[1];
        continue;
      }

      if ((/^ชื่อสกุล$/.test(labelNoTone) || labelNoTone.startsWith('ชื่อสกุล')) && (emText || contentText)) {
        out.genus = emText || contentText;
        continue;
      }

      if ((/^คำระบุชนิด$/.test(labelNoTone) || labelNoTone.startsWith('คำระบุชนิด')) && (emText || contentText)) {
        out.species = emText || contentText;
        continue;
      }

      if ((/^ชื่อผู้ตั้งพรรณพืช$/.test(labelNoTone) || labelNoTone.includes('ชื่อผู้ตั้งพรรณพืช'))) {
        const htmlVal = p.innerHTML.replace(/<strong>[\s\S]*?<\/strong>/i, '');
        const withNewline = htmlVal
          .replace(/\u00A0/g, ' ')
          .replace(/\uFFFD/g, '?')
          .replace(/\s*<br\s*\/?\s*>\s*/gi, '\n');
        const val = norm(stripHtmlToText(withNewline)).replace(/\n/g, '<br>');
        if (val) out.authorsDisplay = val;
        continue;
      }

      if ((/^ช่วงเวลาเกี่ยวกับผู้ตั้งพรรณพืช$/.test(labelNoTone) || labelNoTone.includes('ช่วงเวลาเกี่ยวกับผู้ตั้งพรรณพืช'))) {
        const htmlVal = p.innerHTML.replace(/<strong>[\s\S]*?<\/strong>/i, '');
        const withNewline = htmlVal.replace(/\s*<br\s*\/?\s*>\s*/gi, '\n');
        const val = norm(stripHtmlToText(withNewline)).replace(/\n/g, '<br>');
        if (val) out.authorsPeriod = val;
        continue;
      }

      if ((/^ชื่ออื่นๆ?$/.test(labelNoTone) || labelNoTone.startsWith('ชื่ออื่น')) && contentText) {
        out.otherNames = contentText;
        continue;
      }

      if ((/^ผู้เขียนคำอธิบาย$/.test(labelNoTone) || labelNoTone.includes('ผู้เขียนคำอธิบาย')) && contentText) {
        out.author = contentText;
        continue;
      }

      if ((/^ชื่อพ้อง$/.test(labelNoTone) || labelNoTone.includes('ชื่อพ้อง'))) {
        foundSynonymsLabel = true;
        const innerRaw = p.innerHTML || '';
        const innerClean = collapseDuplicateThaiVowels(
          innerRaw
            .normalize('NFC')
            .replace(/\u00A0/g, ' ')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/\uFFFD/g, '?')
            .trim()
        );
        const mSyn = innerClean.match(/^<strong>\s*ชื่อ\s*พ้อง\s*<\/strong>\s*([\s\S]+)$/i);
        if (mSyn) {
          const val = norm(stripHtmlToText(mSyn[1]));
          if (val) out.synonyms = val;
        }
        continue;
      }

      if (/^วงศ์์?$/.test(labelNoTone) || labelNoTone.startsWith('วงศ์')) {
        out.family = emText || contentText || out.family;
        continue;
      }
    }
  } catch (err) {
    console.error('[DEBUG] parseMetaFromHtml - Error during DOM parsing:', err);
  }

  out.synonymsLabelPresent = foundSynonymsLabel;
  console.log('[DEBUG] parseMetaFromHtml - Final parsed meta:', JSON.stringify(out, null, 2));
  return out;
}

function makeLabels(s: string) {
  const base = normThaiBasic(s).replace(/\s+/g, '').replace(/[.:;、,]/g, '');
  const noTone = base.replace(/[\u0E48-\u0E4B]/g, '');
  return { base, noTone };
}

function splitEntriesByAuthorMarker(html: string): Array<{ title: string; html: string; text: string }> {
  console.log('[DEBUG] splitEntriesByAuthorMarker - Starting split, HTML length:', html.length);
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
  const body = dom.window.document.body;
  const elems = Array.from(body.children) as Element[];
  const chunks: Element[][] = [];
  let buf: Element[] = [];
  const flush = () => {
    if (buf.length) {
      chunks.push(buf);
      buf = [];
    }
  };
  for (const el of elems) {
    buf.push(el);
    if (elementContainsStrongAuthor(el)) {
      flush();
    }
  }
  flush();

  const entries = chunks.map((nodes) => {
    const title = pickTitleFromChunk(nodes);
    const htmlChunk = serializeNodes(nodes);
    const textChunk = stripHtmlToText(htmlChunk);
    return { title, html: htmlChunk, text: textChunk };
  });

  if (entries.length === 0) {
    const t = pickTitleFromChunk(elems);
    console.log('[DEBUG] splitEntriesByAuthorMarker - No splits found, returning single entry');
    return [{ title: t, html, text: stripHtmlToText(html) }];
  }
  console.log('[DEBUG] splitEntriesByAuthorMarker - Split into', entries.length, 'entries');
  return entries;
}

function slugifyBasic(input: string, max = 120): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-ก-๙]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, max);
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const commit = searchParams.get('commit') === '1';
    const taxonomyTitle = searchParams.get('title') || 'อนุกรมวิธานพืช (อัปโหลดจาก DOCX)';
    const taxonomyDomain = searchParams.get('domain') || 'พืช';
    const taxonomyKingdom = searchParams.get('kingdom') || undefined;
    const form = await req.formData();

    const taxonomyIdRaw = form.get('taxonomyId');
    const taxonomyId =
      typeof taxonomyIdRaw === 'string'
        ? Number(taxonomyIdRaw)
        : (taxonomyIdRaw ? Number(String(taxonomyIdRaw)) : undefined);
    if (taxonomyIdRaw != null && (taxonomyId == null || Number.isNaN(taxonomyId))) {
      return NextResponse.json({ ok: false, error: 'taxonomyId ไม่ถูกต้อง' }, { status: 400 });
    }

    const fileAny = form.get('file') as any;
    if (!isBlobLike(fileAny)) {
      return NextResponse.json({ ok: false, error: 'ไม่พบไฟล์สำหรับอัปโหลด (field: file)' }, { status: 400 });
    }

    const fileName = typeof fileAny.name === 'string' ? fileAny.name : 'upload.docx';
    const fileType = typeof fileAny.type === 'string' ? fileAny.type : '';
    const fileSize = typeof fileAny.size === 'number' ? fileAny.size : 0;

    const MAX_FILE_SIZE = 200 * 1024 * 1024;
    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json({ ok: false, error: `ไฟล์มีขนาดใหญ่เกิน ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)} MB` }, { status: 400 });
    }

    const isDocx = /\.docx$/i.test(fileName) || fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const isPdf  = /\.pdf$/i.test(fileName) || fileType === 'application/pdf';
    const okMime = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/pdf',
      'application/octet-stream',
      ''
    ].includes(fileType);
    if (!isDocx && !isPdf && !okMime) {
      return NextResponse.json({ ok: false, error: 'รองรับเฉพาะไฟล์ .docx หรือ .pdf' }, { status: 400 });
    }

    const buffer = Buffer.from(await fileAny.arrayBuffer());
    console.log('[DEBUG] POST - File buffer size:', buffer.length, 'bytes');

    let htmlOutRaw = '';
    let rawOutBase = '';
    let convMessagesCount = 0;

    if (isPdf) {
      console.log('[DEBUG] POST - Processing as PDF');
      try {
        const { html, text } = await extractFromPdf(buffer);
        htmlOutRaw = html || '';
        rawOutBase = text || '';
        console.log('[DEBUG] POST - PDF extraction complete. html length:', htmlOutRaw.length, ', text length:', rawOutBase.length);
      } catch (e: any) {
        console.error('[DEBUG] POST - PDF extraction failed:', e);
        if (e && e.code === 'MODULE_MISSING' && e.module === 'pdf-parse') {
          return NextResponse.json(
            {
              ok: false,
              error: e.message || 'การนำเข้า PDF ต้องติดตั้งไลบรารี pdf-parse',
              module: 'pdf-parse',
              hint: 'ติดตั้งด้วย: npm i pdf-parse  หรือ  yarn add pdf-parse  หรือ  pnpm add pdf-parse',
            },
            { status: e.status || 400 }
          );
        }
        throw e;
      }
    } else {
      const styleMap = [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Heading 1'] => h2:fresh",
        "p[style-name='Heading 2'] => h3:fresh",
        "p[style-name='Heading 3'] => h4:fresh",
      ];
      const { value: html, messages } = await mammoth.convertToHtml({ buffer }, { styleMap });
      const { value: rawText } = await mammoth.extractRawText({ buffer });
      htmlOutRaw = html || '';
      rawOutBase = rawText || '';
      convMessagesCount = messages?.length || 0;
    }

    // ปรับปรุงการ clean HTML และการแทนที่ U+FFFD
    // ลบ U+FFFD ออกก่อน cleanImportedHtml เพื่อป้องกันการลบเนื้อหาสำคัญ
    const htmlWithoutFFFD = htmlOutRaw.replace(/\uFFFD/g, '?');
    const htmlOut = cleanImportedHtml(collapseDuplicateThaiVowels(htmlWithoutFFFD));
    const rawOut = collapseDuplicateThaiVowels((rawOutBase || '').replace(/\uFFFD/g, '?').trim());
    console.log('[DEBUG] POST - Final htmlOut length:', htmlOut.length, ', rawOut length:', rawOut.length);

    const dom = new JSDOM(`<!doctype html><html><body>${htmlOut}</body></html>`);
    const domNodeCount = dom.window.document.body.childElementCount;

    const sections = [
      {
        title: fileName.replace(/\.docx$/i, ''),
        html: htmlOut,
        text: rawOut,
      },
    ];

    let savedTaxonomyId: number | null = null;
    const created: Array<{ id: number; scientificName: string; entries?: number; synonymsDetected?: boolean; synonymsSaved?: boolean }> = [];
    let saveError: string | null = null;
    const warnings: string[] = [];

    if (commit) {
      try {
          let taxonomy: any = null;
          if (typeof taxonomyId === 'number' && !Number.isNaN(taxonomyId)) {
            taxonomy = await prisma.taxonomy.findUnique({ where: { id: taxonomyId } });
            if (!taxonomy) {
              return NextResponse.json(
                { ok: false, error: `ไม่พบอนุกรมวิธาน (taxonomyId=${taxonomyId})` },
                { status: 400 }
              );
            }
          } else {
            taxonomy = await prisma.taxonomy.findFirst({ where: { title: taxonomyTitle } });
            if (!taxonomy) {
              taxonomy = await prisma.taxonomy.create({
                data: { title: taxonomyTitle, domain: taxonomyDomain, kingdom: taxonomyKingdom } // <-- แก้ไขบรรทัดนี้
              });
            }
          }
          savedTaxonomyId = taxonomy.id;

          const HTML_FIELD_CANDIDATES = ['contentHtml', 'descriptionHtml', 'content_html', 'html'];
          const RANK_GUESSES = ['SPECIES','GENUS','FAMILY','ORDER','CLASS','PHYLUM','KINGDOM','DIVISION','SUBSPECIES','VARIETY','FORM','UNKNOWN','UNSPECIFIED'];

          const tryCreate = async (payload: any) => {
            return await prisma.taxon.create({ data: payload });
          };

          for (const sec of sections) {
            const base: any = {
              taxonomyId: taxonomy.id,
              scientificName: sec.title,
            };
            let createdTaxon: any = null;
            let lastError: any = null;

            for (const f of HTML_FIELD_CANDIDATES) {
              try {
                createdTaxon = await tryCreate({ ...base, [f]: sec.html });
                lastError = null;
                break;
              } catch (e: any) {
                lastError = e;
                const msg = String(e?.message || '');
                if (!/Unknown (?:arg|argument|field)|Unknown field/i.test(msg)) {
                  break;
                }
              }
            }

            if (!createdTaxon) {
              try {
                createdTaxon = await tryCreate(base);
                lastError = null;
              } catch (e: any) {
                lastError = e;
                const msg = String(e?.message || '');
                if (/rank/i.test(msg)) {
                  for (const r of RANK_GUESSES) {
                    try {
                      createdTaxon = await tryCreate({ ...base, rank: r as any });
                      lastError = null;
                      break;
                    } catch (e2: any) {
                      lastError = e2;
                    }
                  }
                }
              }
            }

            if (!createdTaxon) {
              throw lastError || new Error('ไม่สามารถสร้างระเบียน taxon ได้');
            }

            let htmlFieldSet: string | null = null;
            try {
              htmlFieldSet = await persistTaxonHtml(createdTaxon.id, sec.html);
              console.log('[DEBUG] POST - persistTaxonHtml result for taxonId', createdTaxon.id, ':', htmlFieldSet);
            } catch (err) {
              console.error('[DEBUG] POST - persistTaxonHtml failed for taxonId', createdTaxon.id, ':', err);
            }

            let entryCount = 0;
            try {
              const parts = splitEntriesByAuthorMarker(sec.html);
              console.log('[DEBUG] POST - Split section into', parts.length, 'entries');
              for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                try {
                  const meta = parseMetaFromHtml(part.html);
                  console.log('[DEBUG] POST - Created TaxonEntry', i+1, 'for taxonId', createdTaxon.id, '. Meta keys:', Object.keys(meta));
                  const hadSynLabel = !!meta.synonymsLabelPresent;
                  const hasSynonyms = !!meta.synonyms;
                  if (hadSynLabel && !hasSynonyms) {
                    warnings.push(`ไม่สามารถ extract "ชื่อพ้อง" ในหัวข้อที่ ${i + 1} (taxonId: ${createdTaxon.id})`);
                  }
                  const cleaned = sanitizeEntryContent(
                    part.html,
                    { official: meta.official || null, scientific: meta.scientific || null }
                  );
                  const shortDescHtml = extractFirstParagraphHtml(cleaned.html);
                  const contentHtmlFinal = removeFirstParagraph(cleaned.html);
                  const contentTextFinal = stripHtmlToText(contentHtmlFinal);
                  await prisma.taxonEntry.create({
                     data : {
                      taxonId: createdTaxon.id,
                      title: part.title || `หัวข้อที่ ${i + 1}`,
                      slug: slugifyBasic(part.title || `หัวข้อที่ ${i + 1}`),
                      contentHtml: contentHtmlFinal,
                      contentText: contentTextFinal,
                      shortDescription: shortDescHtml || null,
                      orderIndex: i + 1,
                      officialNameTh: meta.official || null,
                      official: meta.official || null,
                      scientificName: meta.scientific || null,
                      genus: meta.genus || null,
                      species: meta.species || null,
                      authorsDisplay: meta.authorsDisplay || null,
                      authorsPeriod: meta.authorsPeriod || null,
                      otherNames: meta.otherNames || null,
                      author: meta.author || null,
                      synonyms: meta.synonyms || null,
                      family: meta.family || null,
                      meta: meta as any,
                    },
                  });
                  entryCount++;
                } catch (entryErr) {
                  console.error('[DEBUG] POST - Error creating TaxonEntry', i+1, 'for taxonId', createdTaxon.id, ':', entryErr);
                }
              }
            } catch (splitErr) {
              console.error('[DEBUG] POST - Error splitting entries for taxonId', createdTaxon.id, ':', splitErr);
            }

            created.push({
              id: createdTaxon.id,
              scientificName: createdTaxon.scientificName,
              entries: entryCount,
              synonymsDetected: warnings.some(w => w.includes(`(taxonId: ${createdTaxon.id})`)),
              synonymsSaved: warnings.every(w => !w.includes(`(taxonId: ${createdTaxon.id})`)),
              htmlFieldSet: htmlFieldSet || undefined,
            });
          }
        } catch (saveErr: any) {
          console.error('[DEBUG] POST - Database save error:', saveErr);
          saveError = saveErr?.message || 'ไม่สามารถบันทึกลงฐานข้อมูลได้';
        }
    }

    const excerpt = htmlOut.length > 4000 ? htmlOut.slice(0, 4000) + '\n<!-- …truncated… -->' : htmlOut;

    return NextResponse.json({
      ok: true,
      message: commit
        ? (saveError ? `อัปโหลดสำเร็จ แต่บันทึกฐานข้อมูลไม่สำเร็จ: ${saveError}` : 'อัปโหลดและบันทึกสำเร็จ')
        : 'อัปโหลดสำเร็จ (ยังไม่ได้บันทึกลงฐานข้อมูล — ส่ง commit=1 เพื่อบันทึก)',
      file: {
        name: fileName,
        size: fileSize,
        sizeHuman: bytesToHuman(fileSize),
        type: fileType || 'unknown',
      },
      stats: {
        paragraphs: (rawOut.match(/\n/g) || []).length + 1,
        htmlLength: htmlOut.length,
        sections: sections.length,
        domNodes: domNodeCount,
        messages: convMessagesCount,
      },
      previewHtml: excerpt,
      commit,
      savedTaxonomyId,
      created,
      warnings,
      error: saveError || undefined,
    });
  } catch (err: any) {
    console.error('[DEBUG] POST - Unexpected error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'Unexpected error' }, { status: 500 });
  }
}