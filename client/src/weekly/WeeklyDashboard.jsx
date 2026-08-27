import { useMemo, useState, useEffect, useCallback } from "react";
import dayjs from "dayjs";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";

import { FilterProvider, useFilters } from "./contexts/FilterContext.jsx";
import { useDashboardData } from "./hooks/useDashboardData.js";

import { DashboardHeader } from "./components/DashboardHeader.jsx";
import { FilterBar } from "./components/FilterBar.jsx";
import { WeeklyTargetBoxes } from "./components/WeeklyTargetBoxes.jsx";
import { DailyProgressChart } from "./components/DailyProgressChart.jsx";
import { RankingChart } from "./components/RankingChart.jsx";
import { PerformancePanels } from "./components/PerformancePanels.jsx";
import { BusinessGroupDonut } from "./components/BusinessGroupDonut.jsx";
import { AIInsightPanel } from "./components/AIInsightPanel.jsx";
import { DashboardFooterNote } from "./components/DashboardFooterNote.jsx";
import { DashboardSkeleton, DashboardError } from "./components/DashboardSkeleton.jsx";

import {
  applyFilters,
  sumRevenue,
  groupByKey,
  calcDailyRevenues,
  toCumulativeDaily,
} from "./lib/aggregate.js";
import {
  calculateLinearWeeklyTargets,
  expandToDailyCumulativeTarget,
  getCurrentWeekIndex,
} from "./lib/fibonacciTarget.js";
import { computeProvinceProgress, generateInsightText } from "./lib/aiInsight.js";
import { formatThaiDate } from "./lib/buddhistDate.js";

import "./weekly-styles.css";

