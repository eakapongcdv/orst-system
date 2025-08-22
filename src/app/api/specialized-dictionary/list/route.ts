import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /api/specialized-dictionary/list
 * คืนค่ารายการ SpecializedDictionary ทั้งหมดสำหรับ dropdown
 * response:
 * {
 *   ok: true,
 *   data: [{ id, title, category, subcategory, year_published, created_at, updated_at, entryCount }]
 * }
 */
export async function GET() {
  try {
    const rows = await prisma.specializedDictionary.findMany({
      select: {
        id: true,
        title: true,
        category: true,
        subcategory: true,
        year_published: true,
        created_at: true,
        updated_at: true,
        _count: { select: { entries: true } },
      },
      orderBy: [{ id: 'asc' }],
    });

    const data = rows.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      subcategory: r.subcategory,
      year_published: r.year_published,
      created_at: r.created_at,
      updated_at: r.updated_at,
      entryCount: (r as any)._count?.entries ?? 0,
    }));

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error('GET /api/specialized-dictionary/list error:', err);
    return NextResponse.json(
      { ok: false, error: 'ไม่สามารถดึงรายการพจนานุกรมเฉพาะสาขาได้' },
      { status: 500 }
    );
  }
}