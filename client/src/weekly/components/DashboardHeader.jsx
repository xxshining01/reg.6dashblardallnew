import { formatThaiDate, getThaiMonthYear } from "../lib/buddhistDate.js";

export function DashboardHeader({
  lastUpdated,
  monthYear,
  onRefresh,
  isRefreshing,
}) {
  return (
    <header
      className="weekly-header"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 24px",
        borderBottom: "1px solid var(--border-line)",
        backgroundColor: "var(--surface-card)",
        flexShrink: 0,
        boxShadow: "var(--shadow-card)",
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      {/* Left: Logo + Title */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "10px",
            background: "linear-gradient(135deg, #1E3A8A 0%, #2DBDB6 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 2px 4px rgba(45, 189, 182, 0.2)",
          }}
        >
          <span style={{ color: "white", fontSize: 20, fontWeight: 700 }}>
            ป
          </span>
        </div>
        <div>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "var(--ink-main)",
              margin: 0,
              lineHeight: 1.2,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            Dashboard รายได้ประจำวัน สรุปรายเดือน ปข.6
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                backgroundColor: "#E0F2FE",
                color: "#0369A1",
                padding: "2px 8px",
                borderRadius: "12px",
              }}
            >
              รายสัปดาห์
            </span>
          </h1>
          <p
            style={{
              fontSize: 13.5,
              color: "var(--ink-soft)",
              margin: 0,
              marginTop: 2,
            }}
          >
            ประจำเดือน{getThaiMonthYear(monthYear)}
          </p>
        </div>
      </div>

      {/* Right: Last updated + Refresh */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0 }}>
            ข้อมูล ณ วันที่
          </p>
          <p
            style={{
              fontSize: 14.5,
              fontWeight: 600,
              color: "var(--ink-main)",
              margin: 0,
            }}
          >
            {formatThaiDate(lastUpdated, "D MMMM")}
          </p>
        </div>

        {/* Refresh Button */}
        {onRefresh && (
          <button
            className="no-capture"
            onClick={onRefresh}
            disabled={isRefreshing}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              borderRadius: "8px",
              border: "1px solid var(--border-line)",
              backgroundColor: "white",
              color: "var(--ink-main)",
              fontSize: 13,
              fontWeight: 500,
              cursor: isRefreshing ? "wait" : "pointer",
              transition: "all 0.15s ease",
            }}
            title="รีเฟรชข้อมูล"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                animation: isRefreshing ? "spin 1s linear infinite" : "none",
                color: "var(--primary-turquoise)",
              }}
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {isRefreshing ? "กำลังโหลด..." : "รีเฟรช"}
          </button>
        )}
      </div>
    </header>
  );
}
