import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10)));
  const q = (searchParams.get('q') || '').trim();

  const where = q
    ? {
        OR: [
          { title: { contains: q } },
          { domain: { contains: q } },
        ],
      }
    : undefined;

  const [total, items] = await Promise.all([
    prisma.taxonomy.count({ where }),
    prisma.taxonomy.findMany({
      where,
      orderBy: [{ updated_at: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { taxa: true } } },
    }),
  ]);

  return NextResponse.json({
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const title = String(body?.title || '').trim();
    const domain = String(body?.domain || '').trim();

    if (!title) return NextResponse.json({ error: 'กรุณาระบุชื่อ' }, { status: 400 });
    if (!domain) return NextResponse.json({ error: 'กรุณาระบุโดเมน' }, { status: 400 });

    const created = await prisma.taxonomy.create({
      data: { title, domain },
    });

    return NextResponse.json({ ok: true, item: created });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'สร้างไม่สำเร็จ' }, { status: 500 });
  }
}