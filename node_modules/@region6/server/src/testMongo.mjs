import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { resolve } from 'node:path';

import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

dotenv.config({ path: resolve(import.meta.dirname, '../.env') });

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

async function run() {
  try {
    console.log('Connecting to MongoDB Atlas...');
    await client.connect();
    await client.db('admin').command({ ping: 1 });
    console.log('Successfully connected and pinged MongoDB Atlas Cluster!');
    const dbs = await client.db().admin().listDatabases();
    console.log('Existing databases on Atlas:', dbs.databases.map(d => d.name));
  } catch (err) {
    console.error('Connection failed:', err);
  } finally {
    await client.close();
  }
}

run();
