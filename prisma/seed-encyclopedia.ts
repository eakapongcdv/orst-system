// prisma/seed-encyclopedia.ts
import { PrismaClient, TaxonRank, Prisma } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

/**
 * Optional JSON schema structures for taxonomy seeding
 */
type JsonTaxon = {
  rank?: string | null;
  scientificName: string;
  thaiName?: string | null;
  status?: string | null;
  parentScientificName?: string | null;
  commonNames?: string[] | null;
  references?: Array<Record<string, any>> | null;
};

type JsonTaxonomy = {
  title: string;
  domain?: string | null;
  version?: string | null;
  description?: string | null;
  sourceUrl?: string | null;
  meta?: Record<string, any> | null;
  taxa?: JsonTaxon[];
};

/**
 * Normalize string rank to Prisma enum TaxonRank.
 */
function mapRank(input?: string | null): TaxonRank {
  if (!input) return TaxonRank.SPECIES;
  const k = String(input).trim().toUpperCase();
  // Common synonyms (EN/TH) mapped to canonical ranks
  const dict: Record<string, TaxonRank> = {
    KINGDOM: TaxonRank.KINGDOM,
    PHYLUM: TaxonRank.PHYLUM,
    DIVISION: TaxonRank.PHYLUM, // some datasets use Division ~ Phylum (plants)
    CLASS: TaxonRank.CLASS,
    ORDER: TaxonRank.ORDER,
    FAMILY: TaxonRank.FAMILY,
    GENUS: TaxonRank.GENUS,
    SPECIES: TaxonRank.SPECIES,
    SUBSPECIES: (TaxonRank as any).SUBSPECIES ?? TaxonRank.SPECIES, // fallback if enum lacks
    VARIETY: (TaxonRank as any).VARIETY ?? TaxonRank.SPECIES,       // fallback if enum lacks
    ชนิด: TaxonRank.SPECIES,
    วงศ์: TaxonRank.FAMILY,
    ชั้น: TaxonRank.CLASS,
    อันดับ: TaxonRank.ORDER,
    สกุล: TaxonRank.GENUS,
    ไฟลัม: TaxonRank.PHYLUM,
    อาณาจักร: TaxonRank.KINGDOM,
  };
  return dict[k] ?? (TaxonRank as any)[k] ?? TaxonRank.SPECIES;
}

async function findOrCreateTaxon(
  data: Omit<Prisma.TaxonUncheckedCreateInput, 'id' | 'createdAt' | 'updatedAt'> & {
    parentScientificName?: string | null;
  }
) {
  // Resolve parentId from parentScientificName if provided and parentId is not set
  let parentId = data.parentId ?? undefined;
  if (!parentId && data.parentScientificName) {
    const parent = await prisma.taxon.findFirst({
      where: {
        taxonomyId: data.taxonomyId as number,
        scientificName: data.parentScientificName,
      },
      select: { id: true },
    });
    if (parent) parentId = parent.id;
  }

  const existing = await prisma.taxon.findFirst({
    where: {
      taxonomyId: data.taxonomyId as number,
      scientificName: data.scientificName as string,
    },
  });
  if (existing) return existing;

  const payload: Prisma.TaxonUncheckedCreateInput = {
    taxonomyId: data.taxonomyId,
    parentId: parentId ?? null,
    rank: data.rank,
    scientificName: data.scientificName,
    thaiName: (data as any).thaiName ?? null,
    status: (data as any).status ?? null,
    commonNames: (data as any).commonNames ?? [],
    references: (data as any).references ?? [],
  };
  return prisma.taxon.create({ data: payload });
}

