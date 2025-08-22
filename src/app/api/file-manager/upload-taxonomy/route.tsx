function extractFamilyByRegex(html: string): string | undefined {
  const cleaned = normThaiBasic(html);
  const re = /<p>\s*<strong>\s*วงศ์[\u0E00-\u0E7F\s\u200B-\u200D\uFEFF์]*<\/strong>\s*([\s\S]*?)<\/p>/iu;
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
  // match: <p><strong>ชื่อพ้อง</strong> ... </p>
  const re = /<p>\s*<strong>\s*ชื่อพ้อง\s*<\/strong>\s*([\s\S]*?)<\/p>/iu;
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
  // match: <p><strong>ชื่ออื่น ๆ</strong> ... </p>  (allow optional ฯลฯ variations of ๆ)
  const re = /<p>\s*<strong>\s*ชื่ออื่น(?:\s*ๆ)?\s*<\/strong>\s*([\s\S]*?)<\/p>/iu;
  const m = cleaned.match(re);
  if (m) {
    const dom = new JSDOM(`<!doctype html><html><body>${m[1]}</body></html>`);
    const txt = dom.window.document.body.textContent || '';
    const t = normThaiBasic(txt);
    return t || undefined;
  }
  return undefined;
}
// src/app/api/file-manager/upload-taxonomy/route.tsx
import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';
import { PrismaClient } from '@prisma/client';
import { JSDOM } from 'jsdom';

const prisma = new PrismaClient();

export const runtime = 'nodejs';

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


