import cors from 'cors';
import express from 'express';
import { getDb, getMasterData, dbDiagnostics } from './db.mjs';

const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const ratio = (n, d) => d ? n / d * 100 : null;
const asNumber = (v, fb) => Number.isFinite(Number(v)) ? Number(v) : fb;

const ALL_SAP_SOURCES = new Set(['SAP', 'COD', 'FUZE', 'LOTTO', 'ECOMMERCE', 'DIT']);
const SAP_SOURCES_LIST = ['SAP', 'COD', 'FUZE', 'LOTTO', 'ECOMMERCE', 'DIT'];
const SAP_SOURCE_LABELS = { SAP: 'SAP', COD: 'COD', FUZE: 'FUZE', LOTTO: 'LOTTO', ECOMMERCE: 'e-Commerce', DIT: 'DIT' };

/* ══════════════════════════════════════════════════════════
   Filter Parsing
   ══════════════════════════════════════════════════════════ */

function parseFilters(query, latestActualYear) {
  const monthFrom = query.monthFrom ? asNumber(query.monthFrom) : null;
  const monthTo = query.monthTo ? asNumber(query.monthTo) : null;
  const mode = query.mode === 'BI' ? 'BI' : 'SAP';

  let enabledSources = ALL_SAP_SOURCES;
  if (mode === 'SAP' && query.sources) {
    enabledSources = new Set(query.sources.split(',').filter(s => ALL_SAP_SOURCES.has(s)));
    if (enabledSources.size === 0) enabledSources = ALL_SAP_SOURCES;
  }

  return {
    year: asNumber(query.yearBE, (latestActualYear || 2026) + 543) - 543,
    monthFrom, monthTo,
    province: query.province || null,
    postcode: query.postcode || null,
    mode,
    category: query.category === 'EXPENSE' ? 'EXPENSE' : 'REVENUE',
    enabledSources,
    filterGroup: query.filterGroup || null,
    filterEvm: query.filterEvm || null,
    filterAccount: query.filterAccount || null,
  };
}

/* ══════════════════════════════════════════════════════════
   MongoDB Match Builders
   ══════════════════════════════════════════════════════════ */

/** Year + month-range + location */
function buildBaseMatch(year, f, master) {
  const m = { year };
  if (f.monthFrom || f.monthTo) {
    const from = f.monthFrom || 1;
    const to = f.monthTo || 12;
    m.month = from === to ? from : { $gte: from, $lte: to };
  }
  if (f.postcode) m.office_code = f.postcode;
  else if (f.province) m.office_code = { $in: master.postcodesByProvince[f.province] || [] };
  return m;
}

/** Account-codes for a category based on mode */
function getCategoryCodes(master, category, mode) {
  if (mode === 'BI') {
    if (category === 'REVENUE') return ['รายได้', 'REVENUE'];
    if (category === 'EXPENSE') return ['ค่าใช้จ่าย', 'EXPENSE'];
    return ['รายได้', 'ค่าใช้จ่าย', 'REVENUE', 'EXPENSE'];
  }
  if (category === 'REVENUE') return master.revenueAccounts;
  if (category === 'EXPENSE') return master.expenseAccounts;
  return null; // null = no category filter
}

/** Apply sidebar service-filter to code list */
function applyServiceFilter(codes, f, master) {
  if (!f.filterGroup && !f.filterEvm && !f.filterAccount) return codes;
  let filtered;
  if (f.filterAccount) {
    filtered = [f.filterAccount];
  } else if (f.filterEvm) {
    filtered = master.services
      .filter(s => s['evm service'] === f.filterEvm && s['bussiness group'] === f.filterGroup)
      .map(s => s.accountcode);
  } else {
    filtered = master.services
      .filter(s => s['bussiness group'] === f.filterGroup)
      .map(s => s.accountcode);
  }
  if (!codes) return filtered;
  const set = new Set(codes);
  return filtered.filter(c => set.has(c));
}

/** Map accountcode → source (SAP / COD / FUZE / …) */
function codeToSource(code, master) {
  for (const [src, set] of Object.entries(master.sourceAccountcodes)) {
    if (set.has(code)) return src;
  }
  return 'SAP';
}

