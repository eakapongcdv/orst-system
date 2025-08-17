// app/api/file-manager/folders/[id]/route.ts
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
// import OSS from 'ali-oss'; // If you need to delete folder contents from OSS, import OSS

const prisma = new PrismaClient();

// Function to get the current authenticated user's ID (reuse from upload route)
async function getCurrentUserId(request: Request): Promise<number | null> {
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    const token = cookieHeader
      .split(';')
      .map(v => v.trim())
      .find(c => c.startsWith('auth-token='))
      ?.split('=')[1];
    if (!token) {
      console.warn("No auth-token cookie found in folder delete request");
      return null;
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
    if (typeof decoded === 'object' && decoded !== null && 'userId' in decoded) {
      return Number(decoded.userId);
    }
    console.error("Invalid token payload structure for folder delete:", decoded);
    return null;
  } catch (error) {
    console.error("Error getting/verifying user ID from token in folder delete route:", error);
    return null;
  }
}

// DELETE handler for folders
export async function DELETE(request: Request) {
  const userId = await getCurrentUserId(request);
  if (!userId) {
    return Response.json({ error: 'Unauthorized: Invalid or missing authentication token' }, { status: 401 });
  }

  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const rawId = segments[segments.length - 1];
  if (!rawId) {
    return Response.json({ error: 'Missing folder ID' }, { status: 400 });
  }
  const folderId = parseInt(rawId, 10);
  if (isNaN(folderId)) {
    return Response.json({ error: 'Invalid folder ID' }, { status: 400 });
  }

  try {
    // 1. Find the folder and check ownership
    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
    });

    if (!folder) {
      return Response.json({ error: 'Folder not found' }, { status: 404 });
    }

    if (folder.userId !== userId) {
      return Response.json({ error: 'Forbidden: You do not own this folder' }, { status: 403 });
    }

    // 2. Optional: Check if folder is empty (or implement recursive delete logic)
    // For now, let Prisma handle cascading deletes based on your schema
    // You might want to add logic here to prevent deleting non-empty folders
    // or to delete contents recursively.
    /*
    const documentCount = await prisma.document.count({ where: { folderId } });
    const subFolderCount = await prisma.folder.count({ where: { parentId: folderId } });
    if (documentCount > 0 || subFolderCount > 0) {
       return Response.json({ error: 'Cannot delete non-empty folder. Please empty it first.' }, { status: 400 });
    }
    */

    // 3. Delete the folder record from the database
    // Prisma should handle cascading deletes for documents/folders inside if configured
    await prisma.folder.delete({
      where: { id: folderId },
    });

    // 4. Return success response
    return Response.json({ message: 'Folder deleted successfully' }, { status: 200 });

  } catch (error) {
    console.error('Error deleting folder:', error);
    // Handle potential Prisma errors (e.g., foreign key constraints if cascade delete isn't set)
    if (error instanceof Error && error.name === 'PrismaClientKnownRequestError') {
       // Check for specific Prisma error codes if needed
       // e.g., P2003 for foreign key constraint failed
       return Response.json({ error: 'Failed to delete folder. It might not be empty.' }, { status: 400 });
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}