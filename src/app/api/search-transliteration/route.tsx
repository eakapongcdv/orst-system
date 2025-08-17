// src/app/api/search-transliteration/route.tsx
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// --- Helper function to escape special regex characters ---
function escapeRegExp(string: string) {
  const fixedString = string.replace(/\uFFFD/g, ''); // Remove replacement characters
  return fixedString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex metacharacters
}

// --- Helper function to highlight keywords in text ---
function highlightText(text: string | null, keywords: string[]): string {
  // Return original text (or empty string) if no text or no keywords to highlight
  if (!text || keywords.length === 0) {
    return text || '';
  }

  // Create a regex pattern that matches any of the keywords (case-insensitive)
  // \b denotes word boundaries, but omitted here for simplicity and broader matching
  const escapedKeywords = keywords.map(kw => escapeRegExp(kw));
  const regexPattern = `(${escapedKeywords.join('|')})`;
  const regex = new RegExp(regexPattern, 'gi');

  // Replace matched keywords with <mark> tags
  return text.replace(regex, '<mark>$1</mark>');
}

// --- Helper function to calculate a simple relevance score ---
// Counts total occurrences of all keywords in the provided text
function calculateRelevanceScore(text: string | null, keywords: string[]): number {
  if (!text || keywords.length === 0) {
    return 0;
  }
  let score = 0;
  const escapedKeywords = keywords.map(kw => escapeRegExp(kw));
  escapedKeywords.forEach(keyword => {
    // Find all matches for the current keyword
    const matches = text.match(new RegExp(keyword, 'gi'));
    // Add the count of matches to the total score
    score += matches ? matches.length : 0;
  });
  return score;
}

