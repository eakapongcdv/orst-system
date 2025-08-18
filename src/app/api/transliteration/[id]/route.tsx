// src/app/api/transliteration/[id]/route.tsx
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

// ✅ Schema: allow known fields, but passthrough extra keys from client
const UpdateSchema = z.object({
  language: z.string().optional().nullable(),
  romanization: z.string().optional().nullable(),
  originalScript1: z.string().optional().nullable(),
  originalScript2: z.string().optional().nullable(),
  transliteration1: z.string().optional().nullable(),
  transliteration2: z.string().optional().nullable(),
  otherFoundWords: z.string().optional().nullable(),
  meaning: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  referenceCriteria: z.string().optional().nullable(),
  wordType: z.string().optional().nullable(),
  // client may still send this, but we now ALWAYS create a new version on update
  createNewVersion: z.boolean().optional(),
  publicationDate: z.string().datetime().optional(),
}).passthrough();

// ===============================
// GET /api/transliteration/[id]
// - Return current entry + version list for dropdown
// ===============================
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: idParam } = await context.params;
    const id = Number(idParam);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ ok: false, error: 'Invalid id' }, { status: 400 });
    }

    const [entry, versions] = await prisma.$transaction([
      prisma.transliterationEntry.findUnique({ where: { id } }),
      // version history for dropdown (latest first)
      prisma.transliterationEntryVersion.findMany({
        where: { transliterationEntryId: id },
        orderBy: { version: 'desc' },
      }) as any,
    ]);

    if (!entry) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }

    const res = NextResponse.json({ ok: true, data: entry, versions });
    res.headers.set('Content-Type', 'application/json; charset=utf-8');
    return res;
  } catch (err: any) {
    console.error('Get transliteration error:', err);
    const res = NextResponse.json(
      { ok: false, error: err?.message ?? 'Get failed' },
      { status: 400 }
    );
    res.headers.set('Content-Type', 'application/json; charset=utf-8');
    return res;
  } finally {
    await prisma.$disconnect();
  }
}

// ===============================
// PUT /api/transliteration/[id]
// - Update entry
// - ALWAYS append a new TransliterationEntryVersion with version+1
// ===============================
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
      language: parsed.language ?? undefined,
      romanization: parsed.romanization ?? undefined,
      originalScript1: parsed.originalScript1 ?? undefined,
      originalScript2: parsed.originalScript2 ?? undefined,
      transliteration1: parsed.transliteration1 ?? undefined,
      transliteration2: parsed.transliteration2 ?? undefined,
      otherFoundWords: parsed.otherFoundWords ?? undefined,
      meaning: parsed.meaning ?? undefined,
      notes: parsed.notes ?? undefined,
      category: parsed.category ?? undefined,
      referenceCriteria: parsed.referenceCriteria ?? undefined,
      wordType: parsed.wordType ?? undefined,
      updatedAt: new Date(),
    };

    if (parsed.publicationDate) {
      data.publicationDate = new Date(parsed.publicationDate);
    }

    // --- Transaction: update entry, then log version+1 snapshot ---
    const result = await prisma.$transaction(async (tx) => {
      // Ensure entry exists
      const current = await tx.transliterationEntry.findUnique({ where: { id } });
      if (!current) {
        throw new Error('Transliteration entry not found');
      }

      // 1) Update the entry
      const updated = await tx.transliterationEntry.update({
        where: { id },
        data,
      });

      // 2) Compute next version number based on version history
      const agg = await tx.transliterationEntryVersion.aggregate({
        where: { transliterationEntryId: id },
        _max: { version: true },
      });
      const nextVersion = (agg._max.version ?? 0) + 1;

      // 3) Create a new version snapshot (use UPDATED values)
      const versionPayload = {
        transliterationEntryId: id,
        version: nextVersion,
        language: updated.language ?? null,
        romanization: updated.romanization ?? null,
        originalScript1: updated.originalScript1 ?? null,
        originalScript2: updated.originalScript2 ?? null,
        transliteration1: updated.transliteration1 ?? null,
        transliteration2: updated.transliteration2 ?? null,
        otherFoundWords: updated.otherFoundWords ?? null,
        meaning: updated.meaning ?? null,
        notes: updated.notes ?? null,
        category: updated.category ?? null,
        referenceCriteria: updated.referenceCriteria ?? null,
        wordType: (updated as any).wordType ?? null,
        publicationDate: updated.publicationDate ?? null,
        changed_at: new Date(),
        // Optionally add changed_by_user_id here if you pass user context
      };

      // Cast to any to avoid type coupling if schema fields differ slightly
      await tx.transliterationEntryVersion.create({ data: versionPayload as any });

      return { updated, nextVersion };
    });

    const res = NextResponse.json({ ok: true, data: result.updated, version: result.nextVersion });
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

// ===============================
// DELETE /api/transliteration/[id]
// ===============================
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