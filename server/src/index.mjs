import cors from 'cors';
import express from 'express';
import { loadData, dbDiagnostics } from './db.mjs';

const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const categoryByThai = { 'รายได้': 'REVENUE', 'ค่าใช้จ่าย': 'EXPENSE' };
const total = (rows, field = 'amount') => rows.reduce((sum, row) => sum + (Number(row[field]) || 0), 0);
const ratio = (numerator, denominator) => denominator ? numerator / denominator * 100 : null;
const asNumber = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

/* ── Load data (MongoDB Atlas / Fallback) ───────────────────────── */
const { offices, services, actuals, targets, source } = await loadData();
console.log(`[Server] Ready! Active Data Source: ${source}`);

const officeByPostcode = new Map(offices.map((row) => [String(row.postcode), row]));
const serviceByAccount = new Map(services.map((row) => [String(row.accountcode), row]));
const allSapSources = new Set(['SAP', 'COD', 'FUZE', 'LOTTO', 'ECOMMERCE', 'DIT']);

// Map source → accountcodes for target filtering
const sourceAccountcodes = {
  COD: new Set(['COD_FEE']),
  ECOMMERCE: new Set(['e-Commerce']),
  FUZE: new Set(['Fuze']),
  LOTTO: new Set(['สลาก']),
  DIT: new Set(['DIT']),
};
// SAP = everything NOT in the above sets
const nonSapAccountcodes = new Set([...Object.values(sourceAccountcodes)].flatMap((s) => [...s]));

function accountcodeMatchesSources(accountcode, enabledSources) {
  // Check if an accountcode should be included given the enabled sources
  for (const [src, codes] of Object.entries(sourceAccountcodes)) {
    if (codes.has(accountcode)) return enabledSources.has(src);
  }
  // Not in any special source → belongs to SAP
  return enabledSources.has('SAP');
}

const latestActualYear = actuals.reduce((latest, row) => Math.max(latest, row.year), 0);

// Build service hierarchy for meta endpoint
const serviceHierarchy = {};
for (const svc of services) {
  const cat = categoryByThai[svc.category];
  if (!cat) continue;
  if (!serviceHierarchy[cat]) serviceHierarchy[cat] = {};
  const bg = svc['bussiness group'];
  if (!serviceHierarchy[cat][bg]) serviceHierarchy[cat][bg] = {};
  const evm = svc['evm service'];
  if (!serviceHierarchy[cat][bg][evm]) serviceHierarchy[cat][bg][evm] = [];
  serviceHierarchy[cat][bg][evm].push({ accountcode: svc.accountcode, accountname: svc.accountname });
}

/* ── Helpers ───────────────────────────────────────────────────── */
function filters(query) {
  const monthFrom = query.monthFrom ? asNumber(query.monthFrom) : null;
  const monthTo = query.monthTo ? asNumber(query.monthTo) : null;
  const mode = query.mode === 'BI' ? 'BI' : 'SAP';

  // SAP source checkboxes
  let enabledSources = allSapSources;
  if (mode === 'SAP' && query.sources) {
    enabledSources = new Set(query.sources.split(',').filter((s) => allSapSources.has(s)));
    if (enabledSources.size === 0) enabledSources = allSapSources;
  }

  return {
    year: asNumber(query.yearBE, latestActualYear + 543) - 543,
    monthFrom, monthTo,
    province: query.province || null,
    postcode: query.postcode || null,
    mode,
    category: query.category === 'EXPENSE' ? 'EXPENSE' : 'REVENUE',
    enabledSources,
    // SAP service filters (separate from drill-down)
    filterGroup: query.filterGroup || null,
    filterEvm: query.filterEvm || null,
    filterAccount: query.filterAccount || null,
  };
}

function matchMonth(row, f) {
  if (!f.monthFrom && !f.monthTo) return true;
  const from = f.monthFrom || 1;
  const to = f.monthTo || 12;
  return row.month >= from && row.month <= to;
}

function matchBase(row, f) {
  if (row.year !== f.year) return false;
  if (!matchMonth(row, f)) return false;
  if (f.postcode) return row.postcode === f.postcode;
  if (f.province) {
    const office = officeByPostcode.get(row.postcode);
    if (!office || office.province !== f.province) return false;
  }
  return true;
}

