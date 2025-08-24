import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET /api/admin/specialized-dictionary?q=&page=&pageSize=&sortBy=&sortDir=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10)));
  const q = (searchParams.get('q') || '').trim();
  const sortBy = (searchParams.get('sortBy') || 'id') as 'id' | 'title' | 'updatedAt' | 'entryCount';
  const sortDirParam = searchParams.get('sortDir');
  const sortDir = (sortDirParam
    ? (sortDirParam.toLowerCase() === 'desc' ? 'desc' : 'asc')
    : (['updatedAt', 'entryCount', 'id'].includes(sortBy) ? 'desc' : 'asc')) as 'asc' | 'desc';

  // filter by title only (SpecializedDictionary has only title)
  const where = q
    ? {
        title: { contains: q, mode: 'insensitive' },
      }
    : undefined;

  // Build Prisma orderBy for sortable scalar fields (map camelCase -> snake_case in DB)
  const sortFieldMap = {
    id: 'id',
    title: 'title',
    updatedAt: 'updated_at',
  } as const;

  const sortDbField = sortFieldMap[sortBy] || 'id';

  // For scalar sorts, use DB column names. For entryCount we will sort in-memory within the page.
  const orderByScalar =
    sortBy === 'entryCount'
      ? [{ updated_at: 'desc' as const }, { id: 'asc' as const }]
      : [{ [sortDbField]: sortDir as any }, { id: 'asc' as const }];

  // Fetch page of specialized dictionaries (note: use snake_case fields in `select`)
  const [total, rawItems] = await Promise.all([
    prisma.specializedDictionary.count({ where }),
    prisma.specializedDictionary.findMany({
      where,
      orderBy: orderByScalar,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, title: true, category: true, subcategory: true, created_at: true, updated_at: true },
    }),
  ]);

  // Remap snake_case to camelCase for API consumers
  const items = rawItems.map((it) => ({
    id: it.id,
    title: it.title,
    category: it.category,
    subcategory: it.subcategory ?? null,
    createdAt: it.created_at,
    updatedAt: it.updated_at,
  }));

  // Bulk count DictionaryEntry grouped by specializedDictionaryId for the current page
  const ids = items.map((it) => it.id);
  let countsById: Record<number, number> = {};
  if (ids.length) {
    const rows = await prisma.dictionaryEntry.groupBy({
      by: ['specializedDictionaryId'],
      _count: { _all: true },
      where: { specializedDictionaryId: { in: ids } },
    });
    countsById = Object.fromEntries(
      rows.map((r: any) => [Number(r.specializedDictionaryId), Number((r._count && r._count._all) ?? r._count ?? 0)])
    );
  }

  let itemsWithCount = items.map((it) => ({ ...it, _entryCount: countsById[it.id] ?? 0 }));

  // If sorting by entryCount, do client-side sort within the page
  if (sortBy === 'entryCount') {
    itemsWithCount = itemsWithCount.sort((a, b) =>
      sortDir === 'asc' ? a._entryCount - b._entryCount : b._entryCount - a._entryCount
    );
  }

  return NextResponse.json({
    items: itemsWithCount,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}

// POST /api/admin/specialized-dictionary
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const title = String(body?.title || '').trim();
    const categoryRaw = body?.category ?? 'ทั่วไป';
    const category = String(categoryRaw).trim();
    const subcategoryInput = body?.subcategory;
    const subcategory =
      subcategoryInput === undefined || subcategoryInput === null || String(subcategoryInput).trim() === ''
        ? null
        : String(subcategoryInput).trim();
    const yearInput = body?.year_published ?? body?.yearPublished;
    const year_published =
      yearInput === undefined || yearInput === null || String(yearInput).trim() === ''
        ? null
        : Number.parseInt(String(yearInput), 10);

    if (!title) return NextResponse.json({ error: 'กรุณาระบุชื่อพจนานุกรมเฉพาะทาง' }, { status: 400 });
    if (!category) return NextResponse.json({ error: 'กรุณาระบุสาขาวิชา (category)' }, { status: 400 });

    const created = await prisma.specializedDictionary.create({
      data: { title, category, subcategory, year_published },
      select: { id: true, title: true, category: true, subcategory: true, year_published: true, created_at: true, updated_at: true },
    });

    return NextResponse.json({
      ok: true,
      item: {
        id: created.id,
        title: created.title,
        category: created.category,
        subcategory: created.subcategory,
        year_published: created.year_published,
        createdAt: created.created_at,
        updatedAt: created.updated_at,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'สร้างไม่สำเร็จ' }, { status: 500 });
  }
}