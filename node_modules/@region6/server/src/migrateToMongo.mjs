import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import dns from 'node:dns';

// Configure DNS for public resolvers if needed
dns.setServers(['8.8.8.8', '1.1.1.1']);

dotenv.config({ path: resolve(import.meta.dirname, '../.env') });

const root = resolve(import.meta.dirname, '../..');
const databaseDir = resolve(root, 'database');
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'reg6_revenue';

const categoryByThai = { 'รายได้': 'REVENUE', 'ค่าใช้จ่าย': 'EXPENSE' };
const sourcesMap = {
  sap: 'SAP',
  bi: 'BI',
  cod: 'COD',
  'e-Commerce': 'ECOMMERCE',
  fuze: 'FUZE',
  lotto: 'LOTTO',
  dit: 'DIT',
};

async function readJson(name) {
  const content = await readFile(resolve(databaseDir, name), 'utf8');
  return JSON.parse(content);
}

export async function runMigration() {
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in server/.env');
  }

  console.log(`\n🚀 [Migration] Connecting to MongoDB Atlas (${dbName})...`);
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✓ Connected successfully to MongoDB Atlas!');
    const db = client.db(dbName);

    const files = await readdir(databaseDir);
    console.log(`\n📁 Found ${files.length} files in local /database folder.`);

    /* ── 1. Master Offices ─────────────────────────────────────── */
    console.log('\n🏢 1/4 Migrating Master Offices (master_offices)...');
    const masterOfficesRaw = await readJson('master_post.json');
    const officeDocs = masterOfficesRaw.map((row) => ({
      _id: String(row.postcode),
      office_code: String(row.postcode),
      office_name: row.postname,
      province: row.province,
      district: row.district || null,
      subdistrict: row.subdistrict || null,
      is_regional_hq: String(row.postcode).startsWith('60000'),
    }));

    const collOffices = db.collection('master_offices');
    await collOffices.deleteMany({});
    if (officeDocs.length > 0) {
      await collOffices.insertMany(officeDocs);
    }
    await collOffices.createIndex({ province: 1, district: 1 });
    console.log(`  ✓ Inserted ${officeDocs.length} offices into master_offices.`);

    /* ── 2. Master Services ────────────────────────────────────── */
    console.log('\n📋 2/4 Migrating Master Services (master_services)...');
    const masterServicesRaw = await readJson('master_service.json');
    const serviceDocs = masterServicesRaw.map((row) => ({
      _id: String(row.accountcode),
      sap_account_code: String(row.accountcode),
      account_name: row.accountname,
      category: categoryByThai[row.category] || 'REVENUE',
      business_group: row['bussiness group'] || 'อื่นๆ',
      evm_service: row['evm service'] || 'อื่นๆ',
      service_item: row.service || row.accountname,
      is_pickup: false,
    }));

    const collServices = db.collection('master_services');
    await collServices.deleteMany({});
    if (serviceDocs.length > 0) {
      await collServices.insertMany(serviceDocs);
    }
    await collServices.createIndex({ category: 1, business_group: 1 });
    console.log(`  ✓ Inserted ${serviceDocs.length} services into master_services.`);

    /* ── 3. Monthly Transactions ───────────────────────────────── */
    console.log('\n📊 3/4 Migrating Monthly Transactions (transactions_monthly)...');
    const collTransactions = db.collection('transactions_monthly');
    await collTransactions.createIndex({ file_identifier: 1 });
    await collTransactions.createIndex({ year: 1, month: 1, office_code: 1, source_type: 1 });

    const actualFiles = files.filter((name) =>
      /^(sap|bi|cod|e-Commerce|fuze|lotto|dit)_\d{4}_\d+\.json$/.test(name)
    );

    let totalTransCount = 0;
    for (let i = 0; i < actualFiles.length; i++) {
      const fileName = actualFiles[i];
      const match = fileName.match(/^(.+?)_(\d{4})_(\d+)\.json$/);
      if (!match) continue;

      const [, rawPrefix, rawYear, rawMonth] = match;
      const sourceType = sourcesMap[rawPrefix] || rawPrefix.toUpperCase();
      const fileId = `${rawPrefix}_${rawYear}_${rawMonth}`;

      const rawRows = await readJson(fileName);
      const docs = rawRows.map((row, idx) => {
        const accountcode = String(row.accountcode ?? row.code ?? '');
        return {
          _id: `${fileId}_${idx}`,
          file_identifier: fileId,
          year: Number(row.year || rawYear),
          month: Number(row.month || rawMonth),
          office_code: String(row.postcode ?? ''),
          sap_account_code: accountcode,
          source_type: sourceType,
          amount: Number(row.actual) || 0,
        };
      });

      // Upsert by file_identifier
      await collTransactions.deleteMany({ file_identifier: fileId });
      if (docs.length > 0) {
        await collTransactions.insertMany(docs);
      }
      totalTransCount += docs.length;

      if ((i + 1) % 20 === 0 || i === actualFiles.length - 1) {
        console.log(`  Processed ${i + 1}/${actualFiles.length} actual files (${totalTransCount} rows)...`);
      }
    }
    console.log(`  ✓ Finished ${actualFiles.length} files. Total ${totalTransCount} transaction rows.`);

    /* ── 4. Targets ────────────────────────────────────────────── */
    console.log('\n🎯 4/4 Migrating Targets (targets)...');
    const collTargets = db.collection('targets');
    await collTargets.createIndex({ file_identifier: 1 });
    await collTargets.createIndex({ year: 1, month: 1, office_code: 1 });

    const targetFiles = files.filter((name) => /^target_\d{4}_\d+\.json$/.test(name));
    let totalTargetCount = 0;

    for (let i = 0; i < targetFiles.length; i++) {
      const fileName = targetFiles[i];
      const match = fileName.match(/^target_(\d{4})_(\d+)\.json$/);
      if (!match) continue;

      const [, rawYear, rawMonth] = match;
      const fileId = `target_${rawYear}_${rawMonth}`;
      const rawRows = await readJson(fileName);

      const docs = rawRows.map((row, idx) => ({
        _id: `${fileId}_${idx}`,
        file_identifier: fileId,
        year: Number(row.year || rawYear),
        month: Number(row.month || rawMonth),
        office_code: String(row.postcode ?? ''),
        sap_account_code: String(row.accountcode ?? ''),
        target_amount: Number(row.target) || 0,
      }));

      await collTargets.deleteMany({ file_identifier: fileId });
      if (docs.length > 0) {
        await collTargets.insertMany(docs);
      }
      totalTargetCount += docs.length;

      if ((i + 1) % 10 === 0 || i === targetFiles.length - 1) {
        console.log(`  Processed ${i + 1}/${targetFiles.length} target files (${totalTargetCount} rows)...`);
      }
    }
    console.log(`  ✓ Finished ${targetFiles.length} target files. Total ${totalTargetCount} target rows.`);

    console.log('\n🎉 ================================================');
    console.log('✅ ALL LOCAL DATABASE FILES MIGRATED TO MONGODB ATLAS!');
    console.log('==================================================\n');
  } finally {
    await client.close();
    console.log('Database connection closed.');
  }
}

// If executed directly from CLI
if (process.argv[1] && process.argv[1].endsWith('migrateToMongo.mjs')) {
  runMigration().catch((err) => {
    console.error('Migration error:', err);
    process.exit(1);
  });
}
