// Helper to coerce truthy strings
function isTruthyString(val: string | null | undefined): boolean {
  if (!val) return false;
  const s = val.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(s);
}
// src/app/api/admin/transliteration/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type SortBy = 'id' | 'romanization' | 'language' | 'version' | 'updatedAt';
type SortDir = 'asc' | 'desc';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10)));
    const q = (searchParams.get('q') || '').trim();

    const sortByParam = (searchParams.get('sortBy') || 'id') as SortBy;
    const sortDirParam = (searchParams.get('sortDir') || '').toLowerCase() as SortDir | '';
    const sortBy: SortBy = ['id', 'romanization', 'language', 'version', 'updatedAt'].includes(sortByParam)
      ? sortByParam
      : 'id';
    const sortDir: SortDir =
      sortDirParam === 'asc' || sortDirParam === 'desc'
        ? sortDirParam
        : (sortBy === 'updatedAt' || sortBy === 'version' || sortBy === 'id' ? 'desc' : 'asc');

    const where = q
      ? {
          OR: [
            { romanization: { contains: q, mode: 'insensitive' } },
            { transliteration1: { contains: q, mode: 'insensitive' } },
            { transliteration2: { contains: q, mode: 'insensitive' } },
            { originalScript1: { contains: q } }, // อักษรไม่ใช่ละติน ไม่บังคับ insensitive
            { originalScript2: { contains: q } },
            { language: { contains: q, mode: 'insensitive' } },
            { category: { contains: q, mode: 'insensitive' } },
            { wordType: { contains: q, mode: 'insensitive' } },
          ],
        }
      : undefined;

    const [total, items] = await Promise.all([
      prisma.transliterationEntry.count({ where }),
      prisma.transliterationEntry.findMany({
        where,
        orderBy: [{ [sortBy]: sortDir as any }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          romanization: true,
          originalScript1: true,
          originalScript2: true,
          language: true,
          wordType: true,
          category: true,
          transliteration1: true,
          transliteration2: true,
          version: true,
          updatedAt: true,
          createdAt: true,
          meaning:true,
        },
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
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'โหลดข้อมูลไม่สำเร็จ' }, { status: 500 });
  }
}

// POST /api/admin/transliteration
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const romanization = String(body?.romanization || '').trim();
    if (!romanization) {
      return NextResponse.json({ error: 'กรุณาระบุคำทับศัพท์ (romanization)' }, { status: 400 });
    }

    const data: any = {
      romanization,
      originalScript1: body?.originalScript1 ?? null,
      originalScript2: body?.originalScript2 ?? null,
      language: body?.language ?? null,
      wordType: body?.wordType ?? null,
      category: body?.category ?? null,
      transliteration1: body?.transliteration1 ?? null,
      transliteration2: body?.transliteration2 ?? null,
      // version ค่า default = 1 ตาม schema
    };

    const created = await prisma.transliterationEntry.create({ data });
    return NextResponse.json({ ok: true, item: created });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'สร้างไม่สำเร็จ' }, { status: 500 });
  }
}
// DELETE /api/admin/transliteration
export async function DELETE(req: NextRequest) {
  try {
    // 1. Try query string (?all=1, ?all=true, etc)
    const { searchParams } = new URL(req.url);
    let all = false;
    const qAll = searchParams.get('all');
    if (isTruthyString(qAll)) {
      all = true;
    }
    // 2. If not in query, check JSON body
    if (!all) {
      try {
        const body = await req.json();
        if (typeof body?.all === 'boolean') {
          all = body.all;
        }
      } catch {
        // ignore parse error
      }
    }
    // 3. If neither, return 400
    if (!all) {
      return NextResponse.json(
        {
          error:
            "To delete all TransliterationEntry rows, pass ?all=1 in the query string or JSON body { all: true }.",
        },
        { status: 400 }
      );
    }
    // 4. Do the deletion
    const result = await prisma.transliterationEntry.deleteMany({});
    return NextResponse.json({ ok: true, deleted: result.count });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Delete failed" },
      { status: 500 }
    );
  }
}