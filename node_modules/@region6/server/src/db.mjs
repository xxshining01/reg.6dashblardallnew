import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import dns from 'node:dns';

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

export async function loadData() {
  let client = null;

  if (uri) {
    try {
      console.log(`[Database] Attempting connection to MongoDB Atlas (${dbName})...`);
      client = new MongoClient(uri, { serverSelectionTimeoutMS: 4000 });
      await client.connect();
      const db = client.db(dbName);

      const officeCount = await db.collection('master_offices').countDocuments();
      if (officeCount > 0) {
        console.log(`[Database] ✓ Connected to MongoDB Atlas! Fetching dataset...`);
        const [officesDoc, servicesDoc, actualsDoc, targetsDoc] = await Promise.all([
          db.collection('master_offices').find({}, { projection: { _id: 0, office_code: 1, office_name: 1, province: 1 } }).toArray(),
          db.collection('master_services').find({}, { projection: { _id: 0, sap_account_code: 1, account_name: 1, category: 1, business_group: 1, evm_service: 1 } }).toArray(),
          db.collection('transactions_monthly').find({}, { projection: { _id: 0, year: 1, month: 1, office_code: 1, sap_account_code: 1, amount: 1, source_type: 1 }, batchSize: 50000 }).toArray(),
          db.collection('targets').find({}, { projection: { _id: 0, year: 1, month: 1, office_code: 1, sap_account_code: 1, target_amount: 1 }, batchSize: 50000 }).toArray(),
        ]);

        const offices = officesDoc.map((r) => ({
          postcode: r.office_code,
          postname: r.office_name,
          province: r.province,
        }));

        const services = servicesDoc.map((r) => ({
          accountcode: r.sap_account_code,
          accountname: r.account_name,
          category: r.category === 'REVENUE' ? 'รายได้' : 'ค่าใช้จ่าย',
          'bussiness group': r.business_group,
          'evm service': r.evm_service,
        }));

        const serviceByAccount = new Map(services.map((row) => [String(row.accountcode), row]));

        const actuals = actualsDoc.map((r) => {
          const accountcode = String(r.sap_account_code);
          const service = serviceByAccount.get(accountcode);
          return {
            year: r.year,
            month: r.month,
            postcode: r.office_code,
            accountcode,
            amount: r.amount,
            source: r.source_type,
            category: categoryByThai[service?.category] ?? categoryByThai[accountcode],
          };
        });

        const targets = targetsDoc.map((r) => ({
          year: r.year,
          month: r.month,
          postcode: r.office_code,
          accountcode: String(r.sap_account_code),
          amount: r.target_amount,
        }));

        console.log(`[Database] ✓ Loaded ${actuals.length} transactions and ${targets.length} targets from MongoDB Atlas.`);
        return { offices, services, actuals, targets, source: 'MongoDB Atlas' };
      } else {
        console.log('[Database] MongoDB Atlas is connected but collections are empty. Loading local files...');
      }
    } catch (err) {
      console.warn(`[Database] MongoDB Atlas connection notice: ${err.message}. Loading from local JSON files.`);
    } finally {
      if (client) await client.close().catch(() => {});
    }
  }

  // Local fallback
  console.log('[Database] Loading data from local /database/*.json files...');
  const readJson = (name) => readFile(resolve(databaseDir, name), 'utf8').then(JSON.parse);
  const files = await readdir(databaseDir);
  const actualFiles = files.filter((name) =>
    /^(sap|bi|cod|e-Commerce|fuze|lotto|dit)_\d{4}_\d+\.json$/.test(name)
  );
  const targetFiles = files.filter((name) => /^target_\d{4}_\d+\.json$/.test(name));

  const [offices, services, actualRaw, targetRaw] = await Promise.all([
    readJson('master_post.json'),
    readJson('master_service.json'),
    Promise.all(actualFiles.map(readJson)),
    Promise.all(targetFiles.map(readJson)),
  ]);

  const serviceByAccount = new Map(services.map((row) => [String(row.accountcode), row]));
  const sourceFromFile = (name) => sourcesMap[name.match(/^(.+?)_\d{4}_\d+\.json$/)?.[1]];

  const actuals = actualRaw.flatMap((rows, index) =>
    rows.map((row) => {
      const accountcode = String(row.accountcode ?? row.code ?? '');
      const service = serviceByAccount.get(accountcode);
      return {
        year: Number(row.year),
        month: Number(row.month),
        postcode: String(row.postcode ?? ''),
        accountcode,
        amount: Number(row.actual) || 0,
        source: sourceFromFile(actualFiles[index]),
        category: categoryByThai[service?.category] ?? categoryByThai[accountcode],
      };
    })
  );

  const targets = targetRaw.flatMap((rows) =>
    rows.map((row) => ({
      year: Number(row.year),
      month: Number(row.month),
      postcode: String(row.postcode ?? ''),
      accountcode: String(row.accountcode),
      amount: Number(row.target) || 0,
    }))
  );

  return { offices, services, actuals, targets, source: 'Local JSON Files' };
}
