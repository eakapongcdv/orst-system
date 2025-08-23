import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const item = await prisma.taxonomy.findUnique({
    where: { id },
    include: { _count: { select: { taxa: true } } },
  });
  if (!item) return NextResponse.json({ error: 'ไม่พบข้อมูล' }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id);
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

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id);
    if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

    // อาจล้มเหลวถ้ามี foreign keys ชี้มายัง taxonomy นี้
    await prisma.taxonomy.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // ส่ง 409 เมื่อมีความขัดแย้งจาก FK
    return NextResponse.json({ error: e?.message || 'ลบไม่สำเร็จ อาจมีข้อมูลที่เกี่ยวข้องอยู่' }, { status: 409 });
  }
}