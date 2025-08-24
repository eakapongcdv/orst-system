import { NextResponse } from 'next/server';
import { PrismaClient, Role } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

function hashPassword(raw: string) {
  const salt = crypto.randomBytes(8).toString('hex');
  const hash = crypto.pbkdf2Sync(raw, salt, 10000, 32, 'sha256').toString('hex');
  return `${salt}$${hash}`;
}

function shapeUser(u: any) {
  const groups = (u.userGroups || []).map((ug: any) => ug.group);
  const permissions = (u.permissions || []).map((p: any) => ({
    id: p.id, name: p.name, description: p.description,
  }));
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role as Role,
    isActive: u.isActive,
    lastLogin: u.lastLogin,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    groups,
    permissions,
  };
}

// GET /api/users/[id]
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userId = Number(id);
  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const u = await prisma.user.findUnique({
    where: { id: userId },
    include: { userGroups: { include: { group: true } }, permissions: true },
  });
  if (!u) return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });
  return NextResponse.json(shapeUser(u));
}

// PUT /api/users/[id]
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userId = Number(id);
  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const body = await req.json();
  const {
    email,
    username,
    firstName,
    lastName,
    role,
    isActive,
    password,
    groupIds = [],
    permissionIds = [],
  } = body || {};

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const data: any = {};
      if (email !== undefined) data.email = email;
      if (username !== undefined) data.username = username;
      if (firstName !== undefined) data.firstName = firstName;
      if (lastName !== undefined) data.lastName = lastName;
      if (role) data.role = role as Role;
      if (isActive !== undefined) data.isActive = !!isActive;
      if (password) data.password = hashPassword(String(password));

      await tx.user.update({ where: { id: userId }, data });

      // --- Sync groups ---
      if (Array.isArray(groupIds)) {
        const current = await tx.userGroup.findMany({ where: { userId } });
        const curSet = new Set(current.map(g => g.groupId));
        const nextSet = new Set<number>(groupIds.map((n: any) => Number(n)));

        const toAdd: number[] = [];
        nextSet.forEach(gid => { if (!curSet.has(gid)) toAdd.push(gid); });
        const toRemove: number[] = [];
        curSet.forEach(gid => { if (!nextSet.has(gid)) toRemove.push(gid); });

        if (toAdd.length) await tx.userGroup.createMany({ data: toAdd.map(gid => ({ userId, groupId: gid })) });
        if (toRemove.length) await tx.userGroup.deleteMany({ where: { userId, groupId: { in: toRemove } } });
      }

      // --- Sync permissions (assign/unassign) ---
      if (Array.isArray(permissionIds)) {
        const nextIds = permissionIds.map((n: any) => Number(n));
        // unassign ที่ไม่อยู่ในลิสต์
        await tx.permission.updateMany({ where: { userId, id: { notIn: nextIds } }, data: { userId: null } });
        // assign รายการที่ระบุ
        if (nextIds.length) {
          await tx.permission.updateMany({ where: { id: { in: nextIds } }, data: { userId } });
        }
      }

      const full = await tx.user.findUnique({
        where: { id: userId },
        include: { userGroups: { include: { group: true } }, permissions: true },
      });
      return full!;
    });

    return NextResponse.json(shapeUser(updated));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'อัปเดตผู้ใช้ไม่สำเร็จ' }, { status: 400 });
  }
}

// DELETE /api/users/[id]
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userId = Number(id);
  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.userGroup.deleteMany({ where: { userId } });
      await tx.permission.updateMany({ where: { userId }, data: { userId: null } });
      await tx.user.delete({ where: { id: userId } });
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'ลบผู้ใช้ไม่สำเร็จ' }, { status: 400 });
  }
}