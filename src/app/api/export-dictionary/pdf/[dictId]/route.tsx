// src/app/api/export-dictionary/pdf/[dictId]/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
// Import the specific browser launcher object directly
import { chromium } from 'playwright-chromium'; // Correct import for the launcher

// --- Import fs and path for file operations ---
import fs from 'fs';
import path from 'path';
// --- End of imports ---

const prisma = new PrismaClient();
const CONTENT_TYPES: { [key: string]: string } = {
  pdf: 'application/pdf',
};

const FILE_EXTENSIONS: { [key: string]: string } = {
  pdf: '.pdf',
};

// --- Helper function to generate HTML ---
function generateHtmlContent(dictTitle: string, entries: any[]) {
  console.log(`[HTML] Generating HTML content for title: ${dictTitle}, entries count: ${entries.length}`);

  // --- Include Font Definitions in CSS ---
  // Make sure the font files (e.g., TH-SarabunPSK.ttf) are accessible via your Next.js public directory
  // e.g., public/fonts/TH-SarabunPSK.ttf
  const htmlContent = `
  <!DOCTYPE html>
  <html lang="th">
  <head>
    <meta charset="UTF-8">
    <title>${dictTitle}</title>
    <style>
      body {
        font-family: 'TH Sarabun New', 'TH SarabunPSK', sans-serif; /* Fallback fonts */
        font-size: 16pt; /* Use pt for print/PDF */
        margin: 20mm; /* Add some margin */
      }
      h1 {
        font-size: 22pt;
        font-weight: bold;
        text-align: center;
        margin-bottom: 15mm;
      }
      .entry {
         margin-bottom: 5mm; /* Space between entries */
         page-break-inside: avoid; /* Try to keep entries together */
      }
      .term_th {
        font-size: 16pt;
        font-weight: bold;
        margin-bottom: 2mm;
      }
      .term_en {
        font-size: 14pt;
        font-style: italic;
        margin-bottom: 2mm;
      }
      .definition {
        font-size: 14pt;
        margin-bottom: 5mm;
      }

      /* --- Define Custom Fonts --- */
      /* Ensure these font files exist in your public directory, e.g., public/fonts/ */
      @font-face {
        font-family: 'TH SarabunPSK';
        src: url('/fonts/TH-SarabunPSK.ttf') format('truetype'); /* Adjust path */
        font-weight: normal;
        font-style: normal;
      }
      @font-face {
        font-family: 'TH SarabunPSK';
        src: url('/fonts/TH-SarabunPSK-Bold.ttf') format('truetype');
        font-weight: bold;
        font-style: normal;
      }
      @font-face {
        font-family: 'TH SarabunPSK';
        src: url('/fonts/TH-SarabunPSK-Italic.ttf') format('truetype');
        font-weight: normal;
        font-style: italic;
      }
      @font-face {
        font-family: 'TH SarabunPSK';
        src: url('/fonts/TH-SarabunPSK-BoldItalic.ttf') format('truetype');
        font-weight: bold;
        font-style: italic;
      }
       @font-face {
        font-family: 'TH Sarabun New'; /* Example - adjust if needed */
        src: url('/fonts/TH-Sarabun-New.ttf') format('truetype'); /* Adjust path and filename */
        font-weight: normal;
        font-style: normal;
      }
      /* Add other font weights/styles if needed for TH Sarabun New */
      /* -------------------------- */
    </style>
  </head>
  <body>
    <b><h1 style="font-size:18.0pt;
        font-family:'TH SarabunPSK',sans-serif;color:#B3186D">${dictTitle}</h1></b>
    ${entries.map(entry => {
      const term_th = entry.term_th || '';
      const term_en = entry.term_en || '';
      const definition_html = entry.definition_html || '<p>&nbsp;</p>';

      return `<p class="MsoNormal" style="margin-top:6.0pt;margin-right:0cm;margin-bottom:0cm;
        margin-left:30.05pt;margin-bottom:.0001pt;text-indent:-30.05pt"><b><span lang="EN-US" style="font-size:18.0pt;font-family:'TH SarabunPSK',sans-serif;
        color:#B3186D">${term_en}&nbsp;&nbsp;&nbsp;</span></b><b><span lang="TH" style="font-size:18.0pt;
        font-family:'TH SarabunPSK',sans-serif;color:#B3186D">${term_th}</span></b></p>${definition_html}`;
    }).join('')}
  </body>
  </html>
  `;

  console.log(`[HTML] HTML content generated successfully.`);
  return htmlContent;
}
// --- End of Helper function ---

// --- Main GET Handler ---
export async function GET(request: Request) {
  console.log(`[API] Export request received for dictId.`);
  let browser = null; // Keep browser reference for cleanup

  try {
    // --- Derive params from URL (avoid typed context argument) ---
    const url = new URL(request.url);
    const searchParams = url.searchParams;
    const format = searchParams.get('format') || 'pdf';
    console.log(`[API] Requested format: ${format}`);
    const segments = url.pathname.split('/').filter(Boolean);
    const dictIdParam = segments[segments.length - 1];
    console.log(`[API] Export request received for dictId: ${dictIdParam}`);
    const dictId = parseInt(dictIdParam, 10);

    if (isNaN(dictId)) {
      console.error(`[API] Invalid dictionary ID provided: ${dictIdParam}`);
      return NextResponse.json({ error: 'Invalid dictionary ID.' }, { status: 400 });
    }
    if (format !== 'pdf') {
      console.error(`[API] Unsupported format requested: ${format}`);
      return NextResponse.json({ error: 'Unsupported format. Only "pdf" is supported in this endpoint.' }, { status: 400 });
    }

    console.log(`[API] Fetching dictionary data for ID: ${dictId}`);
    const dictionary = await prisma.specializedDictionary.findUnique({
      where: { id: dictId },
      select: {
        title: true,
        category: true,
        subcategory: true,
      }
    });

    if (!dictionary) {
      console.warn(`[API] Dictionary not found for ID: ${dictId}`);
      return NextResponse.json({ error: 'Dictionary not found.' }, { status: 404 });
    }
    console.log(`[API] Dictionary found: ${dictionary.title}`);

    console.log(`[API] Fetching dictionary entries for ID: ${dictId}`);
    const entries = await prisma.dictionaryEntry.findMany({
      where: { specializedDictionaryId: dictId },
      select: {
        term_th: true,
        term_en: true,
        definition_html: true,
      },
      orderBy: {
        term_th: { sort: 'asc', nulls: 'last' }
      }
    });
    console.log(`[API] Fetched ${entries.length} entries.`);

    const baseFileName = [
      dictionary.category,
      dictionary.subcategory,
      dictionary.title
    ].filter(part => part).join('_');
    const safeBaseFileName = baseFileName
      .replace(/\s+/g, '-')
      .replace(/_{2,}/g, '-')
      .replace(/[^\w\-\.ก-๙]/gu, '')
      .substring(0, 100);
    const fileExtension = FILE_EXTENSIONS[format];
    console.log(`[API] Constructed filename base: ${safeBaseFileName}${fileExtension}`);
    const dictTitle = dictionary.title;

    if (format === 'pdf') {
      console.log(`[PDF] Starting PDF generation (via HTML) for: ${safeBaseFileName}${fileExtension}`);

      // --- Generate HTML Content ---
      const htmlContent = generateHtmlContent(dictTitle, entries);
      console.log(`[PDF] HTML content created.`);

      // --- Save HTML to temp file ---
      const tempDir = path.join(process.cwd(), 'temp');
      // Ensure temp directory exists
      if (!fs.existsSync(tempDir)){
        fs.mkdirSync(tempDir, { recursive: true });
        console.log(`[TEMP] Created temp directory: ${tempDir}`);
      }
      const tempHtmlFileName = `${safeBaseFileName}_${Date.now()}.html`; // Add timestamp for uniqueness
      const tempHtmlFilePath = path.join(tempDir, tempHtmlFileName);
      try {
         fs.writeFileSync(tempHtmlFilePath, htmlContent, 'utf-8');
         console.log(`[TEMP] HTML content saved to temporary file: ${tempHtmlFilePath}`);
      } catch (writeError: any) {
         console.error(`[TEMP] Failed to write HTML to temporary file ${tempHtmlFilePath}:`, writeError);
         // You might choose to return an error here, or just log and continue
         // For now, we'll log and continue as it's for debugging
      }
      // --- End of Save HTML ---

      // --- Launch Playwright Browser ---
      // Use the directly imported `chromium` object
      console.log(`[PDF] Launching browser...`);
      browser = await chromium.launch({ headless: true }); // Corrected line
      console.log(`[PDF] Browser launched.`);
      const context = await browser.newContext();
      const page = await context.newPage();

      // --- Set HTML Content ---
      console.log(`[PDF] Setting HTML content on page...`);
      await page.setContent(htmlContent, { waitUntil: 'networkidle' }); // Wait for resources
      console.log(`[PDF] HTML content set.`);

      // --- Generate PDF ---
      console.log(`[PDF] Generating PDF from page...`);
      // Adjust PDF options as needed (format, margin, etc.)
      const pdfBuffer = await page.pdf({
        format: 'A4', // Or specify width/height
        margin: {
          top: '20mm',
          bottom: '20mm',
          left: '20mm',
          right: '20mm',
        },
        printBackground: true, // Important for CSS colors/backgrounds
        // displayHeaderFooter: true, // Optional
        // headerTemplate: '<div></div>', // Optional
        // footerTemplate: '<div style="font-size:10px; text-align:center; width:100%;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>', // Optional
      });
      console.log(`[PDF] PDF generated successfully. Size: ${pdfBuffer.byteLength} bytes`);

      // --- Close Browser ---
      await browser.close();
      browser = null; // Mark as closed
      console.log(`[PDF] Browser closed.`);

      // --- Send Response ---
      console.log(`[PDF] Sending PDF response...`);
      // --- Force Download Headers ---
      if(true){
        // Use Uint8Array.from(Buffer) to guarantee BodyInit compatibility (avoids SharedArrayBuffer typing)
        const body = Uint8Array.from(pdfBuffer);
        return new NextResponse(body, {
          status: 200,
          headers: {
            'Content-Type': CONTENT_TYPES.pdf,
            'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(safeBaseFileName + fileExtension)}`, // inline for preview
          },
        });
      }else{
        // Use Uint8Array.from(Buffer) to guarantee BodyInit compatibility (avoids SharedArrayBuffer typing)
        const body = Uint8Array.from(pdfBuffer);
        return new NextResponse(body, {
          status: 200,
          headers: {
            // Using 'application/octet-stream' often forces download more reliably than 'application/pdf'
            'Content-Type': 'application/octet-stream',
            // Ensure the filename is specified for the download
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeBaseFileName + fileExtension)}`,
            // Optional: Suggest the filename again, might help in some edge cases
            'X-Content-Type-Options': 'nosniff' // Tells browser to respect our Content-Type
          },
        });
      }
     
      // --- End Force Download Headers ---
    }

    console.error(`[API] Unsupported format reached logic check: ${format}`);
    return NextResponse.json({ error: 'Unsupported format.' }, { status: 400 });

  } catch (error: any) {
    console.error("[API] Export API Error:", error);

    // --- Ensure Browser is Closed on Error ---
    if (browser) {
      try {
        await browser.close();
        console.log(`[PDF] Browser closed after error.`);
      } catch (closeError) {
        console.error("[PDF] Error closing browser after main error:", closeError);
      }
    }

    if (error.message?.includes('Dictionary not found')) {
      console.error(`[API] Specific Error: Dictionary not found.`);
      return NextResponse.json({ error: 'Dictionary not found.' }, { status: 404 });
    }
    console.error("[API] Unexpected Export Error Details:", error);
    return NextResponse.json({ error: 'Internal server error during export. Please try again later.' }, { status: 500 });

  } finally {
    console.log(`[API] Disconnecting Prisma client.`);
    await prisma.$disconnect();
    console.log(`[API] Prisma client disconnected.`);
    // Double-check browser closure if not handled in catch
    // (Though typically caught errors handle it)
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};