import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import dns from 'node:dns';

dns.setServers(['8.8.8.8', '1.1.1.1']);
dotenv.config({ path: resolve(import.meta.dirname, '../.env') });

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'reg6_revenue';
const sourcesMap = {
  sap: 'SAP',
  bi: 'BI',
  cod: 'COD',
  'e-Commerce': 'ECOMMERCE',
  fuze: 'FUZE',
  lotto: 'LOTTO',
  dit: 'DIT',
};

/**
 * Upload or update a specific JSON file to MongoDB Atlas
 * Usage: node src/uploadDataFile.mjs <filePath>
 * Example: node src/uploadDataFile.mjs ../database/sap_2026_7.json
 */
export async function uploadFiles(filePaths) {
  if (!uri) throw new Error('MONGODB_URI is not set in server/.env');
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths];

  const client = new MongoClient(uri);

  try {
    console.log(`\n🚀 Connecting to MongoDB Atlas (${dbName})...`);
    await client.connect();
    console.log(`✓ Connected! Processing ${paths.length} file(s)...\n`);
    const db = client.db(dbName);

    for (let i = 0; i < paths.length; i++) {
      const filePath = paths[i];
      const fileName = basename(filePath);
      const rawContent = await readFile(filePath, 'utf8');
      const rows = JSON.parse(rawContent);

      if (fileName === 'master_post.json') {
        const coll = db.collection('master_offices');
        const docs = rows.map((r) => ({
          _id: String(r.postcode),
          office_code: String(r.postcode),
          office_name: r.postname,
          province: r.province,
          district: r.district || null,
          subdistrict: r.subdistrict || null,
          is_regional_hq: String(r.postcode).startsWith('60000'),
        }));
        await coll.deleteMany({});
        await coll.insertMany(docs);
        console.log(`[${i + 1}/${paths.length}] ✓ Updated master_offices (${docs.length} rows)`);
      } else if (fileName === 'master_service.json') {
        const coll = db.collection('master_services');
        const categoryByThai = { 'รายได้': 'REVENUE', 'ค่าใช้จ่าย': 'EXPENSE' };
        const docs = rows.map((r) => ({
          _id: String(r.accountcode),
          sap_account_code: String(r.accountcode),
          account_name: r.accountname,
          category: categoryByThai[r.category] || 'REVENUE',
          business_group: r['bussiness group'] || 'อื่นๆ',
          evm_service: r['evm service'] || 'อื่นๆ',
          service_item: r.service || r.accountname,
          is_pickup: false,
        }));
        await coll.deleteMany({});
        await coll.insertMany(docs);
        console.log(`[${i + 1}/${paths.length}] ✓ Updated master_services (${docs.length} rows)`);
      } else if (/^target_\d{4}_\d+\.json$/.test(fileName)) {
        const match = fileName.match(/^target_(\d{4})_(\d+)\.json$/);
        const [, rawYear, rawMonth] = match;
        const fileId = `target_${rawYear}_${rawMonth}`;
        const coll = db.collection('targets');

        const docs = rows.map((r, idx) => ({
          _id: `${fileId}_${idx}`,
          file_identifier: fileId,
          year: Number(r.year || rawYear),
          month: Number(r.month || rawMonth),
          office_code: String(r.postcode ?? ''),
          sap_account_code: String(r.accountcode ?? ''),
          target_amount: Number(r.target) || 0,
        }));

        await coll.deleteMany({ file_identifier: fileId });
        if (docs.length > 0) await coll.insertMany(docs);
        console.log(`[${i + 1}/${paths.length}] ✓ Upserted target [${fileId}]: ${docs.length} rows`);
      } else {
        // Actual transaction file
        const match = fileName.match(/^(.+?)_(\d{4})_(\d+)\.json$/);
        if (!match) {
          console.warn(`[${i + 1}/${paths.length}] ⚠️ Unrecognized file pattern: ${fileName}, skipping.`);
          continue;
        }
        const [, rawPrefix, rawYear, rawMonth] = match;
        const sourceType = sourcesMap[rawPrefix] || rawPrefix.toUpperCase();
        const fileId = `${rawPrefix}_${rawYear}_${rawMonth}`;
        const coll = db.collection('transactions_monthly');

        const docs = rows.map((r, idx) => {
          const accountcode = String(r.accountcode ?? r.code ?? '');
          return {
            _id: `${fileId}_${idx}`,
            file_identifier: fileId,
            year: Number(r.year || rawYear),
            month: Number(r.month || rawMonth),
            office_code: String(r.postcode ?? ''),
            sap_account_code: accountcode,
            source_type: sourceType,
            amount: Number(r.actual) || 0,
          };
        });

        await coll.deleteMany({ file_identifier: fileId });
        if (docs.length > 0) await coll.insertMany(docs);
        console.log(`[${i + 1}/${paths.length}] ✓ Upserted transaction [${fileId}] (${sourceType}): ${docs.length} rows`);
      }
    }
    console.log(`\n🎉 Successfully completed upload of ${paths.length} file(s)!`);
  } finally {
    await client.close();
  }
}

export const uploadFile = (filePath) => uploadFiles([filePath]);

if (process.argv.slice(2).length > 0) {
  uploadFiles(process.argv.slice(2)).catch((err) => {
    console.error('Upload error:', err);
    process.exit(1);
  });
}
