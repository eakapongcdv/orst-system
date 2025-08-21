import { NextRequest, NextResponse } from 'next/server';
import { verifyApiKey, jsonError } from '@/lib/apiKey';

export async function GET(req: NextRequest) {
  const v = await verifyApiKey(req, []); // ใส่ scope ที่ต้องการ เช่น ['read:transliteration']
  if (!v.ok) return jsonError(v.error);
  return NextResponse.json({ ok: true, message: 'pong', by: v.key?.label });
}