/** Keep only codes whose source is in enabledSources */
function filterByEnabledSources(codes, enabledSources, master) {
  if (enabledSources.size >= ALL_SAP_SOURCES.size) return codes;
  const all = codes || master.services.map(s => s.accountcode);
  return all.filter(c => enabledSources.has(codeToSource(c, master)));
}

/** Full match for transactions_monthly */
function buildActualMatch(year, f, master, category) {
  const m = buildBaseMatch(year, f, master);
  // Source filter — always exclude BI in SAP mode and vice-versa
  m.source_type = f.mode === 'BI' ? 'BI' : { $in: [...f.enabledSources] };
  // Account-code filter (category + sidebar service filter)
  let codes = getCategoryCodes(master, category, f.mode);
  if (f.mode === 'SAP') codes = applyServiceFilter(codes, f, master);
  if (codes) m.sap_account_code = { $in: codes };
  return m;
}

/** Full match for targets (no source_type field — filter via accountcodes) */
function buildTargetMatch(year, f, master, category) {
  const m = buildBaseMatch(year, f, master);
  let codes = getCategoryCodes(master, category, 'SAP');
  if (f.mode === 'SAP') {
    codes = applyServiceFilter(codes, f, master);
    codes = filterByEnabledSources(codes, f.enabledSources, master);
  }
  if (codes) m.sap_account_code = { $in: codes };
  return m;
}

/** Intersect an existing sap_account_code filter with extra codes */
function intersectCodes(match, extraCodes) {
  if (!extraCodes) return;
  if (match.sap_account_code?.$in) {
    const s = new Set(match.sap_account_code.$in);
    match.sap_account_code = { $in: extraCodes.filter(c => s.has(c)) };
  } else if (!match.sap_account_code) {
    match.sap_account_code = { $in: extraCodes };
  }
}

/** Intersect an existing office_code filter with province codes */
function intersectLocation(match, provinceCodes) {
  if (match.office_code?.$in) {
    const s = new Set(match.office_code.$in);
    match.office_code = { $in: provinceCodes.filter(c => s.has(c)) };
  } else if (typeof match.office_code === 'string') {
    match.office_code = provinceCodes.includes(match.office_code) ? match.office_code : { $in: [] };
  } else {
    match.office_code = { $in: provinceCodes };
  }
}

/* ══════════════════════════════════════════════════════════
   Aggregation Helpers
   ══════════════════════════════════════════════════════════ */

async function aggSum(db, coll, match, field) {
  const r = await db.collection(coll).aggregate([
    { $match: match },
    { $group: { _id: null, t: { $sum: `$${field}` } } },
  ]).toArray();
  return r[0]?.t || 0;
}

async function aggGroup(db, coll, match, groupField, sumField) {
  return db.collection(coll).aggregate([
    { $match: match },
    { $group: { _id: `$${groupField}`, total: { $sum: `$${sumField}` } } },
  ]).toArray();
}

/* ══════════════════════════════════════════════════════════
   SAP Breakdown (service drill-down: group → evm → account)
   ══════════════════════════════════════════════════════════ */

