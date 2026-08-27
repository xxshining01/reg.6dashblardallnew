import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ResponsiveContainer,
  LabelList,
} from "recharts";

function formatBaht(val) {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}K`;
  return (val || 0).toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

function extractPostcodeOnly(str) {
  if (!str) return "";
  const match5 = str.match(/\d{5}/);
  if (match5) return match5[0];
  const digits = str.match(/^\d+/);
  if (digits) return digits[0];
  return str.split(" ")[0] || str;
}

function CustomTooltip({ active, payload, isDrillDown }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const isUp = d.progressPercent >= 100;
  return (
    <div
      style={{
        backgroundColor: "white",
        border: "1px solid var(--border-line)",
        borderRadius: "8px",
        padding: "8px 12px",
        fontSize: 13,
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
      }}
    >
      <p style={{ fontWeight: 700, margin: "0 0 4px", color: "var(--ink-main)" }}>
        {d.name}
      </p>
      <p style={{ margin: "2px 0", color: "var(--ink-soft)" }}>
        ความคืบหน้า: <strong style={{ color: isUp ? "var(--trading-up)" : "var(--primary-turquoise)" }}>{d.progressPercent.toFixed(1)}%</strong>
      </p>
      <p style={{ margin: "2px 0", color: "var(--ink-soft)" }}>
        รายได้จริง: ฿{(d.revenue || 0).toLocaleString("th-TH", { maximumFractionDigits: 0 })}
      </p>
      <p style={{ margin: "2px 0", color: "var(--ink-soft)" }}>
        เป้าหมาย: ฿{(d.target || 0).toLocaleString("th-TH", { maximumFractionDigits: 0 })}
      </p>
    </div>
  );
}

export function RankingChart({ data, title, isDrillDown, minHeight }) {
  const validData = (data || []).filter((d) => d.target > 0);
  const sorted = [...validData].sort((a, b) => b.progressPercent - a.progressPercent);

  // Dynamic chart height matching the uniform row height
  const chartWrapperHeight = minHeight ? minHeight - 65 : Math.max(300, sorted.length * 32 + 50);

  const renderCustomLabel = (props) => {
    const { x, y, width, height, value, index } = props;
    const item = sorted[index];
    if (!item) return null;

    const revStr = formatBaht(item.revenue);
    const tgtStr = formatBaht(item.target);

    return (
      <text
        x={x + width + 8}
        y={y + height / 2 + 4}
        fill="#474D57"
        fontSize={12}
        fontWeight={600}
      >
        {Number(value).toFixed(1)}% <tspan fill="#707A8A" fontWeight={400} fontSize={11}>({revStr} / {tgtStr})</tspan>
      </text>
    );
  };

  return (
    <div
      className="card"
      style={{
        padding: "16px 20px",
        height: "100%",
        minHeight: minHeight || "auto",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--ink-main)", margin: 0 }}>
          🏆 {title} ({sorted.length} รายการ)
        </h2>
        <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
          % เทียบเป้าหมาย
        </span>
      </div>
      <div style={{ width: "100%", height: chartWrapperHeight, position: "relative", minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <BarChart
            data={sorted}
            layout="vertical"
            margin={{ top: 4, right: 110, bottom: 4, left: 4 }}
          >
            <XAxis
              type="number"
              domain={[0, Math.max(100, ...sorted.map((d) => d.progressPercent || 0))]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 11.5, fill: "#64748B" }}
              tickLine={false}
              axisLine={{ stroke: "#E2E8F0" }}
            />
            <YAxis
              type="category"
              dataKey="name"
              tickFormatter={(name) => (isDrillDown ? extractPostcodeOnly(name) : name)}
              tick={{ fontSize: 12.5, fill: "var(--ink-main)", fontWeight: isDrillDown ? 600 : 500 }}
              tickLine={false}
              axisLine={false}
              width={isDrillDown ? 58 : 95}
              interval={0}
            />
            <Tooltip content={<CustomTooltip isDrillDown={isDrillDown} />} />
            <Bar dataKey="progressPercent" radius={[0, 4, 4, 0]} maxBarSize={18}>
              {sorted.map((entry, i) => (
                <Cell
                  key={i}
                  fill={
                    entry.progressPercent >= 100
                      ? "#0ECB81"
                      : entry.progressPercent >= 80
                      ? "#2DBDB6"
                      : "#F6465D"
                  }
                />
              ))}
              <LabelList content={renderCustomLabel} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
