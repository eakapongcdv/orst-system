//src/api/admin/transliteration/[id]
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10)));
  const q = (searchParams.get('q') || '').trim();
  const sortBy = (searchParams.get('sortBy') || 'id') as 'id' | 'title' | 'domain' | 'kingdom' | 'updatedAt' | 'entryCount';
  const sortDirParam = searchParams.get('sortDir');
  const sortDir = (sortDirParam
    ? (sortDirParam.toLowerCase() === 'desc' ? 'desc' : 'asc')
    : (['updatedAt', 'entryCount', 'id'].includes(sortBy) ? 'desc' : 'asc')) as 'asc' | 'desc';

  const where = q
    ? {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { domain: { contains: q, mode: 'insensitive' } },
          { kingdom: { contains: q, mode: 'insensitive' } },
        ],
      }
    : undefined;

  // Build Prisma orderBy for sortable scalar fields
  const orderByScalar =
    sortBy === 'id' || sortBy === 'title' || sortBy === 'domain' || sortBy === 'kingdom' || sortBy === 'updatedAt'
      ? [{ [sortBy]: sortDir as any }, { id: 'asc' as const }]
      : [{ updatedAt: 'desc' as const }, { id: 'asc' as const }];

  // Fetch page of taxonomies
  const [total, items] = await Promise.all([
    prisma.taxonomy.count({ where }),
    prisma.taxonomy.findMany({
      where,
      orderBy: orderByScalar,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, title: true, domain: true, kingdom: true, createdAt: true, updatedAt: true },
    }),
  ]);

  // For each taxonomy, compute count of TaxonEntry via nested relation
  const counts = await Promise.all(
    items.map((it) =>
      prisma.taxonEntry.count({
        where: { taxon: { taxonomyId: it.id } },
      })
    )
  );

  let itemsWithCount = items.map((it, i) => ({ ...it, _entryCount: counts[i] }));

  // If sorting by entryCount, do client-side sort here
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

// POST /api/admin/taxonomy
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const title = String(body?.title || '').trim();
    const domain = String(body?.domain || '').trim();
    const kingdom = String(body?.kingdom || '').trim();

    if (!title) return NextResponse.json({ error: 'กรุณาระบุชื่อ' }, { status: 400 });
    if (!domain) return NextResponse.json({ error: 'กรุณาระบุโดเมน (Domain)' }, { status: 400 });
    if (!kingdom) return NextResponse.json({ error: 'กรุณาระบุราชอาณาจักร (Kingdom)' }, { status: 400 });

    const created = await prisma.taxonomy.create({ data: { title, domain, kingdom } });
    return NextResponse.json({ ok: true, item: created });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'สร้างไม่สำเร็จ' }, { status: 500 });
  }
}