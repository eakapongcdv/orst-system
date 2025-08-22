//src/app/api/file-manager/upload-taxonomy/route.tsx
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { JSDOM } from 'jsdom';

const prisma = new PrismaClient();
const MAX_FILE_SIZE = 200 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const idEntry = formData.get('specializedDictionaryId');
    const specializedDictionaryId: number =
      typeof idEntry === 'string' && idEntry.trim() !== ''
        ? Number.parseInt(idEntry, 10)
        : 0; // default to normal dictionary when not provided
    
    if (!Number.isFinite(specializedDictionaryId)) {
      console.warn('Invalid specializedDictionaryId; defaulting to 0 (normal dictionary). Raw value:', idEntry);
    }

    const file = formData.get('file') as File | null;

    console.log('Received file:', file?.name);
    console.log('Dictionary ID:', specializedDictionaryId);

    if (!file) return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });

    const fileName = file.name.toLowerCase();
    const validExt = fileName.endsWith('.html') || fileName.endsWith('.htm');
    const validMime = file.type === 'text/html' || file.type === '';
    if (!validExt && !validMime)
      return NextResponse.json({ error: 'Invalid file type. Please upload a .html file.' }, { status: 400 });

    if (file.size > MAX_FILE_SIZE)
      return NextResponse.json({
        error: `File too large. Maximum allowed size is ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(2)} MB.`,
      }, { status: 400 });

    const text = await file.text();
    console.log('File content length:', text.length);

    const dom = new JSDOM(text);
    const doc = dom.window.document;

    let results: { term_en: string, term_th: string, definition_html: string }[] = [];

    if (specializedDictionaryId !== 0) {
      // Specialized Dictionary parsing logic
      console.log('Using specialized dictionary parsing logic');
      results = parseSpecializedDictionary(doc);
    } else {
      // Normal Dictionary parsing logic
      console.log('Using normal dictionary parsing logic');
      results = parseNormalDictionary(doc);
    }

    console.log('Total parsed entries:', results.length);
    if (results.length > 0) {
      console.log('Sample parsed entries:', results.slice(0, 2)); // Show first 2
    }

    // import เข้า db
    let count = 0;
    for (const entry of results) {
      // ข้าม entry ที่ key ใด key หนึ่งว่าง (กัน duplicate constraint error)
      if (!entry.term_th || !entry.term_en) {
        console.warn('Skipping entry due to missing term:', entry);
        continue;
      }

      if (specializedDictionaryId !== 0) {
        // Specialized Dictionary entry
        await prisma.dictionaryEntry.upsert({
          where: {
            uniq_entry_th_en: {
              specializedDictionaryId: specializedDictionaryId,
              term_th: entry.term_th,
              term_en: entry.term_en,
            },
          },
          update: { definition_html: entry.definition_html },
          create: {
            specializedDictionaryId: specializedDictionaryId,
            term_en: entry.term_en,
            term_th: entry.term_th,
            definition_html: entry.definition_html,
          },
        });
      } else {
        // Normal Dictionary entry
        await prisma.dictionaryEntry.upsert({
          where: {
            uniq_entry_th_en: {
               specializedDictionaryId: specializedDictionaryId,
              term_th: entry.term_th,
              term_en: entry.term_en,
            },
          },
          update: { definition_html: entry.definition_html },
          create: {
            specializedDictionaryId: specializedDictionaryId,
            term_en: entry.term_en,
            term_th: entry.term_th,
            definition_html: entry.definition_html,
          },
        });
      }
      count++;
    }

    console.log('Successfully imported entries:', count);

    return NextResponse.json({ message: 'Imported successfully', count }, { status: 201 });
  } catch (error: any) {
    console.error('Error in upload-dictionary API:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

// Specialized Dictionary parsing logic
function parseSpecializedDictionary(doc: Document): { term_en: string, term_th: string, definition_html: string }[] {
  const results: { term_en: string, term_th: string, definition_html: string }[] = [];

  let currentTermEn = '';
  let currentTermTh = '';
  let definitionChunks: string[] = [];
  let foundEntry = false;

  const section = doc.querySelector('.WordSection1');
  if (!section) throw new Error('Cannot find .WordSection1 in HTML');

  const blocks = Array.from(section.querySelectorAll('p, .MsoBodyText, .MsoListParagraph'));
  console.log(`Found ${blocks.length} blocks to process for specialized dictionary`);

  for (const el of blocks) {
    const spanEN = el.querySelector('span[lang="EN-US"]');
    const spanTH = el.querySelector('span[lang="TH"]');

    const isHeading = spanEN && spanTH &&
      (
        (spanEN.getAttribute('style')?.includes('18.0pt') || spanEN.getAttribute('style')?.includes('#B3186D')) ||
        (spanTH.getAttribute('style')?.includes('18.0pt') || spanTH.getAttribute('style')?.includes('#B3186D'))
      );

    if (isHeading) {
      if (foundEntry && currentTermEn && currentTermTh) {
        results.push({
          term_en: currentTermEn,
          term_th: currentTermTh,
          definition_html: definitionChunks.join('').trim(),
        });
      }
      currentTermEn = spanEN.textContent?.trim() || '';
      currentTermTh = spanTH.textContent?.trim() || '';
      definitionChunks = [];
      foundEntry = true;

      console.log('Found new specialized entry:', { currentTermEn, currentTermTh });
    } else if (foundEntry) {
      definitionChunks.push(el.outerHTML);
    }
  }

  // push อันสุดท้าย
  if (foundEntry && currentTermEn && currentTermTh) {
    results.push({
      term_en: currentTermEn,
      term_th: currentTermTh,
      definition_html: definitionChunks.join('').trim(),
    });
  }

  return results;
}

// Normal Dictionary parsing logic based on normal.txt structure
function parseNormalDictionary(doc: Document): { term_en: string, term_th: string, definition_html: string }[] {
  const results: { term_en: string, term_th: string, definition_html: string }[] = [];

  const section = doc.querySelector('.WordSection1');
  if (!section) throw new Error('Cannot find .WordSection1 in HTML');

  // Find all paragraphs that represent dictionary entries
  // These typically have text-indent: -35.45pt and margin-left: 35.45pt
  const entryParagraphs = Array.from(section.querySelectorAll('p.MsoNormal[style*="text-indent:-35.45pt"]'));

  console.log(`Found ${entryParagraphs.length} potential entry paragraphs for normal dictionary`);

  for (const p of entryParagraphs) {
    // Extract the term (bold text at the beginning)
    const boldElement = p.querySelector('b > span[lang="EN-US"]');
    if (!boldElement) {
      console.warn('Skipping paragraph - no bold term found');
      continue;
    }

    const fullTermText = boldElement.textContent?.trim() || '';
    if (!fullTermText) {
      console.warn('Skipping paragraph - empty term');
      continue;
    }

    // Split term into Thai and English parts (if needed)
    // For now, we'll assume the term is in Thai and use a placeholder for English
    // You might need to adjust this logic based on how terms are actually structured
    let term_th = fullTermText;
    let term_en = fullTermText; // Placeholder - adjust if you have separate EN terms

    // Extract definition (everything after the bold term)
    // Clone the paragraph and remove the bold term element
    const clonedParagraph = p.cloneNode(true) as HTMLElement;
    const boldToRemove = clonedParagraph.querySelector('b');
    if (boldToRemove) {
      // Remove the bold term and any immediately following space
      const nextSibling = boldToRemove.nextSibling;
      if (nextSibling && nextSibling.nodeType === 3 && /^\s*$/.test(nextSibling.textContent || '')) {
        clonedParagraph.removeChild(nextSibling);
      }
      clonedParagraph.removeChild(boldToRemove);
    }

    // Get the remaining HTML as the definition
    let definition_html = clonedParagraph.innerHTML.trim();

    // Basic cleanup
    if (definition_html.startsWith('<span') && definition_html.endsWith('</span>')) {
      // If it's just a span, extract its content
      const tempDiv = doc.createElement('div');
      tempDiv.innerHTML = definition_html;
      definition_html = tempDiv.textContent || '';
    }

    // Only add if we have both terms and definition
    if (term_th && term_en && definition_html) {
      results.push({
        term_en: term_en,
        term_th: term_th,
        definition_html: definition_html,
      });
      
      if (results.length <= 3) { // Log first few entries for debugging
        console.log('Parsed normal entry:', { term_en, term_th, definition_html });
      }
    } else {
      console.warn('Skipping entry due to missing data:', { term_en, term_th, definition_html });
    }
  }

  return results;
}