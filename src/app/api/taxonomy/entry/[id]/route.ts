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
  'isPublished',
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

// Helper: Ensure unique title for given taxonId (for cloning)
async function ensureUniqueTitle(taxonId: number, desired: string): Promise<string> {
  let title = (desired || '').trim() || 'รายการใหม่';
  let guard = 0;
  while (true) {
    const exists = await prisma.taxonEntry.findFirst({
      where: { taxonId, title },
      select: { id: true },
    });
    if (!exists) return title;

    // ถ้าชน ให้เติม/เพิ่ม (สำเนา [N]) ต่อท้าย
    const m = title.match(/^(.*?)(?:\s*\(สำเนา(?:\s+(\d+))?\))$/);
    if (m) {
      const base = m[1].trim();
      const num = m[2] ? parseInt(m[2], 10) + 1 : 2;
      title = `${base} (สำเนา ${num})`;
    } else {
      title = `${title} (สำเนา)`;
    }

    guard++;
    if (guard > 200) {
      // กันลูปยาว/ชนซ้ำรัว ๆ
      title = `${(desired || 'รายการใหม่').trim()} (สำเนา ${Date.now().toString().slice(-4)})`;
      const exists2 = await prisma.taxonEntry.findFirst({
        where: { taxonId, title },
        select: { id: true },
      });
      if (!exists2) return title;
      return `${title}-${Math.random().toString(36).slice(2, 6)}`;
    }
  }
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

    // Always ensure unique([taxonId, title]) even if overrides.title is provided
    const taxonTargetId = relTaxonId ?? src.taxonId;
    // ตั้งชื่อที่ต้องการเริ่มต้น: ถ้า client ไม่ได้ส่ง title มา → เติม "(สำเนา)" ให้ก่อน
    const desiredTitle = String(
      overrides.title ?? ((src.title || 'รายการใหม่') + ' (สำเนา)')
    ).trim();
    // ทำให้ title ไม่ชนกันภายใต้ taxon เดียวกัน
    const newTitle = await ensureUniqueTitle(taxonTargetId, desiredTitle);

    // slug อนุญาตให้ override มาได้ ถ้าไม่ส่งมา จะพยายามแนบท้าย -copy-xxxx
    const baseSlug = overrides.slug ?? src.slug ?? null;
    let newSlug = baseSlug;
    if (!overrides.slug) {
      newSlug = baseSlug ? `${baseSlug}-copy-${Date.now().toString().slice(-6)}` : null;
    }

    // สร้าง record ใหม่ โดยใช้ override ถ้ามี ไม่งั้นดึงจาก src
    let created;
    try {
      created = await prisma.taxonEntry.create({
        data: {
          taxonId: taxonTargetId,
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
          isPublished: (overrides.isPublished ?? false),
          version: 1,
        },
      });
    } catch (e: any) {
      const em = String(e?.message || '');
      if (e?.code === 'P2002' || /Unique constraint.*taxonId.*title/i.test(em)) {
        // ถ้ายังชน ให้ generate ชื่อใหม่แล้วลองอีกครั้ง
        const retryTitle = await ensureUniqueTitle(taxonTargetId, desiredTitle + ' (สำเนา)');
        created = await prisma.taxonEntry.create({
          data: {
            taxonId: taxonTargetId,
            title: retryTitle,
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
            isPublished: (overrides.isPublished ?? false),
            version: 1,
          },
        });
      } else {
        throw e;
      }
    }

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
          isPublished: (updated as any).isPublished ?? null,
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