async function sapBreakdown(db, f, master, drillLevel, groupFilter, evmFilter) {
  /* Compute extra drill-codes */
  let drillCodes = null;
  if (drillLevel === 'account' && groupFilter && evmFilter) {
    drillCodes = master.services
      .filter(s => s['bussiness group'] === groupFilter && s['evm service'] === evmFilter)
      .map(s => s.accountcode);
  } else if (drillLevel === 'evm' && groupFilter) {
    drillCodes = master.services
      .filter(s => s['bussiness group'] === groupFilter)
      .map(s => s.accountcode);
  }

  /* Build matches */
  const aMatch = buildActualMatch(f.year, f, master, f.category);
  const lyMatch = buildActualMatch(f.year - 1, f, master, f.category);
  const tMatch = buildTargetMatch(f.year, f, master, f.category);

  if (drillCodes) {
    intersectCodes(aMatch, drillCodes);
    intersectCodes(lyMatch, drillCodes);
    intersectCodes(tMatch, drillCodes);
  }

  /* Aggregate by sap_account_code → small result set (~1200 max) */
  const [aByAcc, lyByAcc, tByAcc] = await Promise.all([
    aggGroup(db, 'transactions_monthly', aMatch, 'sap_account_code', 'amount'),
    aggGroup(db, 'transactions_monthly', lyMatch, 'sap_account_code', 'amount'),
    aggGroup(db, 'targets', tMatch, 'sap_account_code', 'target_amount'),
  ]);

  const am = new Map(aByAcc.map(r => [r._id, r.total]));
  const lm = new Map(lyByAcc.map(r => [r._id, r.total]));
  const tm = new Map(tByAcc.map(r => [r._id, r.total]));

  /* ── Account-level: one row per account ── */
  if (drillLevel === 'account') {
    return [...am].map(([code, actual]) => {
      const svc = master.serviceByAccount.get(code);
      const target = tm.get(code) || 0;
      const ly = lm.get(code) || 0;
      return {
        name: `${code} — ${svc?.accountname || 'ไม่ทราบชื่อ'}`,
        actual, target,
        achievementPct: ratio(actual, target),
        lastYearAmount: ly,
        yoyGrowthPct: ratio(actual, ly),
      };
    }).sort((a, b) => b.actual - a.actual);
  }

  /* ── Group or EVM level: aggregate accounts into groups ── */
  const keyFn = drillLevel === 'evm'
    ? (code) => {
        const svc = master.serviceByAccount.get(code);
        return (svc && svc['bussiness group'] === groupFilter) ? svc['evm service'] : null;
      }
    : (code) => {
        const svc = master.serviceByAccount.get(code);
        return svc?.['bussiness group'] || 'ไม่พบใน Master Service';
      };

  const groups = new Map();
  const tGroups = new Map();
  const lyGroups = new Map();

  for (const [code, val] of am) {
    const key = keyFn(code);
    if (key === null) continue;
    groups.set(key, (groups.get(key) || 0) + val);
  }
  for (const [code, val] of tm) {
    const key = keyFn(code);
    if (key === null) continue;
    tGroups.set(key, (tGroups.get(key) || 0) + val);
  }
  for (const [code, val] of lm) {
    const key = keyFn(code);
    if (key === null) continue;
    lyGroups.set(key, (lyGroups.get(key) || 0) + val);
  }

  return [...groups].map(([name, actual]) => {
    const target = tGroups.get(name) || 0;
    const ly = lyGroups.get(name) || 0;
    return {
      name, actual, target,
      achievementPct: ratio(actual, target),
      lastYearAmount: ly,
      yoyGrowthPct: ratio(actual, ly),
    };
  }).sort((a, b) => b.actual - a.actual);
}

/* ══════════════════════════════════════════════════════════
   Area Breakdown (province → postcode)
   ══════════════════════════════════════════════════════════ */

async function areaBreakdown(db, f, master, drillLevel, provinceFilter) {
  const aMatch = buildActualMatch(f.year, f, master, f.category);
  const lyMatch = buildActualMatch(f.year - 1, f, master, f.category);
  const tMatch = buildTargetMatch(f.year, f, master, f.category);

  if (drillLevel === 'postcode' && provinceFilter) {
    const pCodes = master.postcodesByProvince[provinceFilter] || [];
    intersectLocation(aMatch, pCodes);
    intersectLocation(lyMatch, pCodes);
    intersectLocation(tMatch, pCodes);
  }

  /* Aggregate by office_code → ~200 rows max */
  const [aByOfc, lyByOfc, tByOfc] = await Promise.all([
    aggGroup(db, 'transactions_monthly', aMatch, 'office_code', 'amount'),
    aggGroup(db, 'transactions_monthly', lyMatch, 'office_code', 'amount'),
    aggGroup(db, 'targets', tMatch, 'office_code', 'target_amount'),
  ]);

  const amMap = new Map(aByOfc.map(r => [r._id, r.total]));
  const lyMap = new Map(lyByOfc.map(r => [r._id, r.total]));
  const tmMap = new Map(tByOfc.map(r => [r._id, r.total]));

  /* ── Postcode level ── */
  if (drillLevel === 'postcode') {
    return [...amMap].map(([pc, actual]) => {
      const office = master.officeByPostcode.get(pc);
      const name = office ? `${pc} ${office.postname}` : (pc || 'ไม่ระบุที่ทำการ');
      const target = tmMap.get(pc) || 0;
      const ly = lyMap.get(pc) || 0;
      return { name, actual, target, achievementPct: ratio(actual, target), lastYearAmount: ly, yoyGrowthPct: ratio(actual, ly) };
    }).sort((a, b) => b.actual - a.actual);
  }

  /* ── Province level (group postcodes into provinces) ── */
  const groups = new Map();
  const tGroups = new Map();
  const lyGroups = new Map();

  for (const r of aByOfc) {
    const office = master.officeByPostcode.get(r._id);
    const name = office?.province || (r._id ? `ไม่ทราบจังหวัด (${r._id})` : 'ไม่ระบุที่ทำการ');
    groups.set(name, (groups.get(name) || 0) + r.total);
  }
  for (const r of tByOfc) {
    const office = master.officeByPostcode.get(r._id);
    const name = office?.province || (r._id ? `ไม่ทราบจังหวัด (${r._id})` : 'ไม่ระบุที่ทำการ');
    tGroups.set(name, (tGroups.get(name) || 0) + r.total);
  }
  for (const r of lyByOfc) {
    const office = master.officeByPostcode.get(r._id);
    const name = office?.province || (r._id ? `ไม่ทราบจังหวัด (${r._id})` : 'ไม่ระบุที่ทำการ');
    lyGroups.set(name, (lyGroups.get(name) || 0) + r.total);
  }

  return [...groups].map(([name, actual]) => {
    const target = tGroups.get(name) || 0;
    const ly = lyGroups.get(name) || 0;
    return { name, actual, target, achievementPct: ratio(actual, target), lastYearAmount: ly, yoyGrowthPct: ratio(actual, ly) };
  }).sort((a, b) => b.actual - a.actual);
}

