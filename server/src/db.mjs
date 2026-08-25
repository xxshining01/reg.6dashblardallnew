import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import dns from 'node:dns';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (process.platform === 'win32' && !process.env.VERCEL) {
  try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (e) {}
}

dotenv.config({ path: resolve(__dirname, '../.env') });

const categoryByThai = { 'รายได้': 'REVENUE', 'ค่าใช้จ่าย': 'EXPENSE' };

export let dbDiagnostics = {
  status: 'initializing',
  hasMongoUri: false,
  uriSnippet: null,
  dbName: null,
  error: null,
  source: 'MongoDB Atlas',
};

/* ── MongoDB Connection Pool (persists across warm starts) ─── */
let client = null;
let dbInstance = null;

export async function getDb() {
  if (dbInstance) return dbInstance;
  const rawUri = process.env.MONGODB_URI || '';
  const uri = rawUri.replace(/^["']|["']$/g, '').trim();
  const dbName = (process.env.MONGODB_DB_NAME || 'reg6_revenue').replace(/^["']|["']$/g, '').trim();

  dbDiagnostics.hasMongoUri = !!uri;
  dbDiagnostics.uriSnippet = uri ? uri.substring(0, 28) + '...' : 'NONE';
  dbDiagnostics.dbName = dbName;

  if (!uri) throw new Error('MONGODB_URI is not set');

  console.log(`[DB] Connecting to MongoDB Atlas (${dbName})...`);
  client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
    maxPoolSize: 10,
  });
  await client.connect();
  dbInstance = client.db(dbName);
  dbDiagnostics.status = 'connected';
  console.log('[DB] ✓ Connected');
  return dbInstance;
}

/* ── Master Data Cache (small — offices + services + year stats) ── */
let _master = null;
let _masterPromise = null;

export async function getMasterData() {
  if (_master) return _master;
  if (!_masterPromise) _masterPromise = _loadMaster();
  return _masterPromise;
}

async function _loadMaster() {
  const db = await getDb();
  const t0 = Date.now();

  const [officeDocs, serviceDocs, yearStats] = await Promise.all([
    db.collection('master_offices').find({}, {
      projection: { _id: 0, office_code: 1, office_name: 1, province: 1 }
    }).toArray(),
    db.collection('master_services').find({}, {
      projection: { _id: 0, sap_account_code: 1, account_name: 1, category: 1, business_group: 1, evm_service: 1 }
    }).toArray(),
    db.collection('transactions_monthly').aggregate([
      { $group: { _id: '$year', maxMonth: { $max: '$month' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]).toArray(),
  ]);

  const targetCount = await db.collection('targets').estimatedDocumentCount();

  /* Offices (same shape as before for API compat) */
  const offices = officeDocs.map(r => ({
    postcode: r.office_code,
    postname: r.office_name,
    province: r.province,
  }));
  const officeByPostcode = new Map(offices.map(o => [String(o.postcode), o]));

  /* Services (same shape as before) */
  const services = serviceDocs.map(r => ({
    accountcode: r.sap_account_code,
    accountname: r.account_name,
    category: r.category === 'REVENUE' ? 'รายได้' : 'ค่าใช้จ่าย',
    'bussiness group': r.business_group,
    'evm service': r.evm_service,
  }));
  const serviceByAccount = new Map(services.map(s => [String(s.accountcode), s]));

  /* Category → accountcode lists */
  const revenueAccounts = serviceDocs.filter(s => s.category === 'REVENUE').map(s => s.sap_account_code);
  const expenseAccounts = serviceDocs.filter(s => s.category === 'EXPENSE').map(s => s.sap_account_code);
  const revenueAccountSet = new Set(revenueAccounts);
  const expenseAccountSet = new Set(expenseAccounts);

  /* Province → postcodes */
  const postcodesByProvince = {};
  for (const o of offices) {
    const p = o.province || 'อื่นๆ';
    (postcodesByProvince[p] ??= []).push(String(o.postcode));
  }

  /* Service hierarchy (for /meta/filters) */
  const serviceHierarchy = {};
  for (const svc of services) {
    const cat = categoryByThai[svc.category];
    if (!cat) continue;
    ((serviceHierarchy[cat] ??= {})[svc['bussiness group']] ??= {})[svc['evm service']] ??= [];
    serviceHierarchy[cat][svc['bussiness group']][svc['evm service']].push({
      accountcode: svc.accountcode, accountname: svc.accountname,
    });
  }

  /* Source → accountcode mapping (for target source attribution) */
  const sourceAccountcodes = {
    COD: new Set(['COD_FEE']),
    ECOMMERCE: new Set(['e-Commerce']),
    FUZE: new Set(['Fuze']),
    LOTTO: new Set(['สลาก']),
    DIT: new Set(['DIT']),
  };

  /* Year statistics */
  const latestActualYear = yearStats.length > 0 ? Math.max(...yearStats.map(r => r._id)) : 2026;
  const yearsBE = yearStats.map(r => r._id + 543);
  const yearMonthMap = Object.fromEntries(yearStats.map(r => [r._id + 543, r.maxMonth]));
  const totalTransactions = yearStats.reduce((s, r) => s + r.count, 0);

  _master = {
    offices, services,
    officeByPostcode, serviceByAccount,
    revenueAccounts, expenseAccounts,
    revenueAccountSet, expenseAccountSet,
    postcodesByProvince, serviceHierarchy,
    sourceAccountcodes,
    latestActualYear, yearsBE, yearMonthMap,
    totalRecords: totalTransactions + targetCount,
  };

  dbDiagnostics.status = 'ready';
  console.log(`[DB] ✓ Master loaded in ${Date.now() - t0}ms — ${offices.length} offices, ${services.length} services, latest year ${latestActualYear}`);
  return _master;
}