async function seedFromJsonIfExists() {
  const jsonPath = path.resolve(process.cwd(), 'prisma/encyclopedia.seed.json');
  if (!fs.existsSync(jsonPath)) return false;

  const raw = fs.readFileSync(jsonPath, 'utf8');
  const payload = JSON.parse(raw) as {
    encyclopedias?: Array<{
      slug: string;
      titleTh?: string | null;
      titleEn?: string | null;
      description?: string | null;
      coverImage?: string | null;
      sourceUrl?: string | null;
      publisher?: string | null;
      language?: string | null;
      tags?: string[] | null;
      meta?: any;
      articles?: Array<{
        slug: string;
        titleTh?: string | null;
        titleEn?: string | null;
        altTitles?: string[] | null;
        summary?: string | null;
        externalUrl?: string | null;
        contentHtml?: string | null;
        authors?: string[] | null;
        images?: string[] | null;
        keywords?: string[] | null;
        countryCode?: string | null;
        publishedAt?: string | null;
        orderIndex?: number | null;
      }>;
    }>;
  };

  if (!payload.encyclopedias?.length) return false;

  for (const enc of payload.encyclopedias) {
    const e = await prisma.encyclopedia.upsert({
      where: { slug: enc.slug },
      update: {},
      create: {
        slug: enc.slug,
        titleTh: enc.titleTh ?? enc.titleEn ?? 'สารานุกรมไม่มีชื่อ',
        titleEn: enc.titleEn ?? null,
        description: enc.description ?? null,
        coverImage: enc.coverImage ?? null,
        sourceUrl: enc.sourceUrl ?? null,
        publisher: enc.publisher ?? null,
        language: enc.language ?? 'th',
        tags: enc.tags ?? [],
        meta: enc.meta ?? {},
      },
    });

    for (const art of enc.articles ?? []) {
      await prisma.encyclopediaArticle.upsert({
        where: { encyclopediaId_slug: { encyclopediaId: e.id, slug: art.slug } },
        update: {},
        create: {
          encyclopediaId: e.id,
          slug: art.slug,
          titleTh: art.titleTh ?? art.titleEn ?? 'ไม่มีชื่อบทความ',
          titleEn: art.titleEn ?? null,
          altTitles: art.altTitles ?? [],
          summary: art.summary ?? null,
          externalUrl: art.externalUrl ?? null,
          contentHtml: art.contentHtml ?? null,
          authors: art.authors ?? [],
          images: art.images ?? [],
          keywords: art.keywords ?? [],
          countryCode: art.countryCode ?? null,
          publishedAt: art.publishedAt ? new Date(art.publishedAt) : new Date(),
          orderIndex: art.orderIndex ?? 0,
        },
      });
    }
  }

  return true;
}

/**
 * Seed Taxonomy/Taxa from prisma/taxonomy.seed.json if present.
 * The JSON structure should be:
 * {
 *   "taxonomies": [
 *     {
 *       "title": "อนุกรมวิธานสัตว์",
 *       "domain": "animal",
 *       "version": "1.0",
 *       "description": "...",
 *       "sourceUrl": "...",
 *       "meta": {...},
 *       "taxa": [
 *         { "rank": "KINGDOM", "scientificName": "Animalia", "thaiName": "สัตว์", "status": "accepted" },
 *         { "rank": "FAMILY", "scientificName": "Felidae", "parentScientificName": "Animalia" },
 *         ...
 *       ]
 *     }
 *   ]
 * }
 */
async function seedTaxonomyFromJsonIfExists() {
  const jsonPath = path.resolve(process.cwd(), 'prisma/taxonomy.seed.json');
  if (!fs.existsSync(jsonPath)) return false;

  const raw = fs.readFileSync(jsonPath, 'utf8');
  const payload = JSON.parse(raw) as { taxonomies?: JsonTaxonomy[] };
  if (!payload.taxonomies?.length) return false;

  for (const t of payload.taxonomies) {
    // Find existing taxonomy by title, else create
    let tax = await prisma.taxonomy.findFirst({ where: { title: t.title } });
    if (!tax) {
      tax = await prisma.taxonomy.create({
        data: {
          title: t.title,
          domain: (t.domain && t.domain.trim() !== '' ? t.domain : 'general'),
          version: t.version ?? null,
          description: t.description ?? null,
          sourceUrl: t.sourceUrl ?? null,
          meta: t.meta ?? {},
        },
      });
    }

    // Index to speed up parent resolution within this taxonomy
    const cacheByName = new Map<string, number>();

    // Prefetch any existing taxa names to avoid duplicates
    const existing = await prisma.taxon.findMany({
      where: { taxonomyId: tax.id },
      select: { id: true, scientificName: true },
    });
    for (const ex of existing) cacheByName.set(ex.scientificName, ex.id);

    for (const item of t.taxa ?? []) {
      const sci = item.scientificName;
      if (!sci) continue;

      // If already cached/exists, skip
      if (cacheByName.has(sci)) continue;

      // Resolve parentId if parentScientificName provided
      let parentId: number | undefined;
      if (item.parentScientificName) {
        // prefer cache
        if (cacheByName.has(item.parentScientificName)) {
          parentId = cacheByName.get(item.parentScientificName)!;
        } else {
          const p = await prisma.taxon.findFirst({
            where: { taxonomyId: tax.id, scientificName: item.parentScientificName },
            select: { id: true },
          });
          if (p) parentId = p.id;
        }
      }

      const created = await prisma.taxon.create({
        data: {
          taxonomyId: tax.id,
          parentId: parentId ?? null,
          rank: mapRank(item.rank),
          scientificName: item.scientificName,
          thaiName: item.thaiName ?? null,
          status: item.status ?? null,
          commonNames: item.commonNames ?? [],
          references: item.references ?? [],
        },
      });

      cacheByName.set(created.scientificName, created.id);
    }
  }

  return true;
}

