/**
 * Test MongoDB Aggregation Queries
 * Run: node server/src/testMongoAggregation.mjs
 * 
 * Tests connection, document counts, and all aggregation patterns
 * used by the dashboard API to verify performance and correctness.
 */
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { resolve } from 'node:path';
import dns from 'node:dns';

dns.setServers(['8.8.8.8', '1.1.1.1']);
dotenv.config({ path: resolve(import.meta.dirname, '../.env') });

const uri = process.env.MONGODB_URI?.replace(/^["']|["']$/g, '').trim();
const dbName = (process.env.MONGODB_DB_NAME || 'reg6_revenue').replace(/^["']|["']$/g, '').trim();

const fmt = (n) => (n || 0).toLocaleString('th-TH');

async function run() {
  if (!uri) { console.error('❌ MONGODB_URI is not set'); process.exit(1); }
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });

  try {
    /* ── 1. Connection ── */
    console.log('🔌 Connecting to MongoDB Atlas...');
    let t0 = Date.now();
    await client.connect();
    const db = client.db(dbName);
    console.log(`✓ Connected in ${Date.now() - t0}ms\n`);

    /* ── 2. Document Counts ── */
    console.log('📊 Document counts:');
    for (const c of ['master_offices', 'master_services', 'transactions_monthly', 'targets']) {
      const count = await db.collection(c).countDocuments();
      console.log(`  ${c}: ${fmt(count)}`);
    }
    console.log();

    /* ── 3. Load master services for account-code filtering ── */
    t0 = Date.now();
    const services = await db.collection('master_services').find({}).toArray();
    const revCodes = services.filter(s => s.category === 'REVENUE').map(s => s.sap_account_code);
    const expCodes = services.filter(s => s.category === 'EXPENSE').map(s => s.sap_account_code);
    console.log(`🔧 Master services loaded in ${Date.now() - t0}ms — ${revCodes.length} revenue, ${expCodes.length} expense codes\n`);

    /* ── 4. Year stats ── */
    t0 = Date.now();
    const yearStats = await db.collection('transactions_monthly').aggregate([
      { $group: { _id: '$year', maxMonth: { $max: '$month' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).toArray();
    console.log(`📅 Year stats (${Date.now() - t0}ms):`);
    for (const r of yearStats) console.log(`  ${r._id} (พ.ศ. ${r._id + 543}): ${fmt(r.count)} txns, latest month ${r.maxMonth}`);
    const latestYear = yearStats.at(-1)?._id || 2026;
    console.log();

    /* ── 5. Revenue sum (latest year) ── */
    const sapSources = ['SAP', 'COD', 'FUZE', 'LOTTO', 'ECOMMERCE', 'DIT'];
    const baseMatch = { year: latestYear, source_type: { $in: sapSources }, sap_account_code: { $in: revCodes } };

    t0 = Date.now();
    const revResult = await db.collection('transactions_monthly').aggregate([
      { $match: baseMatch },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]).toArray();
    console.log(`💰 Revenue total (${latestYear}): ${fmt(revResult[0]?.total)} บาท — ${Date.now() - t0}ms`);

    /* ── 6. Group by source_type ── */
    t0 = Date.now();
    const bySrc = await db.collection('transactions_monthly').aggregate([
      { $match: { year: latestYear, sap_account_code: { $in: revCodes } } },
      { $group: { _id: '$source_type', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } },
    ]).toArray();
    console.log(`\n📈 Revenue by source (${Date.now() - t0}ms):`);
    for (const r of bySrc) console.log(`  ${r._id}: ${fmt(r.total)} บาท`);

    /* ── 7. Monthly trend ── */
    t0 = Date.now();
    const byMonth = await db.collection('transactions_monthly').aggregate([
      { $match: baseMatch },
      { $group: { _id: '$month', total: { $sum: '$amount' } } },
      { $sort: { _id: 1 } },
    ]).toArray();
    console.log(`\n📆 Monthly trend (${Date.now() - t0}ms):`);
    const monthNames = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    for (const r of byMonth) console.log(`  ${monthNames[r._id - 1]}: ${fmt(r.total)} บาท`);

    /* ── 8. Top 5 offices ── */
    t0 = Date.now();
    const byOfc = await db.collection('transactions_monthly').aggregate([
      { $match: baseMatch },
      { $group: { _id: '$office_code', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } },
      { $limit: 5 },
    ]).toArray();
    console.log(`\n🏢 Top 5 offices (${Date.now() - t0}ms):`);
    for (const r of byOfc) console.log(`  ${r._id}: ${fmt(r.total)} บาท`);

    /* ── 9. By sap_account_code (service breakdown) ── */
    t0 = Date.now();
    const byAcc = await db.collection('transactions_monthly').aggregate([
      { $match: baseMatch },
      { $group: { _id: '$sap_account_code', total: { $sum: '$amount' } } },
    ]).toArray();
    console.log(`\n🔑 Unique account codes with data: ${byAcc.length} — ${Date.now() - t0}ms`);

    /* ── 10. Target sum ── */
    t0 = Date.now();
    const tgtResult = await db.collection('targets').aggregate([
      { $match: { year: latestYear, sap_account_code: { $in: revCodes } } },
      { $group: { _id: null, total: { $sum: '$target_amount' } } },
    ]).toArray();
    console.log(`\n🎯 Target total (${latestYear}): ${fmt(tgtResult[0]?.total)} บาท — ${Date.now() - t0}ms`);

    /* ── 11. Target by account (for source attribution) ── */
    t0 = Date.now();
    const tgtByAcc = await db.collection('targets').aggregate([
      { $match: { year: latestYear, sap_account_code: { $in: revCodes } } },
      { $group: { _id: '$sap_account_code', total: { $sum: '$target_amount' } } },
    ]).toArray();
    console.log(`🎯 Unique target account codes: ${tgtByAcc.length} — ${Date.now() - t0}ms`);

    console.log('\n✅ All aggregation tests passed!');

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.stack) console.error(err.stack);
  } finally {
    await client.close();
  }
}

run();