/* ══════════════════════════════════════════════════════════
   Source Summary (per-source actual/target/lastYear)
   ══════════════════════════════════════════════════════════ */

async function calcSourceSummary(db, f, master) {
  /* Actuals: aggregate ALL SAP sources in one query, group by source_type */
  const base = buildBaseMatch(f.year, f, master);
  base.source_type = { $in: [...ALL_SAP_SOURCES] };
  let codes = getCategoryCodes(master, f.category);
  if (f.mode === 'SAP') codes = applyServiceFilter(codes, f, master);
  if (codes) base.sap_account_code = { $in: codes };

  const lyBase = { ...base, year: f.year - 1 };

  /* Targets: group by accountcode (no source_type field) */
  const tBase = buildBaseMatch(f.year, f, master);
  let tCodes = getCategoryCodes(master, f.category);
  if (f.mode === 'SAP') tCodes = applyServiceFilter(tCodes, f, master);
  if (tCodes) tBase.sap_account_code = { $in: tCodes };

  const [curBySrc, lyBySrc, tByAcc] = await Promise.all([
    aggGroup(db, 'transactions_monthly', base, 'source_type', 'amount'),
    aggGroup(db, 'transactions_monthly', lyBase, 'source_type', 'amount'),
    aggGroup(db, 'targets', tBase, 'sap_account_code', 'target_amount'),
  ]);

  /* Map target accountcodes → sources */
  const tBySrc = {};
  for (const r of tByAcc) {
    const src = codeToSource(r._id, master);
    tBySrc[src] = (tBySrc[src] || 0) + r.total;
  }

  const curMap = Object.fromEntries(curBySrc.map(r => [r._id, r.total]));
  const lyMap = Object.fromEntries(lyBySrc.map(r => [r._id, r.total]));

  return SAP_SOURCES_LIST.map(src => {
    const actual = curMap[src] || 0;
    const ly = lyMap[src] || 0;
    const target = tBySrc[src] || 0;
    return {
      source: src,
      label: SAP_SOURCE_LABELS[src],
      enabled: f.enabledSources.has(src),
      actual, target,
      achievementPct: ratio(actual, target),
      lastYearAmount: ly,
      yoyGrowthPct: ratio(actual, ly),
    };
  });
}

/* ══════════════════════════════════════════════════════════
   Express API
   ══════════════════════════════════════════════════════════ */

const app = express();
app.use(cors());
app.use(express.json());
const api = express.Router();

/* ── Health ─────────────────────────────────────────────── */
api.get(['/health', '/status'], async (req, res) => {
  let master = null;
  let loadError = null;
  try {
    master = await getMasterData();
  } catch (e) {
    loadError = {
      message: e.message,
      name: e.name,
      code: e.code,
    };
  }
  res.json({
    status: master ? 'ok' : 'degraded',
    hasMongoUri: !!process.env.MONGODB_URI,
    mongoDbName: process.env.MONGODB_DB_NAME || 'reg6_revenue',
    diagnostics: dbDiagnostics,
    isLoaded: !!master,
    error: loadError || dbDiagnostics.error,
    source: 'MongoDB Atlas',
    counts: master
      ? { offices: master.offices.length, services: master.services.length, totalRecords: master.totalRecords }
      : 'Loading/Failed (Check error property for details)',
  });
});