async function main() {
  // 1) Try to seed full data from prisma/encyclopedia.seed.json (if provided)
  const loadedFromJson = await seedFromJsonIfExists();

  // Try to seed taxonomy sets from JSON if available
  const taxLoadedFromJson = await seedTaxonomyFromJsonIfExists();

  // 2) If no JSON provided, seed a compact default dataset (can be extended later)
  if (!loadedFromJson) {
    const europe = await prisma.encyclopedia.upsert({
      where: { slug: 'european-countries' },
      update: {},
      create: {
        slug: 'european-countries',
        titleTh: 'สารานุกรมประเทศในทวีปยุโรป',
        titleEn: 'Encyclopedia of European Countries',
        description: 'รวมบทความสารานุกรมประเทศในทวีปยุโรป (จัดแบบ A–Z)',
        coverImage: null,
        sourceUrl: 'https://lst.nectec.or.th/encyclopedia/',
        publisher: 'NECTEC LST',
        language: 'th',
        tags: ['ยุโรป', 'ประเทศ'],
        meta: { source: 'LST Encyclopedia' },
      },
    });

    // France
    await prisma.encyclopediaArticle.upsert({
      where: { encyclopediaId_slug: { encyclopediaId: europe.id, slug: 'france' } },
      update: {},
      create: {
        encyclopediaId: europe.id,
        slug: 'france',
        titleTh: 'ฝรั่งเศส',
        titleEn: 'France; French Republic',
        altTitles: ['สาธารณรัฐฝรั่งเศส'],
        summary: 'ประเทศในยุโรปตะวันตก เมืองหลวงปารีส',
        externalUrl: 'https://lst.nectec.or.th/encyclopedia/?p=10935',
        contentHtml:
          `<p><strong>ฝรั่งเศส</strong> (France; French Republic) เป็นประเทศในยุโรปตะวันตก มีบทบาททางประวัติศาสตร์ วัฒนธรรม และเศรษฐกิจสำคัญ</p>`,
        authors: ['LST (ref.)'],
        images: [],
        keywords: ['ยุโรป', 'ฝรั่งเศส', 'ประเทศ'],
        countryCode: 'FR',
        publishedAt: new Date(),
        orderIndex: 1,
      },
    });

    // Germany (example)
    await prisma.encyclopediaArticle.upsert({
      where: { encyclopediaId_slug: { encyclopediaId: europe.id, slug: 'germany' } },
      update: {},
      create: {
        encyclopediaId: europe.id,
        slug: 'germany',
        titleTh: 'เยอรมนี',
        titleEn: 'Germany; Federal Republic of Germany',
        summary: 'ประเทศในยุโรปกลาง เมืองหลวงเบอร์ลิน',
        externalUrl: 'https://lst.nectec.or.th/encyclopedia/',
        contentHtml:
          `<p><strong>เยอรมนี</strong> เป็นประเทศในยุโรปกลาง มีภาคอุตสาหกรรมเข้มแข็งและนวัตกรรมสูง</p>`,
        authors: ['LST (ref.)'],
        images: [],
        keywords: ['ยุโรป', 'เยอรมนี', 'ประเทศ'],
        countryCode: 'DE',
        publishedAt: new Date(),
        orderIndex: 2,
      },
    });
  }

  // 3) Taxonomies (Plant & Animal) — use safe find-or-create to avoid composite-unique assumptions
  let plantTax = await prisma.taxonomy.findFirst({ where: { title: 'อนุกรมวิธานพืช' } });
  if (!plantTax) {
    plantTax = await prisma.taxonomy.create({
      data: {
        title: 'อนุกรมวิธานพืช',
        domain: 'plant',
        version: '1.0',
        description: 'ลำดับชั้นอนุกรมวิธานสำหรับพืช',
        sourceUrl: 'https://lst.nectec.or.th/encyclopedia/',
        meta: { provider: 'LST' },
      },
    });
  }

  let animalTax = await prisma.taxonomy.findFirst({ where: { title: 'อนุกรมวิธานสัตว์' } });
  if (!animalTax) {
    animalTax = await prisma.taxonomy.create({
      data: {
        title: 'อนุกรมวิธานสัตว์',
        domain: 'animal',
        version: '1.0',
        description: 'ลำดับชั้นอนุกรมวิธานสำหรับสัตว์',
        sourceUrl: 'https://lst.nectec.or.th/encyclopedia/',
        meta: { provider: 'LST' },
      },
    });
  }

  // --- Sample plant lineage: Plantae > Poaceae > Oryza > Oryza sativa (ข้าว)
  const plantae = await findOrCreateTaxon({
    taxonomyId: plantTax.id,
    rank: TaxonRank.KINGDOM,
    scientificName: 'Plantae',
    thaiName: 'พืช',
    status: 'accepted',
  });

  const poaceae = await findOrCreateTaxon({
    taxonomyId: plantTax.id,
    parentId: plantae.id,
    rank: TaxonRank.FAMILY,
    scientificName: 'Poaceae',
    thaiName: 'วงศ์หญ้า',
    status: 'accepted',
  });

  const oryza = await findOrCreateTaxon({
    taxonomyId: plantTax.id,
    parentId: poaceae.id,
    rank: TaxonRank.GENUS,
    scientificName: 'Oryza',
    thaiName: 'ข้าว (สกุล)',
    status: 'accepted',
  });

  await findOrCreateTaxon({
    taxonomyId: plantTax.id,
    parentId: oryza.id,
    rank: TaxonRank.SPECIES,
    scientificName: 'Oryza sativa',
    thaiName: 'ข้าวเจ้า/ข้าวปลูก',
    commonNames: ['ข้าว (rice)'],
    status: 'accepted',
    references: [{ cite: 'FAO / GBIF', url: 'https://www.gbif.org/' }],
  });

  // --- Sample animal lineage: Animalia > Felidae > Panthera > Panthera tigris (เสือโคร่ง)
  const animalia = await findOrCreateTaxon({
    taxonomyId: animalTax.id,
    rank: TaxonRank.KINGDOM,
    scientificName: 'Animalia',
    thaiName: 'สัตว์',
    status: 'accepted',
  });

  const felidae = await findOrCreateTaxon({
    taxonomyId: animalTax.id,
    parentId: animalia.id,
    rank: TaxonRank.FAMILY,
    scientificName: 'Felidae',
    thaiName: 'วงศ์แมว',
    status: 'accepted',
  });

  const panthera = await findOrCreateTaxon({
    taxonomyId: animalTax.id,
    parentId: felidae.id,
    rank: TaxonRank.GENUS,
    scientificName: 'Panthera',
    thaiName: 'เสือใหญ่ (สกุล)',
    status: 'accepted',
  });

  await findOrCreateTaxon({
    taxonomyId: animalTax.id,
    parentId: panthera.id,
    rank: TaxonRank.SPECIES,
    scientificName: 'Panthera tigris',
    thaiName: 'เสือโคร่ง',
    commonNames: ['tiger'],
    status: 'accepted',
  });

  console.log(`✅ Seeded: Encyclopedia (${loadedFromJson ? 'JSON' : 'sample'}) + Taxonomy (${typeof taxLoadedFromJson === 'boolean' ? (taxLoadedFromJson ? 'JSON' : 'sample') : 'sample'})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });