// src/app/api/transliteration/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

// อนุญาตฟิลด์ที่ใช้บ่อยในระบบถอดอักษร
const CreateSchema = z.object({
  language: z.string().min(1, 'language is required'),
  title: z.string().optional().nullable(),
  romanization: z.string().optional().nullable(),
  originalScript1: z.string().optional().nullable(),
  originalScript2: z.string().optional().nullable(),
  transliteration1: z.string().optional().nullable(),
  transliteration2: z.string().optional().nullable(),
  meaning: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  referenceCriteria: z.string().optional().nullable(),
  publicationDate: z.string().datetime().optional(), // ISO string if provided
}).strict(false); // เผื่อฟิลด์เสริมอื่น ๆ

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = CreateSchema.parse(json);

    const data: any = {
      language: parsed.language,
      title: parsed.title ?? null,
      romanization: parsed.romanization ?? null,
      originalScript1: parsed.originalScript1 ?? null,
      originalScript2: parsed.originalScript2 ?? null,
      transliteration1: parsed.transliteration1 ?? null,
      transliteration2: parsed.transliteration2 ?? null,
      meaning: parsed.meaning ?? null,
      notes: parsed.notes ?? null,
      category: parsed.category ?? null,
      referenceCriteria: parsed.referenceCriteria ?? null,
    };

    if (parsed.publicationDate) {
      data.publicationDate = new Date(parsed.publicationDate);
    }

    const created = await prisma.transliterationEntry.create({ data });

    const res = NextResponse.json({ ok: true, data: created }, { status: 201 });
    res.headers.set('Content-Type', 'application/json; charset=utf-8');
    return res;
  } catch (err: any) {
    console.error('Create transliteration error:', err);
    const res = NextResponse.json(
      { ok: false, error: err?.message ?? 'Invalid request' },
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