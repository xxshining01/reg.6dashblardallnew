export function applyFilters(rows, filters) {
  if (!rows) return [];
  return rows.filter((r) => {
    if (filters.province && filters.province !== "ALL" && r.province !== filters.province)
      return false;
    if (filters.office && filters.office !== "ALL" && r.office !== filters.office)
      return false;
    if (
      filters.businessGroup &&
      filters.businessGroup !== "ALL" &&
      r.businessGroup !== filters.businessGroup
    )
      return false;
    if (r.date < filters.dateFrom || r.date > filters.dateTo) return false;
    return true;
  });
}

export function sumRevenue(rows) {
  if (!rows) return 0;
  return rows.reduce((s, r) => s + (Number(r.revenue) || 0), 0);
}

export function groupByKey(rows, keyFn) {
  const map = new Map();
  if (!rows) return map;
  rows.forEach((r) => {
    const key = keyFn(r);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  });
  return map;
}

/** คำนวณรายได้รวมแยกตามจังหวัด */
export function calcProvinceRevenues(rows) {
  const map = groupByKey(rows, (r) => r.province);
  const result = [];
  map.forEach((provinceRows, province) => {
    result.push({ province, revenue: sumRevenue(provinceRows) });
  });
  return result.sort((a, b) => b.revenue - a.revenue);
}

/** คำนวณรายได้รวมแยกตามกลุ่มธุรกิจ */
export function calcBusinessGroupRevenues(rows) {
  const map = groupByKey(rows, (r) => r.businessGroup);
  const result = [];
  map.forEach((bgRows, name) => {
    result.push({ name, value: sumRevenue(bgRows) });
  });
  return result.sort((a, b) => b.value - a.value);
}

/** รายได้รายวัน (ไม่สะสม) แยกตามวัน */
export function calcDailyRevenues(rows) {
  const map = groupByKey(rows, (r) => r.date);
  const result = [];
  map.forEach((dayRows, date) => {
    result.push({ date, actual: sumRevenue(dayRows) });
  });
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

/** สะสมรายได้รายวันให้เป็น cumulative */
export function toCumulativeDaily(dailyRevenues) {
  let cumulative = 0;
  return dailyRevenues.map((d) => {
    cumulative += d.actual;
    return { ...d, cumulative };
  });
}

/** คำนวณรายได้รวมแยกตามที่ทำการ */
export function calcOfficeRevenues(rows) {
  const map = groupByKey(rows, (r) => r.office);
  const result = [];
  map.forEach((officeRows, office) => {
    result.push({
      office,
      province: officeRows[0]?.province ?? "",
      revenue: sumRevenue(officeRows),
    });
  });
  return result.sort((a, b) => b.revenue - a.revenue);
}
