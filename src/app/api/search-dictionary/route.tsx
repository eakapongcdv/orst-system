// app/api/search-dictionary/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Escape RegExp special characters
function escapeRegExp(string: string) {
  const fixedString = string.replace(/\uFFFD/g, '');
  return fixedString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Highlight keywords in text
function highlightText(text: string | null, keywords: string[]): string {
  if (!text || keywords.length === 0) return text || '';
  const escapedKeywords = keywords.map(kw => escapeRegExp(kw));
  const regexPattern = `(${escapedKeywords.join('|')})`;
  const regex = new RegExp(regexPattern, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

// Calculate relevance score
function calculateRelevanceScore(text: string | null, keywords: string[]): number {
  if (!text || keywords.length === 0) return 0;
  let score = 0;
  const escapedKeywords = keywords.map(kw => escapeRegExp(kw));
  escapedKeywords.forEach(keyword => {
    const matches = text.match(new RegExp(keyword, 'gi'));
    score += matches ? matches.length : 0;
  });
  return score;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q'); // keywords
  const languageFilter = searchParams.get('language'); // 'th' | 'en' | 'all' | null
  // --- New: Handle specializedDictionaryId (with backward-compatible aliases) ---
  // Accept: specializedDictionaryId (preferred) | dictionaryId | id
  const idParamRaw =
    searchParams.get('specializedDictionaryId') ??
    searchParams.get('dictionaryId') ??
    searchParams.get('id');

  let dictionaryId: number | null = null;
  if (idParamRaw !== null && idParamRaw.trim() !== '') {
    const parsed = Number(idParamRaw);
    if (Number.isFinite(parsed) && Number.isInteger(parsed)) {
      // NOTE: allow 0 as a valid id (e.g., special "general" dictionary)
      dictionaryId = parsed;
    }
  }

  let where: any = {};

  // Apply dictionaryId filter if resolved (including 0)
  if (dictionaryId !== null) {
    where.specializedDictionaryId = dictionaryId;
  }
  // --- End: Handle specializedDictionaryId filter ---
  const pageParam = searchParams.get('page');
  // Accept ?pageSize= (preferred) or legacy ?limit=
  const pageSizeParam = searchParams.get('pageSize') ?? searchParams.get('limit');

  const page = pageParam ? Math.max(1, parseInt(pageParam, 10)) : 1;
  const pageSize = pageSizeParam ? Math.min(100, Math.max(1, parseInt(pageSizeParam, 10))) : 20;
  const skip = (page - 1) * pageSize;

  const keywords = query?.trim() ? query.trim().split(/\s+/).filter(kw => kw.length > 0) : [];

  // Language filter (filter by which field to search)
  if (languageFilter && languageFilter.trim() !== '' && languageFilter.trim() !== 'all') {
    // สมมติ filter ที่ term_th หรือ term_en
    if (languageFilter === 'th') {
      where.term_th = { not: null }; // เอา term_th ที่มีข้อมูล
    } else if (languageFilter === 'en') {
      where.term_en = { not: null };
    }
  }

  // ค้น keyword ใน term_th, term_en, definition_html
  if (query && query.trim() !== '') {
    const searchTerms = query.trim();
    where.OR = [
      { term_th: { contains: searchTerms, mode: 'insensitive' } },
      { term_en: { contains: searchTerms, mode: 'insensitive' } },
      { definition_html: { contains: searchTerms, mode: 'insensitive' } }
    ];
  }

  const isDefaultList = !(query?.trim() || (languageFilter && languageFilter.trim() !== 'all'));

  // Build dynamic orderBy for stable grouping
  let orderBy: any = undefined;
  if (keywords.length === 0) {
    if (languageFilter === 'th') {
      orderBy = [{ term_th: 'asc' }, { term_en: 'asc' }];
    } else if (languageFilter === 'en') {
      orderBy = [{ term_en: 'asc' }, { term_th: 'asc' }];
    } else {
      orderBy = [{ term_th: 'asc' }, { term_en: 'asc' }];
    }
  }

  try {
    let results: any[] = await prisma.dictionaryEntry.findMany({
      where,
      take: pageSize,
      skip,
      orderBy: orderBy as any,
      // --- Include SpecializedDictionary info for the frontend when showing all dictionaries ---
      include: {
        // Only include parent dictionary info when not filtering by a specific specializedDictionaryId
        SpecializedDictionary: dictionaryId === null
      }
      // --- End Include ---
    });

    const totalResults = await prisma.dictionaryEntry.count({ where });

    // Sort by relevance if keywords provided
    if (keywords.length > 0) {
      const resultsWithScores = results.map(entry => {
        const textForScoring = [
          entry.term_th,
          entry.term_en,
          entry.definition_html
        ].filter(Boolean).join(' ');
        const score = calculateRelevanceScore(textForScoring, keywords);
        return { ...entry, _relevanceScore: score };
      });

      resultsWithScores.sort((a, b) => {
        if (b._relevanceScore !== a._relevanceScore)
          return b._relevanceScore - a._relevanceScore;
        return b.id - a.id;
      });

      results = resultsWithScores.map(({ _relevanceScore, ...rest }) => rest);
    }

    // Highlight
    const processedResults = results.map(entry => ({
      ...entry,
      term_th: highlightText(entry.term_th, keywords),
      term_en: highlightText(entry.term_en, keywords),
      definition_html: highlightText(entry.definition_html, keywords),
      formattedCreatedAt: entry.created_at ? new Date(entry.created_at).toISOString().split('T')[0] : null,
      formattedUpdatedAt: entry.updated_at ? new Date(entry.updated_at).toISOString().split('T')[0] : null,
    }));

    const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
    const responseBody = {
      results: processedResults,
      pagination: {
        page,
        pageSize,
        totalPages,
        totalResults,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      isDefaultList,
      query: query || null,
      languageFilter: languageFilter || null,
    };

    const response = NextResponse.json(responseBody);
    response.headers.set('Content-Type', 'application/json; charset=utf-8');
    return response;

  } catch (error: any) {
    console.error('Search Dictionary API error:', error);
    const errorResponse = NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการค้นหาคำศัพท์ กรุณาลองใหม่อีกครั้ง' },
      { status: 500 }
    );
    errorResponse.headers.set('Content-Type', 'application/json; charset=utf-8');
    return errorResponse;
  } finally {
    await prisma.$disconnect();
  }
}

export async function POST(request: NextRequest) {
  return NextResponse.json({ error: 'Method POST Not Allowed' }, { status: 405 });
}

export const dynamic = 'force-dynamic';