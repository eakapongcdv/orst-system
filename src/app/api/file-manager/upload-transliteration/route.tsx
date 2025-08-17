// src/app/api/file-manager/upload-transliteration/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
const prisma = new PrismaClient();

// --- Helper function to convert Excel date serial number to JS Date ---
function excelDateToJSDate(serial: number): Date | null {
  try {
    if (typeof serial !== 'number' || serial < 1000 || serial > 1000000) {
      return null;
    }
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const dayInMs = 24 * 60 * 60 * 1000;
    const jsDate = new Date(excelEpoch.getTime() + (serial * dayInMs));
    if (jsDate && jsDate.getFullYear() > 1899 && jsDate.getFullYear() < 2500) {
      return jsDate;
    }
    return null;
  } catch (e) {
    console.error("Error converting Excel serial date:", serial, e);
    return null;
  }
}

// --- Helper function to parse custom date strings like "30-Sep-62" ---
function parseCustomDateString(dateStr: unknown): Date | null {
  if (typeof dateStr !== 'string') {
    return null;
  }
  const trimmedStr = dateStr.trim();
  if (!trimmedStr) return null;

  const months: { [key: string]: number } = {
    'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
    'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
  };

  try {
    const parts = trimmedStr.split('-');
    if (parts.length !== 3) return null;

    const day = parseInt(parts[0], 10);
    const monthAbbr = parts[1];
    const yearTwoDigit = parseInt(parts[2], 10);

    if (isNaN(day) || isNaN(yearTwoDigit) || !months.hasOwnProperty(monthAbbr)) {
      return null;
    }

    let fullYear = yearTwoDigit >= 50 ? yearTwoDigit + 1900 : yearTwoDigit + 2000;
    const monthIndex = months[monthAbbr];
    const jsDate = new Date(Date.UTC(fullYear, monthIndex, day));

    if (jsDate.getUTCFullYear() === fullYear &&
        jsDate.getUTCMonth() === monthIndex &&
        jsDate.getUTCDate() === day) {
      return jsDate;
    }
    return null;
  } catch (e) {
    console.error("Error parsing custom date string:", trimmedStr, e);
    return null;
  }
}

