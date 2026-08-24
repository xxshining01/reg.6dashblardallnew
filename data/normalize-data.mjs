import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const sourceDir = new URL('./', import.meta.url);
const outputDir = new URL('./normalized/', import.meta.url);
const readJson = async (name) => JSON.parse(await readFile(new URL(name, sourceDir), 'utf8'));
const writeJson = async (name, value) => writeFile(new URL(name, outputDir), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const number = (value) => Number(String(value).replaceAll(',', '').trim());
const category = (value) => value === 'ค่าใช้จ่าย' || value === 'EXPENSE' ? 'EXPENSE' : 'REVENUE';
const isoDate = (thaiDate) => {
  const [day, month, year] = String(thaiDate).split('/').map(Number);
  if (!day || !month || !year) throw new Error(`Invalid date: ${thaiDate}`);
  return new Date(Date.UTC(year, month - 1, day));
};
const formatDate = (date) => date.toISOString().slice(0, 10);
const weekStartFriday = (date) => {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() - ((copy.getUTCDay() + 2) % 7));
  return copy;
};

const inputFiles = [
  ['sap_2024.json', 'SAP'], ['sap_2025.json', 'SAP'], ['sap_2026.json', 'SAP'],
  ['bi_2025.json', 'BI'], ['bi_2026.json', 'BI'],
  ['cod_2024.json', 'COD'], ['cod_2025.json', 'COD'], ['cod_2026.json', 'COD'],
  ['dit_2025.json', 'DIT'], ['ecommerce_2024.json', 'ECOMMERCE'],
  ['ecommerce_2025.json', 'ECOMMERCE'], ['ecommerce_2026.json', 'ECOMMERCE'],
  ['fuze_2026.json', 'FUZE'], ['lotto_2025.json', 'LOTTO'], ['lotto_2026.json', 'LOTTO'],
];

// Explicit mappings preserve text account IDs as first-class service IDs.
const syntheticServices = [
  ['COD_FEE', '1.4.2 รายได้กลุ่มธุรกิจการเงิน', 'บริการ COD', 'ค่าธรรมเนียม COD'],
  ['DIT', '1.2 รายได้กลุ่มบริการขนส่งและโลจิสติกส์', 'รายได้บริการไปรษณีย์ด่วนพิเศษ-ในประเทศ', 'บริการรับฝากกล่องผลไม้ DIT'],
  ['e-Commerce', '1.2 รายได้กลุ่มบริการขนส่งและโลจิสติกส์', 'รายได้บริการไปรษณีย์ด่วนพิเศษ-ในประเทศ', 'ปันส่วนรายได้ e-Commerce'],
  ['Fuze', '1.2 รายได้กลุ่มบริการขนส่งและโลจิสติกส์', 'รายได้บริการไปรษณีย์โลจิสติกส์', 'รายได้ค่าบริการ FUZE Post'],
  ['สลาก', '1.2 รายได้กลุ่มบริการขนส่งและโลจิสติกส์', 'รายได้บริการไปรษณีย์ด่วนพิเศษ-ในประเทศ', 'ค่าบริการจัดส่งสลากฯ'],
].map(([sapAccountCode, businessGroup, evmService, serviceItem]) => ({
  sapAccountCode, category: 'REVENUE', businessGroup, evmService, serviceItem, accountCodeType: 'TEXT',
}));

await mkdir(outputDir, { recursive: true });
const rawOffices = await readJson('master_post.json');
const officeByCode = new Map();
for (const row of rawOffices) {
  if (!officeByCode.has(String(row.postCode))) {
    officeByCode.set(String(row.postCode), {
      officeCode: String(row.postCode), officeName: row.officeName, province: row.province,
      officeType: row.officeType, regionalCode: String(row.recode), coordinates: null,
      geoStatus: 'NOT_PROVIDED', isVirtual: false,
    });
  }
}
// BI "ปข.6" belongs to the regional HQ. "รายได้อื่น" is an aggregate, not a physical office.
const virtualCodes = new Map([['ปข.6', '60000-00'], ['รายได้อื่น', 'SYSTEM_OTHER_REVENUE']]);
officeByCode.set('60000-00', {
  officeCode: '60000-00', officeName: 'สำนักงานไปรษณีย์เขต 6', province: 'นครสวรรค์',
  officeType: 'REGIONAL_HQ', regionalCode: '60000', coordinates: null, geoStatus: 'NOT_PROVIDED', isVirtual: false,
});
officeByCode.set('SYSTEM_OTHER_REVENUE', {
  officeCode: 'SYSTEM_OTHER_REVENUE', officeName: 'รายได้อื่น', province: null,
  officeType: 'SYSTEM_AGGREGATE', regionalCode: null, coordinates: null, geoStatus: 'NOT_APPLICABLE', isVirtual: true,
});