function matchServiceFilter(accountcode, f) {
  if (!f.filterGroup && !f.filterEvm && !f.filterAccount) return true;
  if (f.filterAccount) return accountcode === f.filterAccount;
  const svc = serviceByAccount.get(accountcode);
  if (!svc) return false;
  if (f.filterEvm) return svc['evm service'] === f.filterEvm && svc['bussiness group'] === f.filterGroup;
  if (f.filterGroup) return svc['bussiness group'] === f.filterGroup;
  return true;
}

function matchActual(row, f, category = f.category) {
  // Source check
  if (f.mode === 'BI') {
    if (row.source !== 'BI') return false;
  } else {
    if (!f.enabledSources.has(row.source)) return false;
  }
  if (!matchBase(row, f)) return false;
  if (category && row.category !== category) return false;
  // SAP service filter
  if (f.mode === 'SAP' && !matchServiceFilter(row.accountcode, f)) return false;
  return true;
}

function matchTarget(row, f, category) {
  if (!matchBase(row, f)) return false;
  const svc = serviceByAccount.get(row.accountcode);
  const cat = categoryByThai[svc?.category];
  if (cat !== category) return false;
  // SAP mode: filter targets by enabled sources
  if (f.mode === 'SAP' && !accountcodeMatchesSources(row.accountcode, f.enabledSources)) return false;
  // SAP service filter applies to targets too
  if (f.mode === 'SAP' && !matchServiceFilter(row.accountcode, f)) return false;
  return true;
}

/* ── SAP mode: drill-down breakdown ────────────────────────────── */
function sapBreakdown(rows, targetRows, lyRows, drillLevel, groupFilter, evmFilter) {
  if (drillLevel === 'account') {
    const groups = new Map();
    for (const row of rows) {
      const svc = serviceByAccount.get(row.accountcode);
      if (!svc || svc['bussiness group'] !== groupFilter || svc['evm service'] !== evmFilter) continue;
      groups.set(row.accountcode, (groups.get(row.accountcode) || 0) + row.amount);
    }
    const tGroups = new Map();
    for (const row of targetRows) {
      const svc = serviceByAccount.get(row.accountcode);
      if (!svc || svc['bussiness group'] !== groupFilter || svc['evm service'] !== evmFilter) continue;
      tGroups.set(row.accountcode, (tGroups.get(row.accountcode) || 0) + row.amount);
    }
    const lyGroups = new Map();
    for (const row of (lyRows || [])) {
      const svc = serviceByAccount.get(row.accountcode);
      if (!svc || svc['bussiness group'] !== groupFilter || svc['evm service'] !== evmFilter) continue;
      lyGroups.set(row.accountcode, (lyGroups.get(row.accountcode) || 0) + row.amount);
    }
    return [...groups].map(([code, actual]) => {
      const svc = serviceByAccount.get(code);
      const target = tGroups.get(code) || 0;
      const lastYearAmount = lyGroups.get(code) || 0;
      return {
        name: `${code} — ${svc?.accountname || 'ไม่ทราบชื่อ'}`,
        actual,
        target,
        achievementPct: ratio(actual, target),
        lastYearAmount,
        yoyGrowthPct: ratio(actual, lastYearAmount),
      };
    }).sort((a, b) => b.actual - a.actual);
  }

  if (drillLevel === 'evm') {
    const groups = new Map();
    for (const row of rows) {
      const svc = serviceByAccount.get(row.accountcode);
      if (!svc || svc['bussiness group'] !== groupFilter) continue;
      const key = svc['evm service'];
      groups.set(key, (groups.get(key) || 0) + row.amount);
    }
    const tGroups = new Map();
    for (const row of targetRows) {
      const svc = serviceByAccount.get(row.accountcode);
      if (!svc || svc['bussiness group'] !== groupFilter) continue;
      const key = svc['evm service'];
      tGroups.set(key, (tGroups.get(key) || 0) + row.amount);
    }
    const lyGroups = new Map();
    for (const row of (lyRows || [])) {
      const svc = serviceByAccount.get(row.accountcode);
      if (!svc || svc['bussiness group'] !== groupFilter) continue;
      const key = svc['evm service'];
      lyGroups.set(key, (lyGroups.get(key) || 0) + row.amount);
    }
    return [...groups].map(([name, actual]) => {
      const target = tGroups.get(name) || 0;
      const lastYearAmount = lyGroups.get(name) || 0;
      return {
        name,
        actual,
        target,
        achievementPct: ratio(actual, target),
        lastYearAmount,
        yoyGrowthPct: ratio(actual, lastYearAmount),
      };
    }).sort((a, b) => b.actual - a.actual);
  }

  // Default: group by business group
  const groups = new Map();
  for (const row of rows) {
    const svc = serviceByAccount.get(row.accountcode);
    const name = svc?.['bussiness group'] || 'ไม่พบใน Master Service';
    groups.set(name, (groups.get(name) || 0) + row.amount);
  }
  const tGroups = new Map();
  for (const row of targetRows) {
    const svc = serviceByAccount.get(row.accountcode);
    const name = svc?.['bussiness group'] || 'ไม่พบใน Master Service';
    tGroups.set(name, (tGroups.get(name) || 0) + row.amount);
  }
  const lyGroups = new Map();
  for (const row of (lyRows || [])) {
    const svc = serviceByAccount.get(row.accountcode);
    const name = svc?.['bussiness group'] || 'ไม่พบใน Master Service';
    lyGroups.set(name, (lyGroups.get(name) || 0) + row.amount);
  }
  return [...groups].map(([name, actual]) => {
    const target = tGroups.get(name) || 0;
    const lastYearAmount = lyGroups.get(name) || 0;
    return {
      name,
      actual,
      target,
      achievementPct: ratio(actual, target),
      lastYearAmount,
      yoyGrowthPct: ratio(actual, lastYearAmount),
    };
  }).sort((a, b) => b.actual - a.actual);
}