function stripHtmlToText(html: string): string {
  try {
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
    return dom.window.document.body.textContent?.replace(/\s+/g, ' ').trim() || '';
  } catch {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

function normThaiBasic(s: string): string {
  return collapseDuplicateThaiVowels(
    (s || '')
      .normalize('NFC')
      .replace(/\u00A0/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\uFFFD/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}
function normThaiNoSpace(s: string): string {
  return normThaiBasic(s).replace(/\s+/g, '');
}

function thaiKey(s: string): string {
  // Normalize, drop zero-width, FFFD, condense spaces, and remove all Thai tone/diacritic marks, then remove spaces
  return normThaiBasic(s).replace(/[\u0E31\u0E34-\u0E4E]/g, '').replace(/\s+/g, '');
}

function extractFirstParagraphText(html: string): string | undefined {
  try {
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
    const firstP = dom.window.document.querySelector('p');
    if (!firstP) return undefined;
    const txt = firstP.textContent || '';
    const t = normThaiBasic(txt);
    return t || undefined;
  } catch {
    // fallback: quick strip to text and take up to first period-ish
    const t = stripHtmlToText(html);
    return t || undefined;
  }
}

/**
 * Remove title/scientificName header and labeled paragraphs (ชื่อวิทยาศาสตร์, ชื่อพ้อง, ชื่ออื่น ๆ, วงศ์)
 * from the entry content — these now always live in meta.
 */
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

    // 1) Remove header line that contains the scientific name (usually a <strong> with <em>)
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
    // 1b) If not removed, try remove a first block that contains the official Thai name in <strong>
    if (!headerRemoved && targetOfficial) {
      const headerEl2 = Array.from(body.children).find((el) => {
        const st = el.querySelector('strong');
        if (!st) return false;
        const stNorm = normThaiNoSpace(st.textContent || '');
        return !!stNorm && targetOfficial && (stNorm.includes(targetOfficial) || targetOfficial.includes(stNorm));
      });
      if (headerEl2) headerEl2.remove();
    }

    // 2) Remove labeled paragraphs: ชื่อวิทยาศาสตร์, ชื่อพ้อง, ชื่ออื่น ๆ/ชื่ออื่นๆ, วงศ์
    for (const p of Array.from(body.querySelectorAll('p'))) {
      const strong = p.querySelector('strong');
      if (!strong) continue;

      // Build a tone/space-insensitive key for the label
      const labelKey = thaiKey(strong.textContent || '');

      // Precomputed keys for comparison (tone-insensitive)
      const KEY = {
        synonyms: thaiKey('ชื่อพ้อง'),
        other:    thaiKey('ชื่ออื่น'),            // covers 'ชื่ออื่น', 'ชื่ออื่น ๆ', 'ชื่ออื่นๆ'
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
    // Fallback: if DOM parsing fails, strip simple labeled blocks via regex
    let out = html;
    // ชื่อวิทยาศาสตร์ (allow spaces/variants)
    out = out.replace(/<p>\s*<strong>[\s\S]*?ชื่อ\s*วิทยาศาสตร์[\s\S]*?<\/strong>[\s\S]*?<\/p>/giu, '');
    // ชื่อพ้อง (tolerate stray spaces)
    out = out.replace(/<p>\s*<strong>\s*ชื่อ\s*พ้อง\s*<\/strong>[\s\S]*?<\/p>/giu, '');
    // ชื่ออื่น ๆ / ชื่ออื่นๆ / ชื่อ อื่นๆ
    out = out.replace(/<p>\s*<strong>[\s\S]*?ชื่อ\s*อื่น(?:\s*ๆ)?[\s\S]*?<\/strong>[\s\S]*?<\/p>/giu, '');
    // วงศ์
    out = out.replace(/<p>\s*<strong>[\s\S]*?วงศ์[\s\S]*?<\/strong>[\s\S]*?<\/p>/giu, '');
    // Also handle HTML-escaped variants if present
    out = out.replace(/&lt;p&gt;[\s\S]*?&lt;strong&gt;[\s\S]*?(ชื่อ\s*วิทยาศาสตร์|ชื่อ\s*พ้อง|ชื่อ\s*อื่น(?:\s*ๆ)?|วงศ์)[\s\S]*?&lt;\/strong&gt;[\s\S]*?&lt;\/p&gt;/giu, '');

    return { html: out, text: stripHtmlToText(out) };
  }
}

function cleanImportedHtml(html: string): string {
  try {
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
    const { document } = dom.window;
    const paras = Array.from(document.querySelectorAll('p'));
    for (const p of paras) {
      const text = (p.textContent || '')
        .normalize('NFC')
        .replace(/\u00A0/g, ' ')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\uFFFD/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      const inner = (p.innerHTML || '').trim();

      // Pattern 1: lines containing ".indd" often followed by a date/time stamp
      if (/\.indd\b/i.test(text)) {
        p.remove();
        continue;
      }

      // Pattern 2: page number like "<p><strong>12 </strong></p>" (only number in strong)
      if (/^\s*<strong>\s*\d+\s*<\/strong>\s*$/i.test(inner)) {
        p.remove();
        continue;
      }
    }
    return document.body.innerHTML;
  } catch {
    // Fallback: regex remove obvious patterns if DOM parsing fails
    return html
      // remove <p><strong>12</strong></p> - only digits in strong
      .replace(/&lt;p&gt;\s*&lt;strong&gt;\s*\d+\s*&lt;\/strong&gt;\s*&lt;\/p&gt;/gi, '')
      .replace(/<p>\s*<strong>\s*\d+\s*<\/strong>\s*<\/p>/gi, '')
      // remove .indd lines
      .replace(/<p>[^<]*\.indd[^<]*<\/p>/gi, '');
  }
}

function elementContainsStrongAuthor(el: Element): boolean {
  // อนุญาตตัวไทย ช่องว่าง และอักขระ zero-width/FFFD คั่นระหว่าง “ผู้” … “เขียน”
  const THAI_ANY = '[\\u0E00-\\u0E7F\\s\\u200B\\u200C\\u200D\\uFEFF\\uFFFD]*';
  // ต้องขึ้นต้นด้วย “ผู้…เขียน” อาจมี : - – — คั่น แล้วตามด้วยชื่อผู้เขียนอย่างน้อย 1 คำ
  const STRONG_AUTHOR_RE = new RegExp(
    `^ผู้${THAI_ANY}เขียน(?:\\s*[:\\-–—])?\\s+\\S+`,
    'u'
  );

  // รวม <strong> ทั้งตัว el และลูก ๆ
  const strongNodes: Element[] =
    el.tagName === 'STRONG' ? [el] : Array.from(el.querySelectorAll('strong'));

  for (const s of strongNodes) {
    const text = (s.textContent || '')
      .normalize('NFC')
      .replace(/\u00A0/g, ' ')              // NBSP → space
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width ออก
      .replace(/\uFFFD/g, '')                // ‘�’ ออก
      .replace(/\s+/g, ' ')
      .trim();

    if (STRONG_AUTHOR_RE.test(text)) return true;
  }
  return false;
}

function pickTitleFromChunk(nodes: Element[]): string {
  // 1) prefer heading tags
  const heading = nodes.find(n => /H[1-6]/.test(n.tagName));
  if (heading) {
    const t = heading.textContent?.trim();
    if (t) return t;
  }
  // 2) first strong text
  for (const n of nodes) {
    const st = n.querySelector('strong');
    const t = (st?.textContent || '').trim();
    if (t) return t;
  }
  // 3) fallback first non-empty paragraph text
  for (const n of nodes) {
    const t = n.textContent?.trim();
    if (t) return t.slice(0, 120);
  }
  return 'หัวข้อ';
}

function serializeNodes(nodes: Element[]): string {
  return nodes.map(n => (n as any).outerHTML || '').join('');
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
  synonyms?: string; // ชื่อพ้อง
  family?: string;   // วงศ์
  synonymsLabelPresent?: boolean;
} {
  const out: any = {};
  let foundSynonymsLabel = false;
  const norm = (s: string) =>
    collapseDuplicateThaiVowels(
      (s || '')
        .normalize('NFC')
        .replace(/\u00A0/g, ' ')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\uFFFD/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    );
  // Create both base and noTone forms for label matching
  const makeLabels = (s: string) => {
    const base = norm(s).replace(/\s+/g, '').replace(/[.:;、,]/g, '');
    const noTone = base.replace(/[\u0E48-\u0E4B]/g, '');
    return { base, noTone };
  };

  // Try regex-based family extraction early
  try {
    const fam = extractFamilyByRegex(html);
    if (fam) out.family = fam;
  } catch { /* ignore */ }

  // Try regex-based synonyms and other names early (same pattern as family)
  try {
    const cleaned = normThaiBasic(html);
    // If the label exists at all, remember so we can warn later if no value was extracted
    if (/<p>\s*<strong>\s*ชื่อพ้อง\s*<\/strong>[\s\S]*?<\/p>/iu.test(cleaned)) {
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
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
    const doc = dom.window.document;

    // 1) โครงแบบหัวเรื่อง: <strong>ไทย <em>Latin</em> …</strong>
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

        // scientific = ข้อความเอียง + ส่วนต่อท้ายหลัง <em>
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

      // official ไทย = ส่วนก่อนข้อความเอียง
      if (hostText) {
        const emTxt = norm(host.querySelector('em')?.textContent || '');
        if (emTxt && hostText.includes(emTxt)) {
          const before = hostText.split(emTxt)[0];
          const th = norm(before).replace(/[^\u0E00-\u0E7F\s]/g, '').trim();
          if (th) { out.official = th; }
        }
      }

      // authorsDisplay = ข้อความหลังแกนวิทยาศาสตร์
      if (out.scientific) {
        const after = hostText.split(norm(host.querySelector('em')?.textContent || ''))[1] || '';
        const auth = norm(after);
        if (auth) out.authorsDisplay = auth;
      }
    }

    // 2) สแกนย่อหน้าที่มี <strong> เป็น label ภาษาไทย
    const ps = Array.from(doc.querySelectorAll('p'));
    for (const p of ps) {
      const strong = p.querySelector('strong');
      if (!strong) continue;
      const { base: label, noTone: labelNoTone } = makeLabels(strong.textContent || '');
      const contentText = norm(p.textContent || '').replace(norm(strong.textContent || ''), '').trim();
      const emText = norm(p.querySelector('em')?.textContent || '');

      if (!label) continue;

      // ชื่อวิทยาศาสตร์
      if ((/^ชื่อวิทยาศาสตร์$/.test(labelNoTone) || labelNoTone.startsWith('ชื่อวิทยาศาสตร์')) && (emText || contentText)) {
        out.scientific = emText || contentText;
        const parts = (emText || contentText).split(/\s+/);
        if (parts[0]) out.genus = out.genus || parts[0];
        if (parts[1]) out.species = out.species || parts[1];
        continue;
      }
      // ชื่อสกุล
      if ((/^ชื่อสกุล$/.test(labelNoTone) || labelNoTone.startsWith('ชื่อสกุล')) && (emText || contentText)) {
        out.genus = emText || contentText;
        continue;
      }
      // คำระบุชนิด
      if ((/^คำระบุชนิด$/.test(labelNoTone) || labelNoTone.startsWith('คำระบุชนิด')) && (emText || contentText)) {
        out.species = emText || contentText;
        continue;
      }
      // ชื่อผู้ตั้งพรรณพืช
      if ((/^ชื่อผู้ตั้งพรรณพืช$/.test(labelNoTone) || labelNoTone.includes('ชื่อผู้ตั้งพรรณพืช'))) {
        // เก็บเป็น HTML พร้อม <br>
        const htmlVal = p.innerHTML.replace(/<strong>[\s\S]*?<\/strong>/i, '');
        const withNewline = htmlVal
          .replace(/\u00A0/g, ' ')
          .replace(/\uFFFD/g, '')
          .replace(/\s*<br\s*\/?\s*>\s*/gi, '\n');
        const val = norm(stripHtmlToText(withNewline)).replace(/\n/g, '<br>');
        if (val) out.authorsDisplay = val;
        continue;
      }
      // ช่วงเวลาเกี่ยวกับผู้ตั้งพรรณพืช
      if ((/^ช่วงเวลาเกี่ยวกับผู้ตั้งพรรณพืช$/.test(labelNoTone) || labelNoTone.includes('ช่วงเวลาเกี่ยวกับผู้ตั้งพรรณพืช'))) {
        const htmlVal = p.innerHTML.replace(/<strong>[\s\S]*?<\/strong>/i, '');
        const withNewline = htmlVal.replace(/\s*<br\s*\/?\s*>\s*/gi, '\n');
        const val = norm(stripHtmlToText(withNewline)).replace(/\n/g, '<br>');
        if (val) out.authorsPeriod = val;
        continue;
      }
      // ชื่ออื่น ๆ
      if ((/^ชื่ออื่นๆ?$/.test(labelNoTone) || labelNoTone.startsWith('ชื่ออื่น')) && contentText) {
        out.otherNames = contentText;
        continue;
      }
      // ผู้เขียนคำอธิบาย
      if ((/^ผู้เขียนคำอธิบาย$/.test(labelNoTone) || labelNoTone.includes('ผู้เขียนคำอธิบาย')) && contentText) {
        out.author = contentText;
        continue;
      }
      // ชื่อพ้อง (สำคัญ)
      if ((/^ชื่อพ้อง$/.test(labelNoTone) || labelNoTone.includes('ชื่อพ้อง'))) {
        foundSynonymsLabel = true;
        // ตรวจให้แน่ใจว่า <strong>ชื่อพ้อง</strong> อยู่ต้น <p>
        const innerRaw = p.innerHTML || '';
        const innerClean = collapseDuplicateThaiVowels(
          innerRaw
            .normalize('NFC')
            .replace(/\u00A0/g, ' ')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/\uFFFD/g, '')
            .trim()
        );

        // จับเฉพาะรูปแบบ <strong>ชื่อพ้อง</strong> ตามด้วยค่า
        const mSyn = innerClean.match(/^<strong>\s*ชื่อพ้อง\s*<\/strong>\s*([\s\S]+)$/i);
        if (mSyn) {
          const val = norm(stripHtmlToText(mSyn[1]));
          if (val) out.synonyms = val;
        }
        continue;
      }
      
      // วงศ์
      if (/^วงศ์์?$/.test(labelNoTone) || labelNoTone.startsWith('วงศ์')) {
        out.family = emText || contentText || out.family;
        continue;
      }
    }
  } catch {
    // ignore parse errors
  }
  out.synonymsLabelPresent = foundSynonymsLabel;
  return out;
}


// Split entries whenever we encounter an element that *contains a STRONG*
// whose text roughly matches "ผู้…เขียน" (with tolerance for corrupted glyphs).
function splitEntriesByAuthorMarker(html: string): Array<{ title: string; html: string; text: string }> {
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
      // treat this as an end marker for an entry
      flush();
    }
  }
  // tail
  flush();

  // Build entries
  const entries = chunks.map((nodes) => {
    const title = pickTitleFromChunk(nodes);
    const htmlChunk = serializeNodes(nodes);
    const textChunk = stripHtmlToText(htmlChunk);
    return { title, html: htmlChunk, text: textChunk };
  });

  // if nothing detected, return whole html as one entry
  if (entries.length === 0) {
    const t = pickTitleFromChunk(elems);
    return [{ title: t, html, text: stripHtmlToText(html) }];
  }
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

    const form = await req.formData();
    const fileAny = form.get('file') as any;
    if (!isBlobLike(fileAny)) {
      return NextResponse.json({ ok: false, error: 'ไม่พบไฟล์สำหรับอัปโหลด (field: file)' }, { status: 400 });
    }

    const fileName = typeof fileAny.name === 'string' ? fileAny.name : 'upload.docx';
    const fileType = typeof fileAny.type === 'string' ? fileAny.type : '';
    const fileSize = typeof fileAny.size === 'number' ? fileAny.size : 0;

    // Validate file
    const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json({ ok: false, error: `ไฟล์มีขนาดใหญ่เกิน ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)} MB` }, { status: 400 });
    }
    const okExt = /\.docx$/i.test(fileName);
    const okMime = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream',
      ''
    ].includes(fileType);
    if (!okExt && !okMime) {
      return NextResponse.json({ ok: false, error: 'รองรับเฉพาะไฟล์ .docx (Microsoft Word)' }, { status: 400 });
    }

    // Convert to HTML via mammoth
    const buffer = Buffer.from(await fileAny.arrayBuffer());

    const styleMap = [
      "p[style-name='Title'] => h1:fresh",
      "p[style-name='Heading 1'] => h2:fresh",
      "p[style-name='Heading 2'] => h3:fresh",
      "p[style-name='Heading 3'] => h4:fresh",
      // Keep tables, lists & inline formats by default
    ];

    const { value: html, messages } = await mammoth.convertToHtml({ buffer }, { styleMap });
    const { value: rawText } = await mammoth.extractRawText({ buffer });

    // Sanitize: remove all U+FFFD replacement characters to avoid corrupt glyphs
    const htmlOutRaw = html || '';
    const htmlOut = cleanImportedHtml(collapseDuplicateThaiVowels(htmlOutRaw.replace(/\uFFFD/g, '')));
    const rawOut = collapseDuplicateThaiVowels((rawText || '').replace(/\uFFFD/g, '').trim());
    //

    // Parse once with JSDOM for a lightweight sanity check / stat
    const dom = new JSDOM(`<!doctype html><html><body>${htmlOut}</body></html>`);
    const domNodeCount = dom.window.document.body.childElementCount;

    // For demo: import as a single Taxon, using file name as the scientific name
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
          // Ensure a taxonomy record exists
          let taxonomy = await prisma.taxonomy.findFirst({ where: { title: taxonomyTitle } });
          if (!taxonomy) {
            // Some schemas require a non-null domain
            taxonomy = await prisma.taxonomy.create({ data: { title: taxonomyTitle, domain: taxonomyDomain } });
          }
          savedTaxonomyId = taxonomy.id;

          // Helpers: candidate HTML field names and safe rank fallbacks (if rank is required)
          const HTML_FIELD_CANDIDATES = ['contentHtml', 'descriptionHtml', 'content_html', 'html'];
          const RANK_GUESSES = ['SPECIES','GENUS','FAMILY','ORDER','CLASS','PHYLUM','KINGDOM','DIVISION','SUBSPECIES','VARIETY','FORM','UNKNOWN','UNSPECIFIED'];

          // Helper to try create with a payload, returning result or throwing the original error
          const tryCreate = async (payload: any) => {
            return await prisma.taxon.create({ data: payload });
          };

          for (const sec of sections) {
            // base minimal payload
            const base: any = {
              taxonomyId: taxonomy.id,
              scientificName: sec.title,
            };

            let createdTaxon: any = null;
            let lastError: any = null;

            // 1) Try create with each HTML candidate field (without rank)
            for (const f of HTML_FIELD_CANDIDATES) {
              try {
                createdTaxon = await tryCreate({ ...base, [f]: sec.html });
                lastError = null;
                break;
              } catch (e: any) {
                lastError = e;
                // Only continue if error is about unknown/invalid field; otherwise break to handle below
                const msg = String(e?.message || '');
                if (!/Unknown (?:arg|argument|field)|Unknown field/i.test(msg)) {
                  break;
                }
              }
            }

            // 2) If still not created, try create without HTML
            if (!createdTaxon) {
              try {
                createdTaxon = await tryCreate(base);
                lastError = null;
              } catch (e: any) {
                lastError = e;

                // 3) If error mentions missing/invalid "rank", try common enum guesses
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

            // 4) If still failed after all attempts, propagate the error
            if (!createdTaxon) {
              throw lastError || new Error('ไม่สามารถสร้างระเบียน taxon ได้');
            }

            // 5) After creation, try to persist HTML content if not saved yet
            //    (attempt updating using any of the candidate fields; ignore failures)
            let htmlPatched = false;
            for (const f of HTML_FIELD_CANDIDATES) {
              try {
                await prisma.taxon.update({
                  where: { id: createdTaxon.id },
                  data: { [f]: sec.html } as any,
                });
                htmlPatched = true;
                break;
              } catch {
                /* ignore and try next */
              }
            }

            // 6) Split this HTML into entry chunks and create TaxonEntry rows
            let entryCount = 0;
            try {
              const parts = splitEntriesByAuthorMarker(sec.html);
              for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                try {
                  const meta = parseMetaFromHtml(part.html);
                  const hadSynLabel = !!meta.synonymsLabelPresent;
                  const hasSynonyms = !!meta.synonyms;
                  if (hadSynLabel && !hasSynonyms) {
                    warnings.push(`ไม่สามารถ extract "ชื่อพ้อง" ในหัวข้อที่ ${i + 1} (taxonId: ${createdTaxon.id})`);
                  }
                  const cleaned = sanitizeEntryContent(
                    part.html,
                    { official: meta.official || null, scientific: meta.scientific || null }
                  );
                  const shortDesc = extractFirstParagraphText(cleaned.html);

                  await prisma.taxonEntry.create({
                    data: {
                      taxonId: createdTaxon.id,
                      title: part.title || `หัวข้อที่ ${i + 1}`,
                      slug: slugifyBasic(part.title || `หัวข้อที่ ${i + 1}`),
                      contentHtml: cleaned.html,
                      contentText: cleaned.text,
                      shortDescription: shortDesc || null,
                      orderIndex: i + 1,

                      // --- meta fields mapped to schema ---
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
                } catch {
                  // ignore individual entry errors to keep import resilient
                }
              }
            } catch {
              // ignore splitting errors
            }

            created.push({
              id: createdTaxon.id,
              scientificName: createdTaxon.scientificName,
              entries: entryCount,
              // helpful flags to verify synonyms persistence
              // (synonymsSaved is true if at least one entry extracted synonyms)
              // NOTE: these flags are per taxon (aggregated); if you need per-entry,
              // surface them above.
              synonymsDetected: warnings.some(w => w.includes(`(taxonId: ${createdTaxon.id})`)),
              synonymsSaved: warnings.every(w => !w.includes(`(taxonId: ${createdTaxon.id})`)),
            });
          }
        } catch (e: any) {
          saveError = e?.message || 'ไม่สามารถบันทึกลงฐานข้อมูลได้';
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
        paragraphs: (rawOut.match(/\n\n/g) || []).length + 1,
        htmlLength: htmlOut.length,
        sections: sections.length,
        domNodes: domNodeCount,
        messages: messages?.length || 0,
      },
      previewHtml: excerpt,
      commit,
      savedTaxonomyId,
      created,
      warnings,
      error: saveError || undefined,
    });
  } catch (err: any) {
    console.error('Upload taxonomy error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'Unexpected error' }, { status: 500 });
  }
}
