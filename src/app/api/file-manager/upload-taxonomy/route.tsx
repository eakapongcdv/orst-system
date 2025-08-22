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
  // บีบสระไทยที่ผู้ใช้ระบุให้เหลือ 1 ตัว: ิ ี ึ ื ะ า ำ ํ
  // เช่น "ีี" → "ี", "ะะ" → "ะ"
  return s.replace(/([ิีึืะาำ\u0E4D])\1+/g, '$1');
}

function stripHtmlToText(html: string): string {
  try {
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
    return dom.window.document.body.textContent?.replace(/\s+/g, ' ').trim() || '';
  } catch {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
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
} {
  const out: any = {};
  try {
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
    const doc = dom.window.document;

    // Prefer a <strong> that contains <em>
    let host: Element | null = null;
    const strongWithEm = doc.querySelector('strong em')?.parentElement || null;
    if (strongWithEm) host = strongWithEm;
    else {
      // fallback: any element containing <em>
      host = doc.querySelector('em')?.parentElement || null;
    }

    if (host) {
      const em = host.querySelector('em');
      const hostText = (host.textContent || '').normalize('NFC').replace(/\s+/g, ' ').trim();
      const emText = (em?.textContent || '').normalize('NFC').replace(/\s+/g, ' ').trim();

      if (emText) {
        // genus/species
        const parts = emText.split(/\s+/);
        if (parts[0]) out.genus = parts[0];
        if (parts[1]) out.species = parts[1];

        // scientific = italic + any trailing authors that appear after <em>
        let tail = '';
        if (em && host) {
          const nodes = Array.from(host.childNodes);
          let seen = false;
          for (const n of nodes) {
            if (n === em) { seen = true; continue; }
            if (!seen) continue;
            if (n.nodeType === 3) tail += (n.textContent || '');
            else if ((n as Element).tagName) tail += (n as Element).textContent || '';
          }
        }
        const sci = (emText + ' ' + tail).replace(/\s+/g, ' ').trim();
        if (sci) out.scientific = sci;
      }

      // official (Thai common name) = hostText before the italic text
      if (emText && hostText.includes(emText)) {
        const before = hostText.split(emText)[0];
        const th = (before || '').replace(/[^\u0E00-\u0E7F\s]/g, '').replace(/\s+/g, ' ').trim();
        if (th) out.official = th;
      }

      // authorsDisplay = everything in hostText after the scientific core
      if (emText && hostText.includes(emText)) {
        const after = hostText.split(emText)[1] || '';
        const auth = after.replace(/\s+/g, ' ').trim();
        if (auth) out.authorsDisplay = auth;
      }
    }
  } catch {
    // ignore parse errors
  }
  return out;
}

async function saveEntryMetaIfPossible(entryId: number, meta: {
  official?: string;
  scientific?: string;
  genus?: string;
  species?: string;
  authorsDisplay?: string;
}) {
  // Try a JSON/meta column first
  const jsonCandidates = ['meta', 'metaJson', 'metadata', 'summary', 'summaryJson'];
  for (const key of jsonCandidates) {
    try {
      await prisma.taxonEntry.update({ where: { id: entryId }, data: { [key]: meta } as any });
      return;
    } catch {}
  }
  // Then try common flat fields one-by-one (ignore if a field doesn't exist)
  const mappings: Array<[string, string | undefined]> = [
    ['official', meta.official],
    ['officialName', meta.official],
    ['officialTh', meta.official],
    ['thaiOfficialName', meta.official],
    ['scientific', meta.scientific],
    ['scientificName', meta.scientific],
    ['genus', meta.genus],
    ['species', meta.species],
    ['authors', meta.authorsDisplay],
    ['authorsDisplay', meta.authorsDisplay],
  ];
  for (const [k, v] of mappings) {
    if (!v) continue;
    try {
      await prisma.taxonEntry.update({ where: { id: entryId }, data: { [k]: v } as any });
    } catch {}
  }
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
    const created: Array<{ id: number; scientificName: string; entries?: number }> = [];
    let saveError: string | null = null;

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
                  const createdEntry = await prisma.taxonEntry.create({
                    data: {
                      taxonId: createdTaxon.id,
                      title: part.title || `หัวข้อที่ ${i + 1}`,
                      slug: slugifyBasic(part.title || `หัวข้อที่ ${i + 1}`),
                      contentHtml: part.html,
                      contentText: part.text,
                      orderIndex: i + 1,
                    },
                  });
                  try {
                    const meta = parseMetaFromHtml(part.html);
                    await saveEntryMetaIfPossible(createdEntry.id, meta);
                  } catch {}
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
      error: saveError || undefined,
    });
  } catch (err: any) {
    console.error('Upload taxonomy error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'Unexpected error' }, { status: 500 });
  }
}
