// app/api/file-manager/documents/[id]/route.ts
import { PrismaClient } from '@prisma/client';
import OSS from 'ali-oss';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

// Initialize OSS Client (ensure credentials are set in .env)
const ossClient = new OSS({
  region: process.env.OSS_REGION!,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID!,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET!,
  bucket: process.env.OSS_BUCKET_NAME!,
});

// --- Reuse or Inline Authentication Function ---
/**
 * Retrieves the authenticated user's ID from the request's JWT cookie.
 * @param {Request} request - The incoming request object.
 * @returns {Promise<number | null>} The user ID if authenticated, otherwise null.
 */
async function getCurrentUserId(request: Request): Promise<number | null> {
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    const token = cookieHeader
      .split(';')
      .map(v => v.trim())
      .find(c => c.startsWith('auth-token='))
      ?.split('=')[1];

    if (!token) {
      console.warn("No auth-token cookie found in document delete request");
      return null;
    }

    // Verify the JWT token using the secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");

    // Check if the decoded payload has the expected structure
    if (typeof decoded === 'object' && decoded !== null && 'userId' in decoded) {
      return Number(decoded.userId); // Return the user ID
    } else {
      console.error("Invalid token payload structure for document delete:", decoded);
      return null;
    }
  } catch (error) {
    // Log specific JWT errors for debugging
    if (error instanceof jwt.TokenExpiredError) {
      console.error("JWT token expired in document delete route:", error);
    } else if (error instanceof jwt.JsonWebTokenError) {
      console.error("JWT token invalid in document delete route:", error);
    } else {
      console.error("Error getting/verifying user ID from token in document delete route:", error);
    }
    return null;
  }
}
// --- End Authentication Function ---

// Use a variadic signature to avoid strict type checks from Next's route validator
export async function DELETE(..._args: any[]) {
  const request = _args[0] as Request;
  const context = (_args.length > 1 ? _args[1] : {}) as any;

  const params = context?.params ?? {};
  const rawId = params?.id as string | undefined;

  if (!rawId) {
    return Response.json(
      { error: 'Missing resource id.' },
      { status: 400 }
    );
  }

  const documentId = parseInt(rawId, 10);
  if (isNaN(documentId)) {
    return Response.json({ error: 'Invalid document ID format provided' }, { status: 400 });
  }

  // 1. Authenticate the user
  const userId = await getCurrentUserId(request);

  if (!userId) {
    return Response.json(
      { error: 'Unauthorized: Invalid or missing authentication token' },
      { status: 401 } // Unauthorized
    );
  }

  try {
    // 3. Find the document in the database and check ownership
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return Response.json({ error: 'Document not found' }, { status: 404 }); // Not Found
    }

    if (document.userId !== userId) {
      return Response.json(
        { error: 'Forbidden: You do not have permission to delete this document' },
        { status: 403 } // Forbidden
      );
    }

    // 4. --- Delete the file from AliCloud OSS ---
    // It's crucial to attempt OSS deletion before DB deletion.
    // If OSS fails but DB succeeds, the file becomes orphaned.
    try {
      console.log(`Attempting to delete OSS object with key: ${document.ossKey}`);
      const result = await ossClient.delete(document.ossKey);
      console.log(`Successfully deleted OSS object: ${document.ossKey}`, result);
      // Note: OSS delete usually returns 204 No Content on success.
      // Check AliCloud OSS SDK docs if you need to handle specific response details.
    } catch (ossError: any) {
      // --- Robust Error Handling for OSS Deletion ---
      console.error(`Error deleting object '${document.ossKey}' from OSS:`, ossError);
      // Check if the error is because the object wasn't found (might have been manually deleted)
      // The specific error code might vary; check AliCloud OSS SDK documentation.
      // Commonly, a 404 from OSS indicates the object is already gone.
      if (ossError?.status === 404 || (ossError?.name === 'NoSuchKeyError')) {
         console.warn(`OSS object '${document.ossKey}' not found during deletion (may already be deleted). Proceeding with database deletion.`);
         // Continue to delete DB record even if OSS object wasn't found.
      } else {
         // For other OSS errors (e.g., network issues, permissions if somehow changed),
         // decide on your policy. You might:
         // 1. Log the error and still try to delete the DB record (current approach).
         // 2. Return an error to the frontend to indicate partial failure.
         // 3. Implement a retry mechanism.
         // Returning an error here prevents DB deletion if OSS fails unexpectedly.
         // Returning an error might be safer to prevent orphaned DB records if the file is critical.
         // Let's log and proceed for now, assuming the DB delete is the final step.
         // Consider returning an error if OSS failure is critical.
         // return Response.json(
         //   { error: `Failed to delete file from storage: ${ossError.message || 'Unknown OSS error'}` },
         //   { status: 500 }
         // );
      }
      // --- End Robust Error Handling ---
    }
    // --- End OSS Deletion ---

    // 5. Delete the document record from the database
    console.log(`Deleting document record (ID: ${documentId}) from database.`);
    await prisma.document.delete({
      where: { id: documentId },
    });
    console.log(`Successfully deleted document record (ID: ${documentId}) from database.`);

    // 6. Return a success response
    return Response.json(
      { message: 'Document and associated file deleted successfully' },
      { status: 200 } // OK
    );

  } catch (error) {
    // 7. Handle unexpected errors during database operations or other parts of the process
    console.error('Error deleting document (ID:', documentId, '):', error);
    // Check if it's a Prisma error for more specific messages
    if (error instanceof Error) {
        // Example: Handle Prisma record not found error (though we checked earlier)
        // if (error.name === 'NotFoundError') { ... }
    }
    return Response.json(
      { error: 'Internal server error while deleting the document' },
      { status: 500 } // Internal Server Error
    );
  }
  // 8. Removed the finally block that called prisma.$disconnect()
  // finally {
  //   await prisma.$disconnect(); // <-- Removed
  // }
  // Prisma manages the connection pool automatically.
}

// If you need a GET handler for fetching a single document's details
// export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
//   // Implement GET logic here, including authentication and authorization checks
//   // const userId = await getCurrentUserId(request);
//   // if (!userId) { ... }
//   // const documentId = parseInt(params.id, 10);
//   // if (isNaN(documentId)) { ... }
//   // const document = await prisma.document.findUnique({ where: { id: documentId, userId } });
//   // if (!document) { ... }
//   // return Response.json(document);
// }

// If you need handlers for updating a document (e.g., rename)
// export async function PUT(request: NextRequest, { params }: { params: { id: string } }) { ... }
// export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) { ... }