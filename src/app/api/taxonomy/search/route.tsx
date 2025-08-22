// src/app/api/taxonomy/search/route.tsx
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { JSDOM } from 'jsdom';

const prisma = new PrismaClient();
export const runtime = 'nodejs';

// Escape string for safe use in RegExp
function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Wrap all occurrences of query in <mark> for plain text
function markTextAll(text: string, query: string): string {
  if (!query) return text;
  const re = new RegExp(escapeRegExp(query), 'giu');
  return text.replace(re, '<mark>$&</mark>');
}

// Walk text nodes and wrap matches with <mark>, preserving HTML structure
function markHtmlAll(html: string, query: string): string {
  if (!query) return html;
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
  const { document, NodeFilter } = dom.window as any;
  const body = document.body as HTMLElement;
  const re = new RegExp(escapeRegExp(query), 'giu');

  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null);
  const toProcess: Text[] = [];
  let node: any;
  while ((node = walker.nextNode())) {
    const val = node.nodeValue || '';
    if (re.test(val)) toProcess.push(node);
    re.lastIndex = 0; // reset between checks
  }

  for (const textNode of toProcess) {
    const val = textNode.nodeValue || '';
    const span = document.createElement('span');
    // Replace text with marked HTML
    re.lastIndex = 0;
    span.innerHTML = val.replace(re, '<mark>$&</mark>');
    const parent = textNode.parentNode as Node;
    const frag = document.createDocumentFragment();
    while (span.firstChild) frag.appendChild(span.firstChild);
    parent.replaceChild(frag, textNode);
  }

  return body.innerHTML;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10)));

    const where = q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { officialNameTh: { contains: q, mode: 'insensitive' } },
            { official: { contains: q, mode: 'insensitive' } },
            { scientificName: { contains: q, mode: 'insensitive' } },
            { genus: { contains: q, mode: 'insensitive' } },
            { species: { contains: q, mode: 'insensitive' } },
            { authorsDisplay: { contains: q, mode: 'insensitive' } },
            { otherNames: { contains: q, mode: 'insensitive' } },
            { author: { contains: q, mode: 'insensitive' } },
            { contentText: { contains: q, mode: 'insensitive' } },
            { contentHtml: { contains: q, mode: 'insensitive' } },
            { taxon: { is: { scientificName: { contains: q, mode: 'insensitive' } } } },
          ],
        }
      : {};

    const orderBy = q
      ? [{ updatedAt: 'desc' }, { id: 'desc' }]
      : [{ id: 'asc' }];

    const total = await prisma.taxonEntry.count({ where });
    const results = await prisma.taxonEntry.findMany({
      where,
      orderBy: orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        taxonId: true,
        title: true,
        slug: true,
        orderIndex: true,
        contentHtml: true,
        contentText: true,
        // meta fields from schema
        officialNameTh: true,
        official: true,
        scientificName: true,
        genus: true,
        species: true,
        authorsDisplay: true,
        authorsPeriod: true,
        otherNames: true,
        author: true,
        meta: true,
        updatedAt: true,
        taxon: {
          select: {
            id: true,
            scientificName: true,
          },
        },
      },
    });

    const decorated = q
      ? results.map(r => ({
          ...r,
          titleMarked: r.title ? markTextAll(r.title, q) : r.title,
          officialNameThMarked: r.officialNameTh ? markTextAll(r.officialNameTh, q) : r.officialNameTh,
          officialMarked: r.official ? markTextAll(r.official, q) : r.official,
          scientificNameMarked: r.scientificName ? markTextAll(r.scientificName, q) : r.scientificName,
          authorsDisplayMarked: r.authorsDisplay ? markTextAll(r.authorsDisplay, q) : r.authorsDisplay,
          otherNamesMarked: r.otherNames ? markTextAll(r.otherNames, q) : r.otherNames,
          authorMarked: r.author ? markTextAll(r.author, q) : r.author,
          contentTextMarked: r.contentText ? markTextAll(r.contentText, q) : r.contentText,
          contentHtmlMarked: r.contentHtml ? markHtmlAll(r.contentHtml, q) : r.contentHtml,
        }))
      : results;

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const pagination = {
      currentPage: page,
      totalPages,
      pageSize,
      total,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
      prevPage: page > 1 ? page - 1 : undefined,
      nextPage: page < totalPages ? page + 1 : undefined,
    };

    return NextResponse.json({ ok: true, results: decorated, pagination });
  } catch (err: any) {
    console.error('taxonomy/search GET error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'Unexpected error' }, { status: 500 });
  }
}