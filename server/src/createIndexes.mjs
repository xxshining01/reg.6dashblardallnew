/**
 * Create MongoDB indexes for optimal aggregation performance.
 * Run once: node server/src/createIndexes.mjs
 */
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { resolve } from 'node:path';
import dns from 'node:dns';

dns.setServers(['8.8.8.8', '1.1.1.1']);
dotenv.config({ path: resolve(import.meta.dirname, '../.env') });

const uri = process.env.MONGODB_URI?.replace(/^["']|["']$/g, '').trim();
const dbName = (process.env.MONGODB_DB_NAME || 'reg6_revenue').replace(/^["']|["']$/g, '').trim();

async function run() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    console.log('Creating indexes...\n');

    // transactions_monthly: covers year + month + source_type queries
    await db.collection('transactions_monthly').createIndex(
      { year: 1, month: 1, source_type: 1 },
      { name: 'idx_year_month_source', background: true }
    );
    console.log('✓ transactions_monthly: { year, month, source_type }');

    // targets: covers year + month queries
    await db.collection('targets').createIndex(
      { year: 1, month: 1 },
      { name: 'idx_year_month', background: true }
    );
    console.log('✓ targets: { year, month }');

    // List all indexes
    console.log('\n📋 Current indexes:');
    for (const coll of ['transactions_monthly', 'targets']) {
      const indexes = await db.collection(coll).indexes();
      console.log(`  ${coll}:`);
      for (const idx of indexes) console.log(`    - ${idx.name}: ${JSON.stringify(idx.key)}`);
    }

    console.log('\n✅ Done!');
  } finally {
    await client.close();
  }
}

run();
