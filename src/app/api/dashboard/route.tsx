// app/api/dashboard/route.ts
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

// Function to get the current authenticated user's ID from the JWT cookie
async function getCurrentUserId(request: NextRequest): Promise<number | null> {
  try {
    const token = request.cookies.get("auth-token")?.value;

    if (!token) {
      console.warn("No auth-token cookie found in request");
      return null;
    }

    // Verify the JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");

    // Assuming the payload has a 'userId' field
    if (typeof decoded === 'object' && decoded !== null && 'userId' in decoded) {
      return Number(decoded.userId);
    } else {
      console.error("Invalid token payload structure:", decoded);
      return null;
    }
  } catch (error) {
    console.error("Error getting/verifying user ID from token:", error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  // 1. Authenticate User
  const userId = await getCurrentUserId(request);

  if (!userId) {
    return Response.json(
      { error: 'Unauthorized: Invalid or missing authentication token' },
      { status: 401 }
    );
  }

  try {
    // 2. Fetch document statistics from Database
    const documentStats = await prisma.document.aggregate({
      _count: true,
      _sum: {
        size: true
      },
      where: {
        userId: userId
      }
    });

    // 3. Fetch recent documents
    const recentDocuments = await prisma.document.findMany({
      where: {
        userId: userId
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take: 5,
      select: { // Select only necessary fields
        id: true,
        name: true,
        type: true,
        size: true,
        url: true,
        updatedAt: true,
      }
    });

    // 4. Calculate total size
    let totalSize = documentStats._sum.size || 0;

    // 5. Vocabulary entry counts (per type)
    const dictEntriesCount = await prisma.dictionaryEntry.count();
    const translitEntriesCount = await prisma.transliterationEntry.count();
    const taxonEntriesCount = await prisma.taxonEntry.count();
    const totalVocabularyEntries = dictEntriesCount + translitEntriesCount + taxonEntriesCount;

    // Count of distinct public API endpoints (paths that start with /api/ but not /api/admin)
    const publicApiDistinct = await prisma.apiAccessLog.findMany({
      where: {
        path: { startsWith: '/api/' },
        NOT: { path: { startsWith: '/api/admin' } },
      },
      distinct: ['path'],
      select: { path: true },
    });
    const publicApiCount = publicApiDistinct.length;

    // 6. Fetch shared documents count
    const sharedDocumentsCount = await prisma.documentShare.count({
      where: {
        userId: userId // Documents shared WITH this user
      }
    });

    // 7. Fetch user's folders count
    const foldersCount = await prisma.folder.count({
      where: {
        userId: userId
      }
    });

    // 8. Fetch comments count
    const commentsCount = await prisma.comment.count({
      where: {
        userId: userId
      }
    });

    // --- New: Fetch counts for specialized content models ---
    const dictionariesCount = await prisma.specializedDictionary.count();
    const encyclopediasCount = await prisma.encyclopedia.count(); // Count Encyclopedia volumes
    const taxonomyCount = await prisma.taxonomy.count();
    const gazetteerCount = await prisma.gazetteerEntry.count();

    // 9. Return successful response with updated stats
    return Response.json({
      stats: {
        totalDocuments: documentStats._count || 0,
        totalSize: totalSize,
        totalVocabularyEntries: totalVocabularyEntries,
        totalDictEntries: dictEntriesCount,
        totalTransliterationEntries: translitEntriesCount,
        totalTaxonEntries: taxonEntriesCount,
        recentActivityCount: recentDocuments.length,
        sharedDocuments: sharedDocumentsCount,
        publicApiCount: publicApiCount,
        totalFolders: foldersCount,
        totalComments: commentsCount,
        totalDictionaries: dictionariesCount,
        totalEncyclopedias: encyclopediasCount,
        totalTaxonomies: taxonomyCount,
        totalGazetteerEntries: gazetteerCount,
      },
      recentDocuments: recentDocuments.map(doc => ({
        id: doc.id,
        name: doc.name,
        type: doc.type,
        size: doc.size,
        url: doc.url,
        description: `ประเภทเอกสาร: ${doc.type.split('/')[1]?.toUpperCase() || 'ไม่ทราบ'}`,
        updatedAt: doc.updatedAt.toISOString(),
      }))
    });

  } catch (error) {
    console.error('Dashboard API error:', error);
    return Response.json(
      { error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}