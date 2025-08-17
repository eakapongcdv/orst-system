// app/api/file-manager/upload/route.ts
// --- Import the core-js polyfill for Promise.withResolvers ---
import 'core-js/actual/promise/with-resolvers'; // Add this line at the top
// --- End Import polyfill ---
import { NextRequest } from 'next/server';
import OSS from 'ali-oss';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import * as mammoth from 'mammoth'; // Mammoth for DOCX (and attempting DOC, though it won't work well)
import * as ExcelJS from 'exceljs';
// --- Import pdfjs-dist and the generic worker ---
import * as pdfjsLib from 'pdfjs-dist';
import path from 'path';
// --- Removed libreoffice-convert import ---
// import libre from 'libreoffice-convert';
// import { promisify } from 'util';
// const convertAsync = promisify(libre.convert); // Promisify the convert function
// --- End Removed libreoffice-convert import ---
const prisma = new PrismaClient();
// Initialize OSS Client
const ossClient = new OSS({
  region: process.env.OSS_REGION!,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID!,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET!,
  bucket: process.env.OSS_BUCKET_NAME!,
  // Assumes bucket is private or objects are private.
  // `signatureUrl` works for private objects.
});
// --- Configure pdfjs-dist worker for SERVER-SIDE ---
// Construct the absolute path to the worker file within node_modules
const workerPath = path.resolve(
  process.cwd(), // Gets the current working directory of the Next.js app
  'node_modules',
  'pdfjs-dist',
  'build',
  'pdf.worker.mjs'
);
console.log(`Setting pdfjs workerSrc to: ${workerPath}`);
pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;
// --- End Configure pdfjs-dist worker ---

// --- NEW FUNCTION: Extract HTML content from DOC/DOCX files using Mammoth ---
// Note: Mammoth works well for DOCX, but has limited/no support for the older DOC binary format.
/**
 * Extracts HTML content from DOC/DOCX files using Mammoth.
 * @param buffer The file buffer.
 * @param mimeType The MIME type ('application/msword' or 'application/vnd.openxmlformats-officedocument.wordprocessingml.document').
 * @returns A Promise resolving to the extracted HTML string.
 */
async function extractHtmlContent(buffer: Buffer, mimeType: string): Promise<string> {
  try {
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') { // .docx
      console.log(`Starting HTML extraction for .docx using mammoth`);
      if (!Buffer.isBuffer(buffer)) {
        console.error("Provided data is not a valid Node.js Buffer for HTML extraction");
        return `<p>[HTML Content extraction failed: Invalid data type]</p>`;
      }

      // Use mammoth.convertToHtml for HTML output (works well for .docx)
      const result = await mammoth.convertToHtml({ buffer: buffer });
      console.log(`Completed HTML extraction using mammoth for .docx. Messages:`, result.messages); // Log any warnings/errors from Mammoth
      return result.value || ''; // `result.value` contains the HTML string

    } else if (mimeType === 'application/msword') { // .doc (Binary format - Mammoth limitation)
      console.warn(`Attempting HTML extraction for .doc using mammoth. This is unlikely to work correctly as mammoth primarily supports .docx.`);
      
      if (!Buffer.isBuffer(buffer)) {
        console.error("Provided data is not a valid Node.js Buffer for HTML extraction");
        return `<p>[HTML Content extraction failed: Invalid data type]</p>`;
      }

      try {
        // Try anyway, but expect it to fail or produce garbled output
        const result = await mammoth.convertToHtml({ buffer: buffer });
        console.log(`Attempted HTML extraction using mammoth for .doc. Messages:`, result.messages);
        // Check messages for critical errors?
        return result.value || `<p>[HTML Content extraction produced no output for .doc]</p>`;
      } catch (docError) {
        console.error(`Error during mammoth HTML extraction attempt for .doc:`, docError);
        return `<p>[HTML Content extraction failed for .doc using mammoth: Unsupported format or error]</p>`;
      }

    } else {
      console.warn(`extractHtmlContent called for unsupported MIME type: ${mimeType}`);
      return `<p>[HTML Content extraction not supported for this file type]</p>`;
    }
  } catch (err) {
    console.error(`Error extracting HTML content for MIME type ${mimeType}:`, err);
    const errorMessage = (err as Error).message;
    return `<p>[HTML Content extraction failed: ${errorMessage}]</p>`;
  }
}
// --- END NEW FUNCTION ---

