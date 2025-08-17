// app/api/version/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper to check if a given table exists in Postgres (public schema)
async function tableExists(tableName: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    ) AS "exists";
  `;
  return rows?.[0]?.exists === true;
}

export async function GET(_request: Request) {
  try {
    // Try to find a plausible table to read version/revision info from
    const candidates = ['Version', 'versions', 'Revision', 'revisions'];
    let chosen: string | null = null;

    for (const t of candidates) {
      // The check uses a parameterized query (safe)
      if (await tableExists(t)) {
        chosen = t;
        break;
      }
    }

    if (chosen) {
      // Table name must be injected as an identifier -> use Unsafe with a fixed allowlist above
      const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "public"."${chosen}" ORDER BY 1 DESC LIMIT 100`);
      return NextResponse.json({
        source: 'database',
        table: chosen,
        count: rows.length,
        rows,
      });
    }
  } catch (err) {
    console.error('[api/version] DB lookup failed:', err);
    // fall through to app-level info
  }

  // Fallback: return app/build information (no DB dependency)
  return NextResponse.json({
    source: 'app',
    appVersion: process.env.APP_VERSION ?? null,
    buildId: process.env.BUILD_ID ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
    timestamp: new Date().toISOString(),
  });
}