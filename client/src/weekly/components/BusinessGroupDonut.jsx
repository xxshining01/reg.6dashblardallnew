import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const PALETTE = [
  "#2DBDB6", // Turquoise (Primary Accent)
  "#0ECB81", // Green (Trading Up)
  "#2563EB", // Royal Blue
  "#F59E0B", // Amber
  "#8B5CF6", // Purple
  "#F6465D", // Coral Red
  "#06B6D4", // Cyan
  "#EC4899", // Pink
  "#10B981", // Emerald
  "#6366F1", // Indigo
];

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0];
  const percent = d.payload.percent || 0;
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
      <p style={{ fontWeight: 700, margin: "0 0 2px", color: "var(--ink-main)" }}>
        {d.name}
      </p>
      <p style={{ margin: 0, color: "var(--ink-soft)" }}>
        ฿{Number(d.value).toLocaleString("th-TH", { maximumFractionDigits: 0 })}
      </p>
      <p style={{ margin: 0, color: "var(--primary-turquoise)", fontWeight: 600 }}>
        {(percent * 100).toFixed(1)}%
      </p>
    </div>
  );
}

function CustomLegend({ payload, total }) {
  if (!payload || total === 0) return null;
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 5 }}>
      {payload.map((entry, i) => {
        const pct = (entry.payload.value / total) * 100;
        return (
          <li
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "var(--ink-main)",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: entry.color,
                flexShrink: 0,
              }}
            />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {entry.value}
            </span>
            <span style={{ fontWeight: 600, color: "var(--ink-main)" }}>
              {pct.toFixed(1)}%
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const renderCustomizedLabel = (props) => {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  if (percent < 0.06) return null;

  return (
    <text
      x={x}
      y={y}
      fill="#FFFFFF"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={700}
      style={{ textShadow: "0px 1px 2px rgba(0,0,0,0.6)" }}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export function BusinessGroupDonut({ data }) {
  const filtered = (data || []).filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const total = filtered.reduce((s, d) => s + d.value, 0);

  return (
    <div className="card" style={{ padding: "16px 20px", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--ink-main)", margin: 0 }}>
          🍩 สัดส่วนรายได้ตามกลุ่มธุรกิจ
        </h2>
      </div>
      <div style={{ width: "100%", height: 230, position: "relative", minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <PieChart>
            <Pie
              data={filtered}
              dataKey="value"
              nameKey="name"
              innerRadius="40%"
              outerRadius="90%"
              strokeWidth={2}
              stroke="#FFFFFF"
              labelLine={false}
              label={renderCustomizedLabel}
            >
              {filtered.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              content={<CustomLegend total={total} />}
              wrapperStyle={{ paddingLeft: 8, width: 180 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
