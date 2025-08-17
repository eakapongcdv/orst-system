// app/api/file-manager/documents/[id]/route.ts (or wherever your document DELETE route is)
// Make sure the path matches the one called in `confirmDelete` (e.g., `/api/file-manager/documents/:id`)

// import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import OSS from 'ali-oss'; // Assuming you use OSS
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

// Initialize OSS Client (reuse from upload route or create a shared utility)
const ossClient = new OSS({
  region: process.env.OSS_REGION!,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID!,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET!,
  bucket: process.env.OSS_BUCKET_NAME!,
});

// Function to get the current authenticated user's ID (reuse)
async function getCurrentUserId(request: Request): Promise<number | null> {
  // ... (same as in file-manager/upload/route.ts or folder delete route)
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
    console.error("Error verifying token:", error);
    return null;
  }
}

export async function DELETE(request: Request) {
  // Derive the dynamic route param from the URL to avoid typing the Next.js context argument
  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const rawId = segments[segments.length - 1]; // last path segment

  if (!rawId) {
    return Response.json({ error: 'Missing document id.' }, { status: 400 });
  }

  const documentId = parseInt(rawId, 10);
  if (isNaN(documentId)) {
    return Response.json({ error: 'Invalid document ID' }, { status: 400 });
  }

  const userId = await getCurrentUserId(request);
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Find the document and check ownership
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return Response.json({ error: 'Document not found' }, { status: 404 });
    }

    if (document.userId !== userId) {
      return Response.json({ error: 'Forbidden: You do not own this document' }, { status: 403 });
    }

    // 2. Delete the file from OSS
    try {
      await ossClient.delete(document.ossKey);
      console.log(`Deleted OSS object: ${document.ossKey}`);
    } catch (ossError: any) { // Type the error
      console.error(`Error deleting from OSS (${document.ossKey}):`, ossError);
      // Depending on requirements, decide if this should fail the whole operation
      // Often, it's better to try DB delete anyway and log the OSS error.
      // You might return a warning in the response.
    }

    // 3. Delete the document record from the database
    await prisma.document.delete({
      where: { id: documentId },
    });

    // 4. Return success response
    return Response.json({ message: 'Document deleted successfully' }, { status: 200 });

  } catch (error: any) { // Type the error
    console.error('Error deleting document:', error);
    // Handle specific Prisma errors if needed
    return Response.json({ error: 'Internal server error during document deletion' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}