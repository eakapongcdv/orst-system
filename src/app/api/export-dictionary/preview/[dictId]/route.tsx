// src/app/api/export-dictionary/preview/[dictId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
// We don't need Playwright for HTML preview, but we do need the HTML generation logic
// import { chromium } from 'playwright-chromium'; // Not needed for preview

const prisma = new PrismaClient();

// --- Reuse the HTML Generation Logic ---
// Consider moving this function to a shared utility file to avoid duplication
async function loadHtmlTemplate(templateId: number | string): Promise<string> {
  try {
    // Dynamically import 'fs' and 'path' only when needed (server-side)
    const { promises: fs } = await import('fs');
    const path = await import('path');
    // Construct the filename based on the template ID
    const filename = path.join(process.cwd(), 'public', `template_${templateId}_docx.template`);
    console.log(`[PREVIEW] Attempting to load template: ${filename}`);
    // Read the file asynchronously
    const html = await fs.readFile(filename, 'utf8');
    console.log(`[PREVIEW] Successfully loaded template: ${filename} (Length: ${html.length} chars)`);
    return html;
  } catch (error: any) {
    // Handle potential errors, such as file not found
    const errorMsg = `Failed to load HTML template for ID ${templateId} from ${require('path').join(process.cwd(), 'public', `template_${templateId}_docx.template`)}. Error: ${error.message}`;
    console.error(`[PREVIEW] Error loading template file:`, error);
    // Optionally, return a basic HTML template or re-throw the error
    // For now, re-throw to let the main handler deal with it
    throw new Error(errorMsg);
  }
}

