// app/api/file-manager/folders/route.ts
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

// --- Helper Function: Get Current User ID ---
// This function should be consistent with how you handle auth in other API routes.
async function getCurrentUserId(request: NextRequest): Promise<number | null> {
  try {
    // --- Method 1: Using cookies (common for session/JWT tokens) ---
    const token = request.cookies.get("auth-token")?.value;
    if (!token) {
      console.warn("No auth-token cookie found in folder creation request");
      return null;
    }

    // Verify the JWT token using your secret key
    // Ensure JWT_SECRET is set in your .env file
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "fallback-secret-key-for-dev");

    // Check if the decoded payload has the expected user ID field (e.g., 'userId')
    if (typeof decoded === 'object' && decoded !== null && 'userId' in decoded) {
      return Number(decoded.userId);
    } else {
      console.error("Invalid token payload structure for folder creation:", decoded);
      return null;
    }
  } catch (error) {
    // Specifically handle common JWT errors for better debugging
    if (error instanceof jwt.TokenExpiredError) {
      console.error("JWT token expired in folder creation route:", error.message);
    } else if (error instanceof jwt.JsonWebTokenError) {
      console.error("JWT token invalid in folder creation route:", error.message);
    } else {
      console.error("Error getting/verifying user ID from token in folder creation route:", error);
    }
    return null; // Return null on any verification failure
  }
}
// --- End Helper Function ---

// --- Handler for POST requests (Create Folder) ---
export async function POST(request: NextRequest) {
  // 1. Authenticate the User
  const userId = await getCurrentUserId(request);

  if (!userId) {
    return Response.json(
      { error: 'Unauthorized: Invalid or missing authentication token' },
      { status: 401 } // Standard status code for unauthorized access
    );
  }

  try {
    // 2. Parse the Request Body
    const body = await request.json();
    const { name, parentId } = body; // Expect name (required) and optional parentId

    // 3. Validate Input Data
    if (!name || typeof name !== 'string') {
      return Response.json(
        { error: 'Folder name is required and must be a non-empty string' },
        { status: 400 } // Bad Request
      );
    }

    // --- 4. Validate and Check Parent Folder (if provided) ---
    let parentFolderId: number | null = null; // Initialize as null for root folders
    if (parentId !== undefined && parentId !== null) {
      const parentIdNum = Number(parentId);
      // Basic type check for parentId
      if (isNaN(parentIdNum)) {
         return Response.json(
           { error: 'Invalid parentId format. Must be a number or null.' },
           { status: 400 } // Bad Request
         );
      }

      // --- Check if the specified parent folder exists ---
      const parentFolder = await prisma.folder.findUnique({
        where: { id: parentIdNum },
        // Optionally, select only necessary fields: select: { id: true, userId: true }
      });

      if (!parentFolder) {
         return Response.json(
           { error: 'Parent folder not found.' },
           { status: 404 } // Not Found
         );
      }

      // --- Check Ownership of the Parent Folder ---
      // Ensure the user owns the folder they are trying to create a subfolder in.
      if (parentFolder.userId !== userId) {
         return Response.json(
           { error: 'Forbidden: You do not have permission to create a folder inside this parent folder.' },
           { status: 403 } // Forbidden
         );
      }

      // If all checks pass for the parent, assign the validated ID
      parentFolderId = parentIdNum;
      // Optional: Add further checks here, like depth limits or name uniqueness within the parent.
    }
    // --- End Parent Folder Validation ---

    // --- 5. Create the New Folder Record in the Database ---
    // Use Prisma Client to create the folder entry.
    // The `create` method requires an object with a `data` property containing the fields.
    const newFolder = await prisma.folder.create({
      data : { 
        name: name.trim(), // Sanitize input name
        userId: userId,    // Associate the folder with the authenticated user
        parentId: parentFolderId, // Link to parent folder (can be null for root)
        // Prisma will automatically handle `createdAt` and `updatedAt` based on your schema.
      },
    });
    // --- End Folder Creation ---

    // 6. Return the Created Folder Data
    // Respond with the newly created folder object.
    // Convert dates to ISO strings for safe JSON serialization.
    // Consider returning only necessary fields for security and performance.
    return Response.json(
      {
        id: newFolder.id,
        name: newFolder.name,
        parentId: newFolder.parentId,
        createdAt: newFolder.createdAt.toISOString(),
        updatedAt: newFolder.updatedAt.toISOString(),
        // Add other non-sensitive fields if needed by the frontend
      },
      { status: 201 } // 201 Created is the standard status for successful resource creation
    );

  } catch (error) {
    // 7. Handle Errors During Processing
    console.error('Error creating folder:', error);

    // --- Specific Prisma Error Handling (Optional but recommended) ---
    // You can check for specific Prisma errors (e.g., unique constraint violations)
    // and return more informative messages.
    // Example:
    // if (error instanceof Prisma.PrismaClientKnownRequestError) {
    //   if (error.code === 'P2002') {
    //     // Unique constraint failed (e.g., folder name must be unique per parent/user)
    //     return Response.json(
    //       { error: 'A folder with this name already exists in this location.' },
    //       { status: 409 } // Conflict
    //     );
    //   }
    //   // Handle other Prisma error codes as needed
    // }
    // --- End Specific Error Handling ---

    // General fallback for unexpected errors
    return Response.json(
      { error: 'Internal server error while creating folder' },
      { status: 500 } // Internal Server Error
    );
  } finally {
    // 8. Ensure Prisma Client Disconnects
    // Always disconnect the Prisma client in the `finally` block to free up resources.
    await prisma.$disconnect();
  }
}
// --- End POST Handler ---

// --- Placeholder for other HTTP methods ---
// If you need to handle other actions on the /api/file-manager/folders endpoint,
// you can add them below. For example, GET to list top-level folders for a user.
/*
export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId(request);
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Example: Get top-level folders (parentId is null) for the user
    const topLevelFolders = await prisma.folder.findMany({
      where: {
        userId: userId,
        parentId: null
      },
      orderBy: {
        updatedAt: 'desc' // Or createdAt
      }
      // select specific fields if needed
    });

    return Response.json(topLevelFolders.map(folder => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      createdAt: folder.createdAt.toISOString(),
      updatedAt: folder.updatedAt.toISOString(),
    })));
  } catch (error) {
    console.error('Error fetching folders:', error);
    return Response.json({ error: 'Internal server error while fetching folders' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
*/

// Similarly, you can add PUT (for renaming/editing folder metadata) or other methods if needed.
// export async function PUT(request: NextRequest) { ... }
// export async function DELETE(request: NextRequest) { ... } // Though you have a specific route for this