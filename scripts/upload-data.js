const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

// 1. Load MONGODB_URI from CLI flags, environment, or .env files
function getMongoUri() {
  // Check CLI arguments for --uri
  const uriArgIndex = process.argv.findIndex(arg => arg === '--uri' || arg.startsWith('--uri='));
  if (uriArgIndex !== -1) {
    const val = process.argv[uriArgIndex];
    if (val.includes('=')) {
      return val.split('=')[1].trim();
    } else if (process.argv[uriArgIndex + 1]) {
      return process.argv[uriArgIndex + 1].trim();
    }
  }

  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;

  const projectRoot = path.resolve(__dirname, '..');
  const candidatePaths = [
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), 'atlas-credentials.env'),
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), 'server', '.env'),
    path.join(projectRoot, '.env.local'),
    path.join(projectRoot, 'atlas-credentials.env'),
    path.join(projectRoot, '.env'),
    path.join(projectRoot, 'server', '.env'),
  ];

  for (const envPath of candidatePaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/MONGODB_URI=["']?([^"'\r\n]+)["']?/);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  }
  return null;
}

// Helper to collect all .json files from a path (file or directory)
function collectJsonFiles(targetPath) {
  const resolved = path.resolve(targetPath);
  if (!fs.existsSync(resolved)) {
    console.warn(`⚠️ ไม่พบไฟล์หรือโฟลเดอร์: ${resolved}`);
    return [];
  }

  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    return fs.readdirSync(resolved)
      .filter(f => f.endsWith('.json'))
      .map(f => path.join(resolved, f));
  } else if (stat.isFile() && resolved.endsWith('.json')) {
    return [resolved];
  }
  return [];
}

async function main() {
  const uri = getMongoUri();
  if (!uri) {
    console.error("❌ ไม่พบ MONGODB_URI!");
    console.error("👉 วิธีระบุ URI:");
    console.error("   1. ใส่ในไฟล์ server/.env หรือ atlas-credentials.env: MONGODB_URI=\"mongodb+srv://...\"");
    console.error("   2. ส่งผ่านคำสั่ง: node scripts/upload-data.js --uri=\"mongodb+srv://...\" <path>");
    process.exit(1);
  }

  // Filter out flag arguments
  const rawArgs = process.argv.slice(2).filter(arg => !arg.startsWith('--uri'));

  let filePaths = [];

  if (rawArgs.length > 0) {
    // Collect from specified arguments (files or folders from ANY location)
    for (const arg of rawArgs) {
      const collected = collectJsonFiles(arg);
      filePaths.push(...collected);
    }
  } else {
    // Default: Check database/ folder (relative to project root or cwd)
    const rootDbDir = path.resolve(__dirname, '../database');
    const localDbDir = path.join(process.cwd(), 'database');
    const relDbDir = path.join(process.cwd(), '../database');

    if (fs.existsSync(rootDbDir)) {
      filePaths = collectJsonFiles(rootDbDir);
    } else if (fs.existsSync(localDbDir)) {
      filePaths = collectJsonFiles(localDbDir);
    } else if (fs.existsSync(relDbDir)) {
      filePaths = collectJsonFiles(relDbDir);
    } else {
      filePaths = collectJsonFiles(process.cwd());
    }
  }

  // Deduplicate file paths
  filePaths = Array.from(new Set(filePaths));

  if (filePaths.length === 0) {
    console.log("⚠️ ไม่พบไฟล์ .json ที่ต้องการอัปโหลด");
    console.log("👉 ตัวอย่างการใช้งาน:");
    console.log("   node scripts/upload-data.js \"C:/Users/name/Downloads/รส.201_2026_8_3.json\"");
    console.log("   node scripts/upload-data.js \"D:/MyDataFolder\"");
    return;
  }

  console.log(`🚀 กำลังเตรียมอัปโหลดข้อมูลจำนวน ${filePaths.length} ไฟล์ ขึ้น MongoDB Atlas...`);

  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log("✅ เชื่อมต่อ MongoDB Atlas สำเร็จ!\n");

    const db = client.db('reg6_revenue');
    const col = db.collection('transactions_daily');

    let totalInserted = 0;
    let totalUpdatedFiles = 0;

    for (const filePath of filePaths) {
      const fileName = path.basename(filePath);
      const isPickup = fileName.startsWith('pickup_');
      const isR201 = fileName.startsWith('รส.201_');

      if (!isPickup && !isR201) {
        console.warn(`⚠️ ข้ามไฟล์: ${fileName} (ชื่อไฟล์ต้องขึ้นต้นด้วย รส.201_ หรือ pickup_)`);
        continue;
      }

      const fileIdentifier = fileName.replace('.json', '');
      const parts = fileName.replace('รส.201_', '').replace('pickup_', '').replace('.json', '').split('_');
      const fileYear = parseInt(parts[0], 10);
      const fileMonth = parseInt(parts[1], 10);
      const fileWeek = parseInt(parts[2], 10);

      const content = fs.readFileSync(filePath, 'utf8');
      const rows = JSON.parse(content);
      const docs = [];

      for (const r of rows) {
        const date = r.date;
        if (!date) continue;

        const postcode = String(r.postcode || '').trim();
        const amount = Number(r.actual) || 0;
        if (amount <= 0) continue;

        const dateParts = date.split('-');
        const year = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10);

        docs.push({
          date: date,
          year: year,
          month: month,
          file_year: fileYear,
          file_month: fileMonth,
          file_week: fileWeek,
          file_identifier: fileIdentifier,
          source_type: isPickup ? 'PICKUP' : 'รส.201',
          postcode: postcode,
          office_code: postcode,
          business_group: isPickup ? 'กลุ่มบริการขนส่งและโลจิสติกส์' : (r.bussinessgroup || ''),
          service: isPickup ? 'Pickup' : '',
          amount: amount
        });
      }

      // Replace existing data for this file_identifier to prevent duplicates
      const deleteResult = await col.deleteMany({ file_identifier: fileIdentifier });

      if (docs.length > 0) {
        await col.insertMany(docs, { ordered: false });
        totalInserted += docs.length;
        totalUpdatedFiles++;
        console.log(`📦 [${fileIdentifier}] อัปเดต ${docs.length.toLocaleString()} รายการ (แทนที่ของเดิม ${deleteResult.deletedCount.toLocaleString()} รายการ)`);
      }
    }

    // Ensure Indexes are present
    await Promise.all([
      col.createIndex({ date: 1 }),
      col.createIndex({ year: 1, month: 1 }),
      col.createIndex({ office_code: 1 }),
      col.createIndex({ postcode: 1 }),
      col.createIndex({ source_type: 1 }),
      col.createIndex({ business_group: 1 }),
      col.createIndex({ file_identifier: 1 })
    ]);

    // Clear API cache if present
    const cacheFile = path.join(process.cwd(), '.dashboard-cache.json');
    if (fs.existsSync(cacheFile)) {
      fs.unlinkSync(cacheFile);
      console.log("\n🧹 ล้างไฟล์แคช .dashboard-cache.json เรียบร้อย");
    }

    // Summary
    const totalCount = await col.countDocuments();
    console.log(`\n🎉 อัปโหลดสำเร็จทั้งหมด ${totalUpdatedFiles} ไฟล์ (${totalInserted.toLocaleString()} records)`);
    console.log(`📊 จำนวนข้อมูลทั้งหมดใน MongoDB (transactions_daily): ${totalCount.toLocaleString()} รายการ`);

  } catch (err) {
    console.error("❌ เกิดข้อผิดพลาดในการอัปโหลด:", err);
  } finally {
    await client.close();
  }
}

main();