/* ── Middleware: ensure master data is loaded ── */
api.use(async (req, res, next) => {
  try {
    await getMasterData();
    next();
  } catch (err) {
    console.error('[API Error]', err.message);
    res.status(500).json({ success: false, error: err.message, diagnostics: dbDiagnostics });
  }
});

/* ── Meta / Filters ────────────────────────────────────── */
api.get('/meta/filters', async (req, res) => {
  const master = await getMasterData();

  const postcodesByProvinceForClient = {};
  for (const office of master.offices) {
    const prov = office.province || 'อื่นๆ';
    (postcodesByProvinceForClient[prov] ??= []).push({ postcode: office.postcode, postname: office.postname });
  }

  res.json({
    success: true,
    data: {
      modes: ['BI', 'SAP'],
      yearsBE: master.yearsBE,
      latestMonthByYearBE: master.yearMonthMap,
      provinces: [...new Set(master.offices.map(o => o.province).filter(Boolean))].sort(),
      postcodesByProvince: postcodesByProvinceForClient,
      sapSources: SAP_SOURCES_LIST,
      sapSourceLabels: SAP_SOURCE_LABELS,
      serviceHierarchy: master.serviceHierarchy,
      recordsLoaded: master.totalRecords,
      source: 'MongoDB Atlas',
    },
  });
});

/* ── Dashboard / Summary ───────────────────────────────── */
api.get('/dashboard/summary', async (req, res) => {
  const db = await getDb();
  const master = await getMasterData();
  const f = parseFilters(req.query, master.latestActualYear);

  const [revenue, expense, revenueTarget, expenseTarget] = await Promise.all([
    aggSum(db, 'transactions_monthly', buildActualMatch(f.year, f, master, 'REVENUE'), 'amount'),
    aggSum(db, 'transactions_monthly', buildActualMatch(f.year, f, master, 'EXPENSE'), 'amount'),
    aggSum(db, 'targets', buildTargetMatch(f.year, f, master, 'REVENUE'), 'target_amount'),
    aggSum(db, 'targets', buildTargetMatch(f.year, f, master, 'EXPENSE'), 'target_amount'),
  ]);

  res.json({
    success: true,
    data: {
      totalRevenue: revenue,
      totalExpense: expense,
      netProfit: revenue - expense,
      revenueTargetAmount: revenueTarget,
      expenseTargetAmount: expenseTarget,
      revenueAchievementPct: ratio(revenue, revenueTarget),
      expenseAchievementPct: ratio(expense, expenseTarget),
    },
  });
});

/* ── Dashboard / Detail ────────────────────────────────── */
api.get('/dashboard/detail', async (req, res) => {
  const db = await getDb();
  const master = await getMasterData();
  const f = parseFilters(req.query, master.latestActualYear);

  /* Overall totals (not drill-filtered) */
  const [actual, lastYear, target] = await Promise.all([
    aggSum(db, 'transactions_monthly', buildActualMatch(f.year, f, master, f.category), 'amount'),
    aggSum(db, 'transactions_monthly', buildActualMatch(f.year - 1, f, master, f.category), 'amount'),
    aggSum(db, 'targets', buildTargetMatch(f.year, f, master, f.category), 'target_amount'),
  ]);

  /* Source summary (SAP mode only) */
  const sourceSummary = f.mode === 'SAP' ? await calcSourceSummary(db, f, master) : null;

  const dimension = req.query.dimension || (f.mode === 'BI' ? 'area' : 'service');

  if (f.mode === 'BI' || dimension === 'area') {
    const drillLevel = req.query.drillLevel || 'province';
    const provinceFilter = req.query.drillProvince || null;
    const breakdown = await areaBreakdown(db, f, master, drillLevel, provinceFilter);
    return res.json({
      success: true,
      filtersApplied: { ...f, enabledSources: [...f.enabledSources] },
      data: {
        actual,
        targetAmount: target,
        targetAchievementPct: ratio(actual, target),
        lastYearAmount: lastYear,
        yoyGrowthPct: ratio(actual, lastYear),
        dimension: 'area',
        drillLevel,
        breakdown,
        sourceSummary,
      },
    });
  }

  const drillLevel = req.query.drillLevel || 'group';
  const groupFilter = req.query.drillGroup || null;
  const evmFilter = req.query.drillEvm || null;
  const breakdown = await sapBreakdown(db, f, master, drillLevel, groupFilter, evmFilter);
  res.json({
    success: true,
    filtersApplied: { ...f, enabledSources: [...f.enabledSources] },
    data: {
      actual,
      targetAmount: target,
      targetAchievementPct: ratio(actual, target),
      lastYearAmount: lastYear,
      yoyGrowthPct: ratio(actual, lastYear),
      dimension: 'service',
      drillLevel,
      breakdown,
      sourceSummary,
    },
  });
});

