import dayjs from "dayjs";
import { sumRevenue } from "../lib/aggregate.js";

function formatBaht(val) {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}K`;
  return (val || 0).toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

export function WeeklyTargetBoxes({
  actualRevenue,
  monthlyTarget,
  weeklyTargets,
  currentWeekIndex,
  filteredDaily,
  today,
  selectedWeekIndex,
  onSelectWeek,
}) {
  const cumulativePercent = monthlyTarget > 0 ? (actualRevenue / monthlyTarget) * 100 : 0;
  const isMonthSelected = selectedWeekIndex === 'MONTH';

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
      {/* ── Top Row: Weekly Cards (W1–W5) ── */}
      <div style={{ display: "flex", gap: 10, width: "100%", flexWrap: "nowrap", overflowX: "auto" }}>
        {weeklyTargets.map((w, i) => {
          const prevCumAmount = i === 0 ? 0 : weeklyTargets[i - 1].cumulativeAmount;
          const weekTarget = w.cumulativeAmount - prevCumAmount;

          const prevCumPercent = i === 0 ? 0 : weeklyTargets[i - 1].cumulativePercent;
          const weekTargetPercent = w.cumulativePercent - prevCumPercent;

          const weekActual = sumRevenue(
            filteredDaily.filter(
              (r) => r.date >= w.weekStart && r.date <= w.weekEnd && r.date <= today
            )
          );

          const actualPercentOfMonth = monthlyTarget > 0 ? (weekActual / monthlyTarget) * 100 : 0;
          const weekProgressRatio = weekTarget > 0 ? (weekActual / weekTarget) * 100 : 0;
          const fillPercent = Math.min(weekProgressRatio, 100);

          const isCurrentWeek = i === currentWeekIndex;
          const isPast = i < currentWeekIndex;
          const isFuture = i > currentWeekIndex;
          const isCompleted = weekActual >= weekTarget && weekTarget > 0;
          const isSelected = selectedWeekIndex === i;

          const startDay = dayjs(w.weekStart).date();
          const endDay = dayjs(w.weekEnd).date();

          // Trading Semantics: Green for completed/growth, Red for unfulfilled, Turquoise for active
          let borderColor = "var(--border-line)";
          let barColor = "var(--primary-turquoise)";
          let statusText = "";
          let statusBg = "";
          let statusColor = "";

          if (isPast && isCompleted) {
            borderColor = "rgba(14, 203, 129, 0.3)";
            barColor = "var(--trading-up)";
            statusText = "✓ ผ่าน";
            statusBg = "var(--trading-up-soft)";
            statusColor = "var(--trading-up)";
          } else if (isPast && !isCompleted) {
            borderColor = "rgba(246, 70, 93, 0.3)";
            barColor = "var(--trading-down)";
            statusText = "✗ ไม่ผ่าน";
            statusBg = "var(--trading-down-soft)";
            statusColor = "var(--trading-down)";
          } else if (isCurrentWeek && isCompleted) {
            borderColor = "rgba(14, 203, 129, 0.5)";
            barColor = "var(--trading-up)";
            statusText = "✓ ผ่าน";
            statusBg = "var(--trading-up-soft)";
            statusColor = "var(--trading-up)";
          } else if (isCurrentWeek) {
            borderColor = "var(--primary-turquoise)";
            barColor = "var(--primary-turquoise)";
            statusText = "◉ สัปดาห์นี้";
            statusBg = "rgba(45, 189, 182, 0.12)";
            statusColor = "#0D9488";
          } else if (isFuture) {
            statusText = "รอ";
            statusBg = "var(--surface-soft)";
            statusColor = "var(--ink-muted)";
          }

          return (
            <div
              key={w.weekIndex}
              className="card"
              onClick={() => onSelectWeek?.(i)}
              style={{
                flex: "1 1 0px",
                minWidth: 130,
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                borderColor,
                borderWidth: isCurrentWeek || isSelected ? 2 : 1,
                borderStyle: "solid",
                opacity: isFuture ? 0.65 : 1,
                transition: "all 0.2s ease",
                cursor: "pointer",
                backgroundColor: isSelected ? "#F0FDFA" : "white",
                boxShadow: isSelected ? "0 0 0 2px var(--primary-turquoise)" : "var(--shadow-card)",
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: isCurrentWeek ? "#0F766E" : "var(--ink-main)",
                  }}
                >
                  W{w.weekIndex} <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-soft)" }}>({startDay}-{endDay})</span>
                </span>
                {statusText && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "2px 7px",
                      borderRadius: "10px",
                      backgroundColor: statusBg,
                      color: statusColor,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {statusText}
                  </span>
                )}
              </div>

              {/* Progress % */}
              <div style={{ fontSize: 22, fontWeight: 700, color: isCompleted ? "var(--trading-up)" : isPast ? "var(--trading-down)" : "var(--ink-main)", lineHeight: 1.1, margin: "2px 0" }}>
                {actualPercentOfMonth.toFixed(1)}%
                <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-soft)", marginLeft: 4 }}>
                  / {weekTargetPercent.toFixed(0)}%
                </span>
              </div>

              {/* Amounts */}
              <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 6 }}>
                ฿{formatBaht(weekActual)} / ฿{formatBaht(weekTarget)}
              </div>

              {/* Progress bar */}
              <div
                style={{
                  height: 7,
                  backgroundColor: "var(--surface-soft)",
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${fillPercent}%`,
                    height: "100%",
                    backgroundColor: barColor,
                    borderRadius: 4,
                    transition: "width 0.6s ease",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Bottom Row: Full-width Cumulative Gauge Card across all weeks ── */}
      <div
        className="card"
        onClick={() => onSelectWeek?.('MONTH')}
        style={{
          padding: "12px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          cursor: "pointer",
          backgroundColor: isMonthSelected ? "#F0FDFA" : "white",
          boxShadow: isMonthSelected ? "0 0 0 2px var(--primary-turquoise)" : "var(--shadow-card)",
          border: isMonthSelected ? "2px solid var(--primary-turquoise)" : "1px solid var(--border-line)",
          transition: "all 0.2s ease",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-main)" }}>
              📅 ความคืบหน้าสะสมทั้งเดือน (เปรียบเทียบผลการดำเนินงานสะสมเทียบเป้าหมายรายเดือน)
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: "12px",
                backgroundColor: cumulativePercent >= 100 ? "var(--trading-up-soft)" : "var(--status-warning-soft)",
                color: cumulativePercent >= 100 ? "var(--trading-up)" : "#B45309",
              }}
            >
              {cumulativePercent >= 100 ? "✓ เกินเป้าหมายเดือน" : `ขาดอีก ${(100 - cumulativePercent).toFixed(1)}%`}
            </span>
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, color: cumulativePercent >= 100 ? "var(--trading-up)" : "var(--primary-turquoise)" }}>
            {cumulativePercent.toFixed(1)}%
          </span>
        </div>

        {/* Gauge track with week checkpoints */}
        <div style={{ position: "relative", margin: "6px 0 20px 0" }}>
          <div
            className="gauge-track"
            style={{ height: 16, backgroundColor: "var(--surface-soft)", borderRadius: 9999, overflow: "visible" }}
          >
            {/* Actual fill */}
            <div
              className="gauge-fill"
              style={{
                width: `${Math.min(cumulativePercent, 100)}%`,
                height: "100%",
                backgroundColor: cumulativePercent >= 100 ? "var(--trading-up)" : "var(--primary-turquoise)",
                borderRadius: 9999,
                transition: "width 0.8s ease",
              }}
            />

            {/* Week checkpoint markers */}
            {weeklyTargets.map((w, idx) => (
              <div
                key={w.weekIndex}
                style={{
                  position: "absolute",
                  top: -4,
                  bottom: -4,
                  left: `${w.cumulativePercent}%`,
                  transform: "translateX(-50%)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: 2,
                    height: 24,
                    backgroundColor: idx === currentWeekIndex ? "var(--primary-turquoise)" : "rgba(100, 116, 139, 0.4)",
                    borderRadius: 1,
                  }}
                />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: idx === currentWeekIndex ? 700 : 500,
                    color: idx === currentWeekIndex ? "#0F766E" : "var(--ink-soft)",
                    whiteSpace: "nowrap",
                    marginTop: 2,
                  }}
                >
                  W{w.weekIndex} ({w.cumulativePercent}%)
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Amounts info footer */}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--ink-soft)" }}>
          <span>
            รายได้สะสมจริง: <strong style={{ color: "var(--ink-main)", fontSize: 14 }}>฿{formatBaht(actualRevenue)}</strong>
          </span>
          <span>
            เป้าหมายทั้งเดือน: <strong style={{ color: "var(--ink-main)", fontSize: 14 }}>฿{formatBaht(monthlyTarget)}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
