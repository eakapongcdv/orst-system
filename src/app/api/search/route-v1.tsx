// app/api/search/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import OSS from 'ali-oss';

const prisma = new PrismaClient();

// Initialize OSS client
const client = new OSS({
  region: 'oss-ap-southeast-7',
  accessKeyId: process.env.OSS_ACCESS_KEY_ID || 'LTAI5t7njwp2jQiCr15W7oD5',
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
  bucket: 'oss-cdv-doc-master',
});

// Helper function to escape special regex characters
function escapeRegExp(string: string) {
  // First, attempt to fix encoding issues
  const fixedString = string.replace(/\uFFFD/g, '');
  // Then, escape special regex characters in the (potentially fixed) string
  return fixedString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper function to highlight keywords in text
function highlightText(text: string, keywords: string[]): string {
  if (!text || keywords.length === 0) {
    return text || '';
  }

  const escapedKeywords = keywords.map(kw => escapeRegExp(kw));
  const regex = new RegExp(`(${escapedKeywords.join('|')})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

// Helper function to find a snippet of text containing the keywords
function findSnippet(text: string, keywords: string[], snippetLength: number = 2000): string {
  if (!text) return '';

  const escapedKeywords = keywords.map(kw => escapeRegExp(kw));
  const combinedKeywordsPattern = escapedKeywords.join('|');
  const regex = new RegExp(combinedKeywordsPattern, 'i');

  const matchIndex = text.search(regex);

  if (matchIndex === -1) {
    return text.substring(0, snippetLength) + (text.length > snippetLength ? '...' : '');
  }

  let start = Math.max(0, matchIndex - Math.floor(snippetLength / 2));
  let end = Math.min(text.length, matchIndex + Math.floor(snippetLength / 2) + combinedKeywordsPattern.length);

  if (start > 0) {
    const spaceIndex = text.lastIndexOf(' ', start);
    if (spaceIndex > -1) start = spaceIndex + 1;
  }
  if (end < text.length) {
    const spaceIndex = text.indexOf(' ', end);
    if (spaceIndex > -1) end = spaceIndex;
  }

  let snippet = text.substring(start, end);

  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';

  return snippet.trim();
}

// Helper function to generate signed URL for OSS object
async function generateSignedUrl(ossKey: string): Promise<string> {
  try {
    // Generate a signed URL that expires in 1 hour (3600 seconds)
    const url = client.signatureUrl(ossKey, {
      expires: 3600, // URL expires in 1 hour
      method: 'GET'
    });
    return url;
  } catch (error) {
    console.error('Error generating signed URL:', error);
    // Return the original URL or a fallback
    return `http://oss-cdv-doc-master.oss-ap-southeast-7.aliyuncs.com/${ossKey}`;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  const keywords = query?.trim() ? query.trim().split(/\s+/).filter(kw => kw.length > 0) : [];

  try {
    let results;
    let isDefaultList = false;

    if (!query || query.trim() === '') {
      isDefaultList = true;
      results = await prisma.document.findMany({
        select: {
          id: true,
          name: true,
          type: true,
          size: true,
          url: true,
          content: true,
          updatedAt: true,
          ossKey: true,
        },
        take: 50,
        orderBy: {
          updatedAt: 'desc',
        },
      });
    } else {
      results = await prisma.document.findMany({
        where: {
          OR: [
            {
              name: {
                contains: query.trim(),
                mode: 'insensitive',
              },
            },
            {
              content: {
                contains: query.trim(),
                mode: 'insensitive',
              },
            },
          ],
        },
        select: {
          id: true,
          name: true,
          type: true,
          size: true,
          url: true,
          content: true,
          updatedAt: true,
          ossKey: true,
        },
        take: 20,
        orderBy: {
          updatedAt: 'desc',
        },
      });
    }

    // Process results and generate new signed URLs for each document
    const processedResults = await Promise.all(results.map(async (doc) => {
      // 1. Highlight keywords in the document name
      const highlightedName = highlightText(doc.name, keywords);

      // 2. Find and highlight a snippet from the content
      let contentPreview = '';
      if (doc.content) {
        const snippet = findSnippet(doc.content, keywords);
        contentPreview = highlightText(snippet, keywords);
      }

      // 3. Generate new signed URL for each document
      const signedUrl = await generateSignedUrl(doc.ossKey);

      return {
        ...doc,
        url: signedUrl, // Use the newly generated signed URL
        name: highlightedName,
        contentPreview: contentPreview,
        description: `${doc.type.split('/')[1]?.toUpperCase() || 'FILE'} • ${formatFileSize(doc.size)}`,
      };
    }));

   
     // Fix: Return response with proper UTF-8 encoding headers
    const response = NextResponse.json({ results: processedResults });
    response.headers.set('Content-Type', 'application/json; charset=utf-8');
    return response;

  } catch (error) {
    console.error('Search API error:', error);
    const errorResponse = NextResponse.json({ error: 'เกิดข้อผิดพลาดในการค้นหา กรุณาลองใหม่อีกครั้ง' }, { status: 500 });
    errorResponse.headers.set('Content-Type', 'application/json; charset=utf-8');
    return errorResponse;
  } finally {
    await prisma.$disconnect();
  }
}

// Helper function for description formatting
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}