/* ── Area / Province / Postcode breakdown (used in BI and SAP mode) ── */
function areaBreakdown(rows, targetRows, lyRows, drillLevel, provinceFilter) {
  if (drillLevel === 'postcode') {
    const filtered = rows.filter((row) => {
      const office = officeByPostcode.get(row.postcode);
      return office?.province === provinceFilter;
    });
    const groups = new Map();
    for (const row of filtered) {
      const office = officeByPostcode.get(row.postcode);
      const label = office ? `${row.postcode} ${office.postname}` : (row.postcode || 'ไม่ระบุที่ทำการ');
      groups.set(label, (groups.get(label) || 0) + row.amount);
    }
    const tFiltered = targetRows.filter((row) => {
      const office = officeByPostcode.get(row.postcode);
      return office?.province === provinceFilter;
    });
    const tGroups = new Map();
    for (const row of tFiltered) {
      const office = officeByPostcode.get(row.postcode);
      const label = office ? `${row.postcode} ${office.postname}` : (row.postcode || 'ไม่ระบุที่ทำการ');
      tGroups.set(label, (tGroups.get(label) || 0) + row.amount);
    }
    const lyFiltered = (lyRows || []).filter((row) => {
      const office = officeByPostcode.get(row.postcode);
      return office?.province === provinceFilter;
    });
    const lyGroups = new Map();
    for (const row of lyFiltered) {
      const office = officeByPostcode.get(row.postcode);
      const label = office ? `${row.postcode} ${office.postname}` : (row.postcode || 'ไม่ระบุที่ทำการ');
      lyGroups.set(label, (lyGroups.get(label) || 0) + row.amount);
    }
    return [...groups].map(([name, actual]) => {
      const target = tGroups.get(name) || 0;
      const lastYearAmount = lyGroups.get(name) || 0;
      return {
        name,
        actual,
        target,
        achievementPct: ratio(actual, target),
        lastYearAmount,
        yoyGrowthPct: ratio(actual, lastYearAmount),
      };
    }).sort((a, b) => b.actual - a.actual);
  }

  // Default: group by province
  const groups = new Map();
  for (const row of rows) {
    const office = officeByPostcode.get(row.postcode);
    const name = office?.province || (row.postcode ? `ไม่ทราบจังหวัด (${row.postcode})` : 'ไม่ระบุที่ทำการ');
    groups.set(name, (groups.get(name) || 0) + row.amount);
  }
  const tGroups = new Map();
  for (const row of targetRows) {
    const office = officeByPostcode.get(row.postcode);
    const name = office?.province || (row.postcode ? `ไม่ทราบจังหวัด (${row.postcode})` : 'ไม่ระบุที่ทำการ');
    tGroups.set(name, (tGroups.get(name) || 0) + row.amount);
  }
  const lyGroups = new Map();
  for (const row of (lyRows || [])) {
    const office = officeByPostcode.get(row.postcode);
    const name = office?.province || (row.postcode ? `ไม่ทราบจังหวัด (${row.postcode})` : 'ไม่ระบุที่ทำการ');
    lyGroups.set(name, (lyGroups.get(name) || 0) + row.amount);
  }
  return [...groups].map(([name, actual]) => {
    const target = tGroups.get(name) || 0;
    const lastYearAmount = lyGroups.get(name) || 0;
    return {
      name,
      actual,
      target,
      achievementPct: ratio(actual, target),
      lastYearAmount,
      yoyGrowthPct: ratio(actual, lastYearAmount),
    };
  }).sort((a, b) => b.actual - a.actual);
}

