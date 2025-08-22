/* scripts/crawl-lst-encyclopedia.ts
   Crawl LST Encyclopedia (Plant Taxonomy “อนุกรมวิธานพืช …”) to:
   - prisma/encyclopedia.seed.json
   - prisma/taxonomy.seed.json  (best-effort from “ชื่อวิทยาศาสตร์” ถ้ามี)

   Usage:
   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/crawl-lst-encyclopedia.ts \
     --letters=ก,ข --delay=800 --concurrency=3

   Options:
     --letters        รายชื่ออักษรไทยที่ต้องการ (คั่น ,) เช่น ก,ข (ค่าเริ่มต้น: ก)
     --outEnc         path ไฟล์ออกของ encyclopedia (default: prisma/encyclopedia.seed.json)
     --outTax         path ไฟล์ออกของ taxonomy (default: prisma/taxonomy.seed.json)
     --concurrency    จำนวนคำขนาน (default: 3)
     --delay          ดีเลย์มิลลิวินาทีระหว่างคำขอ (default: 800ms)
*/

import axios from 'axios';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import robotsParser from 'robots-parser';
import fs from 'fs';
import path from 'path';

const BASE = 'https://lst.nectec.or.th/encyclopedia/';
const AGENT = 'orst-system-crawler/1.0 (+contact: admin@orst.local)';

type CliOptions = {
  letters: string[];
  outEnc: string;
  outTax: string;
  concurrency: number;
  delay: number;
};
function parseCli(): CliOptions {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v ?? ''];
    })
  );
  return {
    letters: (args.letters || 'ก').split(',').map(s => s.trim()).filter(Boolean),
    outEnc: args.outEnc || 'prisma/encyclopedia.seed.json',
    outTax: args.outTax || 'prisma/taxonomy.seed.json',
    concurrency: Number(args.concurrency || 3),
    delay: Number(args.delay || 800),
  };
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

async function loadRobotsTxt() {
  const robotsUrl = 'https://lst.nectec.or.th/robots.txt';
  const { data } = await axios.get(robotsUrl, { headers: { 'User-Agent': AGENT } });
  return robotsParser(robotsUrl, data);
}

function absoluteUrl(href: string) {
  if (!href) return href;
  if (/^https?:\/\//i.test(href)) return href;
  return new URL(href, BASE).toString();
}

/** --------- Discover links for Plant Taxonomy (view/index.php?cid=...) ---------- */
async function discoverPlantLinks(letters: string[], robots: any): Promise<string[]> {
  // เราจะพาร์สหน้า index หลัก แล้วดึงทุกลิงก์ที่ชี้ไป path: wikipedia/plant_taxonomy/view/index.php?cid=...
  const indexUrl = BASE;
  if (!robots.isAllowed(indexUrl, AGENT)) {
    throw new Error(`robots.txt disallow: ${indexUrl}`);
  }
  const { data: html } = await axios.get(indexUrl, { headers: { 'User-Agent': AGENT } });
  const $ = cheerio.load(html);

  const targets: string[] = [];
  $('a[href*="wikipedia/plant_taxonomy/view/index.php"]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const text = ($(a).text() || '').trim();
    if (!href) return;
    // คำในเล่มนี้ เริ่มด้วยอักษรไทยที่สนใจ
    const first = text.replace(/\s+/g, '').charAt(0);
    if (letters.includes(first)) {
      targets.push(absoluteUrl(href));
    }
  });

  // uniq
  return Array.from(new Set(targets));
}

/** --------- Parse single article page ---------- */
type Article = {
  slug: string;
  titleTh: string;
  titleEn?: string | null;
  summary?: string | null;
  contentHtml?: string | null;
  externalUrl?: string | null;
  authors?: string[];
  publishedAt?: string | null;
  images?: string[];
  keywords?: string[];
  orderIndex?: number;
  // extracted fields for taxonomy
  mainName?: string | null;          // ชื่อหลัก/ชื่อทางการ
  scientificName?: string | null;    // ชื่อวิทยาศาสตร์
};

function slugifyTh(s: string) {
  const base = s
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return base || encodeURIComponent(s.trim());
}