// --- Helper function to generate HTML ---
// Keep this function, potentially identical to the one in the PDF route
function generateHtmlContent(dictTitle: string, entries: any[]) {
  console.log(`[PREVIEW] Generating HTML content for title: ${dictTitle}, entries count: ${entries.length}`);

  // --- Include Font Definitions in CSS ---
  // Make sure the font files (e.g., TH-SarabunPSK.ttf) are accessible via your Next.js public directory
  // e.g., public/fonts/TH-SarabunPSK.ttf
  // Note: For preview in a browser, relative paths from the API response URL context matter.
  // Paths like '/fonts/...' will resolve relative to the frontend origin.
  const htmlContent = `
  <!DOCTYPE html>
  <html lang="th">
  <head>
    <meta charset="UTF-8">
    <title>${dictTitle}</title>
    <style>
      body {
        font-family: 'TH Sarabun New', 'TH SarabunPSK', sans-serif; /* Fallback fonts */
        font-size: 14pt; /* Use pt for consistency */
        margin: 20mm; /* Add some margin */
        /* Ensure background is white for preview */
        background-color: white;
        color: black;
      }
      h1 {
        font-size: 22pt;
        font-weight: bold;
        text-align: center;
        margin-bottom: 15mm;
        color: #333; /* Slightly darker for better preview contrast */
      }
      .entry {
         margin-bottom: 5mm; /* Space between entries */
         page-break-inside: avoid; /* Try to keep entries together */
      }
      .term_th {
        font-size: 16pt;
        font-weight: bold;
        margin-bottom: 2mm;
        color: #B3186D; /* Use the color from your original snippet */
      }
      .term_en {
        font-size: 14pt;
        font-style: italic;
        margin-bottom: 2mm;
        color: #B3186D; /* Use the color from your original snippet */
      }
      .definition {
        font-size: 14pt;
        margin-bottom: 5mm;
      }
      .definition p {
        margin-top: 0;
        margin-bottom: 1em;
      }

      /* --- Define Custom Fonts --- */
      /* Ensure these font files exist and are accessible to the frontend */
      /* The browser loading the preview will fetch these from /fonts/ relative to your site */
      @font-face {
        font-family: 'TH SarabunPSK';
        src: url('/fonts/TH-SarabunPSK.ttf') format('truetype'); /* Adjust path if needed */
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
      /* -------------------------- */
    </style>
  </head>
  <body>
    <h1 style="font-size:24.0pt;
        font-family:'TH SarabunPSK',sans-serif;color:#B3186D">${dictTitle}</h1>
    
    ${entries.map(entry => {
      // Use the same HTML structure as in the PDF generation route
      const term_en = entry.term_en || '';
      const term_th = entry.term_th || '';

      // --- Important: Sanitize or Trust definition_html ---
      // Assuming definition_html is already safe HTML from your data source.
      // If it comes from user input, you MUST sanitize it on the backend (e.g., using 'xss' library)
      // before injecting it here to prevent XSS vulnerabilities.
      const definition_html = entry.definition_html || '<p>&nbsp;</p>';
      // --- End Sanitization Note ---

      // Use the structure from Pasted_Text_1754578100584.txt for consistency
      // Note: The original snippet used <p class="MsoNormal"...> which is Word-specific.
      // For a general HTML preview, simpler structure might be better, but we'll keep it
      // as it likely contains necessary styling from the source.
      return `<p class="MsoNormal" style="margin-top:6.0pt;margin-right:0cm;margin-bottom:0cm;
        margin-left:30.05pt;margin-bottom:.0001pt;text-indent:-30.05pt"><b><span lang="EN-US" style="font-size:18.0pt;font-family:'TH SarabunPSK',sans-serif;
        color:#B3186D">${term_en}&nbsp;&nbsp;&nbsp;</span></b><b><span lang="TH" style="font-size:18.0pt;
        font-family:'TH SarabunPSK',sans-serif;color:#B3186D">${term_th}</span></b></p>${definition_html}`;
    }).join('')}
  </body>
  </html>
  `;

  console.log(`[PREVIEW] HTML content generated successfully.`);
  return htmlContent;
}
// --- End of Helper function ---

// --- Main GET Handler ---
export async function GET(request: NextRequest, { params }: { params: Promise<{ dictId: string }> }) {
  console.log(`[PREVIEW_API] Preview request received for dictId.`);
  try {
    // --- Await params to get the actual values ---
    const awaitedParams = await params;
    const dictIdParam = awaitedParams.dictId;
    console.log(`[PREVIEW_API] Preview request received for dictId: ${dictIdParam}`);
    const dictId = parseInt(dictIdParam, 10);
    // const { searchParams } = new URL(request.url);
    // const format = searchParams.get('format') || 'html'; // Format is implicitly HTML for preview
    // console.log(`[PREVIEW_API] Requested format: ${format}`); // Not really needed for preview

    if (isNaN(dictId)) {
      console.error(`[PREVIEW_API] Invalid dictionary ID provided: ${dictIdParam}`);
      return NextResponse.json({ error: 'Invalid dictionary ID.' }, { status: 400 });
    }
    // No format check needed as this endpoint is specifically for HTML preview

    console.log(`[PREVIEW_API] Fetching dictionary data for ID: ${dictId}`);
    const dictionary = await prisma.specializedDictionary.findUnique({
      where: { id: dictId },
      select: {
        title: true,
        category: true,
        subcategory: true,
      }
    });

    if (!dictionary) {
      console.warn(`[PREVIEW_API] Dictionary not found for ID: ${dictId}`);
      return NextResponse.json({ error: 'Dictionary not found.' }, { status: 404 });
    }
    console.log(`[PREVIEW_API] Dictionary found: ${dictionary.title}`);

    console.log(`[PREVIEW_API] Fetching dictionary entries for ID: ${dictId}`);
    const entries = await prisma.dictionaryEntry.findMany({
      where: { specializedDictionaryId: dictId },
      select: {
        term_th: true,
        term_en: true,
        definition_html: true, // Important: We use the HTML definition directly
      },
      orderBy: {
        term_th: { sort: 'asc', nulls: 'last' }
      }
    });
    console.log(`[PREVIEW_API] Fetched ${entries.length} entries.`);

    // Filename construction not strictly needed for preview response body,
    // but useful for logging or potential future header use
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
    // const fileExtension = '.html'; // Implicit for this endpoint
    console.log(`[PREVIEW_API] Constructed filename base (for reference): ${safeBaseFileName}.html`);
    const dictTitle = dictionary.title;

    // --- Generate HTML Content for Preview ---
    console.log(`[PREVIEW] Starting HTML generation for preview: ${safeBaseFileName}.html`);
    const htmlContent = generateHtmlContent(dictTitle, entries);
    console.log(`[PREVIEW] HTML content created.`);

    // --- Send HTML Response ---
    console.log(`[PREVIEW] Sending HTML response for preview...`);
    return new NextResponse(htmlContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8', // Correct MIME type for HTML
        // Optional: Suggest a filename if user saves the preview page
        // 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(safeBaseFileName + '.html')}`,
      },
    });

  } catch (error: any) {
    console.error("[PREVIEW_API] Preview API Error:", error);

    if (error.message?.includes('Dictionary not found')) {
      console.error(`[PREVIEW_API] Specific Error: Dictionary not found.`);
      return NextResponse.json({ error: 'Dictionary not found.' }, { status: 404 });
    }
    if (error.message?.includes('Failed to load HTML template')) {
       console.error(`[PREVIEW_API] Template Loading Error: ${error.message}`);
       return NextResponse.json({ error: 'Configuration error: Template file not found or unreadable.' }, { status: 500 });
    }
    console.error("[PREVIEW_API] Unexpected Preview Error Details:", error);
    return NextResponse.json({ error: 'Internal server error during preview generation. Please try again later.' }, { status: 500 });

  } finally {
    console.log(`[PREVIEW_API] Disconnecting Prisma client.`);
    await prisma.$disconnect();
    console.log(`[PREVIEW_API] Prisma client disconnected.`);
  }
}

// Optional: Disable bodyParser if you don't expect any body in the request
export const config = {
  api: {
    bodyParser: false,
  },
};