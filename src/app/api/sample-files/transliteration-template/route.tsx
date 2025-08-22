
import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'src', 'sample-files', 'ตัวอย่าง คำทับศัพท์.xlsx');
    const data = await fs.readFile(filePath);

    // Ensure ASCII-safe filename for Content-Disposition while preserving Thai name
    const asciiName = 'transliteration-sample.xlsx';
    const thaiName = encodeURIComponent('ตัวอย่าง คำทับศัพท์.xlsx');

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Length': String(data.byteLength),
        // Use RFC 5987 filename* to include UTF-8 name, plus ASCII fallback
        'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${thaiName}`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (e) {
    console.error('Sample file not found or cannot be read:', e);
    return NextResponse.json({ ok: false, error: 'ไม่พบไฟล์ตัวอย่างบนเซิร์ฟเวอร์' }, { status: 404 });
  }
}
