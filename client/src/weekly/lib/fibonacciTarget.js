import dayjs from "dayjs";

/**
 * แบ่งเดือน (year, month 1-12) เป็นสัปดาห์ศุกร์–พฤหัสบดี
 * คืนค่าจำนวนวันของแต่ละสัปดาห์
 */
export function splitMonthIntoFriThuWeeks(year, month) {
  const start = dayjs(`${year}-${String(month).padStart(2, "0")}-01`);
  const end = start.endOf("month");
  const totalDays = end.date();

  const weeks = [];
  let cursor = start;
  let daysCounted = 0;

  while (daysCounted < totalDays) {
    const dayOfWeek = cursor.day(); // 0=อาทิตย์ ... 4=พฤหัส 5=ศุกร์
    const daysUntilThursday = (4 - dayOfWeek + 7) % 7;
    let weekEnd = cursor.add(daysUntilThursday, "day");
    if (weekEnd.isAfter(end)) weekEnd = end;

    const daysInWeek = weekEnd.diff(cursor, "day") + 1;
    weeks.push(daysInWeek);
    daysCounted += daysInWeek;
    cursor = weekEnd.add(1, "day");
  }

  return weeks;
}

export function calculateLinearWeeklyTargets(year, month, monthlyTarget) {
  const daysPerWeek = splitMonthIntoFriThuWeeks(year, month);
  const totalDays = daysPerWeek.reduce((a, b) => a + b, 0);

  let cumulativePercent = 0;
  let cursorDate = dayjs(`${year}-${String(month).padStart(2, "0")}-01`);

  return daysPerWeek.map((days, i) => {
    const percentOfMonth = (days / totalDays) * 100;
    cumulativePercent += percentOfMonth;

    const weekStart = cursorDate;
    const weekEnd = cursorDate.add(days - 1, "day");
    cursorDate = weekEnd.add(1, "day");

    return {
      weekIndex: i + 1,
      daysInWeek: days,
      weekStart: weekStart.format("YYYY-MM-DD"),
      weekEnd: weekEnd.format("YYYY-MM-DD"),
      percentOfMonth: Number(percentOfMonth.toFixed(2)),
      cumulativePercent: Number(Math.min(cumulativePercent, 100).toFixed(2)),
      cumulativeAmount: Number(
        ((Math.min(cumulativePercent, 100) / 100) * monthlyTarget).toFixed(2)
      ),
    };
  });
}

/**
 * ขยายเป้าหมายรายสัปดาห์ (แบบสะสม) ให้เป็นเส้นเป้าหมายสะสมรายวัน
 */
export function expandToDailyCumulativeTarget(weeklyTargets, monthlyTarget) {
  const result = [];
  let prevCumulative = 0;

  weeklyTargets.forEach((week) => {
    const weekAmount =
      (week.cumulativePercent / 100) * monthlyTarget - prevCumulative;
    const perDay = weekAmount / week.daysInWeek;

    let d = dayjs(week.weekStart);
    for (let i = 0; i < week.daysInWeek; i++) {
      prevCumulative += perDay;
      result.push({
        date: d.format("YYYY-MM-DD"),
        cumulativeTarget: Math.round(prevCumulative),
      });
      d = d.add(1, "day");
    }
  });

  return result;
}

/**
 * หาสัปดาห์ปัจจุบัน (index 0-based) จาก weeklyTargets
 */
export function getCurrentWeekIndex(weeklyTargets, actualToday) {
  if (!weeklyTargets || weeklyTargets.length === 0) return 0;

  for (let i = 0; i < weeklyTargets.length; i++) {
    if (actualToday >= weeklyTargets[i].weekStart && actualToday <= weeklyTargets[i].weekEnd) {
      return i;
    }
  }

  if (actualToday > weeklyTargets[weeklyTargets.length - 1].weekEnd) {
    return weeklyTargets.length;
  }
  if (actualToday < weeklyTargets[0].weekStart) {
    return -1;
  }

  return weeklyTargets.length - 1;
}
