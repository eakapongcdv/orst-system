// app/api/file-manager/path/route.ts
// import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

type FolderPick = {
  id: number;
  name: string;
  parentId: number | null;
  userId: number;
};

async function getCurrentUserId(request: Request): Promise<number | null> {
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    const token = cookieHeader
      .split(';')
      .map(v => v.trim())
      .find(c => c.startsWith('auth-token='))
      ?.split('=')[1];
    if (!token) return null;
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
    if (typeof decoded === 'object' && decoded !== null && 'userId' in decoded) {
      return Number(decoded.userId);
    }
    return null;
  } catch (error) {
    console.error("Error verifying token in path route:", error);
    return null;
  }
}

// GET handler for fetching the folder path/breadcrumb
export async function GET(request: Request) {
  const userId = await getCurrentUserId(request);
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const folderIdParam = searchParams.get('folderId');

    if (!folderIdParam) {
      return Response.json({ error: 'folderId is required' }, { status: 400 });
    }

    const folderId = parseInt(folderIdParam, 10);
    if (isNaN(folderId)) {
      return Response.json({ error: 'Invalid folderId' }, { status: 400 });
    }

    // --- Build the path by traversing up the folder hierarchy ---
    const path: { id: number | null; name: string }[] = [];
    let currentFolderId: number | null = folderId;

    while (currentFolderId !== null) {
      const folderRec: FolderPick | null = await prisma.folder.findUnique({
        where: { id: currentFolderId },
        select: { id: true, name: true, parentId: true, userId: true } // Select userId for check
      });

      if (!folderRec || folderRec.userId !== userId) {
        console.warn(`Folder ${currentFolderId} not found or access denied for user ${userId}`);
        break;
      }

      path.unshift({ id: folderRec.id, name: folderRec.name });
      currentFolderId = folderRec.parentId;
    }

    path.unshift({ id: null, name: 'Root' });

    return Response.json({ path });

  } catch (error) {
    console.error('Error fetching folder path:', error);
    return Response.json({ error: 'Internal server error while fetching folder path' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}