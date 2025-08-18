// src/app/api/transliteration/[id]/route.tsx
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

// ✅ เปิดรับฟิลด์ที่จำเป็น และอนุญาตคีย์อื่น ๆ ได้ (passthrough)
const UpdateSchema = z.object({
  title: z.string().optional().nullable(),
  language: z.string().optional(),
  romanization: z.string().optional().nullable(),
  originalScript1: z.string().optional().nullable(),
  originalScript2: z.string().optional().nullable(),
  transliteration1: z.string().optional().nullable(),
  transliteration2: z.string().optional().nullable(),
  meaning: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  referenceCriteria: z.string().optional().nullable(),
  // ✅ เพิ่มฟิลด์ที่ frontend ส่งมา
  wordType: z.string().optional().nullable(),
  createNewVersion: z.boolean().optional(),
  publicationDate: z.string().datetime().optional(),
}).passthrough();

// ✅ ต้อง await context.params ก่อนใช้ (ตาม Next.js 15)
export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: idParam } = await context.params;
    const id = Number(idParam);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ ok: false, error: 'Invalid id' }, { status: 400 });
    }

    const json = await req.json();
    const parsed = UpdateSchema.parse(json);

    const data: any = {
      title: parsed.title ?? undefined,
      language: parsed.language ?? undefined,
      romanization: parsed.romanization ?? undefined,
      originalScript1: parsed.originalScript1 ?? undefined,
      originalScript2: parsed.originalScript2 ?? undefined,
      transliteration1: parsed.transliteration1 ?? undefined,
      transliteration2: parsed.transliteration2 ?? undefined,
      meaning: parsed.meaning ?? undefined,
      notes: parsed.notes ?? undefined,
      category: parsed.category ?? undefined,
      referenceCriteria: parsed.referenceCriteria ?? undefined,
      wordType: parsed.wordType ?? undefined,              // ✅ map เพิ่ม
      updatedAt: new Date(),                               // อัปเดตเวลาแก้ไข
    };

    if (parsed.publicationDate) {
      data.publicationDate = new Date(parsed.publicationDate);
    }

    // หมายเหตุ: หากต้องทำ versioning จริง ๆ สามารถตรวจ parsed.createNewVersion เพื่อบันทึก revision แยกได้

    const updated = await prisma.transliterationEntry.update({
      where: { id },
      data,
    });

    const res = NextResponse.json({ ok: true, data: updated });
    res.headers.set('Content-Type', 'application/json; charset=utf-8');
    return res;
  } catch (err: any) {
    console.error('Update transliteration error:', err);
    const res = NextResponse.json(
      { ok: false, error: err?.message ?? 'Update failed' },
      { status: 400 }
    );
    res.headers.set('Content-Type', 'application/json; charset=utf-8');
    return res;
  } finally {
    await prisma.$disconnect();
  }
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: idParam } = await context.params;
    const id = Number(idParam);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ ok: false, error: 'Invalid id' }, { status: 400 });
    }

    const deleted = await prisma.transliterationEntry.delete({ where: { id } });
    const res = NextResponse.json({ ok: true, data: deleted });
    res.headers.set('Content-Type', 'application/json; charset=utf-8');
    return res;
  } catch (err: any) {
    console.error('Delete transliteration error:', err);
    const res = NextResponse.json(
      { ok: false, error: err?.message ?? 'Delete failed' },
      { status: 400 }
    );
    res.headers.set('Content-Type', 'application/json; charset=utf-8');
    return res;
  } finally {
    await prisma.$disconnect();
  }
}

// ปิด method อื่น
export async function GET() {
  return NextResponse.json({ error: 'Method GET Not Allowed' }, { status: 405 });
}