const rawServices = await readJson('master_sap_service.json');
const serviceByCode = new Map();
for (const row of rawServices) {
  const code = String(row.sapAccountCode || '').trim();
  if (!code || serviceByCode.has(code)) continue;
  serviceByCode.set(code, {
    sapAccountCode: code, category: category(row.category), businessGroup: row.businessGroup,
    evmService: row.evmService, serviceItem: row.itemName, accountCodeType: 'SAP',
  });
}
for (const service of syntheticServices) serviceByCode.set(service.sapAccountCode, service);

const transactionsMonthly = [];
const quality = { sourceFiles: {}, unknownOfficeCodes: [], unknownServiceCodes: [], duplicateOfficeRowsRemoved: rawOffices.length - (officeByCode.size - virtualCodes.size), serviceRowsExcluded: rawServices.filter((x) => !String(x.sapAccountCode || '').trim()).length };
for (const [file, sourceType] of inputFiles) {
  const rows = await readJson(file);
  quality.sourceFiles[file] = rows.length;
  rows.forEach((row, index) => {
    const originalOfficeCode = String(row.postCode).trim();
    const officeCode = virtualCodes.get(originalOfficeCode) ?? originalOfficeCode;
    const sapAccountCode = row.sapAccountCode ? String(row.sapAccountCode).trim() : null;
    const resolvedCategory = sourceType === 'BI' ? category(row.category) : serviceByCode.get(sapAccountCode)?.category;
    if (!officeByCode.has(officeCode)) quality.unknownOfficeCodes.push({ file, index, originalOfficeCode });
    if (sapAccountCode && !serviceByCode.has(sapAccountCode)) quality.unknownServiceCodes.push({ file, index, sapAccountCode });
    transactionsMonthly.push({
      id: `${basename(file, '.json')}:${index + 1}`, fileIdentifier: basename(file, '.json'), year: number(row.year), month: number(row.month),
      officeCode, sapAccountCode, category: resolvedCategory ?? null, sourceType, amount: number(row.actual),
    });
  });
}

const targets = [];
for (const file of ['target_2025.json', 'target_2026.json']) {
  const rows = await readJson(file);
  quality.sourceFiles[file] = rows.length;
  rows.forEach((row, index) => {
    const sapAccountCode = String(row['รหัสบัญชี sap']).trim();
    if (!serviceByCode.has(sapAccountCode)) quality.unknownServiceCodes.push({ file, index, sapAccountCode });
    targets.push({ id: `${number(row['ปี'])}_${number(row['เดือน'])}_${row['รหัสไปรษณีย์']}_${sapAccountCode}`, year: number(row['ปี']), month: number(row['เดือน']), officeCode: String(row['รหัสไปรษณีย์']), sapAccountCode, targetAmount: number(row['เป้าหมาย']) });
  });
}

const weeklyGroups = {
  'กลุ่มบริการไปรษณียภัณฑ์': ['1.1'], 'กลุ่มบริการขนส่งและโลจิสติกส์': ['1.2'], 'กลุ่มบริการระหว่างประเทศ': ['1.3'],
  'กลุ่มธุรกิจค้าปลีกและการเงิน': ['1.4.1', '1.4.2'], 'กลุ่มธุรกิจอื่นๆ': ['1.5'], 'รายได้อื่น': ['1.6'],
};
const transactionsDaily = [];
for (const [file, sourceType] of [['รส.201.json', 'ROS201'], ['pickup.json', 'PICKUP']]) {
  const rows = await readJson(file);
  quality.sourceFiles[file] = rows.length;
  rows.forEach((row, index) => {
    const date = isoDate(row['วันที่']); const businessGroup = sourceType === 'ROS201' ? row['Business Group'] : null;
    const officeCode = String(row['รหัสไปรษณีย์']).trim();
    if (!officeByCode.has(officeCode)) quality.unknownOfficeCodes.push({ file, index, originalOfficeCode: officeCode });
    transactionsDaily.push({
      id: `${basename(file, '.json')}:${index + 1}`, date: formatDate(date), year: date.getUTCFullYear(), month: date.getUTCMonth() + 1,
      officeCode, sourceType, category: 'REVENUE', businessGroup: businessGroup ?? 'Pickup',
      targetBusinessGroupPrefixes: sourceType === 'ROS201' ? weeklyGroups[businessGroup] ?? [] : [],
      targetMappingStatus: sourceType === 'ROS201' ? 'MAPPED' : 'PENDING_PICKUP_MAPPING', amount: number(row['ผลการดำเนินงาน']),
      weekStart: formatDate(weekStartFriday(date)), weekEnd: formatDate(new Date(weekStartFriday(date).getTime() + 6 * 86400000)),
    });
  });
}

