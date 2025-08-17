// src/app/api/dictionary-entries/[id]/route.tsx
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { z } from 'zod'; // For request body validation

const prisma = new PrismaClient();

// Define a schema for the expected request body using Zod
const UpdateDictionaryEntrySchema = z.object({
  term_th: z.string().nullable().optional(),
  term_en: z.string().nullable().optional(),
  definition_html: z.string().nullable().optional(),
  // Add validation for other fields you intend to update if necessary
});

// Type for the decoded JWT payload (adjust based on your actual payload structure)
interface CustomJwtPayload extends JwtPayload {
  userId?: number;
}

// Function to get the current authenticated user's ID from the JWT cookie
async function getCurrentUserId(request: NextRequest): Promise<number | null> {
  try {
    const token = request.cookies.get("auth-token")?.value;

    if (!token) {
      console.warn("No auth-token cookie found in request");
      return null;
    }

    if (!process.env.JWT_SECRET) {
        console.error("JWT_SECRET is not defined in environment variables");
        return null;
    }

    // Verify the JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as CustomJwtPayload;

    if (decoded.userId) {
      return Number(decoded.userId);
    } else {
      console.error("Invalid token payload structure: Missing userId", decoded);
      return null;
    }
  } catch (error) {
    console.error("Error getting/verifying user ID from token:", error);
    return null;
  }
}

// --- PUT Handler for updating a DictionaryEntry with versioning (Scenario-specific) ---
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // 1. Await params to get the actual values (Next.js 15+)
  const { id: idString } = await params;

  // 2. Authenticate User
  const userId = await getCurrentUserId(request);

  if (!userId) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized: Invalid or missing authentication token' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 3. Parse and Validate Entry ID
  const id = parseInt(idString, 10);
  if (isNaN(id)) {
    return new Response(
      JSON.stringify({ error: 'Invalid dictionary entry ID provided' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // 4. Parse and Validate Request Body
    const body = await request.json();
    const validationResult = UpdateDictionaryEntrySchema.safeParse(body);

    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          error: 'Invalid request body',
          details: validationResult.error.flatten(),
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const updateDataInput = validationResult.data;

    // Check if at least one updatable field is provided
    if (updateDataInput.term_th === undefined &&
        updateDataInput.term_en === undefined &&
        updateDataInput.definition_html === undefined) {
        return new Response(
            JSON.stringify({ error: 'No valid fields provided for update' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // 5. Perform Update and Log BOTH the Previous AND New Version States within a Transaction
    const updatedEntry = await prisma.$transaction(async (tx) => {
        // a. Fetch the current entry and its version (including fields needed for logging)
        const existingEntry = await tx.dictionaryEntry.findUniqueOrThrow({
            where: { id },
            select: {
                id: true,
                version: true,
                term_th: true,
                term_en: true,
                definition_html: true,
                updated_at: true, // Timestamp before the update
                // Add other fields you want to snapshot if necessary
            }
        });

        // b. Prepare data for update (only provided fields)
        const updateData: { [key: string]: any } = {};
        if (updateDataInput.term_th !== undefined) updateData.term_th = updateDataInput.term_th;
        if (updateDataInput.term_en !== undefined) updateData.term_en = updateDataInput.term_en;
        if (updateDataInput.definition_html !== undefined) updateData.definition_html = updateDataInput.definition_html;

        // c. Increment version for the main entry
        const newVersion = existingEntry.version + 1;
        updateData.version = newVersion;

        // d. Update the DictionaryEntry
        const updatedEntryResult = await tx.dictionaryEntry.update({
            where: { id },
            data: updateData, // Corrected key name to `data`
        });

        // --- Scenario Implementation Starts Here ---

        // e. Log the *previous* state (existingEntry) to DictionaryEntryVersion.
        //    Use `upsert` with the CORRECT unique constraint name from the schema.
        await tx.dictionaryEntryVersion.upsert({
            where: {
                // Use the named unique constraint input type as defined in your Prisma schema
                uniq_entry_version: { // <-- Corrected unique constraint reference
                    dictionaryEntryId: id,
                    version: existingEntry.version, // Log the PREVIOUS version number
                }
            },
            update: {
                // If it exists, do nothing. This prevents errors if the log was pre-created.
            },
            create: {
                dictionaryEntryId: id,
                version: existingEntry.version, // Log the PREVIOUS version number
                term_th: existingEntry.term_th,
                term_en: existingEntry.term_en,
                definition_html: existingEntry.definition_html,
                changed_at: existingEntry.updated_at, // Time when it *was* the current version
                changed_by_user_id: userId,
            },
        });
        console.log(`Upserted log for previous version ${existingEntry.version} of entry ${id}`);

        // f. Log the *new* state (updatedEntryResult) to DictionaryEntryVersion.
        //    Use `upsert` with the CORRECT unique constraint name from the schema.
        await tx.dictionaryEntryVersion.upsert({
            where: {
                 // Use the named unique constraint input type as defined in your Prisma schema
                uniq_entry_version: { // <-- Corrected unique constraint reference
                    dictionaryEntryId: id,
                    version: updatedEntryResult.version, // Log the NEW version number
                }
            },
            update: {
                // If it exists, do nothing. The data should be the same anyway.
                // This handles the case robustly.
            },
            create: {
                dictionaryEntryId: id,
                version: updatedEntryResult.version, // Log the NEW version number
                term_th: updatedEntryResult.term_th,
                term_en: updatedEntryResult.term_en,
                definition_html: updatedEntryResult.definition_html,
                // Use the `updated_at` timestamp from *after* the update for the new version log.
                changed_at: updatedEntryResult.updated_at,
                changed_by_user_id: userId,
            },
        });
        console.log(`Upserted log for new version ${updatedEntryResult.version} of entry ${id}`);

        // --- Scenario Implementation Ends Here ---

        return updatedEntryResult; // Return the updated entry (now version N+1)
    }); // End of transaction

    // 6. Return Successful Response with Updated Entry
    return new Response(
      JSON.stringify(updatedEntry),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error updating dictionary entry (Scenario-specific):', error);

    // Handle specific errors thrown within the transaction
    if (error.message === 'ENTRY_NOT_FOUND' || error.code === 'P2025') { // P2025 is Prisma's "Record not found" error
         return new Response(
            JSON.stringify({ error: 'Dictionary entry not found' }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
    }
    // Handle Prisma unique constraint error (P2002)
    // Although `upsert` aims to prevent it, explicit handling is good for robustness.
    if (error.code === 'P2002') {
         return new Response(
            JSON.stringify({ error: 'Failed to log version: A log entry for this version already exists, possibly due to a conflict or prior incomplete operation.', details: error.meta?.target }),
            { status: 409, headers: { 'Content-Type': 'application/json' } } // 409 Conflict
        );
    }
    // Handle Prisma validation errors (like the one encountered)
    if (error.constructor?.name === 'PrismaClientValidationError') { // Safer check
         return new Response(
            JSON.stringify({ error: 'Invalid data provided for version log creation.', message: error.message }), // Include message for debugging
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // General server error response
    return new Response(
      JSON.stringify({ error: 'Internal Server Error', message: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  } finally {
    // 7. Disconnect Prisma Client
    await prisma.$disconnect();
  }
}

// --- PATCH Handler (alias for PUT as logic is similar for partial updates) ---
export { PUT as PATCH };