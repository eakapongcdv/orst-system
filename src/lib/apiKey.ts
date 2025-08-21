import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const SALT = process.env.API_KEY_SALT || 'dev-salt-only-change-in-prod';
export function hashKey(k: string) {
  return crypto.createHmac('sha256', SALT).update(k).digest('hex');
}
export function generatePlainKey(prefix = 'sk_live'): string {
  const rnd = crypto.randomBytes(24).toString('base64url'); // url-safe
  return `${prefix}_${rnd}`;
}
export function maskKey(k: string) {
  if (!k) return '';
  if (k.length <= 8) return '••••';
  return `${k.slice(0, 6)}••••${k.slice(-4)}`;
}

export async function verifyApiKey(req: NextRequest, requiredScopes: string[] = []) {
  // อ่าน key จาก Authorization: Bearer หรือ X-API-Key
  let raw = req.headers.get('authorization') || '';
  const headerKey = req.headers.get('x-api-key') || '';
  if (raw.toLowerCase().startsWith('bearer ')) raw = raw.slice(7).trim();
  const candidate = headerKey || raw;
  if (!candidate) return { ok: false as const, error: 'Missing API key' };

  const h = hashKey(candidate);
  const key = await prisma.apiKey.findFirst({
    where: { hashedKey: h, isActive: true, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }
  });
  if (!key) return { ok: false as const, error: 'Invalid or expired API key' };

  // ตรวจ Origin (ถ้ามีตั้งค่า)
  const origin = req.headers.get('origin') || req.headers.get('referer') || '';
  if (key.allowedOrigins.length && origin) {
    const pass = key.allowedOrigins.some((o) => origin.startsWith(o));
    if (!pass) return { ok: false as const, error: 'Origin not allowed' };
  }

  // ตรวจ scope
  if (requiredScopes.length) {
    const missing = requiredScopes.filter((s) => !key.scopes.includes(s));
    if (missing.length) return { ok: false as const, error: 'Insufficient scope' };
  }

  // อัปเดต lastUsedAt แบบไม่ block
  prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  // log access (ทำแบบเบา ๆ)
  const ua = req.headers.get('user-agent') || '';
  const ip = req.headers.get('x-forwarded-for') || '0.0.0.0';
  prisma.apiAccessLog.create({
    data: { apiKeyId: key.id, path: new URL(req.url).pathname, method: req.method, status: 200, userAgent: ua, ip }
  }).catch(() => {});

  return { ok: true as const, key };
}

export function jsonError(message: string, status = 401) {
  return NextResponse.json({ ok: false, error: message }, { status });
}