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

// อ่าน 1 รายการ (with ?versions=1 or ?version=N support)
export async function GET(req: Request, ctx: { params: any }) {
  const params = await (ctx as any).params; // works whether Promise or plain object
  const id = Number(params?.id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const url = new URL(req.url);
  const sp = url.searchParams;
  const wantVersions = sp.get('versions');
  const vParam = sp.get('version');

  try {
    // 1) List versions: /api/taxonomy/entry/:id?versions=1
    if (wantVersions) {
      try {
        // Try selecting with timestamps if the columns exist
        const list = await prisma.taxonEntryVersion.findMany({
          where: { taxonEntryId: id },
          select: {
            version: true,
            // These may or may not exist depending on your schema; if they don't,
            // Prisma will throw and we will retry below with a minimal select.
            updatedAt: true as any,
            changed_at: true as any,
            changed_by_user_id: true as any,
          },
          orderBy: { version: 'desc' },
        });

        // Normalize timestamp field name to `updatedAt` for the client
        const normalized = (list as any[]).map((row) => ({
          version: row.version,
          updatedAt: row.updatedAt ?? row.changed_at ?? null,
          changed_by_user_id: 'changed_by_user_id' in row ? row.changed_by_user_id : null,
        }));
        return NextResponse.json({ versions: normalized });
      } catch (e) {
        try {
          // Table likely exists but columns differ; fetch only version numbers
          const list = await prisma.taxonEntryVersion.findMany({
            where: { taxonEntryId: id },
            select: { version: true },
            orderBy: { version: 'desc' },
          });
          return NextResponse.json({ versions: list });
        } catch {
          // Fallback if version table not ready at all: return current live version only
          const curr = await prisma.taxonEntry.findUnique({ where: { id }, select: { version: true } });
          return NextResponse.json({ versions: curr?.version ? [{ version: curr.version }] : [] });
        }
      }
    }

    // 2) Snapshot of a version: /api/taxonomy/entry/:id?version=N
    if (vParam) {
      const v = parseInt(vParam, 10);
      if (!Number.isFinite(v)) {
        return NextResponse.json({ error: 'Invalid version' }, { status: 400 });
      }
      try {
        const snap = await prisma.taxonEntryVersion.findFirst({
          where: { taxonEntryId: id, version: v },
        });
        if (!snap) return NextResponse.json({ error: 'Version not found' }, { status: 404 });
        return NextResponse.json({ snapshot: snap });
      } catch (e) {
        // Fallback: return live entry if versions table not available
        const entry = await prisma.taxonEntry.findUnique({
          where: { id },
          include: { taxon: { select: { id: true, scientificName: true } } },
        });
        if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json(entry);
      }
    }

    // 3) Default: live entry
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

// สร้าง 1 รายการ (clone) — แสดง modal ก่อน แล้วค่อยสร้าง โดยอนุญาตให้ส่ง override บางฟิลด์มาได้
export async function POST(req: Request, ctx: { params: any }) {
  const params = await (ctx as any).params;
  const id = Number(params?.id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // รับ override จาก client (ถ้ามี)
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    // ไม่มี body ก็ไม่เป็นไร ใช้แบบ clone ปกติ
    body = null;
  }
  const overrides = body ? pickAllowed(body) : {};
  // รองรับ taxonId เปลี่ยนปลายทาง เมื่อ clone (ถ้าส่งมา)
  const relTaxonId = typeof body?.taxonId === 'number'
    ? body.taxonId
    : (typeof body?.taxonId === 'string' ? parseInt(body.taxonId, 10) : undefined);

  try {
    const src = await prisma.taxonEntry.findUnique({ where: { id } });
    if (!src) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // เลี่ยง unique([taxonId, title]) ด้วยชื่อ (สำเนา) และเลขกำกับถ้าซ้ำ
    const baseTitle = (overrides.title ?? src.title) || 'รายการใหม่';
    let newTitle = String(baseTitle);
    // ถ้า client ไม่ได้ส่ง title มา ให้ต่อท้าย "(สำเนา)" อัตโนมัติ และตรวจความซ้ำ
    if (!overrides.title) {
      newTitle = `${baseTitle} (สำเนา)`;
      let suffix = 2;
      while (true) {
        const exists = await prisma.taxonEntry.findFirst({
          where: { taxonId: relTaxonId ?? src.taxonId, title: newTitle },
          select: { id: true },
        });
        if (!exists) break;
        newTitle = `${baseTitle} (สำเนา ${suffix})`;
        suffix++;
        if (suffix > 50) break; // กัน loop ยาว
      }
    }

    // slug อนุญาตให้ override มาได้ ถ้าไม่ส่งมา จะพยายามแนบท้าย -copy-xxxx
    const baseSlug = overrides.slug ?? src.slug ?? null;
    let newSlug = baseSlug;
    if (!overrides.slug) {
      newSlug = baseSlug ? `${baseSlug}-copy-${Date.now().toString().slice(-6)}` : null;
    }

    // สร้าง record ใหม่ โดยใช้ override ถ้ามี ไม่งั้นดึงจาก src
    const created = await prisma.taxonEntry.create({
      data: {
        taxonId: relTaxonId ?? src.taxonId,
        title: newTitle,
        slug: newSlug,
        contentHtml: (overrides.contentHtml ?? src.contentHtml) ?? null,
        contentText: (overrides.contentText ?? src.contentText) ?? null,
        shortDescription: (overrides.shortDescription ?? src.shortDescription) ?? null,
        officialNameTh: (overrides.officialNameTh ?? src.officialNameTh) ?? null,
        official: (overrides.official ?? src.official) ?? null,
        scientificName: (overrides.scientificName ?? src.scientificName) ?? null,
        genus: (overrides.genus ?? src.genus) ?? null,
        species: (overrides.species ?? src.species) ?? null,
        authorsDisplay: (overrides.authorsDisplay ?? src.authorsDisplay) ?? null,
        authorsPeriod: (overrides.authorsPeriod ?? src.authorsPeriod) ?? null,
        otherNames: (overrides.otherNames ?? src.otherNames) ?? null,
        author: (overrides.author ?? src.author) ?? null,
        synonyms: (overrides.synonyms ?? src.synonyms) ?? null,
        family: (overrides.family ?? src.family) ?? null,
        orderIndex: (overrides.orderIndex ?? src.orderIndex) ?? null,
        isPublished: false, // clone มาให้ยังไม่เผยแพร่ (สามารถแก้ไขทีหลังได้)
        version: 1,
      },
    });

    // seed log เวอร์ชันแรก (optional)
    try {
      await prisma.taxonEntryVersion.create({
        data: {
          taxonEntryId: created.id,
          version: created.version,
          taxonId: created.taxonId,
          title: created.title,
          slug: created.slug ?? null,
          contentHtml: created.contentHtml ?? null,
          contentText: created.contentText ?? null,
          shortDescription: created.shortDescription ?? null,
          officialNameTh: created.officialNameTh ?? null,
          official: created.official ?? null,
          scientificName: created.scientificName ?? null,
          genus: created.genus ?? null,
          species: created.species ?? null,
          authorsDisplay: created.authorsDisplay ?? null,
          authorsPeriod: created.authorsPeriod ?? null,
          otherNames: created.otherNames ?? null,
          author: created.author ?? null,
          synonyms: created.synonyms ?? null,
          family: created.family ?? null,
          orderIndex: created.orderIndex ?? null,
          isPublished: (created as any).isPublished ?? null,
        },
      });
    } catch {}

    return NextResponse.json({ ok: true, entry: created });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Clone failed' }, { status: 500 });
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
    const updated = await prisma.$transaction(async (tx) => {
      // 1) Update main row (+1 version)
      const updated = await tx.taxonEntry.update({
        where: { id },
        data: {
          ...updateData,
          version: { increment: 1 } as any,
        },
      });

      // 2) Write version log snapshot (the new state at `updated.version`)
      await tx.taxonEntryVersion.create({
        data: {
          taxonEntryId: updated.id,
          version: updated.version,
          taxonId: updated.taxonId,
          title: updated.title,
          slug: updated.slug ?? null,
          contentHtml: updated.contentHtml ?? null,
          contentText: updated.contentText ?? null,
          shortDescription: updated.shortDescription ?? null,
          officialNameTh: updated.officialNameTh ?? null,
          official: updated.official ?? null,
          scientificName: updated.scientificName ?? null,
          genus: updated.genus ?? null,
          species: updated.species ?? null,
          authorsDisplay: updated.authorsDisplay ?? null,
          authorsPeriod: updated.authorsPeriod ?? null,
          otherNames: updated.otherNames ?? null,
          author: updated.author ?? null,
          synonyms: updated.synonyms ?? null,
          family: updated.family ?? null,
          orderIndex: updated.orderIndex ?? null,
          // Optionally set changed_by_user_id here if you have auth context
        },
      });

      return updated;
    });

    return NextResponse.json({ ok: true, entry: updated });
  } catch (err: any) {
    // If Prisma rejects `version` (schema not yet migrated), fall back to updating without it
    const msg = String(err?.message || '');
    const isUnknownVersionArg = /Unknown (?:argument|field)\s*['\"]?version['\"]?/i.test(msg);
    const isValidation = (err?.name === 'PrismaClientValidationError');

    if (isUnknownVersionArg || (isValidation && /version/i.test(msg)) || err?.code === 'P2018') {
      try {
        const updated = await prisma.taxonEntry.update({ where: { id }, data: updateData });
        return NextResponse.json({ ok: true, entry: updated, warn: 'version-not-supported' });
      } catch (e2: any) {
        return NextResponse.json({ error: e2?.message || 'Update failed' }, { status: 500 });
      }
    }

    return NextResponse.json({ error: msg || 'Update failed' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}