// --- Main POST Handler ---
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      return NextResponse.json({ error: 'Invalid file type. Please upload an .xlsx file.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Read data starting from the second row (index 1), assuming first row is header
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    // Assume first data row is header and actual data starts from the next row
    // Or find a specific marker row if needed, but for simplicity, we start from index 1
    const dataStartIndex = 1; 

    const vocabularyDataToUpsert: any[] = [];
    let skippedRowCount = 0;
    let emptyRomanizationCount = 0;

    for (let i = dataStartIndex; i < jsonData.length; i++) {
      const row = jsonData[i];

      if (!Array.isArray(row) || row.length < 13) {
        console.warn(`Skipping row ${i + 1} due to insufficient data or incorrect format:`, row);
        skippedRowCount++;
        continue;
      }

      const rawRomanization = row[0];
      let romanizationValue: string | null = null;

      if (rawRomanization !== null && rawRomanization !== undefined) {
        romanizationValue = typeof rawRomanization === 'string'
          ? rawRomanization.trim() || null
          : String(rawRomanization).trim() || null;
      }

      if (!romanizationValue) {
        console.warn(`Skipping row ${i + 1} because 'romanization' is empty or null:`, row);
        emptyRomanizationCount++;
        continue;
      }

      const rawPublicationDateValue = row[12];
      let parsedPublicationDate: Date | null = null;
      let processedDateValue: string | number | null | undefined = rawPublicationDateValue;

      if (typeof processedDateValue === 'string') {
        const trimmedStr = processedDateValue.trim();
        if (['', 'n/a', '-', 'ไม่ระบุ'].includes(trimmedStr.toLowerCase())) {
          processedDateValue = null;
        } else {
          processedDateValue = trimmedStr;
        }
      } else if (processedDateValue === null || processedDateValue === undefined) {
        // คงค่า null/undefined
      } else if (typeof processedDateValue !== 'number') {
        console.warn(`Unexpected date type in row ${i + 1} (romanization: ${romanizationValue}):`, typeof processedDateValue, processedDateValue);
        processedDateValue = null;
      }

      if (processedDateValue === null || processedDateValue === undefined) {
        parsedPublicationDate = null;
      } else if (typeof processedDateValue === 'number') {
        parsedPublicationDate = excelDateToJSDate(processedDateValue);
        if (!parsedPublicationDate) {
          console.warn(`Could not parse Excel serial date number from row ${i + 1} (romanization: ${romanizationValue}):`, processedDateValue);
        }
      } else if (typeof processedDateValue === 'string') {
        parsedPublicationDate = parseCustomDateString(processedDateValue);
        if (!parsedPublicationDate) {
          const potentialSerial = parseFloat(processedDateValue);
          if (!isNaN(potentialSerial)) {
            parsedPublicationDate = excelDateToJSDate(potentialSerial);
          }
          if (!parsedPublicationDate) {
            console.warn(`Could not parse date string from row ${i + 1} (romanization: ${romanizationValue}): '${processedDateValue}'`);
          }
        }
      }

      const entryData = {
        romanization: romanizationValue,
        originalScript1: row[1] ?? null,
        originalScript2: row[2] ?? null,
        language: row[3] ?? null,
        wordType: row[4] ?? null,
        category: row[5] ?? null,
        transliteration1: row[6] ?? null,
        transliteration2: row[7] ?? null,
        otherFoundWords: row[8] ?? null,
        meaning: row[9] ?? null,
        notes: row[10] ?? null,
        referenceCriteria: row[11] ?? null,
        publicationDate: parsedPublicationDate,
      };

      vocabularyDataToUpsert.push(entryData);
    }

    const totalProcessedRows = jsonData.length - dataStartIndex;
    console.log(`Processed ${totalProcessedRows} potential data rows.`);
    console.log(`Skipped ${skippedRowCount} rows due to format.`);
    console.log(`Skipped ${emptyRomanizationCount} rows due to missing 'romanization'.`);
    console.log(`Preparing to upsert ${vocabularyDataToUpsert.length} entries.`);

    if (vocabularyDataToUpsert.length === 0) {
      const message = 'No valid vocabulary data found in the file or all rows lacked a "romanization" value.';
      console.warn(message);
      return NextResponse.json({ 
        message,
        created: 0,
        skipped: skippedRowCount + emptyRomanizationCount,
        errors: []
      }, { status: 400 });
    }

    // --- Perform Database Upsert Operations ---
    let successCount = 0; // Total successful upserts (create or update)
    let createdCount = 0; // Count of newly created entries
    let updatedCount = 0; // Count of updated entries
    let errorCount = 0;
    const errors: string[] = [];

    try {
      await prisma.$transaction(async (tx) => {
        for (const data of vocabularyDataToUpsert) {
          try {
            // Check if entry exists before upserting to determine create/update
            const existingEntry = await tx.transliterationEntry.findUnique({
                where: { romanization: data.romanization }
            });

            const result = await tx.transliterationEntry.upsert({
              where: { romanization: data.romanization },
              update: {
                originalScript1: data.originalScript1,
                originalScript2: data.originalScript2,
                language: data.language,
                wordType: data.wordType,
                category: data.category,
                transliteration1: data.transliteration1,
                transliteration2: data.transliteration2,
                otherFoundWords: data.otherFoundWords,
                meaning: data.meaning,
                notes: data.notes,
                referenceCriteria: data.referenceCriteria,
                publicationDate: data.publicationDate,
              },
              create: {
                romanization: data.romanization,
                originalScript1: data.originalScript1,
                originalScript2: data.originalScript2,
                language: data.language,
                wordType: data.wordType,
                category: data.category,
                transliteration1: data.transliteration1,
                transliteration2: data.transliteration2,
                otherFoundWords: data.otherFoundWords,
                meaning: data.meaning,
                notes: data.notes,
                referenceCriteria: data.referenceCriteria,
                publicationDate: data.publicationDate,
              }
            });
            
            successCount++;
            if (existingEntry) {
                updatedCount++;
            } else {
                createdCount++;
            }
            
          } catch (upsertError: any) {
            const errorMsg = `Error upserting entry with romanization '${data.romanization}': ${upsertError.message}`;
            console.error(errorMsg);
            errors.push(errorMsg);
            errorCount++;
          }
        }
      });

      console.log(`Upsert operation completed. Success: ${successCount}, Created: ${createdCount}, Updated: ${updatedCount}, Errors: ${errorCount}`);
      
    } catch (transactionError: any) {
      console.error("Transaction failed:", transactionError);
      return NextResponse.json({ 
        message: `Database transaction failed: ${transactionError.message}`,
        created: 0,
        skipped: totalProcessedRows,
        errors: [`Transaction failed: ${transactionError.message}`]
      }, { status: 500 });
    }

    // Return standardized response format for frontend
    const responsePayload = {
        message: `Vocabulary uploaded and processed successfully. ${createdCount} created, ${updatedCount} updated.`,
        created: createdCount,
        skipped: skippedRowCount + emptyRomanizationCount,
        errors: errors
    };

    if (errorCount > 0) {
      return NextResponse.json(responsePayload, { status: 200 }); // Still 200 OK as partial success
    } else {
      return NextResponse.json(responsePayload, { status: 201 }); // 201 Created if all successful
    }
    
  } catch (error: any) {
    console.error("Error in vocabulary upload API:", error);
    let errorMessage = 'Internal Server Error';
    if (error.name === 'PrismaClientKnownRequestError') {
      errorMessage = `Database error: ${error.message}`;
    } else if (error.code === 'ENOENT') {
      errorMessage = `File processing error: File not found.`;
    } else if (error.message) {
      errorMessage = error.message;
    }

    return NextResponse.json({ 
      message: errorMessage,
      created: 0,
      skipped: 0,
      errors: [errorMessage]
    }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}