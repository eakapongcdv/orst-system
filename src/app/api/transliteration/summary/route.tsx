// src/app/api/transliteration/summary/route.tsx
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma =
  (globalThis as any).prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  (globalThis as any).prisma = prisma;
}

// ---- Summary types (group by wordType) ----
type TypeSummary = {
  wordType: string;                 // ป้ายกำกับชนิดคำ (ไทย)
  entryCount: number;               // จำนวนรายการทั้งหมดของชนิดคำนี้
  categoryCounts: Record<string, number>; // นับตามหมวดหมู่
  lastUpdatedAt: string | null;     // ISO string ของรายการที่อัปเดตล่าสุดในชนิดคำนี้
};

// Helper types for Prisma groupBy results
type GroupByWordType = {
  wordType: string | null;
  _count: { _all: number };
  _max: { updatedAt: Date | null };
};
type GroupByWordTypeCategory = {
  wordType: string | null;
  category: string | null;
  _count: { _all: number };
};
type GroupByCategory = {
  category: string | null;
  _count: { _all: number };
  _max: { updatedAt: Date | null };
};

export async function GET(_req: NextRequest) {
  try {
    // รวมทั้งหมด + เวลาล่าสุดทั้งระบบ
    const total = await prisma.transliterationEntry.count();
    const newest = await prisma.transliterationEntry.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    });

    // --- สรุปตามชนิดคำ (wordType) ---
    const byType = (await prisma.transliterationEntry.groupBy({
      by: ['wordType'],
      _count: { _all: true },
      _max: { updatedAt: true },
    })) as GroupByWordType[];

    // --- สรุปย่อย: wordType x category เพื่อสร้าง categoryCounts ---
    const byTypeCategory = (await prisma.transliterationEntry.groupBy({
      by: ['wordType', 'category'],
      _count: { _all: true },
    })) as GroupByWordTypeCategory[];

    // ประกอบผลลัพธ์เป็น array พร้อมจัดเรียง (จำนวนมาก → น้อย แล้วตามชื่อ wordType)
    const wordTypes: TypeSummary[] = byType
      .map((row: GroupByWordType) => {
        const typeLabel =
          row.wordType && row.wordType.trim() !== '' ? row.wordType : 'ไม่ระบุ';
        const categoryCounts: Record<string, number> = {};

        byTypeCategory.forEach((sub: GroupByWordTypeCategory) => {
          const subType =
            sub.wordType && sub.wordType.trim() !== '' ? sub.wordType : 'ไม่ระบุ';
          if (subType === typeLabel) {
            const catLabel =
              sub.category && sub.category.trim() !== '' ? sub.category : '-';
            categoryCounts[catLabel] = (categoryCounts[catLabel] || 0) + sub._count._all;
          }
        });

        return {
          wordType: typeLabel,
          entryCount: row._count._all,
          categoryCounts,
          lastUpdatedAt: row._max.updatedAt ? row._max.updatedAt.toISOString() : null,
        };
      })
      .sort(
        (a, b) =>
          b.entryCount - a.entryCount || a.wordType.localeCompare(b.wordType, 'th'),
      );

    // แปลงเป็น object เข้าถึงเร็วตามชื่อชนิดคำ
    const byWordType: Record<string, TypeSummary> = {};
    wordTypes.forEach((t) => (byWordType[t.wordType] = t));

    // เผื่อ UI ต้องการสรุปตามหมวดหลักด้วย (เหมือนเดิม)
    const byCat = (await prisma.transliterationEntry.groupBy({
      by: ['category'],
      _count: { _all: true },
      _max: { updatedAt: true },
    })) as GroupByCategory[];

    const byCategory = byCat
      .map((row: GroupByCategory) => ({
        category: row.category && row.category.trim() !== '' ? row.category : '-',
        entryCount: row._count._all,
        lastUpdatedAt: row._max.updatedAt ? row._max.updatedAt.toISOString() : null,
      }))
      .sort(
        (a, b) =>
          b.entryCount - a.entryCount || a.category.localeCompare(b.category, 'th'),
      );

    return NextResponse.json({
      ok: true,
      total,
      updatedAt: newest?.updatedAt ? newest.updatedAt.toISOString() : null,
      // 🔁 เปลี่ยนมาเป็นสรุปตามชนิดคำ
      byWordType, // object: { "คำนาม": { ... }, "คำกริยา": { ... }, "ไม่ระบุ": { ... } }
      wordTypes,  // array ของสรุปชนิดคำ
      // ยังคงแนบสรุปตามหมวดให้ใช้งานได้
      byCategory,
    });
  } catch (err) {
    console.error('GET /api/transliteration/summary error:', err);
    return NextResponse.json(
      { ok: false, error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}