/* ── Dashboard / Trend ─────────────────────────────────── */
api.get('/dashboard/trend', async (req, res) => {
  const db = await getDb();
  const master = await getMasterData();
  const f = parseFilters(req.query, master.latestActualYear);
  const from = f.monthFrom || 1;
  const to = f.monthTo || 12;

  /* 3 aggregations grouped by month (instead of 12×3 = 36 queries) */
  const [curByMonth, lyByMonth, tByMonth] = await Promise.all([
    aggGroup(db, 'transactions_monthly', buildActualMatch(f.year, f, master, f.category), 'month', 'amount'),
    aggGroup(db, 'transactions_monthly', buildActualMatch(f.year - 1, f, master, f.category), 'month', 'amount'),
    aggGroup(db, 'targets', buildTargetMatch(f.year, f, master, f.category), 'month', 'target_amount'),
  ]);

  const curMap = Object.fromEntries(curByMonth.map(r => [r._id, r.total]));
  const lyMap = Object.fromEntries(lyByMonth.map(r => [r._id, r.total]));
  const tMap = Object.fromEntries(tByMonth.map(r => [r._id, r.total]));

  const data = Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => {
    const month = from + i;
    return {
      month,
      monthName: monthNames[month - 1],
      currentAmount: curMap[month] || 0,
      lastYearAmount: lyMap[month] || 0,
      targetAmount: tMap[month] || 0,
    };
  });
  res.json({ success: true, data });
});

/* ── Dashboard / Watchlist ─────────────────────────────── */
api.get('/dashboard/watchlist', async (req, res) => {
  const db = await getDb();
  const master = await getMasterData();
  const f = parseFilters(req.query, master.latestActualYear);

  const [aByOfc, lyByOfc, tByOfc] = await Promise.all([
    aggGroup(db, 'transactions_monthly', buildActualMatch(f.year, f, master, f.category), 'office_code', 'amount'),
    aggGroup(db, 'transactions_monthly', buildActualMatch(f.year - 1, f, master, f.category), 'office_code', 'amount'),
    aggGroup(db, 'targets', buildTargetMatch(f.year, f, master, f.category), 'office_code', 'target_amount'),
  ]);

  const amMap = Object.fromEntries(aByOfc.map(r => [r._id, r.total]));
  const lyMap = Object.fromEntries(lyByOfc.map(r => [r._id, r.total]));
  const tmMap = Object.fromEntries(tByOfc.map(r => [r._id, r.total]));

  const targetOffices = f.province ? master.offices.filter(o => o.province === f.province) : master.offices;

  const list = targetOffices.map(office => {
    const pc = String(office.postcode);
    const actual = amMap[pc] || 0;
    const target = tmMap[pc] || 0;
    const lastYear = lyMap[pc] || 0;
    return {
      postcode: office.postcode,
      postname: office.postname,
      province: office.province,
      actual, target,
      targetAchievementPct: ratio(actual, target),
      lastYearAmount: lastYear,
      yoyGrowthPct: ratio(actual, lastYear),
    };
  });
  res.json({ success: true, data: list });
});

/* ── Mount under all path variants ─────────────────────── */
app.use('/api/v1', api);
app.use('/v1', api);
app.use('/api', api);
app.use('/', api);

export default app;

if (!process.env.VERCEL) {
  const port = process.env.PORT || 5000;
  app.listen(port, () => console.log(`API ready on port ${port} (MongoDB Atlas — On-Demand Aggregation)`));
}
