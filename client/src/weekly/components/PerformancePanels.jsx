function formatBaht(val) {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}K`;
  return (val || 0).toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

function PerformanceList({
  title,
  items,
  tone,
  emptyMessage,
  minHeight,
}) {
  const color = tone === "positive" ? "var(--trading-up)" : "var(--trading-down)";
  const bgColor = tone === "positive" ? "var(--trading-up-soft)" : "var(--trading-down-soft)";

  return (
    <div
      className="card"
      style={{
        flex: 1,
        minWidth: 260,
        minHeight: minHeight || "auto",
        height: "100%",
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
          paddingBottom: 8,
          borderBottom: "1px solid var(--border-line)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: color,
            flexShrink: 0,
          }}
        />
        <h2 style={{ fontSize: 14.5, fontWeight: 700, color: "var(--ink-main)", margin: 0 }}>{title}</h2>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 12,
            backgroundColor: bgColor,
            color,
            padding: "2px 8px",
            borderRadius: "12px",
            fontWeight: 600,
          }}
        >
          {(items || []).length} รายการ
        </span>
      </div>

      {/* List - Fully expanded without scrollbar */}
      {!items || items.length === 0 ? (
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", textAlign: "center", margin: "auto 0", padding: "24px 0" }}>
          {emptyMessage ?? "ไม่มีข้อมูล"}
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          {items.map((o, i) => {
            const pct = o.progressPercent || 0;
            return (
              <li
                key={o.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  padding: "5px 0",
                  borderBottom: "1px solid #F1F5F9",
                }}
              >
                {/* Rank */}
                <span
                  style={{
                    width: 22,
                    fontSize: 12,
                    color: "var(--ink-soft)",
                    flexShrink: 0,
                    textAlign: "right",
                  }}
                >
                  {i + 1}.
                </span>

                {/* Name */}
                <span
                  style={{
                    flex: 1,
                    color: "var(--ink-main)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontWeight: 500,
                  }}
                  title={o.name}
                >
                  {o.name}
                </span>

                {/* Amounts */}
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--ink-soft)",
                    whiteSpace: "nowrap",
                    textAlign: "right",
                    marginRight: 4,
                  }}
                >
                  {formatBaht(o.revenue)} / {formatBaht(o.target)}
                </span>

                {/* Mini bar */}
                <div
                  style={{
                    width: 48,
                    height: 6,
                    backgroundColor: "#F1F5F9",
                    borderRadius: 3,
                    overflow: "hidden",
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(pct, 100)}%`,
                      height: "100%",
                      backgroundColor: color,
                      borderRadius: 3,
                    }}
                  />
                </div>

                {/* Percent */}
                <span
                  style={{
                    width: 55,
                    textAlign: "right",
                    fontWeight: 700,
                    color,
                    fontSize: 13.5,
                    flexShrink: 0,
                  }}
                >
                  {pct.toFixed(1)}%
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function PerformancePanels({
  outperforming,
  underperforming,
  titlePrefix,
  minHeight,
}) {
  return (
    <div style={{ display: "flex", gap: 12, height: "100%", alignItems: "stretch", flexWrap: "wrap" }}>
      <PerformanceList
        title={`${titlePrefix} ทำได้ตามหรือเกินเป้า`}
        items={outperforming}
        tone="positive"
        emptyMessage={`ยังไม่มี${titlePrefix}ที่ทำได้ตามเป้า`}
        minHeight={minHeight}
      />
      <PerformanceList
        title={`${titlePrefix} ต่ำกว่าเป้าหมาย`}
        items={underperforming}
        tone="warning"
        emptyMessage={`ทุก${titlePrefix}ทำได้ตามเป้า 🎉`}
        minHeight={minHeight}
      />
    </div>
  );
}