// --- Main GET Handler ---
export async function GET(request: NextRequest) {
  // --- 1. Extract and Validate Query Parameters ---
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q'); // Search keywords (can be multiple words)
  const languageFilter = searchParams.get('language'); // Language filter
  const pageParam = searchParams.get('page'); // Current page number
  const limitParam = searchParams.get('limit'); // Items per page

  // Validate and set defaults for pagination
  const page = pageParam ? Math.max(1, parseInt(pageParam, 10)) : 1; // Page must be at least 1
  const limit = limitParam ? Math.min(100, Math.max(1, parseInt(limitParam, 10))) : 20; // Limit between 1-100, default 20
  const skip = (page - 1) * limit; // Calculate number of items to skip

  // Split the query string into individual keywords, filtering out empty ones
  const keywords = query?.trim() ? query.trim().split(/\s+/).filter(kw => kw.length > 0) : [];

  try {
    let results: any[] = []; // To store the fetched database records
    let totalResults = 0; // Total count of records matching filters
    let isDefaultList = false; // Flag to indicate if no filters were applied

    // --- 2. Build Prisma WHERE Clause ---
    const whereConditions: any = {}; // Object to hold Prisma filter conditions

    // a. Apply language filter if provided and not 'all'
    if (languageFilter && languageFilter.trim() !== '' && languageFilter.trim() !== 'all') {
      whereConditions.language = {
        equals: languageFilter.trim(),
        mode: 'insensitive', // Case-insensitive match for language
      };
    }

    // b. Apply keyword search conditions if a query is provided
    if (query && query.trim() !== '') {
      const searchTerms = query.trim();
      // Use Prisma's 'contains' with 'insensitive' mode for basic text search
      whereConditions.OR = [
        { romanization: { contains: searchTerms, mode: 'insensitive' } },
        { originalScript1: { contains: searchTerms, mode: 'insensitive' } },
        { originalScript2: { contains: searchTerms, mode: 'insensitive' } },
        { transliteration1: { contains: searchTerms, mode: 'insensitive' } },
        { transliteration2: { contains: searchTerms, mode: 'insensitive' } },
        { meaning: { contains: searchTerms, mode: 'insensitive' } },
        { notes: { contains: searchTerms, mode: 'insensitive' } },
        // Add other searchable fields if needed
      ];
    }
    // If neither query nor language filter is active, it's the default list view
    isDefaultList = !(query?.trim() || (languageFilter && languageFilter.trim() !== 'all' && languageFilter.trim() !== ''));

    // --- 3. Perform Database Query ---
    // Fetch the paginated list of entries matching the filters
    // ✅ FIXED: Changed prisma.vocabularyEntry to prisma.transliterationEntry
    results = await prisma.transliterationEntry.findMany({
      where: whereConditions, // Apply the combined filters
      take: limit, // Limit number of results
      skip: skip, // Skip results for pagination
      orderBy: {
        id: 'desc', // Default sorting by ID descending (newest first)
        // Consider sorting by relevance if keywords are present, done later
      }
    });

    // Get the total count of entries matching the filters (for pagination)
    // ✅ FIXED: Changed prisma.vocabularyEntry to prisma.transliterationEntry
    totalResults = await prisma.transliterationEntry.count({
      where: whereConditions, // Apply the same filters for accurate count
    });

    // --- 4. Optional: Sort by Relevance (Client-side calculation) ---
    // If keywords were provided, re-sort the fetched results by relevance score
    if (keywords.length > 0) {
      // a. Calculate relevance score for each result
      const resultsWithScores = results.map(entry => {
        // Combine text from relevant fields for scoring
        const textForScoring = [
          entry.romanization,
          entry.originalScript1,
          entry.originalScript2,
          entry.transliteration1,
          entry.transliteration2,
          entry.meaning,
          entry.notes
        ].filter(text => text !== null).join(' '); // Join non-null texts

        // Calculate the score for this entry
        const score = calculateRelevanceScore(textForScoring, keywords);
        // Return the entry with an added temporary _relevanceScore property
        return { ...entry, _relevanceScore: score };
      });

      // b. Sort the results array by relevance score (descending), then by ID (descending) as tie-breaker
      resultsWithScores.sort((a, b) => {
        if (b._relevanceScore !== a._relevanceScore) {
          return b._relevanceScore - a._relevanceScore; // Higher score first
        }
        return b.id - a.id; // Newer entry first if scores are equal
      });

      // c. Remove the temporary _relevanceScore property before sending response
      results = resultsWithScores.map(({ _relevanceScore, ...rest }) => rest);
    }

    // --- 5. Process Results for Response (Highlighting & Formatting) ---
    const processedResults = results.map(entry => {
      // Apply highlighting to relevant text fields
      const highlightedRomanization = highlightText(entry.romanization, keywords);
      const highlightedOriginalScript1 = highlightText(entry.originalScript1, keywords);
      const highlightedOriginalScript2 = highlightText(entry.originalScript2, keywords);
      const highlightedTransliteration1 = highlightText(entry.transliteration1, keywords);
      const highlightedTransliteration2 = highlightText(entry.transliteration2, keywords);
      const highlightedMeaning = highlightText(entry.meaning, keywords);
      const highlightedNotes = highlightText(entry.notes, keywords);

      // Format the publication date for display
      let formattedPublicationDate = null;
      if (entry.publicationDate) {
        try {
          // Convert to YYYY-MM-DD string
          formattedPublicationDate = new Date(entry.publicationDate).toISOString().split('T')[0];
        } catch (e) {
          console.error("Error formatting publication date:", entry.publicationDate, e);
          formattedPublicationDate = "Invalid Date"; // Fallback if formatting fails
        }
      }

      // Return the entry with highlighted fields and formatted date
      return {
        ...entry,
        romanization: highlightedRomanization,
        originalScript1: highlightedOriginalScript1,
        originalScript2: highlightedOriginalScript2,
        transliteration1: highlightedTransliteration1,
        transliteration2: highlightedTransliteration2,
        meaning: highlightedMeaning,
        notes: highlightedNotes,
        formattedPublicationDate: formattedPublicationDate,
      };
    });

    // --- 6. Prepare and Send JSON Response ---
    const responseBody = {
      results: processedResults, // The main data array
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalResults / limit),
        totalResults: totalResults,
        hasNextPage: page < Math.ceil(totalResults / limit),
        hasPrevPage: page > 1,
      },
      isDefaultList: isDefaultList, // Indicates if it's an unfiltered list
      query: query || null, // Echo back the search query
      languageFilter: languageFilter || null, // Echo back the language filter
    };

    // Create the Next.js response object
    const response = NextResponse.json(responseBody);
    // Set the content type header explicitly for UTF-8
    response.headers.set('Content-Type', 'application/json; charset=utf-8');
    return response;

  } catch (error: any) {
    // --- 7. Handle Errors ---
    console.error('Search Vocabulary API error:', error);
    // Prepare a user-friendly error response
    const errorResponse = NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการค้นหาคำศัพท์ กรุณาลองใหม่อีกครั้ง' },
      { status: 500 } // Internal Server Error
    );
    // Set the content type header for the error response
    errorResponse.headers.set('Content-Type', 'application/json; charset=utf-8');
    return errorResponse;
  } finally {
    // --- 8. Cleanup ---
    // Ensure the database connection is closed
    await prisma.$disconnect();
  }
}

// --- Handle unsupported HTTP methods ---
export async function POST(request: NextRequest) {
  return NextResponse.json({ error: 'Method POST Not Allowed' }, { status: 405 });
}
// --- Force dynamic rendering for this route ---
export const dynamic = 'force-dynamic';