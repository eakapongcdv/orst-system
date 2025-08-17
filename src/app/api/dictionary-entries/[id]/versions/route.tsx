// src/app/api/dictionary-entries/[id]/versions/route.tsx
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
// import jwt from 'jsonwebtoken'; // Uncomment if authentication is required

const prisma = new PrismaClient();

// Optional: Function to get the current authenticated user's ID from the JWT cookie
// async function getCurrentUserId(request: NextRequest): Promise<number | null> {
//   try {
//     const token = request.cookies.get("auth-token")?.value;
//     if (!token || !process.env.JWT_SECRET) return null;
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     if (typeof decoded === 'object' && decoded !== null && 'userId' in decoded) {
//       return Number(decoded.userId);
//     }
//     return null;
//   } catch (error) {
//     console.error("Error getting/verifying user ID from token:", error);
//     return null;
//   }
// }

// --- Make the handler function async and await params ---
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // 1. Await params to get the actual values
  const { id: idString } = await params;

  // 2. Optional: Authenticate User
  // const userId = await getCurrentUserId(request);
  // if (!userId) {
  //   return new Response(
  //     JSON.stringify({ error: 'Unauthorized: Invalid or missing authentication token' }),
  //     { status: 401, headers: { 'Content-Type': 'application/json' } }
  //   );
  // }

  // 3. Parse and Validate Entry ID
  const id = parseInt(idString, 10); // Use the awaited idString
  if (isNaN(id)) {
    return new Response(
      JSON.stringify({ error: 'Invalid dictionary entry ID provided' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // 4. Fetch the main dictionary entry (current version) to ensure it exists and get its data
    const currentEntry = await prisma.dictionaryEntry.findUnique({
      where: { id },
      select: {
        id: true,
        term_th: true,
        term_en: true,
        definition_html: true,
        version: true, // Include the current version number
        updated_at: true, // Include the last updated timestamp
        // Add other fields from DictionaryEntry you want to return for the current version
        // created_at: true,
        // specializedDictionaryId: true,
      },
    });

    if (!currentEntry) {
      return new Response(
        JSON.stringify({ error: 'Dictionary entry not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 5. Fetch version history for the entry, ordered by version descending (newest first)
    // Exclude the current version from history if it's also logged (depends on your saving logic)
    const versions = await prisma.dictionaryEntryVersion.findMany({
      where: {
        dictionaryEntryId: id,
        // Optional: Exclude the current version if it's auto-logged on update
        // version: {
        //   lt: currentEntry.version // Assuming version log stores *previous* versions
        // }
      },
      orderBy: {
        version: 'desc', // Show newest versions first
        // Alternatively, order by changed_at: 'desc' if you prefer chronological order
        // changed_at: 'desc',
      },
      select: {
        id: true,
        version: true,
        term_th: true,
        term_en: true,
        definition_html: true,
        changed_at: true,
        changed_by_user_id: true,
        // Include other fields from DictionaryEntryVersion you want to return
      },
    });

    // 6. Structure the response to include both current entry and versions
    const responseData = {
      current: currentEntry,
      versions: versions,
    };

    // 7. Return successful response with the structured data
    return new Response(
      JSON.stringify(responseData),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error fetching dictionary entry versions:', error);

    // General server error response
    return new Response(
      JSON.stringify({ error: 'Internal Server Error', message: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  } finally {
    // 8. Disconnect Prisma Client
    await prisma.$disconnect();
  }
}
// --- End of updated GET handler ---

// If you don't need other methods, explicitly deny them
export async function POST() {
  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
}
export async function PUT() {
  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
}
export async function DELETE() {
  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
}
// Add other methods as needed (PATCH, etc.) and return 405