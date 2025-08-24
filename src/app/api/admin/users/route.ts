import { NextResponse } from 'next/server';
import { PrismaClient, Role } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

// DEV hashing (แนะนำเปลี่ยนเป็น bcrypt/argon2 ภายหลัง)
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

function toInt(v: string | null, def: number) {
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : def;
}

// GET /api/users?q=&role=&page=1&pageSize=10
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();
  const role = (searchParams.get('role') || '').trim();
  const page = toInt(searchParams.get('page'), 1);
  const pageSize = toInt(searchParams.get('pageSize'), 10);
  const skip = (page - 1) * pageSize;

  const where: any = {};
  if (q) {
    where.OR = [
      { email: { contains: q, mode: 'insensitive' } },
      { username: { contains: q, mode: 'insensitive' } },
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (role) where.role = role as Role;

  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { id: 'desc' },
      include: {
        userGroups: { include: { group: true } },
        permissions: true,
      },
    }),
  ]);

  return NextResponse.json({
    items: rows.map(shapeUser),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}

// POST /api/users
// body: { email, username, firstName, lastName, role?, isActive?, password?, groupIds?: number[], permissionIds?: number[] }
export async function POST(req: Request) {
  const body = await req.json();
  const {
    email,
    username,
    firstName,
    lastName,
    role = 'USER',
    isActive = true,
    password,
    groupIds = [],
    permissionIds = [],
  } = body || {};

  if (!email || !username || !firstName || !lastName) {
    return NextResponse.json({ error: 'กรอกข้อมูลไม่ครบ' }, { status: 400 });
  }

  const data: any = { email, username, firstName, lastName, role, isActive };
  if (password && String(password).length > 0) data.password = hashPassword(String(password));

  try {
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data });

      if (Array.isArray(groupIds) && groupIds.length > 0) {
        await tx.userGroup.createMany({
          data: groupIds.map((gid: number) => ({ userId: user.id, groupId: Number(gid) })),
        });
      }

      if (Array.isArray(permissionIds) && permissionIds.length > 0) {
        await tx.permission.updateMany({
          where: { id: { in: permissionIds.map((id: number) => Number(id)) } },
          data: { userId: user.id }, // ผูก permission เหล่านี้ให้ user นี้
        });
      }

      const full = await tx.user.findUnique({
        where: { id: user.id },
        include: { userGroups: { include: { group: true } }, permissions: true },
      });
      return full!;
    });

    return NextResponse.json(shapeUser(created));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'สร้างผู้ใช้ไม่สำเร็จ' }, { status: 400 });
  }
}