/* ── Express API Router ────────────────────────────────────────── */
const app = express();
app.use(cors());
app.use(express.json());

const api = express.Router();

api.get(['/health', '/status'], (req, res) => {
  res.json({
    status: 'ok',
    dataSource: source,
    diagnostics: dbDiagnostics,
    hasMongoUri: !!process.env.MONGODB_URI,
    mongoDbName: process.env.MONGODB_DB_NAME || 'reg6_revenue',
    counts: {
      offices: offices.length,
      services: services.length,
      actuals: actuals.length,
      targets: targets.length,
    },
  });
});

api.get('/meta/filters', (req, res) => {
  const postcodesByProvince = {};
  for (const office of offices) {
    const prov = office.province || 'อื่นๆ';
    if (!postcodesByProvince[prov]) postcodesByProvince[prov] = [];
    postcodesByProvince[prov].push({ postcode: office.postcode, postname: office.postname });
  }

  const latestMonthByYearBE = {};
  for (const row of actuals) {
    const yBE = row.year + 543;
    latestMonthByYearBE[yBE] = Math.max(latestMonthByYearBE[yBE] || 0, row.month);
  }

  res.json({
    success: true,
    data: {
      modes: ['BI', 'SAP'],
      yearsBE: [...new Set(actuals.map((row) => row.year + 543))].sort((a, b) => a - b),
      latestMonthByYearBE,
      provinces: [...new Set(offices.map((row) => row.province).filter(Boolean))].sort(),
      postcodesByProvince,
      sapSources: ['SAP', 'COD', 'FUZE', 'LOTTO', 'ECOMMERCE', 'DIT'],
      sapSourceLabels: { SAP: 'SAP', COD: 'COD', FUZE: 'FUZE', LOTTO: 'LOTTO', ECOMMERCE: 'e-Commerce', DIT: 'DIT' },
      serviceHierarchy,
      recordsLoaded: actuals.length + targets.length,
      source,
    },
  });
});

