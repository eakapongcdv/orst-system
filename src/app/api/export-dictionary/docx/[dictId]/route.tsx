import { NextResponse } from 'next/server';

export async function DELETE(request: Request, context: any) {
  const params = context?.params ?? {};
  const rawId = params?.id as string | undefined;
  if (!rawId) {
    return NextResponse.json({ error: 'Missing resource id.' }, { status: 400 });
  }
  const id = /^\d+$/.test(rawId) ? parseInt(rawId, 10) : rawId;

  // ...rest of the DELETE handler code, replacing params.id with rawId or id as appropriate
}