/**
 * Sanitizes a string to be used as an OSS metadata value.
 * Removes or replaces characters that are not allowed in HTTP headers.
 * Ref: OSS Metadata naming rules and HTTP header value restrictions.
 * @param {string | null | undefined} value - The string to sanitize.
 * @param {boolean} isFilename - If true, applies stricter sanitization suitable for filenames.
 * @returns {string} - The sanitized string. Returns an empty string if input is null/undefined.
 */
function sanitizeMetadataValue(value: string | null | undefined, isFilename: boolean = false): string {
  if (value === null || value === undefined) {
    return ''; // Return empty string for null/undefined
  }
  // 1. Convert to string (in case it's a number, etc.)
  let stringValue = String(value);
  // 2. Trim leading/trailing whitespace
  stringValue = stringValue.trim();
  if (isFilename) {
    // --- Stricter sanitization for filenames meant for metadata ---
    // Replaces non-alphanumeric, non-underscore, non-dot, non-hyphen, non-space characters.
    stringValue = stringValue.replace(/[^a-zA-Z0-9_.\- ]/g, '_');
    // Collapse multiple underscores/spaces into a single one
    stringValue = stringValue.replace(/[_\s]+/g, '_');
    // Ensure it doesn't start/end with an underscore (cleaner)
    stringValue = stringValue.replace(/^_+|_+$/g, '');
    // Provide a default name if everything was stripped
    if (!stringValue) {
       stringValue = 'unnamed_file';
    }
    // --- End Stricter sanitization ---
  } else {
    // Standard sanitization for other metadata (userId, folderId)
    // Remove or replace invalid characters (basic control characters).
    stringValue = stringValue.replace(/[\x00-\x1F\x7F]+/g, '_');
    // Ensure the resulting string isn't empty or just underscores
    if (stringValue === '_' || stringValue === '') {
        return 'unnamed_item';
    }
  }
  return stringValue;
}
/**
 * Sanitizes extracted text/html to ensure it's valid UTF-8 for database storage.
 * Removes or replaces invalid byte sequences, especially Null bytes.
 * @param {string} text - The text/html to sanitize.
 * @returns {string} - The sanitized text/html.
 */
