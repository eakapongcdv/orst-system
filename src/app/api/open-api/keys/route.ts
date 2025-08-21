import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { generatePlainKey, hashKey, maskKey } from '@/lib/apiKey';
const prisma = new PrismaClient();

export async function GET() {
  const keys = await prisma.apiKey.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, label: true, keyPrefix: true, hashedKey: true, scopes: true, allowedOrigins: true,
      createdAt: true, lastUsedAt: true, expiresAt: true, revokedAt: true, isActive: true
    }
  });
  const safe = keys.map(k => ({
    id: k.id,
    label: k.label,
    keyPrefix: k.keyPrefix,
    maskedKey: maskKey(k.keyPrefix + '...' + k.hashedKey.slice(-6)),
    scopes: k.scopes,
    allowedOrigins: k.allowedOrigins,
    createdAt: k.createdAt, lastUsedAt: k.lastUsedAt, expiresAt: k.expiresAt,
    revokedAt: k.revokedAt, isActive: k.isActive,
  }));
  return NextResponse.json({ ok: true, keys: safe });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { label, scopes = [], allowedOrigins = [], expiresAt } = body || {};
  if (!label || typeof label !== 'string') {
    return NextResponse.json({ ok: false, error: 'label is required' }, { status: 400 });
  }
  const plain = generatePlainKey('sk_live');
  const [prefix] = plain.split('_');
  const created = await prisma.apiKey.create({
    data: {
      label,
      keyPrefix: prefix,
      hashedKey: hashKey(plain),
      scopes: Array.isArray(scopes) ? scopes : [],
      allowedOrigins: Array.isArray(allowedOrigins) ? allowedOrigins : [],
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    }
  });
  // โชว์ plain key ครั้งเดียว
  return NextResponse.json({
    ok: true,
    key: {
      id: created.id, label: created.label, createdAt: created.createdAt,
      plain, // สำคัญ: โชว์ครั้งเดียว ฝั่ง FE ควรให้ผู้ใช้คัดลอกเก็บ
    }
  });
}