function DashboardContent({ actionsRef }) {
  const { filters } = useFilters();
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const actualToday = dayjs().format("YYYY-MM-DD");
  const today = filters.dateTo || actualToday;
  const filterDate = dayjs(today);
  const currentYear = filterDate.year();
  const currentMonth = filterDate.month() + 1;

  const { dailyRows, monthlyRows, rawTargets, isLoading, isError, mutate } = useDashboardData();

  // 1. Determine dropdown options
  const provinces = useMemo(() => {
    const s = new Set();
    dailyRows.forEach((r) => { if (r.province) s.add(r.province); });
    rawTargets.forEach((t) => { if (t.province) s.add(t.province); });
    return Array.from(s).sort();
  }, [dailyRows, rawTargets]);

  const offices = useMemo(() => {
    const s = new Set();
    const match = (p) => filters.province === "ALL" || p === filters.province;
    dailyRows.forEach((r) => { if (r.office && match(r.province)) s.add(r.office); });
    rawTargets.forEach((t) => { if (t.office && match(t.province)) s.add(t.office); });
    return Array.from(s).sort();
  }, [dailyRows, rawTargets, filters.province]);

  const businessGroups = useMemo(() => {
    const s = new Set();
    dailyRows.forEach((r) => { if (r.businessGroup) s.add(r.businessGroup); });
    rawTargets.forEach((t) => { if (t.businessGroup) s.add(t.businessGroup); });
    return Array.from(s).sort();
  }, [dailyRows, rawTargets]);

  // 2. Filter data for selected month and criteria
  const monthStart = filterDate.startOf("month").format("YYYY-MM-DD");
  const monthEnd = filterDate.endOf("month").format("YYYY-MM-DD");

  const currentMonthFilter = {
    ...filters,
    dateFrom: filters.dateFrom < monthStart ? monthStart : filters.dateFrom,
    dateTo: filters.dateTo > monthEnd ? monthEnd : filters.dateTo,
  };

  const filteredDaily = useMemo(
    () => applyFilters(dailyRows, currentMonthFilter),
    [dailyRows, currentMonthFilter]
  );

  const filteredMonthly = useMemo(
    () =>
      monthlyRows.filter((r) => {
        if (r.date !== monthStart) return false;
        if (filters.province !== "ALL" && r.province !== filters.province) return false;
        if (filters.office !== "ALL" && r.office !== filters.office) return false;
        return true;
      }),
    [monthlyRows, filters, monthStart]
  );

  const filteredTargets = useMemo(
    () =>
      rawTargets.filter((t) => {
        if (t.month !== currentMonth || t.year !== currentYear) return false;
        if (filters.province !== "ALL" && t.province !== filters.province) return false;
        if (filters.office !== "ALL" && t.office !== filters.office) return false;
        if (filters.businessGroup !== "ALL" && t.businessGroup !== filters.businessGroup) return false;
        return true;
      }),
    [rawTargets, filters, currentMonth, currentYear]
  );

  // 3. Fallback logic
  const monthlyRevenueSum = sumRevenue(filteredMonthly);
  const useDailyFallback = monthlyRevenueSum === 0;

  const actualRevenue = useMemo(() => {
    if (useDailyFallback) {
      return sumRevenue(filteredDaily.filter((r) => r.date <= today));
    }
    return monthlyRevenueSum;
  }, [useDailyFallback, filteredDaily, monthlyRevenueSum, today]);

  const monthlyTarget = useMemo(
    () => filteredTargets.reduce((sum, t) => sum + (t.target || 0), 0),
    [filteredTargets]
  );

  // 4. Weekly targets
  const weeklyTargets = useMemo(
    () =>
      monthlyTarget > 0
        ? calculateLinearWeeklyTargets(currentYear, currentMonth, monthlyTarget)
        : [],
    [currentYear, currentMonth, monthlyTarget]
  );

  const currentWeekIndex = useMemo(
    () => (weeklyTargets.length > 0 ? getCurrentWeekIndex(weeklyTargets, actualToday) : 0),
    [weeklyTargets, actualToday]
  );

  const defaultWeekIndex = useMemo(() => {
    if (weeklyTargets.length === 0) return 0;
    let idx = currentWeekIndex - 1;
    if (idx < 0) idx = 0;
    if (idx >= weeklyTargets.length) idx = weeklyTargets.length - 1;
    return idx;
  }, [currentWeekIndex, weeklyTargets.length]);

  const effectiveFilter = selectedWeekIndex !== null ? selectedWeekIndex : defaultWeekIndex;

  // 5. Ranking & Performance Data (Drill-down logic)
  const isDrillDown = filters.province !== "ALL";
  const drillDownKey = isDrillDown ? (r) => r.office : (r) => r.province;
  const drillDownTitle = isDrillDown ? "ที่ทำการ" : "จังหวัด";

  const rankingData = useMemo(() => {
    const revenueSource = useDailyFallback
      ? filteredDaily.filter((r) => r.date <= today)
      : filteredMonthly;

    const revGrouped = groupByKey(revenueSource, drillDownKey);
    const targetGrouped = groupByKey(filteredTargets, drillDownKey);

    const result = [];
    const allKeys = new Set([...Array.from(revGrouped.keys()), ...Array.from(targetGrouped.keys())]);

    allKeys.forEach((key) => {
      const revenue = sumRevenue(revGrouped.get(key) ?? []);
      const target = (targetGrouped.get(key) ?? []).reduce((sum, t) => sum + (t.target || 0), 0);
      const progressPercent = target > 0 ? (revenue / target) * 100 : 0;

      if (revenue > 0 || target > 0) {
        result.push({
          name: key,
          progressPercent: Number(progressPercent.toFixed(1)),
          revenue,
          target,
        });
      }
    });

    return result;
  }, [useDailyFallback, filteredDaily, filteredMonthly, filteredTargets, drillDownKey, today]);

  const performancePanelsData = useMemo(() => {
    if (effectiveFilter === 'MONTH') {
      const revenueSource = useDailyFallback
        ? filteredDaily.filter((r) => r.date <= today)
        : filteredMonthly;

      const revGrouped = groupByKey(revenueSource, drillDownKey);
      const targetGrouped = groupByKey(filteredTargets, drillDownKey);
      const allKeys = new Set([...Array.from(revGrouped.keys()), ...Array.from(targetGrouped.keys())]);

      const mappedToWeekly = [];
      allKeys.forEach((key) => {
        const revenue = sumRevenue(revGrouped.get(key) ?? []);
        const target = (targetGrouped.get(key) ?? []).reduce((sum, t) => sum + (t.target || 0), 0);

        if (target > 0) {
          const progressPercent = (revenue / target) * 100;
          mappedToWeekly.push({
            name: key,
            progressPercent: Number(progressPercent.toFixed(1)),
            revenue,
            target,
          });
        }
      });

      const outperforming = mappedToWeekly
        .filter((o) => o.progressPercent >= 100)
        .sort((a, b) => b.progressPercent - a.progressPercent);

      const underperforming = mappedToWeekly
        .filter((o) => o.progressPercent < 100)
        .sort((a, b) => a.progressPercent - b.progressPercent);

      return { outperforming, underperforming };
    }

    const weekIndex = effectiveFilter;
    const currentWeekTarget = weeklyTargets[weekIndex];

    if (!currentWeekTarget) return { outperforming: [], underperforming: [] };

    const weekTargetPercent = currentWeekTarget.cumulativePercent - (weekIndex === 0 ? 0 : weeklyTargets[weekIndex - 1].cumulativePercent);
    const weekStart = currentWeekTarget.weekStart;
    const weekEnd = currentWeekTarget.weekEnd;

    const revenueSource = filteredDaily.filter(
      (r) => r.date >= weekStart && r.date <= weekEnd && r.date <= today
    );

    const revGrouped = groupByKey(revenueSource, drillDownKey);
    const targetGrouped = groupByKey(filteredTargets, drillDownKey);
    const allKeys = new Set([...Array.from(revGrouped.keys()), ...Array.from(targetGrouped.keys())]);

    const mappedToWeekly = [];
    allKeys.forEach((key) => {
      const revenue = sumRevenue(revGrouped.get(key) ?? []);
      const monthlyTargetValue = (targetGrouped.get(key) ?? []).reduce((sum, t) => sum + (t.target || 0), 0);

      if (monthlyTargetValue > 0) {
        const weeklyTarget = (monthlyTargetValue * weekTargetPercent) / 100;
        const weeklyProgressPercent = weeklyTarget > 0 ? (revenue / weeklyTarget) * 100 : 0;
        mappedToWeekly.push({
          name: key,
          progressPercent: Number(weeklyProgressPercent.toFixed(1)),
          revenue,
          target: weeklyTarget,
        });
      }
    });

    const outperforming = mappedToWeekly
      .filter((o) => o.progressPercent >= 100)
      .sort((a, b) => b.progressPercent - a.progressPercent);

    const underperforming = mappedToWeekly
      .filter((o) => o.progressPercent < 100)
      .sort((a, b) => a.progressPercent - b.progressPercent);

    return { outperforming, underperforming };
  }, [filteredDaily, filteredMonthly, filteredTargets, drillDownKey, useDailyFallback, today, weeklyTargets, effectiveFilter]);

  // 6. Donut Data
  const donutData = useMemo(() => {
    const revenueSource = filteredDaily.filter((r) => r.date <= today);
    const byGroup = groupByKey(revenueSource, (r) => r.businessGroup);
    const result = [];
    byGroup.forEach((rows, name) => {
      result.push({ name, value: sumRevenue(rows) });
    });
    return result;
  }, [filteredDaily, today]);

  // 7. Daily Chart Data
  const dailyChartData = useMemo(() => {
    const dailyRevs = calcDailyRevenues(filteredDaily);
    const withCumulative = toCumulativeDaily(dailyRevs);
    const targetLine = monthlyTarget > 0 ? expandToDailyCumulativeTarget(weeklyTargets, monthlyTarget) : [];
    const targetMap = new Map(targetLine.map((t) => [t.date, t.cumulativeTarget]));

    return withCumulative.map((d) => ({
      date: d.date,
      actual: d.actual,
      cumulative: Math.round(d.cumulative),
      cumulativeTarget: targetMap.get(d.date) ?? 0,
    }));
  }, [filteredDaily, weeklyTargets, monthlyTarget]);

  // 8. AI Insight
  const insightText = useMemo(() => {
    if (rankingData.length === 0) return "กำลังวิเคราะห์ข้อมูล...";
    const progress = computeProvinceProgress(rankingData, filteredDaily, today, isDrillDown);
    return generateInsightText(progress, isDrillDown);
  }, [rankingData, filteredDaily, today, isDrillDown]);

  // 9. Screenshot & Excel Export Handlers
  const handleCaptureScreenshot = useCallback(async () => {
    setIsCapturing(true);
    try {
      const container = document.querySelector('.weekly-container');
      if (!container) return;

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#F1F5F9',
        ignoreElements: (element) => element.classList.contains('no-capture'),
      });

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const locStr = filters.office !== 'ALL' ? `_${filters.office}` : filters.province !== 'ALL' ? `_${filters.province}` : '';
      link.download = `Dashboard_ปข6_รายสัปดาห์_${today}${locStr}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Screenshot capture failed:', err);
      alert('เกิดข้อผิดพลาดในการบันทึกภาพหน้าจอ: ' + err.message);
    } finally {
      setIsCapturing(false);
    }
  }, [filters, today]);

  const handleExportExcel = useCallback(() => {
    setIsExporting(true);
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: สรุปภาพรวมและเป้าหมายรายสัปดาห์
      const overviewHeader = ['สัปดาห์ / รายการ', 'ช่วงวันที่', 'ผลการดำเนินงานจริง (บาท)', 'เป้าหมาย (บาท)', '% ความคืบหน้า', 'สถานะ'];
      const overviewData = weeklyTargets.map((w, idx) => {
        const prevCumAmount = idx === 0 ? 0 : weeklyTargets[idx - 1].cumulativeAmount;
        const weekTarget = w.cumulativeAmount - prevCumAmount;
        const weekActual = sumRevenue(
          filteredDaily.filter((r) => r.date >= w.weekStart && r.date <= w.weekEnd && r.date <= today)
        );
        const pct = weekTarget > 0 ? (weekActual / weekTarget) * 100 : 0;
        const isPassed = weekActual >= weekTarget && weekTarget > 0;
        return [
          `สัปดาห์ที่ ${w.weekIndex}`,
          `${w.weekStart} ถึง ${w.weekEnd}`,
          weekActual,
          weekTarget,
          Number(pct.toFixed(2)),
          isPassed ? 'ผ่าน' : 'ไม่ผ่าน'
        ];
      });

      overviewData.push([
        'รวมสะสมทั้งเดือน',
        `${monthStart} ถึง ${monthEnd}`,
        actualRevenue,
        monthlyTarget,
        monthlyTarget > 0 ? Number(((actualRevenue / monthlyTarget) * 100).toFixed(2)) : 0,
        actualRevenue >= monthlyTarget ? 'บรรลุเป้าหมาย' : 'ยังไม่บรรลุ'
      ]);

      const wsOverview = XLSX.utils.aoa_to_sheet([overviewHeader, ...overviewData]);
      wsOverview['!cols'] = [{ wch: 22 }, { wch: 26 }, { wch: 24 }, { wch: 22 }, { wch: 18 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsOverview, 'สรุปรายสัปดาห์');

      // Sheet 2: อันดับผลงาน (Ranking)
      if (rankingData && rankingData.length > 0) {
        const rankHeader = [drillDownTitle, 'ผลงานจริง (บาท)', 'เป้าหมาย (บาท)', '% บรรลุเป้าหมาย'];
        const rankData = rankingData.map((r) => [
          r.name,
          r.revenue || 0,
          r.target || 0,
          r.progressPercent || 0,
        ]);
        const wsRank = XLSX.utils.aoa_to_sheet([rankHeader, ...rankData]);
        wsRank['!cols'] = [{ wch: 32 }, { wch: 24 }, { wch: 22 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(wb, wsRank, `อันดับ_${drillDownTitle}`);
      }

      // Sheet 3: สัดส่วนกลุ่มธุรกิจ
      if (donutData && donutData.length > 0) {
        const donutHeader = ['กลุ่มธุรกิจ', 'รายได้จริง (บาท)', '% สัดส่วน'];
        const totalDonut = donutData.reduce((s, d) => s + d.value, 0);
        const donutSheetData = donutData.map((d) => [
          d.name,
          d.value || 0,
          totalDonut > 0 ? Number(((d.value / totalDonut) * 100).toFixed(2)) : 0,
        ]);
        const wsDonut = XLSX.utils.aoa_to_sheet([donutHeader, ...donutSheetData]);
        wsDonut['!cols'] = [{ wch: 28 }, { wch: 24 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(wb, wsDonut, 'สัดส่วนกลุ่มธุรกิจ');
      }

      // Sheet 4: รายได้รายวัน
      if (dailyChartData && dailyChartData.length > 0) {
        const dailyHeader = ['วันที่', 'รายได้ประจำวัน (บาท)', 'สะสมจริง (บาท)', 'เป้าหมายสะสม (บาท)'];
        const dailySheetData = dailyChartData.map((d) => [
          d.date,
          d.actual || 0,
          d.cumulative || 0,
          d.cumulativeTarget || 0,
        ]);
        const wsDaily = XLSX.utils.aoa_to_sheet([dailyHeader, ...dailySheetData]);
        wsDaily['!cols'] = [{ wch: 16 }, { wch: 24 }, { wch: 22 }, { wch: 22 }];
        XLSX.utils.book_append_sheet(wb, wsDaily, 'รายได้รายวัน');
      }

      const locStr = filters.office !== 'ALL' ? `_${filters.office}` : filters.province !== 'ALL' ? `_${filters.province}` : '';
      XLSX.writeFile(wb, `รายงานผลงานรายสัปดาห์_ปข6_${today}${locStr}.xlsx`);
    } catch (err) {
      console.error('Export Excel failed:', err);
      alert('เกิดข้อผิดพลาดในการส่งออกไฟล์ Excel: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  }, [weeklyTargets, filteredDaily, today, monthStart, monthEnd, actualRevenue, monthlyTarget, rankingData, drillDownTitle, donutData, dailyChartData, filters]);

  // Expose actions to parent ref
  useEffect(() => {
    if (actionsRef) {
      actionsRef.current = {
        capture: handleCaptureScreenshot,
        exportExcel: handleExportExcel,
        isCapturing,
        isExporting,
      };
    }
  }, [actionsRef, handleCaptureScreenshot, handleExportExcel, isCapturing, isExporting]);

  if (isLoading) return <DashboardSkeleton />;
  if (isError) return <DashboardError message="ไม่สามารถโหลดข้อมูลได้" onRetry={mutate} />;

  // Calculate unified vertical height for Row 2 (Ranking + Performance panels)
  const maxItemsInRow2 = Math.max(
    rankingData.length,
    performancePanelsData.outperforming.length,
    performancePanelsData.underperforming.length,
    5
  );
  const row2UnifiedHeight = Math.max(340, maxItemsInRow2 * 34 + 60);

  return (
    <div className="weekly-container">
      <DashboardHeader
        lastUpdated={today}
        monthYear={monthStart}
        onRefresh={mutate}
      />
      <FilterBar provinces={provinces} offices={offices} businessGroups={businessGroups} />

      <div className="weekly-grid-layout">
        {/* Row 1: Weekly Target Cards (col 1-9) + AI Insight (col 10-12) */}
        <div style={{ gridColumn: "span 9" }}>
          {weeklyTargets.length > 0 ? (
            <WeeklyTargetBoxes
              actualRevenue={actualRevenue}
              monthlyTarget={monthlyTarget}
              weeklyTargets={weeklyTargets}
              currentWeekIndex={currentWeekIndex}
              filteredDaily={filteredDaily}
              today={today}
              selectedWeekIndex={effectiveFilter}
              onSelectWeek={(i) => setSelectedWeekIndex(i === effectiveFilter ? null : i)}
            />
          ) : (
            <div className="card" style={{ padding: 20, textAlign: "center" }}>
              <p style={{ fontSize: 15, color: "var(--ink-soft)", margin: 0 }}>ไม่มีข้อมูลเป้าหมาย</p>
            </div>
          )}
        </div>
        <div style={{ gridColumn: "span 3" }}>
          <AIInsightPanel insightText={insightText} generatedAt={formatThaiDate(today, "D MMMM")} />
        </div>

        {/* Row 2: Ranking (col 1-5) & Performance Panels (col 6-12) - Equal Vertical Height */}
        <div style={{ gridColumn: "span 5", display: "flex", flexDirection: "column" }}>
          <RankingChart
            data={rankingData}
            title={`อันดับความคืบหน้าราย${drillDownTitle}`}
            isDrillDown={isDrillDown}
            minHeight={row2UnifiedHeight}
          />
        </div>
        <div style={{ gridColumn: "span 7", display: "flex", flexDirection: "column" }}>
          <PerformancePanels
            outperforming={performancePanelsData.outperforming}
            underperforming={performancePanelsData.underperforming}
            titlePrefix={drillDownTitle}
            minHeight={row2UnifiedHeight}
          />
        </div>

        {/* Row 3: Daily Progress Chart (col 1-8) & Donut (col 9-12) */}
        <div style={{ gridColumn: "span 8" }}>
          <DailyProgressChart data={dailyChartData} today={today} />
        </div>
        <div style={{ gridColumn: "span 4" }}>
          <BusinessGroupDonut data={donutData} />
        </div>
      </div>

      <DashboardFooterNote refreshedAt={new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} />
    </div>
  );
}

export default function WeeklyDashboard({ actionsRef }) {
  return (
    <FilterProvider>
      <DashboardContent actionsRef={actionsRef} />
    </FilterProvider>
  );
}