const weeklyMap = new Map();
for (const row of transactionsDaily) {
  const key = [row.year, row.month, row.weekStart, row.officeCode, row.sourceType, row.businessGroup].join('|');
  const item = weeklyMap.get(key) ?? { ...row, id: `weekly:${key}`, amount: 0, daysWithData: new Set() };
  item.amount += row.amount; item.daysWithData.add(row.date); weeklyMap.set(key, item);
}
const transactionsWeekly = [...weeklyMap.values()].map(({ daysWithData, ...row }) => ({ ...row, daysWithData: daysWithData.size }));

// Weekly targets are category-level only. A Friday–Thursday period is clipped to the calendar month.
const categoryTargetByOfficeMonth = new Map();
for (const row of targets) {
  const service = serviceByCode.get(row.sapAccountCode);
  if (!service) continue;
  const key = [row.year, row.month, row.officeCode, service.category].join('|');
  categoryTargetByOfficeMonth.set(key, (categoryTargetByOfficeMonth.get(key) ?? 0) + row.targetAmount);
}
const weeklyTargets = [];
for (const [key, monthlyTargetAmount] of categoryTargetByOfficeMonth) {
  const [year, month, officeCode, targetCategory] = key.split('|');
  const y = Number(year), m = Number(month), daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const periods = new Map();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(Date.UTC(y, m - 1, day)); const weekStart = formatDate(weekStartFriday(date));
    const period = periods.get(weekStart) ?? { weekStart, weekEnd: formatDate(new Date(weekStartFriday(date).getTime() + 6 * 86400000)), daysInPeriod: 0, lastDay: day };
    period.daysInPeriod += 1; period.lastDay = day; periods.set(weekStart, period);
  }
  for (const period of periods.values()) weeklyTargets.push({
    id: `${year}_${month}_${officeCode}_${targetCategory}_${period.weekStart}`, year: y, month: m, officeCode, targetCategory,
    weekStart: period.weekStart, weekEnd: period.weekEnd, daysInMonth, daysInPeriod: period.daysInPeriod, cumulativeDays: period.lastDay,
    monthlyTargetAmount, weeklyTargetAmount: monthlyTargetAmount * period.daysInPeriod / daysInMonth,
    cumulativeTargetAmount: monthlyTargetAmount * period.lastDay / daysInMonth,
    weeklyTargetPct: period.daysInPeriod * 100 / daysInMonth, cumulativeTargetPct: period.lastDay * 100 / daysInMonth,
  });
}

await writeJson('master_offices.json', [...officeByCode.values()]);
await writeJson('master_services.json', [...serviceByCode.values()]);
await writeJson('transactions_monthly.json', transactionsMonthly);
await writeJson('targets.json', targets);
await writeJson('transactions_daily.json', transactionsDaily);
await writeJson('transactions_weekly.json', transactionsWeekly);
await writeJson('weekly_targets.json', weeklyTargets);
await writeJson('data_quality_report.json', {
  generatedAt: new Date().toISOString(), ...quality,
  unknownOfficeCodes: quality.unknownOfficeCodes.slice(0, 100), unknownOfficeCodeCount: quality.unknownOfficeCodes.length,
  unknownServiceCodes: quality.unknownServiceCodes.slice(0, 100), unknownServiceCodeCount: quality.unknownServiceCodes.length,
  coordinateCoverage: { provided: 0, requiredForSpatialMap: [...officeByCode.values()].filter((x) => !x.isVirtual).length },
  weeklyRule: 'Friday through Thursday; records are grouped by calendar month and custom week start.',
});
console.log(JSON.stringify({ offices: officeByCode.size, services: serviceByCode.size, transactionsMonthly: transactionsMonthly.length, targets: targets.length, transactionsDaily: transactionsDaily.length, transactionsWeekly: transactionsWeekly.length, weeklyTargets: weeklyTargets.length, unknownOfficeCodes: quality.unknownOfficeCodes.length, unknownServiceCodes: quality.unknownServiceCodes.length }, null, 2));
