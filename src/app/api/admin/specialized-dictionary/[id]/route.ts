import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const item = await prisma.taxonomy.findUnique({
    where: { id },
    include: { _count: { select: { taxa: true } } },
  });
  if (!item) return NextResponse.json({ error: 'ไม่พบข้อมูล' }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

    const body = await req.json();
    const data: any = {};
    if (typeof body?.title === 'string') data.title = body.title.trim();
    if (typeof body?.domain === 'string') data.domain = body.domain.trim();
    if (typeof body?.kingdom === 'string') {
      const k = body.kingdom.trim();
      if (!k) return NextResponse.json({ error: 'กรุณาระบุราชอาณาจักร (Kingdom)' }, { status: 400 });
      data.kingdom = k;
    }

    const updated = await prisma.taxonomy.update({ where: { id }, data });
    return NextResponse.json({ ok: true, item: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'อัปเดตไม่สำเร็จ' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode');

    if (mode === 'entries') {
      // ลบเฉพาะ TaxonEntry ที่เกี่ยวข้องกับ Taxonomy นี้
      const taxonIds = await prisma.taxon.findMany({
        where: { taxonomyId: id },
        select: { id: true },
      });
      const ids = taxonIds.map(t => t.id);
      let deletedCount = 0;
      if (ids.length) {
        const delRes = await prisma.taxonEntry.deleteMany({ where: { taxonId: { in: ids } } });
        deletedCount = delRes.count;
      }
      return NextResponse.json({ ok: true, deletedCount, message: `ลบรายการ TaxonEntry ที่เกี่ยวข้อง ${deletedCount} รายการแล้ว` });
    }

    // พฤติกรรมเดิม: ลบ taxonomy (อาจล้มเหลวถ้ามี FK)
    await prisma.taxonomy.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'ลบไม่สำเร็จ อาจมีข้อมูลที่เกี่ยวข้องอยู่' }, { status: 409 });
  }
}