function sanitizeExtractedText(text: string): string {
  if (!text) return text; // Handle null/undefined/empty
  // 1. Remove Null bytes (\x00) which are invalid in PostgreSQL text fields
  // 2. Optionally, remove other control characters if needed
  return text.replace(/\x00/g, ''); // Remove all Null bytes
  // Alternative: Replace with a placeholder (less common need)
  // return text.replace(/\x00/g, '[NULL_BYTE_REMOVED]');
}
// --- Updated Helper Functions for Content Extraction ---
// --- Keep extractContent function for non-DOC/DOCX files (PDF, XLSX, CSV) ---
async function extractContent(buffer: Buffer, mimeType: string): Promise<string> {
  try {
    switch (mimeType) {
      // --- REMOVED DOCX CASE HERE AS IT'S NOW HANDLED BY extractHtmlContent ---
      /*
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': // .docx
        console.log(`Starting .docx extraction using mammoth`);
        // ... existing mammoth.extractRawText logic ...
        return docxResult.value?.trim() || '';
      */
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': // .xlsx
        const workbook = new ExcelJS.Workbook();
        // ExcelJS type definitions in some setups only declare Buffer; cast to any to satisfy TS while runtime accepts Node Buffer
        await workbook.xlsx.load(buffer as any);
        let text = '';
        workbook.eachSheet((worksheet) => {
          worksheet.eachRow((row, rowNumber) => {
            row.eachCell((cell) => {
              const cellValue = cell.value?.toString()?.trim() ?? '';
              if (cellValue) {
                 text += cellValue + ' ';
              }
            });
            text = text.trim() + '\n'; // New line after each row, trim trailing space
          });
        });
        return text.trim();
      // --- Replaced pdf-parse with pdfjs-dist for PDF ---
      case 'application/pdf':
        console.log(`Starting PDF extraction using pdfjs-dist`);
        const uint8Array = new Uint8Array(buffer);
        // --- Use the configured worker ---
        const pdfDocument = await pdfjsLib.getDocument({ data: uint8Array }).promise; // Ensure 'data:' key is present
        // --- End Use configured worker ---
        console.log(`Successfully loaded PDF using pdfjs-dist. Found ${pdfDocument.numPages} pages.`);
        let fullText = '';
        for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
          console.log(`Extracting text from page ${pageNum}`);
          const page = await pdfDocument.getPage(pageNum);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item: any) => item.str)
            .join(' ');
          fullText += pageText + '\n'; // New line after each page
        }
        console.log(`Completed text extraction using pdfjs-dist.`);
        return fullText?.trim() || '';
      // --- End Replaced pdf-parse ---
      case 'text/csv':
        // UTF-8 is standard for CSV, should handle Thai if encoded correctly
        return buffer.toString('utf-8').trim();
      // --- REMOVED/COMMENTED OUT DOC FALLBACK AS IT'S NOW HANDLED BY extractHtmlContent ---
      /*
      case 'application/msword': // .doc - Basic fallback
        console.warn(`Basic text extraction attempted for .doc file. This is not ideal.`);
        return buffer.toString('latin1', 0, Math.min(buffer.length, 20000)).trim();
      */
      case 'application/vnd.ms-excel': // .xls - Placeholder
         console.warn(`Text extraction for .xls not implemented in this example. Consider using a dedicated .xls parser.`);
         return `[Content extraction for .xls files is not supported in this version]`;
      default:
        console.warn(`No extractor configured for MIME type: ${mimeType}`);
        return '';
    }
  } catch (err) {
    console.error(`Error extracting content for MIME type ${mimeType}:`, err);
    const errorMessage = (err as Error).message;
    if (mimeType === 'application/pdf') {
       return `[PDF Content extraction failed with pdfjs-dist: ${errorMessage}]`;
    } else {
       return `[Content extraction failed: ${errorMessage}]`;
    }
  }
}
// --- End Updated Helper Functions ---
// Function to get the current authenticated user's ID from the JWT cookie
async function getCurrentUserId(request: NextRequest): Promise<number | null> {
  try {
    const token = request.cookies.get("auth-token")?.value;
    if (!token) {
      console.warn("No auth-token cookie found in upload request");
      return null;
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
    if (typeof decoded === 'object' && decoded !== null && 'userId' in decoded) {
      return Number(decoded.userId);
    } else {
      console.error("Invalid token payload structure for upload:", decoded);
      return null;
    }
  } catch (error) {
    console.error("Error getting/verifying user ID from token in upload route:", error);
    return null;
  }
}
export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId(request);
  if (!userId) {
    return Response.json(
      { error: 'Unauthorized: Invalid or missing authentication token' },
      { status: 401 }
    );
  }
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const folderIdParam = formData.get('folderId');
    let folderId: number | null = null;
    if (folderIdParam !== null && folderIdParam !== undefined) {
      const parsedFolderId = parseInt(folderIdParam.toString(), 10);
      if (isNaN(parsedFolderId)) {
        return Response.json({ error: 'Invalid folderId format provided' }, { status: 400 });
      }
      const folder = await prisma.folder.findUnique({
        where: { id: parsedFolderId }
      });
      if (!folder) {
        return Response.json({ error: 'Folder not found' }, { status: 404 });
      }
      if (folder.userId !== userId) {
        return Response.json({ error: 'You do not have permission to upload to this folder' }, { status: 403 });
      }
      folderId = parsedFolderId;
    }
    if (files.length === 0) {
      return Response.json({ error: 'No files provided' }, { status: 400 });
    }
    const processedFilesData = [];
    for (const file of files) {
      // --- Store original file details for potential use ---
      let originalFileName = file.name;
      let originalFileType = file.type;
      let originalFileSize = file.size; // Store original size
      // --- Validate file type and size (your existing logic) ---
      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/msword', // .doc - Allowed, but direct conversion attempted
        'application/vnd.ms-excel', // .xls
        'text/csv'
      ];
      if (!allowedTypes.includes(file.type)) {
        return Response.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 });
      }
      const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
      if (file.size > MAX_FILE_SIZE) {
        return Response.json({
          error: `File ${file.name} is too large. Maximum size is 200MB.`
        }, { status: 400 });
      }
      // --- End validation ---
      let arrayBuffer = await file.arrayBuffer();
      let buffer = Buffer.from(arrayBuffer);
      originalFileSize = buffer.byteLength; // Size of the buffer

      // --- REMOVED DOC to DOCX Conversion Logic ---
      // No conversion logic here anymore
      // --- End REMOVED DOC to DOCX Conversion Logic ---

      // --- Generate unique OSS key (using original filename) ---
      const fileExtension = originalFileName.split('.').pop();
      const uniqueFileName = `${uuidv4()}.${fileExtension}`;
      let ossKey: string;
      if (folderId !== null) {
        ossKey = `uploads/user-${userId}/folder-${folderId}/${uniqueFileName}`;
      } else {
        ossKey = `uploads/user-${userId}/${uniqueFileName}`;
      }
      // --- End OSS key generation ---

      // --- 1. Upload file to Private OSS (using original buffer/type/name) ---
      // Sanitize ALL metadata values before sending to OSS
      const sanitizedOriginalName = sanitizeMetadataValue(originalFileName, true);
      const sanitizedUserId = sanitizeMetadataValue(userId.toString());
      const sanitizedFolderId = sanitizeMetadataValue(folderId?.toString());
      console.log(`Sanitizing metadata for file: ${originalFileName}`);
      console.log(`  Original Name: '${originalFileName}' -> Sanitized: '${sanitizedOriginalName}'`);
      console.log(`  User ID: '${userId}' -> Sanitized: '${sanitizedUserId}'`);
      console.log(`  Folder ID: '${folderId}' -> Sanitized: '${sanitizedFolderId}'`);

      await ossClient.put(ossKey, buffer, { // Use original `buffer`
        headers: {
          'x-oss-meta-originalname': sanitizedOriginalName,
          'x-oss-meta-uploadedbyuserid': sanitizedUserId,
          'x-oss-meta-folderid': sanitizedFolderId,
        }
      });
      console.log(`File ${originalFileName} uploaded to OSS at key: ${ossKey}`);
      // --- End Upload to OSS ---

      // --- 2. Extract Content (direct conversion for DOC/DOCX) ---
      console.log(`Starting content extraction for ${originalFileName} (${originalFileType})`);

      let extractedContent = ''; // Variable to hold final content (HTML or text)

      if (originalFileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || // .docx
          originalFileType === 'application/msword') { // .doc (Direct attempt with mammoth)
        // Use the new function to extract HTML content for both DOC and DOCX
        // Note: This will work well for DOCX, but likely fail or produce poor results for DOC
        extractedContent = await extractHtmlContent(buffer, originalFileType); // Use original `buffer` and `originalFileType`
        console.log(`HTML content extraction completed for ${originalFileName}. Extracted ${extractedContent.length} characters.`);
      } else {
        // Use the existing extractContent logic for other file types (PDF, XLSX, CSV)
        extractedContent = await extractContent(buffer, originalFileType); // Use original `buffer` and `originalFileType`
        console.log(`Content extraction completed for ${originalFileName}. Extracted ${extractedContent.length} characters.`);
        // Sanitize the extracted text (for non-DOC/DOCX files)
        console.log(`Sanitizing extracted text for ${originalFileName}`);
        extractedContent = sanitizeExtractedText(extractedContent); // Sanitize extracted text
        // Note: The outer sanitization step below will run for all content types
      }
      // --- End Extract Content ---

      // --- 3. Sanitize Extracted Content (HTML or Text) for DB Storage ---
      // Apply the same sanitization function to the HTML content as well (removes null bytes etc.)
      console.log(`Sanitizing extracted content (HTML or Text) for ${originalFileName}`);
      const sanitizedExtractedContent = sanitizeExtractedText(extractedContent); // Sanitize HTML too
      if (sanitizedExtractedContent.length !== extractedContent.length) {
         console.log(`Sanitized final content for ${originalFileName}. New length: ${sanitizedExtractedContent.length} characters.`);
         extractedContent = sanitizedExtractedContent;
      }
      // --- End Sanitize Extracted Content ---

      // --- 4. Generate Signed URL for Preview (e.g., expires in 1 hour) ---
      const signedUrlExpirySeconds = 3600 * 1; // 1 hour
      const signedUrl = ossClient.signatureUrl(ossKey, { expires: signedUrlExpirySeconds });
      console.log(`Generated signed URL for ${originalFileName}`);
      // --- End Generate Signed URL ---

      // --- 5. Save to Database (use original name/type/size, sanitized HTML/text content) ---
      const dbDocument = await prisma.document.create({
        data : {
          name: originalFileName, // Store the original name
          type: originalFileType, // Store the original MIME type
          size: originalFileSize, // Use the size of the original buffer
          url: signedUrl,
          ossKey: ossKey,
          // --- Use the potentially sanitized extracted HTML/text content ---
          content: extractedContent, // <-- This is now the sanitized HTML for DOC/DOCX (if successful), or sanitized text for others
          // --- End Use sanitized content ---
          userId: userId,
          folderId: folderId,
        },
      });
      console.log(`Document metadata (including HTML/text content) saved to DB for ${originalFileName} (ID: ${dbDocument.id})`);
      // --- End Save to Database ---

      // --- 6. Prepare Response Data for the Frontend (use original name/type/size, sanitized content for preview) ---
      processedFilesData.push({
        id: dbDocument.id,
        documentId: dbDocument.id,
        name: dbDocument.name, // This will be the original name
        type: dbDocument.type, // This will be the original MIME type
        size: dbDocument.size, // This will be the original size
        url: dbDocument.url,
        contentPreview: extractedContent , // Send the full sanitized content (HTML or text)
        uploadedAt: dbDocument.createdAt.toISOString(),
        folderId: dbDocument.folderId,
        ossKey: dbDocument.ossKey,
      });
      // --- End Prepare Response Data ---
    }
    return Response.json({
      message: 'Files processed, uploaded to private OSS, content extracted (HTML for DOC/DOCX using Mammoth directly, text for others, with pdfjs-dist for PDFs). No .doc to .docx conversion performed.',
      processedFiles: processedFilesData,
      warning: 'Note: Direct HTML conversion for .doc files using Mammoth is not supported and will likely fail. .docx files are handled correctly.' // Added warning
    });
  } catch (error) {
    console.error('Processing/Upload error:', error);
    let errorMessage = 'Internal server error during file processing';
    if (error instanceof Error) {
        console.error('Detailed error:', error.stack);
        if (error.message.includes('Invalid character in header content')) {
            errorMessage = 'Filename contains characters incompatible with storage metadata.';
        }
    }
    return Response.json({ error: errorMessage }, { status: 500 });
  } finally {
    // Removed await prisma.$disconnect(); for consistency and best practices.
    // Prisma handles connection pooling automatically.
  }
}