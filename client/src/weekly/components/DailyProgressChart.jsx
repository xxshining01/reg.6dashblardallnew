import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { formatThaiDateShort, formatThaiDateDayOfWeek } from "../lib/buddhistDate.js";

function formatYAxis(v) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
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
      <p style={{ fontWeight: 600, margin: "0 0 4px", color: "var(--ink-main)" }}>
        {label ? formatThaiDateShort(label) : ""}
      </p>
      {payload.map((p) => (
        <p key={p.name} style={{ margin: "2px 0", color: p.color, fontSize: 12.5 }}>
          {p.name}: ฿{Number(p.value).toLocaleString("th-TH", { maximumFractionDigits: 0 })}
        </p>
      ))}
    </div>
  );
}

export function DailyProgressChart({ data, today }) {
  return (
    <div className="card" style={{ padding: "16px 20px", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--ink-main)", margin: 0 }}>
          📊 รายได้รายวันเทียบเป้าหมายสะสม
        </h2>
        <div style={{ display: "flex", gap: 14, fontSize: 12.5 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: "#2DBDB6", display: "inline-block" }} />
            รายได้จริง (รายวัน)
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 12, height: 3, backgroundColor: "#0ECB81", display: "inline-block" }} />
            สะสมจริง
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 12, height: 3, backgroundColor: "#F59E0B", display: "inline-block", borderTop: "2px dashed #F59E0B" }} />
            เป้าหมายสะสม
          </span>
        </div>
      </div>
      <div style={{ width: "100%", height: 260, position: "relative", minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => formatThaiDateDayOfWeek(d)}
              tick={{ fontSize: 11, fill: "#64748B" }}
              tickLine={false}
              axisLine={{ stroke: "#E2E8F0" }}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="daily"
              orientation="left"
              tickFormatter={formatYAxis}
              tick={{ fontSize: 11, fill: "#64748B" }}
              tickLine={false}
              axisLine={false}
              width={35}
            />
            <YAxis
              yAxisId="cumulative"
              orientation="right"
              tickFormatter={formatYAxis}
              tick={{ fontSize: 11, fill: "#64748B" }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} />
            {today && (
              <ReferenceLine
                yAxisId="daily"
                x={today}
                stroke="#94A3B8"
                strokeDasharray="4 2"
                strokeWidth={1}
              />
            )}
            <Bar
              yAxisId="daily"
              dataKey="actual"
              name="รายได้รายวัน"
              fill="#2DBDB6"
              radius={[3, 3, 0, 0]}
              opacity={0.9}
              maxBarSize={28}
            />
            <Line
              yAxisId="cumulative"
              dataKey="cumulative"
              name="สะสมจริง"
              stroke="#0ECB81"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              yAxisId="cumulative"
              dataKey="cumulativeTarget"
              name="เป้าหมายสะสม"
              stroke="#F59E0B"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
