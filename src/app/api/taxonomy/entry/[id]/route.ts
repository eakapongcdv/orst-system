// src/app/api/taxonomy/entry/[id]/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// อนุญาตให้แก้ไขเฉพาะฟิลด์เหล่านี้
const ALLOWED_FIELDS = new Set([
  'title',
  'slug',
  'orderIndex',
  'contentHtml',
  'contentText',
  'shortDescription',
  'official',
  'officialNameTh',
  'scientificName',
  'genus',
  'species',
  'family',
  'authorsDisplay',
  'authorsPeriod',
  'otherNames',
  'synonyms',
  'author',
]);

function pickAllowed(body: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const k of Object.keys(body || {})) {
    if (ALLOWED_FIELDS.has(k)) out[k] = body[k];
  }
  // แปลง orderIndex จาก string → number (หรือ null)
  if (typeof out.orderIndex === 'string') {
    const n = parseInt(out.orderIndex, 10);
    out.orderIndex = Number.isFinite(n) ? n : null;
  }
  return out;
}

// อ่าน 1 รายการ
export async function GET(_req: Request, ctx: { params: any }) {
  const params = await (ctx as any).params; // works whether Promise or plain object
  const id = Number(params?.id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const entry = await prisma.taxonEntry.findUnique({
      where: { id },
      include: { taxon: { select: { id: true, scientificName: true } } },
    });
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(entry);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

// อัปเดต + เพิ่ม version (+1)
export async function PUT(req: Request, ctx: { params: any }) {
  const params = await (ctx as any).params; // works whether Promise or plain object
  const id = Number(params?.id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const data = pickAllowed(body);

  // Handle relation change via nested connect (Prisma disallows setting taxonId directly in checked update)
  const relTaxonId = typeof body?.taxonId === 'number'
    ? body.taxonId
    : (typeof body?.taxonId === 'string' ? parseInt(body.taxonId, 10) : undefined);

  const updateData: any = {
    ...data,
    updatedAt: new Date(),
  };

  if (Number.isFinite(relTaxonId as any)) {
    updateData.taxon = { connect: { id: relTaxonId as number } };
  }

  try {
    const updated = await prisma.taxonEntry.update({
      where: { id },
      data: {
        ...updateData,
        // ถ้า schema มีคอลัมน์ version จะเพิ่ม +1
        version: { increment: 1 } as any,
      },
    });
    return NextResponse.json({ ok: true, entry: updated });
  } catch (err: any) {
    // กรณีไม่มีฟิลด์ version ใน schema ให้ลองอัปเดตอีกครั้งโดยไม่เพิ่ม version
    if (err?.code === 'P2018' || /Unknown field.*version/i.test(String(err?.message || ''))) {
      try {
        const updated = await prisma.taxonEntry.update({
          where: { id },
          data: updateData,
        });
        return NextResponse.json({ ok: true, entry: updated });
      } catch (e2: any) {
        return NextResponse.json({ error: e2?.message || 'Update failed' }, { status: 500 });
      }
    }
    return NextResponse.json({ error: err?.message || 'Update failed' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}