api.get('/dashboard/summary', (req, res) => {
  const f = filters(req.query);
  const rows = actuals.filter((row) => matchActual(row, f, null));
  const revenue = total(rows.filter((row) => row.category === 'REVENUE'));
  const expense = total(rows.filter((row) => row.category === 'EXPENSE'));
  const fRev = { ...f, category: 'REVENUE' };
  const fExp = { ...f, category: 'EXPENSE' };
  const revenueTarget = total(targets.filter((row) => matchTarget(row, fRev, 'REVENUE')));
  const expenseTarget = total(targets.filter((row) => matchTarget(row, fExp, 'EXPENSE')));
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

const sapSourcesList = ['SAP', 'COD', 'FUZE', 'LOTTO', 'ECOMMERCE', 'DIT'];
const sapSourceLabels = {
  SAP: 'SAP',
  COD: 'COD',
  FUZE: 'FUZE',
  LOTTO: 'LOTTO',
  ECOMMERCE: 'e-Commerce',
  DIT: 'DIT',
};

function calculateSourceSummary(f) {
  return sapSourcesList.map((src) => {
    const fSrc = { ...f, enabledSources: new Set([src]) };
    const srcRows = actuals.filter((row) => matchActual(row, fSrc));
    const actual = total(srcRows);
    const lastYearRows = actuals.filter((row) => matchActual(row, { ...fSrc, year: f.year - 1 }));
    const lastYearAmount = total(lastYearRows);
    const srcTRows = targets.filter((row) => matchTarget(row, fSrc, f.category));
    const target = total(srcTRows);

    return {
      source: src,
      label: sapSourceLabels[src],
      enabled: f.enabledSources.has(src),
      actual,
      target,
      achievementPct: ratio(actual, target),
      lastYearAmount,
      yoyGrowthPct: ratio(actual, lastYearAmount),
    };
  });
}

api.get('/dashboard/detail', (req, res) => {
  const f = filters(req.query);
  const rows = actuals.filter((row) => matchActual(row, f));
  const actual = total(rows);
  const lyRows = actuals.filter((row) => matchActual(row, { ...f, year: f.year - 1 }));
  const lastYear = total(lyRows);
  const tRows = targets.filter((row) => matchTarget(row, f, f.category));
  const target = total(tRows);

  const sourceSummary = f.mode === 'SAP' ? calculateSourceSummary(f) : null;
  const dimension = req.query.dimension || (f.mode === 'BI' ? 'area' : 'service');

  if (f.mode === 'BI' || dimension === 'area') {
    const drillLevel = req.query.drillLevel || 'province';
    const provinceFilter = req.query.drillProvince || null;
    const breakdown = areaBreakdown(rows, tRows, lyRows, drillLevel, provinceFilter);
    return res.json({
      success: true,
      filtersApplied: f,
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
  const breakdown = sapBreakdown(rows, tRows, lyRows, drillLevel, groupFilter, evmFilter);
  res.json({
    success: true,
    filtersApplied: f,
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

api.get('/dashboard/trend', (req, res) => {
  const f = filters(req.query);
  const from = f.monthFrom || 1;
  const to = f.monthTo || 12;
  const count = Math.max(0, to - from + 1);

  const data = Array.from({ length: count }, (_, index) => {
    const month = from + index;
    const mf = { ...f, monthFrom: month, monthTo: month };
    return {
      month,
      monthName: monthNames[month - 1],
      currentAmount: total(actuals.filter((row) => matchActual(row, mf))),
      lastYearAmount: total(actuals.filter((row) => matchActual(row, { ...mf, year: f.year - 1 }))),
      targetAmount: total(targets.filter((row) => matchTarget(row, mf, f.category))),
    };
  });
  res.json({ success: true, data });
});

api.get('/dashboard/watchlist', (req, res) => {
  const f = filters(req.query);
  const rows = actuals.filter((row) => matchActual(row, f));
  const lastYearRows = actuals.filter((row) => matchActual(row, { ...f, year: f.year - 1 }));
  const tRows = targets.filter((row) => matchTarget(row, f, f.category));

  const actualByPostcode = new Map();
  for (const r of rows) {
    if (!r.postcode) continue;
    actualByPostcode.set(r.postcode, (actualByPostcode.get(r.postcode) || 0) + r.amount);
  }

  const targetByPostcode = new Map();
  for (const r of tRows) {
    if (!r.postcode) continue;
    targetByPostcode.set(r.postcode, (targetByPostcode.get(r.postcode) || 0) + r.amount);
  }

  const lastYearByPostcode = new Map();
  for (const r of lastYearRows) {
    if (!r.postcode) continue;
    lastYearByPostcode.set(r.postcode, (lastYearByPostcode.get(r.postcode) || 0) + r.amount);
  }

  const targetOffices = f.province ? offices.filter((o) => o.province === f.province) : offices;

  const list = targetOffices.map((office) => {
    const pcode = office.postcode;
    const actual = actualByPostcode.get(pcode) || 0;
    const target = targetByPostcode.get(pcode) || 0;
    const lastYear = lastYearByPostcode.get(pcode) || 0;

    return {
      postcode: pcode,
      postname: office.postname,
      province: office.province,
      actual,
      target,
      targetAchievementPct: ratio(actual, target),
      lastYearAmount: lastYear,
      yoyGrowthPct: ratio(actual, lastYear),
    };
  });

  res.json({ success: true, data: list });
});

// Mount router under all possible path variants for local, express, and Vercel serverless
app.use('/api/v1', api);
app.use('/v1', api);
app.use('/api', api);
app.use('/', api);

export default app;

if (!process.env.VERCEL) {
  app.listen(process.env.PORT || 5000, () => console.log(`API ready on port ${process.env.PORT || 5000} (Source: ${source})`));
}
