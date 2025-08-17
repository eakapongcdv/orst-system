// app/api/file-manager/route.ts
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

/**
 * Retrieves the authenticated user's ID from the request's JWT cookie.
 * @param {NextRequest} request - The incoming Next.js request object.
 * @returns {Promise<number | null>} The user ID if authenticated, otherwise null.
 */
async function getCurrentUserId(request: NextRequest): Promise<number | null> {
  try {
    const token = request.cookies.get("auth-token")?.value;

    if (!token) {
      console.warn("No auth-token cookie found in list request");
      return null;
    }

    // Verify the JWT token using the secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");

    // Check if the decoded payload has the expected structure
    if (typeof decoded === 'object' && decoded !== null && 'userId' in decoded) {
      return Number(decoded.userId); // Return the user ID
    } else {
      console.error("Invalid token payload structure for list:", decoded);
      return null;
    }
  } catch (error) {
    // Log specific JWT errors for debugging
    if (error instanceof jwt.TokenExpiredError) {
      console.error("JWT token expired in list route:", error);
    } else if (error instanceof jwt.JsonWebTokenError) {
      console.error("JWT token invalid in list route:", error);
    } else {
      console.error("Error getting/verifying user ID from token in list route:", error);
    }
    return null;
  }
}

/**
 * GET handler for listing files and folders.
 * Supports filtering by folderId and searching by name.
 * @param {NextRequest} request - The incoming Next.js request object.
 * @returns {Response} A JSON response containing arrays of documents and folders.
 */
export async function GET(request: NextRequest) {
  // 1. Authenticate the user
  const userId = await getCurrentUserId(request);

  if (!userId) {
    return Response.json(
      { error: 'Unauthorized: Invalid or missing authentication token' },
      { status: 401 } // Unauthorized
    );
  }

  try {
    // 2. Parse query parameters from the request URL
    const { searchParams } = new URL(request.url);
    const folderIdParam = searchParams.get('folderId');
    const searchQuery = searchParams.get('search') || '';

    // 3. Process folderId parameter
    let folderId: number | null = null;
    if (folderIdParam) {
      const parsedId = parseInt(folderIdParam, 10);
      if (!isNaN(parsedId)) {
        folderId = parsedId;
      } else {
        // Return bad request if folderId is not a valid integer
        return Response.json({ error: 'Invalid folderId parameter' }, { status: 400 });
      }
    }

    // 4. Prepare database query conditions for Documents
    const documentWhereClause: any = { userId: userId };
    if (folderId !== null) {
      // Filter documents by the specific folder ID
      documentWhereClause.folderId = folderId;
    } else {
      // If no folderId, show documents in the root (where folderId is null)
      documentWhereClause.folderId = null;
    }

    // Add search condition for documents if a query is provided
    if (searchQuery) {
      documentWhereClause.name = {
        contains: searchQuery,
        mode: 'insensitive', // Case-insensitive search
      };
    }

    // 5. Prepare database query conditions for Folders
    const folderWhereClause: any = { userId: userId };
    if (folderId !== null) {
      // Filter sub-folders by the specific parent folder ID
      folderWhereClause.parentId = folderId;
    } else {
      // If no folderId, show top-level folders (parentId is null)
      folderWhereClause.parentId = null;
    }

    // Add search condition for folders if a query is provided
    // (Note: Searching folders by name within a specific folder context)
    if (searchQuery && folderId !== null) {
        folderWhereClause.name = {
            contains: searchQuery,
            mode: 'insensitive',
        };
    } else if (searchQuery && folderId === null) {
        // If searching at root level, search top-level folders
        folderWhereClause.parentId = null;
        folderWhereClause.name = {
            contains: searchQuery,
            mode: 'insensitive',
        };
    }

    // 6. Execute database queries concurrently for better performance
    const [documents, folders] = await Promise.all([
      prisma.document.findMany({
        where: documentWhereClause,
        orderBy: {
          updatedAt: 'desc' // Order by most recently updated
        }
        // select: { ... } // Optionally select specific fields
      }),
      prisma.folder.findMany({
        where: folderWhereClause,
        orderBy: {
          updatedAt: 'desc' // Order by most recently updated
        }
        // select: { ... } // Optionally select specific fields
      })
    ]);

    // 7. Map database results to a serializable format and return JSON response
    return Response.json({
      documents: documents.map(doc => ({
        id: doc.id,
        name: doc.name,
        type: doc.type,
        size: doc.size,
        url: doc.url,
        version: doc.version || 1, // Default version if not set
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
        folderId: doc.folderId, // Include folderId for frontend context if needed
        // Add other fields from your Prisma model as needed
      })),
      folders: folders.map(folder => ({
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId,
        createdAt: folder.createdAt.toISOString(),
        updatedAt: folder.updatedAt.toISOString(),
        // Add other fields from your Prisma model as needed
      }))
    });

  } catch (error) {
    // 8. Handle unexpected errors during database operations
    console.error('Error fetching file/folder list:', error);
    // Consider logging the full error object for debugging if needed
    // console.error('Error fetching file/folder list (details):', error instanceof Error ? error.message : String(error), error); 
    return Response.json(
      { error: 'Internal server error while fetching files and folders' },
      { status: 500 } // Internal Server Error
    );
  }
  // 9. Removed the finally block that called prisma.$disconnect()
  // finally {
  //   await prisma.$disconnect(); // <-- This line was removed
  // }
  // Prisma manages the connection pool automatically.
}

// If you need to handle POST requests for creating items at this endpoint path,
// you can add a POST handler function here.
// export async function POST(request: NextRequest) { ... }