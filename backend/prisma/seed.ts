/**
 * Seeds the Unit Price List from the reference workbook.
 *
 *   npm run seed                       -> imports prisma/upl-reference.xlsx as version "v1"
 *   npm run seed -- ./other.xlsx v2    -> imports another file as another version
 *
 * Expected header row: Line | Item | Description | Category Name | UOM | Price
 */
import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import { parseUplWorkbook } from '../src/modules/upl/upl.parser';

const prisma = new PrismaClient();

async function main() {
  const file = process.argv[2] || path.join(__dirname, 'upl-reference.xlsx');
  const version = process.argv[3] || 'v1';

  console.log(`> Importing UPL from ${file} as version "${version}"`);
  const rows = await parseUplWorkbook(file);
  console.log(`> Parsed ${rows.length} price lines`);

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const existing = await prisma.uplItem.findUnique({
      where: { version_itemCode: { version, itemCode: row.itemCode } },
    });

    await prisma.uplItem.upsert({
      where: { version_itemCode: { version, itemCode: row.itemCode } },
      create: { ...row, version },
      update: { ...row },
    });

    existing ? updated++ : created++;
  }

  console.log(`> Done. ${created} created, ${updated} updated.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
