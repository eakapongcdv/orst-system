// app/api/dictionaries/route.ts
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET /api/dictionaries
// Fetches all SpecializedDictionary entries along with their entry counts
// Optional: Filter by id using query parameter ?id=123
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    // Build where condition if id is provided
    const whereCondition = id ? { id: parseInt(id, 10) } : {};

    // Validate ID parameter if provided
    if (id) {
      const idNum = parseInt(id, 10);
      if (isNaN(idNum)) {
        return Response.json({ error: 'Invalid ID parameter' }, { status: 400 });
      }
    }

    // Fetch dictionaries from the database, ordered by title, then category, then subcategory
    // Include the count of related DictionaryEntry records
    const dictionaries = await prisma.specializedDictionary.findMany({
      where: whereCondition,
      orderBy: [
        { category: 'asc' },
        { subcategory: { sort: 'asc', nulls: 'first' } },
        { title: 'asc' }
      ],
      // Include the count of related entries
      include: {
        _count: {
          select: { entries: true }
        }
      }
    });

    // Transform the data to flatten the _count object for easier frontend use
    const dictionariesWithCount = dictionaries.map(dict => ({
      ...dict,
      entryCount: dict._count.entries // Add a direct property for entry count
    }));

    // If filtering by ID, return single dictionary
    if (id) {
      return Response.json(dictionariesWithCount);
    }

    // Group dictionaries by category > subcategory > title
    const groupedDictionaries = dictionariesWithCount.reduce((acc, dict) => {
      const category = dict.category;
      const subcategory = dict.subcategory || 'no_subcategory';
      
      if (!acc[category]) {
        acc[category] = {};
      }
      
      if (!acc[category][subcategory]) {
        acc[category][subcategory] = [];
      }
      
      acc[category][subcategory].push(dict);
      return acc;
    }, {} as Record<string, Record<string, typeof dictionariesWithCount>>);

    // Return the grouped dictionaries
    return Response.json(groupedDictionaries);
  } catch (error) {
    console.error('API /api/dictionaries error:', error);
    return Response.json(
      { error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ในการดึงข้อมูลพจนานุกรม' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Handle unsupported HTTP methods (e.g., POST, PUT, DELETE)
export async function POST() {
  return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
}

export async function PUT() {
  return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
}

export async function DELETE() {
  return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
}