// src/app/api/search/popular/route.ts
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function toInt(v: string | null, def: number): number {
  if (!v) return def;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function normQuery(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

// GET /api/search/popular
//   - /api/search/popular?dictionaryId=0&limit=10
//   - /api/search/popular?dictionaryId=3&limit=10
//   - /api/search/popular?limit=10      (รวมทุกหมวด)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dictIdStr = searchParams.get('dictionaryId');
    const limitParam = searchParams.get('limit');
    const limit = clamp(toInt(limitParam, 10), 1, 50);

    const where: any = {};
    if (dictIdStr !== null) {
      const dictId = toInt(dictIdStr, NaN);
      if (!Number.isFinite(dictId)) {
        return Response.json({ error: 'Invalid dictionaryId' }, { status: 400 });
      }
      where.specializedDictionaryId = dictId;
    }

    const items = await prisma.popularSearch.findMany({
      where,
      orderBy: [{ count: 'desc' }, { lastSearchedAt: 'desc' }],
      take: limit,
      select: {
        specializedDictionaryId: true,
        queryNormalized: true,
        queryOriginal: true,
        count: true,
        lastSearchedAt: true,
      },
    });

    const out = items.map((it) => ({
      dictionaryId: it.specializedDictionaryId,
      query: it.queryOriginal || it.queryNormalized,
      count: it.count,
      lastSearchedAt: it.lastSearchedAt,
    }));

    return Response.json({ items: out });
  } catch (e) {
    console.error('[popular] GET error', e);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

// POST /api/search/popular
// Body: { query: string, dictionaryId?: 0|3 }
// - ถ้าไม่ได้ส่ง dictionaryId (กรณี universal) จะรับไว้แบบ 202 โดยไม่บันทึก (เลี่ยง FK error)
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { query?: string; dictionaryId?: number | string }
      | null;

    if (!body || !body.query || typeof body.query !== 'string') {
      return Response.json({ error: 'Missing query' }, { status: 400 });
    }

    const qOriginal = body.query.slice(0, 200);
    const qNormalized = normQuery(qOriginal);
    if (!qNormalized) {
      return Response.json({ error: 'Empty query' }, { status: 400 });
    }

    const dictIdVal =
      body.dictionaryId !== undefined && body.dictionaryId !== null
        ? Number(body.dictionaryId)
        : null;

    if (dictIdVal === null || !Number.isFinite(dictIdVal)) {
      // ไม่ระบุ bucket => รับไว้เฉยๆ เพื่อลด error ที่ฝั่ง client
      return Response.json({ ok: true, ignored: true }, { status: 202 });
    }

    const res = await prisma.popularSearch.upsert({
      where: {
        // ต้องมี unique constraint @@unique([specializedDictionaryId, queryNormalized])
        specializedDictionaryId_queryNormalized: {
          specializedDictionaryId: dictIdVal,
          queryNormalized: qNormalized,
        },
      },
      update: {
        count: { increment: 1 },
        queryOriginal: qOriginal,
        lastSearchedAt: new Date(),
      },
      create: {
        specializedDictionaryId: dictIdVal,
        queryNormalized: qNormalized,
        queryOriginal: qOriginal,
        count: 1,
      },
      select: {
        specializedDictionaryId: true,
        queryOriginal: true,
        count: true,
      },
    });

    return Response.json({
      ok: true,
      item: {
        dictionaryId: res.specializedDictionaryId,
        query: res.queryOriginal,
        count: res.count,
      },
    });
  } catch (e) {
    console.error('[popular] POST error', e);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}