function extractByLabelBlock(text: string, label: string): string | null {
  // หาแถวที่ขึ้นต้น label แล้วอ่านค่าบรรทัดถัดไป หรือหลัง colon
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const idx = lines.findIndex(l => l.startsWith(label));
  if (idx === -1) return null;
  // บางหน้าจะเว้นบรรทัด: label อยู่บรรทัดหนึ่ง ค่าต่อบรรทัดถัดไป
  const after = lines[idx + 1] ?? '';
  // หรือบางทีก็เขียน label แล้วมีเว้นช่อง “     ค่า”
  const inline = lines[idx].replace(label, '').trim();
  const val = inline || after || '';
  return val.replace(/^-+$/, '').trim() || null;
}

async function parseArticle(url: string, robots: any): Promise<Article | null> {
  if (!robots.isAllowed(url, AGENT)) {
    console.warn(`robots disallow: ${url}`);
    return null;
  }
  const { data: html } = await axios.get(url, { headers: { 'User-Agent': AGENT } });
  const $ = cheerio.load(html, { decodeEntities: false });

  // ลองหา title จาก h1–h4 ตัวแรกในส่วนเนื้อหา
  let title = ($('h1,h2,h3,h4').first().text() || '').trim();
  if (!title) {
    // fallback: ดูตัวหนาใหญ่ ๆ แถวบน
    title = ($('strong').first().text() || '').trim();
  }
  if (!title) {
    // fallback สุดท้าย: ใช้ชื่อหลัง “ชื่อหลักหรือชื่อทางการ”
    const fullText = $.root().text();
    title = extractByLabelBlock(fullText, 'ชื่อหลักหรือชื่อทางการ') || '';
  }
  title = title.replace(/^#+\s*/, '').trim();
  if (!title) return null;

  // เก็บย่อหน้า (ก่อนบล็อก “ชื่อหลัก…/ชื่อวิทยาศาสตร์…”)
  // ใช้ทุก <p> ในหน้าแล้ว clean
  const paras: string[] = [];
  $('p').each((_, p) => {
    const htmlP = $(p).html()?.trim();
    if (!htmlP) return;
    // ข้ามส่วนที่เป็น “ชื่อหลัก/ชื่อวิทยาศาสตร์” หากวางใน <p>
    const text = $(p).text().trim();
    if (/^ชื่อหลัก/.test(text) || /^ชื่อวิทยาศาสตร์/.test(text) || /^ผู้เขียน/.test(text)) return;
    paras.push(htmlP);
  });

  // field-specific จากข้อความเต็มหน้า
  const fullText = $.root().text().replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ');
  const mainName = extractByLabelBlock(fullText, 'ชื่อหลักหรือชื่อทางการ') || null;
  const scientificName = extractByLabelBlock(fullText, 'ชื่อวิทยาศาสตร์') || null;
  const author = extractByLabelBlock(fullText, 'ผู้เขียนคำอธิบาย') || null;

  // absolute-ize <img> & <a>
  $('img').each((_, img) => {
    const src = $(img).attr('src');
    if (src) $(img).attr('src', absoluteUrl(src));
  });
  $('a').each((_, a) => {
    const href = $(a).attr('href');
    if (href) $(a).attr('href', absoluteUrl(href));
  });

  // images
  const images = $('img').map((_, img) => $(img).attr('src') || '').get().filter(Boolean);

  // summary = ย่อหน้าแรก (ตัด tag)
  const summary = paras.length ? cheerio.load(`<div>${paras[0]}</div>`)('div').text().trim() : null;

  const art: Article = {
    slug: slugifyTh(title),
    titleTh: title,
    contentHtml: paras.length ? paras.map(p => `<p>${p}</p>`).join('\n') : null,
    externalUrl: url,
    summary,
    images,
    authors: author ? [author] : [],
    mainName,
    scientificName,
  };
  return art;
}

/** --------- Main crawl ---------- */
async function main() {
  const opt = parseCli();
  // prepare out folders
  const encOutPath = path.resolve(process.cwd(), opt.outEnc);
  const taxOutPath = path.resolve(process.cwd(), opt.outTax);
  fs.mkdirSync(path.dirname(encOutPath), { recursive: true });
  fs.mkdirSync(path.dirname(taxOutPath), { recursive: true });

  const robots = await loadRobotsTxt();

  // discover article links for target letters
  const links = await discoverPlantLinks(opt.letters, robots);
  if (!links.length) {
    console.warn('ไม่พบลิงก์รายการพืชสำหรับอักษรที่ระบุ');
    process.exit(0);
  }
  console.log(`พบบทความ ${links.length} รายการสำหรับอักษร: ${opt.letters.join(', ')}`);

  const limit = pLimit(opt.concurrency);
  const results: Article[] = [];
  let idx = 0;

  await Promise.all(
    links.map((u) =>
      limit(async () => {
        idx += 1;
        try {
          const art = await parseArticle(u, robots);
          if (art) results.push(art);
        } catch (e) {
          console.warn('parse error:', u, (e as Error).message);
        } finally {
          await sleep(opt.delay);
          process.stdout.write(`\rดึงข้อมูล: ${idx}/${links.length}`);
        }
      })
    )
  );
  console.log('\nเสร็จสิ้นการดึงข้อมูล');

  // สร้างไฟล์ prisma/encyclopedia.seed.json
  // รวมทุกตัวอักษรไว้ในสารานุกรมเดียว (ตั้งชื่อรวมอักษร เช่น “อนุกรมวิธานพืช อักษร ก,ข”)
  const titleJoin = opt.letters.join(',');
  const encPayload = {
    encyclopedias: [
      {
        slug: `plant-taxonomy-letter-${encodeURIComponent(titleJoin)}`,
        titleTh: `อนุกรมวิธานพืช อักษร ${titleJoin}`,
        titleEn: `Plant taxonomy (letters: ${titleJoin})`,
        description: 'ดึงข้อมูลจาก LST Encyclopedia (เฉพาะอนุกรมวิธานพืชตามอักษรที่ระบุ)',
        sourceUrl: BASE,
        publisher: 'NECTEC LST',
        language: 'th',
        tags: ['อนุกรมวิธานพืช', ...opt.letters],
        meta: { source: 'LST Encyclopedia' },
        articles: results
          .sort((a, b) => (a.titleTh > b.titleTh ? 1 : -1))
          .map((a, i) => ({
            slug: a.slug,
            titleTh: a.titleTh,
            titleEn: a.titleEn ?? null,
            altTitles: [],
            summary: a.summary ?? null,
            externalUrl: a.externalUrl ?? null,
            contentHtml: a.contentHtml ?? null,
            authors: a.authors ?? [],
            images: a.images ?? [],
            keywords: [],
            countryCode: null,
            publishedAt: new Date().toISOString(),
            orderIndex: i + 1,
          })),
      },
    ],
  };

  fs.writeFileSync(encOutPath, JSON.stringify(encPayload, null, 2), 'utf8');
  console.log(`✔ เขียนไฟล์สารานุกรม: ${encOutPath}`);

  // เตรียม taxonomy.seed.json (best-effort)
  // เก็บเฉพาะรายการที่มี scientificName
  const taxa = results
    .filter((a) => !!a.scientificName)
    .map((a) => ({
      rank: 'SPECIES',
      scientificName: a.scientificName!,
      thaiName: a.mainName || a.titleTh,
      status: 'accepted',
      parentScientificName: null,
      commonNames: [],
      references: [{ cite: 'LST Encyclopedia', url: a.externalUrl || BASE }],
    }));

  const taxPayload = {
    taxonomies: [
      {
        title: `อนุกรมวิธานพืช (letters: ${titleJoin})`,
        domain: 'plant',
        version: '1.0',
        description:
          'นำเข้าจาก LST Encyclopedia (โครงย่อยระดับ species แบบ best-effort จาก “ชื่อวิทยาศาสตร์” ถ้ามี)',
        sourceUrl: BASE,
        meta: { source: 'LST Encyclopedia' },
        taxa,
      },
    ],
  };
  fs.writeFileSync(taxOutPath, JSON.stringify(taxPayload, null, 2), 'utf8');
  console.log(`✔ เขียนไฟล์อนุกรมวิธาน: ${taxOutPath}`);

  // สรุป
  console.log(`สรุป: รวมบทความ ${results.length} รายการ | มีชื่อวิทยาศาสตร์ ${taxa.length} รายการ`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/*
npm i -D ts-node typescript
npm i axios cheerio p-limit robots-parser

npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/crawl-lst-encyclopedia.ts --letters=ก
npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/crawl-lst-encyclopedia.ts \
  --letters=ก,ข --concurrency=3 --delay=800
*/