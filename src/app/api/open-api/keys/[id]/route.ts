import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const body = await req.json().catch(() => ({}));
  const { isActive, label, scopes, allowedOrigins, expiresAt } = body;
  const data: any = {};
  if (typeof isActive === 'boolean') data.isActive = isActive;
  if (typeof label === 'string') data.label = label;
  if (Array.isArray(scopes)) data.scopes = scopes;
  if (Array.isArray(allowedOrigins)) data.allowedOrigins = allowedOrigins;
  if (expiresAt !== undefined) data.expiresAt = expiresAt ? new Date(expiresAt) : null;

  const updated = await prisma.apiKey.update({ where: { id }, data });
  return NextResponse.json({ ok: true, key: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const updated = await prisma.apiKey.update({
    where: { id },
    data: { revokedAt: new Date(), isActive: false }
  });
  return NextResponse.json({ ok: true, key: updated });
}